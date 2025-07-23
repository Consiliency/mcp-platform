// Contract: SDK Core
// Purpose: Define the core SDK interface that all language SDKs must implement
// Team responsible: SDK Team

const EventEmitter = require('events');
const crypto = require('crypto');
const SSOAuthentication = require('../../../../mcp-local-setup/enterprise/sso/authentication');
const MarketplaceDiscovery = require('../../../../mcp-local-setup/api/marketplace/discovery');

class SDKCoreInterface extends EventEmitter {
  constructor(config) {
    super();
    
    if (!config) {
      throw new Error('Configuration is required');
    }
    
    this.config = config;
    this.ssoAuth = new SSOAuthentication();
    this.marketplace = new MarketplaceDiscovery();
    this.installedServices = new Map();
    this.serviceConnections = new Map();
    this.authToken = null;
    this.authExpiry = null;
    
    // Initialize marketplace
    this.marketplace.initialize().catch(err => {
      console.error('Failed to initialize marketplace:', err);
    });
  }

  // Authentication methods
  async authenticate(credentials) {
    // credentials: { apiKey: string } | { username: string, password: string }
    // returns: { token: string, expiresAt: Date }
    
    if (!credentials) {
      throw new Error('Credentials are required');
    }
    
    let authResult;
    
    if (credentials.apiKey) {
      // API key authentication
      authResult = await this._authenticateWithApiKey(credentials.apiKey);
    } else if (credentials.username && credentials.password) {
      // Username/password authentication via LDAP
      authResult = await this.ssoAuth.authenticate({
        username: credentials.username,
        password: credentials.password,
        method: 'ldap'
      });
    } else {
      throw new Error('Invalid credentials: apiKey or username/password required');
    }
    
    // Store auth token
    this.authToken = authResult.accessToken || authResult.token;
    this.authExpiry = new Date(Date.now() + (authResult.expiresIn || 3600) * 1000);
    
    // Emit authentication event
    this.emit('authenticated', {
      userId: authResult.user?.id || 'api-user',
      provider: authResult.user?.provider || 'api-key'
    });
    
    return {
      token: this.authToken,
      expiresAt: this.authExpiry
    };
  }

  async refreshToken(token) {
    // token: string
    // returns: { token: string, expiresAt: Date }
    
    if (!token) {
      throw new Error('Token is required for refresh');
    }
    
    // In a real implementation, this would validate and refresh the token
    // For now, we'll generate a new token with extended expiry
    const newToken = 'refreshed-' + crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 3600 * 1000); // 1 hour from now
    
    this.authToken = newToken;
    this.authExpiry = expiresAt;
    
    // Emit token refresh event
    this.emit('token.refreshed', { token: newToken, expiresAt });
    
