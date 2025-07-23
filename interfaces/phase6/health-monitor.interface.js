// Contract: Health Monitor
// Purpose: Define the health check and monitoring interface
// Team responsible: Docker Production Team

class HealthMonitorInterface {
  constructor(config) {
    // config: { services: string[], checkInterval: number, timeout: number }
    throw new Error('Not implemented - Docker Production team will implement');
  }

  // Health check operations
  async checkHealth(serviceName) {
    // serviceName?: string (if not provided, check overall system health)
    // returns: { status: 'healthy'|'unhealthy'|'degraded', details: object, timestamp: Date }
    throw new Error('Not implemented - Docker Production team will implement');
  }

  async registerHealthCheck(serviceName, checkFn) {
    // serviceName: string, checkFn: () => Promise<{healthy: boolean, message?: string}>
    // returns: { registered: boolean }
    throw new Error('Not implemented - Docker Production team will implement');
  }

  // Probe endpoints
  async livenessProbe() {
    // returns: { alive: boolean, timestamp: Date }
    throw new Error('Not implemented - Docker Production team will implement');
  }

  async readinessProbe() {
    // returns: { ready: boolean, services: object, timestamp: Date }
    throw new Error('Not implemented - Docker Production team will implement');
  }

  async startupProbe() {
    // returns: { started: boolean, initialized: string[], pending: string[] }
    throw new Error('Not implemented - Docker Production team will implement');
  }

  // HTTP endpoints
  createHealthEndpoint(options) {
    // options: { path?: string, detailed?: boolean, auth?: boolean }
    // returns: Express/Koa router
    throw new Error('Not implemented - Docker Production team will implement');
  }

  createMetricsEndpoint(options) {
    // options: { path?: string, format?: 'json'|'prometheus' }
    // returns: Express/Koa router
    throw new Error('Not implemented - Docker Production team will implement');
  }

  // Service dependencies
  async checkDependencies() {
    // returns: { satisfied: boolean, missing: string[], details: object }
    throw new Error('Not implemented - Docker Production team will implement');
  }
}

module.exports = HealthMonitorInterface;