// Contract: SDK Core
// Purpose: Define the core SDK interface that all language SDKs must implement
// Team responsible: SDK Team

class SDKCoreInterface {
  constructor(config) {
    throw new Error('Not implemented - SDK team will implement');
  }

  // Authentication methods
  async authenticate(credentials) {
    // credentials: { apiKey: string } | { username: string, password: string }
    // returns: { token: string, expiresAt: Date }
    throw new Error('Not implemented - SDK team will implement');
  }

  async refreshToken(token) {
    // token: string
    // returns: { token: string, expiresAt: Date }
    throw new Error('Not implemented - SDK team will implement');
  }

  // Service management
  async listServices(filters) {
    // filters: { category?: string, tag?: string[], status?: string }
    // returns: Service[]
    throw new Error('Not implemented - SDK team will implement');
  }

  async getService(serviceId) {
    // serviceId: string
    // returns: Service
    throw new Error('Not implemented - SDK team will implement');
  }

  async installService(serviceId, config) {
    // serviceId: string, config: object
    // returns: { success: boolean, message: string }
    throw new Error('Not implemented - SDK team will implement');
  }

  async uninstallService(serviceId) {
    // serviceId: string
    // returns: { success: boolean, message: string }
    throw new Error('Not implemented - SDK team will implement');
  }

  // Service interaction
  async callService(serviceId, method, params) {
    // serviceId: string, method: string, params: any
    // returns: any (service-specific response)
    throw new Error('Not implemented - SDK team will implement');
  }

  // Event handling
  on(event, callback) {
    // event: string, callback: function
    // returns: void
    throw new Error('Not implemented - SDK team will implement');
  }

  off(event, callback) {
    // event: string, callback: function
    // returns: void
    throw new Error('Not implemented - SDK team will implement');
  }

  // Health monitoring
  async getHealth(serviceId) {
    // serviceId?: string (if not provided, returns platform health)
    // returns: { status: string, details: object }
    throw new Error('Not implemented - SDK team will implement');
  }
}

module.exports = SDKCoreInterface;