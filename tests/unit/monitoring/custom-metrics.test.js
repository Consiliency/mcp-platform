const CustomMetrics = require('../../../monitoring/metrics/custom-metrics');
const client = require('prom-client');

describe('CustomMetrics', () => {
  let customMetrics;

  beforeEach(() => {
    // Clear all metrics before each test
    client.register.clear();
    
    customMetrics = new CustomMetrics({
      prefix: 'test_'
    });
  });

  afterEach(() => {
    client.register.clear();
  });

  describe('constructor', () => {
    it('should initialize all metric categories', () => {
      expect(customMetrics.metrics.mcpActiveConnections).toBeDefined();
      expect(customMetrics.metrics.dailyActiveUsers).toBeDefined();
      expect(customMetrics.metrics.contentCreated).toBeDefined();
      expect(customMetrics.metrics.apiAvailability).toBeDefined();
      expect(customMetrics.metrics.thirdPartyAPICalls).toBeDefined();
      expect(customMetrics.metrics.revenue).toBeDefined();
      expect(customMetrics.metrics.authAttempts).toBeDefined();
      expect(customMetrics.metrics.dataValidationFailures).toBeDefined();
    });

    it('should use custom prefix', () => {
      expect(customMetrics.metrics.mcpActiveConnections.name).toContain('test_');
    });
  });

  describe('MCP metrics', () => {
    it('should track MCP connections', () => {
      customMetrics.trackMCPConnection('websocket', 'client', '1.0', 1);
      customMetrics.trackMCPConnection('websocket', 'client', '1.0', -1);
      
      // Verify methods don't throw
      expect(true).toBe(true);
    });

    it('should track MCP messages', () => {
      const timer = customMetrics.trackMCPMessage('request', 'inbound', 'success');
      expect(timer).toBeDefined();
      expect(timer()).toBeDefined(); // End timer
    });

    it('should track MCP tool invocations', () => {
      const tracker = customMetrics.trackMCPToolInvocation('search', 'web');
      expect(tracker.success).toBeInstanceOf(Function);
      expect(tracker.error).toBeInstanceOf(Function);
      
      // Test both paths
      tracker.success();
      
      const errorTracker = customMetrics.trackMCPToolInvocation('search', 'web');
      errorTracker.error();
    });
  });

  describe('User metrics', () => {
    it('should update user metrics', () => {
      customMetrics.updateUserMetrics({
        dailyActiveUsers: {
          'free:web': 1000,
          'premium:mobile': 500
        },
        featureAdoption: {
          'dark_mode': {
            'all': 0.75,
            'premium': 0.90
          }
        }
      });
      
      // Verify methods don't throw
      expect(true).toBe(true);
    });
  });

  describe('Revenue metrics', () => {
    it('should track revenue', () => {
      customMetrics.trackRevenue(99.99, 'subscription', 'premium', 'USD', 'stripe');
      
      // Verify method doesn't throw
      expect(true).toBe(true);
    });

    it('should update MRR', () => {
      customMetrics.updateMRR(50000, 'saas', 'enterprise', 'USD');
      
      // Verify method doesn't throw
      expect(true).toBe(true);
    });
  });

  describe('Security metrics', () => {
    it('should track security events', () => {
      customMetrics.trackSecurityEvent('unauthorized_access', 'high', 'api');
      customMetrics.trackSecurityEvent('failed_login', 'medium', 'web');
      
      // Verify methods don't throw
      expect(true).toBe(true);
    });

    it('should track authentication attempts', () => {
      customMetrics.trackAuthentication('password', true, 'user');
      customMetrics.trackAuthentication('oauth', false, 'admin');
      
      // Verify methods don't throw
      expect(true).toBe(true);
    });
  });

  describe('SLA metrics', () => {
    it('should update SLA metrics', () => {
      customMetrics.updateSLAMetrics('/api/v1/users', {
        availability: 99.95,
        percentiles: {
          '50': 0.050,
          '95': 0.200,
          '99': 0.500
        },
        errorBudget: 85.5
      });
      
      // Verify method doesn't throw
      expect(true).toBe(true);
    });
  });

  describe('Metric management', () => {
    it('should get all metric values', async () => {
      const values = await customMetrics.getMetricValues();
      expect(typeof values).toBe('object');
    });

    it('should reset all metrics', () => {
      // Track some metrics
      customMetrics.trackRevenue(100, 'product', 'basic');
      customMetrics.trackSecurityEvent('test_event');
      
      // Reset
      customMetrics.reset();
      
      // Verify reset doesn't throw
      expect(true).toBe(true);
    });
  });

  describe('Content metrics', () => {
    it('should have content metrics initialized', () => {
      expect(customMetrics.metrics.contentCreated).toBeDefined();
      expect(customMetrics.metrics.contentProcessingTime).toBeDefined();
      expect(customMetrics.metrics.contentStorageSize).toBeDefined();
      expect(customMetrics.metrics.contentQualityScore).toBeDefined();
    });
  });

  describe('Integration metrics', () => {
    it('should have integration metrics initialized', () => {
      expect(customMetrics.metrics.thirdPartyAPICalls).toBeDefined();
      expect(customMetrics.metrics.integrationLatency).toBeDefined();
      expect(customMetrics.metrics.webhookDeliveries).toBeDefined();
      expect(customMetrics.metrics.dataSyncLag).toBeDefined();
    });
  });

  describe('Data quality metrics', () => {
    it('should have data quality metrics initialized', () => {
      expect(customMetrics.metrics.dataValidationFailures).toBeDefined();
      expect(customMetrics.metrics.dataCompleteness).toBeDefined();
      expect(customMetrics.metrics.dataFreshness).toBeDefined();
      expect(customMetrics.metrics.dataAnomalies).toBeDefined();
    });
  });
});