const { EventEmitter } = require('events');

/**
 * Predictive Scaling (FEATURE-8.2)
 * Predicts resource needs and scales proactively using time-series analysis
 */
class PredictiveScaler extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      windowSize: config.windowSize || 1000, // Data points to keep
      predictionHorizon: config.predictionHorizon || 300000, // 5 minutes ahead
      scalingInterval: config.scalingInterval || 60000, // Check every minute
      algorithms: config.algorithms || ['linear', 'seasonal'],
      minInstances: config.minInstances || 1,
      maxInstances: config.maxInstances || 10,
      targetUtilization: config.targetUtilization || 0.7, // 70%
      scaleUpThreshold: config.scaleUpThreshold || 0.8, // 80%
      scaleDownThreshold: config.scaleDownThreshold || 0.3, // 30%
      cooldownPeriod: config.cooldownPeriod || 180000, // 3 minutes
      enableAutoScaling: config.enableAutoScaling !== false
    };
    
    // Data storage
    this.historicalData = new Map(); // serverId -> metrics array
    this.predictions = new Map(); // serverId -> predictions
    this.scalingPolicies = new Map(); // serverId -> policy
    this.scalingHistory = new Map(); // serverId -> last scaling action
    
    // Seasonal patterns
    this.seasonalPatterns = new Map();
    this.trendAnalysis = new Map();
    
    // Scaling executor
    this.scalingExecutor = null;
    this.predictionInterval = null;
    
    // Initialize if auto-scaling enabled
    if (this.config.enableAutoScaling) {
      this._startPredictiveScaling();
    }
  }
  
  /**
   * Collect resource usage data
   */
  collectUsageData(metrics) {
    const timestamp = Date.now();
    
    Object.entries(metrics).forEach(([serverId, data]) => {
      // Initialize storage if needed
      if (!this.historicalData.has(serverId)) {
        this.historicalData.set(serverId, {
          cpu: [],
          memory: [],
          requests: [],
          responseTime: [],
          errors: [],
          timestamps: []
        });
      }
      
      const history = this.historicalData.get(serverId);
      
      // Store metrics
      history.cpu.push(data.cpu || 0);
      history.memory.push(data.memory || 0);
      history.requests.push(data.requests || 0);
      history.responseTime.push(data.responseTime || 0);
      history.errors.push(data.errors || 0);
      history.timestamps.push(timestamp);
      
      // Maintain window size
      if (history.timestamps.length > this.config.windowSize) {
        Object.keys(history).forEach(key => {
          history[key].shift();
        });
      }
      
      // Update seasonal patterns
      this._updateSeasonalPatterns(serverId, data, timestamp);
    });
    
    this.emit('data-collected', { timestamp, serverCount: metrics.length });
  }
  
  /**
   * Predict future resource needs
   */
  async predictResourceNeeds(serverId) {
    const history = this.historicalData.get(serverId);
    if (!history || history.timestamps.length < 10) {
      return null;
    }
    
    const predictions = {
      serverId,
      timestamp: Date.now(),
      horizon: this.config.predictionHorizon,
      metrics: {}
    };
    
    // Predict each metric
    ['cpu', 'memory', 'requests'].forEach(metric => {
      const values = history[metric];
      const timestamps = history.timestamps;
      
      // Apply prediction algorithms
      const linearPred = this._linearRegression(timestamps, values);
      const seasonalPred = this._seasonalPrediction(serverId, metric);
      const arimaLike = this._simpleARIMA(values);
      
      // Weighted ensemble
      predictions.metrics[metric] = {
        predicted: (linearPred * 0.4 + seasonalPred * 0.4 + arimaLike * 0.2),
        confidence: this._calculateConfidence(values),
        trend: linearPred > values[values.length - 1] ? 'increasing' : 'decreasing'
      };
    });
    
    // Calculate scaling recommendation
    predictions.recommendation = this._calculateScalingRecommendation(
      serverId, 
      predictions.metrics
    );
    
    this.predictions.set(serverId, predictions);
    this.emit('prediction-generated', predictions);
    
    return predictions;
  }
  
  /**
   * Execute scaling actions
   */
  async executeScaling(predictions) {
    if (!this.config.enableAutoScaling) {
      return { executed: false, reason: 'Auto-scaling disabled' };
    }
    
    const { serverId, recommendation } = predictions;
    const policy = this.scalingPolicies.get(serverId) || this.config;
    
    // Check cooldown period
    const lastAction = this.scalingHistory.get(serverId);
    if (lastAction && Date.now() - lastAction.timestamp < policy.cooldownPeriod) {
      return { 
        executed: false, 
        reason: 'In cooldown period',
        nextAvailable: lastAction.timestamp + policy.cooldownPeriod
      };
    }
    
    // Validate scaling decision
    const currentInstances = await this._getCurrentInstances(serverId);
    let targetInstances = currentInstances;
    let action = 'none';
    
    switch (recommendation.action) {
      case 'scale-up':
        targetInstances = Math.min(
          currentInstances + recommendation.amount,
          policy.maxInstances
        );
        action = 'scale-up';
        break;
        
      case 'scale-down':
        targetInstances = Math.max(
          currentInstances - recommendation.amount,
          policy.minInstances
        );
        action = 'scale-down';
        break;
    }
    
    if (targetInstances === currentInstances) {
      return { executed: false, reason: 'No scaling needed' };
    }
    
    // Execute scaling
    try {
      const result = await this._performScaling(serverId, targetInstances);
      
      // Record scaling action
      this.scalingHistory.set(serverId, {
        timestamp: Date.now(),
        action,
        from: currentInstances,
        to: targetInstances,
        prediction: predictions
      });
      
      this.emit('scaling-executed', {
        serverId,
        action,
        instances: { from: currentInstances, to: targetInstances },
        result
      });
      
      return {
        executed: true,
        action,
        instances: { from: currentInstances, to: targetInstances }
      };
      
    } catch (error) {
      this.emit('scaling-failed', { serverId, error });
      throw error;
    }
  }
  
  /**
   * Configure scaling policies
   */
  configurePolicy(serverId, policy) {
    const existingPolicy = this.scalingPolicies.get(serverId) || {};
    
    const mergedPolicy = {
      ...this.config,
      ...existingPolicy,
      ...policy,
      serverId,
      updatedAt: Date.now()
    };
    
    // Validate policy
    if (mergedPolicy.minInstances > mergedPolicy.maxInstances) {
      throw new Error('minInstances cannot be greater than maxInstances');
    }
    
    if (mergedPolicy.scaleUpThreshold <= mergedPolicy.scaleDownThreshold) {
      throw new Error('scaleUpThreshold must be greater than scaleDownThreshold');
    }
    
    this.scalingPolicies.set(serverId, mergedPolicy);
    this.emit('policy-configured', { serverId, policy: mergedPolicy });
    
    return mergedPolicy;
  }
  
  /**
   * Get scaling history
   */
  getScalingHistory(serverId, limit = 10) {
    const history = this.scalingHistory.get(serverId);
    if (!history) return [];
    
    return [history]; // In real implementation, would store multiple entries
  }
  
  /**
   * Start predictive scaling loop
   */
  _startPredictiveScaling() {
    this.predictionInterval = setInterval(async () => {
      try {
        // Predict for all servers
        const predictions = [];
        for (const serverId of this.historicalData.keys()) {
          const prediction = await this.predictResourceNeeds(serverId);
          if (prediction) {
            predictions.push(prediction);
          }
        }
        
        // Execute scaling decisions
        for (const prediction of predictions) {
          if (prediction.recommendation.action !== 'none') {
            await this.executeScaling(prediction);
          }
        }
      } catch (error) {
        this.emit('error', error);
      }
    }, this.config.scalingInterval);
  }
  
  /**
   * Linear regression prediction
   */
  _linearRegression(x, y) {
    const n = x.length;
    if (n < 2) return y[n - 1] || 0;
    
    // Calculate means
    const xMean = x.reduce((a, b) => a + b) / n;
    const yMean = y.reduce((a, b) => a + b) / n;
    
    // Calculate slope and intercept
    let numerator = 0;
    let denominator = 0;
    
    for (let i = 0; i < n; i++) {
      numerator += (x[i] - xMean) * (y[i] - yMean);
      denominator += Math.pow(x[i] - xMean, 2);
    }
    
    const slope = denominator !== 0 ? numerator / denominator : 0;
    const intercept = yMean - slope * xMean;
    
    // Predict future value
    const futureTime = Date.now() + this.config.predictionHorizon;
    return slope * futureTime + intercept;
  }
  
  /**
   * Seasonal prediction
   */
  _seasonalPrediction(serverId, metric) {
    const pattern = this.seasonalPatterns.get(`${serverId}-${metric}`);
    if (!pattern) {
      const history = this.historicalData.get(serverId);
      return history[metric][history[metric].length - 1] || 0;
    }
    
    // Simple seasonal adjustment
    const hourOfDay = new Date().getHours();
    const dayOfWeek = new Date().getDay();
    const seasonalFactor = pattern.hourly[hourOfDay] || 1.0;
    const weeklyFactor = pattern.weekly[dayOfWeek] || 1.0;
    
    const baseValue = pattern.baseline || 0;
    return baseValue * seasonalFactor * weeklyFactor;
  }
  
  /**
   * Simple ARIMA-like prediction
   */
  _simpleARIMA(values, p = 2, d = 1, q = 1) {
    if (values.length < p + d + q) {
      return values[values.length - 1] || 0;
    }
    
    // Differencing
    const diffValues = [];
    for (let i = d; i < values.length; i++) {
      diffValues.push(values[i] - values[i - d]);
    }
    
    // Auto-regressive component
    let arSum = 0;
    for (let i = 1; i <= p && i <= diffValues.length; i++) {
      arSum += diffValues[diffValues.length - i] * (1 / i);
    }
    
    // Moving average component (simplified)
    const recentErrors = diffValues.slice(-q);
    const maSum = recentErrors.reduce((a, b) => a + b, 0) / q;
    
    // Combine and reverse differencing
    const prediction = values[values.length - 1] + arSum + maSum * 0.5;
    
    return Math.max(0, prediction);
  }
  
  /**
   * Calculate prediction confidence
   */
  _calculateConfidence(values) {
    if (values.length < 10) return 0.5;
    
    // Calculate coefficient of variation
    const mean = values.reduce((a, b) => a + b) / values.length;
    const variance = values.reduce((sum, val) => 
      sum + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    const cv = mean !== 0 ? stdDev / mean : 1;
    
    // Lower CV means higher confidence
    return Math.max(0, Math.min(1, 1 - cv));
  }
  
  /**
   * Calculate scaling recommendation
   */
  _calculateScalingRecommendation(serverId, predictedMetrics) {
    const policy = this.scalingPolicies.get(serverId) || this.config;
    
    // Calculate overall utilization
    const cpuUtil = predictedMetrics.cpu.predicted / 100;
    const memUtil = predictedMetrics.memory.predicted / 100;
    const utilization = Math.max(cpuUtil, memUtil);
    
    let action = 'none';
    let amount = 0;
    let reason = '';
    
    if (utilization > policy.scaleUpThreshold) {
      action = 'scale-up';
      // Scale based on how much over threshold
      const overUtil = utilization - policy.targetUtilization;
      amount = Math.ceil(overUtil / 0.1); // Add 1 instance per 10% over
      reason = `Predicted utilization ${(utilization * 100).toFixed(1)}% exceeds threshold`;
    } else if (utilization < policy.scaleDownThreshold) {
      action = 'scale-down';
      amount = 1; // Conservative scale down
      reason = `Predicted utilization ${(utilization * 100).toFixed(1)}% below threshold`;
    }
    
    // Consider request trends
    if (predictedMetrics.requests.trend === 'increasing' && action !== 'scale-up') {
      if (predictedMetrics.requests.predicted > 1000) {
        action = 'scale-up';
        amount = 1;
        reason = 'Increasing request trend detected';
      }
    }
    
    return { action, amount, reason, utilization };
  }
  
  /**
   * Update seasonal patterns
   */
  _updateSeasonalPatterns(serverId, data, timestamp) {
    const hour = new Date(timestamp).getHours();
    const day = new Date(timestamp).getDay();
    
    ['cpu', 'memory', 'requests'].forEach(metric => {
      const key = `${serverId}-${metric}`;
      
      if (!this.seasonalPatterns.has(key)) {
        this.seasonalPatterns.set(key, {
          hourly: Array(24).fill(1.0),
          weekly: Array(7).fill(1.0),
          baseline: data[metric] || 0,
          samples: 0
        });
      }
      
      const pattern = this.seasonalPatterns.get(key);
      
      // Update with exponential smoothing
      const alpha = 0.1;
      const value = data[metric] || 0;
      
      pattern.baseline = alpha * value + (1 - alpha) * pattern.baseline;
      
      if (pattern.baseline > 0) {
        const factor = value / pattern.baseline;
        pattern.hourly[hour] = alpha * factor + (1 - alpha) * pattern.hourly[hour];
        pattern.weekly[day] = alpha * factor + (1 - alpha) * pattern.weekly[day];
      }
      
      pattern.samples++;
    });
  }
  
  /**
   * Get current instances (mock implementation)
   */
  async _getCurrentInstances(serverId) {
    // In real implementation, would query actual infrastructure
    return this.scalingHistory.get(serverId)?.to || this.config.minInstances;
  }
  
  /**
   * Perform scaling action (mock implementation)
   */
  async _performScaling(serverId, targetInstances) {
    // In real implementation, would interact with infrastructure API
    this.emit('scaling-action', { serverId, targetInstances });
    
    // Simulate scaling delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return {
      success: true,
      instances: targetInstances,
      timestamp: Date.now()
    };
  }
  
  /**
   * Stop predictive scaling
   */
  stop() {
    if (this.predictionInterval) {
      clearInterval(this.predictionInterval);
      this.predictionInterval = null;
    }
    
    this.emit('stopped');
  }
  
  /**
   * Get current predictions
   */
  getPredictions(serverId) {
    if (serverId) {
      return this.predictions.get(serverId);
    }
    return Object.fromEntries(this.predictions);
  }
  
  /**
   * Get resource statistics
   */
  getResourceStats(serverId) {
    const history = this.historicalData.get(serverId);
    if (!history || history.timestamps.length === 0) {
      return null;
    }
    
    const stats = {};
    
    ['cpu', 'memory', 'requests', 'responseTime'].forEach(metric => {
      const values = history[metric];
      const recent = values.slice(-100); // Last 100 data points
      
      stats[metric] = {
        current: values[values.length - 1],
        average: recent.reduce((a, b) => a + b, 0) / recent.length,
        min: Math.min(...recent),
        max: Math.max(...recent),
        trend: values[values.length - 1] > values[values.length - 10] ? 'up' : 'down'
      };
    });
    
    return stats;
  }
}

module.exports = PredictiveScaler;