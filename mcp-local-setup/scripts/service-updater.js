/**
 * Service Updater for MCP Platform
 * Handles individual service updates, dependency resolution, and breaking change detection
 */

const fs = require('fs').promises;
const path = require('path');
const semver = require('semver');
const { execSync } = require('child_process');

class ServiceUpdater {
    constructor() {
        this.registryPath = path.join(__dirname, '..', 'registry', 'enhanced-catalog.json');
        this.servicesDir = path.join(__dirname, '..', 'services');
        this.updateDir = path.join(__dirname, '..', 'updates', 'services');
        this.configDir = path.join(__dirname, '..', 'config');
    }

    /**
     * Initialize service updater
     */
    async initialize() {
        await fs.mkdir(this.updateDir, { recursive: true });
    }

    /**
     * Check for service updates
     */
    async checkServiceUpdates(services = []) {
        try {
            // Load service registry
            const registry = await this.loadRegistry();
            const installedServices = await this.getInstalledServices();
            
            const updates = [];

            // If specific services requested, filter to those
            const servicesToCheck = services.length > 0 
                ? services 
                : Object.keys(installedServices);

            for (const serviceName of servicesToCheck) {
                const installed = installedServices[serviceName];
                if (!installed) continue;

                const registryEntry = registry.services[serviceName];
                if (!registryEntry) continue;

                // Check if update is available
                const latestVersion = registryEntry.version;
                const currentVersion = installed.version;

                if (semver.gt(latestVersion, currentVersion)) {
                    const updateInfo = await this.analyzeServiceUpdate(
                        serviceName,
                        currentVersion,
                        latestVersion,
                        registryEntry
                    );
                    updates.push(updateInfo);
                }
            }

            return updates;
        } catch (error) {
            throw new Error(`Failed to check service updates: ${error.message}`);
        }
    }

    /**
     * Update a specific service
     */
    async updateService(service, version, options = {}) {
        try {
            // Validate service exists
            const installed = await this.getInstalledServices();
            if (!installed[service]) {
                throw new Error(`Service ${service} is not installed`);
            }

            // Get update info
            const registry = await this.loadRegistry();
            const serviceEntry = registry.services[service];
            if (!serviceEntry) {
                throw new Error(`Service ${service} not found in registry`);
            }

            // Check version compatibility
            const updateInfo = await this.analyzeServiceUpdate(
                service,
                installed[service].version,
                version,
                serviceEntry
            );

            if (!updateInfo.compatible && !options.force) {
                throw new Error(`Update to ${version} is not compatible due to breaking changes`);
            }

            // Resolve dependencies
            const dependencyUpdates = await this.resolveDependencies(
                service,
                version,
                serviceEntry.dependencies
            );

            // Update dependencies first
            for (const dep of dependencyUpdates) {
                await this.updateService(dep.service, dep.requiredVersion, options);
            }

            // Backup current service
            await this.backupService(service, installed[service].version);

            // Stop service
            await this.stopService(service);

            // Apply update
            await this.applyServiceUpdate(service, version, serviceEntry);

            // Run migration scripts if any
            await this.runMigrations(service, installed[service].version, version);

            // Start service
            await this.startService(service);

            // Verify service is running correctly
            await this.verifyService(service, version);

            return true;
        } catch (error) {
            // Attempt rollback on failure
            try {
                await this.rollbackService(service, installed[service].version);
            } catch (rollbackError) {
                console.error('Rollback failed:', rollbackError);
            }
            throw error;
        }
    }

