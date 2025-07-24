const PrometheusExporter = require('../../../monitoring/metrics/prometheus-exporter');
const CustomMetrics = require('../../../monitoring/metrics/custom-metrics');
const Metrics = require('../../../monitoring/metrics/metrics');
const express = require('express');
const request = require('supertest');

describe('Metrics Collection Integration', () => {
  let app;
  let server;
  let prometheusExporter;
  let customMetrics;
  let metrics;

  beforeEach(() => {
    // Initialize metrics components
    prometheusExporter = new PrometheusExporter({
      prefix: 'test_',
      defaultLabels: {
        service: 'test-service',
        environment: 'test'
      }
    });

    customMetrics = new CustomMetrics({
      prometheusExporter,
      namespace: 'integration_test'
    });

    metrics = new Metrics({
      prometheusExporter,
      customMetrics
    });

    // Create Express app with metrics endpoint
    app = express();
    app.use(express.json());
    
    // Add metrics endpoint
    app.use('/metrics', prometheusExporter.createMetricsEndpoint());

    // Add test endpoints
    app.get('/test', (req, res) => {
      metrics.http.recordRequest({
        method: req.method,
        path: req.path,
        statusCode: 200,
        duration: Math.random() * 100
      });
      res.json({ success: true });
    });

    app.post('/api/users', (req, res) => {
      metrics.business.recordEvent('user_created');
      res.status(201).json({ id: Date.now() });
    });

    app.get('/error', (req, res) => {
      metrics.errors.recordError(new Error('Test error'), {
        path: req.path
      });
      res.status(500).json({ error: 'Internal server error' });
    });
  });

  afterEach(() => {
    if (server) {
      server.close();
    }
    // Clear all metrics
    prometheusExporter.clear();
  });

  describe('HTTP Metrics Collection', () => {
    it('should collect HTTP request metrics', async () => {
      const httpExporter = prometheusExporter.getExporter('http');
      const middleware = httpExporter.middleware();
      
      app.use(middleware);
      
      // Make multiple requests
      await request(app).get('/test').expect(200);
      await request(app).get('/test').expect(200);
      await request(app).post('/api/users').send({ name: 'Test' }).expect(201);
      await request(app).get('/error').expect(500);

      // Get metrics
      const metricsResponse = await request(app).get('/metrics').expect(200);
      const metricsText = metricsResponse.text;

      // Verify HTTP metrics are present
      expect(metricsText).toContain('test_http_requests_total');
      expect(metricsText).toContain('test_http_request_duration_seconds');
      expect(metricsText).toContain('test_http_requests_active');
      
      // Verify labels
      expect(metricsText).toContain('method="GET"');
      expect(metricsText).toContain('method="POST"');
      expect(metricsText).toContain('status="200"');
      expect(metricsText).toContain('status="500"');
    });

    it('should track request sizes', async () => {
      const httpExporter = prometheusExporter.getExporter('http');
      const middleware = httpExporter.middleware();
      
      app.use(middleware);

      // Send request with body
      const largeData = { data: 'x'.repeat(1000) };
      await request(app)
        .post('/api/users')
        .send(largeData)
        .expect(201);

      const metricsResponse = await request(app).get('/metrics').expect(200);
      const metricsText = metricsResponse.text;

      expect(metricsText).toContain('test_http_request_size_bytes');
      expect(metricsText).toContain('test_http_response_size_bytes');
    });
  });

  describe('Business Metrics Collection', () => {
    it('should collect business events', async () => {
      const businessExporter = prometheusExporter.getExporter('business');

      // Record various business events
      businessExporter.recordEvent('user_signup', 'success');
      businessExporter.recordEvent('user_signup', 'failed', { reason: 'email_exists' });
      businessExporter.recordEvent('purchase', 'completed', { product: 'premium' });
      
      businessExporter.recordRevenue(99.99, 'USD', 'subscription');
      businessExporter.updateActiveUsers(1234, 'daily');
      businessExporter.updateConversionRate(0.15, 'checkout');

      const metricsResponse = await request(app).get('/metrics').expect(200);
      const metricsText = metricsResponse.text;

      expect(metricsText).toContain('test_business_events_total');
      expect(metricsText).toContain('test_revenue_total');
      expect(metricsText).toContain('test_active_users');
      expect(metricsText).toContain('test_conversion_rate');
      
      // Verify event types
      expect(metricsText).toContain('event="user_signup"');
      expect(metricsText).toContain('status="success"');
      expect(metricsText).toContain('status="failed"');
    });

    it('should track API usage metrics', async () => {
      const businessExporter = prometheusExporter.getExporter('business');

      // Simulate API usage
      for (let i = 0; i < 10; i++) {
        businessExporter.recordAPIUsage('/api/v1/users', 'free', 'v1');
      }
      
      for (let i = 0; i < 5; i++) {
        businessExporter.recordAPIUsage('/api/v1/products', 'premium', 'v1');
      }

      const metricsResponse = await request(app).get('/metrics').expect(200);
      const metricsText = metricsResponse.text;

      expect(metricsText).toContain('test_api_usage_total');
      expect(metricsText).toContain('endpoint="/api/v1/users"');
      expect(metricsText).toContain('tier="free"');
      expect(metricsText).toContain('tier="premium"');
    });
  });

  describe('Database Metrics Collection', () => {
    it('should collect database operation metrics', async () => {
      const dbExporter = prometheusExporter.getExporter('database');

      // Simulate database operations
      const selectQuery = dbExporter.trackQuery('SELECT', 'users', 'primary');
      await new Promise(resolve => setTimeout(resolve, 50));
      selectQuery.success(10); // 10 rows

      const insertQuery = dbExporter.trackQuery('INSERT', 'users', 'primary');
      await new Promise(resolve => setTimeout(resolve, 20));
      insertQuery.success(1);

      const failedQuery = dbExporter.trackQuery('UPDATE', 'orders', 'primary');
      failedQuery.error(new Error('Constraint violation'));

      const metricsResponse = await request(app).get('/metrics').expect(200);
      const metricsText = metricsResponse.text;

      expect(metricsText).toContain('test_db_query_duration_seconds');
      expect(metricsText).toContain('operation="SELECT"');
      expect(metricsText).toContain('operation="INSERT"');
      expect(metricsText).toContain('status="success"');
      expect(metricsText).toContain('status="error"');
    });

    it('should track connection pool metrics', async () => {
      const dbExporter = prometheusExporter.getExporter('database');

      // Simulate connection pool
      const conn1 = dbExporter.trackConnection('primary');
      const conn2 = dbExporter.trackConnection('primary');
      const conn3 = dbExporter.trackConnection('replica');

      conn1.release();
      conn2.idle();

      const metricsResponse = await request(app).get('/metrics').expect(200);
      const metricsText = metricsResponse.text;

      expect(metricsText).toContain('test_db_connections_active');
      expect(metricsText).toContain('test_db_connections_total');
      expect(metricsText).toContain('pool="primary"');
      expect(metricsText).toContain('pool="replica"');
    });
  });

  describe('Cache Metrics Collection', () => {
    it('should collect cache operation metrics', async () => {
      const cacheExporter = prometheusExporter.getExporter('cache');

      // Simulate cache operations
      for (let i = 0; i < 100; i++) {
        if (Math.random() > 0.3) {
          cacheExporter.hit('redis', 'get');
        } else {
          cacheExporter.miss('redis', 'get');
        }
      }

      cacheExporter.evict('redis', 'ttl', 10);
      cacheExporter.evict('redis', 'lru', 5);
      
      cacheExporter.updateSize('redis', 1024 * 1024); // 1MB
      cacheExporter.updateEntries('redis', 1500);

      const metricsResponse = await request(app).get('/metrics').expect(200);
      const metricsText = metricsResponse.text;

      expect(metricsText).toContain('test_cache_hits_total');
      expect(metricsText).toContain('test_cache_misses_total');
      expect(metricsText).toContain('test_cache_evictions_total');
      expect(metricsText).toContain('test_cache_size_bytes');
      expect(metricsText).toContain('test_cache_entries');
      
      // Calculate hit rate from metrics
      const hitMatches = metricsText.match(/test_cache_hits_total{[^}]*} (\d+)/);
      const missMatches = metricsText.match(/test_cache_misses_total{[^}]*} (\d+)/);
      
      if (hitMatches && missMatches) {
        const hits = parseInt(hitMatches[1]);
        const misses = parseInt(missMatches[1]);
        const hitRate = hits / (hits + misses);
        expect(hitRate).toBeGreaterThan(0.5); // Should be around 0.7
      }
    });
  });

  describe('Custom Metrics', () => {
    it('should allow custom metric definitions', async () => {
      // Define custom metrics
      const customExporter = prometheusExporter.createCustomExporter('feature', {
        featureUsage: {
          type: 'Counter',
          name: 'feature_usage_total',
          help: 'Feature usage counter',
          labelNames: ['feature', 'user_type']
        },
        processingQueue: {
          type: 'Gauge',
          name: 'processing_queue_size',
          help: 'Current processing queue size'
        },
        taskDuration: {
          type: 'Histogram',
          name: 'task_duration_seconds',
          help: 'Task processing duration',
          labelNames: ['task_type'],
          buckets: [0.1, 0.5, 1, 2, 5, 10]
        }
      });

      // Use custom metrics
      customExporter.featureUsage.inc({ feature: 'export', user_type: 'premium' });
      customExporter.featureUsage.inc({ feature: 'import', user_type: 'free' }, 5);
      
      customExporter.processingQueue.set(42);
      
      customExporter.taskDuration.observe({ task_type: 'report' }, 1.5);
      customExporter.taskDuration.observe({ task_type: 'report' }, 2.3);
      customExporter.taskDuration.observe({ task_type: 'email' }, 0.3);

      const metricsResponse = await request(app).get('/metrics').expect(200);
      const metricsText = metricsResponse.text;

      expect(metricsText).toContain('test_feature_usage_total');
      expect(metricsText).toContain('test_processing_queue_size');
      expect(metricsText).toContain('test_task_duration_seconds');
    });
  });

  describe('System Metrics', () => {
    it('should collect system resource metrics', async () => {
      const systemExporter = prometheusExporter.getExporter('system');

      // Update system metrics
      systemExporter.updateCPU(0.45, [0.4, 0.5, 0.45, 0.48]);
      systemExporter.updateMemory({
        used: 1024 * 1024 * 1024, // 1GB
        total: 4 * 1024 * 1024 * 1024, // 4GB
        percentage: 25
      });
      systemExporter.updateDisk('/', {
        used: 50 * 1024 * 1024 * 1024, // 50GB
        total: 100 * 1024 * 1024 * 1024, // 100GB
        percentage: 50
      });

      const metricsResponse = await request(app).get('/metrics').expect(200);
      const metricsText = metricsResponse.text;

      expect(metricsText).toContain('test_cpu_usage_ratio');
      expect(metricsText).toContain('test_memory_usage_bytes');
      expect(metricsText).toContain('test_disk_usage_bytes');
    });
  });

  describe('Metric Aggregation', () => {
    it('should aggregate metrics across multiple sources', async () => {
      // Simulate metrics from multiple instances
      const instance1 = new PrometheusExporter({
        prefix: 'app_',
        defaultLabels: { instance: 'node1' }
      });
      
      const instance2 = new PrometheusExporter({
        prefix: 'app_',
        defaultLabels: { instance: 'node2' }
      });

      // Record same metrics on both instances
      const http1 = instance1.getExporter('http');
      const http2 = instance2.getExporter('http');

      http1.metrics.httpRequestsTotal.inc({ method: 'GET', status: '200' }, 100);
      http2.metrics.httpRequestsTotal.inc({ method: 'GET', status: '200' }, 150);

      // Combine metrics
      const metrics1 = await instance1.register.metrics();
      const metrics2 = await instance2.register.metrics();

      expect(metrics1).toContain('instance="node1"');
      expect(metrics2).toContain('instance="node2"');
    });
  });

  describe('Metrics Export Formats', () => {
    it('should export metrics in Prometheus format', async () => {
      // Add some metrics
      const httpExporter = prometheusExporter.getExporter('http');
      httpExporter.metrics.httpRequestsTotal.inc({ method: 'GET', status: '200' });

      const metricsText = await prometheusExporter.register.metrics();
      
      // Verify Prometheus format
      expect(metricsText).toMatch(/^# HELP/m);
      expect(metricsText).toMatch(/^# TYPE/m);
      expect(metricsText).toMatch(/test_http_requests_total{[^}]+} \d+/);
    });

    it('should export metrics as JSON', async () => {
      // Add some metrics
      const businessExporter = prometheusExporter.getExporter('business');
      businessExporter.recordEvent('test_event', 'success');

      const metricsJson = await prometheusExporter.getMetricsAsJSON();
      
      expect(Array.isArray(metricsJson)).toBe(true);
      expect(metricsJson.length).toBeGreaterThan(0);
      
      const eventMetric = metricsJson.find(m => m.name === 'test_business_events_total');
      expect(eventMetric).toBeDefined();
      expect(eventMetric.type).toBe('counter');
      expect(eventMetric.values).toBeDefined();
    });
  });

  describe('Real-time Monitoring', () => {
    it('should provide real-time metric updates', async () => {
      const httpExporter = prometheusExporter.getExporter('http');
      
      // Take initial snapshot
      const initialMetrics = await request(app).get('/metrics');
      const initialCount = (initialMetrics.text.match(/test_http_requests_total{[^}]+} (\d+)/) || [, '0'])[1];

      // Generate traffic
      for (let i = 0; i < 10; i++) {
        httpExporter.metrics.httpRequestsTotal.inc({ method: 'GET', status: '200' });
      }

      // Take second snapshot
      const updatedMetrics = await request(app).get('/metrics');
      const updatedCount = (updatedMetrics.text.match(/test_http_requests_total{[^}]+} (\d+)/) || [, '0'])[1];

      expect(parseInt(updatedCount)).toBe(parseInt(initialCount) + 10);
    });

    it('should handle metric resets', async () => {
      const cacheExporter = prometheusExporter.getExporter('cache');
      
      // Add metrics
      cacheExporter.hit('redis', 'get', 100);
      
      // Reset specific metric
      prometheusExporter.resetMetrics('cache', ['cacheHits']);
      
      const metricsResponse = await request(app).get('/metrics').expect(200);
      const metricsText = metricsResponse.text;
      
      // Cache hits should be reset to 0
      expect(metricsText).toMatch(/test_cache_hits_total{[^}]+} 0/);
    });
  });
});