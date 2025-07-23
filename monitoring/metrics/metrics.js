const client = require('prom-client');
const express = require('express');

const MetricsInterface = require('../../interfaces/phase6/metrics.interface');

class Metrics extends MetricsInterface {
  constructor(config = {}) {
    super(config);
    
    this.config = {
      prefix: config.prefix || '',
      defaultLabels: config.defaultLabels || {},
      pushGateway: config.pushGateway,
      ...config
    };
    
    // Create a new registry
    this.register = new client.Registry();
    
    // Set default labels
    if (Object.keys(this.config.defaultLabels).length > 0) {
      this.register.setDefaultLabels(this.config.defaultLabels);
    }
    
    // Store metrics for later access
    this.metrics = new Map();
    
    // Initialize push gateway if configured
    if (this.config.pushGateway) {
      this.pushGateway = new client.Pushgateway(this.config.pushGateway, {}, this.register);
    }
  }
  
  createCounter(name, help, labels = []) {
    const metricName = this.config.prefix + name;
    
    const counter = new client.Counter({
      name: metricName,
      help: help,
      labelNames: labels,
      registers: [this.register]
    });
    
    this.metrics.set(metricName, counter);
    
    return {
      inc: (value = 1, labelValues = {}) => {
        if (labels.length > 0) {
          counter.labels(labelValues).inc(value);
        } else {
          counter.inc(value);
        }
      }
    };
  }
  
  createGauge(name, help, labels = []) {
    const metricName = this.config.prefix + name;
    
    const gauge = new client.Gauge({
      name: metricName,
      help: help,
      labelNames: labels,
      registers: [this.register]
    });
    
    this.metrics.set(metricName, gauge);
    
    return {
      set: (value, labelValues = {}) => {
        if (labels.length > 0) {
          gauge.labels(labelValues).set(value);
        } else {
          gauge.set(value);
        }
      },
      inc: (value = 1, labelValues = {}) => {
        if (labels.length > 0) {
          gauge.labels(labelValues).inc(value);
        } else {
          gauge.inc(value);
        }
      },
      dec: (value = 1, labelValues = {}) => {
        if (labels.length > 0) {
          gauge.labels(labelValues).dec(value);
        } else {
          gauge.dec(value);
        }
      }
    };
  }
  
  createHistogram(name, help, buckets = client.linearBuckets(0, 1, 10), labels = []) {
    const metricName = this.config.prefix + name;
    
    const histogram = new client.Histogram({
      name: metricName,
      help: help,
      buckets: buckets,
      labelNames: labels,
      registers: [this.register]
    });
    
    this.metrics.set(metricName, histogram);
    
    return {
      observe: (value, labelValues = {}) => {
        if (labels.length > 0) {
          histogram.labels(labelValues).observe(value);
        } else {
          histogram.observe(value);
        }
      },
      startTimer: (labelValues = {}) => {
        if (labels.length > 0) {
          return histogram.labels(labelValues).startTimer();
        } else {
          return histogram.startTimer();
        }
      }
    };
  }
  
  createSummary(name, help, percentiles = [0.01, 0.05, 0.5, 0.9, 0.95, 0.99, 0.999], labels = []) {
    const metricName = this.config.prefix + name;
    
    const summary = new client.Summary({
      name: metricName,
      help: help,
      percentiles: percentiles,
      labelNames: labels,
      registers: [this.register]
    });
    
    this.metrics.set(metricName, summary);
    
    return {
      observe: (value, labelValues = {}) => {
        if (labels.length > 0) {
          summary.labels(labelValues).observe(value);
        } else {
          summary.observe(value);
        }
      },
      startTimer: (labelValues = {}) => {
        if (labels.length > 0) {
          return summary.labels(labelValues).startTimer();
        } else {
          return summary.startTimer();
        }
      }
    };
  }
  
  collectDefaultMetrics(options = {}) {
    const defaultOptions = {
      register: this.register,
      prefix: options.prefix || this.config.prefix,
      gcDurationBuckets: options.gcDurationBuckets,
      eventLoopMonitoringPrecision: options.timeout || 10
    };
    
    client.collectDefaultMetrics(defaultOptions);
  }
  
  createHTTPMetricsMiddleware(options = {}) {
    const {
      includePath = true,
      includeMethod = true,
      buckets = [0.001, 0.005, 0.015, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 1, 2, 5]
    } = options;
    
    // Create HTTP metrics
    const labelNames = [];
    if (includeMethod) labelNames.push('method');
    if (includePath) labelNames.push('path');
    labelNames.push('status');
    
    const httpDuration = this.createHistogram(
      'http_request_duration_seconds',
      'Duration of HTTP requests in seconds',
      buckets,
      labelNames
    );
    
    const httpRequests = this.createCounter(
      'http_requests_total',
      'Total number of HTTP requests',
      labelNames
    );
    
    return (req, res, next) => {
      const timer = httpDuration.startTimer();
      
      // Capture the end of the request
      const originalEnd = res.end;
      res.end = function(...args) {
        const labels = {};
        
        if (includeMethod) labels.method = req.method;
        if (includePath) labels.path = req.route ? req.route.path : req.path;
        labels.status = res.statusCode;
        
        // Stop timer and record metrics
        timer(labels);
        httpRequests.inc(1, labels);
        
        originalEnd.apply(res, args);
      };
      
      next();
    };
  }
  
  async getMetrics(format = 'prometheus') {
    if (format === 'prometheus') {
      return await this.register.metrics();
    } else if (format === 'json') {
      const metrics = await this.register.getMetricsAsJSON();
      const result = {};
      
      metrics.forEach(metric => {
        result[metric.name] = {
          help: metric.help,
          type: metric.type,
          values: metric.values
        };
      });
      
      return result;
    } else {
      throw new Error(`Unsupported format: ${format}`);
    }
  }
  
  createMetricsEndpoint(options = {}) {
    const {
      path = '/metrics',
      auth = false
    } = options;
    
    const router = express.Router();
    
    // Add authentication middleware if required
    if (auth && typeof auth === 'function') {
      router.use(path, auth);
    }
    
    router.get(path, async (req, res) => {
      try {
        res.set('Content-Type', this.register.contentType);
        const metrics = await this.register.metrics();
        res.end(metrics);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    return router;
  }
  
  async pushMetrics(jobName, groupingKey = {}) {
    if (!this.pushGateway) {
      return {
        success: false,
        error: 'Push gateway not configured'
      };
    }
    
    try {
      await this.pushGateway.push({ jobName, groupingKey });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = Metrics;