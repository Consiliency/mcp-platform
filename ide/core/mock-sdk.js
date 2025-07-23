// Mock SDK Implementation for Testing
// Purpose: Provides a mock SDK that implements the SDKCoreInterface for testing

const SDKCoreInterface = require('../../mcp-local-setup/interfaces/phase5/sdk-core.interface');

class MockSDK extends SDKCoreInterface {
  constructor(config) {
    // Don't call super() as the interface throws
    this.config = config;
    this.services = new Map([
      ['postgres-mcp', {
        id: 'postgres-mcp',
        name: 'PostgreSQL MCP',
        description: 'PostgreSQL database service for MCP',
        version: '14.5',
        status: 'available',
        config: {
          host: { type: 'string', description: 'Database host', default: 'localhost' },
          port: { type: 'number', description: 'Database port', default: 5432 },
          database: { type: 'string', description: 'Database name', required: true },
          username: { type: 'string', description: 'Database username' },
          password: { type: 'string', description: 'Database password', secret: true }
        }
      }],
      ['mysql-mcp', {
        id: 'mysql-mcp',
        name: 'MySQL MCP',
        description: 'MySQL database service for MCP',
        version: '8.0',
        status: 'available',
        config: {
          host: { type: 'string', description: 'Database host', default: 'localhost' },
          port: { type: 'number', description: 'Database port', default: 3306 },
          database: { type: 'string', description: 'Database name', required: true }
        }
      }],
      ['redis-mcp', {
        id: 'redis-mcp',
        name: 'Redis MCP',
        description: 'Redis cache service for MCP',
        version: '7.0',
        status: 'available',
        config: {
          host: { type: 'string', description: 'Redis host', default: 'localhost' },
          port: { type: 'number', description: 'Redis port', default: 6379 },
          password: { type: 'string', description: 'Redis password', secret: true }
        }
      }],
      ['api-service', {
        id: 'api-service',
        name: 'API Service',
        description: 'REST API service for MCP',
        version: '1.0.0',
        status: 'running',
        config: {
          port: { type: 'number', description: 'API port', default: 3000 },
          basePath: { type: 'string', description: 'API base path', default: '/api' }
        }
      }],
      ['test-service', {
        id: 'test-service',
        name: 'Test Service',
        description: 'Test service for development',
        version: '1.0.0',
        status: 'running',
        config: {}
      }]
    ]);
    
    this.installedServices = new Set(['test-service', 'api-service']);
    this.healthData = new Map();
  }

  async authenticate(credentials) {
    if (!credentials.apiKey && !credentials.username) {
      throw new Error('Invalid credentials');
    }
    
    return {
      token: 'mock-token-' + Date.now(),
      expiresAt: new Date(Date.now() + 3600000) // 1 hour
    };
  }

  async refreshToken(token) {
    if (!token.startsWith('mock-token-')) {
      throw new Error('Invalid token');
    }
    
    return {
      token: 'mock-token-' + Date.now(),
      expiresAt: new Date(Date.now() + 3600000)
    };
  }

  async listServices(filters) {
    let services = Array.from(this.services.values());
    
    if (filters.category) {
      services = services.filter(s => s.category === filters.category);
    }
    
    if (filters.tag && filters.tag.length > 0) {
      services = services.filter(s => 
        s.tags && filters.tag.some(tag => s.tags.includes(tag))
      );
    }
    
    if (filters.status) {
      services = services.filter(s => s.status === filters.status);
    }
    
    return services;
  }

  async getService(serviceId) {
    const service = this.services.get(serviceId);
    if (!service) {
      throw new Error(`Service not found: ${serviceId}`);
    }
    return { ...service };
  }

  async installService(serviceId, config) {
    const service = this.services.get(serviceId);
    if (!service) {
      throw new Error(`Service not found: ${serviceId}`);
    }
    
    this.installedServices.add(serviceId);
    
    return {
      success: true,
      message: `Successfully installed ${serviceId}`
    };
  }

  async uninstallService(serviceId) {
    if (!this.installedServices.has(serviceId)) {
      throw new Error(`Service not installed: ${serviceId}`);
    }
    
    this.installedServices.delete(serviceId);
    
    return {
      success: true,
      message: `Successfully uninstalled ${serviceId}`
    };
  }

  async callService(serviceId, method, params) {
    if (!this.installedServices.has(serviceId)) {
      throw new Error(`Service not installed: ${serviceId}`);
    }
    
    // Mock responses for specific methods
    switch (method) {
      case 'getDebugEndpoint':
        return {
          debugPort: 9229,
          protocol: 'inspector',
          host: 'localhost'
        };
        
      case 'getEndpoints':
        return [
          { path: '/health', method: 'GET', description: 'Health check' },
          { path: '/api/v1', method: 'GET', description: 'API root' }
        ];
        
      case 'stopDebugSession':
        return { success: true };
        
      default:
        return { result: 'mock response', params };
    }
  }

  on(event, callback) {
    // Mock event handler
    this._eventHandlers = this._eventHandlers || {};
    this._eventHandlers[event] = this._eventHandlers[event] || [];
    this._eventHandlers[event].push(callback);
  }

  off(event, callback) {
    if (this._eventHandlers && this._eventHandlers[event]) {
      const index = this._eventHandlers[event].indexOf(callback);
      if (index !== -1) {
        this._eventHandlers[event].splice(index, 1);
      }
    }
  }

  async getHealth(serviceId) {
    if (serviceId) {
      if (!this.installedServices.has(serviceId)) {
        throw new Error(`Service not installed: ${serviceId}`);
      }
      
      // Return mock health data
      return {
        status: 'healthy',
        details: {
          uptime: 3600,
          memory: { used: 100, total: 500 },
          cpu: 15.5,
          lastCheck: new Date().toISOString()
        }
      };
    }
    
    // Platform health
    return {
      status: 'healthy',
      details: {
        services: this.installedServices.size,
        platform: 'mock',
        version: '1.0.0'
      }
    };
  }
}

module.exports = MockSDK;