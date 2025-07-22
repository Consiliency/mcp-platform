/**
 * Service Registry Interface
 * Extended functionality for service registration and dependency management
 */

class ServiceRegistryInterface {
    constructor(registryPath) {
        this.registryPath = registryPath;
        this.services = new Map();
        this.dependencies = new Map();
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

        this.services.set(manifest.id, manifest);
        
        if (manifest.dependencies) {
            this.dependencies.set(manifest.id, manifest.dependencies);
        }

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
}

/**
 * @typedef {Object} ServiceManifest
 * @property {string} id - Service identifier
 * @property {string} version - Service version
 * @property {number} port - Service port
 * @property {Array<string>} [dependencies] - Service dependencies
 * @property {Object} [lifecycle] - Lifecycle configuration
 * @property {Object} [healthCheck] - Health check configuration
 */

/**
 * @typedef {Object} CompatibilityResult
 * @property {boolean} compatible - Whether versions are compatible
 * @property {string} reason - Explanation of compatibility status
 */

module.exports = ServiceRegistryInterface;