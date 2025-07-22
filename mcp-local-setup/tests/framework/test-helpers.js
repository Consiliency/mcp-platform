/**
 * Test Helper Functions
 * Common utilities for testing MCP services
 */

const axios = require('axios');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const yaml = require('js-yaml');

/**
 * Create a mock MCP service for testing
 * @param {Object} config - Service configuration
 * @returns {Object} Mock service instance
 */
function createMockService(config = {}) {
    const defaults = {
        name: 'test-service',
        version: '1.0.0',
        port: 3999,
        endpoints: {
            '/health': { status: 'healthy' },
            '/test': { message: 'test response' }
        }
    };

    const service = { ...defaults, ...config };
    
    return {
        ...service,
        start: jest.fn().mockResolvedValue(true),
        stop: jest.fn().mockResolvedValue(true),
        health: jest.fn().mockResolvedValue({
            status: 'healthy',
            service: service.name,
            version: service.version,
            timestamp: new Date().toISOString()
        }),
        getManifest: jest.fn().mockReturnValue({
            id: service.name,
            version: service.version,
            port: service.port,
            endpoints: Object.keys(service.endpoints)
        })
    };
}

/**
 * Create a test profile
 * @param {Array<string>} services - List of service IDs
 * @param {Object} options - Profile options
 * @returns {Promise<string>} Path to created profile
 */
async function createTestProfile(services = [], options = {}) {
    const profileName = options.name || `test-${Date.now()}`;
    const profile = {
        name: profileName,
        description: options.description || 'Test profile',
        services,
        settings: {
            auto_start: options.autoStart || false,
            restart_policy: options.restartPolicy || 'no'
        }
    };

    const profilePath = path.join(
        process.env.MCP_HOME || path.join(process.env.HOME, '.mcp-platform'),
        'profiles',
        `${profileName}.yml`
    );

    await fs.writeFile(profilePath, yaml.dump(profile));
    return profilePath;
}

/**
 * Wait for a service to become healthy
 * @param {string} service - Service name or URL
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<boolean>} True if healthy within timeout
 */
async function waitForHealthy(service, timeout = 30000) {
    const startTime = Date.now();
    const healthUrl = service.startsWith('http') 
        ? service 
        : `http://localhost:8080/health/service/${service}`;

    while (Date.now() - startTime < timeout) {
        try {
            const response = await axios.get(healthUrl);
            if (response.data.status === 'healthy') {
                return true;
            }
        } catch (error) {
            // Service not ready yet
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return false;
}

/**
 * Start a docker-compose service
 * @param {string} serviceName - Service name
 * @param {Object} options - Start options
 * @returns {Promise<boolean>} Success status
 */
async function startService(serviceName, options = {}) {
    return new Promise((resolve, reject) => {
        const args = ['compose', 'up', '-d', serviceName];
        const proc = spawn('docker', args, {
            cwd: options.cwd || process.env.MCP_HOME,
            stdio: options.silent ? 'pipe' : 'inherit'
        });

        proc.on('close', (code) => {
            resolve(code === 0);
        });

        proc.on('error', reject);
    });
}

/**
 * Stop a docker-compose service
 * @param {string} serviceName - Service name
 * @param {Object} options - Stop options
 * @returns {Promise<boolean>} Success status
 */
async function stopService(serviceName, options = {}) {
    return new Promise((resolve, reject) => {
        const args = ['compose', 'stop', serviceName];
        const proc = spawn('docker', args, {
            cwd: options.cwd || process.env.MCP_HOME,
            stdio: options.silent ? 'pipe' : 'inherit'
        });

        proc.on('close', (code) => {
            resolve(code === 0);
        });

        proc.on('error', reject);
    });
}

/**
 * Clean up test resources
 * @param {Array<string>} resources - List of resource identifiers
 */
async function cleanupTestResources(resources = []) {
    for (const resource of resources) {
        try {
            if (resource.startsWith('profile:')) {
                const profileName = resource.substring(8);
                const profilePath = path.join(
                    process.env.MCP_HOME || path.join(process.env.HOME, '.mcp-platform'),
                    'profiles',
                    `${profileName}.yml`
                );
                await fs.unlink(profilePath);
            } else if (resource.startsWith('service:')) {
                const serviceName = resource.substring(8);
                await stopService(serviceName, { silent: true });
            }
        } catch (error) {
            // Ignore cleanup errors
        }
    }
}

/**
 * Create a test environment file
 * @param {Object} vars - Environment variables
 * @returns {Promise<string>} Path to created env file
 */
async function createTestEnv(vars = {}) {
    const envPath = path.join(
        process.env.MCP_HOME || path.join(process.env.HOME, '.mcp-platform'),
        `.env.test.${Date.now()}`
    );

    const envContent = Object.entries(vars)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');

    await fs.writeFile(envPath, envContent);
    return envPath;
}

module.exports = {
    createMockService,
    createTestProfile,
    waitForHealthy,
    startService,
    stopService,
    cleanupTestResources,
    createTestEnv
};