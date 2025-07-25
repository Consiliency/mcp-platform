const EventEmitter = require('events');

/**
 * Message Router
 * Routes messages between different transport types with format conversion
 */
class MessageRouter extends EventEmitter {
    constructor() {
        super();
        
        this.routes = new Map();
        this.messageQueue = new Map();
        this.correlations = new Map();
        this.messageId = 0;
    }

    /**
     * Register a route between source and destination
     * @param {string} source - Source identifier
     * @param {string} destination - Destination identifier
     * @param {Object} options - Routing options
     */
    registerRoute(source, destination, options = {}) {
        const routeKey = `${source}->${destination}`;
        
        this.routes.set(routeKey, {
            source,
            destination,
            transform: options.transform || null,
            filter: options.filter || null,
            priority: options.priority || 0
        });
        
        this.emit('route:registered', { source, destination });
    }

    /**
     * Route a message from source to destination
     * @param {string} source - Source identifier
     * @param {string} destination - Destination identifier  
     * @param {Object} message - Message to route
     * @returns {Promise<Object>} Routed message response
     */
    async routeMessage(source, destination, message) {
        const routeKey = `${source}->${destination}`;
        const route = this.routes.get(routeKey);
        
        if (!route) {
            throw new Error(`No route found: ${routeKey}`);
        }
        
        // Apply filter if configured
        if (route.filter && !route.filter(message)) {
            throw new Error(`Message filtered out for route: ${routeKey}`);
        }
        
        // Apply transformation if configured
        let transformedMessage = message;
        if (route.transform) {
            transformedMessage = await route.transform(message);
        }
        
        // Add routing metadata
        transformedMessage._routing = {
            source,
            destination,
            timestamp: new Date().toISOString(),
            messageId: this.generateMessageId()
        };
        
        this.emit('message:routed', {
            source,
            destination,
            message: transformedMessage
        });
        
        return transformedMessage;
    }

    /**
     * Handle request-response correlation
     * @param {Object} request - Request message
     * @param {string} correlationId - Correlation ID
     */
    correlateRequest(request, correlationId) {
        this.correlations.set(correlationId, {
            request,
            timestamp: Date.now(),
            timeout: setTimeout(() => {
                this.correlations.delete(correlationId);
                this.emit('correlation:timeout', { correlationId, request });
            }, 30000) // 30 second timeout
        });
    }

    /**
     * Handle response correlation
     * @param {Object} response - Response message
     * @param {string} correlationId - Correlation ID
     * @returns {Object} Original request
     */
    correlateResponse(response, correlationId) {
        const correlation = this.correlations.get(correlationId);
        
        if (!correlation) {
            throw new Error(`No correlation found for ID: ${correlationId}`);
        }
        
        clearTimeout(correlation.timeout);
        this.correlations.delete(correlationId);
        
        this.emit('correlation:matched', {
            correlationId,
            request: correlation.request,
            response,
            duration: Date.now() - correlation.timestamp
        });
        
        return correlation.request;
    }

    /**
     * Queue a message for delivery
     * @param {string} destination - Destination identifier
     * @param {Object} message - Message to queue
     */
    queueMessage(destination, message) {
        if (!this.messageQueue.has(destination)) {
            this.messageQueue.set(destination, []);
        }
        
        this.messageQueue.get(destination).push({
            message,
            timestamp: Date.now(),
            attempts: 0
        });
        
        this.emit('message:queued', { destination, message });
    }

    /**
     * Get queued messages for a destination
     * @param {string} destination - Destination identifier
     * @param {number} limit - Maximum messages to retrieve
     * @returns {Array} Queued messages
     */
    getQueuedMessages(destination, limit = 10) {
        const queue = this.messageQueue.get(destination) || [];
        const messages = queue.splice(0, limit);
        
        if (queue.length === 0) {
            this.messageQueue.delete(destination);
        }
        
        return messages.map(item => item.message);
    }

    /**
     * Transform message between MCP formats
     * @param {Object} message - Source message
     * @param {string} sourceFormat - Source format type
     * @param {string} targetFormat - Target format type
     * @returns {Object} Transformed message
     */
    transformFormat(message, sourceFormat, targetFormat) {
        // Handle JSON-RPC 2.0 format (common MCP format)
        if (targetFormat === 'jsonrpc') {
            return {
                jsonrpc: '2.0',
                id: message.id || this.generateMessageId(),
                method: message.method || message.action,
                params: message.params || message.data || {}
            };
        }
        
        // Handle HTTP REST format
        if (targetFormat === 'rest') {
            return {
                method: message.method || 'POST',
                path: `/api/v1/${message.action || message.method}`,
                headers: {
                    'Content-Type': 'application/json',
                    'X-Message-ID': message.id || this.generateMessageId()
                },
                body: message.params || message.data || {}
            };
        }
        
        // Handle WebSocket format
        if (targetFormat === 'websocket') {
            return {
                type: message.method || message.action || 'message',
                id: message.id || this.generateMessageId(),
                data: message.params || message.data || {},
                timestamp: new Date().toISOString()
            };
        }
        
        // Default - return as is
        return message;
    }

    /**
     * Generate unique message ID
     * @returns {string} Message ID
     */
    generateMessageId() {
        return `msg_${Date.now()}_${++this.messageId}`;
    }

    /**
     * Get routing statistics
     * @returns {Object} Routing stats
     */
    getStats() {
        const stats = {
            routes: this.routes.size,
            activeCorrelations: this.correlations.size,
            queuedDestinations: this.messageQueue.size,
            totalQueued: 0
        };
        
        for (const queue of this.messageQueue.values()) {
            stats.totalQueued += queue.length;
        }
        
        return stats;
    }

    /**
     * Clear expired correlations
     */
    cleanupCorrelations() {
        const now = Date.now();
        const expired = [];
        
        for (const [id, correlation] of this.correlations) {
            if (now - correlation.timestamp > 60000) { // 1 minute
                expired.push(id);
            }
        }
        
        for (const id of expired) {
            const correlation = this.correlations.get(id);
            clearTimeout(correlation.timeout);
            this.correlations.delete(id);
            
            this.emit('correlation:expired', { correlationId: id });
        }
        
        return expired.length;
    }
}

module.exports = MessageRouter;