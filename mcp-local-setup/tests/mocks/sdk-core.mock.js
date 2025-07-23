/**
 * Mock SDK implementation for testing
 */

const EventEmitter = require('events');

class MockSDKCore extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.authenticated = false;
  }

  async authenticate(credentials) {
    this.authenticated = true;
    return {
      token: 'mock-token-' + Date.now(),
      expiresAt: new Date(Date.now() + 3600000) // 1 hour
    };
  }

  async refreshToken(token) {
    return {
      token: 'mock-refreshed-token-' + Date.now(),
      expiresAt: new Date(Date.now() + 3600000)
    };
  }

  async listServices(filters) {
    const services = [
      { id: 'postgres-mcp', name: 'PostgreSQL MCP', category: 'database', status: 'available' },
      { id: 'redis-mcp', name: 'Redis MCP', category: 'cache', status: 'available' },
      { id: 'git-mcp', name: 'Git MCP', category: 'vcs', status: 'available' }
    ];

    if (filters && filters.category) {
      return services.filter(s => s.category === filters.category);
    }

    return services;
  }

  async getService(serviceId) {
    const services = await this.listServices();
    return services.find(s => s.id === serviceId);
  }

  async installService(serviceId, config) {
    // Simulate service installation
    setTimeout(() => {
      this.emit('service.installed', { serviceId, config });
    }, 100);

    return {
      success: true,
      message: `Service ${serviceId} installed successfully`
    };
  }

  async uninstallService(serviceId) {
    return {
      success: true,
      message: `Service ${serviceId} uninstalled successfully`
    };
  }

  async callService(serviceId, method, params) {
    return {
      result: `Called ${method} on ${serviceId}`,
      params
    };
  }

  async getHealth(serviceId) {
    if (serviceId) {
      return {
        status: 'healthy',
        details: {
          serviceId,
          uptime: 12345,
          memory: '128MB',
          cpu: '5%'
        }
      };
    }

    return {
      status: 'healthy',
      details: {
        platform: 'MCP',
        version: '1.0.0',
        services: 5
      }
    };
  }
}

module.exports = MockSDKCore;