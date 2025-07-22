#!/usr/bin/env node
/**
 * MCP Service Health Monitor
 * Continuous health monitoring with auto-restart capabilities
 */

const EventEmitter = require('events');
const path = require('path');
const fs = require('fs').promises;
const ServiceManager = require('./service-manager');
const ServiceRegistryInterface = require('../registry/service-registry.interface');

class ServiceHealthMonitor extends EventEmitter {
    constructor(config = {}) {
        super();
        
        // Configuration
        this.basePath = config.basePath || process.env.MCP_HOME || path.join(process.env.HOME, '.mcp-platform');
        this.checkInterval = config.checkInterval || 30000; // 30 seconds default
        this.autoRestart = config.autoRestart || false;
        this.maxRestartAttempts = config.maxRestartAttempts || 3;
        this.restartBackoffMultiplier = config.restartBackoffMultiplier || 2;
        this.initialRestartDelay = config.initialRestartDelay || 5000; // 5 seconds
        
        // Internal state
        this.serviceManager = new ServiceManager(this.basePath);
        this.registry = new ServiceRegistryInterface(path.join(this.basePath, 'registry'));
        this.monitoringInterval = null;
        this.serviceStates = new Map();
        this.restartAttempts = new Map();
        this.restartTimeouts = new Map();
        this.isRunning = false;
        this.catalogPath = path.join(this.basePath, 'registry', 'mcp-catalog.json');
    }

    /**
     * Load and initialize service registry
     * @private
     */
    async initializeRegistry() {
        try {
            const data = await fs.readFile(this.catalogPath, 'utf8');
            const catalog = JSON.parse(data);
            
            // Register all services
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
        } catch (error) {
            console.error('Failed to initialize registry:', error.message);
        }
    }

    /**
     * Start monitoring all registered services
     */
    async start() {
        if (this.isRunning) {
            console.log('Health monitor is already running');
            return;
        }

        console.log('Starting service health monitor...');
        console.log(`Check interval: ${this.checkInterval}ms`);
        console.log(`Auto-restart: ${this.autoRestart ? 'enabled' : 'disabled'}`);
        
        if (this.autoRestart) {
            console.log(`Max restart attempts: ${this.maxRestartAttempts}`);
        }

        await this.initializeRegistry();
        this.isRunning = true;
        
        // Initial check
        await this.checkAllServices();
        
        // Set up periodic monitoring
        this.monitoringInterval = setInterval(async () => {
            await this.checkAllServices();
        }, this.checkInterval);

        this.emit('monitor-started');
    }

    /**
     * Stop monitoring
     */
    stop() {
        if (!this.isRunning) {
            console.log('Health monitor is not running');
            return;
        }

        console.log('Stopping service health monitor...');
        
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }

        // Clear any pending restart timeouts
        for (const [serviceId, timeout] of this.restartTimeouts.entries()) {
            clearTimeout(timeout);
        }
        this.restartTimeouts.clear();

