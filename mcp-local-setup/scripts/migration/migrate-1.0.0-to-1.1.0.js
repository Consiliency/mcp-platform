/**
 * Migration from version 1.0.0 to 1.1.0
 * 
 * Changes:
 * - Add monitoring configuration
 * - Restructure services configuration
 * - Add API versioning
 */

const migrate = async (config) => {
    const result = {
        success: true,
        config: { ...config },
        changes: [],
        warnings: []
    };

    try {
        // Update version
        result.config.version = '1.1.0';
        result.changes.push('Updated version from 1.0.0 to 1.1.0');

        // Add monitoring configuration if not present
        if (!result.config.monitoring) {
            result.config.monitoring = {
                enabled: true,
                interval: 60000,
                endpoints: {
                    health: '/health',
                    metrics: '/metrics',
                    readiness: '/ready'
                }
            };
            result.changes.push('Added monitoring configuration with default values');
        }

        // Add API versioning
        if (!result.config.api) {
            result.config.api = {
                version: 'v1',
                deprecatedVersions: [],
                versionHeader: 'X-API-Version'
            };
            result.changes.push('Added API versioning configuration');
        }

        // Migrate services configuration
        if (result.config.services && Array.isArray(result.config.services)) {
            result.config.services = result.config.services.map(service => {
                // Add version to each service if not present
                if (!service.version) {
                    service.version = '1.0.0';
                    result.changes.push(`Added version to service: ${service.name}`);
                }

                // Add healthCheck configuration
                if (!service.healthCheck) {
                    service.healthCheck = {
                        enabled: true,
                        interval: 30000,
                        timeout: 5000
                    };
                    result.changes.push(`Added health check configuration to service: ${service.name}`);
                }

                return service;
            });
        }

        // Add telemetry configuration for production
        if (result.config.environment === 'production' && !result.config.telemetry) {
            result.config.telemetry = {
                enabled: true,
                provider: 'opentelemetry',
                exporters: ['jaeger', 'prometheus']
            };
            result.changes.push('Added telemetry configuration for production environment');
        }

        // Validate required fields for new version
        const requiredFields = ['monitoring', 'api'];
        for (const field of requiredFields) {
            if (!result.config[field]) {
                result.warnings.push({
                    field,
                    message: `Required field '${field}' is missing after migration`
                });
            }
        }

    } catch (error) {
        result.success = false;
        result.error = error.message;
    }

    return result;
};

module.exports = { migrate };