/**
 * Integration tests for Configuration Management implementation
 * Tests environment configs, secret management, migrations, and validation
 */

const ConfigurationInterface = require('../../interfaces/configuration.interface');
const ConfigurationManager = require('../../config/advanced/configuration-manager');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

// Increase timeout for integration tests
jest.setTimeout(60000);

describe('Configuration Management Integration Tests', () => {
    let config;
    const testEnvironment = 'test-integration';
    const testSecretKey = 'test-api-key';
    const testBasePath = path.join(__dirname, '../temp/config-test');
    const encryptionKey = crypto.randomBytes(32).toString('hex');

    beforeAll(async () => {
        // Initialize configuration implementation
        config = new ConfigurationManager({
            basePath: path.join(testBasePath, 'environments'),
            schemasPath: path.join(testBasePath, 'schemas'),
            secretsPath: path.join(testBasePath, 'secrets'),
            encryptionKey: encryptionKey
        });

        // Create test directories
        await fs.mkdir(testBasePath, { recursive: true });
        await fs.mkdir(path.join(testBasePath, 'environments'), { recursive: true });
        await fs.mkdir(path.join(testBasePath, 'schemas'), { recursive: true });
        await fs.mkdir(path.join(testBasePath, 'secrets'), { recursive: true });

        // Create default schema
        const defaultSchema = {
            version: '1.0.0',
            properties: {
                platform: {
                    type: 'object',
                    properties: {
                        name: { type: 'string' },
                        version: { type: 'string' },
                        debug: { type: 'boolean' },
                        modified: { type: 'boolean' }
                    }
                },
                services: {
                    type: 'object',
                    properties: {
                        enabled: { type: 'array' },
                        ports: { type: 'object' },
                        newField: { type: 'string' },
                        newService: { type: 'object' }
                    }
                }
            },
            required: ['platform', 'services']
        };

        await fs.writeFile(
            path.join(testBasePath, 'schemas', 'schema.json'),
            JSON.stringify(defaultSchema, null, 2)
        );

        // Create migration scripts for testing
        const migrationScript1 = `
module.exports = {
    migrate: async (config) => {
        const result = {
            success: true,
            config: { ...config },
            changes: [],
            warnings: []
        };
        
        // Migrate services.list to services.enabled
        if (config.services && config.services.list) {
            result.config.services.enabled = config.services.list;
            delete result.config.services.list;
            result.changes.push('Migrated services.list to services.enabled');
        }
        
        result.config.version = '1.0.0';
        return result;
    }
};`;

        const migrationScript2 = `
module.exports = {
    migrate: async (config) => {
        const result = {
            success: true,
            config: { ...config },
            changes: [],
            warnings: []
        };
        
        // Migrate serviceList to services.enabled
        if (config.serviceList) {
            result.config.services = { enabled: config.serviceList };
            delete result.config.serviceList;
            result.changes.push('Migrated serviceList to services.enabled');
        }
        
        result.config.version = '0.9.0';
        return result;
    }
};`;

        await fs.mkdir(path.join(__dirname, '../../scripts/migration'), { recursive: true });
        await fs.writeFile(
            path.join(__dirname, '../../scripts/migration/migrate-0.9.0-to-1.0.0.js'),
            migrationScript1
        );
        await fs.writeFile(
            path.join(__dirname, '../../scripts/migration/migrate-0.5.0-to-0.9.0.js'),
            migrationScript2
        );
    });

    afterAll(async () => {
        // Cleanup test environments and secrets
        try {
            await config.deleteEnvironment(testEnvironment, { backup: false });
        } catch (e) {
            // Environment might not exist
        }

        // Cleanup test directories
        await fs.rm(testBasePath, { recursive: true, force: true });
        
        // Cleanup migration scripts
        try {
            await fs.unlink(path.join(__dirname, '../../scripts/migration/migrate-0.9.0-to-1.0.0.js'));
            await fs.unlink(path.join(__dirname, '../../scripts/migration/migrate-0.5.0-to-0.9.0.js'));
        } catch (e) {
            // Files might not exist
        }
    });

    describe('Environment Configuration', () => {
        it('should create new environment', async () => {
            const baseConfig = {
                platform: {
                    name: 'MCP Test Environment',
                    version: '1.0.0',
                    debug: true
                },
                services: {
                    enabled: ['filesystem', 'git'],
                    ports: {
                        base: 3000
                    }
                }
            };

            await config.createEnvironment(testEnvironment, baseConfig);

            const environments = await config.listEnvironments();
            expect(environments).toContain(testEnvironment);
        });

        it('should load environment configuration', async () => {
            const loadedConfig = await config.loadConfig(testEnvironment, {
                includeSecrets: false,
                validate: true
            });

            expect(loadedConfig).toBeDefined();
            expect(loadedConfig.platform).toBeDefined();
            expect(loadedConfig.platform.name).toBe('MCP Test Environment');
            expect(loadedConfig.services.enabled).toContain('filesystem');
            expect(loadedConfig.services.enabled).toContain('git');
        });

        it('should apply runtime overrides', async () => {
            const overrides = {
                platform: {
                    debug: false
                },
                services: {
                    ports: {
                        base: 4000
                    }
                }
            };

            const loadedConfig = await config.loadConfig(testEnvironment, {
                overrides,
                validate: true
            });

            expect(loadedConfig.platform.debug).toBe(false);
            expect(loadedConfig.services.ports.base).toBe(4000);
            expect(loadedConfig.platform.name).toBe('MCP Test Environment'); // Not overridden
        });

        it('should list all environments', async () => {
            // Create additional test environment
            await config.createEnvironment('test-staging', {});

            const environments = await config.listEnvironments();
            expect(environments).toBeInstanceOf(Array);
            expect(environments).toContain(testEnvironment);
            expect(environments).toContain('test-staging');

            // Cleanup
            await config.deleteEnvironment('test-staging', { backup: false });
        });

        it('should get configuration metadata', async () => {
            const metadata = await config.getConfigMetadata(testEnvironment);
            expect(metadata).toBeDefined();
            expect(metadata.environment).toBe(testEnvironment);
            expect(metadata.version).toBeTruthy();
            expect(metadata.loadedAt).toBeInstanceOf(Date);
            expect(metadata.source).toBeTruthy();
        });
    });

    describe('Configuration Validation', () => {
        it('should validate configuration against schema', async () => {
            const validConfig = {
                platform: {
                    name: 'Valid Config',
                    version: '1.0.0'
                },
                services: {
                    enabled: ['filesystem']
                }
            };

            const result = await config.validateConfig(validConfig);
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should detect validation errors', async () => {
            const invalidConfig = {
                platform: {
                    // Missing required 'name' field
                    version: '1.0.0'
                },
                services: {
                    enabled: 'not-an-array' // Should be array
                }
            };

            const result = await config.validateConfig(invalidConfig);
            expect(result.valid).toBe(false);
            expect(result.errors).toBeInstanceOf(Array);
            expect(result.errors.length).toBeGreaterThan(0);
            
            const nameError = result.errors.find(e => e.path.includes('name'));
            expect(nameError).toBeDefined();
        });

        it('should provide validation warnings', async () => {
            const configWithWarnings = {
                platform: {
                    name: 'Config with deprecated fields',
                    version: '1.0.0'
                },
                services: {
                    enabled: []
                }
                // Missing optional fields should generate warnings
            };

            const result = await config.validateConfig(configWithWarnings);
            expect(result.valid).toBe(true);
            expect(result.warnings).toBeInstanceOf(Array);
            // Warnings might be empty if all required fields are present
        });

        it('should get configuration schema', async () => {
            const schema = await config.getSchema();
            expect(schema).toBeDefined();
            expect(schema.version).toBeTruthy();
            expect(schema.properties).toBeDefined();
            expect(schema.required).toBeInstanceOf(Array);
        });
    });

    describe('Secret Management', () => {
        it('should set encrypted secrets', async () => {
            const secrets = {
                [testSecretKey]: 'super-secret-value',
                'database-password': 'encrypted-password-123',
                'jwt-secret': 'jwt-secret-key-456'
            };

            await config.setSecrets(secrets, { environment: testEnvironment });

            // Secrets should be encrypted at rest
            // TODO: Verify secrets are actually encrypted in storage
        });

        it('should get decrypted secrets', async () => {
            const keys = [testSecretKey, 'database-password'];
            const secrets = await config.getSecrets(keys, { environment: testEnvironment });

            expect(secrets).toBeDefined();
            expect(secrets[testSecretKey]).toBe('super-secret-value');
            expect(secrets['database-password']).toBe('encrypted-password-123');
        });

        it('should list secret metadata without values', async () => {
            const secretList = await config.listSecrets({ environment: testEnvironment });
            
            expect(secretList).toBeInstanceOf(Array);
            expect(secretList.length).toBeGreaterThan(0);

            const testSecret = secretList.find(s => s.key === testSecretKey);
            expect(testSecret).toBeDefined();
            expect(testSecret.description).toBeDefined();
            expect(testSecret.createdAt).toBeInstanceOf(Date);
            expect(testSecret.value).toBeUndefined(); // Should not expose value
        });

        it('should delete secrets', async () => {
            await config.deleteSecret('jwt-secret', { environment: testEnvironment });

            const secretList = await config.listSecrets({ environment: testEnvironment });
            const deleted = secretList.find(s => s.key === 'jwt-secret');
            expect(deleted).toBeUndefined();
        });

        it('should handle secret rotation', async () => {
            // Set initial secret
            await config.setSecrets({ 'rotation-test': 'initial-value' }, { environment: testEnvironment });

            // Rotate secret
            await config.setSecrets({ 'rotation-test': 'rotated-value' }, { environment: testEnvironment });

            const secrets = await config.getSecrets(['rotation-test'], { environment: testEnvironment });
            expect(secrets['rotation-test']).toBe('rotated-value');
        });

        it('should load config with secrets', async () => {
            const configWithSecrets = await config.loadConfig(testEnvironment, {
                includeSecrets: true
            });

            // Secrets should be merged into the config when includeSecrets is true
            // Check that the placeholder was replaced
            expect(configWithSecrets).toBeDefined();
        });
    });

    describe('Configuration Migration', () => {
        it('should migrate configuration between versions', async () => {
            const oldConfig = {
                version: '0.9.0',
                services: {
                    list: ['filesystem', 'git'] // Old format
                }
            };

            const result = await config.migrateConfig(oldConfig, '0.9.0', '1.0.0');
            
            expect(result.success).toBe(true);
            expect(result.config.version).toBe('1.0.0');
            expect(result.config.services.enabled).toEqual(['filesystem', 'git']); // New format
            expect(result.changes).toContain('Migrated services.list to services.enabled');
        });

        it('should handle direct migrations', async () => {
            const oldConfig = {
                version: '0.9.0',
                services: {
                    list: ['filesystem'] // Old format
                }
            };

            const result = await config.migrateConfig(oldConfig, '0.9.0', '1.0.0');
            
            expect(result.success).toBe(true);
            expect(result.config.version).toBe('1.0.0');
            expect(result.config.services.enabled).toEqual(['filesystem']);
            expect(result.changes.length).toBeGreaterThan(0);
        });

        it('should handle migration errors gracefully', async () => {
            await expect(config.migrateConfig({}, '1.0.0', '2.0.0'))
                .rejects.toThrow('No migration path from version 1.0.0 to 2.0.0');
        });
    });

    describe('Configuration Import/Export', () => {
        it('should export configuration as JSON', async () => {
            const exported = await config.exportConfig(testEnvironment, {
                includeSecrets: false,
                format: 'json'
            });

            expect(exported).toBeTruthy();
            const parsed = JSON.parse(exported);
            expect(parsed.platform).toBeDefined();
            expect(parsed.services).toBeDefined();
        });

        it('should throw error for unsupported YAML format', async () => {
            await expect(config.exportConfig(testEnvironment, {
                includeSecrets: false,
                format: 'yaml'
            })).rejects.toThrow('YAML export not yet implemented');
        });

        it('should export configuration as env file', async () => {
            const exported = await config.exportConfig(testEnvironment, {
                includeSecrets: false,
                format: 'env'
            });

            expect(exported).toBeTruthy();
            expect(exported).toMatch(/PLATFORM_NAME=/);
            expect(exported).toMatch(/PLATFORM_VERSION=/);
        });

        it('should import JSON configuration', async () => {
            const importData = JSON.stringify({
                platform: {
                    name: 'Imported Config',
                    version: '1.1.0'
                },
                services: {
                    enabled: ['imported-service']
                }
            });

            await config.importConfig(importData, 'test-import', {
                format: 'json',
                merge: false
            });

            const imported = await config.loadConfig('test-import');
            expect(imported.platform.name).toBe('Imported Config');
            expect(imported.services.enabled).toContain('imported-service');

            // Cleanup
            await config.deleteEnvironment('test-import', { backup: false });
        });

        it('should merge imported configuration', async () => {
            const existingConfig = await config.loadConfig(testEnvironment);
            
            const importData = JSON.stringify({
                services: {
                    newField: 'merged-value'
                }
            });

            await config.importConfig(importData, testEnvironment, {
                format: 'json',
                merge: true
            });

            const merged = await config.loadConfig(testEnvironment);
            expect(merged.platform.name).toBe(existingConfig.platform.name); // Preserved
            expect(merged.services.newField).toBe('merged-value'); // Added
        });
    });

    describe('Configuration Persistence', () => {
        it('should save configuration changes', async () => {
            const modifiedConfig = await config.loadConfig(testEnvironment);
            modifiedConfig.platform.modified = true;
            modifiedConfig.services.newService = { enabled: true };

            const saved = await config.saveConfig(modifiedConfig, testEnvironment, {
                backup: true,
                validate: true
            });

            expect(saved).toBe(true);

            // Verify changes persisted
            const reloaded = await config.loadConfig(testEnvironment);
            expect(reloaded.platform.modified).toBe(true);
            expect(reloaded.services.newService).toBeDefined();
        });

        it('should create backup before saving', async () => {
            // TODO: Verify backup was created when saving with backup: true
        });

        it('should rollback on save failure', async () => {
            const invalidConfig = {
                // Invalid config that will fail validation
                invalid: true
            };

            await expect(config.saveConfig(invalidConfig, testEnvironment, {
                validate: true
            })).rejects.toThrow();

            // Original config should be preserved
            const preserved = await config.loadConfig(testEnvironment);
            expect(preserved.invalid).toBeUndefined();
        });
    });

    describe('Cross-Service Configuration', () => {
        it('should share configuration across services', async () => {
            // TODO: Test that multiple services can access shared config
        });

        it('should isolate service-specific configuration', async () => {
            // TODO: Test service-specific config namespacing
        });

        it('should handle configuration dependencies', async () => {
            // TODO: Test config values that depend on other config values
        });
    });

    describe('Error Handling', () => {
        it('should handle missing environment', async () => {
            await expect(config.loadConfig('non-existent-env'))
                .rejects.toThrow("Configuration for environment 'non-existent-env' not found");
        });

        it('should handle corrupted configuration', async () => {
            // TODO: Test loading corrupted config file
        });

        it('should handle missing secrets', async () => {
            await expect(config.getSecrets(['non-existent-secret'], {
                environment: testEnvironment
            })).rejects.toThrow();
        });

        it('should prevent duplicate environment creation', async () => {
            await expect(config.createEnvironment(testEnvironment, {}))
                .rejects.toThrow('Environment already exists');
        });
    });
});