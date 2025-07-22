#!/usr/bin/env node
/**
 * MCP Service Manager
 * Manages individual service lifecycle with dependency resolution
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs').promises;
const execAsync = promisify(exec);
const ServiceRegistryInterface = require('../registry/service-registry.interface');

class ServiceManager {
    constructor(basePath) {
        this.basePath = basePath || process.env.MCP_HOME || path.join(process.env.HOME, '.mcp-platform');
        this.projectRoot = path.join(__dirname, '..');
        this.registry = new ServiceRegistryInterface(path.join(this.basePath, 'registry'));
        this.defaultTimeout = 30000; // 30 seconds
        this.catalogPath = path.join(this.basePath, 'registry', 'mcp-catalog.json');
    }

    /**
     * Load service catalog
     * @private
     * @returns {Promise<Object>} Catalog data
     */
    async loadCatalog() {
        try {
            const data = await fs.readFile(this.catalogPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('Failed to load catalog:', error.message);
            return null;
        }
    }

    /**
     * Initialize registry with catalog data
     * @private
     */
    async initializeRegistry() {
        const catalog = await this.loadCatalog();
        if (!catalog) return;

        // Register all services with their dependencies
        for (const server of catalog.servers) {
            const manifest = {
                id: server.id,
                version: server.source.version || 'latest',
                port: server.config.port,
                dependencies: server.dependencies || [],
                lifecycle: server.lifecycle || {},
                healthCheck: server.healthCheck || {}
            };
            await this.registry.registerService(manifest);
        }
    }

    /**
     * Execute docker-compose command
     * @private
     * @param {string} command - Docker compose command
     * @returns {Promise<string>} Command output
     */
    async dockerCompose(command) {
        try {
            const { stdout, stderr } = await execAsync(
                `docker-compose -f ${path.join(this.projectRoot, 'docker-compose.yml')} ${command}`,
                { cwd: this.projectRoot }
            );
            if (stderr && !stderr.includes('WARNING')) {
                console.error('Docker Compose stderr:', stderr);
            }
            return stdout;
        } catch (error) {
            throw new Error(`Docker Compose failed: ${error.message}`);
        }
    }

    /**
     * Get current service status from Docker
     * @param {string} serviceId - Service identifier
     * @returns {Promise<Object>} Service status
     */
    async getServiceStatus(serviceId) {
        try {
            const output = await this.dockerCompose(`ps --format json ${serviceId}`);
            if (!output.trim()) {
                return {
                    id: serviceId,
                    status: 'not_found',
                    running: false,
                    health: 'unknown'
                };
            }

            const services = output.trim().split('\n').map(line => JSON.parse(line));
            const service = services.find(s => s.Service === serviceId);
            
            if (!service) {
                return {
                    id: serviceId,
                    status: 'not_found',
                    running: false,
                    health: 'unknown'
                };
            }

            return {
                id: serviceId,
                status: service.State,
                running: service.State === 'running',
                health: service.Health || 'none',
                exitCode: service.ExitCode,
                publishers: service.Publishers || []
            };
        } catch (error) {
            console.error(`Failed to get status for ${serviceId}:`, error.message);
            return {
                id: serviceId,
                status: 'error',
                running: false,
                health: 'unknown',
                error: error.message
            };
        }
    }

    /**
     * Resolve service dependencies in start order
     * @param {string} serviceId - Service identifier
     * @returns {Promise<Array<string>>} Ordered list of dependencies
     */
    async resolveDependencies(serviceId) {
        await this.initializeRegistry();
        return await this.registry.getServiceDependencies(serviceId);
    }

    /**
     * Start a service with all its dependencies
     * @param {string} serviceId - Service identifier
     * @returns {Promise<boolean>} Success status
     */
    async startWithDependencies(serviceId) {
        console.log(`Resolving dependencies for ${serviceId}...`);
        
        const dependencies = await this.resolveDependencies(serviceId);
        const allServices = [...dependencies, serviceId];
        
        console.log(`Starting services in order: ${allServices.join(' -> ')}`);
        
        for (const service of allServices) {
            const status = await this.getServiceStatus(service);
            if (status.running) {
                console.log(`Service ${service} is already running`);
                continue;
            }
            
            const success = await this.startService(service);
            if (!success) {
                console.error(`Failed to start dependency ${service}`);
                return false;
            }
        }
        
        return true;
    }

    /**
     * Start an individual service
     * @param {string} serviceId - Service identifier
     * @returns {Promise<boolean>} Success status
     */
    async startService(serviceId) {
        try {
            console.log(`Starting service: ${serviceId}`);
            
            await this.dockerCompose(`up -d ${serviceId}`);
            
            // Wait for service to be running
            let attempts = 0;
            const maxAttempts = 10;
            
            while (attempts < maxAttempts) {
                const status = await this.getServiceStatus(serviceId);
                if (status.running) {
                    console.log(`Service ${serviceId} started successfully`);
                    return true;
                }
                
                if (status.status === 'exited' && status.exitCode !== 0) {
                    console.error(`Service ${serviceId} exited with code ${status.exitCode}`);
                    return false;
                }
                
                attempts++;
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            console.error(`Service ${serviceId} failed to start within timeout`);
            return false;
        } catch (error) {
            console.error(`Failed to start ${serviceId}:`, error.message);
            return false;
        }
    }

    /**
     * Stop services that depend on the given service
     * @param {string} serviceId - Service identifier
     * @returns {Promise<Array<string>>} List of stopped services
     */
    async stopDependents(serviceId) {
        await this.initializeRegistry();
        const allServices = await this.registry.getAllServices();
        const dependents = [];
        
        // Find all services that depend on this one
        for (const service of allServices) {
            const deps = await this.resolveDependencies(service.id);
            if (deps.includes(serviceId)) {
                dependents.push(service.id);
            }
        }
        
        if (dependents.length > 0) {
            console.log(`Found dependent services: ${dependents.join(', ')}`);
            for (const dependent of dependents) {
                await this.stopService(dependent);
            }
        }
        
        return dependents;
    }

    /**
     * Stop a service with graceful shutdown
     * @param {string} serviceId - Service identifier
     * @param {number} timeout - Shutdown timeout in milliseconds
     * @returns {Promise<boolean>} Success status
     */
    async stopService(serviceId, timeout = this.defaultTimeout) {
        try {
            console.log(`Stopping service: ${serviceId}`);
            
            const status = await this.getServiceStatus(serviceId);
            if (!status.running) {
                console.log(`Service ${serviceId} is not running`);
                return true;
            }
            
            // Stop with timeout
            const timeoutSeconds = Math.floor(timeout / 1000);
            await this.dockerCompose(`stop -t ${timeoutSeconds} ${serviceId}`);
            
            console.log(`Service ${serviceId} stopped successfully`);
            return true;
        } catch (error) {
            console.error(`Failed to stop ${serviceId}:`, error.message);
            return false;
        }
    }

    /**
     * Restart a service with health check verification
     * @param {string} serviceId - Service identifier
     * @returns {Promise<boolean>} Success status
     */
    async restartService(serviceId) {
        console.log(`Restarting service: ${serviceId}`);
        
        // Stop the service
        const stopSuccess = await this.stopService(serviceId);
        if (!stopSuccess) {
            console.error(`Failed to stop ${serviceId} for restart`);
            return false;
        }
        
        // Wait a moment before starting
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Start the service
        const startSuccess = await this.startService(serviceId);
        if (!startSuccess) {
            console.error(`Failed to start ${serviceId} after stop`);
            return false;
        }
        
        // Verify health if health check is configured
        await this.initializeRegistry();
        const services = await this.registry.getAllServices();
        const service = services.find(s => s.id === serviceId);
        
        if (service && service.healthCheck && service.healthCheck.enabled) {
            console.log(`Waiting for ${serviceId} to be healthy...`);
            
            let healthAttempts = 0;
            const maxHealthAttempts = 30;
            
            while (healthAttempts < maxHealthAttempts) {
                const status = await this.getServiceStatus(serviceId);
                if (status.health === 'healthy') {
                    console.log(`Service ${serviceId} is healthy`);
                    return true;
                }
                
                healthAttempts++;
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            
            console.warn(`Service ${serviceId} restarted but health check timeout`);
        }
        
        return true;
    }

    /**
     * Display formatted service status
     * @param {string} serviceId - Service identifier
     */
    async displayStatus(serviceId) {
        const status = await this.getServiceStatus(serviceId);
        
        console.log(`\nService: ${serviceId}`);
        console.log(`Status: ${status.status}`);
        console.log(`Running: ${status.running ? 'Yes' : 'No'}`);
        console.log(`Health: ${status.health}`);
        
        if (status.exitCode !== undefined && status.exitCode !== 0) {
            console.log(`Exit Code: ${status.exitCode}`);
        }
        
        if (status.publishers && status.publishers.length > 0) {
            console.log('Published Ports:');
            status.publishers.forEach(pub => {
                console.log(`  - ${pub.PublishedPort} -> ${pub.TargetPort}/${pub.Protocol}`);
            });
        }
        
        if (status.error) {
            console.log(`Error: ${status.error}`);
        }
    }
}

// CLI interface
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    const serviceId = args[1];
    
    if (!command) {
        console.log('MCP Service Manager');
        console.log('\nUsage:');
        console.log('  service-manager.js start <service>    - Start a service');
        console.log('  service-manager.js stop <service>     - Stop a service');
        console.log('  service-manager.js restart <service>  - Restart a service');
        console.log('  service-manager.js status <service>   - Get service status');
        console.log('\nOptions:');
        console.log('  start --with-deps                     - Start with all dependencies');
        console.log('  stop --stop-deps                      - Stop dependent services first');
        process.exit(0);
    }
    
    if (!serviceId && command !== 'help') {
        console.error(`Error: Service ID required for '${command}' command`);
        process.exit(1);
    }
    
    const manager = new ServiceManager();
    
    try {
        switch (command) {
            case 'start':
                if (args.includes('--with-deps')) {
                    const success = await manager.startWithDependencies(serviceId);
                    process.exit(success ? 0 : 1);
                } else {
                    const success = await manager.startService(serviceId);
                    process.exit(success ? 0 : 1);
                }
                break;
                
            case 'stop':
                if (args.includes('--stop-deps')) {
                    await manager.stopDependents(serviceId);
                }
                const stopSuccess = await manager.stopService(serviceId);
                process.exit(stopSuccess ? 0 : 1);
                break;
                
            case 'restart':
                const restartSuccess = await manager.restartService(serviceId);
                process.exit(restartSuccess ? 0 : 1);
                break;
                
            case 'status':
                await manager.displayStatus(serviceId);
                break;
                
            default:
                console.error(`Unknown command: ${command}`);
                process.exit(1);
        }
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

// Export for use by other scripts
module.exports = ServiceManager;

// Run CLI if called directly
if (require.main === module) {
    main().catch(console.error);
}