    /**
     * Analyze service update for compatibility and breaking changes
     */
    async analyzeServiceUpdate(service, currentVersion, targetVersion, registryEntry) {
        const updateInfo = {
            service,
            currentVersion,
            availableVersion: targetVersion,
            changes: [],
            compatible: true,
            breakingChanges: [],
            dependencies: []
        };

        // Get version range
        const versions = await this.getServiceVersions(service);
        const versionsInRange = versions.filter(v => 
            semver.gt(v.version, currentVersion) && 
            semver.lte(v.version, targetVersion)
        );

        // Collect all changes and check for breaking changes
        for (const versionInfo of versionsInRange) {
            if (versionInfo.changes) {
                updateInfo.changes.push(...versionInfo.changes);
            }

            if (versionInfo.breakingChanges) {
                updateInfo.breakingChanges.push(...versionInfo.breakingChanges);
                updateInfo.compatible = false;
            }
        }

        // Check dependency compatibility
        if (registryEntry.dependencies) {
            const depAnalysis = await this.analyzeDependencies(
                service,
                targetVersion,
                registryEntry.dependencies
            );
            updateInfo.dependencies = depAnalysis;

            // Mark as incompatible if any dependency issues
            if (depAnalysis.some(d => !d.compatible)) {
                updateInfo.compatible = false;
            }
        }

        return updateInfo;
    }

    /**
     * Resolve dependencies for a service update
     */
    async resolveDependencies(service, version, dependencies = {}) {
        const required = [];
        const installed = await this.getInstalledServices();

        for (const [depService, depVersionRange] of Object.entries(dependencies)) {
            const installedDep = installed[depService];
            
            if (!installedDep) {
                // Dependency not installed
                required.push({
                    service: depService,
                    requiredVersion: depVersionRange,
                    action: 'install'
                });
            } else if (!semver.satisfies(installedDep.version, depVersionRange)) {
                // Dependency needs update
                const targetVersion = await this.findBestVersion(depService, depVersionRange);
                required.push({
                    service: depService,
                    requiredVersion: targetVersion,
                    action: 'update'
                });
            }
        }

        return required;
    }

    /**
     * Analyze dependencies for compatibility
     */
    async analyzeDependencies(service, version, dependencies) {
        const analysis = [];
        const installed = await this.getInstalledServices();

        for (const [depService, depVersionRange] of Object.entries(dependencies)) {
            const installedDep = installed[depService];
            const depInfo = {
                service: depService,
                requiredVersion: depVersionRange,
                currentVersion: installedDep ? installedDep.version : null,
                compatible: true,
                issue: null
            };

            if (!installedDep) {
                depInfo.compatible = false;
                depInfo.issue = 'Not installed';
            } else if (!semver.satisfies(installedDep.version, depVersionRange)) {
                depInfo.compatible = false;
                depInfo.issue = `Requires ${depVersionRange}, have ${installedDep.version}`;
            }

            analysis.push(depInfo);
        }

        return analysis;
    }

    /**
     * Get installed services and their versions
     */
    async getInstalledServices() {
        const installed = {};
        
        try {
            // Check docker services
            const dockerServices = await this.getDockerServices();
            for (const service of dockerServices) {
                installed[service.name] = {
                    version: service.version,
                    type: 'docker'
                };
            }

            // Check local services
            const localServices = await this.getLocalServices();
            for (const service of localServices) {
                installed[service.name] = {
                    version: service.version,
                    type: 'local'
                };
            }
        } catch (error) {
            console.error('Error getting installed services:', error);
        }

        return installed;
    }

    /**
     * Get Docker services
     */
    async getDockerServices() {
        try {
            const output = execSync('docker ps --format "{{.Names}}"', { encoding: 'utf8' });
            const containers = output.trim().split('\n').filter(Boolean);
            
            const services = [];
            for (const container of containers) {
                if (container.startsWith('mcp-')) {
                    const serviceName = container.replace('mcp-', '');
                    const version = await this.getDockerServiceVersion(container);
                    services.push({ name: serviceName, version });
                }
            }
            
            return services;
        } catch {
            return [];
        }
    }

    /**
     * Get Docker service version
     */
    async getDockerServiceVersion(containerName) {
        try {
            const output = execSync(
                `docker inspect ${containerName} --format '{{.Config.Labels.version}}'`,
                { encoding: 'utf8' }
            );
            return output.trim() || '1.0.0';
        } catch {
            return '1.0.0';
        }
    }

