/**
 * Update Manager for MCP Platform
 * Implements platform version checking, automatic update downloads, and rollback capabilities
 */

const UpdateInterface = require('../interfaces/update.interface');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const { pipeline } = require('stream/promises');
const { createWriteStream, createReadStream } = require('fs');
const tar = require('tar');
const semver = require('semver');
const cron = require('node-cron');

class UpdateManager extends UpdateInterface {
    constructor() {
        super();
        this.updateDir = path.join(__dirname, '..', 'updates');
        this.metadataFile = path.join(this.updateDir, 'metadata.json');
        this.historyFile = path.join(this.updateDir, 'history.json');
        this.configFile = path.join(this.updateDir, 'config.json');
        this.currentUpdateStatus = null;
        this.autoUpdateTask = null;
    }

    /**
     * Initialize the update manager
     */
    async initialize() {
        // Ensure update directory exists
        await fs.mkdir(this.updateDir, { recursive: true });
        
        // Initialize metadata if not exists
        if (!await this.fileExists(this.metadataFile)) {
            await this.saveMetadata({
                currentVersion: '1.0.0',
                lastCheck: null,
                availableUpdates: []
            });
        }

        // Initialize history if not exists
        if (!await this.fileExists(this.historyFile)) {
            await this.saveHistory([]);
        }

        // Initialize config if not exists
        if (!await this.fileExists(this.configFile)) {
            await this.saveConfig({
                enabled: false,
                channel: 'stable',
                schedule: '0 3 * * 0',
                downloadOnly: false
            });
        }

        // Load and apply auto-update configuration
        const config = await this.loadConfig();
        if (config.enabled) {
            this.scheduleAutoUpdate(config);
        }
    }

    /**
     * Get current platform version
     */
    async getCurrentVersion() {
        const metadata = await this.loadMetadata();
        return metadata.currentVersion;
    }

    /**
     * Check for available updates
     */
    async checkForUpdates(options = {}) {
        const { channel = 'stable', includeServices = false, includeBeta = false } = options;
        
        try {
            // Update last check timestamp
            const metadata = await this.loadMetadata();
            metadata.lastCheck = new Date().toISOString();
            
            // Fetch available updates from update server
            const updates = await this.fetchAvailableUpdates(channel, includeBeta);
            
            // Filter updates based on current version
            const currentVersion = metadata.currentVersion;
            const applicableUpdates = updates.filter(update => {
                return semver.gt(update.version, currentVersion) &&
                       this.meetsRequirements(update.requirements);
            });

            // Sort by version descending
            applicableUpdates.sort((a, b) => semver.rcompare(a.version, b.version));

            metadata.availableUpdates = applicableUpdates;
            await this.saveMetadata(metadata);

            return applicableUpdates;
        } catch (error) {
            throw new Error(`Failed to check for updates: ${error.message}`);
        }
    }

    /**
     * Download an update
     */
    async downloadUpdate(version, options = {}) {
        const { onProgress, verify = true } = options;
        
        try {
            // Find update info
            const metadata = await this.loadMetadata();
            const updateInfo = metadata.availableUpdates.find(u => u.version === version);
            
            if (!updateInfo) {
                throw new Error(`Update version ${version} not found`);
            }

            // Set download status
            this.currentUpdateStatus = {
                updateId: `update-${version}-${Date.now()}`,
                status: 'downloading',
                progress: 0,
                startedAt: new Date()
            };

            // Download update package
            const downloadPath = path.join(this.updateDir, `mcp-update-${version}.tar.gz`);
            await this.downloadFile(updateInfo.downloadUrl, downloadPath, updateInfo.size, onProgress);

            // Verify checksum if requested
            if (verify) {
                const isValid = await this.verifyUpdate(downloadPath, updateInfo.checksum);
                if (!isValid) {
                    await fs.unlink(downloadPath);
                    throw new Error('Update verification failed: checksum mismatch');
                }
            }

            this.currentUpdateStatus.status = 'ready';
            this.currentUpdateStatus.progress = 100;

            return downloadPath;
        } catch (error) {
            this.currentUpdateStatus = {
                ...this.currentUpdateStatus,
                status: 'failed',
                error: error.message,
                completedAt: new Date()
            };
            throw error;
        }
    }

