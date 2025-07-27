const { EventEmitter } = require('events');
const net = require('net');
const fs = require('fs').promises;
const path = require('path');

/**
 * Unix Socket Transport (FEATURE-8.1)
 * Provides local IPC communication via Unix domain sockets
 */
class UnixSocketTransport extends EventEmitter {
  constructor(config = {}) {
    super();
    this.type = 'unix';
    
    this.config = {
      socketPath: config.socketPath || '/tmp/mcp.sock',
      reconnect: config.reconnect !== false,
      reconnectDelay: config.reconnectDelay || 1000,
      maxReconnectAttempts: config.maxReconnectAttempts || 10,
      mode: config.mode || 'client', // 'client' or 'server'
      permissions: config.permissions || '0600',
      delimiter: config.delimiter || '\n',
      encoding: config.encoding || 'utf8'
    };
    
    this.socket = null;
    this.server = null;
    this.connected = false;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.buffer = '';
  }
  
  /**
   * Connect to Unix socket (client mode) or start server
   */
  async connect() {
    if (this.config.mode === 'server') {
      return this._startServer();
    } else {
      return this._connectClient();
    }
  }
  
  /**
   * Connect as client to Unix socket
   */
  async _connectClient() {
    return new Promise((resolve, reject) => {
      this.socket = net.createConnection(this.config.socketPath);
      
      this.socket.on('connect', () => {
        this.connected = true;
        this.reconnectAttempts = 0;
        this.emit('connect');
        resolve(true);
      });
      
      this.socket.on('data', (data) => {
        this._handleData(data);
      });
      
      this.socket.on('error', (error) => {
        this.emit('error', error);
        if (!this.connected) {
          reject(error);
        }
      });
      
      this.socket.on('close', () => {
        this.connected = false;
        this.emit('close');
        this._handleReconnect();
      });
      
      this.socket.setEncoding(this.config.encoding);
    });
  }
  
  /**
   * Start Unix socket server
   */
  async _startServer() {
    // Remove existing socket file if it exists
    try {
      await fs.unlink(this.config.socketPath);
    } catch (error) {
      // Ignore if file doesn't exist
    }
    
    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => {
        this.socket = socket;
        this.connected = true;
        
        socket.setEncoding(this.config.encoding);
        
        socket.on('data', (data) => {
          this._handleData(data);
        });
        
        socket.on('error', (error) => {
          this.emit('error', error);
        });
        
        socket.on('close', () => {
          this.connected = false;
          this.emit('client-disconnect');
        });
        
        this.emit('client-connect', socket);
      });
      
      this.server.on('error', (error) => {
        this.emit('error', error);
        reject(error);
      });
      
      this.server.listen(this.config.socketPath, async () => {
        // Set socket permissions
        try {
          await fs.chmod(this.config.socketPath, this.config.permissions);
        } catch (error) {
          this.emit('error', new Error(`Failed to set socket permissions: ${error.message}`));
        }
        
        this.emit('listening', this.config.socketPath);
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
   * Send message via Unix socket
   */
  async send(message) {
    if (!this.connected || !this.socket) {
      throw new Error('Unix socket not connected');
    }
    
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(message) + this.config.delimiter;
      
      this.socket.write(data, this.config.encoding, (error) => {
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
   * Close Unix socket
   */
  async close() {
    this._clearReconnectTimer();
    
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    
    if (this.server) {
      await new Promise((resolve) => {
        this.server.close(() => {
          resolve();
        });
      });
      
      // Remove socket file
      try {
        await fs.unlink(this.config.socketPath);
      } catch (error) {
        // Ignore if file doesn't exist
      }
      
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
   * Get socket statistics
   */
  getStats() {
    if (!this.socket) {
      return null;
    }
    
    return {
      bytesRead: this.socket.bytesRead,
      bytesWritten: this.socket.bytesWritten,
      connecting: this.socket.connecting,
      destroyed: this.socket.destroyed,
      localAddress: this.socket.localAddress,
      remoteAddress: this.socket.remoteAddress
    };
  }
}

module.exports = UnixSocketTransport;