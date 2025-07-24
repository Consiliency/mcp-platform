const AlertRouter = require('../../../monitoring/errors/alert-router');

describe('AlertRouter', () => {
  let alertRouter;

  beforeEach(() => {
    alertRouter = new AlertRouter({
      defaultChannel: 'console',
      aggregationWindow: 1000,
      deduplicationWindow: 5000
    });
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const router = new AlertRouter();
      expect(router.options.defaultChannel).toBe('console');
      expect(router.options.aggregationWindow).toBe(60000);
      expect(router.options.deduplicationWindow).toBe(300000);
    });

    it('should initialize default channels', () => {
      expect(alertRouter.channels.has('console')).toBe(true);
      expect(alertRouter.channels.has('email')).toBe(true);
      expect(alertRouter.channels.has('slack')).toBe(true);
      expect(alertRouter.channels.has('pagerduty')).toBe(true);
      expect(alertRouter.channels.has('webhook')).toBe(true);
    });
  });

  describe('rule management', () => {
    it('should add a rule', () => {
      const ruleId = alertRouter.addRule({
        name: 'Test Rule',
        conditions: { severity: 'error' },
        actions: [{ type: 'send', channel: 'console' }],
        priority: 10
      });

      expect(ruleId).toBeDefined();
      expect(alertRouter.rules.length).toBe(1);
      expect(alertRouter.rules[0].name).toBe('Test Rule');
    });

    it('should validate rule has required fields', () => {
      expect(() => {
        alertRouter.addRule({
          conditions: { severity: 'error' },
          actions: [{ type: 'send', channel: 'console' }]
        });
      }).toThrow('Rule must have a name');

      expect(() => {
        alertRouter.addRule({
          name: 'Test',
          conditions: { severity: 'error' }
        });
      }).toThrow('Rule must have at least one action');
    });

    it('should add rules in priority order', () => {
      alertRouter.addRule({
        name: 'Low Priority',
        conditions: {},
        actions: [{ type: 'send', channel: 'console' }],
        priority: 5
      });

      alertRouter.addRule({
        name: 'High Priority',
        conditions: {},
        actions: [{ type: 'send', channel: 'console' }],
        priority: 10
      });

      expect(alertRouter.rules[0].name).toBe('High Priority');
      expect(alertRouter.rules[1].name).toBe('Low Priority');
    });

    it('should remove a rule', () => {
      const ruleId = alertRouter.addRule({
        name: 'Test Rule',
        conditions: {},
        actions: [{ type: 'send', channel: 'console' }]
      });

      expect(alertRouter.removeRule(ruleId)).toBe(true);
      expect(alertRouter.rules.length).toBe(0);
    });

    it('should update a rule', () => {
      const ruleId = alertRouter.addRule({
        name: 'Test Rule',
        conditions: {},
        actions: [{ type: 'send', channel: 'console' }],
        priority: 5
      });

      alertRouter.updateRule(ruleId, {
        name: 'Updated Rule',
        priority: 10
      });

      expect(alertRouter.rules[0].name).toBe('Updated Rule');
      expect(alertRouter.rules[0].priority).toBe(10);
    });
  });

  describe('channel management', () => {
    it('should add a custom channel', () => {
      const mockSend = jest.fn().mockResolvedValue({ success: true });
      
      alertRouter.addChannel('custom', {
        send: mockSend,
        config: { apiKey: 'test123' }
      });

      expect(alertRouter.channels.has('custom')).toBe(true);
      expect(alertRouter.channels.get('custom').send).toBe(mockSend);
    });

    it('should validate channel has send method', () => {
      expect(() => {
        alertRouter.addChannel('invalid', {
          config: {}
        });
      }).toThrow('Channel must have a send method');
    });
  });

  describe('alert routing', () => {
    it('should route alert to default channel', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const result = await alertRouter.route({
        severity: 'info',
        title: 'Test Alert',
        description: 'Test description'
      });

      expect(consoleSpy).toHaveBeenCalled();
      expect(result).toBeDefined();
      
      consoleSpy.mockRestore();
    });

    it('should normalize alert structure', async () => {
      const alert = {
        title: 'Test Alert'
      };

      const result = await alertRouter.route(alert);
      
      // Check normalized fields
      expect(result).toBeDefined();
    });

    it('should deduplicate alerts', async () => {
      const alert = {
        severity: 'error',
        title: 'Duplicate Alert',
        source: 'test',
        dedupKey: 'test:error:duplicate'
      };

      const result1 = await alertRouter.route(alert);
      expect(result1.deduplicated).toBeFalsy();

      const result2 = await alertRouter.route(alert);
      expect(result2.deduplicated).toBe(true);
    });

    it('should match rules based on conditions', async () => {
      const mockSend = jest.fn().mockResolvedValue({ success: true });
      
      alertRouter.addChannel('test', { send: mockSend });
      
      alertRouter.addRule({
        name: 'Error Rule',
        conditions: { severity: 'error' },
        actions: [{ type: 'send', channel: 'test' }]
      });

      await alertRouter.route({
        severity: 'error',
        title: 'Test Error'
      });

      expect(mockSend).toHaveBeenCalled();
    });

    it('should evaluate complex conditions', () => {
      const alert = {
        severity: 'error',
        count: 10,
        tags: { component: 'api' }
      };

      // Test equals condition
      expect(alertRouter._evaluateCondition('error', { equals: 'error' })).toBe(true);
      expect(alertRouter._evaluateCondition('error', { equals: 'warn' })).toBe(false);

      // Test contains condition
      expect(alertRouter._evaluateCondition('error message', { contains: 'error' })).toBe(true);
      
      // Test numeric conditions
      expect(alertRouter._evaluateCondition(10, { gt: 5 })).toBe(true);
      expect(alertRouter._evaluateCondition(10, { lt: 20 })).toBe(true);
      expect(alertRouter._evaluateCondition(10, { gte: 10 })).toBe(true);
      expect(alertRouter._evaluateCondition(10, { lte: 10 })).toBe(true);

      // Test in condition
      expect(alertRouter._evaluateCondition('error', { in: ['error', 'warn'] })).toBe(true);
    });
  });

  describe('alert actions', () => {
    it('should aggregate alerts', async () => {
      alertRouter.addRule({
        name: 'Aggregate Rule',
        conditions: { source: 'test' },
        actions: [{ type: 'aggregate', window: 1000 }]
      });

      const alert = {
        source: 'test',
        severity: 'warn',
        title: 'Test Alert'
      };

      const result = await alertRouter.route(alert);
      expect(result.results[0].results[0].result.aggregated).toBe(true);
    });

    it('should suppress alerts', async () => {
      alertRouter.addRule({
        name: 'Suppress Rule',
        conditions: { source: 'test' },
        actions: [{ type: 'suppress', duration: 1000 }]
      });

      const alert = {
        source: 'test',
        severity: 'info',
        title: 'Test Alert'
      };

      const result = await alertRouter.route(alert);
      expect(result.results[0].results[0].result.suppressed).toBe(true);

      // Second alert should be suppressed
      const result2 = await alertRouter.route(alert);
      expect(result2.suppressed).toBe(true);
    });

    it('should transform alerts', async () => {
      alertRouter.addRule({
        name: 'Transform Rule',
        conditions: { source: 'test' },
        actions: [{
          type: 'transform',
          transform: {
            severity: 'critical',
            tags: { transformed: true }
          }
        }]
      });

      const alert = {
        source: 'test',
        severity: 'warn',
        title: 'Test Alert'
      };

      const result = await alertRouter.route(alert);
      const transformed = result.results[0].results[0].result;
      expect(transformed.severity).toBe('critical');
      expect(transformed.tags.transformed).toBe(true);
    });

    it('should handle action errors gracefully', async () => {
      const mockSend = jest.fn().mockRejectedValue(new Error('Send failed'));
      
      alertRouter.addChannel('failing', { send: mockSend });
      
      alertRouter.addRule({
        name: 'Failing Rule',
        conditions: { severity: 'error' },
        actions: [
          { type: 'send', channel: 'failing' },
          { type: 'send', channel: 'console' }
        ]
      });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const result = await alertRouter.route({
        severity: 'error',
        title: 'Test Error'
      });

      expect(result.results[0].results[0].success).toBe(false);
      expect(result.results[0].results[1].success).toBe(true);
      
      consoleSpy.mockRestore();
    });
  });

  describe('statistics and management', () => {
    it('should track statistics', async () => {
      await alertRouter.route({
        severity: 'info',
        title: 'Test Alert'
      });

      const stats = alertRouter.getStats();
      expect(stats.alerts.history).toBeGreaterThan(0);
      expect(stats.channels.console.sent).toBeGreaterThan(0);
    });

    it('should export configuration', () => {
      alertRouter.addRule({
        name: 'Test Rule',
        conditions: { severity: 'error' },
        actions: [{ type: 'send', channel: 'console' }]
      });

      const config = alertRouter.exportConfig();
      expect(config.rules.length).toBe(1);
      expect(config.channels).toContain('console');
    });

    it('should import configuration', () => {
      const config = {
        rules: [{
          name: 'Imported Rule',
          conditions: { severity: 'critical' },
          actions: [{ type: 'send', channel: 'console' }]
        }]
      };

      alertRouter.importConfig(config);
      expect(alertRouter.rules.length).toBe(1);
      expect(alertRouter.rules[0].name).toBe('Imported Rule');
    });
  });

  describe('event emission', () => {
    it('should emit events for rule operations', (done) => {
      alertRouter.on('ruleAdded', (rule) => {
        expect(rule.name).toBe('Test Rule');
        done();
      });

      alertRouter.addRule({
        name: 'Test Rule',
        conditions: {},
        actions: [{ type: 'send', channel: 'console' }]
      });
    });

    it('should emit events for alert operations', (done) => {
      alertRouter.on('alertSent', (event) => {
        expect(event.alert.title).toBe('Test Alert');
        done();
      });

      alertRouter.route({
        title: 'Test Alert'
      });
    });
  });
});