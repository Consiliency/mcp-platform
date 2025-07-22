/**
 * Alerting System
 * MONITOR-4.3: Alert rules, notifications, and escalation
 */

const nodemailer = require('nodemailer');
const { IncomingWebhook } = require('@slack/webhook');
const axios = require('axios');

class AlertingSystem {
  constructor() {
    this.alertRules = new Map();
    this.notificationChannels = new Map();
    this.escalationPolicies = new Map();
    this.activeAlerts = new Map();
    this.alertHistory = [];
    
    // Default settings
    this.config = {
      alertThrottleTime: 300000, // 5 minutes
      maxHistorySize: 1000,
      retryAttempts: 3,
      retryDelay: 30000 // 30 seconds
    };
    
    // Alert states
    this.alertStates = {
      PENDING: 'pending',
      FIRING: 'firing',
      RESOLVED: 'resolved',
      ACKNOWLEDGED: 'acknowledged',
      ESCALATED: 'escalated'
    };
  }

  /**
   * Define alert rules
   */
  defineAlertRule(rule) {
    if (!rule || !rule.name) {
      throw new Error('Alert rule must have a name');
    }

    const validatedRule = this.validateAlertRule(rule);
    
    this.alertRules.set(rule.name, {
      ...validatedRule,
      createdAt: new Date().toISOString(),
      lastEvaluated: null,
      state: this.alertStates.PENDING,
      firedCount: 0
    });

    return {
      success: true,
      rule: rule.name,
      message: 'Alert rule defined successfully'
    };
  }

  /**
   * Configure notification channels
   */
  configureNotificationChannel(channel) {
    if (!channel || !channel.name || !channel.type) {
      throw new Error('Channel must have name and type');
    }

    try {
      let configuredChannel;

      switch (channel.type) {
        case 'email':
          configuredChannel = this.configureEmailChannel(channel);
          break;
        
        case 'slack':
          configuredChannel = this.configureSlackChannel(channel);
          break;
        
        case 'webhook':
          configuredChannel = this.configureWebhookChannel(channel);
          break;
        
        case 'console':
          configuredChannel = this.configureConsoleChannel(channel);
          break;
        
        default:
          throw new Error(`Unsupported channel type: ${channel.type}`);
      }

      this.notificationChannels.set(channel.name, configuredChannel);

      return {
        success: true,
        channel: channel.name,
        type: channel.type,
        message: 'Notification channel configured successfully'
      };
    } catch (error) {
      console.error(`Failed to configure notification channel ${channel.name}:`, error);
      throw new Error(`Channel configuration failed: ${error.message}`);
    }
  }

  /**
   * Setup escalation policies
   */
  setupEscalationPolicy(policy) {
    if (!policy || !policy.name || !policy.levels) {
      throw new Error('Escalation policy must have name and levels');
    }

    const validatedPolicy = this.validateEscalationPolicy(policy);
    
    this.escalationPolicies.set(policy.name, {
      ...validatedPolicy,
      createdAt: new Date().toISOString()
    });

    return {
      success: true,
      policy: policy.name,
      levels: validatedPolicy.levels.length,
      message: 'Escalation policy configured successfully'
    };
  }

  /**
   * Send alert notification
   */
  async sendAlert(alert) {
    if (!alert || !alert.rule) {
      throw new Error('Alert must specify a rule');
    }

    try {
      // Check if alert is throttled
      if (this.isAlertThrottled(alert.rule)) {
        return {
          success: false,
          message: 'Alert throttled',
          nextAllowedTime: this.getNextAllowedAlertTime(alert.rule)
        };
      }

      // Get alert rule
      const rule = this.alertRules.get(alert.rule);
      if (!rule) {
        throw new Error(`Alert rule not found: ${alert.rule}`);
      }

      // Create alert record
      const alertRecord = {
        id: this.generateAlertId(),
        rule: alert.rule,
        severity: rule.severity || 'warning',
        title: alert.title || rule.name,
        message: alert.message || rule.description,
        metadata: alert.metadata || {},
        timestamp: new Date().toISOString(),
        state: this.alertStates.FIRING,
        channels: rule.channels || ['console']
      };

      // Store active alert
      this.activeAlerts.set(alertRecord.id, alertRecord);
      this.addToHistory(alertRecord);

      // Send notifications
      const notificationResults = await this.sendNotifications(alertRecord, rule.channels);

      // Handle escalation if needed
      if (rule.escalationPolicy) {
        this.scheduleEscalation(alertRecord, rule.escalationPolicy);
      }

      // Update rule state
      rule.state = this.alertStates.FIRING;
      rule.lastFired = new Date().toISOString();
      rule.firedCount++;

      return {
        success: true,
        alertId: alertRecord.id,
        notifications: notificationResults,
        message: 'Alert sent successfully'
      };
    } catch (error) {
      console.error('Failed to send alert:', error);
      throw new Error(`Alert sending failed: ${error.message}`);
    }
  }