    /**
     * Apply an update
     */
    async applyUpdate(version, options = {}) {
        const { backup = true, dryRun = false, force = false } = options;
        
        try {
            const metadata = await this.loadMetadata();
            const currentVersion = metadata.currentVersion;

            // Check if downgrade without force
            if (!force && semver.lt(version, currentVersion)) {
                throw new Error('Downgrade not allowed without force flag');
            }

            // Find update info
            const updateInfo = metadata.availableUpdates.find(u => u.version === version);
            if (!updateInfo && !force) {
                throw new Error(`Update version ${version} not found in available updates`);
            }

            const updatePath = path.join(this.updateDir, `mcp-update-${version}.tar.gz`);
            if (!await this.fileExists(updatePath)) {
                throw new Error(`Update package not found: ${updatePath}`);
            }

            // Set applying status
            this.currentUpdateStatus = {
                updateId: `update-${version}-${Date.now()}`,
                status: 'applying',
                progress: 0,
                startedAt: new Date()
            };

            // Create backup if requested
            if (backup) {
                await this.createBackup(currentVersion);
                this.currentUpdateStatus.progress = 20;
            }

            if (dryRun) {
                // Simulate update process
                await this.simulateUpdate(version, updatePath);
                this.currentUpdateStatus.status = 'complete';
                this.currentUpdateStatus.progress = 100;
                this.currentUpdateStatus.completedAt = new Date();
                return true;
            }

            // Apply the update
            await this.extractUpdate(updatePath, version);
            this.currentUpdateStatus.progress = 60;

            // Run update scripts
            await this.runUpdateScripts(version);
            this.currentUpdateStatus.progress = 80;

            // Update metadata
            metadata.currentVersion = version;
            await this.saveMetadata(metadata);

            // Add to history
            await this.addToHistory({
                version,
                installedAt: new Date(),
                installedBy: 'system',
                previousVersion: currentVersion,
                success: true
            });

            this.currentUpdateStatus.status = 'complete';
            this.currentUpdateStatus.progress = 100;
            this.currentUpdateStatus.completedAt = new Date();

            return true;
        } catch (error) {
            this.currentUpdateStatus = {
                ...this.currentUpdateStatus,
                status: 'failed',
                error: error.message,
                completedAt: new Date()
            };

            // Add failed update to history
            await this.addToHistory({
                version,
                installedAt: new Date(),
                installedBy: 'system',
                previousVersion: metadata.currentVersion,
                success: false,
                notes: error.message
            });

            throw error;
        }
    }

    /**
     * Rollback to a previous version
     */
    async rollback(version, options = {}) {
        const { keepData = true, force = false } = options;
        
        try {
            const metadata = await this.loadMetadata();
            const currentVersion = metadata.currentVersion;

            // Check if version exists in backups
            const backupPath = path.join(this.updateDir, 'backups', `backup-${version}.tar.gz`);
            if (!await this.fileExists(backupPath)) {
                throw new Error(`No backup found for version ${version}`);
            }

            // Check compatibility unless forced
            if (!force && !this.isCompatibleVersion(version, currentVersion)) {
                throw new Error(`Incompatible version ${version} for rollback`);
            }

            // Perform rollback
            this.currentUpdateStatus = {
                updateId: `rollback-${version}-${Date.now()}`,
                status: 'applying',
                progress: 0,
                startedAt: new Date()
            };

            // Backup current state if keeping data
            if (keepData) {
                await this.backupUserData();
                this.currentUpdateStatus.progress = 20;
            }

            // Restore from backup
            await this.restoreBackup(backupPath, version);
            this.currentUpdateStatus.progress = 60;

            // Restore user data if kept
            if (keepData) {
                await this.restoreUserData();
                this.currentUpdateStatus.progress = 80;
            }

            // Update metadata
            metadata.currentVersion = version;
            await this.saveMetadata(metadata);

            // Add to history
            await this.addToHistory({
                version,
                installedAt: new Date(),
                installedBy: 'system',
                previousVersion: currentVersion,
                success: true,
                rollbackVersion: currentVersion,
                notes: 'Rollback operation'
            });

            this.currentUpdateStatus.status = 'complete';
            this.currentUpdateStatus.progress = 100;
            this.currentUpdateStatus.completedAt = new Date();

            return true;
        } catch (error) {
            this.currentUpdateStatus = {
                ...this.currentUpdateStatus,
                status: 'failed',
                error: error.message,
                completedAt: new Date()
            };
            throw error;
        }
    }

