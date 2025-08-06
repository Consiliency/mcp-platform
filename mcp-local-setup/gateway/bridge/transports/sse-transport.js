const TransportInterface = require('../core/transport.interface');
const EventEmitter = require('events');
const http = require('http');
const express = require('express');

/**
 * SSE (Server-Sent Events) Transport
 * Implements HTTP+SSE transport for MCP protocol with bidirectional communication
 * Based on existing SSE implementation from server.js
 */
class SSETransport extends TransportInterface {
  constructor(config = {}) {
    super(config);
    
    this.config = {
      port: 8090,
      host: '0.0.0.0',
      keepAliveInterval: 30000,
      debug: process.env.SSE_DEBUG === 'true' || config.debug === true,
      ...config
    };
    
    this.app = config.app || null;  // Allow using existing Express app
    this.server = null;
    this.sseConnections = new Map();
    this.messageHandlers = new Map();
    this.defaultMessageHandler = null;
    this.emitter = new EventEmitter();
    this.ownApp = !config.app;  // Track if we created the app
    
    // Debug mode setup
    if (this.config.debug) {
      console.log('🔍 SSE Transport Debug Mode Enabled');
      this.debugLog = this.createDebugLogger();
    }
  }

  /**
   * Create debug logger
   */
  createDebugLogger() {
    return (category, message, data = null) => {
      const timestamp = new Date().toISOString();
      const prefix = `[${timestamp}] [SSE-${category}]`;
      console.log(`${prefix} ${message}`);
      if (data) {
        console.log(`${prefix} Data:`, JSON.stringify(data, null, 2));
      }
    };
  }

  /**
   * Initialize the SSE transport
   */
  async initialize() {
    console.log('Initializing SSE transport...');
    if (this.config.debug) {
      this.debugLog('INIT', 'Starting initialization', this.config);
    }
    
    // Only create app if not provided
    if (!this.app) {
      this.app = express();
      this.app.use(express.json());
      if (this.config.debug) {
        this.debugLog('INIT', 'Created Express app');
      }
    }
    
    // Set up middleware (only if we own the app)
    if (this.ownApp) {
      this.setupMiddleware();
    }
    
    // Set up routes
    this.setupRoutes();
    
    this.initialized = true;
    if (this.config.debug) {
      this.debugLog('INIT', 'Initialization complete');
    }
  }

  /**
   * Start the SSE transport server
   */
  async start() {
    if (!this.initialized) {
      throw new Error('SSE transport not initialized');
    }
    
    // Only start server if we own the app
    if (this.ownApp) {
      return new Promise((resolve, reject) => {
        this.server = this.app.listen(this.config.port, this.config.host, (err) => {
          if (err) {
            reject(err);
            return;
          }
          
          this.status = 'running';
          console.log(`SSE transport listening on ${this.config.host}:${this.config.port}`);
          resolve();
        });
      });
    } else {
      // If using existing app, just mark as running
      this.status = 'running';
      console.log('SSE transport attached to existing Express app');
    }
  }

  /**
   * Stop the SSE transport server
   */
  async stop() {
    // Close all SSE connections
    for (const [connectionId, connection] of this.sseConnections) {
      this.closeSSEConnection(connectionId);
    }
    
    // Stop the server only if we own it
    if (this.server && this.ownApp) {
      return new Promise((resolve) => {
        this.server.close(() => {
          this.status = 'stopped';
          console.log('SSE transport stopped');
          resolve();
        });
      });
    } else {
      this.status = 'stopped';
      console.log('SSE transport detached from Express app');
    }
  }

  /**
   * Create a new SSE connection
   */
  async createConnection(options) {
    const { id = this.generateConnectionId(), path = '/mcp', metadata = {} } = options;
    
    // For SSE, connections are created when clients connect to the endpoint
    // This method just registers the connection configuration
    const connection = {
      id,
      path,
      metadata,
      createdAt: new Date()
    };
    
    this.connections.set(id, connection);
    console.log(`SSE connection registered: ${id} on path ${path}`);
    
    return connection;
  }

