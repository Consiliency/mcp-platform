/**
 * SDK Core Unit Tests
 * Tests all SDK core functionality
 */

const SDKCore = require('../sdk/core');

describe('SDK Core Functionality', () => {
  let sdk;
  
  beforeEach(() => {
    sdk = new SDKCore({ apiKey: 'test-key-12345' });
  });
  
  describe('Authentication', () => {
    test('authenticates with API key', async () => {
      const result = await sdk.authenticate({ apiKey: 'test-api-key' });
      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('expiresAt');
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(result.token).toMatch(/^sdk-/);
    });
    
    test('authenticates with username/password', async () => {
      const result = await sdk.authenticate({
        username: 'testuser',
        password: 'testpass'
      });
      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('expiresAt');
    });
    
    test('auto-authenticates when API key in config', async () => {
      const autoSdk = new SDKCore({ apiKey: 'auto-key' });
      // Wait a bit for auto-auth
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Should be able to list services without explicit auth
      const services = await autoSdk.listServices({});
      expect(Array.isArray(services)).toBe(true);
    });
    
    test('refreshes token', async () => {
      await sdk.authenticate({ apiKey: 'test-key' });
      const oldToken = sdk.authToken;
      
      const result = await sdk.refreshToken(oldToken);
      expect(result.token).not.toBe(oldToken);
      expect(result.token).toMatch(/^refreshed-/);
    });
  });
  
  describe('Service Discovery', () => {
    beforeEach(async () => {
      await sdk.authenticate({ apiKey: 'test-key' });
    });
    
    test('lists all services', async () => {
      const services = await sdk.listServices({});
      expect(Array.isArray(services)).toBe(true);
      expect(services.length).toBeGreaterThan(0);
      expect(services[0]).toHaveProperty('id');
      expect(services[0]).toHaveProperty('name');
      expect(services[0]).toHaveProperty('status');
    });
    
    test('filters services by category', async () => {
      const services = await sdk.listServices({ category: 'database' });
      expect(Array.isArray(services)).toBe(true);
      services.forEach(service => {
        expect(service.category).toBe('database');
      });
    });
    
    test('filters services by tags', async () => {
      const services = await sdk.listServices({ tag: ['sql'] });
      expect(Array.isArray(services)).toBe(true);
      services.forEach(service => {
        expect(service.tags).toContain('sql');
      });
    });
    
    test('filters services by status', async () => {
      // Install a service first
      await sdk.installService('test-service', {});
      
      const installedServices = await sdk.listServices({ status: 'installed' });
      expect(installedServices.some(s => s.id === 'test-service')).toBe(true);
      
      const availableServices = await sdk.listServices({ status: 'available' });
      expect(availableServices.every(s => s.status === 'available')).toBe(true);
    });
    
    test('gets service details', async () => {
      const service = await sdk.getService('postgres-mcp');
      expect(service.id).toBe('postgres-mcp');
      expect(service).toHaveProperty('name');
      expect(service).toHaveProperty('description');
      expect(service).toHaveProperty('version');
      expect(service).toHaveProperty('config');
    });
  });
  
  describe('Service Management', () => {
    beforeEach(async () => {
      await sdk.authenticate({ apiKey: 'test-key' });
    });
    
    test('installs a service', async () => {
      const result = await sdk.installService('postgres-mcp', {
        version: '14',
        port: 5432
      });
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('installed successfully');
      
      // Verify service is marked as installed
      const service = await sdk.getService('postgres-mcp');
      expect(service.installed).toBe(true);
    });
    
    test('prevents duplicate installation', async () => {
      await sdk.installService('redis-mcp', {});
      
      const result = await sdk.installService('redis-mcp', {});
      expect(result.success).toBe(false);
      expect(result.message).toContain('already installed');
    });
    
    test('uninstalls a service', async () => {
      await sdk.installService('mysql-mcp', {});
      
      const result = await sdk.uninstallService('mysql-mcp');
      expect(result.success).toBe(true);
      expect(result.message).toContain('uninstalled successfully');
      
      // Verify service is no longer installed
      const service = await sdk.getService('mysql-mcp');
      expect(service.installed).toBe(false);
    });
    
    test('handles uninstall of non-installed service', async () => {
      const result = await sdk.uninstallService('not-installed');
      expect(result.success).toBe(false);
      expect(result.message).toContain('not installed');
    });
  });
  
  describe('Service Interaction', () => {
    beforeEach(async () => {
      await sdk.authenticate({ apiKey: 'test-key' });
      await sdk.installService('api-service', {});
    });
    
    test('calls service method', async () => {
      const result = await sdk.callService('api-service', 'getData', {
        limit: 10,
        offset: 0
      });
      
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('serviceId', 'api-service');
      expect(result).toHaveProperty('method', 'getData');
      expect(result).toHaveProperty('result');
    });
    
    test('returns debug endpoint for debugging', async () => {
      const result = await sdk.callService('api-service', 'getDebugEndpoint', {});
      
      expect(result).toHaveProperty('debugPort', 9229);
      expect(result).toHaveProperty('protocol', 'inspector');
    });
    
    test('throws error for uninstalled service', async () => {
      await expect(
        sdk.callService('not-installed', 'method', {})
      ).rejects.toThrow('not installed');
    });
    
    test('throws error when method not provided', async () => {
      await expect(
        sdk.callService('api-service', '', {})
      ).rejects.toThrow('Method name is required');
    });
  });
  
  describe('Event Handling', () => {
    beforeEach(async () => {
      await sdk.authenticate({ apiKey: 'test-key' });
    });
    
    test('emits authentication event', async () => {
      const newSdk = new SDKCore({ apiKey: 'event-test' });
      const authEvent = jest.fn();
      
      newSdk.on('authenticated', authEvent);
      await newSdk.authenticate({ apiKey: 'event-key' });
      
      expect(authEvent).toHaveBeenCalledWith({
        userId: expect.stringContaining('api-user'),
        provider: 'api-key'
      });
    });
    
    test('emits service installation events', async () => {
      const installEvent = jest.fn();
      const errorEvent = jest.fn();
      
      sdk.on('service.installed', installEvent);
      sdk.on('service.error', errorEvent);
      
      await sdk.installService('test-service', { env: 'test' });
      
      expect(installEvent).toHaveBeenCalledWith({
        serviceId: 'test-service',
        config: { env: 'test' }
      });
      expect(errorEvent).not.toHaveBeenCalled();
    });
    
    test('emits service call events', async () => {
      await sdk.installService('test-service', {});
      
      const callEvent = jest.fn();
      sdk.on('service.called', callEvent);
      
      await sdk.callService('test-service', 'testMethod', { data: 123 });
      
      expect(callEvent).toHaveBeenCalledWith({
        serviceId: 'test-service',
        method: 'testMethod',
        params: { data: 123 }
      });
    });
    
    test('removes event listeners', async () => {
      const handler = jest.fn();
      
      sdk.on('service.installed', handler);
      await sdk.installService('test-service', {});
      expect(handler).toHaveBeenCalledTimes(1);
      
      sdk.off('service.installed', handler);
      await sdk.uninstallService('test-service');
      await sdk.installService('test-service', {});
      expect(handler).toHaveBeenCalledTimes(1); // Still 1, not 2
    });
  });
  
  describe('Health Monitoring', () => {
    beforeEach(async () => {
      await sdk.authenticate({ apiKey: 'test-key' });
    });
    
    test('gets platform health', async () => {
      const health = await sdk.getHealth();
      
      expect(health.status).toBe('healthy');
      expect(health.details).toHaveProperty('authentication', 'valid');
      expect(health.details).toHaveProperty('installedServices');
      expect(health.details).toHaveProperty('marketplaceStatus', 'connected');
      expect(health.details).toHaveProperty('regions');
      expect(health.details.regions).toHaveLength(3);
    });
    
    test('gets service health for installed service', async () => {
      await sdk.installService('postgres-mcp', {});
      
      const health = await sdk.getHealth('postgres-mcp');
      
      expect(health.status).toMatch(/healthy|disconnected/);
      expect(health.details).toHaveProperty('serviceId', 'postgres-mcp');
      expect(health.details).toHaveProperty('installedAt');
      expect(health.details.installedAt).toBeInstanceOf(Date);
    });
    
    test('gets health for uninstalled service', async () => {
      const health = await sdk.getHealth('not-installed-service');
      
      expect(health.status).toBe('not_installed');
      expect(health.details).toHaveProperty('installed', false);
      expect(health.details).toHaveProperty('connected', false);
    });
  });
  
  describe('Error Handling', () => {
    test('requires configuration', () => {
      expect(() => new SDKCore()).toThrow('Configuration is required');
    });
    
    test('requires authentication for operations', async () => {
      const unauthSdk = new SDKCore({ tenantId: 'test' });
      
      await expect(unauthSdk.listServices({}))
        .rejects.toThrow('Authentication required');
      
      await expect(unauthSdk.getService('test'))
        .rejects.toThrow('Authentication required');
      
      await expect(unauthSdk.installService('test', {}))
        .rejects.toThrow('Authentication required');
    });
    
    test('validates credentials format', async () => {
      await expect(sdk.authenticate({}))
        .rejects.toThrow('Invalid credentials');
      
      await expect(sdk.authenticate({ invalid: 'field' }))
        .rejects.toThrow('Invalid credentials');
    });
    
    test('validates service operations', async () => {
      await sdk.authenticate({ apiKey: 'test' });
      
      await expect(sdk.getService(''))
        .rejects.toThrow('Service ID is required');
      
      await expect(sdk.installService('', {}))
        .rejects.toThrow('Service ID is required');
      
      await expect(sdk.callService('', 'method', {}))
        .rejects.toThrow('Service ID is required');
    });
  });
});

// Export for running directly
if (require.main === module) {
  const { exec } = require('child_process');
  exec('jest ' + __filename, (err, stdout, stderr) => {
    console.log(stdout);
    if (stderr) console.error(stderr);
    process.exit(err ? 1 : 0);
  });
}