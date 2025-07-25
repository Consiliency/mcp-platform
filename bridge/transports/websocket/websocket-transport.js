// File: bridge/transports/websocket/websocket-transport.js
// Purpose: WebSocket transport adapter implementation

const WebSocket = require('ws');
const TransportInterface = require('../../core/transport.interface');

class WebSocketTransport extends TransportInterface {
    constructor() {
        super();
        this.websockets = new Map(); // Map of connectionId to WebSocket instance
    }

    /**
     * Initialize the WebSocket transport adapter
     */
    initialize() {
        this.status = 'initialized';
        console.log('WebSocket transport initialized');
    }

    /**
     * Create a new WebSocket connection
     * @param {Object} config - Connection configuration
     * @returns {Promise<string>} Connection ID
     */
    async createConnection(config) {
        if (this.status !== 'initialized') {
            throw new Error('Transport not initialized');
        }

        if (!config.url) {
            throw new Error('url is required for WebSocket transport');
        }

        const connectionId = this.generateConnectionId();
        const startTime = Date.now();

        return new Promise((resolve, reject) => {
            try {
                // Create WebSocket connection
                const ws = new WebSocket(config.url, {
                    headers: config.headers || {},
                    perMessageDeflate: false,
                    handshakeTimeout: 10000 // 10 seconds
                });

                // Store connection info
                const connectionInfo = {
                    ws,
                    serverId: config.serverId,
                    url: config.url,
                    status: 'connecting',
                    startTime,
                    messageCount: 0,
                    pendingRequests: new Map(), // Map of request ID to callback
                    reconnectAttempts: 0,
                    maxReconnectAttempts: config.maxReconnectAttempts || 3,
                    reconnectDelay: config.reconnectDelay || 1000
                };

                this.connections.set(connectionId, connectionInfo);
                this.websockets.set(connectionId, ws);

                // Set up WebSocket event handlers
                this.setupWebSocketHandlers(connectionId, ws, resolve, reject);

                // Update metrics
                this.metrics.totalConnections++;

            } catch (error) {
                reject(new Error(`Failed to create WebSocket connection: ${error.message}`));
            }
        });
    }