  /**
   * Validate alert rule
   */
  validateAlertRule(rule) {
    const validated = {
      name: rule.name,
      description: rule.description || '',
      condition: rule.condition || {},
      severity: rule.severity || 'warning',
      channels: rule.channels || ['console'],
      escalationPolicy: rule.escalationPolicy || null,
      metadata: rule.metadata || {}
    };

    // Validate severity
    const validSeverities = ['critical', 'error', 'warning', 'info'];
    if (!validSeverities.includes(validated.severity)) {
      throw new Error(`Invalid severity: ${validated.severity}`);
    }

    // Validate channels exist
    for (const channelName of validated.channels) {
      if (channelName !== 'console' && !this.notificationChannels.has(channelName)) {
        throw new Error(`Notification channel not found: ${channelName}`);
      }
    }

    return validated;
  }

  /**
   * Configure email channel
   */
  configureEmailChannel(channel) {
    if (!channel.config || !channel.config.smtp) {
      throw new Error('Email channel requires SMTP configuration');
    }

    const transporter = nodemailer.createTransporter({
      host: channel.config.smtp.host,
      port: channel.config.smtp.port || 587,
      secure: channel.config.smtp.secure || false,
      auth: {
        user: channel.config.smtp.user,
        pass: channel.config.smtp.pass
      }
    });

    return {
      type: 'email',
      name: channel.name,
      config: channel.config,
      transporter,
      send: async (alert) => {
        const mailOptions = {
          from: channel.config.from || channel.config.smtp.user,
          to: channel.config.to,
          subject: `[${alert.severity.toUpperCase()}] ${alert.title}`,
          text: this.formatAlertText(alert),
          html: this.formatAlertHtml(alert)
        };

        return await transporter.sendMail(mailOptions);
      }
    };
  }

  /**
   * Configure Slack channel
   */
  configureSlackChannel(channel) {
    if (!channel.config || !channel.config.webhookUrl) {
      throw new Error('Slack channel requires webhook URL');
    }

    const webhook = new IncomingWebhook(channel.config.webhookUrl);

    return {
      type: 'slack',
      name: channel.name,
      config: channel.config,
      webhook,
      send: async (alert) => {
        const color = this.getSeverityColor(alert.severity);
        
        return await webhook.send({
          text: alert.title,
          attachments: [{
            color,
            fields: [
              {
                title: 'Severity',
                value: alert.severity.toUpperCase(),
                short: true
              },
              {
                title: 'Time',
                value: new Date(alert.timestamp).toLocaleString(),
                short: true
              },
              {
                title: 'Message',
                value: alert.message,
                short: false
              }
            ],
            footer: 'MCP Alerting System',
            ts: Math.floor(Date.now() / 1000)
          }]
        });
      }
    };
  }

  /**
   * Configure webhook channel
   */
  configureWebhookChannel(channel) {
    if (!channel.config || !channel.config.url) {
      throw new Error('Webhook channel requires URL');
    }

    return {
      type: 'webhook',
      name: channel.name,
      config: channel.config,
      send: async (alert) => {
        const payload = {
          alert,
          timestamp: new Date().toISOString(),
          source: 'mcp-alerting-system'
        };

        const headers = channel.config.headers || {};
        
        return await axios.post(channel.config.url, payload, {
          headers,
          timeout: 30000
        });
      }
    };
  }

