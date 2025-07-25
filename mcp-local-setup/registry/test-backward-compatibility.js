#!/usr/bin/env node

/**
 * Test backward compatibility with existing registry data
 */

const fs = require('fs');
const path = require('path');
const { SchemaValidator } = require('./validators');

async function testBackwardCompatibility() {
    console.log('Testing backward compatibility with existing registry data...\n');

    const tests = {
        passed: 0,
        failed: 0,
        results: []
    };

    // Test 1: Original catalog should still be valid (without transport)
    try {
        console.log('Test 1: Validating original catalog without transport data...');
        const originalCatalog = path.join(__dirname, 'enhanced-catalog.json');
        
        if (fs.existsSync(originalCatalog)) {
            const catalogData = JSON.parse(fs.readFileSync(originalCatalog, 'utf8'));
            
            // Check if services can be read without transport field
            let canReadWithoutTransport = true;
            catalogData.servers.forEach(server => {
                if (!server.id || !server.version) {
                    canReadWithoutTransport = false;
                }
            });

            if (canReadWithoutTransport) {
                tests.passed++;
                tests.results.push({ test: 'Read without transport', status: 'PASSED' });
                console.log('  ✅ Original catalog can be read without transport field');
            } else {
                tests.failed++;
                tests.results.push({ test: 'Read without transport', status: 'FAILED' });
                console.log('  ❌ Failed to read original catalog');
            }
        }
    } catch (error) {
        tests.failed++;
        tests.results.push({ test: 'Read without transport', status: 'FAILED', error: error.message });
        console.log(`  ❌ Error: ${error.message}`);
    }

    // Test 2: Enhanced catalog with transport should be valid
    try {
        console.log('\nTest 2: Validating enhanced catalog with transport data...');
        const enhancedCatalog = path.join(__dirname, 'transport-catalog.json');
        
        if (fs.existsSync(enhancedCatalog)) {
            const catalogData = JSON.parse(fs.readFileSync(enhancedCatalog, 'utf8'));
            
            // Check if all services have transport field
            let allHaveTransport = true;
            catalogData.servers.forEach(server => {
                if (!server.transport || !server.transport.type) {
                    allHaveTransport = false;
                }
            });

            if (allHaveTransport) {
                tests.passed++;
                tests.results.push({ test: 'Read with transport', status: 'PASSED' });
                console.log('  ✅ Enhanced catalog has valid transport data');
            } else {
                tests.failed++;
                tests.results.push({ test: 'Read with transport', status: 'FAILED' });
                console.log('  ❌ Not all services have transport data');
            }
        }
    } catch (error) {
        tests.failed++;
        tests.results.push({ test: 'Read with transport', status: 'FAILED', error: error.message });
        console.log(`  ❌ Error: ${error.message}`);
    }

    // Test 3: Service registry interface can handle both formats
    try {
        console.log('\nTest 3: Testing service registry interface compatibility...');
        const ServiceRegistryInterface = require('./service-registry.interface');
        const registry = new ServiceRegistryInterface(__dirname);

        // Test registering service without transport
        const legacyService = {
            id: 'test-legacy',
            name: 'Test Legacy Service',
            version: '1.0.0',
            category: 'custom',
            source: { type: 'npm', package: 'test-package' },
            docker: { image: 'test:latest' },
            config: { port: 9999 }
        };

        await registry.registerService(legacyService);
        const transport = await registry.getServiceTransport('test-legacy');
        
        if (transport && transport.type) {
            tests.passed++;
            tests.results.push({ test: 'Auto-detect transport', status: 'PASSED' });
            console.log(`  ✅ Auto-detected transport type: ${transport.type}`);
        } else {
            tests.failed++;
            tests.results.push({ test: 'Auto-detect transport', status: 'FAILED' });
            console.log('  ❌ Failed to auto-detect transport');
        }

        // Test registering service with transport
        const modernService = {
            id: 'test-modern',
            name: 'Test Modern Service',
            version: '1.0.0',
            category: 'custom',
            source: { type: 'npm', package: 'test-package' },
            docker: { image: 'test:latest' },
            config: { port: 9998 },
            transport: {
                type: 'http',
                http: {
                    url: 'http://localhost:9998/mcp',
                    timeout: 30000
                }
            }
        };

        await registry.registerService(modernService);
        const modernTransport = await registry.getServiceTransport('test-modern');
        
        if (modernTransport && modernTransport.type === 'http') {
            tests.passed++;
            tests.results.push({ test: 'Register with transport', status: 'PASSED' });
            console.log('  ✅ Successfully registered service with transport');
        } else {
            tests.failed++;
            tests.results.push({ test: 'Register with transport', status: 'FAILED' });
            console.log('  ❌ Failed to register service with transport');
        }

    } catch (error) {
        tests.failed++;
        tests.results.push({ test: 'Registry interface', status: 'FAILED', error: error.message });
        console.log(`  ❌ Error: ${error.message}`);
    }

    // Test 4: Migration script preserves data integrity
    try {
        console.log('\nTest 4: Testing migration script data integrity...');
        const testCatalog = {
            version: '2.0',
            servers: [{
                id: 'test-service',
                name: 'Test Service',
                version: '1.0.0',
                category: 'custom',
                config: { port: 8000 },
                customField: 'should-be-preserved'
            }]
        };

        // Simulate migration
        const TransportDetector = require('./transport-detector');
        const migrated = { ...testCatalog };
        migrated.servers = migrated.servers.map(server => {
            if (!server.transport) {
                const detection = TransportDetector.detect(server);
                server.transport = detection.suggestedConfig;
            }
            return server;
        });

        // Check if custom fields are preserved
        if (migrated.servers[0].customField === 'should-be-preserved') {
            tests.passed++;
            tests.results.push({ test: 'Data preservation', status: 'PASSED' });
            console.log('  ✅ Migration preserves existing data');
        } else {
            tests.failed++;
            tests.results.push({ test: 'Data preservation', status: 'FAILED' });
            console.log('  ❌ Migration lost data');
        }

    } catch (error) {
        tests.failed++;
        tests.results.push({ test: 'Data preservation', status: 'FAILED', error: error.message });
        console.log(`  ❌ Error: ${error.message}`);
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('BACKWARD COMPATIBILITY TEST RESULTS');
    console.log('='.repeat(60));
    console.log(`Total tests: ${tests.passed + tests.failed}`);
    console.log(`Passed: ${tests.passed}`);
    console.log(`Failed: ${tests.failed}`);
    console.log('\nDetailed results:');
    tests.results.forEach(result => {
        const icon = result.status === 'PASSED' ? '✅' : '❌';
        console.log(`  ${icon} ${result.test}: ${result.status}`);
        if (result.error) {
            console.log(`     Error: ${result.error}`);
        }
    });

    console.log('\n' + '='.repeat(60));
    
    return tests.failed === 0;
}

// Run tests
testBackwardCompatibility().then(success => {
    process.exit(success ? 0 : 1);
}).catch(error => {
    console.error('Test execution failed:', error);
    process.exit(1);
});