const { EventEmitter } = require('events');
const net = require('net');
const os = require('os');

/**
 * Named Pipe Transport for Windows (FEATURE-8.1)
 * Provides Windows-specific IPC communication via named pipes
 */
class NamedPipeTransport extends EventEmitter {
  constructor(config = {}) {
    super();
    this.type = 'named-pipe';
    
    // Validate platform
    if (os.platform() !== 'win32') {
      console.warn('Named pipes are only supported on Windows. Falling back to Unix socket behavior.');
    }
    
    this.config = {
      pipeName: config.pipeName || 'mcp-pipe',
      mode: config.mode || 'client', // 'client' or 'server'
      reconnect: config.reconnect !== false,
      reconnectDelay: config.reconnectDelay || 1000,
      maxReconnectAttempts: config.maxReconnectAttempts || 10,
      delimiter: config.delimiter || '\n',
      encoding: config.encoding || 'utf8',
      timeout: config.timeout || 5000,
      // Windows-specific security descriptor
      securityDescriptor: config.securityDescriptor || null
    };
    
    // Construct Windows pipe path
    this.pipePath = this._constructPipePath(this.config.pipeName);
    
    this.pipe = null;
    this.server = null;
    this.connected = false;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.buffer = '';
  }
  
  /**
   * Construct platform-specific pipe path
   */
  _constructPipePath(pipeName) {
    if (os.platform() === 'win32') {
      // Windows named pipe path format
      return `\\\\.\\pipe\\${pipeName}`;
    } else {
      // Fallback to Unix socket path for non-Windows platforms
      return `/tmp/${pipeName}.sock`;
    }
  }
  
  /**
   * Connect to named pipe (client mode) or start server
   */
  async connect() {
    if (this.config.mode === 'server') {
      return this._startServer();
    } else {
      return this._connectClient();
    }
  }
  
  /**
   * Connect as client to named pipe
   */
  async _connectClient() {
    return new Promise((resolve, reject) => {
      const connectOptions = {
        path: this.pipePath,
        timeout: this.config.timeout
      };
      
      this.pipe = net.createConnection(connectOptions);
      
      this.pipe.on('connect', () => {
        this.connected = true;
        this.reconnectAttempts = 0;
        this.emit('connect');
        resolve(true);
      });
      
      this.pipe.on('data', (data) => {
        this._handleData(data);
      });
      
      this.pipe.on('error', (error) => {
        // Windows-specific error handling
        if (error.code === 'ENOENT') {
          error.message = `Named pipe not found: ${this.pipePath}`;
        } else if (error.code === 'EACCES') {
          error.message = `Access denied to named pipe: ${this.pipePath}`;
        }
        
        this.emit('error', error);
        if (!this.connected) {
          reject(error);
        }
      });
      
      this.pipe.on('close', () => {
        this.connected = false;
        this.emit('close');
        this._handleReconnect();
      });
      
      this.pipe.on('timeout', () => {
        this.emit('error', new Error('Named pipe connection timeout'));
        this.pipe.destroy();
      });
      
      this.pipe.setEncoding(this.config.encoding);
    });
  }
  
  /**
   * Start named pipe server
   */
  async _startServer() {
    return new Promise((resolve, reject) => {
      this.server = net.createServer((pipe) => {
        this.pipe = pipe;
        this.connected = true;
        
        pipe.setEncoding(this.config.encoding);
        
        pipe.on('data', (data) => {
          this._handleData(data);
        });
        
        pipe.on('error', (error) => {
          this.emit('error', error);
        });
        
        pipe.on('close', () => {
          this.connected = false;
          this.emit('client-disconnect');
        });
        
        this.emit('client-connect', pipe);
      });
      
      this.server.on('error', (error) => {
        // Windows-specific error handling
        if (error.code === 'EADDRINUSE') {
          error.message = `Named pipe already in use: ${this.pipePath}`;
        }
        
        this.emit('error', error);
        reject(error);
      });
      
      // Listen on the named pipe
      const listenOptions = {
        path: this.pipePath
      };
      
      // Apply Windows security descriptor if provided
      if (os.platform() === 'win32' && this.config.securityDescriptor) {
        listenOptions.readableAll = true;
        listenOptions.writableAll = true;
      }
      
      this.server.listen(listenOptions, () => {
        this.emit('listening', this.pipePath);
        resolve(true);
      });
    });
  }
  
  /**
   * Handle incoming data with delimiter-based framing
   */
  _handleData(data) {
    this.buffer += data;
    
    const messages = this.buffer.split(this.config.delimiter);
    this.buffer = messages.pop() || '';
    
    messages.forEach(message => {
      if (message.trim()) {
        try {
          const parsed = JSON.parse(message);
          this.emit('message', parsed);
        } catch (error) {
          this.emit('error', new Error(`Failed to parse message: ${error.message}`));
        }
      }
    });
  }
  
  /**
   * Send message via named pipe
   */
  async send(message) {
    if (!this.connected || !this.pipe) {
      throw new Error('Named pipe not connected');
    }
    
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(message) + this.config.delimiter;
      
      this.pipe.write(data, this.config.encoding, (error) => {
        if (error) {
          this.emit('error', error);
          reject(error);
        } else {
          resolve(true);
        }
      });
    });
  }
  
  /**
   * Close named pipe
   */
  async close() {
    this._clearReconnectTimer();
    
    if (this.pipe) {
      this.pipe.destroy();
      this.pipe = null;
    }
    
    if (this.server) {
      await new Promise((resolve) => {
        this.server.close(() => {
          resolve();
        });
      });
      this.server = null;
    }
    
    this.connected = false;
    this.emit('disconnect');
  }
  
  /**
   * Check if transport is connected
   */
  isConnected() {
    return this.connected;
  }
  
  /**
   * Handle automatic reconnection
   */
  _handleReconnect() {
    if (!this.config.reconnect || this.config.mode === 'server') {
      return;
    }
    
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.emit('error', new Error('Max reconnection attempts reached'));
      return;
    }
    
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.emit('reconnecting', this.reconnectAttempts);
      this._connectClient().catch(() => {
        // Reconnection failed, will try again
      });
    }, this.config.reconnectDelay * this.reconnectAttempts);
  }
  
  /**
   * Clear reconnection timer
   */
  _clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
  
  /**
   * Get pipe statistics
   */
  getStats() {
    if (!this.pipe) {
      return null;
    }
    
    return {
      bytesRead: this.pipe.bytesRead,
      bytesWritten: this.pipe.bytesWritten,
      connecting: this.pipe.connecting,
      destroyed: this.pipe.destroyed,
      pipePath: this.pipePath,
      platform: os.platform()
    };
  }
  
  /**
   * Windows-specific: Set pipe permissions
   * Note: This is a placeholder for Windows-specific implementation
   */
  setPipePermissions(permissions) {
    if (os.platform() !== 'win32') {
      throw new Error('Pipe permissions are only configurable on Windows');
    }
    
    // In a real implementation, this would use Windows APIs
    // to set ACLs on the named pipe
    this.emit('warning', 'Pipe permissions configuration requires native Windows APIs');
  }
}

module.exports = NamedPipeTransport;