    /**
     * Get update history
     */
    async getUpdateHistory(filter = {}) {
        const { limit, startDate, endDate } = filter;
        
        let history = await this.loadHistory();

        // Apply filters
        if (startDate) {
            history = history.filter(entry => new Date(entry.installedAt) >= startDate);
        }

        if (endDate) {
            history = history.filter(entry => new Date(entry.installedAt) <= endDate);
        }

        // Sort by date descending
        history.sort((a, b) => new Date(b.installedAt) - new Date(a.installedAt));

        // Apply limit
        if (limit) {
            history = history.slice(0, limit);
        }

        // Convert dates
        return history.map(entry => ({
            ...entry,
            installedAt: new Date(entry.installedAt)
        }));
    }

    /**
     * Check for service updates
     */
    async checkServiceUpdates(services = []) {
        // This will be implemented in service-updater.js
        const ServiceUpdater = require('./service-updater');
        const serviceUpdater = new ServiceUpdater();
        return serviceUpdater.checkServiceUpdates(services);
    }

    /**
     * Update a specific service
     */
    async updateService(service, version, options) {
        // This will be implemented in service-updater.js
        const ServiceUpdater = require('./service-updater');
        const serviceUpdater = new ServiceUpdater();
        return serviceUpdater.updateService(service, version, options);
    }

    /**
     * Get current update status
     */
    async getUpdateStatus() {
        return this.currentUpdateStatus;
    }

    /**
     * Configure automatic updates
     */
    async configureAutoUpdate(config) {
        // Validate config
        const validConfig = {
            enabled: config.enabled || false,
            channel: config.channel || 'stable',
            schedule: config.schedule || '0 3 * * 0',
            downloadOnly: config.downloadOnly || false
        };

        // Save configuration
        await this.saveConfig(validConfig);

        // Cancel existing task if any
        if (this.autoUpdateTask) {
            this.autoUpdateTask.stop();
            this.autoUpdateTask = null;
        }

        // Schedule if enabled
        if (validConfig.enabled) {
            this.scheduleAutoUpdate(validConfig);
        }
    }

    /**
     * Get auto-update configuration
     */
    async getAutoUpdateConfig() {
        return await this.loadConfig();
    }

    /**
     * Verify update integrity
     */
    async verifyUpdate(updatePath, expectedChecksum) {
        try {
            const hash = crypto.createHash('sha256');
            const stream = createReadStream(updatePath);
            
            await pipeline(stream, hash);
            
            const actualChecksum = hash.digest('hex');
            return actualChecksum === expectedChecksum;
        } catch (error) {
            return false;
        }
    }

