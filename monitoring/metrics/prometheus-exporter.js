const client = require('prom-client');
const express = require('express');
const { collectDefaultMetrics, Registry } = client;

/**
 * Prometheus exporters for various metrics types
 * Provides specialized exporters for different monitoring scenarios
 */
class PrometheusExporter {
  constructor(options = {}) {
    this.options = {
      prefix: options.prefix || '',
      defaultLabels: options.defaultLabels || {},
      includeDefaultMetrics: options.includeDefaultMetrics !== false,
      defaultMetricsInterval: options.defaultMetricsInterval || 10000,
      aggregatorRegistry: options.aggregatorRegistry,
      ...options
    };

    // Create registry
    this.register = new Registry();
    
    // Set default labels
    if (Object.keys(this.options.defaultLabels).length > 0) {
      this.register.setDefaultLabels(this.options.defaultLabels);
    }

    // Collect default metrics if enabled
    if (this.options.includeDefaultMetrics) {
      collectDefaultMetrics({
        register: this.register,
        prefix: this.options.prefix,
        gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
        eventLoopMonitoringPrecision: this.options.defaultMetricsInterval
      });
    }

    // Store custom exporters
    this.exporters = new Map();
    
    // Initialize built-in exporters
    this._initializeBuiltInExporters();
  }

  /**
   * Initialize built-in exporters
   */
  _initializeBuiltInExporters() {
    // HTTP Server Exporter
    this.exporters.set('http', this._createHTTPExporter());
    
    // Database Exporter
    this.exporters.set('database', this._createDatabaseExporter());
    
    // Cache Exporter
    this.exporters.set('cache', this._createCacheExporter());
    
    // Message Queue Exporter
    this.exporters.set('messageQueue', this._createMessageQueueExporter());
    
    // Business Metrics Exporter
    this.exporters.set('business', this._createBusinessExporter());
    
    // System Resources Exporter
    this.exporters.set('system', this._createSystemExporter());
  }

  /**
   * Create HTTP server metrics exporter
   */
  _createHTTPExporter() {
    const httpRequestDuration = new client.Histogram({
      name: `${this.options.prefix}http_request_duration_seconds`,
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code', 'status_class'],
      buckets: [0.001, 0.005, 0.015, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 1, 2, 5],
      registers: [this.register]
    });

    const httpRequestsTotal = new client.Counter({
      name: `${this.options.prefix}http_requests_total`,
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code', 'status_class'],
      registers: [this.register]
    });

    const httpRequestSize = new client.Histogram({
      name: `${this.options.prefix}http_request_size_bytes`,
      help: 'Size of HTTP requests in bytes',
      labelNames: ['method', 'route'],
      buckets: [10, 100, 1000, 10000, 100000, 1000000],
      registers: [this.register]
    });

    const httpResponseSize = new client.Histogram({
      name: `${this.options.prefix}http_response_size_bytes`,
      help: 'Size of HTTP responses in bytes',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [10, 100, 1000, 10000, 100000, 1000000],
      registers: [this.register]
    });

    const httpActiveRequests = new client.Gauge({
      name: `${this.options.prefix}http_active_requests`,
      help: 'Number of active HTTP requests',
      labelNames: ['method'],
      registers: [this.register]
    });

    return {
      middleware: (options = {}) => {
        const { 
          includeRoute = true, 
          includeMethod = true,
          includeStatusCode = true,
          normalizePath = (path) => path
        } = options;

        return (req, res, next) => {
          const start = process.hrtime.bigint();
          const route = includeRoute ? normalizePath(req.route?.path || req.path) : 'all';
          const method = includeMethod ? req.method : 'all';
          
          // Increment active requests
          httpActiveRequests.inc({ method });

          // Measure request size
          const requestSize = parseInt(req.headers['content-length'] || '0');
          if (requestSize > 0) {
            httpRequestSize.observe({ method, route }, requestSize);
          }

          // Override end method
          const originalEnd = res.end;
          res.end = function(...args) {
            const end = process.hrtime.bigint();
            const duration = Number(end - start) / 1e9; // Convert to seconds
            
            const statusCode = includeStatusCode ? res.statusCode : 'all';
            const statusClass = `${Math.floor(res.statusCode / 100)}xx`;
            
            // Record metrics
            const labels = { method, route, status_code: statusCode, status_class: statusClass };
            httpRequestDuration.observe(labels, duration);
            httpRequestsTotal.inc(labels);
            
            // Decrement active requests
            httpActiveRequests.dec({ method });
            
            // Measure response size
            const responseSize = parseInt(res.getHeader('content-length') || '0');
            if (responseSize > 0) {
              httpResponseSize.observe({ method, route, status_code: statusCode }, responseSize);
            }
            
            originalEnd.apply(res, args);
          };
          
          next();
        };
      },
      metrics: {
        httpRequestDuration,
        httpRequestsTotal,
        httpRequestSize,
        httpResponseSize,
        httpActiveRequests
      }
    };
  }

