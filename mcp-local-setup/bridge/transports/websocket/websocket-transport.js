const { TransportInterface } = require('../../core');
const WebSocket = require('ws');
const TransportOptimizer = require('../transport-optimizer');

/**
 * WebSocket Transport Adapter with Performance Optimizations
 * Demonstrates exponential backoff reconnection and message batching
 */
class WebSocketTransport extends TransportInterface {
    constructor(config) {
        super(config);
        this.type = 'websocket';
        this.optimizer = new TransportOptimizer();
        this.batchingEnabled = config.batchingEnabled || false;
        this.connections = new Map();
        this.reconnectEnabled = config.reconnectEnabled !== false;
    }

    /**
     * Initialize the WebSocket transport
     */
    async initialize() {
        this.status = 'initialized';
        
        // Apply performance optimizations
        this.optimizer.optimizeWebSocketReconnection(this);
        
        // Enable message batching if configured
        if (this.batchingEnabled) {
            this.optimizer.enableMessageBatching(this);
        }
        
        // Apply general transport tuning
        this.optimizer.tuneTransportPerformance(this, {
            bufferSize: 65536,
            timeout: 30000,
            concurrency: 50, // WebSockets can handle more concurrent connections
            compression: true
        });
        
        console.log('WebSocket transport initialized with optimizations');
    }

    /**
     * Start the WebSocket transport service
     */
    async start() {
        this.status = 'running';
        console.log('WebSocket transport started');
    }

    /**
     * Stop the WebSocket transport service
     */
    async stop() {
        // Close all connections
        for (const [connectionId, wsInfo] of this.connections) {
            await this.closeConnection(connectionId);
        }
        
        this.status = 'stopped';
        console.log('WebSocket transport stopped');
    }

