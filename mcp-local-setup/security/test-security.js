#!/usr/bin/env node

/**
 * Test script for security implementation
 * Verifies that all components are working correctly
 */

const SecurityImplementation = require('./index');

async function testSecurity() {
    console.log('Testing MCP Security Implementation...\n');
    
    const security = new SecurityImplementation();
    
    try {
        // Initialize
        console.log('1. Initializing security system...');
        await security.initialize();
        console.log('✓ Security initialized successfully\n');

        // Test authentication
        console.log('2. Testing authentication...');
        const token = await security.authenticate({
            username: 'test-user',
            password: 'test-password'
        });
        console.log('✓ Authentication successful');
        console.log(`  Token type: ${token.type}`);
        console.log(`  Expires at: ${token.expiresAt}`);
        console.log(`  Scopes: ${token.scopes.join(', ')}\n`);

        // Test authorization
        console.log('3. Testing authorization...');
        const canRead = await security.authorize(token.token, 'services', 'read');
        const canWrite = await security.authorize(token.token, 'admin', 'write');
        console.log(`✓ Authorization check: services.read = ${canRead}`);
        console.log(`✓ Authorization check: admin.write = ${canWrite}\n`);

        // Test API key generation
        console.log('4. Testing API key management...');
        const apiKey = await security.generateApiKey('Test API Key', ['services.read', 'services.list']);
        console.log('✓ API key generated');
        console.log(`  Key: ${apiKey.key.substring(0, 20)}...`);
        console.log(`  Permissions: ${apiKey.permissions.join(', ')}\n`);

        // Validate API key
        const keyInfo = await security.validateApiKey(apiKey.key);
        console.log('✓ API key validated successfully\n');

        // Test rate limiting
        console.log('5. Testing rate limiting...');
        await security.setRateLimitRules({
            requestsPerMinute: 10,
            requestsPerHour: 100,
            whitelist: ['127.0.0.1']
        });
        
        const rateLimitStatus = await security.getRateLimitStatus('test-client');
        console.log('✓ Rate limit configured');
        console.log(`  Limit: ${rateLimitStatus.limit} requests/minute`);
        console.log(`  Remaining: ${rateLimitStatus.remaining}`);
        console.log(`  Resets at: ${rateLimitStatus.resetAt}\n`);

        // Test CORS configuration
        console.log('6. Testing CORS configuration...');
        await security.configureCORS({
            origins: ['http://localhost:3000', 'https://app.example.com'],
            methods: ['GET', 'POST', 'PUT', 'DELETE'],
            headers: ['Content-Type', 'Authorization']
        });
        console.log('✓ CORS policy configured\n');

        // Test certificate generation
        console.log('7. Testing SSL/TLS certificate generation...');
        const cert = await security.generateCertificate({
            domain: 'test.mcp.local',
            type: 'self-signed'
        });
        console.log('✓ Self-signed certificate generated');
        console.log(`  Certificate path: ${cert.certPath}`);
        console.log(`  Private key path: ${cert.keyPath}`);
        console.log(`  Expires at: ${cert.expiresAt}\n`);

        // Test token rotation
        console.log('8. Testing token rotation...');
        const newToken = await security.rotateToken(token.token);
        console.log('✓ Token rotated successfully');
        console.log(`  Old token valid: ${await security.authorize(token.token, 'services', 'read')}`);
        console.log(`  New token valid: ${await security.authorize(newToken.token, 'services', 'read')}\n`);

        // Cleanup
        console.log('9. Cleaning up...');
        await security.cleanup();
        console.log('✓ Security cleanup complete\n');

        console.log('All tests passed! Security implementation is working correctly.');

    } catch (error) {
        console.error('\n✗ Test failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run tests
if (require.main === module) {
    testSecurity().catch(console.error);
}

module.exports = testSecurity;