  /**
   * Create database metrics exporter
   */
  _createDatabaseExporter() {
    const dbQueryDuration = new client.Histogram({
      name: `${this.options.prefix}database_query_duration_seconds`,
      help: 'Duration of database queries in seconds',
      labelNames: ['operation', 'table', 'database', 'status'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
      registers: [this.register]
    });

    const dbConnectionsActive = new client.Gauge({
      name: `${this.options.prefix}database_connections_active`,
      help: 'Number of active database connections',
      labelNames: ['database', 'state'],
      registers: [this.register]
    });

    const dbConnectionsTotal = new client.Counter({
      name: `${this.options.prefix}database_connections_total`,
      help: 'Total number of database connections created',
      labelNames: ['database'],
      registers: [this.register]
    });

    const dbTransactionsTotal = new client.Counter({
      name: `${this.options.prefix}database_transactions_total`,
      help: 'Total number of database transactions',
      labelNames: ['database', 'status'],
      registers: [this.register]
    });

    return {
      trackQuery: (operation, table, database = 'default') => {
        const end = dbQueryDuration.startTimer({ operation, table, database });
        return {
          success: () => end({ status: 'success' }),
          error: () => end({ status: 'error' })
        };
      },
      trackConnection: (database = 'default') => {
        dbConnectionsTotal.inc({ database });
        dbConnectionsActive.inc({ database, state: 'active' });
        return {
          release: () => dbConnectionsActive.dec({ database, state: 'active' }),
          idle: () => {
            dbConnectionsActive.dec({ database, state: 'active' });
            dbConnectionsActive.inc({ database, state: 'idle' });
          }
        };
      },
      trackTransaction: (database = 'default') => {
        return {
          commit: () => dbTransactionsTotal.inc({ database, status: 'committed' }),
          rollback: () => dbTransactionsTotal.inc({ database, status: 'rolled_back' })
        };
      },
      metrics: {
        dbQueryDuration,
        dbConnectionsActive,
        dbConnectionsTotal,
        dbTransactionsTotal
      }
    };
  }

  /**
   * Create cache metrics exporter
   */
  _createCacheExporter() {
    const cacheHits = new client.Counter({
      name: `${this.options.prefix}cache_hits_total`,
      help: 'Total number of cache hits',
      labelNames: ['cache', 'operation'],
      registers: [this.register]
    });

    const cacheMisses = new client.Counter({
      name: `${this.options.prefix}cache_misses_total`,
      help: 'Total number of cache misses',
      labelNames: ['cache', 'operation'],
      registers: [this.register]
    });

    const cacheEvictions = new client.Counter({
      name: `${this.options.prefix}cache_evictions_total`,
      help: 'Total number of cache evictions',
      labelNames: ['cache', 'reason'],
      registers: [this.register]
    });

    const cacheSize = new client.Gauge({
      name: `${this.options.prefix}cache_size_bytes`,
      help: 'Current cache size in bytes',
      labelNames: ['cache'],
      registers: [this.register]
    });

    const cacheEntries = new client.Gauge({
      name: `${this.options.prefix}cache_entries`,
      help: 'Number of entries in cache',
      labelNames: ['cache'],
      registers: [this.register]
    });

    return {
      hit: (cache = 'default', operation = 'get') => 
        cacheHits.inc({ cache, operation }),
      miss: (cache = 'default', operation = 'get') => 
        cacheMisses.inc({ cache, operation }),
      evict: (cache = 'default', reason = 'size') => 
        cacheEvictions.inc({ cache, reason }),
      updateSize: (cache = 'default', size) => 
        cacheSize.set({ cache }, size),
      updateEntries: (cache = 'default', count) => 
        cacheEntries.set({ cache }, count),
      metrics: {
        cacheHits,
        cacheMisses,
        cacheEvictions,
        cacheSize,
        cacheEntries
      }
    };
  }

  /**
   * Create message queue metrics exporter
   */
  _createMessageQueueExporter() {
    const messagesPublished = new client.Counter({
      name: `${this.options.prefix}messages_published_total`,
      help: 'Total number of messages published',
      labelNames: ['queue', 'topic', 'status'],
      registers: [this.register]
    });

    const messagesConsumed = new client.Counter({
      name: `${this.options.prefix}messages_consumed_total`,
      help: 'Total number of messages consumed',
      labelNames: ['queue', 'topic', 'status'],
      registers: [this.register]
    });

    const messageProcessingDuration = new client.Histogram({
      name: `${this.options.prefix}message_processing_duration_seconds`,
      help: 'Duration of message processing in seconds',
      labelNames: ['queue', 'topic'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 5, 10, 30],
      registers: [this.register]
    });

    const queueDepth = new client.Gauge({
      name: `${this.options.prefix}queue_depth`,
      help: 'Number of messages in queue',
      labelNames: ['queue', 'topic'],
      registers: [this.register]
    });

    const consumerLag = new client.Gauge({
      name: `${this.options.prefix}consumer_lag`,
      help: 'Consumer lag in number of messages',
      labelNames: ['queue', 'topic', 'consumer_group'],
      registers: [this.register]
    });

    return {
      published: (queue, topic, success = true) =>
        messagesPublished.inc({ queue, topic, status: success ? 'success' : 'failed' }),
      consumed: (queue, topic, success = true) =>
        messagesConsumed.inc({ queue, topic, status: success ? 'success' : 'failed' }),
      startProcessing: (queue, topic) =>
        messageProcessingDuration.startTimer({ queue, topic }),
      updateQueueDepth: (queue, topic, depth) =>
        queueDepth.set({ queue, topic }, depth),
      updateConsumerLag: (queue, topic, consumerGroup, lag) =>
        consumerLag.set({ queue, topic, consumer_group: consumerGroup }, lag),
      metrics: {
        messagesPublished,
        messagesConsumed,
        messageProcessingDuration,
        queueDepth,
        consumerLag
      }
    };
  }

  /**
   * Create business metrics exporter
   */
  _createBusinessExporter() {
    const businessEvents = new client.Counter({
      name: `${this.options.prefix}business_events_total`,
      help: 'Total number of business events',
      labelNames: ['event_type', 'status'],
      registers: [this.register]
    });

    const revenue = new client.Counter({
      name: `${this.options.prefix}revenue_total`,
      help: 'Total revenue',
      labelNames: ['currency', 'product', 'channel'],
      registers: [this.register]
    });

    const activeUsers = new client.Gauge({
      name: `${this.options.prefix}active_users`,
      help: 'Number of active users',
      labelNames: ['timeframe', 'segment'],
      registers: [this.register]
    });

    const conversionRate = new client.Gauge({
      name: `${this.options.prefix}conversion_rate`,
      help: 'Conversion rate percentage',
      labelNames: ['funnel', 'step'],
      registers: [this.register]
    });

    const apiUsage = new client.Counter({
      name: `${this.options.prefix}api_usage_total`,
      help: 'API usage by endpoint and customer',
      labelNames: ['endpoint', 'customer_tier', 'api_version'],
      registers: [this.register]
    });

    return {
      recordEvent: (eventType, status = 'success') =>
        businessEvents.inc({ event_type: eventType, status }),
      recordRevenue: (amount, currency = 'USD', product = 'default', channel = 'web') =>
        revenue.inc({ currency, product, channel }, amount),
      updateActiveUsers: (count, timeframe = 'daily', segment = 'all') =>
        activeUsers.set({ timeframe, segment }, count),
      updateConversionRate: (rate, funnel = 'default', step = 'final') =>
        conversionRate.set({ funnel, step }, rate),
      recordAPIUsage: (endpoint, customerTier = 'free', apiVersion = 'v1') =>
        apiUsage.inc({ endpoint, customer_tier: customerTier, api_version: apiVersion }),
      metrics: {
        businessEvents,
        revenue,
        activeUsers,
        conversionRate,
        apiUsage
      }
    };
  }

  /**
   * Create system resources exporter
   */
  _createSystemExporter() {
    const diskUsage = new client.Gauge({
      name: `${this.options.prefix}disk_usage_bytes`,
      help: 'Disk usage in bytes',
      labelNames: ['mount_point', 'type'],
      registers: [this.register]
    });

    const networkTraffic = new client.Counter({
      name: `${this.options.prefix}network_traffic_bytes_total`,
      help: 'Network traffic in bytes',
      labelNames: ['interface', 'direction'],
      registers: [this.register]
    });

    const externalAPILatency = new client.Histogram({
      name: `${this.options.prefix}external_api_latency_seconds`,
      help: 'External API call latency',
      labelNames: ['api', 'endpoint', 'status'],
      buckets: [0.1, 0.5, 1, 2, 5, 10],
      registers: [this.register]
    });

    const jobQueueSize = new client.Gauge({
      name: `${this.options.prefix}job_queue_size`,
      help: 'Background job queue size',
      labelNames: ['queue', 'priority'],
      registers: [this.register]
    });

    const featureToggle = new client.Gauge({
      name: `${this.options.prefix}feature_toggle_status`,
      help: 'Feature toggle status (1 = enabled, 0 = disabled)',
      labelNames: ['feature'],
      registers: [this.register]
    });

    return {
      updateDiskUsage: (mountPoint, used, type = 'data') =>
        diskUsage.set({ mount_point: mountPoint, type }, used),
      recordNetworkTraffic: (interfaceName, bytes, direction = 'in') =>
        networkTraffic.inc({ interface: interfaceName, direction }, bytes),
      trackExternalAPI: (api, endpoint) => {
        const end = externalAPILatency.startTimer({ api, endpoint });
        return {
          success: () => end({ status: 'success' }),
          error: () => end({ status: 'error' })
        };
      },
      updateJobQueueSize: (queue, size, priority = 'normal') =>
        jobQueueSize.set({ queue, priority }, size),
      updateFeatureToggle: (feature, enabled) =>
        featureToggle.set({ feature }, enabled ? 1 : 0),
      metrics: {
        diskUsage,
        networkTraffic,
        externalAPILatency,
        jobQueueSize,
        featureToggle
      }
    };
  }

  /**
   * Get a specific exporter
   */
  getExporter(name) {
    return this.exporters.get(name);
  }

  /**
   * Create custom exporter
   */
  createCustomExporter(name, metricsConfig) {
    const metrics = {};
    
    Object.entries(metricsConfig).forEach(([metricName, config]) => {
      const MetricType = client[config.type];
      if (!MetricType) {
        throw new Error(`Unknown metric type: ${config.type}`);
      }
      
      metrics[metricName] = new MetricType({
        name: `${this.options.prefix}${config.name}`,
        help: config.help,
        labelNames: config.labelNames || [],
        buckets: config.buckets,
        percentiles: config.percentiles,
        registers: [this.register]
      });
    });
    
    this.exporters.set(name, metrics);
    return metrics;
  }

  /**
   * Create metrics endpoint
   */
  createMetricsEndpoint(options = {}) {
    const {
      path = '/metrics',
      includeTimestamp = true,
      contentType = this.register.contentType
    } = options;

    const router = express.Router();
    
    router.get(path, async (req, res) => {
      try {
        res.set('Content-Type', contentType);
        
        let metrics = await this.register.metrics();
        
        // Add timestamp if requested
        if (includeTimestamp) {
          const timestamp = Date.now();
          metrics = `# HELP metrics_scrape_timestamp_ms Timestamp when metrics were scraped\n` +
                   `# TYPE metrics_scrape_timestamp_ms gauge\n` +
                   `metrics_scrape_timestamp_ms ${timestamp}\n\n` +
                   metrics;
        }
        
        res.end(metrics);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    return router;
  }

  /**
   * Merge with external registry (for aggregation)
   */
  mergeWithRegistry(externalRegistry) {
    if (this.options.aggregatorRegistry) {
      return client.AggregatorRegistry.aggregate([this.register, externalRegistry]);
    }
    return this.register;
  }

  /**
   * Get all metrics as JSON
   */
  async getMetricsAsJSON() {
    return await this.register.getMetricsAsJSON();
  }

  /**
   * Clear all metrics
   */
  clear() {
    this.register.clear();
  }

  /**
   * Reset specific metrics
   */
  resetMetrics(exporterName, metricNames = []) {
    const exporter = this.exporters.get(exporterName);
    if (!exporter) return;
    
    if (metricNames.length === 0) {
      // Reset all metrics in exporter
      Object.values(exporter.metrics || exporter).forEach(metric => {
        if (metric.reset) metric.reset();
      });
    } else {
      // Reset specific metrics
      metricNames.forEach(name => {
        const metric = exporter.metrics ? exporter.metrics[name] : exporter[name];
        if (metric && metric.reset) metric.reset();
      });
    }
  }
}

module.exports = PrometheusExporter;