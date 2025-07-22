/**
 * Unit tests for ConfigValidator
 */

const ConfigValidator = require('../../../config/advanced/config-validator');

describe('ConfigValidator', () => {
    let validator;
    
    beforeEach(() => {
        validator = new ConfigValidator();
    });
    
    describe('validateEnvironmentConstraints', () => {
        it('should validate production constraints', () => {
            const config = {
                features: {
                    strictValidation: false,
                    debugMode: true
                },
                server: {
                    protocol: 'http'
                },
                logging: {
                    level: 'debug'
                }
            };
            
            const result = validator.validateEnvironmentConstraints(config, 'production');
            
            expect(result.valid).toBe(false);
            expect(result.errors).toContainEqual({
                path: 'features.strictValidation',
                message: 'Strict validation must be enabled in production'
            });
            expect(result.errors).toContainEqual({
                path: 'features.debugMode',
                message: 'Debug mode must be disabled in production'
            });
            expect(result.warnings).toContainEqual({
                path: 'server.protocol',
                message: 'Production should use HTTPS protocol'
            });
        });
        
        it('should validate development constraints', () => {
            const config = {
                features: {
                    hotReload: false
                },
                logging: {
                    level: 'info'
                }
            };
            
            const result = validator.validateEnvironmentConstraints(config, 'development');
            
            expect(result.valid).toBe(true);
            expect(result.warnings).toHaveLength(2);
            expect(result.warnings).toContainEqual({
                path: 'features.hotReload',
                message: 'Hot reload is recommended for development'
            });
        });
        
        it('should validate staging constraints', () => {
            const config = {
                features: {
                    strictValidation: false
                }
            };
            
            const result = validator.validateEnvironmentConstraints(config, 'staging');
            
            expect(result.valid).toBe(true);
            expect(result.warnings).toContainEqual({
                path: 'features.strictValidation',
                message: 'Staging should have strict validation like production'
            });
        });
    });
    
    describe('validateSecurity', () => {
        it('should detect plain text secrets', () => {
            const config = {
                database: {
                    password: 'actual-password-123',
                    apiKey: 'sk-1234567890'
                },
                services: {
                    weatherService: {
                        secret: '${WEATHER_SECRET}' // Correct placeholder usage
                    }
                }
            };
            
            const result = validator.validateSecurity(config);
            
            expect(result.warnings).toContainEqual({
                path: 'database.password',
                message: 'Possible plain text secret detected. Use ${SECRET_NAME} placeholder'
            });
            expect(result.warnings).toContainEqual({
                path: 'database.apiKey',
                message: 'Possible plain text secret detected. Use ${SECRET_NAME} placeholder'
            });
            
            // Should not warn about proper placeholder
            expect(result.warnings).not.toContainEqual(
                expect.objectContaining({ path: 'services.weatherService.secret' })
            );
        });
        
        it('should validate auth configuration', () => {
            const config = {
                security: {
                    enableAuth: true
                    // Missing authProvider
                }
            };
            
            const result = validator.validateSecurity(config);
            
            expect(result.valid).toBe(false);
            expect(result.errors).toContainEqual({
                path: 'security.authProvider',
                message: 'Auth provider must be specified when auth is enabled'
            });
        });
        
        it('should validate rate limiting configuration', () => {
            const config = {
                security: {
                    enableRateLimit: true,
                    rateLimitWindow: 500 // Too small
                }
            };
            
            const result = validator.validateSecurity(config);
            
            expect(result.warnings).toContainEqual({
                path: 'security.rateLimitWindow',
                message: 'Rate limit window should be at least 1000ms'
            });
        });
    });
    
    describe('validateServiceDependencies', () => {
        it('should validate service dependencies are met', () => {
            const config = {
                services: [
                    {
                        name: 'api-gateway',
                        enabled: true,
                        dependencies: ['auth-service', 'logging-service']
                    },
                    {
                        name: 'auth-service',
                        enabled: false // Disabled but required by api-gateway
                    },
                    {
                        name: 'logging-service',
                        enabled: true
                    }
                ]
            };
            
            const result = validator.validateServiceDependencies(config);
            
            expect(result.valid).toBe(false);
            expect(result.errors).toContainEqual({
                path: 'services.api-gateway.dependencies',
                message: "Required dependency 'auth-service' is not enabled"
            });
        });
        
        it('should pass when all dependencies are met', () => {
            const config = {
                services: [
                    {
                        name: 'api-gateway',
                        enabled: true,
                        dependencies: ['auth-service']
                    },
                    {
                        name: 'auth-service',
                        enabled: true
                    }
                ]
            };
            
            const result = validator.validateServiceDependencies(config);
            
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });
    });
    
    describe('validateCompleteness', () => {
        it('should calculate configuration coverage', () => {
            const config = {
                environment: 'test',
                version: '1.0.0',
                server: {
                    host: 'localhost'
                    // Missing port
                }
                // Missing other properties
            };
            
            const schema = {
                properties: {
                    environment: { type: 'string' },
                    version: { type: 'string' },
                    server: {
                        type: 'object',
                        properties: {
                            host: { type: 'string' },
                            port: { type: 'number' }
                        }
                    },
                    database: {
                        type: 'object',
                        properties: {
                            host: { type: 'string' },
                            port: { type: 'number' }
                        }
                    }
                }
            };
            
            const result = validator.validateCompleteness(config, schema);
            
            expect(result.coverage).toBeLessThan(80);
            expect(result.warnings).toContainEqual({
                path: '_root',
                message: expect.stringContaining('Configuration coverage is')
            });
        });
        
        it('should not warn when coverage is good', () => {
            const config = {
                environment: 'test',
                version: '1.0.0',
                server: {
                    host: 'localhost',
                    port: 3000
                },
                database: {
                    host: 'localhost',
                    port: 5432
                }
            };
            
            const schema = {
                properties: {
                    environment: { type: 'string' },
                    version: { type: 'string' },
                    server: {
                        type: 'object',
                        properties: {
                            host: { type: 'string' },
                            port: { type: 'number' }
                        }
                    },
                    database: {
                        type: 'object',
                        properties: {
                            host: { type: 'string' },
                            port: { type: 'number' }
                        }
                    }
                }
            };
            
            const result = validator.validateCompleteness(config, schema);
            
            expect(result.coverage).toBe(100);
            expect(result.warnings).toHaveLength(0);
        });
    });
    
    describe('custom validators', () => {
        it('should register and use custom validators', () => {
            const customValidator = jest.fn().mockReturnValue({
                valid: true,
                errors: []
            });
            
            validator.registerValidator('customType', customValidator);
            
            expect(validator.customValidators.has('customType')).toBe(true);
            expect(validator.customValidators.get('customType')).toBe(customValidator);
        });
    });
    
    describe('nested validation', () => {
        it('should validate deeply nested configurations', () => {
            const config = {
                services: {
                    api: {
                        auth: {
                            oauth: {
                                clientSecret: 'plain-text-secret'
                            }
                        }
                    }
                }
            };
            
            const result = validator.validateSecurity(config);
            
            expect(result.warnings).toContainEqual({
                path: 'services.api.auth.oauth.clientSecret',
                message: 'Possible plain text secret detected. Use ${SECRET_NAME} placeholder'
            });
        });
        
        it('should handle arrays in configuration', () => {
            const config = {
                services: [
                    {
                        name: 'service1',
                        enabled: true,
                        dependencies: ['service2']
                    },
                    {
                        name: 'service2',
                        enabled: true
                    }
                ]
            };
            
            const result = validator.validateServiceDependencies(config);
            
            expect(result.valid).toBe(true);
        });
    });
});