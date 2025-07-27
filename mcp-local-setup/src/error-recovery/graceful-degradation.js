const EventEmitter = require('events');

/**
 * Graceful Degradation (STABILITY-8.1)
 * Maintains partial functionality during failures
 */
class GracefulDegradation extends EventEmitter {
  constructor() {
    super();
    this.degradationLevels = new Map();
    this.fallbacks = new Map();
    this.featureToggles = new Map();
    this.currentLevel = 'NORMAL';
    this.healthChecks = new Map();
    
    // Predefined degradation levels
    this.levels = {
      NORMAL: 0,
      DEGRADED_MINOR: 1,
      DEGRADED_MAJOR: 2,
      EMERGENCY: 3
    };
    
    // Metrics
    this.metrics = {
      degradationEvents: [],
      fallbackExecutions: 0,
      featureToggles: {}
    };
    
    // Initialize default features
    this._initializeDefaultFeatures();
  }
  
  /**
   * Initialize default feature toggles
   * @private
   */
  _initializeDefaultFeatures() {
    // Default features that can be toggled
    const defaultFeatures = {
      'analytics': { critical: false, degradationLevel: 'DEGRADED_MINOR' },
      'recommendations': { critical: false, degradationLevel: 'DEGRADED_MINOR' },
      'realtime-updates': { critical: false, degradationLevel: 'DEGRADED_MAJOR' },
      'cache-warming': { critical: false, degradationLevel: 'DEGRADED_MAJOR' },
      'background-jobs': { critical: false, degradationLevel: 'EMERGENCY' }
    };
    
    Object.entries(defaultFeatures).forEach(([feature, config]) => {
      this.featureToggles.set(feature, {
        enabled: true,
        ...config
      });
    });
  }
  
  /**
   * Register degradation levels
   * TASK: Define service degradation levels
   */
  registerDegradationLevel(service, config) {
    const levels = {
      name: service,
      thresholds: config.thresholds || {
        DEGRADED_MINOR: { errorRate: 0.05, latency: 1000 },
        DEGRADED_MAJOR: { errorRate: 0.10, latency: 3000 },
        EMERGENCY: { errorRate: 0.25, latency: 5000 }
      },
      features: config.features || [],
      fallback: config.fallback || null,
      healthCheck: config.healthCheck || null
    };
    
    this.degradationLevels.set(service, levels);
    
    // Register health check if provided
    if (config.healthCheck) {
      this.healthChecks.set(service, config.healthCheck);
    }
    
    // Register fallback if provided
    if (config.fallback) {
      this.fallbacks.set(service, config.fallback);
    }
    
    this.emit('levelRegistered', { service, levels });
  }
  
  /**
   * Execute with fallback
   * TASK: Implement fallback execution
   */
  async executeWithFallback(primary, fallback, context = {}) {
    const startTime = Date.now();
    
    try {
      // Check if we should skip primary based on degradation level
      if (this.shouldUseFallback(context.service)) {
        throw new Error('Service degraded, using fallback');
      }
      
      // Try primary function
      const result = await primary();
      
      // Track success
      this.trackExecution(context.service, true, Date.now() - startTime);
      
      return result;
    } catch (error) {
      // Track failure
      this.trackExecution(context.service, false, Date.now() - startTime);
      
      // Use registered fallback or provided fallback
      const fallbackFn = this.fallbacks.get(context.service) || fallback;
      
      if (fallbackFn) {
        this.metrics.fallbackExecutions++;
        
        try {
          const fallbackResult = await fallbackFn(error);
          
          this.emit('fallbackExecuted', {
            service: context.service,
            error: error.message,
            degradationLevel: this.currentLevel
          });
          
          return fallbackResult;
        } catch (fallbackError) {
          // Both primary and fallback failed
          this.emit('fallbackFailed', {
            service: context.service,
            primaryError: error.message,
            fallbackError: fallbackError.message
          });
          
          throw fallbackError;
        }
      }
      
      // No fallback available
      throw error;
    }
  }
  
