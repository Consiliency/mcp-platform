/**
 * Metrics Collection Module for MCP Platform
 * MONITOR-4.1: Prometheus integration and custom metrics
 */

const client = require('prom-client');
const Registry = client.Registry;

class MetricsCollector {
  constructor() {
    this.registry = new Registry();
    this.metrics = {};
    this.performanceMetrics = {};
    
    // Initialize default metrics
    this.initializeDefaultMetrics();
  }

  /**
   * Initialize Prometheus integration
   */
  initializePrometheus() {
    try {
      // Enable collection of default metrics
      client.collectDefaultMetrics({
        register: this.registry,
        prefix: 'mcp_'
      });

      // Create custom metrics
      this.metrics.httpRequests = new client.Counter({
        name: 'mcp_http_requests_total',
        help: 'Total number of HTTP requests',
        labelNames: ['method', 'route', 'status_code', 'service'],
        registers: [this.registry]
      });

      this.metrics.httpDuration = new client.Histogram({
        name: 'mcp_http_request_duration_ms',
        help: 'Duration of HTTP requests in ms',
        labelNames: ['method', 'route', 'status_code', 'service'],
        buckets: [0.1, 5, 15, 50, 100, 500, 1000, 5000],
        registers: [this.registry]
      });

      this.metrics.activeServices = new client.Gauge({
        name: 'mcp_active_services',
        help: 'Number of active MCP services',
        labelNames: ['service_type'],
        registers: [this.registry]
      });

      this.metrics.errorRate = new client.Counter({
        name: 'mcp_errors_total',
        help: 'Total number of errors',
        labelNames: ['service', 'error_type'],
        registers: [this.registry]
      });

      this.metrics.serviceHealth = new client.Gauge({
        name: 'mcp_service_health',
        help: 'Health status of MCP services (1=healthy, 0=unhealthy)',
        labelNames: ['service'],
        registers: [this.registry]
      });

      return {
        success: true,
        message: 'Prometheus metrics initialized successfully'
      };
    } catch (error) {
      console.error('Failed to initialize Prometheus:', error);
      throw new Error(`Prometheus initialization failed: ${error.message}`);
    }
  }

  /**
   * Collect service metrics
   */
  collectServiceMetrics(serviceName) {
    if (!serviceName) {
      throw new Error('Service name is required');
    }

    try {
      const metrics = {
        timestamp: new Date().toISOString(),
        service: serviceName,
        system: this.getSystemMetrics(),
        custom: this.getCustomMetrics(serviceName)
      };

      // Update service health gauge
      if (this.metrics.serviceHealth) {
        this.metrics.serviceHealth.set({ service: serviceName }, 1);
      }

      return metrics;
    } catch (error) {
      console.error(`Failed to collect metrics for ${serviceName}:`, error);
      
      // Update error counter
      if (this.metrics.errorRate) {
        this.metrics.errorRate.inc({ 
          service: serviceName, 
          error_type: 'metric_collection' 
        });
      }
      
      throw new Error(`Metric collection failed: ${error.message}`);
    }
  }

  /**
   * Export metrics in Prometheus format
   */
  async exportMetrics() {
    try {
      const metrics = await this.registry.metrics();
      const contentType = this.registry.contentType;
      
      return {
        metrics,
        contentType,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Failed to export metrics:', error);
      throw new Error(`Metric export failed: ${error.message}`);
    }
  }

  /**
   * Track custom performance metrics
   */
  trackPerformance(metricName, value, labels = {}) {
    if (!metricName || value === undefined) {
      throw new Error('Metric name and value are required');
    }

    try {
      // Create performance metric if it doesn't exist
      if (!this.performanceMetrics[metricName]) {
        this.performanceMetrics[metricName] = new client.Histogram({
          name: `mcp_custom_${metricName}`,
          help: `Custom performance metric: ${metricName}`,
          labelNames: Object.keys(labels),
          registers: [this.registry]
        });
      }

      // Record the metric
      this.performanceMetrics[metricName].observe(labels, value);

      return {
        success: true,
        metric: metricName,
        value,
        labels
      };
    } catch (error) {
      console.error(`Failed to track performance metric ${metricName}:`, error);
      throw new Error(`Performance tracking failed: ${error.message}`);
    }
  }

  /**
   * Initialize default metrics
   */
  initializeDefaultMetrics() {
    // Memory usage metric
    this.metrics.memoryUsage = new client.Gauge({
      name: 'mcp_memory_usage_bytes',
      help: 'Memory usage in bytes',
      labelNames: ['type'],
      registers: [this.registry]
    });

    // CPU usage metric
    this.metrics.cpuUsage = new client.Gauge({
      name: 'mcp_cpu_usage_percent',
      help: 'CPU usage percentage',
      registers: [this.registry]
    });

    // Update memory metrics periodically
    this.metricsInterval = setInterval(() => {
      const memUsage = process.memoryUsage();
      this.metrics.memoryUsage.set({ type: 'rss' }, memUsage.rss);
      this.metrics.memoryUsage.set({ type: 'heap_total' }, memUsage.heapTotal);
      this.metrics.memoryUsage.set({ type: 'heap_used' }, memUsage.heapUsed);
      this.metrics.memoryUsage.set({ type: 'external' }, memUsage.external);
    }, 10000);
  }

  /**
   * Get system metrics
   */
  getSystemMetrics() {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    return {
      memory: {
        rss: memUsage.rss,
        heapTotal: memUsage.heapTotal,
        heapUsed: memUsage.heapUsed,
        external: memUsage.external
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system
      },
      uptime: process.uptime()
    };
  }

  /**
   * Get custom metrics for a service
   */
  getCustomMetrics(serviceName) {
    // Return any custom metrics associated with the service
    const customMetrics = {};
    
    for (const [name, metric] of Object.entries(this.performanceMetrics)) {
      if (metric._values && metric._values.length > 0) {
        customMetrics[name] = {
          count: metric._values.length,
          sum: metric._sum,
          average: metric._sum / metric._values.length
        };
      }
    }
    
    return customMetrics;
  }

  /**
   * Record HTTP request
   */
  recordHttpRequest(method, route, statusCode, duration, service) {
    if (this.metrics.httpRequests) {
      this.metrics.httpRequests.inc({ method, route, status_code: statusCode, service });
    }
    
    if (this.metrics.httpDuration) {
      this.metrics.httpDuration.observe({ method, route, status_code: statusCode, service }, duration);
    }
  }

  /**
   * Update active services count
   */
  updateActiveServices(serviceType, count) {
    if (this.metrics.activeServices) {
      this.metrics.activeServices.set({ service_type: serviceType }, count);
    }
  }

  /**
   * Record error
   */
  recordError(service, errorType) {
    if (this.metrics.errorRate) {
      this.metrics.errorRate.inc({ service, error_type: errorType });
    }
  }

  /**
   * Clear all metrics
   */
  clearMetrics() {
    // Clear any existing intervals
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
    
    this.registry.clear();
    this.metrics = {};
    this.performanceMetrics = {};
    this.initializeDefaultMetrics();
  }
}

module.exports = MetricsCollector;