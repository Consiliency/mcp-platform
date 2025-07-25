/**
 * Service Registry Interface
 * Extended functionality for service registration and dependency management
 * Now includes transport type metadata and discovery
 */

const TransportDetector = require('./transport-detector');
const TransportValidator = require('./validators/transport-validator');

class ServiceRegistryInterface {
    constructor(registryPath) {
        this.registryPath = registryPath;
        this.services = new Map();
        this.dependencies = new Map();
        this.transports = new Map();
        this.transportValidator = new TransportValidator();
    }

    /**
     * Register a new service
     * @param {ServiceManifest} manifest - Service manifest
     * @returns {Promise<boolean>} Registration success
     */
    async registerService(manifest) {
        if (!manifest.id || !manifest.version) {
            throw new Error('Service manifest must include id and version');
        }

        // Validate transport configuration if present
        if (manifest.transport) {
            const validation = this.transportValidator.validateService(manifest);
            if (!validation.valid) {
                throw new Error(`Invalid transport configuration: ${validation.errors.map(e => e.message).join(', ')}`);
            }
        } else {
            // Auto-detect transport if not specified
            const detection = TransportDetector.detect(manifest);
            manifest.transport = detection.suggestedConfig;
        }

        this.services.set(manifest.id, manifest);
        
        if (manifest.dependencies) {
            this.dependencies.set(manifest.id, manifest.dependencies);
        }

        // Store transport metadata
        this.transports.set(manifest.id, {
            type: manifest.transport.type,
            config: manifest.transport[manifest.transport.type],
            autoDetected: !manifest.transport.autoDetect === false
        });

        return true;
    }

    /**
     * Get service dependencies
     * @param {string} serviceId - Service identifier
     * @returns {Promise<Array<string>>} Ordered list of dependencies
     */
    async getServiceDependencies(serviceId) {
        const visited = new Set();
        const result = [];

        const visit = (id) => {
            if (visited.has(id)) return;
            visited.add(id);

            const deps = this.dependencies.get(id) || [];
            for (const dep of deps) {
                visit(dep);
            }

            result.push(id);
        };

        visit(serviceId);
        result.pop(); // Remove the service itself
        return result;
    }

    /**
     * Validate version compatibility
     * @param {string} serviceId - Service identifier
     * @param {string} version - Version to check
     * @returns {Promise<CompatibilityResult>} Compatibility check result
     */
    async validateCompatibility(serviceId, version) {
        const service = this.services.get(serviceId);
        if (!service) {
            return {
                compatible: false,
                reason: 'Service not found in registry'
            };
        }

        // Simple semver-like compatibility check
        const [serviceMajor] = service.version.split('.');
        const [checkMajor] = version.split('.');

        if (serviceMajor !== checkMajor) {
            return {
                compatible: false,
                reason: `Major version mismatch: ${service.version} vs ${version}`
            };
        }

        return {
            compatible: true,
            reason: 'Versions are compatible'
        };
    }

    /**
     * Get all registered services
     * @returns {Promise<Array<ServiceManifest>>} List of all services
     */
    async getAllServices() {
        return Array.from(this.services.values());
    }

    /**
     * Remove a service from registry
     * @param {string} serviceId - Service identifier
     * @returns {Promise<boolean>} Removal success
     */
    async unregisterService(serviceId) {
        this.services.delete(serviceId);
        this.dependencies.delete(serviceId);
        return true;
    }

    /**
     * Check for circular dependencies
     * @param {string} serviceId - Service to check
     * @returns {Promise<boolean>} True if circular dependency exists
     */
    async hasCircularDependency(serviceId) {
        const visited = new Set();
        const recursionStack = new Set();

        const hasCircular = (id) => {
            visited.add(id);
            recursionStack.add(id);

            const deps = this.dependencies.get(id) || [];
            for (const dep of deps) {
                if (!visited.has(dep)) {
                    if (hasCircular(dep)) return true;
                } else if (recursionStack.has(dep)) {
                    return true;
                }
            }

            recursionStack.delete(id);
            return false;
        };

        return hasCircular(serviceId);
    }

    /**
     * Get service transport information
     * @param {string} serviceId - Service identifier
     * @returns {Promise<TransportInfo>} Transport configuration
     */
    async getServiceTransport(serviceId) {
        const service = this.services.get(serviceId);
        if (!service) {
            throw new Error(`Service ${serviceId} not found in registry`);
        }

        const transportInfo = this.transports.get(serviceId);
        if (!transportInfo) {
            // Auto-detect if not stored
            const detection = TransportDetector.detect(service);
            return {
                type: detection.type,
                config: detection.suggestedConfig[detection.type],
                autoDetected: true,
                confidence: detection.confidence
            };
        }

        return transportInfo;
    }