  /**
   * Close an SSE connection
   */
  async closeConnection(connectionId) {
    const sseConnection = this.sseConnections.get(connectionId);
    if (sseConnection) {
      this.closeSSEConnection(connectionId);
    }
    
    this.connections.delete(connectionId);
    this.messageHandlers.delete(connectionId);
  }

  /**
   * Send a message through SSE
   */
  async sendMessage(connectionId, message) {
    const sseConnection = this.sseConnections.get(connectionId);
    
    // Add defensive check for undefined message
    if (!message) {
      console.error('[SSE-SEND] Attempted to send undefined message', { connectionId });
      throw new Error('Cannot send undefined message');
    }
    
    console.log('[SSE-SEND] Attempting to send message', {
      connectionId,
      activeConnections: Array.from(this.sseConnections.keys()),
      messageId: message.id,
      hasConnection: !!sseConnection,
      messageType: typeof message,
      hasId: 'id' in message
    });
    
    if (!sseConnection) {
      if (this.config.debug) {
        this.debugLog('SEND', 'Connection not found', { connectionId });
      }
      throw new Error(`SSE connection not found: ${connectionId}`);
    }
    
    if (this.config.debug) {
      this.debugLog('SEND', 'Sending message', {
        connectionId,
        messageId: message.id,
        hasResult: !!message.result,
        hasError: !!message.error,
        resultSize: message.result ? JSON.stringify(message.result).length : 0
      });
    }
    
    try {
      // Send as SSE data event with JSON-RPC message
      const messageStr = JSON.stringify(message);
      sseConnection.res.write(`data: ${messageStr}\n\n`);
      
      if (this.config.debug) {
        this.debugLog('SEND', 'Message sent successfully', {
          connectionId,
          messageLength: messageStr.length
        });
      }
      
      return { sent: true };
    } catch (error) {
      console.error(`Failed to send SSE message to ${connectionId}:`, error);
      if (this.config.debug) {
        this.debugLog('SEND', 'Failed to send message', {
          connectionId,
          error: error.message
        });
      }
      throw error;
    }
  }

  /**
   * Register a message handler for a connection
   */
  onMessage(connectionId, handler) {
    if (connectionId === 'default') {
      // Set default handler for all connections
      this.defaultMessageHandler = handler;
    } else {
      this.messageHandlers.set(connectionId, handler);
    }
  }

  /**
   * Set up middleware
   */
  setupMiddleware() {
    // Localhost-only middleware (security)
    const localhostOnly = (req, res, next) => {
      const clientIp = req.ip || req.connection.remoteAddress;
      const isLocalhost = clientIp === '127.0.0.1' || 
                         clientIp === '::1' || 
                         clientIp === '::ffff:127.0.0.1';
      
      if (isLocalhost) {
        next();
      } else {
        res.status(403).json({
          error: {
            code: -32403,
            message: 'Access denied: This service is only available from localhost'
          }
        });
      }
    };
    
    this.app.use(localhostOnly);
  }