    /**
     * Set up event handlers for the WebSocket
     * @param {string} connectionId - Connection ID
     * @param {WebSocket} ws - WebSocket instance
     * @param {Function} resolve - Promise resolve function
     * @param {Function} reject - Promise reject function
     */
    setupWebSocketHandlers(connectionId, ws, resolve, reject) {
        const connectionInfo = this.connections.get(connectionId);

        // Handle connection open
        ws.on('open', () => {
            connectionInfo.status = 'connected';
            this.metrics.activeConnections++;
            console.log(`WebSocket connection established: ${connectionId}`);
            
            if (resolve) {
                resolve(connectionId);
            }

            // Reset reconnect attempts on successful connection
            connectionInfo.reconnectAttempts = 0;
        });

        // Handle incoming messages
        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                this.handleIncomingMessage(connectionId, message);
            } catch (error) {
                console.error(`Failed to parse WebSocket message: ${error.message}`);
            }
        });

        // Handle connection close
        ws.on('close', (code, reason) => {
            console.log(`WebSocket connection closed: ${connectionId}, code: ${code}, reason: ${reason}`);
            connectionInfo.status = 'disconnected';
            
            if (this.metrics.activeConnections > 0) {
                this.metrics.activeConnections--;
            }

            // Reject all pending requests
            for (const [id, callback] of connectionInfo.pendingRequests) {
                callback(this.createErrorResponse(id, -32603, 'WebSocket connection closed'));
            }
            connectionInfo.pendingRequests.clear();

            // Attempt reconnection if configured
            if (connectionInfo.reconnectAttempts < connectionInfo.maxReconnectAttempts) {
                this.attemptReconnection(connectionId);
            }
        });

        // Handle errors
        ws.on('error', (error) => {
            console.error(`WebSocket error for ${connectionId}:`, error);
            connectionInfo.status = 'error';
            
            if (reject) {
                reject(error);
            }
        });

        // Handle ping/pong for keep-alive
        ws.on('ping', () => {
            ws.pong();
        });
    }

    /**
     * Handle incoming message from WebSocket
     * @param {string} connectionId - Connection ID
     * @param {Object} message - Parsed message
     */
    handleIncomingMessage(connectionId, message) {
        const connectionInfo = this.connections.get(connectionId);
        
        if (!this.validateJsonRpcMessage(message)) {
            console.error(`Invalid JSON-RPC message from ${connectionId}:`, message);
            return;
        }

        // If it's a response, match it with pending request
        if ('id' in message && (message.result !== undefined || message.error !== undefined)) {
            const callback = connectionInfo.pendingRequests.get(message.id);
            if (callback) {
                connectionInfo.pendingRequests.delete(message.id);
                callback(message);
            }
        } else if (message.method) {
            // Handle server-initiated requests/notifications
            console.log(`Received server message for ${connectionId}:`, message);
            // Could emit events or handle notifications here
        }
    }

    /**
     * Attempt to reconnect a WebSocket connection
     * @param {string} connectionId - Connection ID
     */
    attemptReconnection(connectionId) {
        const connectionInfo = this.connections.get(connectionId);
        
        if (!connectionInfo) {
            return;
        }

        connectionInfo.reconnectAttempts++;
        connectionInfo.status = 'reconnecting';

        console.log(`Attempting reconnection ${connectionInfo.reconnectAttempts}/${connectionInfo.maxReconnectAttempts} for ${connectionId}`);

        setTimeout(() => {
            if (connectionInfo.status === 'reconnecting') {
                const ws = new WebSocket(connectionInfo.url, {
                    headers: connectionInfo.headers || {},
                    perMessageDeflate: false
                });

                connectionInfo.ws = ws;
                this.websockets.set(connectionId, ws);
                this.setupWebSocketHandlers(connectionId, ws);
            }
        }, connectionInfo.reconnectDelay * connectionInfo.reconnectAttempts);
    }

    /**
     * Send a message through the WebSocket transport
     * @param {string} connectionId - Connection identifier
     * @param {Object} message - JSON-RPC 2.0 message
     * @returns {Promise<Object>} Response message
     */
    async sendMessage(connectionId, message) {
        const connectionInfo = this.connections.get(connectionId);
        
        if (!connectionInfo) {
            throw new Error(`Connection ${connectionId} not found`);
        }

        if (connectionInfo.status !== 'connected') {
            throw new Error(`Connection ${connectionId} is not active`);
        }

        if (!this.validateJsonRpcMessage(message)) {
            throw new Error('Invalid JSON-RPC 2.0 message');
        }

        const ws = connectionInfo.ws;
        
        if (ws.readyState !== WebSocket.OPEN) {
            throw new Error('WebSocket is not open');
        }

        return new Promise((resolve, reject) => {
            try {
                // If the message has an ID, track it for response matching
                if ('id' in message) {
                    connectionInfo.pendingRequests.set(message.id, resolve);
                    
                    // Set timeout for response
                    setTimeout(() => {
                        if (connectionInfo.pendingRequests.has(message.id)) {
                            connectionInfo.pendingRequests.delete(message.id);
                            reject(new Error(`Request ${message.id} timed out`));
                        }
                    }, 30000); // 30 second timeout
                }

                // Send the message
                ws.send(JSON.stringify(message), (error) => {
                    if (error) {
                        if ('id' in message) {
                            connectionInfo.pendingRequests.delete(message.id);
                        }
                        reject(error);
                    } else {
                        connectionInfo.messageCount++;
                        this.metrics.totalMessages++;
                        
                        // For notifications (no ID), resolve immediately
                        if (!('id' in message)) {
                            resolve({ jsonrpc: '2.0', result: 'notification sent' });
                        }
                    }
                });

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Close a WebSocket connection
     * @param {string} connectionId - Connection identifier
     */
    closeConnection(connectionId) {
        const connectionInfo = this.connections.get(connectionId);
        
        if (!connectionInfo) {
            return; // Already closed or doesn't exist
        }

        // Prevent reconnection attempts
        connectionInfo.maxReconnectAttempts = 0;

        // Close the WebSocket
        if (connectionInfo.ws) {
            connectionInfo.ws.close(1000, 'Normal closure');
        }

        // Update status
        connectionInfo.status = 'disconnected';
        
        // Clean up
        this.connections.delete(connectionId);
        this.websockets.delete(connectionId);
    }

    /**
     * Get connection status
     * @param {string} connectionId - Connection identifier
     * @returns {Object} Status dictionary
     */
    getStatus(connectionId) {
        const connectionInfo = this.connections.get(connectionId);
        
        if (!connectionInfo) {
            return {
                status: 'unknown',
                uptime: 0,
                metrics: {}
            };
        }

        const uptime = Math.floor((Date.now() - connectionInfo.startTime) / 1000);
        
        return {
            status: connectionInfo.status,
            uptime,
            metrics: {
                messages_sent: connectionInfo.messageCount,
                pending_requests: connectionInfo.pendingRequests.size,
                reconnect_attempts: connectionInfo.reconnectAttempts,
                websocket_state: connectionInfo.ws ? connectionInfo.ws.readyState : 'N/A'
            }
        };
    }
}

module.exports = WebSocketTransport;