  /**
   * Configure console channel
   */
  configureConsoleChannel(channel) {
    return {
      type: 'console',
      name: channel.name,
      config: channel.config || {},
      send: async (alert) => {
        const severity = alert.severity.toUpperCase();
        const timestamp = new Date(alert.timestamp).toISOString();
        
        console.log(`
========================================
ALERT [${severity}] - ${timestamp}
========================================
Title: ${alert.title}
Message: ${alert.message}
Rule: ${alert.rule}
ID: ${alert.id}
----------------------------------------
${JSON.stringify(alert.metadata, null, 2)}
========================================
        `);
        
        return { success: true };
      }
    };
  }

  /**
   * Validate escalation policy
   */
  validateEscalationPolicy(policy) {
    const validated = {
      name: policy.name,
      description: policy.description || '',
      levels: []
    };

    // Validate levels
    if (!Array.isArray(policy.levels) || policy.levels.length === 0) {
      throw new Error('Escalation policy must have at least one level');
    }

    for (const level of policy.levels) {
      validated.levels.push({
        delayMinutes: level.delayMinutes || 0,
        channels: level.channels || [],
        repeat: level.repeat || false,
        repeatInterval: level.repeatInterval || 60
      });
    }

    return validated;
  }

  /**
   * Check if alert is throttled
   */
  isAlertThrottled(ruleName) {
    const rule = this.alertRules.get(ruleName);
    if (!rule || !rule.lastFired) return false;

    const timeSinceLastFired = Date.now() - new Date(rule.lastFired).getTime();
    return timeSinceLastFired < this.config.alertThrottleTime;
  }

  /**
   * Get next allowed alert time
   */
  getNextAllowedAlertTime(ruleName) {
    const rule = this.alertRules.get(ruleName);
    if (!rule || !rule.lastFired) return new Date();

    const nextTime = new Date(rule.lastFired).getTime() + this.config.alertThrottleTime;
    return new Date(nextTime).toISOString();
  }

