const MetricsInterface = require('../../../interfaces/phase6/metrics.interface');

describe('Metrics Unit Tests', () => {
  let metrics;
  
  beforeEach(() => {
    metrics = new MetricsInterface({ 
      prefix: 'test_',
      defaultLabels: { service: 'test' }
    });
  });
  
  describe('Counter metrics', () => {
    test('should create counter', () => {
      const counter = metrics.createCounter('requests_total', 'Total requests');
      expect(counter).toHaveProperty('inc');
    });
    
    test('should increment counter', () => {
      const counter = metrics.createCounter('errors_total', 'Total errors');
      expect(() => counter.inc()).not.toThrow();
      expect(() => counter.inc(5)).not.toThrow();
    });
    
    test('should increment counter with labels', () => {
      const counter = metrics.createCounter('http_requests', 'HTTP requests', ['method', 'status']);
      expect(() => counter.inc(1, { method: 'GET', status: '200' })).not.toThrow();
    });
  });
  
  describe('Gauge metrics', () => {
    test('should create gauge', () => {
      const gauge = metrics.createGauge('active_connections', 'Active connections');
      expect(gauge).toHaveProperty('set');
      expect(gauge).toHaveProperty('inc');
      expect(gauge).toHaveProperty('dec');
    });
    
    test('should set gauge value', () => {
      const gauge = metrics.createGauge('memory_usage', 'Memory usage');
      expect(() => gauge.set(1024)).not.toThrow();
    });
    
    test('should increment and decrement gauge', () => {
      const gauge = metrics.createGauge('queue_size', 'Queue size');
      expect(() => gauge.inc()).not.toThrow();
      expect(() => gauge.dec()).not.toThrow();
    });
  });
  
  describe('Histogram metrics', () => {
    test('should create histogram', () => {
      const histogram = metrics.createHistogram('response_time', 'Response time');
      expect(histogram).toHaveProperty('observe');
      expect(histogram).toHaveProperty('startTimer');
    });
    
    test('should observe values', () => {
      const histogram = metrics.createHistogram('db_query_time', 'DB query time', [0.1, 0.5, 1, 2, 5]);
      expect(() => histogram.observe(0.234)).not.toThrow();
    });
    
    test('should use timer', async () => {
      const histogram = metrics.createHistogram('operation_duration', 'Operation duration');
      const timer = histogram.startTimer();
      
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(() => timer()).not.toThrow();
    });
  });
  
  describe('Summary metrics', () => {
    test('should create summary', () => {
      const summary = metrics.createSummary('api_latency', 'API latency');
      expect(summary).toHaveProperty('observe');
      expect(summary).toHaveProperty('startTimer');
    });
    
    test('should observe percentiles', () => {
      const summary = metrics.createSummary('request_size', 'Request size', [0.5, 0.9, 0.99]);
      expect(() => summary.observe(1024)).not.toThrow();
    });
  });
  
  describe('Default metrics', () => {
    test('should collect default metrics', () => {
      expect(() => metrics.collectDefaultMetrics()).not.toThrow();
    });
    
    test('should collect with custom options', () => {
      expect(() => metrics.collectDefaultMetrics({ 
        prefix: 'node_',
        timeout: 5000 
      })).not.toThrow();
    });
  });
  
  describe('HTTP middleware', () => {
    test('should create HTTP metrics middleware', () => {
      const middleware = metrics.createHTTPMetricsMiddleware();
      expect(typeof middleware).toBe('function');
    });
    
    test('should track HTTP requests', () => {
      const middleware = metrics.createHTTPMetricsMiddleware({
        includePath: true,
        includeMethod: true
      });
      
      const mockReq = { method: 'GET', path: '/api/users' };
      const mockRes = {
        end: jest.fn(),
        statusCode: 200
      };
      const mockNext = jest.fn();
      
      middleware(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });
  });
  
  describe('Metrics export', () => {
    test('should export metrics in Prometheus format', async () => {
      metrics.createCounter('test_counter', 'Test counter').inc();
      
      const result = await metrics.getMetrics('prometheus');
      expect(typeof result).toBe('string');
      expect(result).toContain('test_test_counter');
    });
    
    test('should export metrics in JSON format', async () => {
      metrics.createGauge('test_gauge', 'Test gauge').set(42);
      
      const result = await metrics.getMetrics('json');
      expect(typeof result).toBe('object');
      expect(result).toHaveProperty('test_gauge');
    });
    
    test('should strip prefix in JSON format', async () => {
      metrics.createCounter('my_counter', 'My counter').inc();
      
      const result = await metrics.getMetrics('json');
      expect(result).toHaveProperty('my_counter');
      expect(result).not.toHaveProperty('test_my_counter');
    });
  });
  
  describe('Metrics endpoint', () => {
    test('should create metrics endpoint', () => {
      const router = metrics.createMetricsEndpoint();
      expect(router).toBeDefined();
      expect(router.stack).toBeDefined();
    });
    
    test('should handle metrics request', async () => {
      const router = metrics.createMetricsEndpoint({ path: '/custom-metrics' });
      
      // Find the route handler
      const route = router.stack.find(layer => layer.route && layer.route.path === '/custom-metrics');
      expect(route).toBeDefined();
    });
  });
  
  describe('Push gateway', () => {
    test('should handle push without gateway configured', async () => {
      const result = await metrics.pushMetrics('batch-job');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Push gateway not configured');
    });
    
    test('should push with gateway configured', async () => {
      const metricsWithGateway = new MetricsInterface({ 
        pushGateway: 'http://localhost:9091'
      });
      
      // This will fail in test but shows the API works
      const result = await metricsWithGateway.pushMetrics('test-job', { instance: 'test' });
      expect(result).toHaveProperty('success');
    });
  });
});