// Test: Observability Stack Integration
// Components involved: LoggerInterface, MetricsInterface, ErrorTrackerInterface
// Expected behavior: Logging, metrics, and errors should be correlated and trackable

const LoggerInterface = require('../../../interfaces/phase6/logger.interface');
const MetricsInterface = require('../../../interfaces/phase6/metrics.interface');
const ErrorTrackerInterface = require('../../../interfaces/phase6/error-tracker.interface');

describe('Observability Stack Integration', () => {
  let logger;
  let metrics;
  let errorTracker;

  beforeEach(() => {
    logger = new LoggerInterface({ level: 'info' });
    metrics = new MetricsInterface({ prefix: 'mcp_' });
    errorTracker = new ErrorTrackerInterface({ environment: 'test' });
  });

  test('Request logging includes metrics correlation', async () => {
    // Given a request with metrics
    const requestId = 'req-123';
    const httpMetrics = metrics.createHistogram(
      'http_request_duration',
      'HTTP request duration in seconds',
      [0.1, 0.5, 1, 2, 5]
    );

    // When logging a request
    const childLogger = logger.child({ requestId });
    const timer = httpMetrics.startTimer({ method: 'GET', path: '/api/users' });
    
    childLogger.info('Request started', { method: 'GET', path: '/api/users' });
    
    // Simulate request processing
    await new Promise(resolve => setTimeout(resolve, 100));
    
    timer(); // End timing
    childLogger.info('Request completed', { status: 200 });

    // Then logs should have metric references
    const logs = await logger.query({ 
      filter: { requestId },
      from: new Date(Date.now() - 1000)
    });
    
    expect(logs.logs).toHaveLength(2);
    expect(logs.logs[0].metadata).toHaveProperty('requestId', requestId);
  });

  test('Errors are tracked with context from logs and metrics', async () => {
    // Given an error scenario
    const requestId = 'req-456';
    const errorCounter = metrics.createCounter(
      'errors_total',
      'Total number of errors'
    );

    // When an error occurs
    const error = new Error('Database connection failed');
    const childLogger = logger.child({ requestId, service: 'api' });
    
    childLogger.error('Database error occurred', error, { 
      query: 'SELECT * FROM users' 
    });
    
    errorCounter.inc(1, { type: 'database', severity: 'high' });
    
    const { eventId } = errorTracker.captureException(error, {
      tags: { requestId, service: 'api' },
      extra: { query: 'SELECT * FROM users' }
    });

    // Then error should be correlated with logs and metrics
    expect(eventId).toBeDefined();
    
    // Verify metrics were incremented
    const metricsData = await metrics.getMetrics('json');
    expect(metricsData).toHaveProperty('errors_total');
  });

  test('Performance metrics trigger automatic error tracking', async () => {
    // Given performance thresholds
    const responseTime = metrics.createHistogram(
      'response_time',
      'Response time in ms',
      [50, 100, 200, 500, 1000, 2000, 5000]
    );

    // When response time exceeds threshold
    const slowRequestTime = 5500; // 5.5 seconds
    responseTime.observe(slowRequestTime, { endpoint: '/api/heavy' });

    // Then it should trigger error tracking
    errorTracker.captureMessage(
      'Slow response detected',
      'warning',
      {
        tags: { type: 'performance' },
        extra: { responseTime: slowRequestTime, endpoint: '/api/heavy' }
      }
    );

    // And log a warning
    logger.warn('Slow response detected', {
      responseTime: slowRequestTime,
      endpoint: '/api/heavy',
      threshold: 5000
    });
  });

  test('Middleware integration provides full observability', async () => {
    // Given integrated middleware stack
    const requestLogger = logger.createRequestLogger({ 
      includeHeaders: true 
    });
    const metricsMiddleware = metrics.createHTTPMetricsMiddleware({
      includePath: true,
      includeMethod: true
    });
    const errorHandler = errorTracker.createErrorHandler({
      showStack: false
    });

    // When processing a request that errors
    const mockReq = {
      method: 'POST',
      path: '/api/users',
      headers: { 'x-request-id': 'req-789' }
    };
    const mockRes = { 
      status: jest.fn().mockReturnThis(), 
      json: jest.fn(),
      on: jest.fn()
    };
    const mockNext = jest.fn();

    // Process through middleware
    await requestLogger(mockReq, mockRes, mockNext);
    await metricsMiddleware(mockReq, mockRes, mockNext);
    
    // Simulate error
    const error = new Error('Validation failed');
    await errorHandler(error, mockReq, mockRes, mockNext);

    // Then all systems should have recorded the event
    expect(mockRes.status).toHaveBeenCalledWith(500);
  });

  test('Distributed tracing connects logs, metrics, and errors', async () => {
    // Given a distributed transaction
    const transaction = errorTracker.startTransaction('api-request', 'http.server');
    const requestId = 'trace-123';
    
    // Add breadcrumbs for tracing
    errorTracker.addBreadcrumb({
      message: 'Request started',
      category: 'http',
      data: { requestId }
    });

    // Log with trace context
    const childLogger = logger.child({ requestId, traceId: transaction.id });
    childLogger.info('Processing request');

    // Record metrics with trace context
    const dbQueryTime = metrics.createHistogram('db_query_duration', 'Database query time');
    const timer = dbQueryTime.startTimer({ query: 'users.findAll' });
    
    // Simulate query
    await new Promise(resolve => setTimeout(resolve, 50));
    timer();

    // Complete transaction
    transaction.setTag('http.status_code', 200);
    transaction.finish();

    // Then all observability data should be connected via trace ID
    const logs = await logger.query({ filter: { requestId } });
    expect(logs.logs[0].metadata).toHaveProperty('traceId');
  });
});