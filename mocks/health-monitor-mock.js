// Mock implementation for HealthMonitorInterface to support testing
class HealthMonitorMock {
  constructor(config) {
    this.services = config.services || [];
    this.checkInterval = config.checkInterval || 30000;
    this.timeout = config.timeout || 5000;
    this.healthChecks = new Map();
  }

  async checkHealth(serviceName) {
    if (serviceName === 'api') {
      return {
        status: 'healthy',
        details: {
          authentication: 'enabled',
          uptime: process.uptime(),
          memory: process.memoryUsage()
        },
        timestamp: new Date()
      };
    }
    
    // When no service name is provided, return overall health
    if (!serviceName) {
      return {
        status: 'degraded',
        details: {
          services: {
            api: 'healthy',
            database: 'degraded',
            cache: 'healthy',
            queue: 'degraded'
          }
        },
        timestamp: new Date()
      };
    }

    return {
      status: 'degraded',
      details: {},
      timestamp: new Date()
    };
  }

  async registerHealthCheck(serviceName, checkFn) {
    this.healthChecks.set(serviceName, checkFn);
    return { registered: true };
  }

  async livenessProbe() {
    return {
      alive: true,
      timestamp: new Date()
    };
  }

  async readinessProbe() {
    return {
      ready: true,
      services: {
        api: 'ready',
        database: 'ready'
      },
      timestamp: new Date()
    };
  }

  async startupProbe() {
    return {
      started: false,
      initialized: [],
      pending: ['database']
    };
  }

  createHealthEndpoint(options) {
    // Return a mock router function
    return (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date()
      });
    };
  }

  createMetricsEndpoint(options) {
    return (req, res) => {
      res.json({
        metrics: {}
      });
    };
  }

  async checkDependencies() {
    return {
      satisfied: true,
      missing: [],
      details: {
        'security-api': 'connected',
        'rate-limiter': 'connected'
      }
    };
  }
}

module.exports = HealthMonitorMock;