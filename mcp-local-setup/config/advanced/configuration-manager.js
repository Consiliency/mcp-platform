/**
 * Configuration Manager
 * Implements configuration management for MCP Platform
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const ConfigurationInterface = require('../../interfaces/configuration.interface');

class ConfigurationManager extends ConfigurationInterface {
    constructor(options = {}) {
        super();
        this.basePath = options.basePath || path.join(__dirname, 'environments');
        this.schemasPath = options.schemasPath || path.join(__dirname, 'schemas');
        this.secretsPath = options.secretsPath || path.join(__dirname, 'secrets');
        this.encryptionKey = options.encryptionKey || process.env.MCP_CONFIG_ENCRYPTION_KEY;
        this.defaultEnvironment = options.defaultEnvironment || 'development';
    }

    /**
     * Load configuration for an environment
     * @param {string} environment - Environment name
     * @param {Object} [options] - Load options
     * @returns {Promise<Object>} Configuration object
     */
    async loadConfig(environment, options = {}) {
        const configPath = path.join(this.basePath, `${environment}.json`);
        
        try {
            // Check if environment exists
            await fs.access(configPath);
            
            // Load base configuration
            const configData = await fs.readFile(configPath, 'utf8');
            let config = JSON.parse(configData);
            
            // Include secrets if requested
            if (options.includeSecrets) {
                const secrets = await this._loadSecretsForEnvironment(environment);
                config = this._mergeSecrets(config, secrets);
            }
            
            // Apply runtime overrides
            if (options.overrides) {
                config = this._mergeOverrides(config, options.overrides);
            }
            
            // Validate if requested
            if (options.validate) {
                const validation = await this.validateConfig(config, config.version);
                if (!validation.valid) {
                    throw new Error(`Configuration validation failed: ${JSON.stringify(validation.errors)}`);
                }
            }
            
            // Add metadata
            config._metadata = {
                environment,
                version: config.version || '1.0.0',
                loadedAt: new Date(),
                source: configPath,
                overrides: options.overrides || {}
            };
            
            return config;
        } catch (error) {
            if (error.code === 'ENOENT') {
                throw new Error(`Configuration for environment '${environment}' not found`);
            }
            throw error;
        }
    }

    /**
     * Validate configuration against schema
     * @param {Object} config - Configuration to validate
     * @param {string} [schemaVersion] - Schema version
     * @returns {Promise<ValidationResult>} Validation result
     */
    async validateConfig(config, schemaVersion = 'latest') {
        const schema = await this.getSchema(schemaVersion);
        const result = {
            valid: true,
            errors: [],
            warnings: []
        };
        
        // Check required properties
        if (schema.required) {
            for (const prop of schema.required) {
                if (!this._hasProperty(config, prop)) {
                    result.valid = false;
                    result.errors.push({
                        path: prop,
                        message: `Required property '${prop}' is missing`
                    });
                }
            }
        }
        
        // Validate property types and constraints
        if (schema.properties) {
            this._validateProperties(config, schema.properties, '', result);
        }
        
        // Apply defaults for missing optional properties
        if (schema.defaults) {
            for (const [key, defaultValue] of Object.entries(schema.defaults)) {
                if (!this._hasProperty(config, key)) {
                    result.warnings.push({
                        path: key,
                        message: `Using default value for '${key}'`
                    });
                }
            }
        }
        
        return result;
    }

    /**
     * Save configuration
     * @param {Object} config - Configuration to save
     * @param {string} environment - Environment name
     * @param {Object} [options] - Save options
     * @returns {Promise<boolean>} Success status
     */
    async saveConfig(config, environment, options = {}) {
        const configPath = path.join(this.basePath, `${environment}.json`);
        
        // Create backup if requested
        if (options.backup) {
            await this._createBackup(configPath);
        }
        
        // Validate if requested
        if (options.validate) {
            const validation = await this.validateConfig(config, config.version);
            if (!validation.valid) {
                throw new Error(`Configuration validation failed: ${JSON.stringify(validation.errors)}`);
            }
        }
        
        // Remove metadata before saving
        const configToSave = { ...config };
        delete configToSave._metadata;
        
        // Ensure directory exists
        await fs.mkdir(this.basePath, { recursive: true });
        
        // Save configuration
        await fs.writeFile(
            configPath,
            JSON.stringify(configToSave, null, 2),
            'utf8'
        );
        
        return true;
    }

    /**
     * Get decrypted secrets
     * @param {string[]} keys - Secret keys to retrieve
     * @param {Object} [options] - Retrieval options
     * @returns {Promise<Object>} Map of key to decrypted value
     */
    async getSecrets(keys, options = {}) {
        const environment = options.environment || this.defaultEnvironment;
        const secrets = {};
        
        for (const key of keys) {
            const secretPath = path.join(this.secretsPath, environment, `${key}.enc`);
            
            try {
                const encryptedData = await fs.readFile(secretPath, 'utf8');
                secrets[key] = this._decrypt(encryptedData);
            } catch (error) {
                if (error.code === 'ENOENT') {
                    throw new Error(`Secret '${key}' not found for environment '${environment}'`);
                }
                throw error;
            }
        }
        
        return secrets;
    }

    /**
     * Set encrypted secrets
     * @param {Object} secrets - Map of key to value
     * @param {Object} [options] - Storage options
     * @returns {Promise<void>}
     */
    async setSecrets(secrets, options = {}) {
        const environment = options.environment || this.defaultEnvironment;
        const secretsDir = path.join(this.secretsPath, environment);
        
        // Ensure directory exists
        await fs.mkdir(secretsDir, { recursive: true });
        
        // Save metadata file
        const metadataPath = path.join(secretsDir, '_metadata.json');
        let metadata = {};
        
        try {
            const existingMetadata = await fs.readFile(metadataPath, 'utf8');
            metadata = JSON.parse(existingMetadata);
        } catch (error) {
            // Metadata file doesn't exist yet
        }
        
        // Encrypt and save each secret
        for (const [key, value] of Object.entries(secrets)) {
            const encryptedValue = this._encrypt(value);
            const secretPath = path.join(secretsDir, `${key}.enc`);
            
            await fs.writeFile(secretPath, encryptedValue, 'utf8');
            
            // Update metadata
            metadata[key] = {
                key,
                description: options.descriptions?.[key] || '',
                createdAt: metadata[key]?.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                createdBy: options.user || 'system',
                tags: options.tags?.[key] || []
            };
        }
        
        // Save updated metadata
        await fs.writeFile(
            metadataPath,
            JSON.stringify(metadata, null, 2),
            'utf8'
        );
    }

    /**
     * Migrate configuration between versions
     * @param {Object} config - Configuration to migrate
     * @param {string} fromVersion - Source version
     * @param {string} toVersion - Target version
     * @returns {Promise<MigrationResult>} Migration result
     */
    async migrateConfig(config, fromVersion, toVersion) {
        const migrationPath = path.join(
            __dirname, 
            '../../scripts/migration',
            `migrate-${fromVersion}-to-${toVersion}.js`
        );
        
        try {
            const migration = require(migrationPath);
            return await migration.migrate(config);
        } catch (error) {
            if (error.code === 'MODULE_NOT_FOUND') {
                throw new Error(`No migration path from version ${fromVersion} to ${toVersion}`);
            }
            throw error;
        }
    }

    /**
     * Get configuration schema
     * @param {string} [version] - Schema version
     * @returns {Promise<ConfigSchema>} Configuration schema
     */
    async getSchema(version = 'latest') {
        const schemaFile = version === 'latest' ? 'schema.json' : `schema-v${version}.json`;
        const schemaPath = path.join(this.schemasPath, schemaFile);
        
        try {
            const schemaData = await fs.readFile(schemaPath, 'utf8');
            return JSON.parse(schemaData);
        } catch (error) {
            if (error.code === 'ENOENT') {
                throw new Error(`Schema version '${version}' not found`);
            }
            throw error;
        }
    }

    /**
     * List available environments
     * @returns {Promise<string[]>} Environment names
     */
    async listEnvironments() {
        try {
            const files = await fs.readdir(this.basePath);
            return files
                .filter(file => file.endsWith('.json'))
                .map(file => file.replace('.json', ''));
        } catch (error) {
            if (error.code === 'ENOENT') {
                return [];
            }
            throw error;
        }
    }

    /**
     * Create new environment configuration
     * @param {string} environment - Environment name
     * @param {Object} [baseConfig] - Base configuration
     * @param {Object} [options] - Creation options
     * @returns {Promise<void>}
     */
    async createEnvironment(environment, baseConfig = {}, options = {}) {
        const configPath = path.join(this.basePath, `${environment}.json`);
        
        // Check if environment already exists
        try {
            await fs.access(configPath);
            throw new Error(`Environment '${environment}' already exists`);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }
        
        // Create base configuration
        const config = {
            ...baseConfig,
            environment,
            version: options.version || '1.0.0',
            createdAt: new Date().toISOString()
        };
        
        await this.saveConfig(config, environment, { validate: true });
    }

    /**
     * Delete environment configuration
     * @param {string} environment - Environment to delete
     * @param {Object} [options] - Deletion options
     * @returns {Promise<boolean>} Success status
     */
    async deleteEnvironment(environment, options = {}) {
        const configPath = path.join(this.basePath, `${environment}.json`);
        
        // Create backup if requested
        if (options.backup) {
            await this._createBackup(configPath);
        }
        
        // Delete configuration file
        await fs.unlink(configPath);
        
        // Delete associated secrets
        const secretsDir = path.join(this.secretsPath, environment);
        try {
            await fs.rmdir(secretsDir, { recursive: true });
        } catch (error) {
            // Secrets directory might not exist
        }
        
        return true;
    }

    /**
     * Get configuration metadata
     * @param {string} environment - Environment name
     * @returns {Promise<ConfigMetadata>} Configuration metadata
     */
    async getConfigMetadata(environment) {
        const config = await this.loadConfig(environment);
        return config._metadata;
    }

    /**
     * List secret keys
     * @param {Object} [filter] - Filter options
     * @returns {Promise<SecretMetadata[]>} Secret metadata list
     */
    async listSecrets(filter = {}) {
        const environment = filter.environment || this.defaultEnvironment;
        const metadataPath = path.join(this.secretsPath, environment, '_metadata.json');
        
        try {
            const metadataData = await fs.readFile(metadataPath, 'utf8');
            const metadata = JSON.parse(metadataData);
            
            let secrets = Object.values(metadata);
            
            // Apply tag filter if provided
            if (filter.tags && filter.tags.length > 0) {
                secrets = secrets.filter(secret => 
                    secret.tags && filter.tags.some(tag => secret.tags.includes(tag))
                );
            }
            
            return secrets;
        } catch (error) {
            if (error.code === 'ENOENT') {
                return [];
            }
            throw error;
        }
    }

    /**
     * Delete a secret
     * @param {string} key - Secret key to delete
     * @param {Object} [options] - Deletion options
     * @returns {Promise<boolean>} Success status
     */
    async deleteSecret(key, options = {}) {
        const environment = options.environment || this.defaultEnvironment;
        const secretPath = path.join(this.secretsPath, environment, `${key}.enc`);
        const metadataPath = path.join(this.secretsPath, environment, '_metadata.json');
        
        // Delete secret file
        await fs.unlink(secretPath);
        
        // Update metadata
        try {
            const metadataData = await fs.readFile(metadataPath, 'utf8');
            const metadata = JSON.parse(metadataData);
            delete metadata[key];
            await fs.writeFile(
                metadataPath,
                JSON.stringify(metadata, null, 2),
                'utf8'
            );
        } catch (error) {
            // Metadata might not exist
        }
        
        return true;
    }

    /**
     * Export configuration
     * @param {string} environment - Environment to export
     * @param {Object} [options] - Export options
     * @returns {Promise<string>} Exported configuration
     */
    async exportConfig(environment, options = {}) {
        const config = await this.loadConfig(environment, {
            includeSecrets: options.includeSecrets
        });
        
        // Remove metadata
        delete config._metadata;
        
        const format = options.format || 'json';
        
        switch (format) {
            case 'json':
                return JSON.stringify(config, null, 2);
                
            case 'yaml':
                // Would need to implement YAML conversion
                throw new Error('YAML export not yet implemented');
                
            case 'env':
                return this._convertToEnv(config);
                
            default:
                throw new Error(`Unsupported export format: ${format}`);
        }
    }

    /**
     * Import configuration
     * @param {string} data - Configuration data
     * @param {string} environment - Environment to import to
     * @param {Object} [options] - Import options
     * @returns {Promise<void>}
     */
    async importConfig(data, environment, options = {}) {
        const format = options.format || 'json';
        let config;
        
        switch (format) {
            case 'json':
                config = JSON.parse(data);
                break;
                
            case 'yaml':
                // Would need to implement YAML parsing
                throw new Error('YAML import not yet implemented');
                
            case 'env':
                config = this._parseEnv(data);
                break;
                
            default:
                throw new Error(`Unsupported import format: ${format}`);
        }
        
        if (options.merge) {
            const existingConfig = await this.loadConfig(environment);
            config = this._deepMerge(existingConfig, config);
        }
        
        await this.saveConfig(config, environment, { validate: true });
    }

    // Private helper methods

    _hasProperty(obj, path) {
        const parts = path.split('.');
        let current = obj;
        
        for (const part of parts) {
            if (!current || typeof current !== 'object' || !(part in current)) {
                return false;
            }
            current = current[part];
        }
        
        return true;
    }

    _validateProperties(obj, schema, path, result) {
        for (const [key, propSchema] of Object.entries(schema)) {
            const fullPath = path ? `${path}.${key}` : key;
            const value = obj[key];
            
            if (propSchema.type && value !== undefined) {
                const actualType = Array.isArray(value) ? 'array' : typeof value;
                if (actualType !== propSchema.type) {
                    result.valid = false;
                    result.errors.push({
                        path: fullPath,
                        message: `Expected type '${propSchema.type}' but got '${actualType}'`
                    });
                }
            }
            
            if (propSchema.properties && typeof value === 'object' && value !== null) {
                this._validateProperties(value, propSchema.properties, fullPath, result);
            }
        }
    }

    async _loadSecretsForEnvironment(environment) {
        const secretsDir = path.join(this.secretsPath, environment);
        const secrets = {};
        
        try {
            const files = await fs.readdir(secretsDir);
            const secretFiles = files.filter(f => f.endsWith('.enc') && f !== '_metadata.json');
            
            for (const file of secretFiles) {
                const key = file.replace('.enc', '');
                const encryptedData = await fs.readFile(path.join(secretsDir, file), 'utf8');
                secrets[key] = this._decrypt(encryptedData);
            }
        } catch (error) {
            // Secrets directory might not exist
        }
        
        return secrets;
    }

    _mergeSecrets(config, secrets) {
        const merged = { ...config };
        
        // Replace placeholders like ${SECRET_NAME} with actual secrets
        const replacePlaceholders = (obj) => {
            for (const [key, value] of Object.entries(obj)) {
                if (typeof value === 'string') {
                    const match = value.match(/^\${([^}]+)}$/);
                    if (match && secrets[match[1]]) {
                        obj[key] = secrets[match[1]];
                    }
                } else if (typeof value === 'object' && value !== null) {
                    replacePlaceholders(value);
                }
            }
        };
        
        replacePlaceholders(merged);
        return merged;
    }

    _mergeOverrides(config, overrides) {
        return this._deepMerge(config, overrides);
    }

    _deepMerge(target, source) {
        const result = { ...target };
        
        for (const [key, value] of Object.entries(source)) {
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                result[key] = this._deepMerge(result[key] || {}, value);
            } else {
                result[key] = value;
            }
        }
        
        return result;
    }

    _encrypt(value) {
        if (!this.encryptionKey) {
            throw new Error('Encryption key not configured');
        }
        
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(
            'aes-256-cbc',
            Buffer.from(this.encryptionKey, 'hex'),
            iv
        );
        
        let encrypted = cipher.update(value, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        return iv.toString('hex') + ':' + encrypted;
    }

    _decrypt(encryptedData) {
        if (!this.encryptionKey) {
            throw new Error('Encryption key not configured');
        }
        
        const [ivHex, encrypted] = encryptedData.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        
        const decipher = crypto.createDecipheriv(
            'aes-256-cbc',
            Buffer.from(this.encryptionKey, 'hex'),
            iv
        );
        
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    }

    async _createBackup(filePath) {
        try {
            const data = await fs.readFile(filePath, 'utf8');
            const backupPath = filePath + `.backup.${Date.now()}`;
            await fs.writeFile(backupPath, data, 'utf8');
        } catch (error) {
            // File might not exist yet
        }
    }

    _convertToEnv(config, prefix = '') {
        const lines = [];
        
        const flatten = (obj, currentPrefix) => {
            for (const [key, value] of Object.entries(obj)) {
                const envKey = (currentPrefix + key).toUpperCase().replace(/[.-]/g, '_');
                
                if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                    flatten(value, envKey + '_');
                } else {
                    lines.push(`${envKey}=${JSON.stringify(value)}`);
                }
            }
        };
        
        flatten(config, prefix);
        return lines.join('\n');
    }

    _parseEnv(data) {
        const config = {};
        const lines = data.split('\n').filter(line => line.trim() && !line.startsWith('#'));
        
        for (const line of lines) {
            const [key, ...valueParts] = line.split('=');
            const value = valueParts.join('=');
            
            // Convert ENV_KEY_NAME to nested object
            const parts = key.toLowerCase().split('_');
            let current = config;
            
            for (let i = 0; i < parts.length - 1; i++) {
                if (!current[parts[i]]) {
                    current[parts[i]] = {};
                }
                current = current[parts[i]];
            }
            
            try {
                current[parts[parts.length - 1]] = JSON.parse(value);
            } catch {
                current[parts[parts.length - 1]] = value;
            }
        }
        
        return config;
    }
}

module.exports = ConfigurationManager;