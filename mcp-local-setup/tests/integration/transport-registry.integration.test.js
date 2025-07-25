/**
 * Integration tests for transport-enhanced registry
 */

const fs = require('fs');
const path = require('path');
const ServiceRegistryInterface = require('../../registry/service-registry.interface');
const TransportDetector = require('../../registry/transport-detector');
const TransportValidator = require('../../registry/validators/transport-validator');

describe('Transport-Enhanced Registry Integration', () => {
    let registry;
    const testRegistryPath = path.join(__dirname, '../fixtures/test-registry');

    beforeEach(() => {
        registry = new ServiceRegistryInterface(testRegistryPath);
    });

    describe('Service Registration with Transport', () => {
        test('should register service with explicit transport configuration', async () => {
            const service = {
                id: 'http-service',
                name: 'HTTP Test Service',
                version: '1.0.0',
                category: 'custom',
                source: { type: 'npm', package: 'test-http' },
                docker: { image: 'test:latest' },
                config: { port: 3000 },
                transport: {
                    type: 'http',
                    http: {
                        url: 'http://localhost:3000/mcp',
                        headers: { 'Content-Type': 'application/json' },
                        timeout: 30000
                    }
                }
            };

            const result = await registry.registerService(service);
            expect(result).toBe(true);

            const transport = await registry.getServiceTransport('http-service');
            expect(transport.type).toBe('http');
            expect(transport.config.url).toBe('http://localhost:3000/mcp');
            expect(transport.autoDetected).toBe(false);
        });

        test('should auto-detect transport when not specified', async () => {
            const service = {
                id: 'auto-detect-service',
                name: 'Auto-Detect Service',
                version: '1.0.0',
                category: 'custom',
                source: { type: 'local', path: './server.js' },
                docker: { image: 'test:latest' },
                config: { 
                    port: 3001,
                    environment: { NODE_ENV: 'production' }
                }
            };

            const result = await registry.registerService(service);
            expect(result).toBe(true);

            const transport = await registry.getServiceTransport('auto-detect-service');
            expect(transport.type).toBeDefined();
            expect(transport.autoDetected).toBe(true);
        });

        test('should reject invalid transport configuration', async () => {
            const service = {
                id: 'invalid-transport',
                name: 'Invalid Transport Service',
                version: '1.0.0',
                category: 'custom',
                source: { type: 'npm', package: 'test-invalid' },
                docker: { image: 'test:latest' },
                config: { port: 3002 },
                transport: {
                    type: 'http',
                    http: {
                        // Missing required 'url' field
                        timeout: 30000
                    }
                }
            };

            await expect(registry.registerService(service))
                .rejects.toThrow('Invalid transport configuration');
        });
    });

    describe('Transport Detection', () => {
        test('should detect stdio transport for local executables', () => {
            const service = {
                id: 'local-exec',
                source: { type: 'local', path: './bin/server' },
                config: { 
                    environment: { MCP_MODE: 'stdio' }
                }
            };

            const detection = TransportDetector.detect(service);
            expect(detection.type).toBe('stdio');
            expect(detection.confidence).toBeGreaterThan(50);
        });

        test('should detect http transport for services with ports', () => {
            const service = {
                id: 'web-service',
                config: { port: 8080 },
                healthCheck: { path: '/health' }
            };

            const detection = TransportDetector.detect(service);
            expect(detection.type).toBe('http');
            expect(detection.reasoning).toContain('Health check path suggests HTTP transport');
        });

        test('should detect websocket transport for real-time services', () => {
            const service = {
                id: 'slack-bot',
                source: { package: 'slack-mcp-server' },
                config: { 
                    environment: { MCP_MODE: 'websocket' }
                }
            };

            const detection = TransportDetector.detect(service);
            expect(detection.type).toBe('websocket');
            expect(detection.confidence).toBeGreaterThan(50);
        });
    });

    describe('Transport Queries', () => {
        beforeEach(async () => {
            // Register test services
            await registry.registerService({
                id: 'http-1',
                name: 'HTTP Service 1',
                version: '1.0.0',
                category: 'custom',
                config: { port: 4001 },
                transport: { type: 'http', http: { url: 'http://localhost:4001' } }
            });

            await registry.registerService({
                id: 'http-2',
                name: 'HTTP Service 2',
                version: '1.0.0',
                category: 'custom',
                config: { port: 4002 },
                transport: { type: 'http', http: { url: 'http://localhost:4002' } }
            });

            await registry.registerService({
                id: 'ws-1',
                name: 'WebSocket Service',
                version: '1.0.0',
                category: 'custom',
                config: { port: 4003 },
                transport: { type: 'websocket', websocket: { url: 'ws://localhost:4003' } }
            });
        });

        test('should get services by transport type', async () => {
            const httpServices = await registry.getServicesByTransport('http');
            expect(httpServices).toHaveLength(2);
            expect(httpServices.map(s => s.id)).toContain('http-1');
            expect(httpServices.map(s => s.id)).toContain('http-2');

            const wsServices = await registry.getServicesByTransport('websocket');
            expect(wsServices).toHaveLength(1);
            expect(wsServices[0].id).toBe('ws-1');
        });

        test('should get transport statistics', async () => {
            const stats = await registry.getTransportStats();
            expect(stats.total).toBe(3);
            expect(stats.byType.http).toBe(2);
            expect(stats.byType.websocket).toBe(1);
            expect(stats.byType.stdio).toBe(0);
        });
    });

    describe('Transport Compatibility', () => {
        beforeEach(async () => {
            await registry.registerService({
                id: 'http-server',
                name: 'HTTP Server',
                version: '1.0.0',
                category: 'custom',
                config: { port: 5001 },
                transport: { type: 'http', http: { url: 'http://localhost:5001' } }
            });

            await registry.registerService({
                id: 'http-client',
                name: 'HTTP Client',
                version: '1.0.0',
                category: 'custom',
                config: { port: 5002 },
                transport: { type: 'http', http: { url: 'http://localhost:5002' } }
            });

            await registry.registerService({
                id: 'ws-server',
                name: 'WebSocket Server',
                version: '1.0.0',
                category: 'custom',
                config: { port: 5003 },
                transport: { type: 'websocket', websocket: { url: 'ws://localhost:5003' } }
            });
        });

        test('should validate compatible transports', async () => {
            const compatibility = await registry.validateTransportCompatibility(
                'http-client',
                'http-server'
            );
            expect(compatibility.compatible).toBe(true);
            expect(compatibility.reason).toContain('compatible');
        });

        test('should detect incompatible transports', async () => {
            const compatibility = await registry.validateTransportCompatibility(
                'http-client',
                'ws-server'
            );
            expect(compatibility.compatible).toBe(false);
            expect(compatibility.reason).toContain('cannot connect');
        });
    });

    describe('Transport Updates', () => {
        beforeEach(async () => {
            await registry.registerService({
                id: 'update-test',
                name: 'Update Test Service',
                version: '1.0.0',
                category: 'custom',
                config: { port: 6001 },
                transport: { type: 'http', http: { url: 'http://localhost:6001' } }
            });
        });

        test('should update service transport configuration', async () => {
            const newTransport = {
                type: 'websocket',
                websocket: {
                    url: 'ws://localhost:6001',
                    reconnect: true,
                    pingInterval: 30000
                }
            };

            const result = await registry.updateServiceTransport('update-test', newTransport);
            expect(result).toBe(true);

            const transport = await registry.getServiceTransport('update-test');
            expect(transport.type).toBe('websocket');
            expect(transport.config.url).toBe('ws://localhost:6001');
        });

        test('should reject invalid transport updates', async () => {
            const invalidTransport = {
                type: 'websocket',
                websocket: {
                    // Missing required 'url' field
                    reconnect: true
                }
            };

            await expect(registry.updateServiceTransport('update-test', invalidTransport))
                .rejects.toThrow('Invalid transport configuration');
        });
    });

    describe('Transport Validation', () => {
        const validator = new TransportValidator();

        test('should validate stdio transport', () => {
            const transport = {
                type: 'stdio',
                stdio: {
                    command: 'node',
                    args: ['server.js'],
                    env: { NODE_ENV: 'production' }
                }
            };

            const result = validator.validate(transport);
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        test('should validate http transport with warnings', () => {
            const transport = {
                type: 'http',
                http: {
                    url: 'http://localhost:3000/mcp'
                    // Missing timeout - should generate warning
                }
            };

            const result = validator.validate(transport);
            expect(result.valid).toBe(true);
            expect(result.warnings.length).toBeGreaterThan(0);
            expect(result.warnings[0].message).toContain('timeout');
        });

        test('should detect security warnings', () => {
            const transport = {
                type: 'websocket',
                websocket: {
                    url: 'ws://production-server.com/mcp',
                    reconnect: true
                }
            };

            const result = validator.validate(transport);
            expect(result.valid).toBe(true);
            expect(result.warnings.some(w => w.message.includes('wss://'))).toBe(true);
        });
    });

    describe('Catalog Migration', () => {
        test('should migrate catalog with transport data', async () => {
            const AddTransportMigration = require('../../registry/migrations/002-add-transport');
            const migration = new AddTransportMigration();

            // Create test catalog
            const testCatalogPath = path.join(__dirname, '../fixtures/test-catalog.json');
            const testCatalog = {
                version: '2.0',
                servers: [
                    {
                        id: 'test-1',
                        name: 'Test Service 1',
                        version: '1.0.0',
                        category: 'custom',
                        config: { port: 7001 }
                    },
                    {
                        id: 'test-2',
                        name: 'Test Service 2',
                        version: '1.0.0',
                        category: 'custom',
                        config: { 
                            port: 7002,
                            environment: { MCP_MODE: 'websocket' }
                        }
                    }
                ]
            };

            // Ensure directory exists
            const fixturesDir = path.dirname(testCatalogPath);
            if (!fs.existsSync(fixturesDir)) {
                fs.mkdirSync(fixturesDir, { recursive: true });
            }

            fs.writeFileSync(testCatalogPath, JSON.stringify(testCatalog, null, 2));

            // Run migration
            const result = await migration.run(testCatalogPath);
            expect(result.success).toBe(true);
            expect(result.stats.migrated).toBe(2);

            // Verify migrated data
            const migratedData = JSON.parse(fs.readFileSync(testCatalogPath, 'utf8'));
            expect(migratedData.schemaVersion).toBe('transport-enhanced.schema.json');
            expect(migratedData.servers[0].transport).toBeDefined();
            expect(migratedData.servers[0].transport.type).toBeDefined();

            // Clean up
            fs.unlinkSync(testCatalogPath);
            if (result.backupPath && fs.existsSync(result.backupPath)) {
                fs.unlinkSync(result.backupPath);
            }
        });
    });
});