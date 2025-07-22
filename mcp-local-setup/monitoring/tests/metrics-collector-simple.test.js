/**
 * Simplified tests for MetricsCollector without circular references
 */

describe('MetricsCollector - Simple Tests', () => {
  let MetricsCollector;

  beforeEach(() => {
    // Clear module cache to ensure fresh instance
    jest.resetModules();
    MetricsCollector = require('../metrics/collector');
  });

  describe('Basic functionality', () => {
    it('should create instance successfully', () => {
      const collector = new MetricsCollector();
      expect(collector).toBeDefined();
      expect(collector.registry).toBeDefined();
      expect(collector.metrics).toBeDefined();
      expect(collector.performanceMetrics).toBeDefined();
    });

    it('should initialize Prometheus', () => {
      const collector = new MetricsCollector();
      const result = collector.initializePrometheus();
      
      expect(result.success).toBe(true);
      expect(result.message).toBe('Prometheus metrics initialized successfully');
    });

    it('should collect service metrics', () => {
      const collector = new MetricsCollector();
      collector.initializePrometheus();
      
      const metrics = collector.collectServiceMetrics('test-service');
      
      expect(metrics.service).toBe('test-service');
      expect(metrics.timestamp).toBeDefined();
      expect(metrics.system).toBeDefined();
      expect(metrics.system.memory).toBeDefined();
      expect(metrics.system.cpu).toBeDefined();
    });

    it('should track performance metrics', () => {
      const collector = new MetricsCollector();
      
      const result = collector.trackPerformance('api_latency', 150, { endpoint: '/api/users' });
      
      expect(result.success).toBe(true);
      expect(result.metric).toBe('api_latency');
      expect(result.value).toBe(150);
    });

    it('should export metrics', async () => {
      const collector = new MetricsCollector();
      collector.initializePrometheus();
      
      const result = await collector.exportMetrics();
      
      expect(result.metrics).toBeDefined();
      expect(result.contentType).toBeDefined();
      expect(result.timestamp).toBeDefined();
    });

    it('should handle errors properly', () => {
      const collector = new MetricsCollector();
      
      expect(() => collector.collectServiceMetrics()).toThrow('Service name is required');
      expect(() => collector.trackPerformance()).toThrow('Metric name and value are required');
    });

    it('should record HTTP requests', () => {
      const collector = new MetricsCollector();
      collector.initializePrometheus();
      
      expect(() => {
        collector.recordHttpRequest('GET', '/api/users', 200, 150, 'api-service');
      }).not.toThrow();
    });

    it('should update active services', () => {
      const collector = new MetricsCollector();
      collector.initializePrometheus();
      
      expect(() => {
        collector.updateActiveServices('api', 5);
      }).not.toThrow();
    });

    it('should record errors', () => {
      const collector = new MetricsCollector();
      collector.initializePrometheus();
      
      expect(() => {
        collector.recordError('test-service', 'timeout');
      }).not.toThrow();
    });

    it('should get system metrics', () => {
      const collector = new MetricsCollector();
      const metrics = collector.getSystemMetrics();
      
      expect(metrics.memory).toBeDefined();
      expect(metrics.memory.rss).toBeGreaterThan(0);
      expect(metrics.cpu).toBeDefined();
      expect(metrics.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should clear metrics properly', () => {
      const collector = new MetricsCollector();
      collector.initializePrometheus();
      collector.trackPerformance('test', 100);
      
      collector.clearMetrics();
      
      expect(collector.performanceMetrics).toEqual({});
      expect(collector.metricsInterval).toBeDefined();
      
      // Clean up the interval
      if (collector.metricsInterval) {
        clearInterval(collector.metricsInterval);
      }
    });
  });

  afterEach(() => {
    // Clean up any intervals by clearing all mocked timers
    jest.clearAllTimers();
    jest.useRealTimers();
  });
});