    /**
     * Clean up old updates and temporary files
     */
    async cleanupUpdates(options = {}) {
        const { keepVersions = 3, cleanTemp = true } = options;
        
        const stats = {
            deletedFiles: 0,
            freedSpace: 0,
            keptVersions: []
        };

        try {
            // Get all update files
            const files = await fs.readdir(this.updateDir);
            const updateFiles = files.filter(f => f.startsWith('mcp-update-') && f.endsWith('.tar.gz'));

            // Sort by version
            updateFiles.sort((a, b) => {
                const versionA = a.match(/mcp-update-(.+)\.tar\.gz/)[1];
                const versionB = b.match(/mcp-update-(.+)\.tar\.gz/)[1];
                return semver.rcompare(versionA, versionB);
            });

            // Keep recent versions, delete old ones
            for (let i = 0; i < updateFiles.length; i++) {
                const file = updateFiles[i];
                const filePath = path.join(this.updateDir, file);
                
                if (i < keepVersions) {
                    stats.keptVersions.push(file);
                } else {
                    const stat = await fs.stat(filePath);
                    await fs.unlink(filePath);
                    stats.deletedFiles++;
                    stats.freedSpace += stat.size;
                }
            }

            // Clean temporary files if requested
            if (cleanTemp) {
                const tempDir = path.join(this.updateDir, 'temp');
                if (await this.fileExists(tempDir)) {
                    await fs.rm(tempDir, { recursive: true, force: true });
                    stats.deletedFiles++;
                }
            }

            return stats;
        } catch (error) {
            throw new Error(`Cleanup failed: ${error.message}`);
        }
    }

    /**
     * Get update channels
     */
    async getChannels() {
        return ['stable', 'beta', 'nightly'];
    }

    // Helper methods

    async fileExists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    async loadMetadata() {
        const data = await fs.readFile(this.metadataFile, 'utf8');
        return JSON.parse(data);
    }

    async saveMetadata(metadata) {
        await fs.writeFile(this.metadataFile, JSON.stringify(metadata, null, 2));
    }

    async loadHistory() {
        const data = await fs.readFile(this.historyFile, 'utf8');
        return JSON.parse(data);
    }

    async saveHistory(history) {
        await fs.writeFile(this.historyFile, JSON.stringify(history, null, 2));
    }

    async addToHistory(entry) {
        const history = await this.loadHistory();
        history.push(entry);
        await this.saveHistory(history);
    }

    async loadConfig() {
        const data = await fs.readFile(this.configFile, 'utf8');
        return JSON.parse(data);
    }

    async saveConfig(config) {
        await fs.writeFile(this.configFile, JSON.stringify(config, null, 2));
    }

    async fetchAvailableUpdates(channel, includeBeta) {
        // In a real implementation, this would fetch from an update server
        // For now, return mock data
        const mockUpdates = [
            {
                version: '1.1.0',
                releaseDate: new Date().toISOString(),
                channel: 'stable',
                changes: ['Bug fixes', 'Performance improvements'],
                downloadUrl: 'https://updates.mcp-platform.com/1.1.0/update.tar.gz',
                size: 10485760, // 10MB
                checksum: 'abc123def456',
                critical: false,
                requirements: {
                    minVersion: '1.0.0',
                    dependencies: []
                }
            }
        ];

        if (includeBeta) {
            mockUpdates.push({
                version: '1.2.0-beta.1',
                releaseDate: new Date().toISOString(),
                channel: 'beta',
                changes: ['New feature X', 'Experimental Y support'],
                downloadUrl: 'https://updates.mcp-platform.com/1.2.0-beta.1/update.tar.gz',
                size: 12582912, // 12MB
                checksum: 'def789ghi012',
                critical: false,
                requirements: {
                    minVersion: '1.0.0',
                    dependencies: []
                }
            });
        }

        return mockUpdates.filter(u => u.channel === channel || channel === 'all');
    }

    meetsRequirements(requirements) {
        if (!requirements) return true;
        
        // Check minimum version
        if (requirements.minVersion) {
            const currentVersion = this.getCurrentVersion();
            if (semver.lt(currentVersion, requirements.minVersion)) {
                return false;
            }
        }

        // Check dependencies (would need to implement dependency checking)
        // For now, assume all dependencies are met
        return true;
    }

