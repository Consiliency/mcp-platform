const express = require('express');
const http = require('http');

class HealthMonitor {
  constructor(config = {}) {
    this.services = config.services || [];
    this.checkInterval = config.checkInterval || 30000;
    this.timeout = config.timeout || 5000;
    this.healthChecks = new Map();
    this.serviceStatus = new Map();
    this.startTime = Date.now();
    this.initialized = new Set();
    
    // Initialize service status
    this.services.forEach(service => {
      this.serviceStatus.set(service, {
        status: 'pending',
        lastCheck: null,
        message: 'Not checked yet'
      });
    });
    
    // Start periodic health checks
    this.startPeriodicChecks();
  }

  async checkHealth(serviceName) {
    if (!serviceName) {
      // Check overall system health
      const allStatuses = await Promise.all(
        this.services.map(service => this.checkServiceHealth(service))
      );
      
      const unhealthy = allStatuses.filter(s => s.status === 'unhealthy').length;
      const degraded = allStatuses.filter(s => s.status === 'degraded').length;
      
      let overallStatus = 'healthy';
      if (unhealthy > 0) overallStatus = 'unhealthy';
      else if (degraded > 0) overallStatus = 'degraded';
      
      return {
        status: overallStatus,
        details: {
          services: Object.fromEntries(
            allStatuses.map(s => [s.service, s])
          ),
          timestamp: new Date(),
          uptime: Date.now() - this.startTime
        },
        timestamp: new Date()
      };
    }
    
    // Check specific service
    return await this.checkServiceHealth(serviceName);
  }

  async checkServiceHealth(serviceName) {
    const checkFn = this.healthChecks.get(serviceName);
    
    if (!checkFn) {
      // No custom check registered, use default
      return {
        service: serviceName,
        status: this.serviceStatus.get(serviceName)?.status || 'unknown',
        details: this.serviceStatus.get(serviceName) || {},
        timestamp: new Date()
      };
    }
    
    try {
      const result = await Promise.race([
        checkFn(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Health check timeout')), this.timeout)
        )
      ]);
      
      const status = result.healthy ? 'healthy' : 'unhealthy';
      this.serviceStatus.set(serviceName, {
        status,
        lastCheck: new Date(),
        message: result.message || 'OK'
      });
      
      return {
        service: serviceName,
        status,
        details: result,
        timestamp: new Date()
      };
    } catch (error) {
      this.serviceStatus.set(serviceName, {
        status: 'unhealthy',
        lastCheck: new Date(),
        message: error.message
      });
      
      return {
        service: serviceName,
        status: 'unhealthy',
        details: { error: error.message },
        timestamp: new Date()
      };
    }
  }

  async registerHealthCheck(serviceName, checkFn) {
    if (typeof checkFn !== 'function') {
      throw new Error('Health check must be a function');
    }
    
    this.healthChecks.set(serviceName, checkFn);
    
    // Add to services if not already present
    if (!this.services.includes(serviceName)) {
      this.services.push(serviceName);
      this.serviceStatus.set(serviceName, {
        status: 'pending',
        lastCheck: null,
        message: 'Not checked yet'
      });
    }
    
    // Run initial check
    await this.checkServiceHealth(serviceName);
    
    return { registered: true };
  }

  async livenessProbe() {
    // Simple liveness check - is the process alive?
    return {
      alive: true,
      timestamp: new Date()
    };
  }

  async readinessProbe() {
    // Check if all required services are ready
    const health = await this.checkHealth();
    const ready = health.status !== 'unhealthy';
    
    return {
      ready,
      services: health.details.services,
      timestamp: new Date()
    };
  }

  async startupProbe() {
    // Check which services have been initialized
    const initialized = Array.from(this.initialized);
    const pending = this.services.filter(s => !this.initialized.has(s));
    
    return {
      started: pending.length === 0,
      initialized,
      pending
    };
  }

