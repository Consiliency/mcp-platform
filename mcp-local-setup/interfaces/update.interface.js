/**
 * Update Interface
 * Defines update mechanism contracts for MCP Platform
 */

/**
 * @typedef {Object} UpdateInfo
 * @property {string} version - Version number
 * @property {string} releaseDate - Release date ISO string
 * @property {string} channel - Update channel ('stable', 'beta', 'nightly')
 * @property {string[]} changes - List of changes in this version
 * @property {string} downloadUrl - URL to download the update
 * @property {number} size - Update size in bytes
 * @property {string} checksum - Update file checksum
 * @property {boolean} critical - Whether this is a critical update
 * @property {Object} requirements - Update requirements
 * @property {string} requirements.minVersion - Minimum version required
 * @property {string[]} requirements.dependencies - Required dependencies
 */

/**
 * @typedef {Object} ServiceUpdateInfo
 * @property {string} service - Service name
 * @property {string} currentVersion - Current installed version
 * @property {string} availableVersion - Latest available version
 * @property {string[]} changes - List of changes
 * @property {boolean} compatible - Whether update is compatible
 * @property {string[]} breakingChanges - List of breaking changes
 * @property {Object[]} dependencies - Dependency updates required
 */

/**
 * @typedef {Object} UpdateStatus
 * @property {string} updateId - Update identifier
 * @property {string} status - Status ('downloading', 'ready', 'applying', 'complete', 'failed')
 * @property {number} progress - Progress percentage (0-100)
 * @property {string} [error] - Error message if failed
 * @property {Date} startedAt - When update started
 * @property {Date} [completedAt] - When update completed
 */

/**
 * @typedef {Object} UpdateHistoryEntry
 * @property {string} version - Version that was installed
 * @property {Date} installedAt - Installation timestamp
 * @property {string} installedBy - User/system that performed update
 * @property {string} previousVersion - Version before update
 * @property {boolean} success - Whether update was successful
 * @property {string} [rollbackVersion] - Version rolled back to (if applicable)
 * @property {string} [notes] - Additional notes
 */

class UpdateInterface {
    /**
     * Check for available updates
     * @param {Object} [options] - Check options
     * @param {string} [options.channel] - Update channel to check
     * @param {boolean} [options.includeServices] - Include service updates
     * @param {boolean} [options.includeBeta] - Include beta versions
     * @returns {Promise<UpdateInfo[]>} Available updates
     */
    async checkForUpdates(options) {
        throw new Error('checkForUpdates() method must be implemented');
    }

    /**
     * Download an update
     * @param {string} version - Version to download
     * @param {Object} [options] - Download options
     * @param {Function} [options.onProgress] - Progress callback
     * @param {boolean} [options.verify] - Verify checksum after download
     * @returns {Promise<string>} Downloaded update path
     * @throws {Error} If download fails
     */
    async downloadUpdate(version, options) {
        throw new Error('downloadUpdate() method must be implemented');
    }

    /**
     * Apply an update
     * @param {string} version - Version to apply
     * @param {Object} [options] - Apply options
     * @param {boolean} [options.backup] - Create backup before updating
     * @param {boolean} [options.dryRun] - Simulate update without applying
     * @param {boolean} [options.force] - Force update even if checks fail
     * @returns {Promise<boolean>} Success status
     * @throws {Error} If update fails
     */
    async applyUpdate(version, options) {
        throw new Error('applyUpdate() method must be implemented');
    }

    /**
     * Rollback to a previous version
     * @param {string} version - Version to rollback to
     * @param {Object} [options] - Rollback options
     * @param {boolean} [options.keepData] - Preserve user data during rollback
     * @param {boolean} [options.force] - Force rollback even if checks fail
     * @returns {Promise<boolean>} Success status
     * @throws {Error} If rollback fails
     */
    async rollback(version, options) {
        throw new Error('rollback() method must be implemented');
    }

    /**
     * Get update history
     * @param {Object} [filter] - Filter options
     * @param {number} [filter.limit] - Maximum entries to return
     * @param {Date} [filter.startDate] - Start date for history
     * @param {Date} [filter.endDate] - End date for history
     * @returns {Promise<UpdateHistoryEntry[]>} Update history
     */
    async getUpdateHistory(filter) {
        throw new Error('getUpdateHistory() method must be implemented');
    }

    /**
     * Check for service updates
     * @param {string[]} [services] - Specific services to check (empty = all)
     * @returns {Promise<ServiceUpdateInfo[]>} Available service updates
     */
    async checkServiceUpdates(services) {
        throw new Error('checkServiceUpdates() method must be implemented');
    }

    /**
     * Update a specific service
     * @param {string} service - Service to update
     * @param {string} version - Version to update to
     * @param {Object} [options] - Update options
     * @returns {Promise<boolean>} Success status
     * @throws {Error} If service update fails
     */
    async updateService(service, version, options) {
        throw new Error('updateService() method must be implemented');
    }

    /**
     * Get current update status
     * @returns {Promise<UpdateStatus|null>} Current update status or null
     */
    async getUpdateStatus() {
        throw new Error('getUpdateStatus() method must be implemented');
    }

    /**
     * Configure automatic updates
     * @param {Object} config - Auto-update configuration
     * @param {boolean} config.enabled - Enable automatic updates
     * @param {string} config.channel - Update channel to use
     * @param {string} config.schedule - Cron expression for update checks
     * @param {boolean} config.downloadOnly - Only download, don't apply
     * @returns {Promise<void>}
     */
    async configureAutoUpdate(config) {
        throw new Error('configureAutoUpdate() method must be implemented');
    }

    /**
     * Get auto-update configuration
     * @returns {Promise<Object>} Auto-update configuration
     */
    async getAutoUpdateConfig() {
        throw new Error('getAutoUpdateConfig() method must be implemented');
    }

    /**
     * Verify update integrity
     * @param {string} updatePath - Path to update file
     * @param {string} expectedChecksum - Expected checksum
     * @returns {Promise<boolean>} Whether update is valid
     */
    async verifyUpdate(updatePath, expectedChecksum) {
        throw new Error('verifyUpdate() method must be implemented');
    }

    /**
     * Clean up old updates and temporary files
     * @param {Object} [options] - Cleanup options
     * @param {number} [options.keepVersions] - Number of old versions to keep
     * @param {boolean} [options.cleanTemp] - Clean temporary files
     * @returns {Promise<Object>} Cleanup statistics
     */
    async cleanupUpdates(options) {
        throw new Error('cleanupUpdates() method must be implemented');
    }

    /**
     * Get update channels
     * @returns {Promise<string[]>} Available update channels
     */
    async getChannels() {
        throw new Error('getChannels() method must be implemented');
    }
}

module.exports = UpdateInterface;