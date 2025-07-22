/**
 * Unit tests for ConfigurationManager
 */

const ConfigurationManager = require('../../../config/advanced/configuration-manager');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

// Mock fs module
jest.mock('fs').promises;

describe('ConfigurationManager', () => {
    let configManager;
    let mockConfig;
    
    beforeEach(() => {
        configManager = new ConfigurationManager({
            basePath: '/test/environments',
            schemasPath: '/test/schemas',
            secretsPath: '/test/secrets',
            encryptionKey: crypto.randomBytes(32).toString('hex')
        });
        
        mockConfig = {
            environment: 'test',
            version: '1.0.0',
            server: {
                host: 'localhost',
                port: 3000
            },
            database: {
                host: 'localhost',
                password: '${DB_PASSWORD}'
            }
        };
        
        // Reset all mocks
        jest.clearAllMocks();
    });
    
    describe('loadConfig', () => {
        it('should load configuration for an environment', async () => {
            fs.access.mockResolvedValue(undefined);
            fs.readFile.mockResolvedValue(JSON.stringify(mockConfig));
            
            const config = await configManager.loadConfig('test');
            
            expect(config.environment).toBe('test');
            expect(config._metadata).toBeDefined();
            expect(config._metadata.environment).toBe('test');
            expect(config._metadata.loadedAt).toBeInstanceOf(Date);
        });
        
        it('should throw error for non-existent environment', async () => {
            fs.access.mockRejectedValue({ code: 'ENOENT' });
            
            await expect(configManager.loadConfig('nonexistent'))
                .rejects.toThrow("Configuration for environment 'nonexistent' not found");
        });
        
        it('should include secrets when requested', async () => {
            fs.access.mockResolvedValue(undefined);
            fs.readFile.mockResolvedValue(JSON.stringify(mockConfig));
            fs.readdir.mockResolvedValue(['DB_PASSWORD.enc']);
            
            // Mock secret decryption
            configManager._decrypt = jest.fn().mockReturnValue('decrypted-password');
            configManager._loadSecretsForEnvironment = jest.fn()
                .mockResolvedValue({ DB_PASSWORD: 'secret-value' });
            
            const config = await configManager.loadConfig('test', { includeSecrets: true });
            
            expect(configManager._loadSecretsForEnvironment).toHaveBeenCalledWith('test');
        });
        
        it('should apply runtime overrides', async () => {
            fs.access.mockResolvedValue(undefined);
            fs.readFile.mockResolvedValue(JSON.stringify(mockConfig));
            
            const overrides = {
                server: {
                    port: 4000
                }
            };
            
            const config = await configManager.loadConfig('test', { overrides });
            
            expect(config.server.port).toBe(4000);
            expect(config.server.host).toBe('localhost'); // Original value preserved
        });
        
        it('should validate configuration when requested', async () => {
            fs.access.mockResolvedValue(undefined);
            fs.readFile.mockResolvedValue(JSON.stringify(mockConfig));
            
            configManager.validateConfig = jest.fn().mockResolvedValue({
                valid: true,
                errors: [],
                warnings: []
            });
            
            await configManager.loadConfig('test', { validate: true });
            
            expect(configManager.validateConfig).toHaveBeenCalledWith(
                expect.objectContaining({ environment: 'test' }),
                '1.0.0'
            );
        });
    });
    
    describe('validateConfig', () => {
        const mockSchema = {
            version: '1.0.0',
            properties: {
                environment: { type: 'string' },
                version: { type: 'string' },
                server: {
                    type: 'object',
                    properties: {
                        host: { type: 'string' },
                        port: { type: 'number' }
                    }
                }
            },
            required: ['environment', 'version'],
            defaults: {
                logging: {
                    level: 'info'
                }
            }
        };
        
        beforeEach(() => {
            configManager.getSchema = jest.fn().mockResolvedValue(mockSchema);
        });
        
        it('should validate required properties', async () => {
            const invalidConfig = { server: { host: 'localhost' } };
            
            const result = await configManager.validateConfig(invalidConfig);
            
            expect(result.valid).toBe(false);
            expect(result.errors).toHaveLength(2);
            expect(result.errors[0].path).toBe('environment');
            expect(result.errors[1].path).toBe('version');
        });
        
        it('should validate property types', async () => {
            const invalidConfig = {
                ...mockConfig,
                server: {
                    host: 'localhost',
                    port: '3000' // Should be number
                }
            };
            
            const result = await configManager.validateConfig(invalidConfig);
            
            expect(result.valid).toBe(false);
            expect(result.errors).toContainEqual({
                path: 'server.port',
                message: "Expected type 'number' but got 'string'"
            });
        });
        
        it('should add warnings for missing defaults', async () => {
            const result = await configManager.validateConfig(mockConfig);
            
            expect(result.warnings).toContainEqual({
                path: 'logging',
                message: "Using default value for 'logging'"
            });
        });
    });
    
    describe('saveConfig', () => {
        it('should save configuration to file', async () => {
            fs.mkdir.mockResolvedValue(undefined);
            fs.writeFile.mockResolvedValue(undefined);
            
            const result = await configManager.saveConfig(mockConfig, 'test');
            
            expect(result).toBe(true);
            expect(fs.writeFile).toHaveBeenCalledWith(
                '/test/environments/test.json',
                expect.any(String),
                'utf8'
            );
            
            // Check that metadata was removed
            const savedData = JSON.parse(fs.writeFile.mock.calls[0][1]);
            expect(savedData._metadata).toBeUndefined();
        });
        
        it('should create backup when requested', async () => {
            fs.mkdir.mockResolvedValue(undefined);
            fs.readFile.mockResolvedValue(JSON.stringify(mockConfig));
            fs.writeFile.mockResolvedValue(undefined);
            
            await configManager.saveConfig(mockConfig, 'test', { backup: true });
            
            expect(fs.readFile).toHaveBeenCalled();
            expect(fs.writeFile).toHaveBeenCalledTimes(2); // Original + backup
        });
        
        it('should validate before saving when requested', async () => {
            configManager.validateConfig = jest.fn().mockResolvedValue({
                valid: false,
                errors: [{ path: 'test', message: 'Invalid' }]
            });
            
            await expect(configManager.saveConfig(mockConfig, 'test', { validate: true }))
                .rejects.toThrow('Configuration validation failed');
        });
    });
    
    describe('getSecrets and setSecrets', () => {
        it('should encrypt and save secrets', async () => {
            fs.mkdir.mockResolvedValue(undefined);
            fs.readFile.mockRejectedValue({ code: 'ENOENT' }); // No existing metadata
            fs.writeFile.mockResolvedValue(undefined);
            
            const secrets = {
                API_KEY: 'secret-api-key',
                DB_PASSWORD: 'secret-password'
            };
            
            await configManager.setSecrets(secrets);
            
            expect(fs.writeFile).toHaveBeenCalledTimes(3); // 2 secrets + 1 metadata
            expect(fs.writeFile).toHaveBeenCalledWith(
                expect.stringContaining('API_KEY.enc'),
                expect.any(String),
                'utf8'
            );
        });
        
        it('should decrypt and retrieve secrets', async () => {
            const encryptedData = configManager._encrypt('secret-value');
            fs.readFile.mockResolvedValue(encryptedData);
            
            const secrets = await configManager.getSecrets(['API_KEY']);
            
            expect(secrets.API_KEY).toBe('secret-value');
        });
        
        it('should throw error for non-existent secret', async () => {
            fs.readFile.mockRejectedValue({ code: 'ENOENT' });
            
            await expect(configManager.getSecrets(['NONEXISTENT']))
                .rejects.toThrow("Secret 'NONEXISTENT' not found");
        });
    });
    
    describe('migrateConfig', () => {
        it('should execute migration successfully', async () => {
            const mockMigration = {
                migrate: jest.fn().mockResolvedValue({
                    success: true,
                    config: { ...mockConfig, version: '1.1.0' },
                    changes: ['Updated version']
                })
            };
            
            jest.doMock(
                path.join(configManager.basePath, '../../scripts/migration/migrate-1.0.0-to-1.1.0.js'),
                () => mockMigration,
                { virtual: true }
            );
            
            const result = await configManager.migrateConfig(mockConfig, '1.0.0', '1.1.0');
            
            expect(result.success).toBe(true);
            expect(result.config.version).toBe('1.1.0');
        });
        
        it('should throw error for missing migration', async () => {
            await expect(configManager.migrateConfig(mockConfig, '1.0.0', '2.0.0'))
                .rejects.toThrow('No migration path from version 1.0.0 to 2.0.0');
        });
    });
    
    describe('environment management', () => {
        it('should list available environments', async () => {
            fs.readdir.mockResolvedValue(['dev.json', 'prod.json', 'test.json', 'README.md']);
            
            const environments = await configManager.listEnvironments();
            
            expect(environments).toEqual(['dev', 'prod', 'test']);
        });
        
        it('should create new environment', async () => {
            fs.access.mockRejectedValue({ code: 'ENOENT' }); // Doesn't exist
            fs.mkdir.mockResolvedValue(undefined);
            fs.writeFile.mockResolvedValue(undefined);
            
            configManager.validateConfig = jest.fn().mockResolvedValue({
                valid: true,
                errors: []
            });
            
            await configManager.createEnvironment('staging', mockConfig);
            
            expect(fs.writeFile).toHaveBeenCalledWith(
                '/test/environments/staging.json',
                expect.stringContaining('"environment":"staging"'),
                'utf8'
            );
        });
        
        it('should throw error if environment already exists', async () => {
            fs.access.mockResolvedValue(undefined); // Exists
            
            await expect(configManager.createEnvironment('existing'))
                .rejects.toThrow("Environment 'existing' already exists");
        });
        
        it('should delete environment', async () => {
            fs.unlink.mockResolvedValue(undefined);
            fs.rmdir.mockResolvedValue(undefined);
            
            const result = await configManager.deleteEnvironment('test');
            
            expect(result).toBe(true);
            expect(fs.unlink).toHaveBeenCalledWith('/test/environments/test.json');
        });
    });
    
    describe('import/export', () => {
        it('should export configuration as JSON', async () => {
            configManager.loadConfig = jest.fn().mockResolvedValue(mockConfig);
            
            const exported = await configManager.exportConfig('test');
            
            expect(exported).toBe(JSON.stringify(mockConfig, null, 2));
        });
        
        it('should export configuration as ENV format', async () => {
            configManager.loadConfig = jest.fn().mockResolvedValue(mockConfig);
            
            const exported = await configManager.exportConfig('test', { format: 'env' });
            
            expect(exported).toContain('ENVIRONMENT="test"');
            expect(exported).toContain('SERVER_HOST="localhost"');
            expect(exported).toContain('SERVER_PORT=3000');
        });
        
        it('should import JSON configuration', async () => {
            fs.mkdir.mockResolvedValue(undefined);
            fs.writeFile.mockResolvedValue(undefined);
            configManager.validateConfig = jest.fn().mockResolvedValue({
                valid: true,
                errors: []
            });
            
            const data = JSON.stringify(mockConfig);
            await configManager.importConfig(data, 'imported');
            
            expect(fs.writeFile).toHaveBeenCalledWith(
                '/test/environments/imported.json',
                expect.stringContaining('"environment":"test"'),
                'utf8'
            );
        });
        
        it('should merge imported configuration when requested', async () => {
            const existingConfig = {
                environment: 'test',
                version: '1.0.0',
                existing: 'value'
            };
            
            configManager.loadConfig = jest.fn().mockResolvedValue(existingConfig);
            fs.mkdir.mockResolvedValue(undefined);
            fs.writeFile.mockResolvedValue(undefined);
            configManager.validateConfig = jest.fn().mockResolvedValue({
                valid: true,
                errors: []
            });
            
            await configManager.importConfig(JSON.stringify(mockConfig), 'test', { merge: true });
            
            const savedData = JSON.parse(fs.writeFile.mock.calls[0][1]);
            expect(savedData.existing).toBe('value'); // Preserved
            expect(savedData.server).toEqual(mockConfig.server); // Merged
        });
    });
    
    describe('encryption/decryption', () => {
        it('should encrypt and decrypt values correctly', () => {
            const plaintext = 'sensitive-data';
            
            const encrypted = configManager._encrypt(plaintext);
            expect(encrypted).not.toBe(plaintext);
            expect(encrypted).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
            
            const decrypted = configManager._decrypt(encrypted);
            expect(decrypted).toBe(plaintext);
        });
        
        it('should throw error if encryption key not set', () => {
            const noKeyManager = new ConfigurationManager();
            
            expect(() => noKeyManager._encrypt('test'))
                .toThrow('Encryption key not configured');
        });
    });
});