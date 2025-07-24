const EventEmitter = require('events');

/**
 * Alert routing system for intelligent alert management
 * Routes alerts to appropriate channels based on rules and conditions
 */
class AlertRouter extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      defaultChannel: options.defaultChannel || 'console',
      aggregationWindow: options.aggregationWindow || 60000, // 1 minute
      deduplicationWindow: options.deduplicationWindow || 300000, // 5 minutes
      maxRetries: options.maxRetries || 3,
      retryDelay: options.retryDelay || 5000,
      ...options
    };

    // Alert routing rules
    this.rules = [];
    
    // Alert channels
    this.channels = new Map();
    
    // Alert state tracking
    this.alertState = {
      active: new Map(),
      suppressed: new Map(),
      aggregated: new Map(),
      history: []
    };
    
    // Deduplication cache
    this.deduplicationCache = new Map();
    
    // Initialize default channels
    this._initializeDefaultChannels();
    
    // Start cleanup interval
    this._startCleanupInterval();
  }

  /**
   * Initialize default alert channels
   */
  _initializeDefaultChannels() {
    // Console channel
    this.addChannel('console', {
      send: async (alert) => {
        console.log(`[ALERT] ${alert.severity}: ${alert.title}`, alert);
        return { success: true };
      }
    });

    // Email channel (placeholder)
    this.addChannel('email', {
      send: async (alert) => {
        // In production, integrate with email service
        console.log(`[EMAIL ALERT] To: ${alert.recipient}`, alert);
        return { success: true };
      }
    });

    // Slack channel (placeholder)
    this.addChannel('slack', {
      send: async (alert) => {
        // In production, integrate with Slack API
        console.log(`[SLACK ALERT] Channel: ${alert.channel}`, alert);
        return { success: true };
      }
    });

    // PagerDuty channel (placeholder)
    this.addChannel('pagerduty', {
      send: async (alert) => {
        // In production, integrate with PagerDuty API
        console.log(`[PAGERDUTY ALERT] Service: ${alert.service}`, alert);
        return { success: true };
      }
    });

    // Webhook channel
    this.addChannel('webhook', {
      send: async (alert) => {
        if (!alert.webhookUrl) {
          throw new Error('Webhook URL not provided');
        }
        
        // In production, make actual HTTP request
        console.log(`[WEBHOOK ALERT] URL: ${alert.webhookUrl}`, alert);
        return { success: true };
      }
    });
  }

  /**
   * Add alert routing rule
   */
  addRule(rule) {
    const ruleConfig = {
      id: rule.id || `rule-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: rule.name,
      conditions: rule.conditions || {},
      actions: rule.actions || [],
      priority: rule.priority || 0,
      enabled: rule.enabled !== false,
      metadata: rule.metadata || {},
      createdAt: new Date().toISOString()
    };

    // Validate rule
    this._validateRule(ruleConfig);
    
    // Add rule in priority order
    const insertIndex = this.rules.findIndex(r => r.priority < ruleConfig.priority);
    if (insertIndex === -1) {
      this.rules.push(ruleConfig);
    } else {
      this.rules.splice(insertIndex, 0, ruleConfig);
    }
    
    this.emit('ruleAdded', ruleConfig);
    
    return ruleConfig.id;
  }

  /**
   * Remove alert routing rule
   */
  removeRule(ruleId) {
    const index = this.rules.findIndex(r => r.id === ruleId);
    if (index !== -1) {
      const removed = this.rules.splice(index, 1)[0];
      this.emit('ruleRemoved', removed);
      return true;
    }
    return false;
  }

  /**
   * Update alert routing rule
   */
  updateRule(ruleId, updates) {
    const rule = this.rules.find(r => r.id === ruleId);
    if (!rule) {
      throw new Error(`Rule ${ruleId} not found`);
    }
    
    Object.assign(rule, updates, {
      updatedAt: new Date().toISOString()
    });
    
    // Re-sort rules if priority changed
    if (updates.priority !== undefined) {
      this.rules.sort((a, b) => b.priority - a.priority);
    }
    
    this.emit('ruleUpdated', rule);
    
    return rule;
  }

  /**
   * Add alert channel
   */
  addChannel(name, channel) {
    if (!channel.send || typeof channel.send !== 'function') {
      throw new Error('Channel must have a send method');
    }
    
    this.channels.set(name, {
      name,
      send: channel.send,
      config: channel.config || {},
      rateLimits: channel.rateLimits || {},
      stats: {
        sent: 0,
        failed: 0,
        lastSent: null,
        lastError: null
      }
    });
    
    this.emit('channelAdded', name);
  }

  /**
   * Route an alert
   */
  async route(alert) {
    // Normalize alert
    const normalizedAlert = this._normalizeAlert(alert);
    
    // Check deduplication
    if (this._isDuplicate(normalizedAlert)) {
      this.emit('alertDeduplicated', normalizedAlert);
      return { deduplicated: true };
    }
    
    // Check suppression
    if (this._isSuppressed(normalizedAlert)) {
      this.emit('alertSuppressed', normalizedAlert);
      return { suppressed: true };
    }
    
    // Find matching rules
    const matchingRules = this._findMatchingRules(normalizedAlert);
    
    if (matchingRules.length === 0) {
      // Use default routing
      return await this._routeToDefault(normalizedAlert);
    }
    
    // Execute rules in priority order
    const results = [];
    for (const rule of matchingRules) {
      try {
        const result = await this._executeRule(rule, normalizedAlert);
        results.push(result);
        
        // Stop processing if rule indicates
        if (rule.stopProcessing) {
          break;
        }
      } catch (error) {
        this.emit('ruleError', { rule, alert: normalizedAlert, error });
        results.push({ rule: rule.id, error: error.message });
      }
    }
    
    // Track alert
    this._trackAlert(normalizedAlert, results);
    
    return { results };
  }

  /**
   * Normalize alert structure
   */
  _normalizeAlert(alert) {
    return {
      id: alert.id || `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: alert.timestamp || new Date().toISOString(),
      severity: alert.severity || 'info',
      title: alert.title || 'Untitled Alert',
      description: alert.description || '',
      source: alert.source || 'unknown',
      tags: alert.tags || {},
      metadata: alert.metadata || {},
      dedupKey: alert.dedupKey || this._generateDedupKey(alert),
      ...alert
    };
  }

  /**
   * Generate deduplication key
   */
  _generateDedupKey(alert) {
    const parts = [
      alert.source,
      alert.severity,
      alert.title,
      JSON.stringify(alert.tags)
    ];
    
    return parts.join(':');
  }

  /**
   * Check if alert is duplicate
   */
  _isDuplicate(alert) {
    const dedupKey = alert.dedupKey;
    const existing = this.deduplicationCache.get(dedupKey);
    
    if (existing) {
      const timeDiff = Date.now() - existing.timestamp;
      if (timeDiff < this.options.deduplicationWindow) {
        existing.count++;
        return true;
      }
    }
    
    // Add to dedup cache
    this.deduplicationCache.set(dedupKey, {
      timestamp: Date.now(),
      count: 1,
      alert
    });
    
    return false;
  }

  /**
   * Check if alert is suppressed
   */
  _isSuppressed(alert) {
    for (const [key, suppression] of this.alertState.suppressed) {
      if (this._matchesConditions(alert, suppression.conditions)) {
        if (suppression.until && new Date(suppression.until) > new Date()) {
          return true;
        }
      }
    }
    
    return false;
  }

  /**
   * Find matching rules for alert
   */
  _findMatchingRules(alert) {
    return this.rules.filter(rule => {
      if (!rule.enabled) return false;
      return this._matchesConditions(alert, rule.conditions);
    });
  }

  /**
   * Check if alert matches conditions
   */
  _matchesConditions(alert, conditions) {
    for (const [field, condition] of Object.entries(conditions)) {
      const value = this._getFieldValue(alert, field);
      
      if (!this._evaluateCondition(value, condition)) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Get field value from alert
   */
  _getFieldValue(alert, field) {
    const parts = field.split('.');
    let value = alert;
    
    for (const part of parts) {
      value = value?.[part];
    }
    
    return value;
  }

  /**
   * Evaluate condition
   */
  _evaluateCondition(value, condition) {
    if (typeof condition === 'object' && condition !== null) {
      // Complex condition
      if (condition.equals !== undefined) {
        return value === condition.equals;
      }
      if (condition.contains !== undefined) {
        return String(value).includes(condition.contains);
      }
      if (condition.matches !== undefined) {
        return new RegExp(condition.matches).test(String(value));
      }
      if (condition.in !== undefined) {
        return condition.in.includes(value);
      }
      if (condition.gt !== undefined) {
        return value > condition.gt;
      }
      if (condition.gte !== undefined) {
        return value >= condition.gte;
      }
      if (condition.lt !== undefined) {
        return value < condition.lt;
      }
      if (condition.lte !== undefined) {
        return value <= condition.lte;
      }
    }
    
    // Simple equality
    return value === condition;
  }

  /**
   * Execute rule actions
   */
  async _executeRule(rule, alert) {
    const results = [];
    
    for (const action of rule.actions) {
      try {
        const result = await this._executeAction(action, alert, rule);
        results.push({ action: action.type, success: true, result });
      } catch (error) {
        results.push({ action: action.type, success: false, error: error.message });
        
        if (action.required) {
          throw error;
        }
      }
    }
    
    return { rule: rule.id, results };
  }

  /**
   * Execute single action
   */
  async _executeAction(action, alert, rule) {
    switch (action.type) {
      case 'send':
        return await this._sendAlert(alert, action.channel, action.config);
        
      case 'aggregate':
        return this._aggregateAlert(alert, action.window || this.options.aggregationWindow);
        
      case 'suppress':
        return this._suppressAlert(alert, action.duration);
        
      case 'transform':
        return this._transformAlert(alert, action.transform);
        
      case 'escalate':
        return await this._escalateAlert(alert, action.to);
        
      case 'webhook':
        return await this._webhookAlert(alert, action.url, action.headers);
        
      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  /**
   * Send alert to channel
   */
  async _sendAlert(alert, channelName, config = {}) {
    const channel = this.channels.get(channelName);
    if (!channel) {
      throw new Error(`Channel ${channelName} not found`);
    }
    
    // Check rate limits
    if (this._isRateLimited(channel, alert)) {
      throw new Error(`Channel ${channelName} rate limited`);
    }
    
    // Prepare alert for channel
    const channelAlert = {
      ...alert,
      ...config
    };
    
    let attempts = 0;
    let lastError;
    
    while (attempts < this.options.maxRetries) {
      try {
        const result = await channel.send(channelAlert);
        
        // Update stats
        channel.stats.sent++;
        channel.stats.lastSent = new Date().toISOString();
        
        this.emit('alertSent', { alert, channel: channelName, result });
        
        return result;
      } catch (error) {
        lastError = error;
        attempts++;
        
        if (attempts < this.options.maxRetries) {
          await new Promise(resolve => setTimeout(resolve, this.options.retryDelay * attempts));
        }
      }
    }
    
    // Update failure stats
    channel.stats.failed++;
    channel.stats.lastError = {
      timestamp: new Date().toISOString(),
      error: lastError.message
    };
    
    throw lastError;
  }

  /**
   * Check if channel is rate limited
   */
  _isRateLimited(channel, alert) {
    if (!channel.rateLimits) return false;
    
    const now = Date.now();
    const { perMinute, perHour, perDay } = channel.rateLimits;
    
    // Implementation would check actual rate limits
    // This is a placeholder
    return false;
  }

  /**
   * Aggregate alerts
   */
  _aggregateAlert(alert, window) {
    const key = `${alert.source}:${alert.severity}`;
    let aggregation = this.alertState.aggregated.get(key);
    
    if (!aggregation) {
      aggregation = {
        key,
        alerts: [],
        firstSeen: Date.now(),
        window
      };
      this.alertState.aggregated.set(key, aggregation);
      
      // Schedule aggregation send
      setTimeout(() => {
        this._sendAggregatedAlerts(key);
      }, window);
    }
    
    aggregation.alerts.push(alert);
    aggregation.lastSeen = Date.now();
    
    return { aggregated: true, key };
  }

  /**
   * Send aggregated alerts
   */
  async _sendAggregatedAlerts(key) {
    const aggregation = this.alertState.aggregated.get(key);
    if (!aggregation || aggregation.alerts.length === 0) return;
    
    const aggregatedAlert = {
      id: `agg-${Date.now()}`,
      timestamp: new Date().toISOString(),
      severity: aggregation.alerts[0].severity,
      title: `${aggregation.alerts.length} alerts aggregated`,
      description: `${aggregation.alerts.length} similar alerts in ${aggregation.window}ms window`,
      source: 'alert-aggregator',
      alerts: aggregation.alerts,
      metadata: {
        firstSeen: new Date(aggregation.firstSeen).toISOString(),
        lastSeen: new Date(aggregation.lastSeen).toISOString(),
        count: aggregation.alerts.length
      }
    };
    
    // Route aggregated alert
    await this.route(aggregatedAlert);
    
    // Clear aggregation
    this.alertState.aggregated.delete(key);
  }

  /**
   * Suppress alerts
   */
  _suppressAlert(alert, duration) {
    const until = new Date(Date.now() + duration);
    const suppression = {
      conditions: {
        source: alert.source,
        severity: alert.severity,
        'tags.component': alert.tags?.component
      },
      until: until.toISOString(),
      reason: `Auto-suppressed until ${until.toISOString()}`
    };
    
    const key = `${alert.source}:${alert.severity}`;
    this.alertState.suppressed.set(key, suppression);
    
    // Schedule removal
    setTimeout(() => {
      this.alertState.suppressed.delete(key);
    }, duration);
    
    return { suppressed: true, until: suppression.until };
  }

  /**
   * Transform alert
   */
  _transformAlert(alert, transform) {
    const transformed = { ...alert };
    
    for (const [field, value] of Object.entries(transform)) {
      if (typeof value === 'function') {
        transformed[field] = value(alert);
      } else {
        transformed[field] = value;
      }
    }
    
    return transformed;
  }

  /**
   * Escalate alert
   */
  async _escalateAlert(alert, escalationConfig) {
    const escalatedAlert = {
      ...alert,
      severity: 'critical',
      escalated: true,
      escalationReason: escalationConfig.reason || 'Auto-escalated',
      originalSeverity: alert.severity
    };
    
    // Route escalated alert
    return await this.route(escalatedAlert);
  }

  /**
   * Send webhook alert
   */
  async _webhookAlert(alert, url, headers = {}) {
    // In production, make actual HTTP request
    console.log(`[WEBHOOK] Sending to ${url}`, { alert, headers });
    return { success: true, url };
  }

  /**
   * Route to default channel
   */
  async _routeToDefault(alert) {
    return await this._sendAlert(alert, this.options.defaultChannel);
  }

  /**
   * Track alert in history
   */
  _trackAlert(alert, results) {
    const tracked = {
      ...alert,
      routedAt: new Date().toISOString(),
      results
    };
    
    this.alertState.history.push(tracked);
    
    // Limit history size
    if (this.alertState.history.length > 1000) {
      this.alertState.history.shift();
    }
    
    // Update active alerts
    this.alertState.active.set(alert.id, tracked);
  }

  /**
   * Validate rule configuration
   */
  _validateRule(rule) {
    if (!rule.name) {
      throw new Error('Rule must have a name');
    }
    
    if (!rule.actions || rule.actions.length === 0) {
      throw new Error('Rule must have at least one action');
    }
    
    // Validate each action
    for (const action of rule.actions) {
      if (!action.type) {
        throw new Error('Action must have a type');
      }
      
      if (action.type === 'send' && !action.channel) {
        throw new Error('Send action must specify a channel');
      }
    }
  }

  /**
   * Start cleanup interval
   */
  _startCleanupInterval() {
    setInterval(() => {
      // Clean old deduplication entries
      const now = Date.now();
      for (const [key, entry] of this.deduplicationCache) {
        if (now - entry.timestamp > this.options.deduplicationWindow) {
          this.deduplicationCache.delete(key);
        }
      }
      
      // Clean old active alerts
      for (const [id, alert] of this.alertState.active) {
        const age = now - new Date(alert.timestamp).getTime();
        if (age > 24 * 60 * 60 * 1000) { // 24 hours
          this.alertState.active.delete(id);
        }
      }
    }, 60000); // Run every minute
  }

  /**
   * Get alert statistics
   */
  getStats() {
    const stats = {
      rules: {
        total: this.rules.length,
        enabled: this.rules.filter(r => r.enabled).length
      },
      channels: {},
      alerts: {
        active: this.alertState.active.size,
        suppressed: this.alertState.suppressed.size,
        aggregated: this.alertState.aggregated.size,
        history: this.alertState.history.length
      }
    };
    
    // Channel stats
    for (const [name, channel] of this.channels) {
      stats.channels[name] = channel.stats;
    }
    
    return stats;
  }

  /**
   * Export configuration
   */
  exportConfig() {
    return {
      options: this.options,
      rules: this.rules,
      channels: Array.from(this.channels.keys())
    };
  }

  /**
   * Import configuration
   */
  importConfig(config) {
    // Import rules
    if (config.rules) {
      for (const rule of config.rules) {
        this.addRule(rule);
      }
    }
    
    // Update options
    if (config.options) {
      Object.assign(this.options, config.options);
    }
  }
}

module.exports = AlertRouter;