        this.isRunning = false;
        this.emit('monitor-stopped');
    }

    /**
     * Check health of all registered services
     * @private
     */
    async checkAllServices() {
        const services = await this.registry.getAllServices();
        
        for (const service of services) {
            await this.checkService(service);
        }
    }

    /**
     * Check health of a single service
     * @private
     * @param {Object} service - Service manifest
     */
    async checkService(service) {
        try {
            const status = await this.serviceManager.getServiceStatus(service.id);
            const previousState = this.serviceStates.get(service.id);
            
            // Update state
            this.serviceStates.set(service.id, status);
            
            // Determine health status
            const isHealthy = this.isServiceHealthy(status, service);
            
            // Emit events based on state changes
            if (previousState) {
                const wasHealthy = this.isServiceHealthy(previousState, service);
                
                if (isHealthy && !wasHealthy) {
                    console.log(`Service ${service.id} is now healthy`);
                    this.emit('service-healthy', {
                        serviceId: service.id,
                        status: status,
                        timestamp: new Date()
                    });
                    
                    // Reset restart attempts on recovery
                    this.restartAttempts.delete(service.id);
                    
                } else if (!isHealthy && wasHealthy) {
                    console.warn(`Service ${service.id} is now unhealthy`);
                    this.emit('service-unhealthy', {
                        serviceId: service.id,
                        status: status,
                        timestamp: new Date()
                    });
                    
                    // Handle auto-restart if enabled
                    if (this.autoRestart && status.status !== 'not_found') {
                        await this.handleUnhealthyService(service.id, status);
                    }
                }
            } else if (!isHealthy) {
                // First check and already unhealthy
                console.warn(`Service ${service.id} is unhealthy on initial check`);
                this.emit('service-unhealthy', {
                    serviceId: service.id,
                    status: status,
                    timestamp: new Date()
                });
                
                if (this.autoRestart && status.status !== 'not_found') {
                    await this.handleUnhealthyService(service.id, status);
                }
            }
            
        } catch (error) {
            console.error(`Error checking service ${service.id}:`, error.message);
        }
    }

    /**
     * Determine if a service is healthy
     * @private
     * @param {Object} status - Service status
     * @param {Object} service - Service manifest
     * @returns {boolean} Is healthy
     */
    isServiceHealthy(status, service) {
        // Not found services are considered unhealthy
        if (status.status === 'not_found') {
            return false;
        }

        // Not running is unhealthy
        if (!status.running) {
            return false;
        }

        // If health check is configured, use it
        if (service.healthCheck && service.healthCheck.enabled) {
            return status.health === 'healthy';
        }

        // Otherwise, running means healthy
        return true;
    }

    /**
     * Handle unhealthy service with auto-restart
     * @private
     * @param {string} serviceId - Service identifier
     * @param {Object} status - Current service status
     */
    async handleUnhealthyService(serviceId, status) {
        // Check if already scheduled for restart
        if (this.restartTimeouts.has(serviceId)) {
            return;
        }

        const attempts = this.restartAttempts.get(serviceId) || 0;
        
        if (attempts >= this.maxRestartAttempts) {
            console.error(`Service ${serviceId} has exceeded maximum restart attempts (${this.maxRestartAttempts})`);
            this.emit('service-restart-failed', {
                serviceId: serviceId,
                attempts: attempts,
                timestamp: new Date()
            });
            return;
        }

        // Calculate backoff delay
        const delay = this.initialRestartDelay * Math.pow(this.restartBackoffMultiplier, attempts);
        
        console.log(`Scheduling restart for ${serviceId} in ${delay}ms (attempt ${attempts + 1}/${this.maxRestartAttempts})`);
        
        const timeout = setTimeout(async () => {
            this.restartTimeouts.delete(serviceId);
            
            try {
                // Check dependencies before restart
                const dependencyIssue = await this.checkDependencyHealth(serviceId);
                if (dependencyIssue) {
                    console.log(`Delaying restart of ${serviceId} due to unhealthy dependency: ${dependencyIssue}`);
                    // Re-schedule the check
                    await this.handleUnhealthyService(serviceId, status);
                    return;
                }

                console.log(`Attempting to restart ${serviceId}...`);
                const success = await this.serviceManager.restartService(serviceId);
                
                if (success) {
                    console.log(`Successfully restarted ${serviceId}`);
                    this.emit('service-restarted', {
                        serviceId: serviceId,
                        attempt: attempts + 1,
                        timestamp: new Date()
                    });
                } else {
                    console.error(`Failed to restart ${serviceId}`);
                    this.restartAttempts.set(serviceId, attempts + 1);
                    
                    // Schedule another attempt if under limit
                    if (attempts + 1 < this.maxRestartAttempts) {
                        await this.handleUnhealthyService(serviceId, status);
                    }
                }
            } catch (error) {
                console.error(`Error restarting ${serviceId}:`, error.message);
                this.restartAttempts.set(serviceId, attempts + 1);
            }
        }, delay);

        this.restartTimeouts.set(serviceId, timeout);
    }

    /**
     * Check if service dependencies are healthy
     * @private
     * @param {string} serviceId - Service identifier
     * @returns {Promise<string|null>} Unhealthy dependency ID or null
     */
    async checkDependencyHealth(serviceId) {
        const dependencies = await this.serviceManager.resolveDependencies(serviceId);
        
        for (const depId of dependencies) {
            const depStatus = this.serviceStates.get(depId);
            if (!depStatus || !depStatus.running) {
                return depId;
            }
        }
        
        return null;
    }

    /**
     * Handle dependency cascade when a service fails
     * @param {string} failedServiceId - Failed service identifier
     */
    async handleDependencyCascade(failedServiceId) {
        console.log(`Handling dependency cascade for failed service: ${failedServiceId}`);
        
        const allServices = await this.registry.getAllServices();
        const affectedServices = [];
        
        // Find all services that depend on the failed service
        for (const service of allServices) {
            const deps = await this.serviceManager.resolveDependencies(service.id);
            if (deps.includes(failedServiceId)) {
                affectedServices.push(service.id);
            }
        }
        
        if (affectedServices.length > 0) {
            console.log(`Services affected by ${failedServiceId} failure: ${affectedServices.join(', ')}`);
            
            this.emit('dependency-cascade', {
                failedService: failedServiceId,
                affectedServices: affectedServices,
                timestamp: new Date()
            });
            
            // Stop affected services to prevent cascading failures
            for (const serviceId of affectedServices) {
                console.log(`Stopping dependent service: ${serviceId}`);
                await this.serviceManager.stopService(serviceId);
            }
        }
    }

    /**
     * Get current monitoring status
     * @returns {Object} Monitoring status
     */
    getStatus() {
        const serviceStatuses = {};
        
        for (const [serviceId, status] of this.serviceStates.entries()) {
            serviceStatuses[serviceId] = {
                ...status,
                restartAttempts: this.restartAttempts.get(serviceId) || 0,
                scheduledForRestart: this.restartTimeouts.has(serviceId)
            };
        }
        
        return {
            isRunning: this.isRunning,
            config: {
                checkInterval: this.checkInterval,
                autoRestart: this.autoRestart,
                maxRestartAttempts: this.maxRestartAttempts
            },
            services: serviceStatuses
        };
    }

    /**
     * Update monitor configuration
     * @param {Object} config - New configuration
     */
    updateConfig(config) {
        if (config.checkInterval !== undefined) {
            this.checkInterval = config.checkInterval;
            if (this.isRunning) {
                // Restart monitoring with new interval
                this.stop();
                this.start();
            }
        }
        
        if (config.autoRestart !== undefined) {
            this.autoRestart = config.autoRestart;
        }
        
        if (config.maxRestartAttempts !== undefined) {
            this.maxRestartAttempts = config.maxRestartAttempts;
        }
        
        console.log('Monitor configuration updated');
    }
}

