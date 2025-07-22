/**
 * Backup Interface
 * Defines backup and restore contracts for MCP Platform
 */

/**
 * @typedef {Object} BackupMetadata
 * @property {string} id - Unique backup identifier
 * @property {Date} createdAt - When the backup was created
 * @property {string} createdBy - User/system that created the backup
 * @property {number} size - Backup size in bytes
 * @property {string} type - Backup type ('full', 'incremental', 'service')
 * @property {string[]} services - List of included services
 * @property {string} version - Platform version at backup time
 * @property {string} [description] - Optional backup description
 * @property {Object} [metadata] - Additional metadata
 */

/**
 * @typedef {Object} BackupOptions
 * @property {string} type - Backup type ('full', 'incremental', 'service')
 * @property {string[]} [services] - Specific services to backup (empty = all)
 * @property {boolean} [includeData] - Include service data volumes
 * @property {boolean} [includeConfig] - Include configuration files
 * @property {boolean} [includeLogs] - Include log files
 * @property {string} [description] - Backup description
 * @property {boolean} [compress] - Whether to compress the backup
 */

/**
 * @typedef {Object} RestoreOptions
 * @property {boolean} [stopServices] - Stop services before restore
 * @property {boolean} [overwrite] - Overwrite existing configuration
 * @property {string[]} [services] - Specific services to restore (empty = all)
 * @property {boolean} [skipData] - Skip data volume restoration
 * @property {boolean} [dryRun] - Simulate restore without applying changes
 */

/**
 * @typedef {Object} BackupSchedule
 * @property {string} id - Schedule identifier
 * @property {string} cronExpression - Cron expression for scheduling
 * @property {BackupOptions} options - Backup options for scheduled backups
 * @property {boolean} enabled - Whether schedule is active
 * @property {Date} nextRun - Next scheduled execution time
 * @property {Date} [lastRun] - Last execution time
 */

class BackupInterface {
    /**
     * Create a new backup
     * @param {BackupOptions} options - Backup configuration options
     * @returns {Promise<string>} Backup ID
     * @throws {Error} If backup creation fails
     */
    async createBackup(options) {
        throw new Error('createBackup() method must be implemented');
    }

    /**
     * List available backups
     * @param {Object} [filter] - Optional filter criteria
     * @param {string} [filter.type] - Filter by backup type
     * @param {Date} [filter.startDate] - Filter by date range start
     * @param {Date} [filter.endDate] - Filter by date range end
     * @param {string[]} [filter.services] - Filter by included services
     * @returns {Promise<BackupMetadata[]>} List of backups
     */
    async listBackups(filter) {
        throw new Error('listBackups() method must be implemented');
    }

    /**
     * Restore from a backup
     * @param {string} backupId - ID of backup to restore
     * @param {RestoreOptions} [options] - Restore options
     * @returns {Promise<boolean>} Success status
     * @throws {Error} If restore fails
     */
    async restoreBackup(backupId, options) {
        throw new Error('restoreBackup() method must be implemented');
    }

    /**
     * Get detailed backup metadata
     * @param {string} backupId - Backup identifier
     * @returns {Promise<BackupMetadata>} Detailed backup information
     * @throws {Error} If backup not found
     */
    async getBackupMetadata(backupId) {
        throw new Error('getBackupMetadata() method must be implemented');
    }

    /**
     * Schedule automatic backups
     * @param {string} cronExpression - Cron expression for scheduling
     * @param {BackupOptions} options - Backup options for scheduled backups
     * @returns {Promise<string>} Schedule ID
     */
    async scheduleBackup(cronExpression, options) {
        throw new Error('scheduleBackup() method must be implemented');
    }

    /**
     * Delete a backup
     * @param {string} backupId - Backup to delete
     * @returns {Promise<boolean>} Whether deletion was successful
     */
    async deleteBackup(backupId) {
        throw new Error('deleteBackup() method must be implemented');
    }

    /**
     * Export backup to external location
     * @param {string} backupId - Backup to export
     * @param {string} destination - Export destination (path or URL)
     * @returns {Promise<void>}
     * @throws {Error} If export fails
     */
    async exportBackup(backupId, destination) {
        throw new Error('exportBackup() method must be implemented');
    }

    /**
     * Import backup from external location
     * @param {string} source - Import source (path or URL)
     * @returns {Promise<string>} Imported backup ID
     * @throws {Error} If import fails
     */
    async importBackup(source) {
        throw new Error('importBackup() method must be implemented');
    }

    /**
     * Get backup schedules
     * @returns {Promise<BackupSchedule[]>} List of scheduled backups
     */
    async getSchedules() {
        throw new Error('getSchedules() method must be implemented');
    }

    /**
     * Update backup schedule
     * @param {string} scheduleId - Schedule to update
     * @param {Object} updates - Schedule updates
     * @param {string} [updates.cronExpression] - New cron expression
     * @param {BackupOptions} [updates.options] - New backup options
     * @param {boolean} [updates.enabled] - Enable/disable schedule
     * @returns {Promise<BackupSchedule>} Updated schedule
     */
    async updateSchedule(scheduleId, updates) {
        throw new Error('updateSchedule() method must be implemented');
    }

    /**
     * Delete backup schedule
     * @param {string} scheduleId - Schedule to delete
     * @returns {Promise<boolean>} Whether deletion was successful
     */
    async deleteSchedule(scheduleId) {
        throw new Error('deleteSchedule() method must be implemented');
    }

    /**
     * Verify backup integrity
     * @param {string} backupId - Backup to verify
     * @returns {Promise<Object>} Verification results
     */
    async verifyBackup(backupId) {
        throw new Error('verifyBackup() method must be implemented');
    }

    /**
     * Get backup storage statistics
     * @returns {Promise<Object>} Storage statistics
     */
    async getStorageStats() {
        throw new Error('getStorageStats() method must be implemented');
    }
}

module.exports = BackupInterface;