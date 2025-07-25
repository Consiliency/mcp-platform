// File: bridge/transports/http/http-transport.js
// Purpose: HTTP/SSE transport adapter implementation

const http = require('http');
const https = require('https');
const { URL } = require('url');
const TransportInterface = require('../../core/transport.interface');

class HttpTransport extends TransportInterface {
    constructor() {
        super();
        this.sseConnections = new Map(); // SSE connections for server-initiated messages
    }

    /**
     * Initialize the HTTP transport adapter
     */
    initialize() {
        this.status = 'initialized';
        console.log('HTTP/SSE transport initialized');
    }

    /**
     * Create a new HTTP connection
     * @param {Object} config - Connection configuration
     * @returns {string} Connection ID
     */
    createConnection(config) {
        if (this.status !== 'initialized') {
            throw new Error('Transport not initialized');
        }

        if (!config.url) {
            throw new Error('url is required for HTTP transport');
        }

        const connectionId = this.generateConnectionId();
        const startTime = Date.now();

        try {
            const parsedUrl = new URL(config.url);
            
            // Store connection info
            const connectionInfo = {
                serverId: config.serverId,
                url: config.url,
                parsedUrl,
                status: 'connected',
                startTime,
                headers: config.headers || {},
                sseConnection: null,
                messageCount: 0
            };

            this.connections.set(connectionId, connectionInfo);

            // If SSE endpoint is provided, establish SSE connection
            if (config.sseEndpoint) {
                this.establishSSEConnection(connectionId, config.sseEndpoint);
            }

            // Update metrics
            this.metrics.totalConnections++;
            this.metrics.activeConnections++;

            return connectionId;
        } catch (error) {
            throw new Error(`Failed to create HTTP connection: ${error.message}`);
        }
    }

    /**
     * Establish SSE connection for server-initiated messages
     * @param {string} connectionId - Connection ID
     * @param {string} sseEndpoint - SSE endpoint URL
     */
    establishSSEConnection(connectionId, sseEndpoint) {
        const connectionInfo = this.connections.get(connectionId);
        const protocol = connectionInfo.parsedUrl.protocol === 'https:' ? https : http;

        const sseUrl = new URL(sseEndpoint, connectionInfo.url);
        
        const req = protocol.get(sseUrl.toString(), {
            headers: {
                ...connectionInfo.headers,
                'Accept': 'text/event-stream',
                'Cache-Control': 'no-cache'
            }
        }, (res) => {
            if (res.statusCode !== 200) {
                console.error(`SSE connection failed with status ${res.statusCode}`);
                return;
            }

            connectionInfo.sseConnection = res;
            let buffer = '';

            res.on('data', (chunk) => {
                buffer += chunk.toString();
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            this.handleSSEMessage(connectionId, data);
                        } catch (error) {
                            console.error('Failed to parse SSE message:', error);
                        }
                    }
                }
            });

            res.on('end', () => {
                console.log(`SSE connection closed for ${connectionId}`);
                connectionInfo.sseConnection = null;
            });

            res.on('error', (error) => {
                console.error(`SSE connection error for ${connectionId}:`, error);
                connectionInfo.sseConnection = null;
            });
        });

        req.on('error', (error) => {
            console.error(`Failed to establish SSE connection:`, error);
        });

        this.sseConnections.set(connectionId, req);
    }

    /**
     * Handle incoming SSE message
     * @param {string} connectionId - Connection ID
     * @param {Object} message - SSE message data
     */
    handleSSEMessage(connectionId, message) {
        console.log(`Received SSE message for ${connectionId}:`, message);
        // Handle server-initiated messages here
        // This could be notifications, updates, etc.
    }

    /**
     * Send a message through the HTTP transport
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

        return new Promise((resolve, reject) => {
            const data = JSON.stringify(message);
            const parsedUrl = connectionInfo.parsedUrl;
            const protocol = parsedUrl.protocol === 'https:' ? https : http;

            const options = {
                hostname: parsedUrl.hostname,
                port: parsedUrl.port,
                path: parsedUrl.pathname + parsedUrl.search,
                method: 'POST',
                headers: {
                    ...connectionInfo.headers,
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(data)
                }
            };

            const req = protocol.request(options, (res) => {
                let responseData = '';

                res.on('data', (chunk) => {
                    responseData += chunk;
                });

                res.on('end', () => {
                    try {
                        if (res.statusCode !== 200) {
                            reject(new Error(`HTTP error ${res.statusCode}: ${responseData}`));
                            return;
                        }

                        const response = JSON.parse(responseData);
                        
                        if (!this.validateJsonRpcMessage(response)) {
                            reject(new Error('Invalid JSON-RPC response'));
                            return;
                        }

                        connectionInfo.messageCount++;
                        this.metrics.totalMessages++;
                        resolve(response);
                    } catch (error) {
                        reject(new Error(`Failed to parse response: ${error.message}`));
                    }
                });
            });

            req.on('error', (error) => {
                reject(new Error(`HTTP request failed: ${error.message}`));
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('HTTP request timed out'));
            });

            // Set timeout
            req.setTimeout(30000); // 30 seconds

            // Send the request
            req.write(data);
            req.end();
        });
    }

    /**
     * Close an HTTP connection
     * @param {string} connectionId - Connection identifier
     */
    closeConnection(connectionId) {
        const connectionInfo = this.connections.get(connectionId);
        
        if (!connectionInfo) {
            return; // Already closed or doesn't exist
        }

        // Close SSE connection if exists
        if (connectionInfo.sseConnection) {
            connectionInfo.sseConnection.destroy();
        }

        const sseReq = this.sseConnections.get(connectionId);
        if (sseReq) {
            sseReq.destroy();
            this.sseConnections.delete(connectionId);
        }

        // Update status
        connectionInfo.status = 'disconnected';
        
        // Clean up
        this.connections.delete(connectionId);
        
        // Update metrics
        if (this.metrics.activeConnections > 0) {
            this.metrics.activeConnections--;
        }
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
                sse_connected: connectionInfo.sseConnection !== null,
                url: connectionInfo.url
            }
        };
    }
}

module.exports = HttpTransport;