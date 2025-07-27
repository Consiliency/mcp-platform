const EventEmitter = require('events');
const TransportInterface = require('./transport.interface');

/**
 * Transport Bridge Service
 * Manages multiple transport adapters and provides unified interface
 */
class BridgeService extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            port: 3100,
            host: '0.0.0.0',
            healthCheckInterval: 30000,
            ...config
        };
        
        this.transports = new Map();
        this.servers = new Map();
        this.routes = new Map();
        this.healthCheckTimer = null;
    }

    /**
     * Register a transport adapter
     * @param {string} type - Transport type (stdio, http, websocket)
     * @param {TransportInterface} adapter - Transport adapter instance
     */
    registerTransport(type, adapter) {
        if (!(adapter instanceof TransportInterface)) {
            throw new Error(`Transport adapter must extend TransportInterface`);
        }
        
        this.transports.set(type, adapter);
        this.emit('transport:registered', { type, adapter });
        
        console.log(`Registered transport: ${type}`);
    }

    /**
     * Register a server with its transport configuration
     * @param {Object} serverConfig - Server configuration
     */
    registerServer(serverConfig) {
        const { id, transport } = serverConfig;
        
        if (!this.transports.has(transport.type)) {
            throw new Error(`Unknown transport type: ${transport.type}`);
        }
        
        this.servers.set(id, {
            ...serverConfig,
            status: 'registered',
            connections: new Set()
        });
        
        // Create route mapping
        const route = `/mcp/${id}`;
        this.routes.set(route, id);
        
        this.emit('server:registered', serverConfig);
        console.log(`Registered server: ${id} with transport: ${transport.type}`);
    }

    /**
     * Start the bridge service
     */
    async start() {
        console.log('Starting Bridge Service...');
        
        // Initialize all transports
        for (const [type, adapter] of this.transports) {
            try {
                await adapter.initialize();
                await adapter.start();
                console.log(`Started transport: ${type}`);
            } catch (error) {
                console.error(`Failed to start transport ${type}:`, error);
                throw error;
            }
        }
        
        // Start health monitoring
        this.startHealthChecks();
        
        this.emit('bridge:started');
        console.log('Bridge Service started successfully');
    }

    /**
     * Stop the bridge service
     */
    async stop() {
        console.log('Stopping Bridge Service...');
        
        // Stop health checks
        this.stopHealthChecks();
        
        // Stop all servers
        for (const [id, server] of this.servers) {
            if (server.status === 'running') {
                await this.stopServer(id);
            }
        }
        
        // Stop all transports
        for (const [type, adapter] of this.transports) {
            try {
                await adapter.stop();
                console.log(`Stopped transport: ${type}`);
            } catch (error) {
                console.error(`Error stopping transport ${type}:`, error);
            }
        }
        
        this.emit('bridge:stopped');
        console.log('Bridge Service stopped');
    }

    /**
     * Start a specific server
     * @param {string} serverId - Server ID
     */
    async startServer(serverId) {
        const server = this.servers.get(serverId);
        if (!server) {
            throw new Error(`Server not found: ${serverId}`);
        }
        
        if (server.status === 'running') {
            return;
        }
        
        const transport = this.transports.get(server.transport.type);
        if (!transport) {
            throw new Error(`Transport not available: ${server.transport.type}`);
        }
        
        try {
            // Create connection for the server
            const connectionId = await transport.createConnection({
                serverId,
                ...server.transport
            });
            
            server.connections.add(connectionId);
            server.status = 'running';
            server.startedAt = new Date();
            
            // Set up message routing
            transport.onMessage(connectionId, (message) => {
                this.handleServerMessage(serverId, message);
            });
            
            this.emit('server:started', { serverId, connectionId });
            console.log(`Started server: ${serverId} on ${server.transport.type}`);
            
            return connectionId;
            
        } catch (error) {
            server.status = 'error';
            server.error = error.message;
            throw error;
        }
    }

    /**
     * Stop a specific server
     * @param {string} serverId - Server ID
     */
    async stopServer(serverId) {
        const server = this.servers.get(serverId);
        if (!server) {
            throw new Error(`Server not found: ${serverId}`);
        }
        
        if (server.status !== 'running') {
            return;
        }
        
        const transport = this.transports.get(server.transport.type);
        
        try {
            // Close all connections
            for (const connectionId of server.connections) {
                await transport.closeConnection(connectionId);
            }
            
            server.connections.clear();
            server.status = 'stopped';
            server.stoppedAt = new Date();
            
            this.emit('server:stopped', { serverId });
            console.log(`Stopped server: ${serverId}`);
            
        } catch (error) {
            server.status = 'error';
            server.error = error.message;
            throw error;
        }
    }

    /**
     * Get connection info for a connection ID
     * @param {string} connectionId - Connection ID
     * @returns {Object|null} Connection info or null if not found
     */
    getConnection(connectionId) {
        // Check all transports for the connection
        for (const [type, transport] of this.transports) {
            if (transport.processes && transport.processes.has(connectionId)) {
                return transport.processes.get(connectionId);
            }
        }
        return null;
    }

    /**
     * Send message to a server
     * @param {string} serverId - Server ID
     * @param {Object} message - Message to send
     * @returns {Promise<Object>} Response
     */
    async sendToServer(serverId, message) {
        const server = this.servers.get(serverId);
        if (!server) {
            throw new Error(`Server not found: ${serverId}`);
        }
        
        if (server.status !== 'running') {
            throw new Error(`Server not running: ${serverId}`);
        }
        
        const transport = this.transports.get(server.transport.type);
        const connectionId = [...server.connections][0]; // Get first connection
        
        if (!connectionId) {
            throw new Error(`No active connection for server: ${serverId}`);
        }
        
        return await transport.sendMessage(connectionId, message);
    }

    /**
     * Handle incoming message from a server
     * @param {string} serverId - Server ID
     * @param {Object} message - Incoming message
     */
    handleServerMessage(serverId, message) {
        this.emit('server:message', { serverId, message });
        
        // Additional message processing can be added here
        // For example, routing to HTTP clients, logging, etc.
    }

    /**
     * Get server status
     * @param {string} serverId - Server ID
     * @returns {Object} Server status
     */
    getServerStatus(serverId) {
        const server = this.servers.get(serverId);
        if (!server) {
            return null;
        }
        
        return {
            id: server.id,
            name: server.name,
            transport: server.transport.type,
            status: server.status,
            connections: server.connections.size,
            startedAt: server.startedAt,
            error: server.error
        };
    }

    /**
     * Get all servers status
     * @returns {Array} Array of server statuses
     */
    getAllServersStatus() {
        const statuses = [];
        for (const [id, server] of this.servers) {
            statuses.push(this.getServerStatus(id));
        }
        return statuses;
    }

    /**
     * Start health check monitoring
     */
    startHealthChecks() {
        this.healthCheckTimer = setInterval(async () => {
            for (const [id, server] of this.servers) {
                if (server.status === 'running') {
                    try {
                        const transport = this.transports.get(server.transport.type);
                        const health = await transport.getHealth();
                        
                        this.emit('health:check', {
                            serverId: id,
                            health,
                            timestamp: new Date()
                        });
                    } catch (error) {
                        console.error(`Health check failed for ${id}:`, error);
                    }
                }
            }
        }, this.config.healthCheckInterval);
    }

    /**
     * Stop health check monitoring
     */
    stopHealthChecks() {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = null;
        }
    }

    /**
     * Get bridge metrics
     * @returns {Promise<Object>} Bridge metrics
     */
    async getMetrics() {
        const metrics = {
            servers: {
                total: this.servers.size,
                running: 0,
                stopped: 0,
                error: 0
            },
            transports: {},
            uptime: process.uptime()
        };
        
        // Count server states
        for (const [id, server] of this.servers) {
            metrics.servers[server.status]++;
        }
        
        // Get transport metrics
        for (const [type, transport] of this.transports) {
            try {
                metrics.transports[type] = await transport.getMetrics();
            } catch (error) {
                metrics.transports[type] = { error: error.message };
            }
        }
        
        return metrics;
    }

    /**
     * Get available tools from all running servers
     * @returns {Promise<Array>} Array of tools with server information
     */
    async getAvailableTools() {
        const tools = [];
        
        for (const [serverId, server] of this.servers) {
            if (server.status === 'running') {
                try {
                    const response = await this.sendToServer(serverId, {
                        jsonrpc: '2.0',
                        id: `tools_list_${Date.now()}`,
                        method: 'tools/list',
                        params: {}
                    });
                    
                    if (response.result && Array.isArray(response.result.tools)) {
                        for (const tool of response.result.tools) {
                            tools.push({
                                serverId,
                                serverName: server.name,
                                ...tool
                            });
                        }
                    }
                } catch (error) {
                    console.error(`Failed to get tools from ${serverId}:`, error);
                }
            }
        }
        
        return tools;
    }

    /**
     * Route a tool call to the appropriate server
     * @param {string} namespacedToolName - Tool name in format "serverId:toolName"
     * @param {Object} params - Tool parameters
     * @returns {Promise<Object>} Tool response
     */
    async routeToolCall(namespacedToolName, params) {
        const [serverId, ...toolParts] = namespacedToolName.split(':');
        const toolName = toolParts.join(':'); // Handle tools with : in their name
        
        if (!serverId || !toolName) {
            throw new Error(`Invalid namespaced tool name: ${namespacedToolName}`);
        }
        
        const server = this.servers.get(serverId);
        if (!server) {
            throw new Error(`Server not found: ${serverId}`);
        }
        
        if (server.status !== 'running') {
            throw new Error(`Server not running: ${serverId}`);
        }
        
        const message = {
            jsonrpc: '2.0',
            id: `tool_call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            method: 'tools/call',
            params: {
                name: toolName,
                arguments: params
            }
        };
        
        return await this.sendToServer(serverId, message);
    }

    /**
     * Get server by ID
     * @param {string} serverId - Server ID
     * @returns {Object|null} Server configuration
     */
    getServer(serverId) {
        return this.servers.get(serverId) || null;
    }

    /**
     * Check if a server is running
     * @param {string} serverId - Server ID
     * @returns {boolean} True if server is running
     */
    isServerRunning(serverId) {
        const server = this.servers.get(serverId);
        return server && server.status === 'running';
    }
}

module.exports = BridgeService;