  /**
   * Send notifications
   */
  async sendNotifications(alert, channelNames) {
    const results = [];

    for (const channelName of channelNames) {
      try {
        let channel;
        
        if (channelName === 'console') {
          channel = this.configureConsoleChannel({ name: 'console' });
        } else {
          channel = this.notificationChannels.get(channelName);
        }

        if (!channel) {
          results.push({
            channel: channelName,
            success: false,
            error: 'Channel not found'
          });
          continue;
        }

        await channel.send(alert);
        
        results.push({
          channel: channelName,
          success: true
        });
      } catch (error) {
        console.error(`Failed to send notification to ${channelName}:`, error);
        results.push({
          channel: channelName,
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Schedule escalation
   */
  scheduleEscalation(alert, policyName) {
    const policy = this.escalationPolicies.get(policyName);
    if (!policy) return;

    let currentLevel = 0;

    const escalate = () => {
      if (currentLevel >= policy.levels.length) return;

      const level = policy.levels[currentLevel];
      const delay = level.delayMinutes * 60 * 1000;

      setTimeout(async () => {
        // Check if alert is still active
        if (!this.activeAlerts.has(alert.id)) return;

        // Send escalation notifications
        const escalatedAlert = {
          ...alert,
          escalationLevel: currentLevel + 1,
          escalatedAt: new Date().toISOString()
        };

        await this.sendNotifications(escalatedAlert, level.channels);

        // Update alert state
        const activeAlert = this.activeAlerts.get(alert.id);
        if (activeAlert) {
          activeAlert.state = this.alertStates.ESCALATED;
          activeAlert.escalationLevel = currentLevel + 1;
        }

        currentLevel++;

        // Schedule next level or repeat
        if (level.repeat || currentLevel < policy.levels.length) {
          escalate();
        }
      }, delay);
    };

    escalate();
  }

  /**
   * Generate alert ID
   */
  generateAlertId() {
    return `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Add to history
   */
  addToHistory(alert) {
    this.alertHistory.unshift(alert);
    
    // Trim history if too large
    if (this.alertHistory.length > this.config.maxHistorySize) {
      this.alertHistory = this.alertHistory.slice(0, this.config.maxHistorySize);
    }
  }

  /**
   * Format alert text
   */
  formatAlertText(alert) {
    return `
Alert: ${alert.title}
Severity: ${alert.severity.toUpperCase()}
Time: ${new Date(alert.timestamp).toLocaleString()}

Message:
${alert.message}

Rule: ${alert.rule}
Alert ID: ${alert.id}

Additional Information:
${JSON.stringify(alert.metadata, null, 2)}
    `.trim();
  }

  /**
   * Format alert HTML
   */
  formatAlertHtml(alert) {
    const color = this.getSeverityColor(alert.severity);
    
    return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; }
    .alert-container { 
      border: 2px solid ${color}; 
      border-radius: 8px; 
      padding: 20px; 
      margin: 20px;
    }
    .alert-header { 
      color: ${color}; 
      font-size: 24px; 
      font-weight: bold; 
      margin-bottom: 10px;
    }
    .alert-severity {
      display: inline-block;
      background: ${color};
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 14px;
      margin-left: 10px;
    }
    .alert-time { 
      color: #666; 
      font-size: 14px; 
      margin-bottom: 20px;
    }
    .alert-message { 
      background: #f5f5f5; 
      padding: 15px; 
      border-radius: 4px;
      margin-bottom: 20px;
    }
    .alert-metadata {
      background: #f9f9f9;
      padding: 10px;
      border-radius: 4px;
      font-family: monospace;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="alert-container">
    <div class="alert-header">
      ${alert.title}
      <span class="alert-severity">${alert.severity.toUpperCase()}</span>
    </div>
    <div class="alert-time">${new Date(alert.timestamp).toLocaleString()}</div>
    <div class="alert-message">${alert.message}</div>
    <div style="color: #666; font-size: 14px; margin-top: 20px;">
      <strong>Rule:</strong> ${alert.rule}<br>
      <strong>Alert ID:</strong> ${alert.id}
    </div>
    ${Object.keys(alert.metadata).length > 0 ? `
      <div style="margin-top: 20px;">
        <strong>Additional Information:</strong>
        <div class="alert-metadata">
          ${JSON.stringify(alert.metadata, null, 2)}
        </div>
      </div>
    ` : ''}
  </div>
</body>
</html>
    `;
  }

  /**
   * Get severity color
   */
  getSeverityColor(severity) {
    const colors = {
      critical: '#d32f2f',
      error: '#f44336',
      warning: '#ff9800',
      info: '#2196f3'
    };
    
    return colors[severity] || '#757575';
  }

  /**
   * Acknowledge alert
   */
  acknowledgeAlert(alertId, acknowledgedBy) {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) {
      throw new Error(`Alert not found: ${alertId}`);
    }

    alert.state = this.alertStates.ACKNOWLEDGED;
    alert.acknowledgedAt = new Date().toISOString();
    alert.acknowledgedBy = acknowledgedBy;

    return {
      success: true,
      alertId,
      message: 'Alert acknowledged'
    };
  }

  /**
   * Resolve alert
   */
  resolveAlert(alertId, resolvedBy, resolution) {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) {
      throw new Error(`Alert not found: ${alertId}`);
    }

    alert.state = this.alertStates.RESOLVED;
    alert.resolvedAt = new Date().toISOString();
    alert.resolvedBy = resolvedBy;
    alert.resolution = resolution || '';

    // Remove from active alerts
    this.activeAlerts.delete(alertId);

    return {
      success: true,
      alertId,
      message: 'Alert resolved'
    };
  }

  /**
   * Get active alerts
   */
  getActiveAlerts() {
    return Array.from(this.activeAlerts.values());
  }

  /**
   * Get alert history
   */
  getAlertHistory(limit = 100) {
    return this.alertHistory.slice(0, limit);
  }

  /**
   * Get alert statistics
   */
  getAlertStatistics() {
    const stats = {
      totalAlerts: this.alertHistory.length,
      activeAlerts: this.activeAlerts.size,
      bySeverity: {
        critical: 0,
        error: 0,
        warning: 0,
        info: 0
      },
      byState: {}
    };

    // Count by severity and state
    for (const alert of this.alertHistory) {
      if (stats.bySeverity[alert.severity] !== undefined) {
        stats.bySeverity[alert.severity]++;
      }
      
      stats.byState[alert.state] = (stats.byState[alert.state] || 0) + 1;
    }

    return stats;
  }

  /**
   * Clear resolved alerts from history
   */
  clearResolvedAlerts() {
    this.alertHistory = this.alertHistory.filter(
      alert => alert.state !== this.alertStates.RESOLVED
    );
    
    return {
      success: true,
      message: 'Resolved alerts cleared from history'
    };
  }
}

module.exports = AlertingSystem;