// Integration Test: SDK and CLI Plugin Integration
// Purpose: Verify that CLI plugins can use SDK functionality
// Components involved: SDK Core, CLI Plugin System

const MockSDKCore = require('../../mocks/sdk-core.mock');
const { CLIPluginInterface, CLIPluginLoader } = require('../../../interfaces/phase5/cli-plugin.interface');

describe('SDK and CLI Plugin Integration', () => {
  let sdk;
  let pluginLoader;
  let testPlugin;

  beforeEach(() => {
    sdk = new MockSDKCore({ apiKey: 'test-key' });
    pluginLoader = new CLIPluginLoader();
  });

  test('CLI plugin can authenticate using SDK', async () => {
    // Given a CLI plugin that needs authentication
    testPlugin = {
      async initialize(context) {
        // Plugin should receive SDK instance in context
        expect(context.sdk).toBeDefined();
        
        // Plugin authenticates using SDK
        const auth = await context.sdk.authenticate({ apiKey: 'plugin-key' });
        expect(auth).toHaveProperty('token');
        expect(auth).toHaveProperty('expiresAt');
      }
    };

    // When the plugin is loaded
    const context = { sdk, config: {}, logger: console };
    await testPlugin.initialize(context);
  });

  test('CLI plugin can list and install services via SDK', async () => {
    // Given a plugin that manages services
    const installCommand = {
      name: 'service:install',
      async execute(args, context) {
        // List available services
        const services = await context.sdk.listServices({ category: 'database' });
        expect(Array.isArray(services)).toBe(true);
        expect(services.length).toBeGreaterThan(0);

        // Install a service
        const result = await context.sdk.installService(args.serviceId, args.config);
        expect(result.success).toBe(true);
        expect(result.message).toContain('installed');
        
        return result;
      }
    };

    // When the command is executed
    const context = { sdk };
    const result = await installCommand.execute(
      { serviceId: 'postgres-mcp', config: { version: '14' } },
      context
    );

    // Then installation should succeed
    expect(result.success).toBe(true);
  });

  test('CLI plugin can monitor service health through SDK', async () => {
    // Given a health monitoring plugin
    const healthPlugin = {
      async checkHealth(serviceId, context) {
        const health = await context.sdk.getHealth(serviceId);
        return {
          status: health.status,
          isHealthy: health.status === 'healthy',
          details: health.details
        };
      }
    };

    // When checking health
    const context = { sdk };
    const healthStatus = await healthPlugin.checkHealth('test-service', context);

    // Then health information should be properly formatted
    expect(healthStatus).toHaveProperty('status');
    expect(healthStatus).toHaveProperty('isHealthy');
    expect(typeof healthStatus.isHealthy).toBe('boolean');
  });

  test('Plugin loader validates plugin interface implementation', async () => {
    // Given an invalid plugin
    const path = require('path');
    const invalidPluginPath = path.join(__dirname, '../../mocks/invalid-plugin.js');

    // When trying to load it
    try {
      await pluginLoader.loadPlugin(invalidPluginPath);
      fail('Should have thrown validation error');
    } catch (error) {
      // Then it should fail validation
      expect(error.message).toContain('implement required methods');
    }
  });

  test('SDK events are accessible to CLI plugins', async () => {
    // Given a plugin that listens to SDK events
    const eventPlugin = {
      eventLog: [],
      
      async initialize(context) {
        context.sdk.on('service.installed', (event) => {
          this.eventLog.push({ type: 'installed', service: event.serviceId });
        });
        
        context.sdk.on('service.error', (event) => {
          this.eventLog.push({ type: 'error', service: event.serviceId, error: event.error });
        });
      }
    };

    // When SDK emits events
    const context = { sdk };
    await eventPlugin.initialize(context);
    
    // Simulate service installation
    await sdk.installService('test-service', {});
    
    // Wait for async event to be processed
    await new Promise(resolve => setTimeout(resolve, 150));
    
    // Then plugin should receive events
    expect(eventPlugin.eventLog).toContainEqual({
      type: 'installed',
      service: 'test-service'
    });
  });
});