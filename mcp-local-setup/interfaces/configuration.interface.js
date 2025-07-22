/**
 * Configuration Interface
 * Defines configuration management contracts for MCP Platform
 */

/**
 * @typedef {Object} ConfigSchema
 * @property {string} version - Schema version
 * @property {Object} properties - Configuration properties
 * @property {string[]} required - Required properties
 * @property {Object} [defaults] - Default values
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Whether configuration is valid
 * @property {Object[]} errors - Validation errors
 * @property {string} errors.path - Property path with error
 * @property {string} errors.message - Error message
 * @property {Object[]} warnings - Validation warnings
 */

/**
 * @typedef {Object} SecretMetadata
 * @property {string} key - Secret key/name
 * @property {string} description - Secret description
 * @property {Date} createdAt - Creation timestamp
 * @property {Date} updatedAt - Last update timestamp
 * @property {string} createdBy - User who created the secret
 * @property {string[]} [tags] - Optional tags
 */

/**
 * @typedef {Object} MigrationResult
 * @property {boolean} success - Whether migration succeeded
 * @property {Object} config - Migrated configuration
 * @property {string[]} changes - List of changes made
 * @property {Object[]} [warnings] - Migration warnings
 */

/**
 * @typedef {Object} ConfigMetadata
 * @property {string} environment - Environment name
 * @property {string} version - Configuration version
 * @property {Date} loadedAt - When config was loaded
 * @property {string} source - Config source (file path, URL, etc.)
 * @property {Object} [overrides] - Runtime overrides applied
 */

class ConfigurationInterface {
    /**
     * Load configuration for an environment
     * @param {string} environment - Environment name (e.g., 'development', 'production')
     * @param {Object} [options] - Load options
     * @param {boolean} [options.includeSecrets] - Include decrypted secrets
     * @param {Object} [options.overrides] - Runtime config overrides
     * @param {boolean} [options.validate] - Validate after loading
     * @returns {Promise<Object>} Configuration object
     * @throws {Error} If configuration cannot be loaded
     */
    async loadConfig(environment, options) {
        throw new Error('loadConfig() method must be implemented');
    }

    /**
     * Validate configuration against schema
     * @param {Object} config - Configuration to validate
     * @param {string} [schemaVersion] - Schema version to validate against
     * @returns {Promise<ValidationResult>} Validation result
     */
    async validateConfig(config, schemaVersion) {
        throw new Error('validateConfig() method must be implemented');
    }

    /**
     * Save configuration
     * @param {Object} config - Configuration to save
     * @param {string} environment - Environment to save for
     * @param {Object} [options] - Save options
     * @param {boolean} [options.backup] - Create backup before saving
     * @param {boolean} [options.validate] - Validate before saving
     * @returns {Promise<boolean>} Success status
     * @throws {Error} If save fails
     */
    async saveConfig(config, environment, options) {
        throw new Error('saveConfig() method must be implemented');
    }

    /**
     * Get decrypted secrets
     * @param {string[]} keys - Secret keys to retrieve
     * @param {Object} [options] - Retrieval options
     * @param {string} [options.environment] - Environment to get secrets for
     * @returns {Promise<Object>} Map of key to decrypted value
     * @throws {Error} If any secret cannot be retrieved
     */
    async getSecrets(keys, options) {
        throw new Error('getSecrets() method must be implemented');
    }

    /**
     * Set encrypted secrets
     * @param {Object} secrets - Map of key to value to encrypt and store
     * @param {Object} [options] - Storage options
     * @param {string} [options.environment] - Environment to set secrets for
     * @returns {Promise<void>}
     * @throws {Error} If secrets cannot be stored
     */
    async setSecrets(secrets, options) {
        throw new Error('setSecrets() method must be implemented');
    }

    /**
     * Migrate configuration between versions
     * @param {Object} config - Configuration to migrate
     * @param {string} fromVersion - Source version
     * @param {string} toVersion - Target version
     * @returns {Promise<MigrationResult>} Migration result
     * @throws {Error} If migration fails
     */
    async migrateConfig(config, fromVersion, toVersion) {
        throw new Error('migrateConfig() method must be implemented');
    }

    /**
     * Get configuration schema
     * @param {string} [version] - Schema version (latest if not specified)
     * @returns {Promise<ConfigSchema>} Configuration schema
     */
    async getSchema(version) {
        throw new Error('getSchema() method must be implemented');
    }

    /**
     * List available environments
     * @returns {Promise<string[]>} Environment names
     */
    async listEnvironments() {
        throw new Error('listEnvironments() method must be implemented');
    }

    /**
     * Create new environment configuration
     * @param {string} environment - Environment name
     * @param {Object} [baseConfig] - Base configuration to use
     * @param {Object} [options] - Creation options
     * @returns {Promise<void>}
     * @throws {Error} If environment already exists
     */
    async createEnvironment(environment, baseConfig, options) {
        throw new Error('createEnvironment() method must be implemented');
    }

    /**
     * Delete environment configuration
     * @param {string} environment - Environment to delete
     * @param {Object} [options] - Deletion options
     * @param {boolean} [options.backup] - Create backup before deletion
     * @returns {Promise<boolean>} Success status
     */
    async deleteEnvironment(environment, options) {
        throw new Error('deleteEnvironment() method must be implemented');
    }

    /**
     * Get configuration metadata
     * @param {string} environment - Environment name
     * @returns {Promise<ConfigMetadata>} Configuration metadata
     */
    async getConfigMetadata(environment) {
        throw new Error('getConfigMetadata() method must be implemented');
    }

    /**
     * List secret keys
     * @param {Object} [filter] - Filter options
     * @param {string} [filter.environment] - Filter by environment
     * @param {string[]} [filter.tags] - Filter by tags
     * @returns {Promise<SecretMetadata[]>} Secret metadata list
     */
    async listSecrets(filter) {
        throw new Error('listSecrets() method must be implemented');
    }

    /**
     * Delete a secret
     * @param {string} key - Secret key to delete
     * @param {Object} [options] - Deletion options
     * @param {string} [options.environment] - Environment to delete from
     * @returns {Promise<boolean>} Success status
     */
    async deleteSecret(key, options) {
        throw new Error('deleteSecret() method must be implemented');
    }

    /**
     * Export configuration
     * @param {string} environment - Environment to export
     * @param {Object} [options] - Export options
     * @param {boolean} [options.includeSecrets] - Include encrypted secrets
     * @param {string} [options.format] - Export format ('json', 'yaml', 'env')
     * @returns {Promise<string>} Exported configuration
     */
    async exportConfig(environment, options) {
        throw new Error('exportConfig() method must be implemented');
    }

    /**
     * Import configuration
     * @param {string} data - Configuration data to import
     * @param {string} environment - Environment to import to
     * @param {Object} [options] - Import options
     * @param {string} [options.format] - Import format ('json', 'yaml', 'env')
     * @param {boolean} [options.merge] - Merge with existing config
     * @returns {Promise<void>}
     * @throws {Error} If import fails
     */
    async importConfig(data, environment, options) {
        throw new Error('importConfig() method must be implemented');
    }
}

module.exports = ConfigurationInterface;