  /**
   * Determine current degradation level
   * TASK: Calculate system degradation
   */
  calculateDegradationLevel() {
    const serviceStatuses = [];
    
    // Check each registered service
    for (const [service, config] of this.degradationLevels) {
      const health = this.checkServiceHealth(service);
      const level = this.determineLevelFromHealth(health, config.thresholds);
      
      serviceStatuses.push({
        service,
        health,
        level
      });
    }
    
    // Calculate overall system level (worst case)
    const worstLevel = serviceStatuses.reduce((worst, status) => {
      return this.levels[status.level] > this.levels[worst] ? status.level : worst;
    }, 'NORMAL');
    
    // Apply degradation if level changed
    if (worstLevel !== this.currentLevel) {
      this.applyDegradation(worstLevel);
    }
    
    return {
      currentLevel: this.currentLevel,
      serviceStatuses,
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * Check service health
   * @private
   */
  checkServiceHealth(service) {
    const healthCheck = this.healthChecks.get(service);
    
    if (!healthCheck) {
      return { healthy: true, errorRate: 0, latency: 0 };
    }
    
    // Execute health check
    try {
      const health = healthCheck();
      return {
        healthy: health.healthy !== false,
        errorRate: health.errorRate || 0,
        latency: health.latency || 0,
        details: health
      };
    } catch (error) {
      return {
        healthy: false,
        errorRate: 1,
        latency: 0,
        error: error.message
      };
    }
  }
  
  /**
   * Determine degradation level from health metrics
   * @private
   */
  determineLevelFromHealth(health, thresholds) {
    if (!health.healthy) {
      return 'EMERGENCY';
    }
    
    // Check thresholds in order
    for (const [level, threshold] of Object.entries(thresholds).reverse()) {
      if (health.errorRate >= threshold.errorRate || health.latency >= threshold.latency) {
        return level;
      }
    }
    
    return 'NORMAL';
  }
  
  /**
   * Apply degradation policy
   * TASK: Implement degradation actions
   */
  applyDegradation(level) {
    const previousLevel = this.currentLevel;
    this.currentLevel = level;
    
    // Record degradation event
    this.metrics.degradationEvents.push({
      from: previousLevel,
      to: level,
      timestamp: new Date().toISOString()
    });
    
    // Keep only last 100 events
    if (this.metrics.degradationEvents.length > 100) {
      this.metrics.degradationEvents = this.metrics.degradationEvents.slice(-100);
    }
    
    // Apply feature toggles based on level
    for (const [feature, config] of this.featureToggles) {
      const shouldDisable = this.levels[level] >= this.levels[config.degradationLevel];
      const wasEnabled = config.enabled;
      
      config.enabled = !shouldDisable;
      
      if (wasEnabled !== config.enabled) {
        this.emit('featureToggled', {
          feature,
          enabled: config.enabled,
          level,
          reason: 'degradation'
        });
      }
    }
    
    // Update metrics
    this.metrics.featureToggles = Object.fromEntries(
      Array.from(this.featureToggles.entries()).map(([k, v]) => [k, v.enabled])
    );
    
    // Emit level change event
    this.emit('degradationLevelChanged', {
      from: previousLevel,
      to: level,
      features: this.metrics.featureToggles,
      timestamp: new Date().toISOString()
    });
  }
  
  /**
   * Check if should use fallback
   * @private
   */
  shouldUseFallback(service) {
    if (!service) return false;
    
    const config = this.degradationLevels.get(service);
    if (!config) return false;
    
    // Use fallback if in emergency mode
    return this.currentLevel === 'EMERGENCY';
  }
  
  /**
   * Track execution metrics
   * @private
   */
  trackExecution(service, success, latency) {
    // This would typically update metrics used by health checks
    this.emit('executionTracked', {
      service,
      success,
      latency,
      level: this.currentLevel
    });
  }
  
  /**
   * Get feature status
   */
  isFeatureEnabled(feature) {
    const toggle = this.featureToggles.get(feature);
    return toggle ? toggle.enabled : true;
  }
  
  /**
   * Manually toggle feature
   */
  toggleFeature(feature, enabled) {
    const toggle = this.featureToggles.get(feature);
    
    if (toggle) {
      toggle.enabled = enabled;
      
      this.emit('featureToggled', {
        feature,
        enabled,
        level: this.currentLevel,
        reason: 'manual'
      });
    }
  }
  
  /**
   * Get current status
   */
  getStatus() {
    return {
      currentLevel: this.currentLevel,
      features: Object.fromEntries(
        Array.from(this.featureToggles.entries()).map(([k, v]) => [k, v.enabled])
      ),
      metrics: this.getMetrics()
    };
  }
  
  /**
   * Get metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      currentLevel: this.currentLevel,
      levelValue: this.levels[this.currentLevel]
    };
  }
  
  /**
   * Reset to normal
   */
  reset() {
    this.applyDegradation('NORMAL');
    
    // Re-enable all features
    for (const [, config] of this.featureToggles) {
      config.enabled = true;
    }
    
    this.emit('reset', { level: 'NORMAL' });
  }
}

module.exports = GracefulDegradation;