  createHealthEndpoint(options = {}) {
    const router = express.Router();
    const { path = '/health', detailed = false, auth = false } = options;
    
    // Main health endpoint
    router.get(path, async (req, res) => {
      try {
        const health = await this.checkHealth();
        const statusCode = health.status === 'healthy' ? 200 : 
                          health.status === 'degraded' ? 200 : 503;
        
        if (detailed) {
          res.status(statusCode).json(health);
        } else {
          res.status(statusCode).json({
            status: health.status,
            timestamp: health.timestamp
          });
        }
      } catch (error) {
        res.status(500).json({
          status: 'error',
          error: error.message
        });
      }
    });
    
    // Liveness probe
    router.get(`${path}/live`, async (req, res) => {
      const probe = await this.livenessProbe();
      res.status(200).json(probe);
    });
    
    // Readiness probe
    router.get(`${path}/ready`, async (req, res) => {
      const probe = await this.readinessProbe();
      res.status(probe.ready ? 200 : 503).json(probe);
    });
    
    // Startup probe
    router.get(`${path}/startup`, async (req, res) => {
      const probe = await this.startupProbe();
      res.status(probe.started ? 200 : 503).json(probe);
    });
    
    return router;
  }

  createMetricsEndpoint(options = {}) {
    const router = express.Router();
    const { path = '/metrics', format = 'json' } = options;
    
    router.get(path, async (req, res) => {
      const health = await this.checkHealth();
      const metrics = {
        uptime: Date.now() - this.startTime,
        services: this.services.length,
        healthy: this.services.filter(s => 
          this.serviceStatus.get(s)?.status === 'healthy'
        ).length,
        unhealthy: this.services.filter(s => 
          this.serviceStatus.get(s)?.status === 'unhealthy'
        ).length,
        checks_total: this.healthChecks.size
      };
      
      if (format === 'prometheus') {
        // Convert to Prometheus format
        let output = '';
        output += `# HELP health_uptime_seconds Service uptime in seconds\n`;
        output += `# TYPE health_uptime_seconds gauge\n`;
        output += `health_uptime_seconds ${metrics.uptime / 1000}\n\n`;
        
        output += `# HELP health_services_total Total number of services\n`;
        output += `# TYPE health_services_total gauge\n`;
        output += `health_services_total ${metrics.services}\n\n`;
        
        output += `# HELP health_services_healthy Number of healthy services\n`;
        output += `# TYPE health_services_healthy gauge\n`;
        output += `health_services_healthy ${metrics.healthy}\n\n`;
        
        output += `# HELP health_services_unhealthy Number of unhealthy services\n`;
        output += `# TYPE health_services_unhealthy gauge\n`;
        output += `health_services_unhealthy ${metrics.unhealthy}\n`;
        
        res.set('Content-Type', 'text/plain; version=0.0.4');
        res.send(output);
      } else {
        res.json(metrics);
      }
    });
    
    return router;
  }

  async checkDependencies() {
    const dependencies = {
      'security-api': false,
      'rate-limiter': false,
      ...Object.fromEntries(this.services.map(s => [s, false]))
    };
    
    // Check each dependency
    for (const [dep, _] of Object.entries(dependencies)) {
      const health = await this.checkServiceHealth(dep);
      dependencies[dep] = health.status === 'healthy';
    }
    
    const missing = Object.entries(dependencies)
      .filter(([_, healthy]) => !healthy)
      .map(([dep, _]) => dep);
    
    return {
      satisfied: missing.length === 0,
      missing,
      details: dependencies
    };
  }

  startPeriodicChecks() {
    this.intervalId = setInterval(async () => {
      for (const service of this.services) {
        await this.checkServiceHealth(service);
      }
    }, this.checkInterval);
  }

  stopPeriodicChecks() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  // Mark service as initialized (for startup probe)
  markInitialized(serviceName) {
    this.initialized.add(serviceName);
  }
}

// CLI support for Docker health checks
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args[0] === '--check' && args[1]) {
    const monitor = new HealthMonitor({ services: [] });
    
    switch (args[1]) {
      case 'liveness':
        monitor.livenessProbe().then(() => process.exit(0));
        break;
      case 'readiness':
        monitor.readinessProbe().then(probe => {
          process.exit(probe.ready ? 0 : 1);
        });
        break;
      case 'startup':
        monitor.startupProbe().then(probe => {
          process.exit(probe.started ? 0 : 1);
        });
        break;
      default:
        console.error('Unknown probe type:', args[1]);
        process.exit(1);
    }
  }
}

// Export the class following the interface pattern
class HealthMonitorInterface extends HealthMonitor {}

module.exports = HealthMonitorInterface;