/**
 * Tests for AlertingSystem
 */

const AlertingSystem = require('../alerts/alerting');
const nodemailer = require('nodemailer');
const { IncomingWebhook } = require('@slack/webhook');
const axios = require('axios');

jest.mock('nodemailer');
jest.mock('@slack/webhook');
jest.mock('axios');

describe('AlertingSystem', () => {
  let alertingSystem;

  beforeEach(() => {
    // Mock nodemailer
    nodemailer.createTransporter = jest.fn().mockReturnValue({
      sendMail: jest.fn().mockResolvedValue({ messageId: 'test-id' })
    });

    // Mock Slack webhook
    IncomingWebhook.prototype.send = jest.fn().mockResolvedValue({ ok: true });

    // Mock axios
    axios.post = jest.fn().mockResolvedValue({ data: { success: true } });

    alertingSystem = new AlertingSystem();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with default configuration', () => {
      expect(alertingSystem.alertRules).toBeDefined();
      expect(alertingSystem.notificationChannels).toBeDefined();
      expect(alertingSystem.escalationPolicies).toBeDefined();
      expect(alertingSystem.activeAlerts).toBeDefined();
      expect(alertingSystem.alertHistory).toEqual([]);
      expect(alertingSystem.config.alertThrottleTime).toBe(300000);
      expect(alertingSystem.config.maxHistorySize).toBe(1000);
    });
  });

  describe('defineAlertRule', () => {
    it('should define a valid alert rule', () => {
      const rule = {
        name: 'high-cpu',
        description: 'CPU usage above 80%',
        severity: 'warning',
        channels: ['console']
      };

      const result = alertingSystem.defineAlertRule(rule);

      expect(result.success).toBe(true);
      expect(result.rule).toBe('high-cpu');
      expect(alertingSystem.alertRules.has('high-cpu')).toBe(true);
    });

    it('should throw error if rule has no name', () => {
      expect(() => alertingSystem.defineAlertRule({})).toThrow('Alert rule must have a name');
    });

    it('should validate severity levels', () => {
      const rule = {
        name: 'test-rule',
        severity: 'invalid'
      };

      expect(() => alertingSystem.defineAlertRule(rule)).toThrow('Invalid severity: invalid');
    });

    it('should set default values for optional fields', () => {
      const rule = { name: 'minimal-rule' };
      
      alertingSystem.defineAlertRule(rule);
      const storedRule = alertingSystem.alertRules.get('minimal-rule');

      expect(storedRule.severity).toBe('warning');
      expect(storedRule.channels).toEqual(['console']);
      expect(storedRule.description).toBe('');
    });
  });

  describe('configureNotificationChannel', () => {
    it('should configure email channel', () => {
      const channel = {
        name: 'ops-email',
        type: 'email',
        config: {
          smtp: {
            host: 'smtp.example.com',
            port: 587,
            user: 'user@example.com',
            pass: 'password'
          },
          to: 'ops@example.com'
        }
      };

      const result = alertingSystem.configureNotificationChannel(channel);

      expect(result.success).toBe(true);
      expect(result.channel).toBe('ops-email');
      expect(result.type).toBe('email');
      expect(alertingSystem.notificationChannels.has('ops-email')).toBe(true);
    });

    it('should configure Slack channel', () => {
      const channel = {
        name: 'ops-slack',
        type: 'slack',
        config: {
          webhookUrl: 'https://hooks.slack.com/services/xxx'
        }
      };

      const result = alertingSystem.configureNotificationChannel(channel);

      expect(result.success).toBe(true);
      expect(result.type).toBe('slack');
      expect(IncomingWebhook).toHaveBeenCalledWith(channel.config.webhookUrl);
    });

    it('should configure webhook channel', () => {
      const channel = {
        name: 'custom-webhook',
        type: 'webhook',
        config: {
          url: 'https://example.com/webhook',
          headers: { 'X-API-Key': 'secret' }
        }
      };

      const result = alertingSystem.configureNotificationChannel(channel);

      expect(result.success).toBe(true);
      expect(result.type).toBe('webhook');
    });

    it('should configure console channel', () => {
      const channel = {
        name: 'console-output',
        type: 'console'
      };

      const result = alertingSystem.configureNotificationChannel(channel);

      expect(result.success).toBe(true);
      expect(result.type).toBe('console');
    });

    it('should throw error for missing channel properties', () => {
      expect(() => alertingSystem.configureNotificationChannel({}))
        .toThrow('Channel must have name and type');
    });

    it('should throw error for unsupported channel type', () => {
      const channel = {
        name: 'test',
        type: 'unsupported'
      };

      expect(() => alertingSystem.configureNotificationChannel(channel))
        .toThrow('Unsupported channel type: unsupported');
    });
  });

  describe('setupEscalationPolicy', () => {
    it('should setup valid escalation policy', () => {
      const policy = {
        name: 'critical-escalation',
        levels: [
          { delayMinutes: 5, channels: ['email'] },
          { delayMinutes: 15, channels: ['slack', 'email'] },
          { delayMinutes: 30, channels: ['webhook'], repeat: true }
        ]
      };

      const result = alertingSystem.setupEscalationPolicy(policy);

      expect(result.success).toBe(true);
      expect(result.policy).toBe('critical-escalation');
      expect(result.levels).toBe(3);
      expect(alertingSystem.escalationPolicies.has('critical-escalation')).toBe(true);
    });

    it('should throw error if policy has no name or levels', () => {
      expect(() => alertingSystem.setupEscalationPolicy({}))
        .toThrow('Escalation policy must have name and levels');
    });

    it('should throw error if levels is empty', () => {
      const policy = {
        name: 'test',
        levels: []
      };

      expect(() => alertingSystem.setupEscalationPolicy(policy))
        .toThrow('Escalation policy must have at least one level');
    });

    it('should set default values for level properties', () => {
      const policy = {
        name: 'test-policy',
        levels: [{}]
      };

      alertingSystem.setupEscalationPolicy(policy);
      const storedPolicy = alertingSystem.escalationPolicies.get('test-policy');

      expect(storedPolicy.levels[0].delayMinutes).toBe(0);
      expect(storedPolicy.levels[0].channels).toEqual([]);
      expect(storedPolicy.levels[0].repeat).toBe(false);
      expect(storedPolicy.levels[0].repeatInterval).toBe(60);
    });
  });

  describe('sendAlert', () => {
    beforeEach(() => {
      // Setup a basic rule
      alertingSystem.defineAlertRule({
        name: 'test-rule',
        severity: 'warning',
        channels: ['console']
      });
    });

    it('should send alert successfully', async () => {
      const alert = {
        rule: 'test-rule',
        title: 'Test Alert',
        message: 'This is a test alert'
      };

      const result = await alertingSystem.sendAlert(alert);

      expect(result.success).toBe(true);
      expect(result.alertId).toBeDefined();
      expect(result.notifications).toBeDefined();
      expect(alertingSystem.activeAlerts.size).toBe(1);
    });

    it('should throw error if alert has no rule', async () => {
      await expect(alertingSystem.sendAlert({})).rejects.toThrow('Alert must specify a rule');
    });

    it('should throw error if rule not found', async () => {
      const alert = { rule: 'non-existent' };
      
      await expect(alertingSystem.sendAlert(alert)).rejects.toThrow('Alert rule not found: non-existent');
    });

    it('should throttle alerts', async () => {
      const alert = {
        rule: 'test-rule',
        message: 'Test alert'
      };

      // First alert should succeed
      const result1 = await alertingSystem.sendAlert(alert);
      expect(result1.success).toBe(true);

      // Second alert should be throttled
      const result2 = await alertingSystem.sendAlert(alert);
      expect(result2.success).toBe(false);
      expect(result2.message).toBe('Alert throttled');
      expect(result2.nextAllowedTime).toBeDefined();
    });

    it('should add alert to history', async () => {
      const alert = {
        rule: 'test-rule',
        message: 'Test alert'
      };

      await alertingSystem.sendAlert(alert);

      expect(alertingSystem.alertHistory).toHaveLength(1);
      expect(alertingSystem.alertHistory[0].rule).toBe('test-rule');
    });

    it('should handle escalation policy', async () => {
      jest.useFakeTimers();
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

      // Setup escalation policy
      alertingSystem.setupEscalationPolicy({
        name: 'test-escalation',
        levels: [{ delayMinutes: 1, channels: ['console'] }]
      });

      // Update rule with escalation
      alertingSystem.defineAlertRule({
        name: 'escalation-rule',
        escalationPolicy: 'test-escalation'
      });

      const alert = {
        rule: 'escalation-rule',
        message: 'Test escalation'
      };

      await alertingSystem.sendAlert(alert);

      // Verify escalation is scheduled
      expect(setTimeoutSpy).toHaveBeenCalled();
      
      setTimeoutSpy.mockRestore();
      jest.useRealTimers();
    });
  });

  describe('Notification sending', () => {
    beforeEach(() => {
      // Configure channels
      alertingSystem.configureNotificationChannel({
        name: 'test-email',
        type: 'email',
        config: {
          smtp: { host: 'smtp.test.com', user: 'test', pass: 'pass' },
          to: 'test@example.com'
        }
      });

      alertingSystem.configureNotificationChannel({
        name: 'test-slack',
        type: 'slack',
        config: { webhookUrl: 'https://slack.test' }
      });
    });

    it('should send notifications to multiple channels', async () => {
      const alert = {
        id: 'test-123',
        title: 'Test Alert',
        message: 'Test message',
        severity: 'warning',
        timestamp: new Date().toISOString()
      };

      // Mock console.log to prevent output
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      // Mock the send methods to return success
      const emailChannel = alertingSystem.notificationChannels.get('test-email');
      const slackChannel = alertingSystem.notificationChannels.get('test-slack');
      
      emailChannel.send = jest.fn().mockResolvedValue({ messageId: 'test' });
      slackChannel.send = jest.fn().mockResolvedValue({ ok: true });

      const results = await alertingSystem.sendNotifications(alert, ['test-email', 'test-slack', 'console']);

      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true); // email
      expect(results[1].success).toBe(true); // slack
      expect(results[2].success).toBe(true); // console

      consoleSpy.mockRestore();
    });

    it('should handle notification failures gracefully', async () => {
      // Mock email failure
      const emailChannel = alertingSystem.notificationChannels.get('test-email');
      emailChannel.send = jest.fn().mockRejectedValue(new Error('Email failed'));

      const alert = {
        id: 'test-123',
        title: 'Test Alert',
        severity: 'error'
      };

      const results = await alertingSystem.sendNotifications(alert, ['test-email', 'test-slack']);

      expect(results[0].success).toBe(false);
      expect(results[0].error).toBe('Email failed');
      expect(results[1].success).toBe(true);
    });
  });

  describe('Alert management', () => {
    beforeEach(async () => {
      alertingSystem.defineAlertRule({
        name: 'test-rule',
        channels: ['console']
      });

      // Create an active alert
      await alertingSystem.sendAlert({
        rule: 'test-rule',
        message: 'Test alert'
      });
    });

    it('should acknowledge alert', () => {
      const alertId = alertingSystem.getActiveAlerts()[0].id;
      
      const result = alertingSystem.acknowledgeAlert(alertId, 'john.doe');

      expect(result.success).toBe(true);
      const alert = alertingSystem.activeAlerts.get(alertId);
      expect(alert.state).toBe('acknowledged');
      expect(alert.acknowledgedBy).toBe('john.doe');
    });

    it('should resolve alert', () => {
      const alertId = alertingSystem.getActiveAlerts()[0].id;
      
      const result = alertingSystem.resolveAlert(alertId, 'jane.doe', 'Issue fixed');

      expect(result.success).toBe(true);
      expect(alertingSystem.activeAlerts.has(alertId)).toBe(false);
    });

    it('should throw error for non-existent alert', () => {
      expect(() => alertingSystem.acknowledgeAlert('invalid-id', 'user'))
        .toThrow('Alert not found: invalid-id');
    });

    it('should get active alerts', () => {
      const activeAlerts = alertingSystem.getActiveAlerts();

      expect(Array.isArray(activeAlerts)).toBe(true);
      expect(activeAlerts).toHaveLength(1);
      expect(activeAlerts[0].state).toBe('firing');
    });

    it('should get alert history', () => {
      const history = alertingSystem.getAlertHistory(10);

      expect(Array.isArray(history)).toBe(true);
      expect(history).toHaveLength(1);
    });

    it('should limit history size', () => {
      const history = alertingSystem.getAlertHistory(0);
      expect(history).toHaveLength(0);
    });
  });

  describe('Alert statistics', () => {
    beforeEach(async () => {
      // Mock console.log to prevent output
      jest.spyOn(console, 'log').mockImplementation();
      
      // Create alerts with different severities
      alertingSystem.defineAlertRule({ name: 'rule1', severity: 'critical' });
      alertingSystem.defineAlertRule({ name: 'rule2', severity: 'error' });
      alertingSystem.defineAlertRule({ name: 'rule3', severity: 'warning' });

      // Send alerts without delays for faster tests
      await alertingSystem.sendAlert({ rule: 'rule1' });
      
      // Mock Date to ensure different timestamps
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValueOnce(now + 100);
      await alertingSystem.sendAlert({ rule: 'rule2' });
      
      jest.spyOn(Date, 'now').mockReturnValueOnce(now + 200);
      await alertingSystem.sendAlert({ rule: 'rule3' });
    }, 10000);

    it('should get alert statistics', () => {
      const stats = alertingSystem.getAlertStatistics();

      expect(stats.totalAlerts).toBe(3);
      expect(stats.activeAlerts).toBe(3);
      expect(stats.bySeverity.critical).toBe(1);
      expect(stats.bySeverity.error).toBe(1);
      expect(stats.bySeverity.warning).toBe(1);
      expect(stats.byState.firing).toBe(3);
    });

    it('should clear resolved alerts from history', () => {
      // Resolve one alert
      const alertId = alertingSystem.getActiveAlerts()[0].id;
      alertingSystem.resolveAlert(alertId, 'user', 'fixed');

      const result = alertingSystem.clearResolvedAlerts();

      expect(result.success).toBe(true);
      expect(alertingSystem.alertHistory.every(a => a.state !== 'resolved')).toBe(true);
    });
  });

  describe('Alert formatting', () => {
    it('should format alert as text', () => {
      const alert = {
        title: 'Test Alert',
        severity: 'error',
        timestamp: '2024-01-01T10:00:00Z',
        message: 'Something went wrong',
        rule: 'test-rule',
        id: 'alert-123',
        metadata: { server: 'web-01' }
      };

      const text = alertingSystem.formatAlertText(alert);

      expect(text).toContain('Alert: Test Alert');
      expect(text).toContain('Severity: ERROR');
      expect(text).toContain('Something went wrong');
      expect(text).toContain('alert-123');
      expect(text).toContain('web-01');
    });

    it('should format alert as HTML', () => {
      const alert = {
        title: 'Test Alert',
        severity: 'critical',
        timestamp: '2024-01-01T10:00:00Z',
        message: 'Critical issue',
        rule: 'test-rule',
        id: 'alert-456',
        metadata: {}
      };

      const html = alertingSystem.formatAlertHtml(alert);

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('Test Alert');
      expect(html).toContain('CRITICAL');
      expect(html).toContain('Critical issue');
      expect(html).toContain('#d32f2f'); // Critical color
    });

    it('should get correct severity color', () => {
      expect(alertingSystem.getSeverityColor('critical')).toBe('#d32f2f');
      expect(alertingSystem.getSeverityColor('error')).toBe('#f44336');
      expect(alertingSystem.getSeverityColor('warning')).toBe('#ff9800');
      expect(alertingSystem.getSeverityColor('info')).toBe('#2196f3');
      expect(alertingSystem.getSeverityColor('unknown')).toBe('#757575');
    });
  });

  describe('Alert ID generation', () => {
    it('should generate unique alert IDs', () => {
      const id1 = alertingSystem.generateAlertId();
      const id2 = alertingSystem.generateAlertId();

      expect(id1).toMatch(/^alert-\d+-[a-z0-9]+$/);
      expect(id2).toMatch(/^alert-\d+-[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('History management', () => {
    it('should maintain history size limit', async () => {
      // Mock console.log to prevent output
      jest.spyOn(console, 'log').mockImplementation();
      
      alertingSystem.config.maxHistorySize = 5;
      alertingSystem.config.alertThrottleTime = 0; // Disable throttling for this test
      alertingSystem.defineAlertRule({ name: 'test-rule' });

      // Create more alerts than history limit
      for (let i = 0; i < 10; i++) {
        await alertingSystem.sendAlert({ rule: 'test-rule', message: `Alert ${i}` });
      }

      expect(alertingSystem.alertHistory).toHaveLength(5);
      // Should keep newest alerts
      expect(alertingSystem.alertHistory[0].message).toContain('Alert 9');
    }, 10000);
  });
});