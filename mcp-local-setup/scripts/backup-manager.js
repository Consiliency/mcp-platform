/**
 * Backup Manager for MCP Platform
 * Implements full backup and restore functionality according to BackupInterface
 */

const BackupInterface = require('../interfaces/backup.interface');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const crypto = require('crypto');
const tar = require('tar');
const cron = require('node-cron');

class BackupManager extends BackupInterface {
    constructor() {
        super();
        this.backupDir = path.join(__dirname, '..', 'backup');
        this.metadataFile = path.join(this.backupDir, 'metadata.json');
        this.schedulesFile = path.join(this.backupDir, 'schedules.json');
        this.schedules = new Map(); // Active cron jobs
        this.metadata = new Map(); // In-memory backup metadata cache
    }

    /**
     * Initialize backup manager
     */
    async initialize() {
        // Ensure backup directory exists
        await fs.mkdir(this.backupDir, { recursive: true });
        await fs.mkdir(path.join(this.backupDir, 'archives'), { recursive: true });
        await fs.mkdir(path.join(this.backupDir, 'temp'), { recursive: true });

        // Load metadata
        await this.loadMetadata();
        await this.loadSchedules();
    }

    /**
     * Load backup metadata from disk
     */
    async loadMetadata() {
        try {
            const data = await fs.readFile(this.metadataFile, 'utf8');
            const metadata = JSON.parse(data);
            this.metadata = new Map(Object.entries(metadata));
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
            // File doesn't exist, start with empty metadata
            this.metadata = new Map();
        }
    }

    /**
     * Save backup metadata to disk
     */
    async saveMetadata() {
        const metadata = Object.fromEntries(this.metadata);
        await fs.writeFile(this.metadataFile, JSON.stringify(metadata, null, 2));
    }

    /**
     * Load schedules from disk
     */
    async loadSchedules() {
        try {
            const data = await fs.readFile(this.schedulesFile, 'utf8');
            const schedules = JSON.parse(data);
            
            // Restart scheduled jobs
            for (const schedule of schedules) {
                if (schedule.enabled) {
                    await this.startScheduledJob(schedule);
                }
            }
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
            // File doesn't exist, no schedules to load
        }
    }

    /**
     * Save schedules to disk
     */
    async saveSchedules() {
        const schedules = Array.from(this.schedules.values()).map(s => ({
            id: s.id,
            cronExpression: s.cronExpression,
            options: s.options,
            enabled: s.enabled,
            nextRun: s.nextRun,
            lastRun: s.lastRun
        }));
        await fs.writeFile(this.schedulesFile, JSON.stringify(schedules, null, 2));
    }

