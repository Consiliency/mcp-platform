const { EventEmitter } = require('events');
const path = require('path');

/**
 * gRPC Transport Implementation (FEATURE-8.1)
 * Provides bidirectional streaming support for MCP over gRPC
 */
class GrpcTransport extends EventEmitter {
  constructor(config = {}) {
    super();
    this.type = 'grpc';
    
    this.config = {
      host: config.host || 'localhost',
      port: config.port || 50051,
      protoPath: config.protoPath || path.join(__dirname, 'mcp.proto'),
      credentials: config.credentials || 'insecure',
      keepAlive: config.keepAlive !== false,
      keepAliveTime: config.keepAliveTime || 10000,
      options: {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
        ...config.options
      }
    };
    
    this.client = null;
    this.stream = null;
    this.connected = false;
    this.grpc = null;
    this.protoLoader = null;
  }
  
  /**
   * Initialize gRPC client
   */
  async initialize() {
    try {
      // Lazy load gRPC dependencies
      this.grpc = require('@grpc/grpc-js');
      this.protoLoader = require('@grpc/proto-loader');
      
      // Load proto definition
      const packageDefinition = await this.protoLoader.load(
        this.config.protoPath, 
        this.config.options
      );
      
      const mcpProto = this.grpc.loadPackageDefinition(packageDefinition).mcp;
      
      // Create client with credentials
      const credentials = this._createCredentials();
      this.client = new mcpProto.MCPService(
        `${this.config.host}:${this.config.port}`,
        credentials
      );
      
      return true;
    } catch (error) {
      this.emit('error', error);
      throw new Error(`Failed to initialize gRPC transport: ${error.message}`);
    }
  }
  
  /**
   * Connect to gRPC server
   */
  async connect() {
    if (!this.client) {
      await this.initialize();
    }
    
    try {
      // Create bidirectional stream
      this.stream = this.client.communicate();
      
      // Set up stream handlers
      this.stream.on('data', (message) => {
        this.emit('message', this._deserializeMessage(message));
      });
      
      this.stream.on('error', (error) => {
        this.connected = false;
        this.emit('error', error);
      });
      
      this.stream.on('end', () => {
        this.connected = false;
        this.emit('close');
      });
      
      // Set up keep-alive if enabled
      if (this.config.keepAlive) {
        this._startKeepAlive();
      }
      
      this.connected = true;
      this.emit('connect');
      
      return true;
    } catch (error) {
      this.emit('error', error);
      throw new Error(`Failed to connect gRPC transport: ${error.message}`);
    }
  }
  
  /**
   * Send message via gRPC
   */
  async send(message) {
    if (!this.connected || !this.stream) {
      throw new Error('gRPC transport not connected');
    }
    
    try {
      const serialized = this._serializeMessage(message);
      this.stream.write(serialized);
      return true;
    } catch (error) {
      this.emit('error', error);
      throw new Error(`Failed to send message: ${error.message}`);
    }
  }
  
  /**
   * Close gRPC connection
   */
  async close() {
    this._stopKeepAlive();
    
    if (this.stream) {
      this.stream.end();
      this.stream = null;
    }
    
    if (this.client) {
      this.client.close();
      this.client = null;
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
   * Create gRPC credentials based on config
   */
  _createCredentials() {
    if (!this.grpc) {
      throw new Error('gRPC not initialized');
    }
    
    switch (this.config.credentials) {
      case 'insecure':
        return this.grpc.credentials.createInsecure();
      
      case 'ssl':
        return this.grpc.credentials.createSsl(
          this.config.rootCerts,
          this.config.privateKey,
          this.config.certChain
        );
      
      case 'google-default':
        return this.grpc.credentials.createFromGoogleCredential();
      
      default:
        if (typeof this.config.credentials === 'object') {
          return this.config.credentials;
        }
        throw new Error(`Unknown credential type: ${this.config.credentials}`);
    }
  }
  
  /**
   * Serialize message for gRPC transport
   */
  _serializeMessage(message) {
    return {
      id: message.id || this._generateId(),
      type: message.type,
      payload: JSON.stringify(message.payload || {}),
      metadata: message.metadata || {},
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * Deserialize message from gRPC transport
   */
  _deserializeMessage(message) {
    return {
      id: message.id,
      type: message.type,
      payload: JSON.parse(message.payload || '{}'),
      metadata: message.metadata || {},
      timestamp: message.timestamp
    };
  }
  
  /**
   * Generate unique message ID
   */
  _generateId() {
    return `grpc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Start keep-alive mechanism
   */
  _startKeepAlive() {
    this.keepAliveInterval = setInterval(() => {
      if (this.connected && this.stream) {
        this.send({ type: 'ping', payload: {} }).catch(() => {
          // Ignore keep-alive errors
        });
      }
    }, this.config.keepAliveTime);
  }
  
  /**
   * Stop keep-alive mechanism
   */
  _stopKeepAlive() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }
}

module.exports = GrpcTransport;