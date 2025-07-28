const TransportInterface = require('../core/transport.interface');
const axios = require('axios');
const { EventEmitter } = require('events');

/**
 * HTTP Proxy Transport
 * Forwards MCP requests to another gateway instance via HTTP
 * Used for cross-boundary communication (e.g., WSL to Windows)
 */
class HttpProxyTransport extends TransportInterface {
  constructor(config = {}) {
    super(config);
    
    this.connections = new Map();
    this.config = {
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
      ...config
    };
  }

  /**
   * Initialize the HTTP proxy transport
   */
  async initialize() {
    console.log('Initializing HTTP Proxy transport...');
    this.initialized = true;
  }

  /**
   * Start the transport (no-op for proxy)
   */
  async start() {
    console.log('HTTP Proxy transport started');
  }

  /**
   * Stop the transport
   */
  async stop() {
    // Close any pending connections
    for (const [id, connection] of this.connections) {
      if (connection.cancelToken) {
        connection.cancelToken.cancel('Transport stopping');
      }
    }
    this.connections.clear();
    console.log('HTTP Proxy transport stopped');
  }

  /**
   * Create a connection to a remote gateway
   */
  async createConnection(config) {
    const { id, url, headers = {} } = config;
    
    // Parse the target URL
    const targetUrl = new URL(url);
    const baseUrl = `${targetUrl.protocol}//${targetUrl.host}`;
    const path = targetUrl.pathname;
    
    const connection = {
      id,
      baseUrl,
      path,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      isConnected: false
    };
    
    // Test connection
    try {
      await this.testConnection(connection);
      connection.isConnected = true;
      this.connections.set(id, connection);
      console.log(`HTTP Proxy connection established: ${id} -> ${baseUrl}${path}`);
      return connection;
    } catch (error) {
      console.error(`Failed to establish HTTP proxy connection to ${baseUrl}${path}:`, error.message);
      throw error;
    }
  }

  /**
   * Send a message through the proxy
   */
  async sendMessage(connectionId, message) {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error(`Connection not found: ${connectionId}`);
    }
    
    if (!connection.isConnected) {
      throw new Error(`Connection not active: ${connectionId}`);
    }
    
    try {
      // Create axios cancel token for this request
      const cancelToken = axios.CancelToken.source();
      
      // Make HTTP POST request to remote gateway
      const response = await axios.post(
        `${connection.baseUrl}${connection.path}`,
        message,
        {
          headers: connection.headers,
          timeout: this.config.timeout,
          cancelToken: cancelToken.token,
          validateStatus: (status) => status < 500
        }
      );
      
      // Return the response data
      return response.data;
    } catch (error) {
      if (axios.isCancel(error)) {
        throw new Error('Request cancelled');
      }
      
      // Handle connection errors
      if (error.code === 'ECONNREFUSED') {
        connection.isConnected = false;
        throw new Error(`Remote gateway not available at ${connection.baseUrl}`);
      }
      
      throw error;
    }
  }

  /**
   * Close a connection
   */
  async closeConnection(connectionId) {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.isConnected = false;
      this.connections.delete(connectionId);
      console.log(`HTTP Proxy connection closed: ${connectionId}`);
    }
  }

  /**
   * Test connection to remote gateway
   */
  async testConnection(connection) {
    try {
      // Try to get the manifest from the remote gateway
      const response = await axios.get(
        `${connection.baseUrl}/.well-known/mcp-manifest.json`,
        {
          headers: connection.headers,
          timeout: 5000
        }
      );
      
      if (response.data && response.data.capabilities) {
        return true;
      }
      
      throw new Error('Invalid manifest response');
    } catch (error) {
      throw new Error(`Connection test failed: ${error.message}`);
    }
  }

  /**
   * Get connection status
   */
  getConnectionStatus(connectionId) {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return { connected: false, error: 'Connection not found' };
    }
    
    return {
      connected: connection.isConnected,
      url: `${connection.baseUrl}${connection.path}`,
      lastError: connection.lastError
    };
  }

  /**
   * Handle incoming messages (not used for proxy)
   */
  async handleMessage(connectionId, message, callback) {
    // For proxy transport, messages are handled synchronously in sendMessage
    throw new Error('HttpProxyTransport does not handle incoming messages');
  }
}

module.exports = HttpProxyTransport;