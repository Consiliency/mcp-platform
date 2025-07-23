// Test: Production Deployment Integration
// Components involved: All Phase 6 interfaces working together
// Expected behavior: Full production stack should work seamlessly

const SecurityAPIInterface = require('../../../interfaces/phase6/security-api.interface');
const RateLimiterInterface = require('../../../interfaces/phase6/rate-limiter.interface');
const HealthMonitorInterface = require('../../../interfaces/phase6/health-monitor.interface');
const LoggerInterface = require('../../../interfaces/phase6/logger.interface');
const MetricsInterface = require('../../../interfaces/phase6/metrics.interface');
const ErrorTrackerInterface = require('../../../interfaces/phase6/error-tracker.interface');

describe('Production Deployment Integration', () => {
  let security, rateLimiter, health, logger, metrics, errors;

  beforeEach(() => {
    // Initialize all production components
    security = new SecurityAPIInterface({ 
      jwtSecret: process.env.JWT_SECRET || 'test-secret',
      tokenExpiry: 3600 
    });
    
    rateLimiter = new RateLimiterInterface({ 
      storage: 'redis',
      defaultLimits: { api: 100, auth: 5 }
    });
    
    health = new HealthMonitorInterface({ 
      services: ['api', 'database', 'cache', 'queue'],
      checkInterval: 30000 
    });
    
    logger = new LoggerInterface({ 
      level: 'info',
      format: 'json',
      transports: ['console', 'file'] 
    });
    
    metrics = new MetricsInterface({ 
      prefix: 'mcp_prod_',
      defaultLabels: { app: 'mcp-platform' }
    });
    
    errors = new ErrorTrackerInterface({ 
      environment: 'production',
      sampleRate: 1.0 
    });
  });

  test('Production startup sequence', async () => {
    // 1. Health checks during startup
    const startupStatus = await health.startupProbe();
    expect(startupStatus.started).toBe(false);
    expect(startupStatus.pending).toContain('database');

    // 2. Initialize security
    const apiKey = await security.generateAPIKey('system', ['admin']);
    expect(apiKey.apiKey).toBeDefined();

    // 3. Set up rate limiting rules
    await rateLimiter.setRule('api-calls', { 
      limit: 1000, 
      window: 3600000 
    });
    await rateLimiter.setRule('auth-attempts', { 
      limit: 5, 
      window: 900000,
      blockDuration: 3600000 
    });

    // 4. Start metrics collection
    metrics.collectDefaultMetrics({ prefix: 'mcp_prod_' });

    // 5. Configure error alerts
    await errors.configureAlert({
      name: 'high-error-rate',
      conditions: { errorRate: { threshold: 0.05, window: 300 } },
      actions: [{ type: 'email', to: 'ops@example.com' }]
    });

    // 6. Log startup complete
    logger.info('Production system started', {
      version: process.env.APP_VERSION,
      environment: 'production'
    });

    // 7. Final health check
    const finalHealth = await health.readinessProbe();
    expect(finalHealth.ready).toBe(true);
  });

  test('Production request flow with all components', async () => {
    // Given a production request
    const requestId = 'prod-req-001';
    const userId = 'user-123';
    const clientIP = '203.0.113.1';

    // 1. Rate limit check
    const rateLimitStatus = await rateLimiter.checkLimit(clientIP, 'api-calls');
    expect(rateLimitStatus.allowed).toBe(true);

    // 2. Authentication
    const authToken = await security.generateToken({
      userId,
      roles: ['user'],
      permissions: ['read:profile']
    });
    expect(authToken.accessToken).toBeDefined();

    // 3. Start request tracking
    const requestLogger = logger.child({ requestId, userId });
    const transaction = errors.startTransaction('api-request', 'http.server');
    const requestTimer = metrics.createHistogram('http_request_duration', 'Request duration')
      .startTimer({ method: 'GET', endpoint: '/api/profile' });

    requestLogger.info('Request started', { 
      method: 'GET', 
      path: '/api/profile',
      ip: clientIP 
    });

    // 4. Process request (simulated)
    try {
      // Token validation
      const tokenValid = await security.verifyToken(authToken.accessToken);
      expect(tokenValid.valid).toBe(true);

      // Consume rate limit token
      await rateLimiter.consumeToken(clientIP, 'api-calls');

      // Simulate processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Success metrics
      requestTimer({ status: 200 });
      metrics.createCounter('requests_total', 'Total requests')
        .inc(1, { status: 200, endpoint: '/api/profile' });

      requestLogger.info('Request completed', { status: 200, duration: 100 });

    } catch (error) {
      // Error handling
      errors.captureException(error, {
        tags: { requestId, userId },
        user: { id: userId }
      });

      metrics.createCounter('errors_total', 'Total errors')
        .inc(1, { type: error.name });

      requestLogger.error('Request failed', error);
      requestTimer({ status: 500 });
    } finally {
      transaction.finish();
    }

    // 5. Verify observability
    const logs = await logger.query({ filter: { requestId } });
    expect(logs.logs.length).toBeGreaterThan(0);

    const metricsData = await metrics.getMetrics('prometheus');
    expect(metricsData).toContain('mcp_prod_http_request_duration');
  });

  test('Production monitoring and alerting', async () => {
    // Simulate production issues
    const errorRate = metrics.createCounter('errors_total', 'Total errors');
    const responseTime = metrics.createHistogram('response_time', 'Response time');

    // Generate high error rate
    for (let i = 0; i < 10; i++) {
      errorRate.inc(1, { type: 'timeout' });
      errors.captureMessage('Request timeout', 'error', {
        tags: { type: 'performance' }
      });
    }

    // Generate slow responses
    for (let i = 0; i < 5; i++) {
      responseTime.observe(5000, { endpoint: '/api/slow' });
    }

    // Check health degradation
    const health = await health.checkHealth();
    expect(health.status).toBe('degraded');

    // Verify metrics
    const metricsExport = await metrics.getMetrics('json');
    expect(metricsExport.errors_total).toBeGreaterThan(5);
  });

  test('Graceful shutdown sequence', async () => {
    // 1. Stop accepting new requests
    await rateLimiter.setRule('api-calls', { limit: 0, window: 1 });

    // 2. Log shutdown initiated
    logger.warn('Graceful shutdown initiated');

    // 3. Wait for active requests (simulated)
    await new Promise(resolve => setTimeout(resolve, 100));

    // 4. Final metrics push
    await metrics.pushMetrics('mcp-platform', { instance: 'prod-1' });

    // 5. Final health status
    const finalHealth = await health.livenessProbe();
    expect(finalHealth.alive).toBe(true);

    // 6. Log shutdown complete
    logger.info('Graceful shutdown complete');
  });
});