    /**
     * Get local services
     */
    async getLocalServices() {
        const services = [];
        
        // Check package.json in examples directory
        const examplesDir = path.join(__dirname, '..', 'examples');
        try {
            const examples = await fs.readdir(examplesDir);
            
            for (const example of examples) {
                const packagePath = path.join(examplesDir, example, 'package.json');
                try {
                    const packageData = await fs.readFile(packagePath, 'utf8');
                    const packageJson = JSON.parse(packageData);
                    services.push({
                        name: example.replace('-mcp', ''),
                        version: packageJson.version || '1.0.0'
                    });
                } catch {
                    // Skip if no package.json
                }
            }
        } catch {
            // No examples directory
        }
        
        return services;
    }

    /**
     * Load service registry
     */
    async loadRegistry() {
        try {
            const data = await fs.readFile(this.registryPath, 'utf8');
            return JSON.parse(data);
        } catch {
            return { services: {} };
        }
    }

    /**
     * Get service versions from registry or remote
     */
    async getServiceVersions(service) {
        // In a real implementation, this would fetch from a registry
        // For now, return mock version history
        return [
            {
                version: '1.0.0',
                changes: ['Initial release']
            },
            {
                version: '1.1.0',
                changes: ['Added feature X', 'Fixed bug Y']
            },
            {
                version: '2.0.0',
                changes: ['Major rewrite'],
                breakingChanges: ['API changed', 'Config format updated']
            }
        ];
    }

    /**
     * Find best version matching a range
     */
    async findBestVersion(service, versionRange) {
        const versions = await this.getServiceVersions(service);
        const compatible = versions.filter(v => semver.satisfies(v.version, versionRange));
        
        if (compatible.length === 0) {
            throw new Error(`No version of ${service} satisfies ${versionRange}`);
        }
        
        // Return highest compatible version
        return compatible.sort((a, b) => semver.rcompare(a.version, b.version))[0].version;
    }

    /**
     * Backup a service before update
     */
    async backupService(service, version) {
        const backupDir = path.join(this.updateDir, 'backups', service);
        await fs.mkdir(backupDir, { recursive: true });
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(backupDir, `${version}-${timestamp}.tar.gz`);
        
        // Create backup based on service type
        const installed = await this.getInstalledServices();
        if (installed[service].type === 'docker') {
            // Backup Docker volumes and config
            execSync(`docker run --rm -v mcp-${service}-data:/data -v ${backupDir}:/backup alpine tar czf /backup/${path.basename(backupPath)} -C /data .`);
        } else {
            // Backup local service files
            const servicePath = path.join(__dirname, '..', 'examples', `${service}-mcp`);
            execSync(`tar czf ${backupPath} -C ${servicePath} .`);
        }
    }

    /**
     * Stop a service
     */
    async stopService(service) {
        const installed = await this.getInstalledServices();
        
        if (installed[service].type === 'docker') {
            execSync(`docker stop mcp-${service}`, { stdio: 'ignore' });
        } else {
            // Stop local service (would need process management)
            console.log(`Stopping local service ${service}`);
        }
    }

    /**
     * Start a service
     */
    async startService(service) {
        const installed = await this.getInstalledServices();
        
        if (installed[service].type === 'docker') {
            execSync(`docker start mcp-${service}`, { stdio: 'ignore' });
        } else {
            // Start local service
            console.log(`Starting local service ${service}`);
        }
    }

    /**
     * Apply service update
     */
    async applyServiceUpdate(service, version, registryEntry) {
        const installed = await this.getInstalledServices();
        
        if (installed[service].type === 'docker') {
            // Update Docker service
            const imageName = registryEntry.image || `mcp/${service}:${version}`;
            
            // Pull new image
            execSync(`docker pull ${imageName}`);
            
            // Remove old container
            execSync(`docker rm mcp-${service}`, { stdio: 'ignore' });
            
            // Run new container with same config
            const runCommand = this.buildDockerRunCommand(service, imageName, registryEntry);
            execSync(runCommand);
        } else {
            // Update local service
            const servicePath = path.join(__dirname, '..', 'examples', `${service}-mcp`);
            
            // Update package.json version
            const packagePath = path.join(servicePath, 'package.json');
            const packageData = await fs.readFile(packagePath, 'utf8');
            const packageJson = JSON.parse(packageData);
            packageJson.version = version;
            await fs.writeFile(packagePath, JSON.stringify(packageJson, null, 2));
            
            // Run npm update if needed
            if (registryEntry.updateCommand) {
                execSync(registryEntry.updateCommand, { cwd: servicePath });
            }
        }
    }