    async downloadFile(url, destPath, expectedSize, onProgress) {
        return new Promise((resolve, reject) => {
            const file = createWriteStream(destPath);
            let downloadedSize = 0;

            https.get(url, (response) => {
                const totalSize = expectedSize || parseInt(response.headers['content-length'], 10);

                response.on('data', (chunk) => {
                    downloadedSize += chunk.length;
                    if (onProgress && totalSize) {
                        const progress = Math.round((downloadedSize / totalSize) * 100);
                        onProgress(progress);
                        this.currentUpdateStatus.progress = progress;
                    }
                });

                response.pipe(file);

                file.on('finish', () => {
                    file.close();
                    resolve();
                });
            }).on('error', (error) => {
                fs.unlink(destPath).catch(() => {});
                reject(error);
            });

            file.on('error', (error) => {
                fs.unlink(destPath).catch(() => {});
                reject(error);
            });
        });
    }

    async createBackup(version) {
        const backupDir = path.join(this.updateDir, 'backups');
        await fs.mkdir(backupDir, { recursive: true });
        
        const backupPath = path.join(backupDir, `backup-${version}.tar.gz`);
        
        // Create backup of current installation
        await tar.create(
            {
                gzip: true,
                file: backupPath,
                cwd: path.join(__dirname, '..'),
            },
            ['scripts', 'config', 'interfaces']
        );
    }

    async simulateUpdate(version, updatePath) {
        // Simulate update process for dry run
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Verify update package exists and is valid
        if (!await this.fileExists(updatePath)) {
            throw new Error('Update package not found');
        }
    }

    async extractUpdate(updatePath, version) {
        const tempDir = path.join(this.updateDir, 'temp', version);
        await fs.mkdir(tempDir, { recursive: true });

        // Extract update package
        await tar.extract({
            file: updatePath,
            cwd: tempDir
        });

        // Copy files to appropriate locations
        // In a real implementation, this would be more sophisticated
        const updateScriptPath = path.join(tempDir, 'update.js');
        if (await this.fileExists(updateScriptPath)) {
            await require(updateScriptPath).apply();
        }
    }

    async runUpdateScripts(version) {
        // Run pre/post update scripts
        const scriptsDir = path.join(this.updateDir, 'temp', version, 'scripts');
        if (await this.fileExists(scriptsDir)) {
            // Execute update scripts in order
            const scripts = await fs.readdir(scriptsDir);
            for (const script of scripts.sort()) {
                if (script.endsWith('.js')) {
                    await require(path.join(scriptsDir, script)).run();
                }
            }
        }
    }

    isCompatibleVersion(targetVersion, currentVersion) {
        // Check if versions are compatible for rollback
        const targetMajor = semver.major(targetVersion);
        const currentMajor = semver.major(currentVersion);
        
        // Allow rollback within same major version
        return targetMajor === currentMajor;
    }

    async backupUserData() {
        const userDataDir = path.join(this.updateDir, 'userdata-backup');
        await fs.mkdir(userDataDir, { recursive: true });
        
        // Backup user configuration and data
        // In a real implementation, this would backup actual user data
    }

    async restoreUserData() {
        const userDataDir = path.join(this.updateDir, 'userdata-backup');
        if (await this.fileExists(userDataDir)) {
            // Restore user data from backup
        }
    }

    async restoreBackup(backupPath, version) {
        // Extract backup to restore previous version
        await tar.extract({
            file: backupPath,
            cwd: path.join(__dirname, '..')
        });
    }

    scheduleAutoUpdate(config) {
        this.autoUpdateTask = cron.schedule(config.schedule, async () => {
            try {
                // Check for updates
                const updates = await this.checkForUpdates({ channel: config.channel });
                
                if (updates.length > 0) {
                    const latestUpdate = updates[0];
                    
                    // Download update
                    await this.downloadUpdate(latestUpdate.version);
                    
                    // Apply update if not download-only
                    if (!config.downloadOnly) {
                        await this.applyUpdate(latestUpdate.version, { backup: true });
                    }
                }
            } catch (error) {
                console.error('Auto-update failed:', error);
            }
        });
    }
}

module.exports = UpdateManager;