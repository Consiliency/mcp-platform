// File: bridge/transports/transport-factory.js
// Purpose: Factory for creating transport instances and Python contract adapter

const StdioTransport = require('./stdio/stdio-transport');
const HttpTransport = require('./http/http-transport');
const WebSocketTransport = require('./websocket/websocket-transport');

class TransportFactory {
    constructor() {
        this.transports = new Map();
        this.transportTypes = {
            stdio: StdioTransport,
            http: HttpTransport,
            websocket: WebSocketTransport,
            sse: HttpTransport // SSE uses HTTP transport
        };
    }

    /**
     * Get or create a transport instance
     * @param {string} type - Transport type (stdio, http, websocket, sse)
     * @returns {TransportInterface} Transport instance
     */
    getTransport(type) {
        if (!this.transportTypes[type]) {
            throw new Error(`Unknown transport type: ${type}`);
        }

        if (!this.transports.has(type)) {
            const TransportClass = this.transportTypes[type];
            const transport = new TransportClass();
            this.transports.set(type, transport);
        }

        return this.transports.get(type);
    }

    /**
     * Initialize all transports
     */
    initializeAll() {
        for (const type of Object.keys(this.transportTypes)) {
            const transport = this.getTransport(type);
            transport.initialize();
        }
    }
}

// Python contract adapter
class TransportContract {
    constructor() {
        this.factory = new TransportFactory();
        this.connections = new Map(); // Map connection ID to transport type
        this.initialized = false;
    }

    /**
     * Initialize the transport adapter
     */
    initialize() {
        this.factory.initializeAll();
        this.initialized = true;
    }

    /**
     * Create a new connection for a server
     * @param {Object} config - Connection configuration
     * @returns {string} Connection ID
     */
    async create_connection(config) {
        if (!this.initialized) {
            throw new Error('Transport not initialized');
        }

        // Determine transport type from config
        let transportType;
        if (config.command) {
            transportType = 'stdio';
        } else if (config.url) {
            if (config.url.startsWith('ws://') || config.url.startsWith('wss://')) {
                transportType = 'websocket';
            } else if (config.transport === 'sse') {
                transportType = 'sse';
            } else {
                transportType = 'http';
            }
        } else {
            throw new Error('Invalid config: must specify either command or url');
        }

        const transport = this.factory.getTransport(transportType);
        const connectionId = await transport.createConnection(config);
        
        // Track which transport owns this connection
        this.connections.set(connectionId, transportType);
        
        return connectionId;
    }

    /**
     * Send a message through the transport
     * @param {string} connection_id - Connection identifier
     * @param {Object} message - JSON-RPC 2.0 message
     * @returns {Object} Response message
     */
    async send_message(connection_id, message) {
        const transportType = this.connections.get(connection_id);
        if (!transportType) {
            throw new Error(`Connection ${connection_id} not found`);
        }

        const transport = this.factory.getTransport(transportType);
        return await transport.sendMessage(connection_id, message);
    }

    /**
     * Close a connection
     * @param {string} connection_id - Connection identifier
     */
    close_connection(connection_id) {
        const transportType = this.connections.get(connection_id);
        if (!transportType) {
            return; // Already closed or doesn't exist
        }

        const transport = this.factory.getTransport(transportType);
        transport.closeConnection(connection_id);
        
        this.connections.delete(connection_id);
    }

    /**
     * Get connection status
     * @param {string} connection_id - Connection identifier
     * @returns {Object} Status dictionary
     */
    get_status(connection_id) {
        const transportType = this.connections.get(connection_id);
        if (!transportType) {
            return {
                status: 'unknown',
                uptime: 0,
                metrics: {}
            };
        }

        const transport = this.factory.getTransport(transportType);
        return transport.getStatus(connection_id);
    }
}

module.exports = { TransportFactory, TransportContract };