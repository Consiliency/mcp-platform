/**
 * Abstract Transport Interface
 * Base interface that all transport adapters must implement
 */
class TransportInterface {
    constructor(config) {
        if (new.target === TransportInterface) {
            throw new TypeError("Cannot instantiate abstract TransportInterface directly");
        }
        
        this.config = config;
        this.id = config.id;
        this.type = config.type;
        this.status = 'initialized';
        this.connections = new Map();
    }

    /**
     * Initialize the transport
     * @returns {Promise<void>}
     */
    async initialize() {
        throw new Error("Method 'initialize()' must be implemented");
    }

    /**
     * Start the transport service
     * @returns {Promise<void>}
     */
    async start() {
        throw new Error("Method 'start()' must be implemented");
    }

    /**
     * Stop the transport service
     * @returns {Promise<void>}
     */
    async stop() {
        throw new Error("Method 'stop()' must be implemented");
    }

    /**
     * Send a message through the transport
     * @param {string} connectionId - Connection identifier
     * @param {Object} message - Message to send
     * @returns {Promise<Object>} Response message
     */
    async sendMessage(connectionId, message) {
        throw new Error("Method 'sendMessage()' must be implemented");
    }

    /**
     * Handle incoming messages
     * @param {string} connectionId - Connection identifier
     * @param {Function} handler - Message handler function
     */
    onMessage(connectionId, handler) {
        throw new Error("Method 'onMessage()' must be implemented");
    }

    /**
     * Create a new connection
     * @param {Object} options - Connection options
     * @returns {Promise<string>} Connection ID
     */
    async createConnection(options) {
        throw new Error("Method 'createConnection()' must be implemented");
    }

    /**
     * Close a connection
     * @param {string} connectionId - Connection identifier
     * @returns {Promise<void>}
     */
    async closeConnection(connectionId) {
        throw new Error("Method 'closeConnection()' must be implemented");
    }

    /**
     * Get transport health status
     * @returns {Promise<Object>} Health status
     */
    async getHealth() {
        return {
            type: this.type,
            status: this.status,
            connections: this.connections.size,
            uptime: process.uptime()
        };
    }

    /**
     * Get transport metrics
     * @returns {Promise<Object>} Transport metrics
     */
    async getMetrics() {
        throw new Error("Method 'getMetrics()' must be implemented");
    }

    /**
     * Validate message format
     * @param {Object} message - Message to validate
     * @returns {boolean} Valid or not
     */
    validateMessage(message) {
        return message && 
               typeof message === 'object' && 
               message.jsonrpc === '2.0' &&
               (message.method || message.id);
    }

    /**
     * Transform message between transport formats
     * @param {Object} message - Message to transform
     * @param {string} targetFormat - Target format
     * @returns {Object} Transformed message
     */
    transformMessage(message, targetFormat) {
        // Default implementation - override in specific transports
        return message;
    }
}

module.exports = TransportInterface;