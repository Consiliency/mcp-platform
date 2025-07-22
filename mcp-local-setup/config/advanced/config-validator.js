/**
 * Configuration Validator
 * Advanced validation utilities for MCP configurations
 */

class ConfigValidator {
    constructor() {
        this.customValidators = new Map();
    }

    /**
     * Register a custom validator
     * @param {string} type - Validator type name
     * @param {Function} validator - Validator function
     */
    registerValidator(type, validator) {
        this.customValidators.set(type, validator);
    }

    /**
     * Validate environment-specific constraints
     * @param {Object} config - Configuration to validate
     * @param {string} environment - Environment name
     * @returns {Object} Validation result
     */
    validateEnvironmentConstraints(config, environment) {
        const result = {
            valid: true,
            errors: [],
            warnings: []
        };

        switch (environment) {
            case 'production':
                this._validateProductionConstraints(config, result);
                break;
            case 'development':
                this._validateDevelopmentConstraints(config, result);
                break;
            case 'staging':
                this._validateStagingConstraints(config, result);
                break;
        }

        return result;
    }

    /**
     * Validate security configuration
     * @param {Object} config - Configuration to validate
     * @returns {Object} Validation result
     */
    validateSecurity(config) {
        const result = {
            valid: true,
            errors: [],
            warnings: []
        };

        // Check for secrets in plain text
        this._checkForPlainTextSecrets(config, '', result);

        // Validate encryption settings
        if (config.security) {
            if (config.security.enableAuth && !config.security.authProvider) {
                result.valid = false;
                result.errors.push({
                    path: 'security.authProvider',
                    message: 'Auth provider must be specified when auth is enabled'
                });
            }

            if (config.security.enableRateLimit) {
                if (!config.security.rateLimitWindow || config.security.rateLimitWindow < 1000) {
                    result.warnings.push({
                        path: 'security.rateLimitWindow',
                        message: 'Rate limit window should be at least 1000ms'
                    });
                }
            }
        }

        return result;
    }

    /**
     * Validate service dependencies
     * @param {Object} config - Configuration to validate
     * @returns {Object} Validation result
     */
    validateServiceDependencies(config) {
        const result = {
            valid: true,
            errors: [],
            warnings: []
        };

        if (!config.services || !Array.isArray(config.services)) {
            return result;
        }

        const enabledServices = new Set(
            config.services
                .filter(s => s.enabled)
                .map(s => s.name)
        );

        // Check for missing dependencies
        for (const service of config.services) {
            if (service.dependencies) {
                for (const dep of service.dependencies) {
                    if (!enabledServices.has(dep)) {
                        result.valid = false;
                        result.errors.push({
                            path: `services.${service.name}.dependencies`,
                            message: `Required dependency '${dep}' is not enabled`
                        });
                    }
                }
            }
        }

        return result;
    }

    /**
     * Validate configuration completeness
     * @param {Object} config - Configuration to validate
     * @param {Object} schema - Schema to validate against
     * @returns {Object} Validation result
     */
    validateCompleteness(config, schema) {
        const result = {
            valid: true,
            errors: [],
            warnings: [],
            coverage: 0
        };

        const totalFields = this._countSchemaFields(schema.properties);
        const presentFields = this._countPresentFields(config, schema.properties);
        
        result.coverage = (presentFields / totalFields) * 100;

        if (result.coverage < 80) {
            result.warnings.push({
                path: '_root',
                message: `Configuration coverage is ${result.coverage.toFixed(1)}% (recommended: >80%)`
            });
        }

        return result;
    }

    // Private methods

    _validateProductionConstraints(config, result) {
        // Production must have strict validation
        if (config.features && config.features.strictValidation !== true) {
            result.valid = false;
            result.errors.push({
                path: 'features.strictValidation',
                message: 'Strict validation must be enabled in production'
            });
        }

        // Production must not have debug mode
        if (config.features && config.features.debugMode === true) {
            result.valid = false;
            result.errors.push({
                path: 'features.debugMode',
                message: 'Debug mode must be disabled in production'
            });
        }

        // Production should use secure protocols
        if (config.server && config.server.protocol !== 'https') {
            result.warnings.push({
                path: 'server.protocol',
                message: 'Production should use HTTPS protocol'
            });
        }

        // Production must have proper logging
        if (config.logging && config.logging.level === 'debug') {
            result.warnings.push({
                path: 'logging.level',
                message: 'Debug logging in production may impact performance'
            });
        }
    }

    _validateDevelopmentConstraints(config, result) {
        // Development recommendations
        if (config.features && config.features.hotReload !== true) {
            result.warnings.push({
                path: 'features.hotReload',
                message: 'Hot reload is recommended for development'
            });
        }

        if (config.logging && config.logging.level !== 'debug') {
            result.warnings.push({
                path: 'logging.level',
                message: 'Debug logging is recommended for development'
            });
        }
    }

    _validateStagingConstraints(config, result) {
        // Staging should mirror production
        if (config.features && config.features.strictValidation !== true) {
            result.warnings.push({
                path: 'features.strictValidation',
                message: 'Staging should have strict validation like production'
            });
        }
    }

    _checkForPlainTextSecrets(obj, path, result) {
        const secretPatterns = [
            /password/i,
            /secret/i,
            /apikey/i,
            /token/i,
            /credential/i
        ];

        for (const [key, value] of Object.entries(obj)) {
            const fullPath = path ? `${path}.${key}` : key;

            // Check if key name suggests it's a secret
            const isSecretKey = secretPatterns.some(pattern => pattern.test(key));

            if (isSecretKey && typeof value === 'string') {
                // Check if it's a placeholder or actual value
                if (!value.startsWith('${') && value.length > 0) {
                    result.warnings.push({
                        path: fullPath,
                        message: 'Possible plain text secret detected. Use ${SECRET_NAME} placeholder'
                    });
                }
            }

            // Recurse into objects
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                this._checkForPlainTextSecrets(value, fullPath, result);
            }
        }
    }

    _countSchemaFields(properties, count = 0) {
        if (!properties) return count;

        for (const prop of Object.values(properties)) {
            count++;
            if (prop.properties) {
                count = this._countSchemaFields(prop.properties, count);
            }
        }

        return count;
    }

    _countPresentFields(obj, schema, count = 0) {
        if (!schema || !obj) return count;

        for (const [key, propSchema] of Object.entries(schema)) {
            if (key in obj && obj[key] !== undefined && obj[key] !== null) {
                count++;
                if (propSchema.properties && typeof obj[key] === 'object') {
                    count = this._countPresentFields(obj[key], propSchema.properties, count);
                }
            }
        }

        return count;
    }
}

module.exports = ConfigValidator;