    /**
     * Create a new WebSocket connection
     * @param {Object} options - Connection options
     * @returns {Promise<string>} Connection ID
     */
    async createConnection(options) {
        const connectionId = `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const { url, protocols = [], serverId } = options;
        
        if (!url) {
            throw new Error('URL is required for WebSocket transport');
        }

        return new Promise((resolve, reject) => {
            const ws = new WebSocket(url, protocols, {
                perMessageDeflate: this.compressionEnabled,
                maxPayload: this.bufferSize || 65536
            });

            const wsInfo = {
                connectionId,
                serverId,
                ws,
                url,
                created: new Date(),
                messageQueue: [],
                reconnecting: false,
                reconnectAttempts: 0
            };

            // Connection opened
            ws.on('open', () => {
                console.log(`WebSocket connection opened: ${connectionId}`);
                wsInfo.status = 'connected';
                this.connections.set(connectionId, wsInfo);
                resolve(connectionId);
            });

            // Handle messages
            ws.on('message', (data) => {
                this.handleMessage(connectionId, data);
            });

            // Handle errors
            ws.on('error', (error) => {
                console.error(`WebSocket error on ${connectionId}:`, error);
                wsInfo.lastError = error;
                
                if (!wsInfo.status) {
                    reject(error);
                }
            });

            // Handle close
            ws.on('close', (code, reason) => {
                console.log(`WebSocket closed ${connectionId}: ${code} - ${reason}`);
                wsInfo.status = 'disconnected';
                
                if (this.reconnectEnabled && !wsInfo.reconnecting) {
                    this.handleReconnection(connectionId);
                }
            });

            // Timeout for initial connection
            setTimeout(() => {
                if (!wsInfo.status) {
                    ws.terminate();
                    reject(new Error('WebSocket connection timeout'));
                }
            }, this.timeout || 30000);
        });
    }

    /**
     * Handle reconnection with exponential backoff
     * @param {string} connectionId - Connection identifier
     */
    async handleReconnection(connectionId) {
        const wsInfo = this.connections.get(connectionId);
        if (!wsInfo || wsInfo.reconnecting) return;

        wsInfo.reconnecting = true;
        
        try {
            // Use the optimized reconnect method with exponential backoff
            await this.reconnect(connectionId);
        } catch (error) {
            console.error(`Failed to reconnect ${connectionId}:`, error);
            wsInfo.reconnecting = false;
        }
    }

    /**
     * Reconnect a WebSocket connection
     * @param {string} connectionId - Connection identifier
     */
    async reconnect(connectionId) {
        const wsInfo = this.connections.get(connectionId);
        if (!wsInfo) throw new Error(`Connection not found: ${connectionId}`);

        console.log(`Attempting to reconnect ${connectionId}...`);
        
        // Close existing connection
        if (wsInfo.ws.readyState !== WebSocket.CLOSED) {
            wsInfo.ws.close();
        }

        // Create new connection
        const ws = new WebSocket(wsInfo.url, [], {
            perMessageDeflate: this.compressionEnabled,
            maxPayload: this.bufferSize || 65536
        });

        return new Promise((resolve, reject) => {
            ws.on('open', () => {
                console.log(`WebSocket reconnected: ${connectionId}`);
                wsInfo.ws = ws;
                wsInfo.status = 'connected';
                wsInfo.reconnecting = false;
                wsInfo.reconnectAttempts = 0;
                
                // Resend queued messages
                while (wsInfo.messageQueue.length > 0) {
                    const msg = wsInfo.messageQueue.shift();
                    ws.send(JSON.stringify(msg));
                }
                
                resolve();
            });

            ws.on('error', (error) => {
                wsInfo.reconnectAttempts++;
                reject(error);
            });

            ws.on('close', () => {
                if (!wsInfo.status || wsInfo.status !== 'connected') {
                    wsInfo.reconnectAttempts++;
                    reject(new Error('Reconnection failed'));
                }
            });
        });
    }

    /**
     * Close a WebSocket connection
     * @param {string} connectionId - Connection identifier
     */
    async closeConnection(connectionId) {
        const wsInfo = this.connections.get(connectionId);
        
        if (!wsInfo) return;

        try {
            if (wsInfo.ws.readyState === WebSocket.OPEN) {
                wsInfo.ws.close(1000, 'Normal closure');
            }
            
            this.connections.delete(connectionId);
            console.log(`Closed WebSocket connection: ${connectionId}`);
        } catch (error) {
            console.error(`Error closing connection ${connectionId}:`, error);
        }
    }

    /**
     * Send a message through WebSocket
     * @param {string} connectionId - Connection identifier
     * @param {Object} message - Message to send
     * @returns {Promise<Object>} Response message
     */
    async sendMessage(connectionId, message) {
        const wsInfo = this.connections.get(connectionId);
        
        if (!wsInfo) {
            throw new Error(`Connection not found: ${connectionId}`);
        }

        if (!this.validateMessage(message)) {
            throw new Error('Invalid message format');
        }

        // Queue message if disconnected
        if (wsInfo.ws.readyState !== WebSocket.OPEN) {
            if (this.reconnectEnabled) {
                wsInfo.messageQueue.push(message);
                if (!wsInfo.reconnecting) {
                    this.handleReconnection(connectionId);
                }
                return { queued: true };
            } else {
                throw new Error('WebSocket is not connected');
            }
        }

        return new Promise((resolve, reject) => {
            const messageStr = JSON.stringify(message);
            
            wsInfo.ws.send(messageStr, (error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve({ sent: true });
                }
            });
        });
    }

    /**
     * Handle incoming message
     * @param {string} connectionId - Connection identifier
     * @param {Buffer|string} data - Message data
     */
    handleMessage(connectionId, data) {
        try {
            const message = JSON.parse(data.toString());
            this.emit('message', connectionId, message);
        } catch (error) {
            console.error(`Failed to parse message on ${connectionId}:`, error);
        }
    }

    /**
     * Send a batch of messages
     * @param {Array} messages - Array of messages to send
     * @returns {Promise<Array>} Array of responses
     */
    async sendBatch(messages) {
        const results = [];
        
        // Group messages by connection for efficiency
        const messagesByConnection = new Map();
        
        for (const msg of messages) {
            if (!messagesByConnection.has(msg.connectionId)) {
                messagesByConnection.set(msg.connectionId, []);
            }
            messagesByConnection.get(msg.connectionId).push(msg.data);
        }
        
        // Send batched messages per connection
        for (const [connectionId, msgs] of messagesByConnection) {
            try {
                const batchMessage = {
                    type: 'batch',
                    messages: msgs
                };
                const result = await this.sendMessage(connectionId, batchMessage);
                results.push({ success: true, result, count: msgs.length });
            } catch (error) {
                results.push({ success: false, error: error.message });
            }
        }
        
        return results;
    }

    /**
     * Set buffer size for WebSocket
     * @param {number} size - Buffer size in bytes
     */
    setBufferSize(size) {
        this.bufferSize = size;
        // Apply to new connections
    }

    /**
     * Set timeout for operations
     * @param {number} timeout - Timeout in milliseconds
     */
    setTimeout(timeout) {
        this.timeout = timeout;
    }

    /**
     * Set concurrency limit
     * @param {number} limit - Maximum concurrent connections
     */
    setConcurrency(limit) {
        this.concurrencyLimit = limit;
    }

    /**
     * Enable compression
     */
    enableCompression() {
        this.compressionEnabled = true;
    }

    /**
     * Get transport metrics
     * @returns {Promise<Object>} Transport metrics
     */
    async getMetrics() {
        const metrics = {
            type: 'websocket',
            connections: {
                active: 0,
                total: this.connections.size,
                reconnecting: 0
            },
            details: []
        };

        for (const [connectionId, wsInfo] of this.connections) {
            if (wsInfo.ws.readyState === WebSocket.OPEN) {
                metrics.connections.active++;
            }
            if (wsInfo.reconnecting) {
                metrics.connections.reconnecting++;
            }

            metrics.details.push({
                connectionId,
                serverId: wsInfo.serverId,
                status: wsInfo.status,
                readyState: wsInfo.ws.readyState,
                bufferedAmount: wsInfo.ws.bufferedAmount,
                reconnectAttempts: wsInfo.reconnectAttempts,
                queuedMessages: wsInfo.messageQueue.length
            });
        }

        return metrics;
    }
}

module.exports = WebSocketTransport;