// CLI interface for testing
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    
    if (!command || command === 'help') {
        console.log('MCP Service Health Monitor');
        console.log('\nUsage:');
        console.log('  service-health-monitor.js run        - Run the health monitor');
        console.log('  service-health-monitor.js run --auto-restart - Run with auto-restart enabled');
        console.log('\nOptions:');
        console.log('  --interval <ms>      - Check interval in milliseconds (default: 30000)');
        console.log('  --max-restarts <n>   - Maximum restart attempts (default: 3)');
        process.exit(0);
    }
    
    if (command === 'run') {
        const config = {
            autoRestart: args.includes('--auto-restart'),
            checkInterval: 30000,
            maxRestartAttempts: 3
        };
        
        // Parse interval option
        const intervalIndex = args.indexOf('--interval');
        if (intervalIndex !== -1 && args[intervalIndex + 1]) {
            config.checkInterval = parseInt(args[intervalIndex + 1]);
        }
        
        // Parse max restarts option
        const maxRestartsIndex = args.indexOf('--max-restarts');
        if (maxRestartsIndex !== -1 && args[maxRestartsIndex + 1]) {
            config.maxRestartAttempts = parseInt(args[maxRestartsIndex + 1]);
        }
        
        const monitor = new ServiceHealthMonitor(config);
        
        // Set up event listeners
        monitor.on('service-healthy', (event) => {
            console.log(`[HEALTHY] ${event.serviceId} at ${event.timestamp.toISOString()}`);
        });
        
        monitor.on('service-unhealthy', (event) => {
            console.warn(`[UNHEALTHY] ${event.serviceId} at ${event.timestamp.toISOString()}`);
        });
        
        monitor.on('service-restarted', (event) => {
            console.log(`[RESTARTED] ${event.serviceId} (attempt ${event.attempt}) at ${event.timestamp.toISOString()}`);
        });
        
        monitor.on('service-restart-failed', (event) => {
            console.error(`[RESTART FAILED] ${event.serviceId} after ${event.attempts} attempts`);
        });
        
        monitor.on('dependency-cascade', (event) => {
            console.warn(`[CASCADE] ${event.failedService} affecting: ${event.affectedServices.join(', ')}`);
        });
        
        // Handle graceful shutdown
        process.on('SIGINT', () => {
            console.log('\nShutting down health monitor...');
            monitor.stop();
            process.exit(0);
        });
        
        process.on('SIGTERM', () => {
            console.log('\nShutting down health monitor...');
            monitor.stop();
            process.exit(0);
        });
        
        // Start monitoring
        await monitor.start();
        
        // Keep the process running
        console.log('Health monitor is running. Press Ctrl+C to stop.');
    } else {
        console.error(`Unknown command: ${command}`);
        process.exit(1);
    }
}

// Export for use by other scripts
module.exports = ServiceHealthMonitor;

// Run CLI if called directly
if (require.main === module) {
    main().catch(console.error);
}