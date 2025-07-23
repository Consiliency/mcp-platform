# MCP Observability Components

This directory contains the observability implementation for the Model Context Protocol (MCP) platform, providing comprehensive logging, metrics collection, and error tracking capabilities.

## Components

### 1. Logger (logging/)
Winston-based structured logging with support for:
- Multiple log levels (debug, info, warn, error)
- JSON and simple formats
- Daily log rotation
- Request correlation IDs
- Child loggers for context isolation
- Performance timing
- Express/Koa middleware support
- Log querying capabilities

### 2. Metrics (metrics/)
Prometheus-compatible metrics collection using prom-client:
- Counter, Gauge, Histogram, and Summary metric types
- Default Node.js metrics collection
- HTTP request metrics middleware
- Metrics export in Prometheus and JSON formats
- Push gateway support for batch jobs
- Configurable metric prefixes and labels

### 3. Error Tracker (errors/)
Sentry-style error tracking and monitoring:
- Exception and message capture with context
- Breadcrumb support for debugging
- User and request context tracking
- Performance transaction monitoring
- Alert rule configuration
- Error sampling control
- Express/Koa error handling middleware

## Usage

### Logger Example
```javascript
const Logger = require('./logging');

const logger = new Logger({
  level: 'info',
  format: 'json',
  logDirectory: './logs'
});

// Basic logging
logger.info('Application started', { version: '1.0.0' });
logger.error('Database connection failed', error, { retries: 3 });

// Child logger with request context
const requestLogger = logger.child({ requestId: 'req-123', userId: 'user-456' });
requestLogger.info('Processing payment');

// Performance timing
const timer = logger.startTimer('database-query');
// ... perform operation ...
timer.end({ query: 'SELECT * FROM users' });

// Express middleware
app.use(logger.createRequestLogger({ includeHeaders: true }));
```

### Metrics Example
```javascript
const Metrics = require('./metrics');

const metrics = new Metrics({
  prefix: 'mcp_',
  defaultLabels: { service: 'api' }
});

// Create metrics
const httpRequests = metrics.createCounter('http_requests_total', 'Total HTTP requests', ['method', 'status']);
const activeConnections = metrics.createGauge('active_connections', 'Active WebSocket connections');
const responseTime = metrics.createHistogram('response_time_seconds', 'Response time in seconds', [0.1, 0.5, 1, 2, 5]);

// Use metrics
httpRequests.inc(1, { method: 'GET', status: '200' });
activeConnections.set(42);

const timer = responseTime.startTimer({ endpoint: '/api/users' });
// ... handle request ...
timer(); // Stop timer and record

// Express middleware
app.use(metrics.createHTTPMetricsMiddleware());

// Metrics endpoint
app.use(metrics.createMetricsEndpoint({ path: '/metrics' }));
```

### Error Tracker Example
```javascript
const ErrorTracker = require('./errors');

const errorTracker = new ErrorTracker({
  environment: 'production',
  release: '1.0.0',
  sampleRate: 1.0
});

// Set context
errorTracker.setUser({ id: 'user-123', email: 'user@example.com' });
errorTracker.setTag('component', 'payment-processor');

// Capture errors
try {
  // ... risky operation ...
} catch (error) {
  const { eventId } = errorTracker.captureException(error, {
    tags: { severity: 'high' },
    extra: { orderData: order }
  });
  console.error(`Error captured: ${eventId}`);
}

// Add breadcrumbs
errorTracker.addBreadcrumb({
  message: 'User initiated checkout',
  category: 'user-action',
  data: { cartTotal: 99.99 }
});

// Performance monitoring
const transaction = errorTracker.startTransaction('checkout', 'http.server');
// ... process checkout ...
transaction.setTag('payment.method', 'credit-card');
transaction.finish();

// Express middleware
app.use(errorTracker.createRequestHandler());
app.use(errorTracker.createErrorHandler({ showStack: false }));
```

## Grafana Dashboards

The `dashboards/` directory contains pre-configured Grafana dashboards:

1. **mcp-overview.json** - Overall system health dashboard
   - Request rate gauge
   - Error rate percentage
   - Response time (95th percentile)
   - Memory and CPU usage

2. **mcp-errors.json** - Error tracking dashboard
   - Total error count
   - Error rate by type
   - Errors by severity
   - Top error endpoints
   - Error timeline

3. **mcp-alerts.json** - Prometheus alert rules
   - High error rate (>5% for 5 minutes)
   - High response time (>2s for 5 minutes)
   - High memory usage (>1GB for 10 minutes)
   - Service down (>1 minute)
   - High CPU usage (>80% for 5 minutes)
   - Low disk space (<10% for 5 minutes)

## Integration

All components are designed to work together seamlessly:

```javascript
// Correlated logging and metrics
const requestId = 'req-123';
const childLogger = logger.child({ requestId });
const timer = metrics.createHistogram('operation_duration', 'Operation duration').startTimer();

childLogger.info('Starting operation');

try {
  // ... perform operation ...
  timer({ status: 'success' });
  childLogger.info('Operation completed');
} catch (error) {
  timer({ status: 'error' });
  childLogger.error('Operation failed', error);
  errorTracker.captureException(error, { tags: { requestId } });
}
```

## Configuration

All components support extensive configuration options:

### Logger Configuration
- `level`: Minimum log level (debug, info, warn, error)
- `format`: Log format (json, simple)
- `transports`: Array of transport configurations
- `metadata`: Default metadata for all logs
- `logDirectory`: Directory for log files

### Metrics Configuration
- `prefix`: Prefix for all metric names
- `defaultLabels`: Labels applied to all metrics
- `pushGateway`: URL for Prometheus push gateway

### Error Tracker Configuration
- `dsn`: Data Source Name for external service
- `environment`: Environment name (development, production)
- `release`: Application version
- `sampleRate`: Error sampling rate (0.0 to 1.0)
- `maxBreadcrumbs`: Maximum breadcrumbs to keep

## Testing

Unit tests are provided for all components:
```bash
npm test -- tests/unit/monitoring/
```

Integration tests verify component interaction:
```bash
npm test -- tests/integration/phase6/observability-integration.test.js
```