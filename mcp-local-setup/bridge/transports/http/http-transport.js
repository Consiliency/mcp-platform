const { TransportInterface } = require('../../core');
const http = require('http');
const https = require('https');
const TransportOptimizer = require('../transport-optimizer');

/**
 * HTTP Transport Adapter with Performance Optimizations
 * Demonstrates HTTP connection pooling and keep-alive
 */
class HttpTransport extends TransportInterface {
    constructor(config) {
        super(config);
        this.type = 'http';
        this.optimizer = new TransportOptimizer();
        this.batchingEnabled = config.batchingEnabled || false;
        
        // HTTP agent with connection pooling
        this.agent = new (config.secure ? https : http).Agent({
            keepAlive: false, // Will be optimized
            keepAliveMsecs: 1000,
            maxSockets: 5,
            maxFreeSockets: 2,
            timeout: 30000
        });
    }

    /**
     * Initialize the HTTP transport
     */
    async initialize() {
        this.status = 'initialized';
        
        // Apply performance optimizations
        this.optimizer.optimizeHttpTransport(this);
        
        // Enable message batching if configured
        if (this.batchingEnabled) {
            this.optimizer.enableMessageBatching(this);
        }
        
        // Apply general transport tuning
        this.optimizer.tuneTransportPerformance(this, {
            bufferSize: 65536,
            timeout: 30000,
            concurrency: 10,
            compression: true
        });
        
        console.log('HTTP transport initialized with optimizations');
    }

    /**
     * Start the HTTP transport service
     */
    async start() {
        this.status = 'running';
        console.log('HTTP transport started');
    }

    /**
     * Stop the HTTP transport service
     */
    async stop() {
        // Destroy the agent to close all connections
        this.agent.destroy();
        this.status = 'stopped';
        console.log('HTTP transport stopped');
    }

    /**
     * Create a new HTTP connection
     * @param {Object} options - Connection options
     * @returns {Promise<string>} Connection ID
     */
    async createConnection(options) {
        const connectionId = `http_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const { url, headers = {}, serverId } = options;
        
        if (!url) {
            throw new Error('URL is required for HTTP transport');
        }

        const connectionInfo = {
            connectionId,
            serverId,
            url,
            headers,
            agent: this.agent,
            created: new Date()
        };
        
        this.connections.set(connectionId, connectionInfo);
        
        console.log(`Created HTTP connection: ${connectionId} for ${serverId}`);
        return connectionId;
    }

    /**
     * Close an HTTP connection
     * @param {string} connectionId - Connection identifier
     */
    async closeConnection(connectionId) {
        this.connections.delete(connectionId);
        console.log(`Closed HTTP connection: ${connectionId}`);
    }

    /**
     * Send a message through HTTP
     * @param {string} connectionId - Connection identifier
     * @param {Object} message - Message to send
     * @returns {Promise<Object>} Response message
     */
    async sendMessage(connectionId, message) {
        const connection = this.connections.get(connectionId);
        
        if (!connection) {
            throw new Error(`Connection not found: ${connectionId}`);
        }

        if (!this.validateMessage(message)) {
            throw new Error('Invalid message format');
        }

        const url = new URL(connection.url);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...connection.headers
            },
            agent: connection.agent
        };

        return new Promise((resolve, reject) => {
            const protocol = url.protocol === 'https:' ? https : http;
            const req = protocol.request(options, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    try {
                        const response = JSON.parse(data);
                        resolve(response);
                    } catch (error) {
                        reject(new Error(`Invalid response: ${error.message}`));
                    }
                });
            });

            req.on('error', reject);
            req.write(JSON.stringify(message));
            req.end();
        });
    }

    /**
     * Send a batch of messages
     * @param {Array} messages - Array of messages to send
     * @returns {Promise<Array>} Array of responses
     */
    async sendBatch(messages) {
        // Use Promise.all for parallel requests with connection pooling
        const promises = messages.map(msg => 
            this.sendMessage(msg.connectionId, msg.data)
                .then(result => ({ success: true, result }))
                .catch(error => ({ success: false, error: error.message }))
        );
        
        return Promise.all(promises);
    }

    /**
     * Set buffer size (not applicable for HTTP)
     * @param {number} size - Buffer size in bytes
     */
    setBufferSize(size) {
        // HTTP doesn't use direct buffers, but we can tune the agent
        if (this.agent.maxSockets < size / 65536) {
            this.agent.maxSockets = Math.floor(size / 65536);
        }
    }

    /**
     * Set timeout for operations
     * @param {number} timeout - Timeout in milliseconds
     */
    setTimeout(timeout) {
        this.timeout = timeout;
        if (this.agent) {
            this.agent.timeout = timeout;
        }
    }

    /**
     * Set concurrency limit
     * @param {number} limit - Maximum concurrent connections
     */
    setConcurrency(limit) {
        this.concurrencyLimit = limit;
        if (this.agent) {
            this.agent.maxSockets = limit;
            this.agent.maxFreeSockets = Math.floor(limit / 2);
        }
    }

    /**
     * Enable compression (for future implementation)
     */
    enableCompression() {
        this.compressionEnabled = true;
        // Would implement gzip/deflate compression here
    }

    /**
     * Get transport metrics
     * @returns {Promise<Object>} Transport metrics
     */
    async getMetrics() {
        const pool = this.optimizer.connectionPools.get(this.id);
        
        return {
            type: 'http',
            connections: {
                active: this.connections.size,
                pooled: pool ? pool.connections.size : 0
            },
            agent: {
                keepAlive: this.agent.keepAlive,
                maxSockets: this.agent.maxSockets,
                sockets: Object.keys(this.agent.sockets || {}).length,
                requests: Object.keys(this.agent.requests || {}).length
            }
        };
    }
}

module.exports = HttpTransport;