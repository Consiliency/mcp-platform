const { EventEmitter } = require('events');

/**
 * Anomaly Detection (FEATURE-8.2)
 * Detects unusual patterns in system behavior using statistical and ML techniques
 */
class AnomalyDetector extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      windowSize: config.windowSize || 100, // Number of data points for baseline
      sensitivity: config.sensitivity || 2, // Standard deviations for anomaly
      algorithms: config.algorithms || ['statistical', 'pattern'],
      alertThreshold: config.alertThreshold || 3, // Consecutive anomalies before alert
      learningRate: config.learningRate || 0.1,
      decayFactor: config.decayFactor || 0.95,
      enableMachineLearning: config.enableMachineLearning || false,
      persistBaselines: config.persistBaselines !== false,
      baselineUpdateInterval: config.baselineUpdateInterval || 300000 // 5 minutes
    };
    
    // Metric storage
    this.metrics = new Map();
    this.baselines = new Map();
    this.thresholds = new Map();
    this.anomalies = [];
    this.alerts = new Map();
    
    // Pattern detection
    this.patterns = new Map();
    this.seasonalFactors = new Map();
    
    // ML model placeholder
    this.model = null;
    this.isTraining = false;
    
    // Initialize detection engines
    this._initializeDetectors();
  }
  
  /**
   * Configure anomaly detection rules
   */
  configureRules(rules) {
    rules.forEach(rule => {
      const {
        metric,
        type = 'threshold',
        threshold,
        direction = 'both', // 'up', 'down', 'both'
        sensitivity,
        window,
        pattern
      } = rule;
      
      this.thresholds.set(metric, {
        type,
        threshold,
        direction,
        sensitivity: sensitivity || this.config.sensitivity,
        window: window || this.config.windowSize,
        pattern,
        enabled: true
      });
      
      // Initialize metric storage
      if (!this.metrics.has(metric)) {
        this.metrics.set(metric, {
          values: [],
          timestamps: [],
          anomalyCount: 0,
          lastAnomaly: null
        });
      }
    });
    
    this.emit('rules-configured', rules.length);
  }
  
  /**
   * Process incoming metrics
   */
  processMetrics(metrics) {
    const detectedAnomalies = [];
    
    Object.entries(metrics).forEach(([metricName, value]) => {
      const timestamp = Date.now();
      
      // Store metric value
      this._storeMetricValue(metricName, value, timestamp);
      
      // Check for anomalies
      const anomaly = this._detectAnomaly(metricName, value, timestamp);
      
      if (anomaly) {
        detectedAnomalies.push(anomaly);
        this._handleAnomaly(anomaly);
      }
      
      // Update baselines periodically
      this._updateBaseline(metricName);
    });
    
    if (detectedAnomalies.length > 0) {
      this.emit('anomalies-detected', detectedAnomalies);
    }
    
    return detectedAnomalies;
  }
  
  /**
   * Machine learning based detection
   */
  async trainModel(historicalData) {
    if (!this.config.enableMachineLearning) {
      throw new Error('Machine learning is disabled');
    }
    
    this.isTraining = true;
    this.emit('training-started');
    
    try {
      // Prepare training data
      const trainingData = this._prepareTrainingData(historicalData);
      
      // Simple isolation forest implementation placeholder
      this.model = {
        type: 'isolation-forest',
        trees: [],
        threshold: 0,
        features: []
      };
      
      // Train on normal data to establish patterns
      const features = this._extractFeatures(trainingData);
      
      // Build isolation trees
      for (let i = 0; i < 100; i++) {
        const tree = this._buildIsolationTree(features);
        this.model.trees.push(tree);
      }
      
      // Calculate anomaly threshold
      const scores = features.map(f => this._calculateAnomalyScore(f));
      this.model.threshold = this._calculateThreshold(scores);
      
      // Update seasonal patterns
      this._detectSeasonalPatterns(trainingData);
      
      this.isTraining = false;
      this.emit('training-completed', {
        dataPoints: trainingData.length,
        features: features.length,
        threshold: this.model.threshold
      });
      
    } catch (error) {
      this.isTraining = false;
      this.emit('training-failed', error);
      throw error;
    }
  }
  
  /**
   * Generate anomaly report
   */
  generateReport(timeRange = { hours: 24 }) {
    const endTime = Date.now();
    const startTime = endTime - (timeRange.hours * 60 * 60 * 1000);
    
    // Filter anomalies within time range
    const recentAnomalies = this.anomalies.filter(
      a => a.timestamp >= startTime && a.timestamp <= endTime
    );
    
    // Group by metric
    const byMetric = {};
    recentAnomalies.forEach(anomaly => {
      if (!byMetric[anomaly.metric]) {
        byMetric[anomaly.metric] = [];
      }
      byMetric[anomaly.metric].push(anomaly);
    });
    
    // Calculate statistics
    const stats = {
      totalAnomalies: recentAnomalies.length,
      byMetric: {},
      bySeverity: {
        low: 0,
        medium: 0,
        high: 0,
        critical: 0
      },
      topMetrics: [],
      recommendations: []
    };
    
    // Analyze each metric
    Object.entries(byMetric).forEach(([metric, anomalies]) => {
      const severity = this._calculateSeverity(anomalies);
      stats.byMetric[metric] = {
        count: anomalies.length,
        severity,
        pattern: this._detectPattern(anomalies),
        lastOccurrence: Math.max(...anomalies.map(a => a.timestamp))
      };
      
      stats.bySeverity[severity]++;
    });
    
    // Top problematic metrics
    stats.topMetrics = Object.entries(stats.byMetric)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .map(([metric, data]) => ({ metric, ...data }));
    
    // Generate recommendations
    stats.recommendations = this._generateRecommendations(stats);
    
    return {
      timeRange: {
        start: new Date(startTime),
        end: new Date(endTime)
      },
      stats,
      anomalies: recentAnomalies,
      baselines: Object.fromEntries(this.baselines)
    };
  }
  
  /**
   * Initialize detection algorithms
   */
  _initializeDetectors() {
    // Statistical detector
    if (this.config.algorithms.includes('statistical')) {
      this.on('metric-stored', ({ metric, value }) => {
        this._statisticalDetection(metric, value);
      });
    }
    
    // Pattern detector
    if (this.config.algorithms.includes('pattern')) {
      this.on('metric-stored', ({ metric, value }) => {
        this._patternDetection(metric, value);
      });
    }
    
    // Baseline updater
    setInterval(() => {
      this.metrics.forEach((data, metric) => {
        this._updateBaseline(metric);
      });
    }, this.config.baselineUpdateInterval);
  }
  
  /**
   * Store metric value
   */
  _storeMetricValue(metric, value, timestamp) {
    if (!this.metrics.has(metric)) {
      this.metrics.set(metric, {
        values: [],
        timestamps: [],
        anomalyCount: 0,
        lastAnomaly: null
      });
    }
    
    const data = this.metrics.get(metric);
    data.values.push(value);
    data.timestamps.push(timestamp);
    
    // Keep window size limited
    if (data.values.length > this.config.windowSize * 2) {
      data.values.shift();
      data.timestamps.shift();
    }
    
    this.emit('metric-stored', { metric, value, timestamp });
  }
  
  /**
   * Detect anomaly for a metric
   */
  _detectAnomaly(metric, value, timestamp) {
    const threshold = this.thresholds.get(metric);
    if (!threshold || !threshold.enabled) {
      return null;
    }
    
    const baseline = this.baselines.get(metric);
    if (!baseline) {
      return null;
    }
    
    let isAnomaly = false;
    let severity = 'low';
    let reason = '';
    
    switch (threshold.type) {
      case 'threshold':
        if (threshold.direction === 'up' || threshold.direction === 'both') {
          if (value > threshold.threshold) {
            isAnomaly = true;
            reason = `Value ${value} exceeds threshold ${threshold.threshold}`;
          }
        }
        if (threshold.direction === 'down' || threshold.direction === 'both') {
          if (value < threshold.threshold) {
            isAnomaly = true;
            reason = `Value ${value} below threshold ${threshold.threshold}`;
          }
        }
        break;
        
      case 'statistical':
        const deviation = Math.abs(value - baseline.mean) / baseline.stdDev;
        if (deviation > threshold.sensitivity) {
          isAnomaly = true;
          severity = deviation > 3 ? 'high' : 'medium';
          reason = `Statistical anomaly: ${deviation.toFixed(2)} standard deviations`;
        }
        break;
        
      case 'pattern':
        if (this.patterns.has(metric)) {
          const expected = this._predictValue(metric, timestamp);
          const error = Math.abs(value - expected) / expected;
          if (error > 0.2) { // 20% error
            isAnomaly = true;
            reason = `Pattern anomaly: expected ${expected.toFixed(2)}, got ${value}`;
          }
        }
        break;
    }
    
    if (isAnomaly) {
      return {
        metric,
        value,
        timestamp,
        severity,
        reason,
        baseline: baseline.mean,
        threshold: threshold.threshold
      };
    }
    
    return null;
  }
  
  /**
   * Handle detected anomaly
   */
  _handleAnomaly(anomaly) {
    // Store anomaly
    this.anomalies.push(anomaly);
    
    // Update metric data
    const data = this.metrics.get(anomaly.metric);
    data.anomalyCount++;
    data.lastAnomaly = anomaly.timestamp;
    
    // Check for alerts
    const alertKey = `${anomaly.metric}-${anomaly.severity}`;
    if (!this.alerts.has(alertKey)) {
      this.alerts.set(alertKey, {
        count: 0,
        firstSeen: anomaly.timestamp,
        lastSeen: anomaly.timestamp
      });
    }
    
    const alert = this.alerts.get(alertKey);
    alert.count++;
    alert.lastSeen = anomaly.timestamp;
    
    // Trigger alert if threshold reached
    if (alert.count >= this.config.alertThreshold) {
      this.emit('alert', {
        ...anomaly,
        alertCount: alert.count,
        duration: alert.lastSeen - alert.firstSeen
      });
      
      // Reset alert counter
      alert.count = 0;
    }
  }
  
  /**
   * Update baseline for a metric
   */
  _updateBaseline(metric) {
    const data = this.metrics.get(metric);
    if (!data || data.values.length < 10) {
      return;
    }
    
    const recentValues = data.values.slice(-this.config.windowSize);
    
    // Calculate statistics
    const mean = recentValues.reduce((a, b) => a + b) / recentValues.length;
    const variance = recentValues.reduce((sum, val) => 
      sum + Math.pow(val - mean, 2), 0) / recentValues.length;
    const stdDev = Math.sqrt(variance);
    
    // Exponential moving average
    const currentBaseline = this.baselines.get(metric);
    if (currentBaseline) {
      // Smooth updates
      const alpha = this.config.learningRate;
      this.baselines.set(metric, {
        mean: alpha * mean + (1 - alpha) * currentBaseline.mean,
        stdDev: alpha * stdDev + (1 - alpha) * currentBaseline.stdDev,
        min: Math.min(...recentValues),
        max: Math.max(...recentValues),
        lastUpdate: Date.now()
      });
    } else {
      this.baselines.set(metric, {
        mean,
        stdDev,
        min: Math.min(...recentValues),
        max: Math.max(...recentValues),
        lastUpdate: Date.now()
      });
    }
  }
  
  /**
   * Simple isolation tree implementation
   */
  _buildIsolationTree(data, maxDepth = 10) {
    if (data.length <= 1 || maxDepth <= 0) {
      return { type: 'leaf', size: data.length };
    }
    
    // Random feature and split
    const featureIdx = Math.floor(Math.random() * data[0].length);
    const values = data.map(d => d[featureIdx]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const split = min + Math.random() * (max - min);
    
    const left = data.filter(d => d[featureIdx] < split);
    const right = data.filter(d => d[featureIdx] >= split);
    
    return {
      type: 'node',
      feature: featureIdx,
      split,
      left: this._buildIsolationTree(left, maxDepth - 1),
      right: this._buildIsolationTree(right, maxDepth - 1)
    };
  }
  
  /**
   * Calculate anomaly score
   */
  _calculateAnomalyScore(point) {
    const pathLengths = this.model.trees.map(tree => 
      this._pathLength(point, tree, 0)
    );
    const avgPathLength = pathLengths.reduce((a, b) => a + b) / pathLengths.length;
    const n = this.model.features.length;
    const c = 2 * (Math.log(n - 1) + 0.5772156649) - 2 * (n - 1) / n;
    
    return Math.pow(2, -avgPathLength / c);
  }
  
  /**
   * Calculate path length in isolation tree
   */
  _pathLength(point, node, currentDepth) {
    if (node.type === 'leaf') {
      return currentDepth + this._estimatePathLength(node.size);
    }
    
    if (point[node.feature] < node.split) {
      return this._pathLength(point, node.left, currentDepth + 1);
    } else {
      return this._pathLength(point, node.right, currentDepth + 1);
    }
  }
  
  /**
   * Estimate average path length for remaining points
   */
  _estimatePathLength(n) {
    if (n <= 1) return 0;
    if (n === 2) return 1;
    return 2 * (Math.log(n - 1) + 0.5772156649) - 2 * (n - 1) / n;
  }
  
  /**
   * Generate recommendations based on anomalies
   */
  _generateRecommendations(stats) {
    const recommendations = [];
    
    // High anomaly rate
    if (stats.totalAnomalies > 100) {
      recommendations.push({
        type: 'configuration',
        priority: 'high',
        message: 'High anomaly rate detected',
        action: 'Review and adjust sensitivity thresholds'
      });
    }
    
    // Repeated patterns
    Object.entries(stats.byMetric).forEach(([metric, data]) => {
      if (data.pattern === 'periodic') {
        recommendations.push({
          type: 'pattern',
          priority: 'medium',
          message: `Periodic anomalies detected in ${metric}`,
          action: 'Consider seasonal adjustment or scheduled maintenance'
        });
      }
    });
    
    // Critical severity
    if (stats.bySeverity.critical > 0) {
      recommendations.push({
        type: 'alert',
        priority: 'critical',
        message: 'Critical anomalies detected',
        action: 'Immediate investigation required'
      });
    }
    
    return recommendations;
  }
  
  /**
   * Calculate severity based on anomaly patterns
   */
  _calculateSeverity(anomalies) {
    if (anomalies.length === 0) return 'low';
    
    const severityScores = {
      low: 1,
      medium: 2,
      high: 3,
      critical: 4
    };
    
    const avgScore = anomalies.reduce((sum, a) => 
      sum + (severityScores[a.severity] || 1), 0) / anomalies.length;
    
    if (avgScore >= 3.5) return 'critical';
    if (avgScore >= 2.5) return 'high';
    if (avgScore >= 1.5) return 'medium';
    return 'low';
  }
  
  /**
   * Detect patterns in anomalies
   */
  _detectPattern(anomalies) {
    if (anomalies.length < 3) return 'random';
    
    // Check for periodic pattern
    const intervals = [];
    for (let i = 1; i < anomalies.length; i++) {
      intervals.push(anomalies[i].timestamp - anomalies[i-1].timestamp);
    }
    
    const avgInterval = intervals.reduce((a, b) => a + b) / intervals.length;
    const variance = intervals.reduce((sum, int) => 
      sum + Math.pow(int - avgInterval, 2), 0) / intervals.length;
    
    if (variance < avgInterval * 0.1) {
      return 'periodic';
    }
    
    // Check for increasing frequency
    const firstHalf = intervals.slice(0, Math.floor(intervals.length / 2));
    const secondHalf = intervals.slice(Math.floor(intervals.length / 2));
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length || 0;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length || 0;
    
    if (secondAvg < firstAvg * 0.5) {
      return 'increasing';
    }
    
    return 'random';
  }
  
  /**
   * Prepare training data
   */
  _prepareTrainingData(historicalData) {
    // Convert to feature vectors
    return historicalData.map(dataPoint => {
      return Object.values(dataPoint.metrics || dataPoint);
    });
  }
  
  /**
   * Extract features from data
   */
  _extractFeatures(data) {
    return data;
  }
  
  /**
   * Calculate threshold for anomaly detection
   */
  _calculateThreshold(scores) {
    scores.sort((a, b) => a - b);
    const percentile = 0.95;
    const index = Math.floor(scores.length * percentile);
    return scores[index];
  }
  
  /**
   * Detect seasonal patterns
   */
  _detectSeasonalPatterns(data) {
    // Placeholder for seasonal decomposition
    // Would implement STL or similar algorithm
  }
  
  /**
   * Predict value based on patterns
   */
  _predictValue(metric, timestamp) {
    const pattern = this.patterns.get(metric);
    if (!pattern) {
      const baseline = this.baselines.get(metric);
      return baseline ? baseline.mean : 0;
    }
    
    // Simple prediction based on historical average
    return pattern.baseline || 0;
  }
  
  /**
   * Statistical anomaly detection
   */
  _statisticalDetection(metric, value) {
    // Implemented in _detectAnomaly
  }
  
  /**
   * Pattern-based anomaly detection
   */
  _patternDetection(metric, value) {
    // Implemented in _detectAnomaly
  }
}

module.exports = AnomalyDetector;