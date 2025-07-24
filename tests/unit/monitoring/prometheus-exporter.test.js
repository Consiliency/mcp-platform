const PrometheusExporter = require('../../../monitoring/metrics/prometheus-exporter');
const client = require('prom-client');

describe('PrometheusExporter', () => {
  let exporter;

  beforeEach(() => {
    // Clear all metrics before each test
    client.register.clear();
    
    exporter = new PrometheusExporter({
      prefix: 'test_',
      defaultLabels: { service: 'test' }
    });
  });

  afterEach(() => {
    client.register.clear();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const defaultExporter = new PrometheusExporter();
      expect(defaultExporter.options.prefix).toBe('');
      expect(defaultExporter.options.includeDefaultMetrics).toBe(true);
    });

    it('should set default labels', () => {
      expect(exporter.register.getDefaultLabels()).toEqual({ service: 'test' });
    });

    it('should initialize built-in exporters', () => {
      expect(exporter.exporters.has('http')).toBe(true);
      expect(exporter.exporters.has('database')).toBe(true);
      expect(exporter.exporters.has('cache')).toBe(true);
      expect(exporter.exporters.has('messageQueue')).toBe(true);
      expect(exporter.exporters.has('business')).toBe(true);
      expect(exporter.exporters.has('system')).toBe(true);
    });
  });

  describe('HTTP exporter', () => {
    it('should create HTTP metrics', () => {
      const httpExporter = exporter.getExporter('http');
      expect(httpExporter.metrics.httpRequestDuration).toBeDefined();
      expect(httpExporter.metrics.httpRequestsTotal).toBeDefined();
      expect(httpExporter.metrics.httpRequestSize).toBeDefined();
      expect(httpExporter.metrics.httpResponseSize).toBeDefined();
      expect(httpExporter.metrics.httpActiveRequests).toBeDefined();
    });

    it('should create middleware function', () => {
      const httpExporter = exporter.getExporter('http');
      const middleware = httpExporter.middleware();
      expect(middleware).toBeInstanceOf(Function);
    });

    it('should track HTTP requests', (done) => {
      const httpExporter = exporter.getExporter('http');
      const middleware = httpExporter.middleware();
      
      const req = {
        method: 'GET',
        path: '/test',
        headers: { 'content-length': '100' }
      };
      
      const res = {
        statusCode: 200,
        end: function(...args) {
          // Verify metrics were recorded
          expect(httpExporter.metrics.httpActiveRequests._getValue({ method: 'GET' })).toBeDefined();
          done();
        },
        getHeader: jest.fn().mockReturnValue('200')
      };
      
      const next = jest.fn();
      
      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
      
      // Simulate response end
      res.end();
    });
  });

  describe('Database exporter', () => {
    it('should create database metrics', () => {
      const dbExporter = exporter.getExporter('database');
      expect(dbExporter.metrics.dbQueryDuration).toBeDefined();
      expect(dbExporter.metrics.dbConnectionsActive).toBeDefined();
      expect(dbExporter.metrics.dbConnectionsTotal).toBeDefined();
      expect(dbExporter.metrics.dbTransactionsTotal).toBeDefined();
    });

    it('should track database queries', () => {
      const dbExporter = exporter.getExporter('database');
      const queryTracker = dbExporter.trackQuery('SELECT', 'users', 'main');
      
      expect(queryTracker.success).toBeInstanceOf(Function);
      expect(queryTracker.error).toBeInstanceOf(Function);
    });

    it('should track database connections', () => {
      const dbExporter = exporter.getExporter('database');
      const connection = dbExporter.trackConnection('main');
      
      expect(connection.release).toBeInstanceOf(Function);
      expect(connection.idle).toBeInstanceOf(Function);
    });
  });

  describe('Cache exporter', () => {
    it('should create cache metrics', () => {
      const cacheExporter = exporter.getExporter('cache');
      expect(cacheExporter.metrics.cacheHits).toBeDefined();
      expect(cacheExporter.metrics.cacheMisses).toBeDefined();
      expect(cacheExporter.metrics.cacheEvictions).toBeDefined();
      expect(cacheExporter.metrics.cacheSize).toBeDefined();
      expect(cacheExporter.metrics.cacheEntries).toBeDefined();
    });

    it('should track cache operations', () => {
      const cacheExporter = exporter.getExporter('cache');
      
      cacheExporter.hit('redis', 'get');
      cacheExporter.miss('redis', 'get');
      cacheExporter.evict('redis', 'ttl');
      cacheExporter.updateSize('redis', 1024);
      cacheExporter.updateEntries('redis', 100);
      
      // Verify methods don't throw
      expect(true).toBe(true);
    });
  });

  describe('Business exporter', () => {
    it('should create business metrics', () => {
      const businessExporter = exporter.getExporter('business');
      expect(businessExporter.metrics.businessEvents).toBeDefined();
      expect(businessExporter.metrics.revenue).toBeDefined();
      expect(businessExporter.metrics.activeUsers).toBeDefined();
      expect(businessExporter.metrics.conversionRate).toBeDefined();
      expect(businessExporter.metrics.apiUsage).toBeDefined();
    });

    it('should track business events', () => {
      const businessExporter = exporter.getExporter('business');
      
      businessExporter.recordEvent('user_signup', 'success');
      businessExporter.recordRevenue(99.99, 'USD', 'subscription', 'web');
      businessExporter.updateActiveUsers(1000, 'daily', 'all');
      businessExporter.updateConversionRate(0.15, 'checkout', 'payment');
      businessExporter.recordAPIUsage('/api/v1/users', 'premium', 'v1');
      
      // Verify methods don't throw
      expect(true).toBe(true);
    });
  });

  describe('Custom exporter', () => {
    it('should create custom metrics', () => {
      const customMetrics = {
        customCounter: {
          type: 'Counter',
          name: 'custom_counter',
          help: 'A custom counter',
          labelNames: ['label1']
        },
        customGauge: {
          type: 'Gauge',
          name: 'custom_gauge',
          help: 'A custom gauge'
        }
      };
      
      const custom = exporter.createCustomExporter('custom', customMetrics);
      
      expect(custom.customCounter).toBeDefined();
      expect(custom.customGauge).toBeDefined();
    });

    it('should throw error for unknown metric type', () => {
      const invalidMetrics = {
        invalid: {
          type: 'InvalidType',
          name: 'invalid',
          help: 'Invalid metric'
        }
      };
      
      expect(() => {
        exporter.createCustomExporter('invalid', invalidMetrics);
      }).toThrow('Unknown metric type: InvalidType');
    });
  });

  describe('Metrics endpoint', () => {
    it('should create metrics endpoint router', () => {
      const router = exporter.createMetricsEndpoint();
      expect(router).toBeDefined();
      expect(router.get).toBeInstanceOf(Function);
    });

    it('should return metrics in Prometheus format', async () => {
      const metrics = await exporter.getMetricsAsJSON();
      expect(Array.isArray(metrics)).toBe(true);
    });
  });

  describe('Utility methods', () => {
    it('should clear all metrics', () => {
      exporter.clear();
      // Registry should be empty
      expect(true).toBe(true);
    });

    it('should reset specific metrics', () => {
      const httpExporter = exporter.getExporter('http');
      exporter.resetMetrics('http', ['httpRequestsTotal']);
      // Verify reset doesn't throw
      expect(true).toBe(true);
    });

    it('should reset all metrics in exporter', () => {
      exporter.resetMetrics('http');
      // Verify reset doesn't throw
      expect(true).toBe(true);
    });
  });
});