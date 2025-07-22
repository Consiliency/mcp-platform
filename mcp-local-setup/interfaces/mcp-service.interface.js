/**
 * MCP Service Interface
 * Base interface that all MCP services must implement
 */

class MCPServiceInterface {
    /**
     * Create a new MCP service instance
     * @param {Object} config - Service configuration
     * @param {string} config.name - Service name
     * @param {string} config.version - Service version
     * @param {number} config.port - Service port
     * @param {Object} config.env - Environment variables
     */
    constructor(config) {
        this.name = config.name;
        this.version = config.version;
        this.port = config.port;
        this.env = config.env || {};
        this.server = null;
    }

    /**
     * Start the service
     * @returns {Promise<void>}
     */
    async start() {
        throw new Error('start() method must be implemented');
    }

    /**
     * Stop the service gracefully
     * @returns {Promise<void>}
     */
    async stop() {
        throw new Error('stop() method must be implemented');
    }

    /**
     * Get service health status
     * @returns {Promise<HealthStatus>}
     */
    async health() {
        throw new Error('health() method must be implemented');
    }

    /**
     * Get service manifest for registration
     * @returns {ServiceManifest}
     */
    getManifest() {
        return {
            id: this.name,
            version: this.version,
            port: this.port,
            endpoints: this.getEndpoints(),
            capabilities: this.getCapabilities(),
            requirements: this.getRequirements()
        };
    }

    /**
     * Get service endpoints
     * @returns {Object} Map of endpoint paths to descriptions
     */
    getEndpoints() {
        return {
            '/health': 'Health check endpoint'
        };
    }

    /**
     * Get service capabilities
     * @returns {Array<string>} List of capabilities
     */
    getCapabilities() {
        return [];
    }

    /**
     * Get service requirements
     * @returns {Object} Service requirements
     */
    getRequirements() {
        return {
            env: [],
            dependencies: []
        };
    }
}

module.exports = MCPServiceInterface;