    /**
     * Get services by transport type
     * @param {string} transportType - Transport type (stdio, http, websocket, sse)
     * @returns {Promise<Array<ServiceManifest>>} Services using this transport
     */
    async getServicesByTransport(transportType) {
        const services = [];
        
        for (const [serviceId, transport] of this.transports) {
            if (transport.type === transportType) {
                const service = this.services.get(serviceId);
                if (service) {
                    services.push(service);
                }
            }
        }

        return services;
    }

    /**
     * Validate transport compatibility between services
     * @param {string} clientServiceId - Client service ID
     * @param {string} serverServiceId - Server service ID
     * @returns {Promise<TransportCompatibility>} Compatibility result
     */
    async validateTransportCompatibility(clientServiceId, serverServiceId) {
        const clientTransport = await this.getServiceTransport(clientServiceId);
        const serverTransport = await this.getServiceTransport(serverServiceId);

        // Basic compatibility rules
        const compatible = {
            'stdio': ['stdio'],
            'http': ['http', 'sse'],
            'websocket': ['websocket'],
            'sse': ['sse', 'http']
        };

        const isCompatible = compatible[clientTransport.type]?.includes(serverTransport.type) || false;

        return {
            compatible: isCompatible,
            clientTransport: clientTransport.type,
            serverTransport: serverTransport.type,
            reason: isCompatible 
                ? 'Transport types are compatible' 
                : `${clientTransport.type} client cannot connect to ${serverTransport.type} server`
        };
    }

    /**
     * Update service transport configuration
     * @param {string} serviceId - Service identifier
     * @param {Object} transportConfig - New transport configuration
     * @returns {Promise<boolean>} Update success
     */
    async updateServiceTransport(serviceId, transportConfig) {
        const service = this.services.get(serviceId);
        if (!service) {
            throw new Error(`Service ${serviceId} not found in registry`);
        }

        // Validate new transport configuration
        const tempService = { ...service, transport: transportConfig };
        const validation = this.transportValidator.validateService(tempService);
        if (!validation.valid) {
            throw new Error(`Invalid transport configuration: ${validation.errors.map(e => e.message).join(', ')}`);
        }

        // Update service
        service.transport = transportConfig;
        this.services.set(serviceId, service);

        // Update transport metadata
        this.transports.set(serviceId, {
            type: transportConfig.type,
            config: transportConfig[transportConfig.type],
            autoDetected: false
        });

        return true;
    }

    /**
     * Get transport statistics
     * @returns {Promise<TransportStats>} Transport usage statistics
     */
    async getTransportStats() {
        const stats = {
            total: this.services.size,
            byType: {
                stdio: 0,
                http: 0,
                websocket: 0,
                sse: 0
            },
            autoDetected: 0,
            validated: 0
        };

        for (const [serviceId, transport] of this.transports) {
            stats.byType[transport.type]++;
            if (transport.autoDetected) {
                stats.autoDetected++;
            }
        }

        stats.validated = stats.total - stats.autoDetected;

        return stats;
    }
}

/**
 * @typedef {Object} ServiceManifest
 * @property {string} id - Service identifier
 * @property {string} version - Service version
 * @property {number} port - Service port
 * @property {Array<string>} [dependencies] - Service dependencies
 * @property {Object} [lifecycle] - Lifecycle configuration
 * @property {Object} [healthCheck] - Health check configuration
 * @property {Object} transport - Transport configuration
 * @property {string} transport.type - Transport type (stdio, http, websocket, sse)
 * @property {Object} [transport.stdio] - stdio transport configuration
 * @property {Object} [transport.http] - HTTP transport configuration
 * @property {Object} [transport.websocket] - WebSocket transport configuration
 * @property {Object} [transport.sse] - SSE transport configuration
 * @property {boolean} [transport.autoDetect] - Enable auto-detection
 */

/**
 * @typedef {Object} CompatibilityResult
 * @property {boolean} compatible - Whether versions are compatible
 * @property {string} reason - Explanation of compatibility status
 */

/**
 * @typedef {Object} TransportInfo
 * @property {string} type - Transport type
 * @property {Object} config - Transport-specific configuration
 * @property {boolean} autoDetected - Whether transport was auto-detected
 * @property {number} [confidence] - Detection confidence (0-100)
 */

/**
 * @typedef {Object} TransportCompatibility
 * @property {boolean} compatible - Whether transports are compatible
 * @property {string} clientTransport - Client transport type
 * @property {string} serverTransport - Server transport type
 * @property {string} reason - Explanation of compatibility
 */

/**
 * @typedef {Object} TransportStats
 * @property {number} total - Total number of services
 * @property {Object} byType - Services count by transport type
 * @property {number} autoDetected - Number of auto-detected transports
 * @property {number} validated - Number of explicitly configured transports
 */

module.exports = ServiceRegistryInterface;