    /**
     * Build Docker run command for service
     */
    buildDockerRunCommand(service, image, registryEntry) {
        let command = `docker run -d --name mcp-${service}`;
        
        // Add network
        command += ' --network mcp-network';
        
        // Add volumes
        if (registryEntry.volumes) {
            for (const volume of registryEntry.volumes) {
                command += ` -v ${volume}`;
            }
        }
        
        // Add environment variables
        if (registryEntry.environment) {
            for (const [key, value] of Object.entries(registryEntry.environment)) {
                command += ` -e ${key}=${value}`;
            }
        }
        
        // Add labels
        command += ` --label version=${registryEntry.version}`;
        
        // Add image
        command += ` ${image}`;
        
        return command;
    }

    /**
     * Run migration scripts
     */
    async runMigrations(service, fromVersion, toVersion) {
        const migrationsDir = path.join(this.updateDir, 'migrations', service);
        
        try {
            const migrations = await fs.readdir(migrationsDir);
            
            // Filter and sort applicable migrations
            const applicable = migrations
                .filter(m => {
                    const match = m.match(/^(\d+\.\d+\.\d+)-to-(\d+\.\d+\.\d+)\.js$/);
                    if (!match) return false;
                    
                    const [, from, to] = match;
                    return semver.gte(from, fromVersion) && semver.lte(to, toVersion);
                })
                .sort();
            
            // Run migrations in order
            for (const migration of applicable) {
                const migrationPath = path.join(migrationsDir, migration);
                const migrationModule = require(migrationPath);
                await migrationModule.up();
            }
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
            // No migrations directory - that's okay
        }
    }

    /**
     * Verify service is running correctly
     */
    async verifyService(service, version) {
        // Wait for service to start
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        const installed = await this.getInstalledServices();
        
        if (installed[service].type === 'docker') {
            // Check Docker container is running
            const output = execSync(`docker ps --filter name=mcp-${service} --format "{{.Status}}"`, { encoding: 'utf8' });
            if (!output.includes('Up')) {
                throw new Error(`Service ${service} failed to start`);
            }
        }
        
        // Additional health checks could be added here
    }

    /**
     * Rollback a service to previous version
     */
    async rollbackService(service, version) {
        console.log(`Rolling back ${service} to version ${version}`);
        
        // Find latest backup for the version
        const backupDir = path.join(this.updateDir, 'backups', service);
        const backups = await fs.readdir(backupDir);
        const versionBackups = backups.filter(b => b.startsWith(`${version}-`));
        
        if (versionBackups.length === 0) {
            throw new Error(`No backup found for ${service} version ${version}`);
        }
        
        // Use most recent backup
        const latestBackup = versionBackups.sort().reverse()[0];
        const backupPath = path.join(backupDir, latestBackup);
        
        // Stop service
        await this.stopService(service);
        
        // Restore from backup
        const installed = await this.getInstalledServices();
        if (installed[service].type === 'docker') {
            // Restore Docker volumes
            execSync(`docker run --rm -v mcp-${service}-data:/data -v ${backupDir}:/backup alpine tar xzf /backup/${latestBackup} -C /data`);
        } else {
            // Restore local service files
            const servicePath = path.join(__dirname, '..', 'examples', `${service}-mcp`);
            execSync(`tar xzf ${backupPath} -C ${servicePath}`);
        }
        
        // Start service
        await this.startService(service);
    }
}

module.exports = ServiceUpdater;