    /**
     * Generate unique backup ID
     */
    generateBackupId() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const random = crypto.randomBytes(4).toString('hex');
        return `backup-${timestamp}-${random}`;
    }

    /**
     * Generate unique schedule ID
     */
    generateScheduleId() {
        return `schedule-${crypto.randomBytes(8).toString('hex')}`;
    }

    /**
     * Create a new backup
     * @param {BackupOptions} options - Backup configuration options
     * @returns {Promise<string>} Backup ID
     */
    async createBackup(options) {
        const backupId = this.generateBackupId();
        const backupPath = path.join(this.backupDir, 'archives', `${backupId}.tar.gz`);
        const tempDir = path.join(this.backupDir, 'temp', backupId);

        try {
            // Create temp directory for backup staging
            await fs.mkdir(tempDir, { recursive: true });

            // Determine what to backup
            const services = options.services || await this.getAllServices();
            const metadata = {
                id: backupId,
                createdAt: new Date(),
                createdBy: process.env.USER || 'system',
                type: options.type || 'full',
                services: services,
                version: await this.getPlatformVersion(),
                description: options.description,
                metadata: options.metadata || {}
            };

            // Collect backup data
            if (options.includeConfig !== false) {
                await this.backupConfiguration(tempDir, services);
            }

            if (options.includeData) {
                await this.backupServiceData(tempDir, services);
            }

            if (options.includeLogs) {
                await this.backupLogs(tempDir, services);
            }

            // Save metadata
            await fs.writeFile(
                path.join(tempDir, 'backup-metadata.json'),
                JSON.stringify(metadata, null, 2)
            );

            // Create archive
            if (options.compress !== false) {
                await tar.create({
                    gzip: true,
                    file: backupPath,
                    cwd: tempDir
                }, ['.']);
            } else {
                await tar.create({
                    file: backupPath.replace('.tar.gz', '.tar'),
                    cwd: tempDir
                }, ['.']);
            }

            // Get final size
            const stats = await fs.stat(backupPath);
            metadata.size = stats.size;

            // Calculate checksum
            metadata.checksum = await this.calculateChecksum(backupPath);

            // Store metadata
            this.metadata.set(backupId, metadata);
            await this.saveMetadata();

            // Clean up temp directory
            await this.removeDirectory(tempDir);

            return backupId;
        } catch (error) {
            // Clean up on failure
            try {
                await this.removeDirectory(tempDir);
                await fs.unlink(backupPath).catch(() => {});
            } catch (cleanupError) {
                // Ignore cleanup errors
            }
            throw new Error(`Backup creation failed: ${error.message}`);
        }
    }

    /**
     * List available backups
     * @param {Object} [filter] - Optional filter criteria
     * @returns {Promise<BackupMetadata[]>} List of backups
     */
    async listBackups(filter = {}) {
        const backups = Array.from(this.metadata.values());
        
        let filtered = backups;

        if (filter.type) {
            filtered = filtered.filter(b => b.type === filter.type);
        }

        if (filter.startDate) {
            filtered = filtered.filter(b => new Date(b.createdAt) >= filter.startDate);
        }

        if (filter.endDate) {
            filtered = filtered.filter(b => new Date(b.createdAt) <= filter.endDate);
        }

        if (filter.services && filter.services.length > 0) {
            filtered = filtered.filter(b => 
                filter.services.some(s => b.services.includes(s))
            );
        }

        // Sort by creation date (newest first)
        filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        // Convert dates back to Date objects
        return filtered.map(b => ({
            ...b,
            createdAt: new Date(b.createdAt)
        }));
    }

    /**
     * Restore from a backup
     * @param {string} backupId - ID of backup to restore
     * @param {RestoreOptions} [options] - Restore options
     * @returns {Promise<boolean>} Success status
     */
    async restoreBackup(backupId, options = {}) {
        const metadata = this.metadata.get(backupId);
        if (!metadata) {
            throw new Error(`Backup not found: ${backupId}`);
        }

        const backupPath = path.join(this.backupDir, 'archives', `${backupId}.tar.gz`);
        const tempDir = path.join(this.backupDir, 'temp', `restore-${backupId}`);

        try {
            // Verify backup exists
            await fs.access(backupPath);

            // Verify integrity first
            const verification = await this.verifyBackup(backupId);
            if (!verification.valid) {
                throw new Error('Backup integrity check failed');
            }

            // Create temp directory for extraction
            await fs.mkdir(tempDir, { recursive: true });

            // Extract backup
            await tar.extract({
                file: backupPath,
                cwd: tempDir
            });

            // Read backup metadata
            const backupMetadata = JSON.parse(
                await fs.readFile(path.join(tempDir, 'backup-metadata.json'), 'utf8')
            );

            // Determine services to restore
            const servicesToRestore = options.services || backupMetadata.services;

            // Dry run mode - just report what would be done
            if (options.dryRun) {
                console.log('Dry run mode - no changes will be made');
                console.log(`Would restore services: ${servicesToRestore.join(', ')}`);
                await this.removeDirectory(tempDir);
                return true;
            }

            // Stop services if requested
            if (options.stopServices) {
                await this.stopServices(servicesToRestore);
            }

            // Restore configuration
            if (!options.skipConfig) {
                await this.restoreConfiguration(tempDir, servicesToRestore, options.overwrite);
            }

            // Restore data volumes
            if (!options.skipData) {
                await this.restoreServiceData(tempDir, servicesToRestore, options.overwrite);
            }

            // Start services back up
            if (options.stopServices) {
                await this.startServices(servicesToRestore);
            }

            // Clean up temp directory
            await this.removeDirectory(tempDir);

            return true;
        } catch (error) {
            // Clean up on failure
            try {
                await this.removeDirectory(tempDir);
            } catch (cleanupError) {
                // Ignore cleanup errors
            }
            throw new Error(`Restore failed: ${error.message}`);
        }
    }

    /**
     * Get detailed backup metadata
     * @param {string} backupId - Backup identifier
     * @returns {Promise<BackupMetadata>} Detailed backup information
     */
    async getBackupMetadata(backupId) {
        const metadata = this.metadata.get(backupId);
        if (!metadata) {
            throw new Error(`Backup not found: ${backupId}`);
        }
        return {
            ...metadata,
            createdAt: new Date(metadata.createdAt)
        };
    }

    /**
     * Schedule automatic backups
     * @param {string} cronExpression - Cron expression for scheduling
     * @param {BackupOptions} options - Backup options for scheduled backups
     * @returns {Promise<string>} Schedule ID
     */
    async scheduleBackup(cronExpression, options) {
        const scheduleId = this.generateScheduleId();
        
        const schedule = {
            id: scheduleId,
            cronExpression,
            options,
            enabled: true,
            nextRun: this.getNextRunTime(cronExpression),
            lastRun: null
        };

        await this.startScheduledJob(schedule);
        await this.saveSchedules();

        return scheduleId;
    }

    /**
     * Start a scheduled job
     * @param {BackupSchedule} schedule - Schedule configuration
     */
    async startScheduledJob(schedule) {
        const job = cron.schedule(schedule.cronExpression, async () => {
            try {
                console.log(`Executing scheduled backup: ${schedule.id}`);
                const backupId = await this.createBackup(schedule.options);
                
                // Update schedule info
                schedule.lastRun = new Date();
                schedule.nextRun = this.getNextRunTime(schedule.cronExpression);
                await this.saveSchedules();
                
                console.log(`Scheduled backup completed: ${backupId}`);
            } catch (error) {
                console.error(`Scheduled backup failed: ${error.message}`);
            }
        }, {
            scheduled: schedule.enabled
        });

        this.schedules.set(schedule.id, {
            ...schedule,
            job
        });
    }

    /**
     * Delete a backup
     * @param {string} backupId - Backup to delete
     * @returns {Promise<boolean>} Whether deletion was successful
     */
    async deleteBackup(backupId) {
        const metadata = this.metadata.get(backupId);
        if (!metadata) {
            return false;
        }

        const backupPath = path.join(this.backupDir, 'archives', `${backupId}.tar.gz`);
        
        try {
            await fs.unlink(backupPath);
            this.metadata.delete(backupId);
            await this.saveMetadata();
            return true;
        } catch (error) {
            if (error.code === 'ENOENT') {
                // File already gone, just remove metadata
                this.metadata.delete(backupId);
                await this.saveMetadata();
                return true;
            }
            throw error;
        }
    }

    /**
     * Export backup to external location
     * @param {string} backupId - Backup to export
     * @param {string} destination - Export destination (path or URL)
     * @returns {Promise<void>}
     */
    async exportBackup(backupId, destination) {
        const metadata = this.metadata.get(backupId);
        if (!metadata) {
            throw new Error(`Backup not found: ${backupId}`);
        }

        const backupPath = path.join(this.backupDir, 'archives', `${backupId}.tar.gz`);

        if (destination.startsWith('s3://')) {
            // S3 export
            await this.exportToS3(backupPath, destination);
        } else if (destination.startsWith('http://') || destination.startsWith('https://')) {
            // HTTP upload
            await this.exportToHttp(backupPath, destination);
        } else {
            // Local file system copy
            await fs.copyFile(backupPath, destination);
        }
    }

    /**
     * Import backup from external location
     * @param {string} source - Import source (path or URL)
     * @returns {Promise<string>} Imported backup ID
     */
    async importBackup(source) {
        const backupId = this.generateBackupId();
        const backupPath = path.join(this.backupDir, 'archives', `${backupId}.tar.gz`);
        const tempDir = path.join(this.backupDir, 'temp', `import-${backupId}`);

        try {
            // Download/copy backup file
            if (source.startsWith('s3://')) {
                await this.importFromS3(source, backupPath);
            } else if (source.startsWith('http://') || source.startsWith('https://')) {
                await this.importFromHttp(source, backupPath);
            } else {
                await fs.copyFile(source, backupPath);
            }

            // Extract and read metadata
            await fs.mkdir(tempDir, { recursive: true });
            await tar.extract({
                file: backupPath,
                cwd: tempDir,
                filter: path => path === './backup-metadata.json'
            });

            const metadata = JSON.parse(
                await fs.readFile(path.join(tempDir, 'backup-metadata.json'), 'utf8')
            );

            // Update metadata with new ID and import info
            metadata.id = backupId;
            metadata.importedAt = new Date();
            metadata.importedFrom = source;

            // Calculate checksum
            metadata.checksum = await this.calculateChecksum(backupPath);

            // Get file size
            const stats = await fs.stat(backupPath);
            metadata.size = stats.size;

            // Store metadata
            this.metadata.set(backupId, metadata);
            await this.saveMetadata();

            // Clean up
            await this.removeDirectory(tempDir);

            return backupId;
        } catch (error) {
            // Clean up on failure
            try {
                await fs.unlink(backupPath).catch(() => {});
                await this.removeDirectory(tempDir);
            } catch (cleanupError) {
                // Ignore cleanup errors
            }
            throw new Error(`Import failed: ${error.message}`);
        }
    }

    /**
     * Get backup schedules
     * @returns {Promise<BackupSchedule[]>} List of scheduled backups
     */
    async getSchedules() {
        return Array.from(this.schedules.values()).map(s => ({
            id: s.id,
            cronExpression: s.cronExpression,
            options: s.options,
            enabled: s.enabled,
            nextRun: s.nextRun ? new Date(s.nextRun) : null,
            lastRun: s.lastRun ? new Date(s.lastRun) : null
        }));
    }

    /**
     * Update backup schedule
     * @param {string} scheduleId - Schedule to update
     * @param {Object} updates - Schedule updates
     * @returns {Promise<BackupSchedule>} Updated schedule
     */
    async updateSchedule(scheduleId, updates) {
        const schedule = this.schedules.get(scheduleId);
        if (!schedule) {
            throw new Error(`Schedule not found: ${scheduleId}`);
        }

        // Stop existing job
        if (schedule.job) {
            schedule.job.stop();
        }

        // Apply updates
        if (updates.cronExpression !== undefined) {
            schedule.cronExpression = updates.cronExpression;
            schedule.nextRun = this.getNextRunTime(updates.cronExpression);
        }

        if (updates.options !== undefined) {
            schedule.options = updates.options;
        }

        if (updates.enabled !== undefined) {
            schedule.enabled = updates.enabled;
        }

        // Restart job with new settings
        await this.startScheduledJob(schedule);
        await this.saveSchedules();

        return {
            id: schedule.id,
            cronExpression: schedule.cronExpression,
            options: schedule.options,
            enabled: schedule.enabled,
            nextRun: schedule.nextRun ? new Date(schedule.nextRun) : null,
            lastRun: schedule.lastRun ? new Date(schedule.lastRun) : null
        };
    }

    /**
     * Delete backup schedule
     * @param {string} scheduleId - Schedule to delete
     * @returns {Promise<boolean>} Whether deletion was successful
     */
    async deleteSchedule(scheduleId) {
        const schedule = this.schedules.get(scheduleId);
        if (!schedule) {
            return false;
        }

        // Stop the job
        if (schedule.job) {
            schedule.job.stop();
        }

        this.schedules.delete(scheduleId);
        await this.saveSchedules();

        return true;
    }

    /**
     * Verify backup integrity
     * @param {string} backupId - Backup to verify
     * @returns {Promise<Object>} Verification results
     */
    async verifyBackup(backupId) {
        const metadata = this.metadata.get(backupId);
        if (!metadata) {
            throw new Error(`Backup not found: ${backupId}`);
        }

        const backupPath = path.join(this.backupDir, 'archives', `${backupId}.tar.gz`);
        
        const results = {
            valid: true,
            checksumMatch: true,
            filesIntact: true,
            errors: []
        };

        try {
            // Verify file exists
            await fs.access(backupPath);

            // Verify checksum
            if (metadata.checksum) {
                const currentChecksum = await this.calculateChecksum(backupPath);
                results.checksumMatch = currentChecksum === metadata.checksum;
                if (!results.checksumMatch) {
                    results.valid = false;
                    results.errors.push('Checksum mismatch');
                }
            }

            // Verify archive integrity
            try {
                await tar.list({
                    file: backupPath,
                    onentry: () => {} // Just verify we can read entries
                });
            } catch (error) {
                results.filesIntact = false;
                results.valid = false;
                results.errors.push(`Archive corrupted: ${error.message}`);
            }

        } catch (error) {
            results.valid = false;
            results.errors.push(`Backup file not accessible: ${error.message}`);
        }

        return results;
    }

    /**
     * Get backup storage statistics
     * @returns {Promise<Object>} Storage statistics
     */
    async getStorageStats() {
        const backups = Array.from(this.metadata.values());
        
        if (backups.length === 0) {
            return {
                totalSize: 0,
                backupCount: 0,
                averageSize: 0,
                oldestBackup: null,
                newestBackup: null,
                byType: {}
            };
        }

        const totalSize = backups.reduce((sum, b) => sum + (b.size || 0), 0);
        const dates = backups.map(b => new Date(b.createdAt));
        
        const byType = {};
        backups.forEach(b => {
            if (!byType[b.type]) {
                byType[b.type] = { count: 0, size: 0 };
            }
            byType[b.type].count++;
            byType[b.type].size += b.size || 0;
        });

        return {
            totalSize,
            backupCount: backups.length,
            averageSize: Math.round(totalSize / backups.length),
            oldestBackup: new Date(Math.min(...dates)),
            newestBackup: new Date(Math.max(...dates)),
            byType
        };
    }

    /**
     * Clean up old backups
     * @param {Object} options - Cleanup options
     * @returns {Promise<Object>} Cleanup statistics
     */
    async cleanupBackups(options = {}) {
        const backups = await this.listBackups();
        const keepVersions = options.keepVersions || 10;
        const maxAge = options.maxAge; // days
        
        let toDelete = [];
        let deletedCount = 0;
        let freedSpace = 0;

        // Sort by date (newest first)
        backups.sort((a, b) => b.createdAt - a.createdAt);

        // Keep only specified number of versions
        if (backups.length > keepVersions) {
            toDelete = toDelete.concat(backups.slice(keepVersions));
        }

        // Delete backups older than maxAge
        if (maxAge) {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - maxAge);
            
            const oldBackups = backups.filter(b => b.createdAt < cutoffDate);
            toDelete = toDelete.concat(oldBackups);
        }

        // Remove duplicates
        const uniqueIds = [...new Set(toDelete.map(b => b.id))];

        // Delete backups
        for (const backupId of uniqueIds) {
            const metadata = this.metadata.get(backupId);
            if (metadata) {
                freedSpace += metadata.size || 0;
                await this.deleteBackup(backupId);
                deletedCount++;
            }
        }

        // Clean temp directory if requested
        if (options.cleanTemp) {
            const tempDir = path.join(this.backupDir, 'temp');
            try {
                const tempDirs = await fs.readdir(tempDir);
                for (const dir of tempDirs) {
                    await this.removeDirectory(path.join(tempDir, dir));
                }
            } catch (error) {
                // Ignore errors
            }
        }

        return {
            deletedCount,
            freedSpace,
            remainingCount: this.metadata.size
        };
    }

    // Helper methods

    /**
     * Get all services in the platform
     */
    async getAllServices() {
        // This would interface with docker-compose or service registry
        // For now, return a mock list
        return ['filesystem', 'git', 'browser', 'postgres', 'everest'];
    }

    /**
     * Get platform version
     */
    async getPlatformVersion() {
        try {
            const packagePath = path.join(__dirname, '..', 'package.json');
            const packageData = JSON.parse(await fs.readFile(packagePath, 'utf8'));
            return packageData.version || '1.0.0';
        } catch (error) {
            return '1.0.0';
        }
    }

    /**
     * Backup configuration files
     */
    async backupConfiguration(tempDir, services) {
        const configDir = path.join(tempDir, 'config');
        await fs.mkdir(configDir, { recursive: true });

        // Backup docker-compose.yml
        const composePath = path.join(__dirname, '..', 'docker-compose.yml');
        await fs.copyFile(composePath, path.join(configDir, 'docker-compose.yml'));

        // Backup service configurations
        // This would backup individual service configs
    }

    /**
     * Backup service data volumes
     */
    async backupServiceData(tempDir, services) {
        const dataDir = path.join(tempDir, 'data');
        await fs.mkdir(dataDir, { recursive: true });

        // This would use docker volume export or similar
        // For now, create placeholder
        await fs.writeFile(
            path.join(dataDir, 'volumes.json'),
            JSON.stringify({ services, timestamp: new Date() }, null, 2)
        );
    }

    /**
     * Backup logs
     */
    async backupLogs(tempDir, services) {
        const logsDir = path.join(tempDir, 'logs');
        await fs.mkdir(logsDir, { recursive: true });

        // This would collect docker logs
        // For now, create placeholder
        await fs.writeFile(
            path.join(logsDir, 'logs.txt'),
            `Logs for services: ${services.join(', ')}\n`
        );
    }

    /**
     * Calculate file checksum
     */
    async calculateChecksum(filePath) {
        const hash = crypto.createHash('sha256');
        const stream = require('fs').createReadStream(filePath);
        
        return new Promise((resolve, reject) => {
            stream.on('data', data => hash.update(data));
            stream.on('end', () => resolve(hash.digest('hex')));
            stream.on('error', reject);
        });
    }

    /**
     * Remove directory recursively
     */
    async removeDirectory(dir) {
        await fs.rm(dir, { recursive: true, force: true });
    }

    /**
     * Get next run time for cron expression
     */
    getNextRunTime(cronExpression) {
        try {
            const interval = cron.parseExpression(cronExpression);
            return interval.next().toDate();
        } catch (error) {
            return null;
        }
    }

    /**
     * Stop services
     */
    async stopServices(services) {
        // This would interface with docker-compose
        console.log(`Stopping services: ${services.join(', ')}`);
        // await execAsync(`docker-compose stop ${services.join(' ')}`);
    }

    /**
     * Start services
     */
    async startServices(services) {
        // This would interface with docker-compose
        console.log(`Starting services: ${services.join(', ')}`);
        // await execAsync(`docker-compose start ${services.join(' ')}`);
    }

    /**
     * Restore configuration
     */
    async restoreConfiguration(tempDir, services, overwrite) {
        const configDir = path.join(tempDir, 'config');
        
        // This would restore configuration files
        console.log(`Restoring configuration for: ${services.join(', ')}`);
    }

    /**
     * Restore service data
     */
    async restoreServiceData(tempDir, services, overwrite) {
        const dataDir = path.join(tempDir, 'data');
        
        // This would restore docker volumes
        console.log(`Restoring data for: ${services.join(', ')}`);
    }

    /**
     * Export to S3
     */
    async exportToS3(source, destination) {
        // This would use AWS SDK
        throw new Error('S3 export not implemented yet');
    }

    /**
     * Import from S3
     */
    async importFromS3(source, destination) {
        // This would use AWS SDK
        throw new Error('S3 import not implemented yet');
    }

    /**
     * Export to HTTP
     */
    async exportToHttp(source, destination) {
        // This would use HTTP upload
        throw new Error('HTTP export not implemented yet');
    }

    /**
     * Import from HTTP
     */
    async importFromHttp(source, destination) {
        // This would use HTTP download
        throw new Error('HTTP import not implemented yet');
    }
}

module.exports = BackupManager;