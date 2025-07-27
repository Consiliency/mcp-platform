const EventEmitter = require('events');

/**
 * Fault Tolerance Improvements (STABILITY-8.1)
 * Enhances system resilience
 */
class FaultTolerance extends EventEmitter {
  constructor() {
    super();
    this.healthChecks = new Map();
    this.redundancy = new Map();
    this.failoverStrategies = new Map();
    this.serviceStatus = new Map();
    this.activeServices = new Map();
    
    // Configuration
    this.config = {
      defaultCheckInterval: 30000, // 30 seconds
      failureThreshold: 3,
      recoveryThreshold: 2,
      defaultTimeout: 5000
    };
    
    // Metrics
    this.metrics = {
      healthChecks: {
        total: 0,
        passed: 0,
        failed: 0
      },
      failovers: {
        total: 0,
        successful: 0,
        failed: 0
      },
      availability: {},
      lastFailover: null
    };
    
    // Start monitoring
    this.monitoringInterval = null;
  }
  
  /**
   * Configure health checks
   * TASK: Implement comprehensive health checks
   */
  configureHealthCheck(service, config) {
    const healthCheck = {
      service,
      endpoint: config.endpoint || `/health/${service}`,
      interval: config.interval || this.config.defaultCheckInterval,
      timeout: config.timeout || this.config.defaultTimeout,
      thresholds: {
        failure: config.failureThreshold || this.config.failureThreshold,
        recovery: config.recoveryThreshold || this.config.recoveryThreshold
      },
      check: config.check || this._defaultHealthCheck.bind(this),
      lastCheck: null,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      status: 'unknown',
      timer: null
    };
    
    this.healthChecks.set(service, healthCheck);
    
    // Initialize service status
    this.serviceStatus.set(service, {
      healthy: true,
      lastChecked: null,
      uptime: 0,
      downtime: 0,
      availability: 100
    });
    
    // Start health check
    this._startHealthCheck(service);
    
    this.emit('healthCheckConfigured', { service, config: healthCheck });
  }
  
  /**
   * Start health check for a service
   * @private
   */
  _startHealthCheck(service) {
    const healthCheck = this.healthChecks.get(service);
    if (!healthCheck) return;
    
    // Clear existing timer
    if (healthCheck.timer) {
      clearInterval(healthCheck.timer);
    }
    
    // Run initial check
    this._performHealthCheck(service);
    
    // Schedule periodic checks
    healthCheck.timer = setInterval(() => {
      this._performHealthCheck(service);
    }, healthCheck.interval);
  }
  
  /**
   * Perform health check
   * @private
   */
  async _performHealthCheck(service) {
    const healthCheck = this.healthChecks.get(service);
    const status = this.serviceStatus.get(service);
    
    if (!healthCheck || !status) return;
    
    this.metrics.healthChecks.total++;
    
    try {
      const startTime = Date.now();
      const result = await Promise.race([
        healthCheck.check(service, healthCheck),
        this._timeout(healthCheck.timeout)
      ]);
      
      const checkTime = Date.now() - startTime;
      
      if (result.healthy) {
        this._handleHealthCheckSuccess(service, checkTime);
      } else {
        this._handleHealthCheckFailure(service, result.reason || 'Health check failed');
      }
      
    } catch (error) {
      this._handleHealthCheckFailure(service, error.message);
    }
  }
  
  /**
   * Handle successful health check
   * @private
   */
  _handleHealthCheckSuccess(service, responseTime) {
    const healthCheck = this.healthChecks.get(service);
    const status = this.serviceStatus.get(service);
    
    this.metrics.healthChecks.passed++;
    
    healthCheck.consecutiveFailures = 0;
    healthCheck.consecutiveSuccesses++;
    healthCheck.lastCheck = new Date().toISOString();
    
    // Check if service is recovering
    if (healthCheck.status === 'unhealthy' && 
        healthCheck.consecutiveSuccesses >= healthCheck.thresholds.recovery) {
      
      healthCheck.status = 'healthy';
      status.healthy = true;
      
      this.emit('serviceRecovered', {
        service,
        consecutiveSuccesses: healthCheck.consecutiveSuccesses,
        responseTime
      });
    }
    
    // Update status
    status.lastChecked = new Date().toISOString();
    this._updateAvailability(service);
    
    this.emit('healthCheckPassed', {
      service,
      status: healthCheck.status,
      responseTime
    });
  }
  
  /**
   * Handle failed health check
   * @private
   */
  _handleHealthCheckFailure(service, reason) {
    const healthCheck = this.healthChecks.get(service);
    const status = this.serviceStatus.get(service);
    
    this.metrics.healthChecks.failed++;
    
    healthCheck.consecutiveSuccesses = 0;
    healthCheck.consecutiveFailures++;
    healthCheck.lastCheck = new Date().toISOString();
    
    // Check if service should be marked unhealthy
    if (healthCheck.status === 'healthy' && 
        healthCheck.consecutiveFailures >= healthCheck.thresholds.failure) {
      
      healthCheck.status = 'unhealthy';
      status.healthy = false;
      
      // Trigger failover if configured
      this._triggerFailover(service);
      
      this.emit('serviceFailed', {
        service,
        consecutiveFailures: healthCheck.consecutiveFailures,
        reason
      });
    }
    
    // Update status
    status.lastChecked = new Date().toISOString();
    this._updateAvailability(service);
    
    this.emit('healthCheckFailed', {
      service,
      status: healthCheck.status,
      reason
    });
  }
  