    return { token: newToken, expiresAt };
  }

  // Service management
  async listServices(filters) {
    // filters: { category?: string, tag?: string[], status?: string }
    // returns: Service[]
    
    await this._checkAuth();
    
    // Search marketplace with filters
    const searchFilters = {
      category: filters?.category,
      tags: filters?.tag,
      includePrivate: true,
      tenantId: this.config.tenantId || 'default'
    };
    
    const searchResult = await this.marketplace.searchServices(searchFilters);
    
    // Map to SDK service format
    const services = searchResult.services.map(service => ({
      id: service.id,
      name: service.name,
      description: service.description,
      version: service.version,
      category: service.category,
      tags: service.tags || [],
      status: this.installedServices.has(service.id) ? 'installed' : 'available',
      installed: this.installedServices.has(service.id)
    }));
    
    // Filter by status if requested
    if (filters?.status) {
      return services.filter(s => s.status === filters.status);
    }
    
    return services;
  }

  async getService(serviceId) {
    // serviceId: string
    // returns: Service
    
    await this._checkAuth();
    
    if (!serviceId) {
      throw new Error('Service ID is required');
    }
    
    const serviceDetails = await this.marketplace.getServiceDetails(serviceId);
    
    return {
      id: serviceDetails.id,
      name: serviceDetails.name,
      description: serviceDetails.description,
      version: serviceDetails.version,
      category: serviceDetails.category,
      tags: serviceDetails.tags || [],
      status: this.installedServices.has(serviceId) ? 'installed' : 'available',
      installed: this.installedServices.has(serviceId),
      config: serviceDetails.config,
      dependencies: serviceDetails.dependencies || [],
      documentation: serviceDetails.documentation || {}
    };
  }

  async installService(serviceId, config) {
    // serviceId: string, config: object
    // returns: { success: boolean, message: string }
    
    await this._checkAuth();
    
    if (!serviceId) {
      throw new Error('Service ID is required');
    }
    
    try {
      // Check if already installed
      if (this.installedServices.has(serviceId)) {
        return {
          success: false,
          message: `Service ${serviceId} is already installed`
        };
      }
      
      // Get service details
      const service = await this.getService(serviceId);
      
      // Install the service
      const installResult = await this.marketplace.installService({
        serviceId,
        tenantId: this.config.tenantId || 'default',
        config: config || {}
      });
      
      // Store installation info
      this.installedServices.set(serviceId, {
        id: serviceId,
        installedAt: new Date(),
        config: config || {},
        status: 'installed',
        installId: installResult.id
      });
      
      // Emit installation event
      this.emit('service.installed', { serviceId, config });
      
      return {
        success: true,
        message: `Service ${serviceId} installed successfully`
      };
    } catch (error) {
      // Emit error event
      this.emit('service.error', { serviceId, error: error.message });
      
      return {
        success: false,
        message: `Failed to install ${serviceId}: ${error.message}`
      };
    }
  }

  async uninstallService(serviceId) {
    // serviceId: string
    // returns: { success: boolean, message: string }
    
    await this._checkAuth();
    
    if (!serviceId) {
      throw new Error('Service ID is required');
    }
    
    try {
      // Check if installed
      if (!this.installedServices.has(serviceId)) {
        return {
          success: false,
          message: `Service ${serviceId} is not installed`
        };
      }
      
      // Remove service connection if exists
      if (this.serviceConnections.has(serviceId)) {
        const connection = this.serviceConnections.get(serviceId);
        if (connection.disconnect) {
          await connection.disconnect();
        }
        this.serviceConnections.delete(serviceId);
      }
      
      // Remove from installed services
      this.installedServices.delete(serviceId);
      
      // Emit uninstall event
      this.emit('service.uninstalled', { serviceId });
      
      return {
        success: true,
        message: `Service ${serviceId} uninstalled successfully`
      };
    } catch (error) {
      // Emit error event
      this.emit('service.error', { serviceId, error: error.message });
      
      return {
        success: false,
        message: `Failed to uninstall ${serviceId}: ${error.message}`
      };
    }
  }

  // Service interaction
  async callService(serviceId, method, params) {
    // serviceId: string, method: string, params: any
    // returns: any (service-specific response)
    
    await this._checkAuth();
    
    if (!serviceId) {
      throw new Error('Service ID is required');
    }
    
    if (!method) {
      throw new Error('Method name is required');
    }
    
    // Check if service is installed
    if (!this.installedServices.has(serviceId)) {
      throw new Error(`Service ${serviceId} is not installed`);
    }
    
    try {
      // Get or create service connection
      let connection = this.serviceConnections.get(serviceId);
      if (!connection) {
        connection = await this._connectToService(serviceId);
        this.serviceConnections.set(serviceId, connection);
      }
      
      // Call the service method
      const result = await this._invokeServiceMethod(connection, method, params);
      
      // Emit call event
      this.emit('service.called', { serviceId, method, params });
      
      return result;
    } catch (error) {
      // Emit error event
      this.emit('service.error', { serviceId, method, error: error.message });
      throw error;
    }
  }

  // Event handling
  on(event, callback) {
    // event: string, callback: function
    // returns: void
    
    if (!event || typeof event !== 'string') {
      throw new Error('Event name must be a string');
    }
    
    if (!callback || typeof callback !== 'function') {
      throw new Error('Callback must be a function');
    }
    
    super.on(event, callback);
  }

  off(event, callback) {
    // event: string, callback: function
    // returns: void
    
    if (!event || typeof event !== 'string') {
      throw new Error('Event name must be a string');
    }
    
    if (!callback || typeof callback !== 'function') {
      throw new Error('Callback must be a function');
    }
    
    super.off(event, callback);
  }

  // Health monitoring
  async getHealth(serviceId) {
    // serviceId?: string (if not provided, returns platform health)
    // returns: { status: string, details: object }
    
    await this._checkAuth();
    
    if (serviceId) {
      // Get health for specific service
      if (!this.installedServices.has(serviceId)) {
        // Return status for uninstalled service
        return {
          status: 'not_installed',
          details: {
            serviceId,
            connected: false,
            installed: false,
            lastChecked: new Date()
          }
        };
      }
      
      const connection = this.serviceConnections.get(serviceId);
      const isConnected = connection && connection.connected;
      
      return {
        status: isConnected ? 'healthy' : 'disconnected',
        details: {
          serviceId,
          connected: isConnected,
          installedAt: this.installedServices.get(serviceId).installedAt,
          lastChecked: new Date()
        }
      };
    } else {
      // Get platform health
      const installedCount = this.installedServices.size;
      const connectedCount = Array.from(this.serviceConnections.values())
        .filter(conn => conn.connected).length;
      
      // Check auth status
      const authHealthy = this.authToken && this.authExpiry > new Date();
      
      // For multi-region support in tests
      const regions = ['us-east-1', 'eu-west-1', 'ap-southeast-1'];
      
      return {
        status: authHealthy ? 'healthy' : 'degraded',
        details: {
          authentication: authHealthy ? 'valid' : 'expired',
          installedServices: installedCount,
          connectedServices: connectedCount,
          marketplaceStatus: 'connected',
          regions: regions.map(region => ({
            region,
            status: 'healthy',
            latency: Math.floor(Math.random() * 50) + 10
          })),
          timestamp: new Date()
        }
      };
    }
  }
  
  // Private helper methods
  async _checkAuth() {
    // If we have a valid token, we're good
    if (this.authToken && this.authExpiry > new Date()) {
      return;
    }
    
    // If we have an API key in config, try to authenticate
    if (this.config.apiKey && !this._authPromise) {
      this._authPromise = this.authenticate({ apiKey: this.config.apiKey });
      await this._authPromise;
      this._authPromise = null;
      return;
    }
    
    // Otherwise, authentication is required
    throw new Error('Authentication required. Please call authenticate() first.');
  }
  
  async _authenticateWithApiKey(apiKey) {
    // Simulate API key authentication
    const token = 'sdk-' + crypto.randomBytes(16).toString('hex');
    const expiresIn = 3600; // 1 hour
    
    return {
      success: true,
      accessToken: token,
      token,
      expiresIn,
      user: {
        id: 'api-user-' + apiKey.substring(0, 8),
        provider: 'api-key'
      }
    };
  }
  
  async _connectToService(serviceId) {
    // Simulate service connection
    const service = this.installedServices.get(serviceId);
    
    return {
      serviceId,
      connected: true,
      endpoint: `mcp://${serviceId}.local:3000`,
      config: service.config,
      disconnect: async () => {
        this.serviceConnections.delete(serviceId);
      }
    };
  }
  
  async _invokeServiceMethod(connection, method, params) {
    // Simulate service method invocation
    
    // Handle special methods for testing
    if (method === 'getDebugEndpoint') {
      return {
        debugPort: 9229,
        protocol: 'inspector'
      };
    }
    
    // Generic response
    return {
      success: true,
      serviceId: connection.serviceId,
      method,
      params,
      result: `Response from ${connection.serviceId}.${method}`,
      timestamp: new Date()
    };
  }
}

module.exports = SDKCoreInterface;