  /**
   * Set up routes
   */
  setupRoutes() {
    console.log('[SSE-TRANSPORT] Setting up routes on app');
    
    // SSE endpoint
    this.app.get('/mcp', (req, res) => {
      console.log('[SSE-TRANSPORT] GET /mcp route hit');
      this.handleSSEConnection(req, res);
    });
    
    // HTTP POST endpoint for bidirectional communication
    this.app.post('/mcp', async (req, res) => {
      console.log('[SSE-TRANSPORT] POST /mcp route hit');
      await this.handleHTTPMessage(req, res);
    });
    
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        transport: 'sse',
        connections: this.sseConnections.size
      });
    });
    
    console.log('[SSE-TRANSPORT] Routes setup complete');
  }

  /**
   * Handle SSE connection
   */
  handleSSEConnection(req, res) {
    console.log('[SSE-TRANSPORT] handleSSEConnection called:', {
      path: req.path,
      headers: req.headers,
      method: req.method
    });
    
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    
    // Generate connection ID
    const connectionId = this.generateConnectionId();
    
    if (this.config.debug) {
      this.debugLog('CONNECTION', 'New SSE connection', {
        connectionId,
        clientIp: req.ip || req.connection.remoteAddress,
        userAgent: req.headers['user-agent'],
        headers: req.headers
      });
    }
    
    // Create SSE connection
    const connection = {
      id: connectionId,
      res,
      req,
      lastActivity: Date.now(),
      initialized: false,
      protocolVersion: null  // Will be set during initialization
    };
    
    this.sseConnections.set(connectionId, connection);
    console.log(`SSE client connected: ${connectionId}`);
    
    // Send endpoint event per MCP SSE spec
    // Use consistent 127.0.0.1 to match Claude Code configuration
    const endpointUrl = `http://127.0.0.1:${this.config.port || 8090}/mcp`;
    res.write(`event: endpoint\ndata: ${endpointUrl}\n\n`);
    
    if (this.config.debug) {
      this.debugLog('CONNECTION', 'Sent endpoint event', { connectionId, endpointUrl });
    }
    
    // Send session event immediately after endpoint event for Claude Code compatibility
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    res.write(`event: session\ndata: ${sessionId}\n\n`);
    
    if (this.config.debug) {
      this.debugLog('CONNECTION', 'Sent session event', { connectionId, sessionId });
    }
    
    // Handle client disconnect
    req.on('close', () => {
      if (this.config.debug) {
        this.debugLog('CONNECTION', 'Client disconnecting', { connectionId });
      }
      this.closeSSEConnection(connectionId);
    });
    
    // Keep connection alive
    const keepAlive = setInterval(() => {
      try {
        res.write(':keepalive\n\n');
        if (this.config.debug && Math.random() < 0.1) { // Log 10% of keepalives
          this.debugLog('KEEPALIVE', 'Sent keepalive', { connectionId });
        }
      } catch (error) {
        // Connection closed, cleanup will happen via 'close' event
        if (this.config.debug) {
          this.debugLog('KEEPALIVE', 'Failed to send keepalive', { connectionId, error: error.message });
        }
      }
    }, this.config.keepAliveInterval);
    
    connection.keepAliveTimer = keepAlive;
    
    // Emit connection event
    this.emitter.emit('connection', { connectionId, connection });
  }

  /**
   * Handle HTTP POST message
   */
  async handleHTTPMessage(req, res) {
    const message = req.body;
    
    // Enhanced logging for debugging cross-gateway issues
    console.log('[SSE-TRANSPORT] Received HTTP message:', {
      method: message.method,
      id: message.id,
      hasParams: !!message.params,
      isToolsList: message.method === 'tools/list',
      acceptsSSE: req.headers.accept?.includes('text/event-stream')
    });
    
    if (this.config.debug) {
      this.debugLog('HTTP-POST', 'Received message', {
        method: message.method,
        id: message.id,
        hasParams: !!message.params,
        headers: req.headers
      });
    }
    
    // Check if this is from an SSE client
    const acceptsSSE = req.headers.accept?.includes('text/event-stream');
    
    // Find the SSE client (simplified correlation)
    let sseConnection = null;
    let connectionId = null;
    
    if (acceptsSSE || this.sseConnections.size > 0) {
      // Use the most recent active SSE connection
      // Convert to array and reverse to get last connection first
      const connections = Array.from(this.sseConnections.entries()).reverse();
      
      for (const [id, conn] of connections) {
        if (conn.res && !conn.res.finished) {
          sseConnection = conn;
          connectionId = id;
          break;
        }
      }
    }
    
    if (this.config.debug) {
      this.debugLog('HTTP-POST', 'Connection lookup', {
        acceptsSSE,
        activeConnections: this.sseConnections.size,
        foundConnection: !!sseConnection,
        connectionId
      });
    }
    
    if (sseConnection && connectionId) {
      // Process the message through the handler
      const handler = this.messageHandlers.get(connectionId) || this.defaultMessageHandler;
      
      console.log('[SSE-HTTP-POST] Handler lookup', {
        connectionId,
        hasHandler: !!handler,
        hasDefaultHandler: !!this.defaultMessageHandler,
        registeredHandlers: Array.from(this.messageHandlers.keys())
      });
      
      if (handler) {
        try {
          if (this.config.debug) {
            this.debugLog('HTTP-POST', 'Calling handler', { connectionId, method: message.method });
          }
          
          // Call the handler and wait for response
          const response = await handler(message);
          
          // Check if handler returned a valid response
          if (!response) {
            console.error('[SSE-HTTP-POST] Handler returned undefined response', {
              connectionId,
              messageMethod: message.method,
              messageId: message.id
            });
            throw new Error('Handler returned undefined response');
          }
          
          console.log('[SSE-HTTP-POST] Handler returned response', {
            connectionId,
            method: message.method,
            responseId: response?.id,
            hasResult: !!response?.result,
            hasError: !!response?.error,
            isToolsList: message.method === 'tools/list',
            toolCount: message.method === 'tools/list' ? response?.result?.tools?.length : undefined,
            resultPreview: response?.result ? JSON.stringify(response.result).substring(0, 100) : null
          });
          
          if (this.config.debug) {
            this.debugLog('HTTP-POST', 'Handler response', {
              connectionId,
              hasResult: !!response.result,
              hasError: !!response.error
            });
          }
          
          // Mark as initialized after successful initialize
          if (message.method === 'initialize' && response.result) {
            sseConnection.initialized = true;
            // Store the protocol version from the client
            sseConnection.protocolVersion = message.params?.protocolVersion || '2024-11-05';
            console.log(`SSE connection ${connectionId} initialized with protocol version: ${sseConnection.protocolVersion}`);
          }
          
          // When there's an active SSE connection, ALWAYS send responses via SSE
          // This is what Claude Code expects - it doesn't handle JSON responses well
          console.log('[SSE-TRANSPORT] Sending response via SSE for active connection:', {
            connectionId,
            method: message.method,
            hasResult: !!response?.result,
            toolCount: message.method === 'tools/list' ? response?.result?.tools?.length : undefined
          });
          
          // Send response via SSE stream
          await this.sendMessage(connectionId, response);
          
          console.log('[SSE-TRANSPORT] Returning 204 No Content for POST request');
          
          // Return 204 No Content for the POST request
          res.status(204).end();
        } catch (error) {
          console.error(`Error handling message for ${connectionId}:`, error);
          if (this.config.debug) {
            this.debugLog('HTTP-POST', 'Handler error', {
              connectionId,
              error: error.message,
              stack: error.stack
            });
          }
          res.status(500).json({
            error: {
              code: -32603,
              message: 'Internal error',
              data: error.message
            }
          });
        }
      } else {
        if (this.config.debug) {
          this.debugLog('HTTP-POST', 'No handler registered', { connectionId });
        }
        res.status(503).json({
          error: {
            code: -32603,
            message: 'No message handler registered'
          }
        });
      }
    } else {
      if (this.config.debug) {
        this.debugLog('HTTP-POST', 'No active SSE connection');
      }
      res.status(400).json({
        error: {
          code: -32600,
          message: 'No active SSE connection found'
        }
      });
    }
  }

  /**
   * Close SSE connection and cleanup
   */
  closeSSEConnection(connectionId) {
    const connection = this.sseConnections.get(connectionId);
    
    if (connection) {
      // Clear keepalive timer
      if (connection.keepAliveTimer) {
        clearInterval(connection.keepAliveTimer);
      }
      
      // End the response if not already ended
      if (connection.res && !connection.res.finished) {
        connection.res.end();
      }
      
      // Remove from connections
      this.sseConnections.delete(connectionId);
      
      console.log(`SSE client disconnected: ${connectionId}`);
      
      // Emit disconnect event
      this.emitter.emit('disconnect', { connectionId });
    }
  }

  /**
   * Generate unique connection ID
   */
  generateConnectionId() {
    return `sse_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get connection status
   */
  getConnectionStatus(connectionId) {
    const connection = this.sseConnections.get(connectionId);
    if (!connection) {
      return { connected: false, error: 'Connection not found' };
    }
    
    return {
      connected: !connection.res.finished,
      initialized: connection.initialized,
      lastActivity: connection.lastActivity
    };
  }

  /**
   * Get transport metrics
   */
  async getMetrics() {
    return {
      activeConnections: this.sseConnections.size,
      totalConnections: this.connections.size,
      uptime: process.uptime()
    };
  }

  /**
   * Get event emitter for connection events
   */
  getEventEmitter() {
    return this.emitter;
  }
}

module.exports = SSETransport;