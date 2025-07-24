const client = require('prom-client');

/**
 * Custom business metrics for MCP platform
 * Provides domain-specific metrics for monitoring business KPIs
 */
class CustomMetrics {
  constructor(options = {}) {
    this.options = {
      prefix: options.prefix || 'mcp_',
      register: options.register || client.register,
      ...options
    };

    this.metrics = {};
    this._initializeMetrics();
  }

  /**
   * Initialize all custom business metrics
   */
  _initializeMetrics() {
    // MCP-specific metrics
    this._initializeMCPMetrics();
    
    // User engagement metrics
    this._initializeUserMetrics();
    
    // Content metrics
    this._initializeContentMetrics();
    
    // Performance SLA metrics
    this._initializeSLAMetrics();
    
    // Integration metrics
    this._initializeIntegrationMetrics();
    
    // Revenue and billing metrics
    this._initializeRevenueMetrics();
    
    // Security metrics
    this._initializeSecurityMetrics();
    
    // Data quality metrics
    this._initializeDataQualityMetrics();
  }

  /**
   * MCP-specific metrics
   */
  _initializeMCPMetrics() {
    // Active MCP connections
    this.metrics.mcpActiveConnections = new client.Gauge({
      name: `${this.options.prefix}mcp_active_connections`,
      help: 'Number of active MCP connections',
      labelNames: ['transport', 'client_type', 'version'],
      registers: [this.options.register]
    });

    // MCP messages processed
    this.metrics.mcpMessagesProcessed = new client.Counter({
      name: `${this.options.prefix}mcp_messages_processed_total`,
      help: 'Total number of MCP messages processed',
      labelNames: ['message_type', 'direction', 'status'],
      registers: [this.options.register]
    });

    // MCP message processing latency
    this.metrics.mcpMessageLatency = new client.Histogram({
      name: `${this.options.prefix}mcp_message_latency_seconds`,
      help: 'MCP message processing latency',
      labelNames: ['message_type', 'transport'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
      registers: [this.options.register]
    });

    // MCP protocol errors
    this.metrics.mcpProtocolErrors = new client.Counter({
      name: `${this.options.prefix}mcp_protocol_errors_total`,
      help: 'Total number of MCP protocol errors',
      labelNames: ['error_type', 'severity'],
      registers: [this.options.register]
    });

    // MCP resource usage
    this.metrics.mcpResourceUsage = new client.Gauge({
      name: `${this.options.prefix}mcp_resource_usage`,
      help: 'MCP resource usage by type',
      labelNames: ['resource_type', 'client_id'],
      registers: [this.options.register]
    });

    // MCP tool invocations
    this.metrics.mcpToolInvocations = new client.Counter({
      name: `${this.options.prefix}mcp_tool_invocations_total`,
      help: 'Total number of MCP tool invocations',
      labelNames: ['tool_name', 'status', 'client_type'],
      registers: [this.options.register]
    });

    // MCP tool execution time
    this.metrics.mcpToolExecutionTime = new client.Histogram({
      name: `${this.options.prefix}mcp_tool_execution_seconds`,
      help: 'MCP tool execution time',
      labelNames: ['tool_name'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 5, 10, 30],
      registers: [this.options.register]
    });
  }

  /**
   * User engagement metrics
   */
  _initializeUserMetrics() {
    // Daily active users
    this.metrics.dailyActiveUsers = new client.Gauge({
      name: `${this.options.prefix}daily_active_users`,
      help: 'Number of daily active users',
      labelNames: ['user_type', 'platform'],
      registers: [this.options.register]
    });

    // User sessions
    this.metrics.userSessions = new client.Counter({
      name: `${this.options.prefix}user_sessions_total`,
      help: 'Total number of user sessions',
      labelNames: ['session_type', 'platform', 'country'],
      registers: [this.options.register]
    });

    // Session duration
    this.metrics.sessionDuration = new client.Histogram({
      name: `${this.options.prefix}session_duration_seconds`,
      help: 'User session duration',
      labelNames: ['user_type', 'platform'],
      buckets: [60, 300, 600, 1800, 3600, 7200, 14400],
      registers: [this.options.register]
    });

    // Feature adoption
    this.metrics.featureAdoption = new client.Gauge({
      name: `${this.options.prefix}feature_adoption_rate`,
      help: 'Feature adoption rate percentage',
      labelNames: ['feature', 'user_segment'],
      registers: [this.options.register]
    });

    // User retention
    this.metrics.userRetention = new client.Gauge({
      name: `${this.options.prefix}user_retention_rate`,
      help: 'User retention rate',
      labelNames: ['cohort', 'period'],
      registers: [this.options.register]
    });
  }

  /**
   * Content metrics
   */
  _initializeContentMetrics() {
    // Content created
    this.metrics.contentCreated = new client.Counter({
      name: `${this.options.prefix}content_created_total`,
      help: 'Total content items created',
      labelNames: ['content_type', 'source'],
      registers: [this.options.register]
    });

    // Content processing time
    this.metrics.contentProcessingTime = new client.Histogram({
      name: `${this.options.prefix}content_processing_seconds`,
      help: 'Content processing time',
      labelNames: ['content_type', 'operation'],
      buckets: [0.1, 0.5, 1, 5, 10, 30, 60],
      registers: [this.options.register]
    });

    // Content storage size
    this.metrics.contentStorageSize = new client.Gauge({
      name: `${this.options.prefix}content_storage_bytes`,
      help: 'Content storage size in bytes',
      labelNames: ['content_type', 'storage_tier'],
      registers: [this.options.register]
    });

    // Content quality score
    this.metrics.contentQualityScore = new client.Gauge({
      name: `${this.options.prefix}content_quality_score`,
      help: 'Content quality score (0-100)',
      labelNames: ['content_type', 'category'],
      registers: [this.options.register]
    });
  }

  /**
   * SLA metrics
   */
  _initializeSLAMetrics() {
    // API availability
    this.metrics.apiAvailability = new client.Gauge({
      name: `${this.options.prefix}api_availability_percentage`,
      help: 'API availability percentage',
      labelNames: ['endpoint', 'region'],
      registers: [this.options.register]
    });

    // Response time percentiles
    this.metrics.responseTimePercentile = new client.Gauge({
      name: `${this.options.prefix}response_time_percentile_seconds`,
      help: 'Response time percentiles',
      labelNames: ['endpoint', 'percentile'],
      registers: [this.options.register]
    });

    // SLA violations
    this.metrics.slaViolations = new client.Counter({
      name: `${this.options.prefix}sla_violations_total`,
      help: 'Total SLA violations',
      labelNames: ['sla_type', 'severity', 'customer_tier'],
      registers: [this.options.register]
    });

    // Error budget remaining
    this.metrics.errorBudgetRemaining = new client.Gauge({
      name: `${this.options.prefix}error_budget_remaining_percentage`,
      help: 'Error budget remaining percentage',
      labelNames: ['service', 'slo_type'],
      registers: [this.options.register]
    });
  }

  /**
   * Integration metrics
   */
  _initializeIntegrationMetrics() {
    // Third-party API calls
    this.metrics.thirdPartyAPICalls = new client.Counter({
      name: `${this.options.prefix}third_party_api_calls_total`,
      help: 'Total third-party API calls',
      labelNames: ['provider', 'endpoint', 'status'],
      registers: [this.options.register]
    });

    // Integration latency
    this.metrics.integrationLatency = new client.Histogram({
      name: `${this.options.prefix}integration_latency_seconds`,
      help: 'Integration latency',
      labelNames: ['provider', 'operation'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
      registers: [this.options.register]
    });

    // Webhook deliveries
    this.metrics.webhookDeliveries = new client.Counter({
      name: `${this.options.prefix}webhook_deliveries_total`,
      help: 'Total webhook deliveries',
      labelNames: ['webhook_type', 'status', 'retry_count'],
      registers: [this.options.register]
    });

    // Data sync lag
    this.metrics.dataSyncLag = new client.Gauge({
      name: `${this.options.prefix}data_sync_lag_seconds`,
      help: 'Data synchronization lag',
      labelNames: ['source', 'destination'],
      registers: [this.options.register]
    });
  }

  /**
   * Revenue metrics
   */
  _initializeRevenueMetrics() {
    // Revenue
    this.metrics.revenue = new client.Counter({
      name: `${this.options.prefix}revenue_total`,
      help: 'Total revenue',
      labelNames: ['product', 'plan', 'currency', 'payment_method'],
      registers: [this.options.register]
    });

    // Monthly recurring revenue
    this.metrics.mrr = new client.Gauge({
      name: `${this.options.prefix}monthly_recurring_revenue`,
      help: 'Monthly recurring revenue',
      labelNames: ['product', 'plan', 'currency'],
      registers: [this.options.register]
    });

    // Customer lifetime value
    this.metrics.customerLifetimeValue = new client.Gauge({
      name: `${this.options.prefix}customer_lifetime_value`,
      help: 'Average customer lifetime value',
      labelNames: ['customer_segment', 'currency'],
      registers: [this.options.register]
    });

    // Churn rate
    this.metrics.churnRate = new client.Gauge({
      name: `${this.options.prefix}churn_rate_percentage`,
      help: 'Customer churn rate percentage',
      labelNames: ['customer_segment', 'period'],
      registers: [this.options.register]
    });

    // Payment failures
    this.metrics.paymentFailures = new client.Counter({
      name: `${this.options.prefix}payment_failures_total`,
      help: 'Total payment failures',
      labelNames: ['failure_reason', 'payment_method', 'currency'],
      registers: [this.options.register]
    });
  }

  /**
   * Security metrics
   */
  _initializeSecurityMetrics() {
    // Authentication attempts
    this.metrics.authAttempts = new client.Counter({
      name: `${this.options.prefix}auth_attempts_total`,
      help: 'Total authentication attempts',
      labelNames: ['method', 'status', 'user_type'],
      registers: [this.options.register]
    });

    // Security events
    this.metrics.securityEvents = new client.Counter({
      name: `${this.options.prefix}security_events_total`,
      help: 'Total security events',
      labelNames: ['event_type', 'severity', 'source'],
      registers: [this.options.register]
    });

    // Token validity
    this.metrics.tokenValidity = new client.Histogram({
      name: `${this.options.prefix}token_validity_seconds`,
      help: 'Token validity duration',
      labelNames: ['token_type'],
      buckets: [300, 600, 1800, 3600, 7200, 14400, 28800, 86400],
      registers: [this.options.register]
    });

    // Rate limit violations
    this.metrics.rateLimitViolations = new client.Counter({
      name: `${this.options.prefix}rate_limit_violations_total`,
      help: 'Total rate limit violations',
      labelNames: ['endpoint', 'limit_type', 'client_id'],
      registers: [this.options.register]
    });
  }

  /**
   * Data quality metrics
   */
  _initializeDataQualityMetrics() {
    // Data validation failures
    this.metrics.dataValidationFailures = new client.Counter({
      name: `${this.options.prefix}data_validation_failures_total`,
      help: 'Total data validation failures',
      labelNames: ['validation_type', 'data_source'],
      registers: [this.options.register]
    });

    // Data completeness
    this.metrics.dataCompleteness = new client.Gauge({
      name: `${this.options.prefix}data_completeness_percentage`,
      help: 'Data completeness percentage',
      labelNames: ['dataset', 'field'],
      registers: [this.options.register]
    });

    // Data freshness
    this.metrics.dataFreshness = new client.Gauge({
      name: `${this.options.prefix}data_freshness_seconds`,
      help: 'Data freshness in seconds',
      labelNames: ['dataset', 'source'],
      registers: [this.options.register]
    });

    // Data anomalies
    this.metrics.dataAnomalies = new client.Counter({
      name: `${this.options.prefix}data_anomalies_detected_total`,
      help: 'Total data anomalies detected',
      labelNames: ['anomaly_type', 'dataset', 'severity'],
      registers: [this.options.register]
    });
  }

  /**
   * Track MCP connection
   */
  trackMCPConnection(transport, clientType, version, delta = 1) {
    this.metrics.mcpActiveConnections.inc({ transport, client_type: clientType, version }, delta);
  }

  /**
   * Track MCP message
   */
  trackMCPMessage(messageType, direction, status = 'success') {
    this.metrics.mcpMessagesProcessed.inc({ message_type: messageType, direction, status });
    return this.metrics.mcpMessageLatency.startTimer({ message_type: messageType, transport: 'default' });
  }

  /**
   * Track MCP tool invocation
   */
  trackMCPToolInvocation(toolName, clientType) {
    const timer = this.metrics.mcpToolExecutionTime.startTimer({ tool_name: toolName });
    return {
      success: () => {
        this.metrics.mcpToolInvocations.inc({ tool_name: toolName, status: 'success', client_type: clientType });
        timer();
      },
      error: () => {
        this.metrics.mcpToolInvocations.inc({ tool_name: toolName, status: 'error', client_type: clientType });
        timer();
      }
    };
  }

  /**
   * Update user metrics
   */
  updateUserMetrics(metrics) {
    if (metrics.dailyActiveUsers !== undefined) {
      Object.entries(metrics.dailyActiveUsers).forEach(([key, value]) => {
        const [userType, platform] = key.split(':');
        this.metrics.dailyActiveUsers.set({ user_type: userType, platform }, value);
      });
    }

    if (metrics.featureAdoption !== undefined) {
      Object.entries(metrics.featureAdoption).forEach(([feature, segments]) => {
        Object.entries(segments).forEach(([segment, rate]) => {
          this.metrics.featureAdoption.set({ feature, user_segment: segment }, rate);
        });
      });
    }
  }

  /**
   * Track revenue
   */
  trackRevenue(amount, product, plan, currency = 'USD', paymentMethod = 'card') {
    this.metrics.revenue.inc({ product, plan, currency, payment_method: paymentMethod }, amount);
  }

  /**
   * Update MRR
   */
  updateMRR(amount, product, plan, currency = 'USD') {
    this.metrics.mrr.set({ product, plan, currency }, amount);
  }

  /**
   * Track security event
   */
  trackSecurityEvent(eventType, severity = 'medium', source = 'system') {
    this.metrics.securityEvents.inc({ event_type: eventType, severity, source });
  }

  /**
   * Track authentication
   */
  trackAuthentication(method, success, userType = 'user') {
    this.metrics.authAttempts.inc({ 
      method, 
      status: success ? 'success' : 'failed', 
      user_type: userType 
    });
  }

  /**
   * Update SLA metrics
   */
  updateSLAMetrics(endpoint, metrics) {
    if (metrics.availability !== undefined) {
      this.metrics.apiAvailability.set({ endpoint, region: 'global' }, metrics.availability);
    }

    if (metrics.percentiles) {
      Object.entries(metrics.percentiles).forEach(([percentile, value]) => {
        this.metrics.responseTimePercentile.set({ endpoint, percentile }, value);
      });
    }

    if (metrics.errorBudget !== undefined) {
      this.metrics.errorBudgetRemaining.set({ service: endpoint, slo_type: 'availability' }, metrics.errorBudget);
    }
  }

  /**
   * Get all metric values
   */
  async getMetricValues() {
    const values = {};
    
    for (const [name, metric] of Object.entries(this.metrics)) {
      const metricObject = await this.options.register.getSingleMetricAsString(metric.name);
      values[name] = metricObject;
    }
    
    return values;
  }

  /**
   * Reset all metrics
   */
  reset() {
    Object.values(this.metrics).forEach(metric => {
      if (metric.reset) metric.reset();
    });
  }
}

module.exports = CustomMetrics;