  /**
   * Default health check implementation
   * @private
   */
  async _defaultHealthCheck(service, config) {
    // This is a simple implementation - real implementation would make HTTP request
    return {
      healthy: Math.random() > 0.1, // 90% success rate for demo
      responseTime: Math.random() * 100
    };
  }
  
  /**
   * Timeout helper
   * @private
   */
  _timeout(ms) {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Health check timeout')), ms);
    });
  }
  
  /**
   * Implement service redundancy
   * TASK: Add redundancy mechanisms
   */
  setupRedundancy(service, config) {
    const redundancy = {
      service,
      replicas: config.replicas || 2,
      loadBalancing: config.loadBalancing || 'round-robin',
      stateSync: config.stateSync || 'async',
      instances: [],
      currentIndex: 0
    };
    
    // Initialize instances
    for (let i = 0; i < redundancy.replicas; i++) {
      redundancy.instances.push({
        id: `${service}-${i}`,
        healthy: true,
        load: 0,
        lastUsed: null
      });
    }
    
    this.redundancy.set(service, redundancy);
    
    // Configure failover strategy
    this.failoverStrategies.set(service, {
      strategy: config.failoverStrategy || 'automatic',
      priority: config.priority || [],
      timeout: config.failoverTimeout || 5000
    });
    
    this.emit('redundancyConfigured', {
      service,
      replicas: redundancy.replicas,
      loadBalancing: redundancy.loadBalancing
    });
  }
  
  /**
   * Get next available instance
   */
  getNextInstance(service) {
    const redundancy = this.redundancy.get(service);
    if (!redundancy) return null;
    
    const { instances, loadBalancing, currentIndex } = redundancy;
    let selectedInstance = null;
    
    switch (loadBalancing) {
      case 'round-robin':
        // Find next healthy instance
        for (let i = 0; i < instances.length; i++) {
          const index = (currentIndex + i) % instances.length;
          if (instances[index].healthy) {
            selectedInstance = instances[index];
            redundancy.currentIndex = (index + 1) % instances.length;
            break;
          }
        }
        break;
        
      case 'least-connections':
        // Select instance with lowest load
        selectedInstance = instances
          .filter(i => i.healthy)
          .sort((a, b) => a.load - b.load)[0];
        break;
        
      case 'random':
        // Random selection from healthy instances
        const healthyInstances = instances.filter(i => i.healthy);
        if (healthyInstances.length > 0) {
          selectedInstance = healthyInstances[
            Math.floor(Math.random() * healthyInstances.length)
          ];
        }
        break;
    }
    
    if (selectedInstance) {
      selectedInstance.lastUsed = new Date().toISOString();
      selectedInstance.load++;
    }
    
    return selectedInstance;
  }
  
  /**
   * Execute automatic failover
   * TASK: Implement failover logic
   */
  async executeFailover(failedService, targetService = null) {
    this.metrics.failovers.total++;
    
    try {
      const strategy = this.failoverStrategies.get(failedService);
      if (!strategy) {
        throw new Error(`No failover strategy configured for ${failedService}`);
      }
      
      // Find target service
      const target = targetService || this._selectFailoverTarget(failedService);
      if (!target) {
        throw new Error(`No healthy failover target available for ${failedService}`);
      }
      
      // Execute failover
      this.emit('failoverStarted', {
        from: failedService,
        to: target,
        strategy: strategy.strategy
      });
      
      // Migrate connections (simulate)
      await this._migrateConnections(failedService, target);
      
      // Update routing
      this.activeServices.set(failedService, target);
      
      this.metrics.failovers.successful++;
      this.metrics.lastFailover = {
        from: failedService,
        to: target,
        timestamp: new Date().toISOString(),
        success: true
      };
      
      this.emit('failoverCompleted', {
        from: failedService,
        to: target,
        duration: Date.now()
      });
      
      return target;
      
    } catch (error) {
      this.metrics.failovers.failed++;
      this.metrics.lastFailover = {
        from: failedService,
        to: targetService,
        timestamp: new Date().toISOString(),
        success: false,
        error: error.message
      };
      
      this.emit('failoverFailed', {
        from: failedService,
        error: error.message
      });
      
      throw error;
    }
  }
  
  /**
   * Trigger failover for a service
   * @private
   */
  _triggerFailover(service) {
    const strategy = this.failoverStrategies.get(service);
    
    if (strategy && strategy.strategy === 'automatic') {
      this.executeFailover(service).catch(error => {
        console.error(`Automatic failover failed for ${service}:`, error);
      });
    }
  }
  
  /**
   * Select failover target
   * @private
   */
  _selectFailoverTarget(failedService) {
    const strategy = this.failoverStrategies.get(failedService);
    
    if (strategy && strategy.priority.length > 0) {
      // Use priority list
      for (const target of strategy.priority) {
        const status = this.serviceStatus.get(target);
        if (status && status.healthy) {
          return target;
        }
      }
    }
    
    // Find any healthy service of same type
    const redundancy = this.redundancy.get(failedService);
    if (redundancy) {
      const healthyInstance = this.getNextInstance(failedService);
      if (healthyInstance) {
        return healthyInstance.id;
      }
    }
    
    return null;
  }
  
  /**
   * Migrate connections (simulated)
   * @private
   */
  async _migrateConnections(from, to) {
    // Simulate connection migration
    return new Promise(resolve => {
      setTimeout(() => {
        this.emit('connectionsMigrated', { from, to });
        resolve();
      }, 100);
    });
  }
  
  /**
   * Update availability metrics
   * @private
   */
  _updateAvailability(service) {
    const status = this.serviceStatus.get(service);
    if (!status) return;
    
    const now = Date.now();
    const lastUpdate = status.lastUpdate || now;
    const timeDiff = now - lastUpdate;
    
    if (status.healthy) {
      status.uptime += timeDiff;
    } else {
      status.downtime += timeDiff;
    }
    
    status.lastUpdate = now;
    
    // Calculate availability percentage
    const totalTime = status.uptime + status.downtime;
    status.availability = totalTime > 0 
      ? (status.uptime / totalTime * 100).toFixed(2) 
      : 100;
    
    this.metrics.availability[service] = status.availability;
  }
  
  /**
   * Monitor system resilience
   * TASK: Track fault tolerance metrics
   */
  monitorResilience() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    
    this.monitoringInterval = setInterval(() => {
      const report = this.generateResilienceReport();
      this.emit('resilienceReport', report);
    }, 60000); // Every minute
    
    return this.generateResilienceReport();
  }
  
  /**
   * Generate resilience report
   */
  generateResilienceReport() {
    const services = [];
    
    for (const [service, status] of this.serviceStatus) {
      const healthCheck = this.healthChecks.get(service);
      const redundancy = this.redundancy.get(service);
      
      services.push({
        service,
        status: status.healthy ? 'healthy' : 'unhealthy',
        availability: `${status.availability}%`,
        uptime: status.uptime,
        downtime: status.downtime,
        lastChecked: status.lastChecked,
        consecutiveFailures: healthCheck ? healthCheck.consecutiveFailures : 0,
        replicas: redundancy ? redundancy.replicas : 1,
        healthyReplicas: redundancy 
          ? redundancy.instances.filter(i => i.healthy).length 
          : (status.healthy ? 1 : 0)
      });
    }
    
    return {
      timestamp: new Date().toISOString(),
      services,
      metrics: {
        ...this.metrics,
        overallAvailability: this._calculateOverallAvailability(),
        healthCheckSuccessRate: this.metrics.healthChecks.total > 0
          ? (this.metrics.healthChecks.passed / this.metrics.healthChecks.total * 100).toFixed(2) + '%'
          : '100%',
        failoverSuccessRate: this.metrics.failovers.total > 0
          ? (this.metrics.failovers.successful / this.metrics.failovers.total * 100).toFixed(2) + '%'
          : '100%'
      }
    };
  }
  
  /**
   * Calculate overall system availability
   * @private
   */
  _calculateOverallAvailability() {
    const availabilities = Object.values(this.metrics.availability);
    if (availabilities.length === 0) return '100%';
    
    const average = availabilities.reduce((sum, val) => sum + parseFloat(val), 0) / availabilities.length;
    return average.toFixed(2) + '%';
  }
  
  /**
   * Stop all health checks
   */
  stop() {
    // Clear all health check timers
    for (const healthCheck of this.healthChecks.values()) {
      if (healthCheck.timer) {
        clearInterval(healthCheck.timer);
      }
    }
    
    // Clear monitoring interval
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    
    this.emit('stopped');
  }
  
  /**
   * Get service status
   */
  getServiceStatus(service) {
    const status = this.serviceStatus.get(service);
    const healthCheck = this.healthChecks.get(service);
    const redundancy = this.redundancy.get(service);
    
    return {
      service,
      ...status,
      healthCheck: healthCheck ? {
        status: healthCheck.status,
        consecutiveFailures: healthCheck.consecutiveFailures,
        consecutiveSuccesses: healthCheck.consecutiveSuccesses,
        lastCheck: healthCheck.lastCheck
      } : null,
      redundancy: redundancy ? {
        replicas: redundancy.replicas,
        healthyReplicas: redundancy.instances.filter(i => i.healthy).length,
        loadBalancing: redundancy.loadBalancing
      } : null
    };
  }
}

module.exports = FaultTolerance;