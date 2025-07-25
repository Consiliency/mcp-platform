// File: bridge/core/transport.interface.js
// Purpose: Base interface for all transport adapters

class TransportInterface {
    constructor() {
        this.connections = new Map();
        this.status = 'uninitialized';
        this.metrics = {
            totalMessages: 0,
            totalConnections: 0,
            activeConnections: 0
        };
    }

    /**
     * Initialize the transport adapter
     * @returns {void}
     */
    initialize() {
        throw new Error('initialize() must be implemented by transport adapter');
    }

    /**
     * Create a new connection for a server
     * @param {Object} config - Connection configuration
     * @param {string} config.serverId - Unique server identifier
     * @param {string} [config.command] - Command to execute (stdio)
     * @param {string} [config.url] - Server URL (http/websocket)
     * @param {Array} [config.args] - Command arguments (stdio)
     * @param {Object} [config.env] - Environment variables
     * @returns {string} Connection ID
     */
    createConnection(config) {
        throw new Error('createConnection() must be implemented by transport adapter');
    }

    /**
     * Send a message through the transport
     * @param {string} connectionId - Connection identifier
     * @param {Object} message - JSON-RPC 2.0 message
     * @returns {Object} Response message
     */
    sendMessage(connectionId, message) {
        throw new Error('sendMessage() must be implemented by transport adapter');
    }

    /**
     * Close a connection
     * @param {string} connectionId - Connection identifier
     * @returns {void}
     */
    closeConnection(connectionId) {
        throw new Error('closeConnection() must be implemented by transport adapter');
    }

    /**
     * Get connection status
     * @param {string} connectionId - Connection identifier
     * @returns {Object} Status dictionary with status, uptime, and metrics
     */
    getStatus(connectionId) {
        throw new Error('getStatus() must be implemented by transport adapter');
    }

    /**
     * Helper method to generate unique connection IDs
     * @returns {string} Unique connection ID
     */
    generateConnectionId() {
        return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Helper method to validate JSON-RPC 2.0 message format
     * @param {Object} message - Message to validate
     * @returns {boolean} True if valid
     */
    validateJsonRpcMessage(message) {
        if (!message || typeof message !== 'object') {
            return false;
        }
        
        if (message.jsonrpc !== '2.0') {
            return false;
        }
        
        // Must have either method (request) or result/error (response)
        const isRequest = 'method' in message;
        const isResponse = 'result' in message || 'error' in message;
        
        if (!isRequest && !isResponse) {
            return false;
        }
        
        // Requests must have method as string
        if (isRequest && typeof message.method !== 'string') {
            return false;
        }
        
        return true;
    }

    /**
     * Helper method to create JSON-RPC error response
     * @param {number|string} id - Request ID
     * @param {number} code - Error code
     * @param {string} message - Error message
     * @param {*} [data] - Optional error data
     * @returns {Object} JSON-RPC error response
     */
    createErrorResponse(id, code, message, data = undefined) {
        const error = {
            jsonrpc: '2.0',
            id: id || null,
            error: {
                code,
                message
            }
        };
        
        if (data !== undefined) {
            error.error.data = data;
        }
        
        return error;
    }
}

module.exports = TransportInterface;