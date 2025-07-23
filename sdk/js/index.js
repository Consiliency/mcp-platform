/**
 * MCP JavaScript SDK
 * High-level JavaScript API for MCP services
 */

const SDKCore = require('../core');

class MCPClient {
  constructor(config = {}) {
    // Initialize with sensible defaults
    this.config = {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl || 'https://api.mcp.io',
      timeout: config.timeout || 30000,
      retryAttempts: config.retryAttempts || 3,
      tenantId: config.tenantId,
      ...config
    };
    
    this.core = new SDKCore(this.config);
    this.services = new Map();
  }
  
  /**
   * Authenticate with MCP
   */
  async connect(credentials) {
    if (typeof credentials === 'string') {
      // Treat as API key
      credentials = { apiKey: credentials };
    }
    
    return await this.core.authenticate(credentials);
  }
  
  /**
   * Connect to a specific service
   */
  async connectService(serviceId) {
    // Ensure service is installed first
    const service = await this.core.getService(serviceId);
    
    if (!service.installed) {
      const result = await this.core.installService(serviceId, {});
      if (!result.success) {
        throw new Error(result.message);
      }
    }
    
    // Create service proxy
    const serviceProxy = new ServiceProxy(this.core, serviceId);
    this.services.set(serviceId, serviceProxy);
    
    return serviceProxy;
  }
  
  /**
   * List available services
   */
  async listServices(filters) {
    return await this.core.listServices(filters);
  }
  
  /**
   * Get service details
   */
  async getService(serviceId) {
    return await this.core.getService(serviceId);
  }
  
  /**
   * Install a service
   */
  async installService(serviceId, config) {
    return await this.core.installService(serviceId, config);
  }
  
  /**
   * Uninstall a service
   */
  async uninstallService(serviceId) {
    // Remove from local cache
    if (this.services.has(serviceId)) {
      this.services.delete(serviceId);
    }
    
    return await this.core.uninstallService(serviceId);
  }
  
  /**
   * Get health status
   */
  async getHealth(serviceId) {
    return await this.core.getHealth(serviceId);
  }
  
  /**
   * Subscribe to events
   */
  on(event, callback) {
    this.core.on(event, callback);
  }
  
  /**
   * Unsubscribe from events
   */
  off(event, callback) {
    this.core.off(event, callback);
  }
}

/**
 * Service Proxy for easier service interaction
 */
class ServiceProxy {
  constructor(core, serviceId) {
    this.core = core;
    this.serviceId = serviceId;
  }
  
  /**
   * Call a service method
   */
  async call(method, params) {
    return await this.core.callService(this.serviceId, method, params);
  }
  
  /**
   * Get service health
   */
  async getHealth() {
    return await this.core.getHealth(this.serviceId);
  }
  
  /**
   * Create a method proxy for cleaner API
   */
  method(methodName) {
    return async (params) => {
      return await this.call(methodName, params);
    };
  }
}

// Export both the client and core for flexibility
module.exports = MCPClient;
module.exports.MCPClient = MCPClient;
module.exports.SDKCore = SDKCore;
module.exports.ServiceProxy = ServiceProxy;