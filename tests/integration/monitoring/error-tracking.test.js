const SentryIntegration = require('../../../monitoring/errors/sentry-integration');
const ErrorBoundaries = require('../../../monitoring/errors/error-boundaries');
const AlertRouter = require('../../../monitoring/errors/alert-router');
const ErrorTracker = require('../../../monitoring/errors/error-tracker');
const Logger = require('../../../monitoring/logging/logger');
const PrometheusExporter = require('../../../monitoring/metrics/prometheus-exporter');
const express = require('express');
const request = require('supertest');

// Mock Sentry to prevent actual API calls
jest.mock('@sentry/node', () => ({
  init: jest.fn(),
  captureException: jest.fn().mockReturnValue('mock-event-id'),
  captureMessage: jest.fn().mockReturnValue('mock-event-id'),
  setUser: jest.fn(),
  setContext: jest.fn(),
  addBreadcrumb: jest.fn(),
  configureScope: jest.fn(),
  withScope: jest.fn((callback) => callback({
    setContext: jest.fn(),
    setTag: jest.fn(),
    setLevel: jest.fn()
  })),
  startTransaction: jest.fn().mockReturnValue({
    startChild: jest.fn().mockReturnValue({
      finish: jest.fn()
    }),
    finish: jest.fn()
  }),
  Handlers: {
    requestHandler: jest.fn().mockReturnValue((req, res, next) => next()),
    errorHandler: jest.fn().mockReturnValue((err, req, res, next) => next(err))
  }
}));

jest.mock('@sentry/profiling-node', () => ({
  ProfilingIntegration: jest.fn()
}));

describe('Error Tracking Integration', () => {
  let app;
  let sentryIntegration;
  let errorBoundaries;
  let alertRouter;
  let errorTracker;
  let logger;
  let prometheusExporter;
  let alertEvents;

  beforeEach(() => {
    alertEvents = [];
    
    // Initialize components
    logger = new Logger({
      namespace: 'error-tracking-test'
    });

    prometheusExporter = new PrometheusExporter({
      prefix: 'test_'
    });

    alertRouter = new AlertRouter({
      defaultChannel: 'test',
      deduplicationWindow: 1000
    });

    // Add test channel to capture alerts
    alertRouter.addChannel('test', {
      send: async (alert) => {
        alertEvents.push(alert);
        return { success: true };
      }
    });

    sentryIntegration = new SentryIntegration({
      dsn: 'https://test@sentry.io/123456',
      environment: 'test',
      sampleRate: 1.0
    });

    errorBoundaries = new ErrorBoundaries({
      logger,
      metrics: prometheusExporter.getExporter('errors'),
      alertRouter,
      errorThreshold: 3
    });

    errorTracker = new ErrorTracker({
      sentryIntegration,
      errorBoundaries,
      alertRouter,
      logger
    });

    // Initialize all components
    sentryIntegration.initialize();
    errorTracker.initialize();

    // Create Express app
    app = express();
    app.use(express.json());
    
    // Add Sentry middleware
    app.use(sentryIntegration.requestHandler());
    
    // Add error boundary wrapper for routes
    const wrapRoute = (handler) => {
      return errorBoundaries.wrap(handler, 'http-route');
    };

    // Test routes
    app.get('/success', wrapRoute((req, res) => {
      res.json({ status: 'ok' });
    }));

    app.get('/error/sync', wrapRoute((req, res) => {
      throw new Error('Synchronous error');
    }));

    app.get('/error/async', wrapRoute(async (req, res) => {
      await new Promise(resolve => setTimeout(resolve, 10));
      throw new Error('Asynchronous error');
    }));

    app.get('/error/custom', wrapRoute((req, res) => {
      const error = new Error('Custom error with context');
      error.statusCode = 400;
      error.context = {
        userId: req.query.userId,
        action: 'custom_action'
      };
      throw error;
    }));

    app.get('/error/critical', wrapRoute((req, res) => {
      const error = new Error('Critical system failure');
      error.severity = 'critical';
      error.alert = true;
      throw error;
    }));

    // Sentry error handler
    app.use(sentryIntegration.errorHandler());

    // Global error handler
    app.use((err, req, res, next) => {
      errorTracker.captureError(err, {
        request: {
          method: req.method,
          url: req.url,
          headers: req.headers
        }
      });

      res.status(err.statusCode || 500).json({
        error: err.message,
        eventId: err.eventId
      });
    });
  });

  afterEach(() => {
    alertEvents = [];
    if (alertRouter.cleanupInterval) {
      clearInterval(alertRouter.cleanupInterval);
    }
  });

  describe('Error Capture and Tracking', () => {
    it('should capture and track synchronous errors', async () => {
      const response = await request(app)
        .get('/error/sync')
        .expect(500);

      expect(response.body.error).toBe('Synchronous error');
      expect(response.body.eventId).toBeDefined();

      // Verify Sentry was called
      const Sentry = require('@sentry/node');
      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Synchronous error'
        }),
        expect.any(Object)
      );

      // Verify error was logged
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('error'),
        expect.objectContaining({
          message: 'Synchronous error'
        })
      );
    });

    it('should capture and track asynchronous errors', async () => {
      const response = await request(app)
        .get('/error/async')
        .expect(500);

      expect(response.body.error).toBe('Asynchronous error');
      
      const Sentry = require('@sentry/node');
      expect(Sentry.captureException).toHaveBeenCalled();
    });

    it('should preserve error context', async () => {
      const response = await request(app)
        .get('/error/custom?userId=123')
        .expect(400);

      expect(response.body.error).toBe('Custom error with context');

      const Sentry = require('@sentry/node');
      expect(Sentry.withScope).toHaveBeenCalled();
      
      // Verify context was set
      const scopeMock = Sentry.withScope.mock.calls[0][0];
      const mockScope = {
        setContext: jest.fn(),
        setTag: jest.fn(),
        setLevel: jest.fn()
      };
      scopeMock(mockScope);
      
      expect(mockScope.setContext).toHaveBeenCalledWith('error', expect.objectContaining({
        userId: '123',
        action: 'custom_action'
      }));
    });
  });

  describe('Error Boundaries', () => {
    it('should catch errors within boundaries', async () => {
      let errorCaught = false;
      
      errorBoundaries.on('error', (event) => {
        errorCaught = true;
        expect(event.error.message).toContain('error');
        expect(event.boundary).toBe('http-route');
      });

      await request(app).get('/error/sync').expect(500);
      
      expect(errorCaught).toBe(true);
    });

    it('should trigger circuit breaker after threshold', async () => {
      // Create a dedicated boundary with circuit breaker
      const circuitBoundary = errorBoundaries.createBoundary('circuit-test', {
        errorThreshold: 2,
        circuitBreaker: true
      });

      let callCount = 0;
      const problematicFunction = circuitBoundary.wrap(() => {
        callCount++;
        throw new Error('Circuit test error');
      });

      // First two calls should execute and fail
      expect(() => problematicFunction()).toThrow('Circuit test error');
      expect(() => problematicFunction()).toThrow('Circuit test error');
      expect(callCount).toBe(2);

      // Third call should be blocked by circuit breaker
      expect(() => problematicFunction()).toThrow('Circuit breaker is open');
      expect(callCount).toBe(2); // Not incremented
    });

    it('should apply recovery strategies', async () => {
      let attempts = 0;
      const retryRoute = errorBoundaries.wrap(
        async (req, res) => {
          attempts++;
          if (attempts < 3) {
            throw new Error('Retry needed');
          }
          res.json({ attempts });
        },
        'retry-route',
        {
          recovery: {
            strategy: 'retry',
            maxAttempts: 3,
            delay: 10
          }
        }
      );

      app.get('/retry', retryRoute);

      const response = await request(app)
        .get('/retry')
        .expect(200);

      expect(response.body.attempts).toBe(3);
    });
  });

  describe('Alert Routing', () => {
    it('should route critical errors to alerts', async () => {
      await request(app)
        .get('/error/critical')
        .expect(500);

      // Wait for alert processing
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(alertEvents.length).toBeGreaterThan(0);
      const alert = alertEvents.find(a => a.title.includes('Critical system failure'));
      expect(alert).toBeDefined();
      expect(alert.severity).toBe('critical');
    });

    it('should deduplicate repeated errors', async () => {
      // Send same error multiple times
      for (let i = 0; i < 5; i++) {
        await request(app).get('/error/sync').expect(500);
      }

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should have fewer alerts than errors due to deduplication
      const syncErrorAlerts = alertEvents.filter(a => 
        a.title.includes('Synchronous error')
      );
      
      expect(syncErrorAlerts.length).toBeLessThan(5);
    });

    it('should aggregate errors within time window', async () => {
      // Configure aggregation rule
      alertRouter.addRule({
        name: 'Aggregate Errors',
        conditions: { severity: 'error' },
        actions: [{
          type: 'aggregate',
          window: 500 // 500ms window
        }]
      });

      // Send multiple errors quickly
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          request(app).get('/error/sync')
        );
      }
      
      await Promise.all(promises);
      await new Promise(resolve => setTimeout(resolve, 600));

      // Should have aggregated alerts
      const aggregatedAlerts = alertEvents.filter(a => 
        a.metadata && a.metadata.aggregated
      );
      
      expect(aggregatedAlerts.length).toBeGreaterThan(0);
    });
  });

  describe('Error Enrichment', () => {
    it('should enrich errors with request context', async () => {
      const response = await request(app)
        .get('/error/sync')
        .set('User-Agent', 'Test-Agent')
        .set('X-Request-ID', 'req-123')
        .expect(500);

      const Sentry = require('@sentry/node');
      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          tags: expect.any(Object),
          extra: expect.objectContaining({
            request: expect.objectContaining({
              method: 'GET',
              url: '/error/sync'
            })
          })
        })
      );
    });

    it('should add breadcrumbs for error context', async () => {
      // Make successful request first
      await request(app).get('/success').expect(200);
      
      // Then make error request
      await request(app).get('/error/sync').expect(500);

      const Sentry = require('@sentry/node');
      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          category: expect.any(String),
          level: expect.any(String)
        })
      );
    });
  });

  describe('Error Metrics', () => {
    it('should collect error metrics', async () => {
      // Generate various errors
      await request(app).get('/error/sync').expect(500);
      await request(app).get('/error/async').expect(500);
      await request(app).get('/error/custom?userId=123').expect(400);
      await request(app).get('/success').expect(200);

      // Get metrics
      const metrics = await prometheusExporter.register.metrics();

      expect(metrics).toContain('test_error_boundary_triggered_total');
      expect(metrics).toContain('error_type="Error"');
      expect(metrics).toContain('boundary="http-route"');
    });

    it('should track error rates', async () => {
      const startTime = Date.now();
      
      // Generate errors over time
      for (let i = 0; i < 20; i++) {
        if (i % 4 === 0) {
          await request(app).get('/error/sync');
        } else {
          await request(app).get('/success');
        }
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      const duration = (Date.now() - startTime) / 1000;
      const errorRate = 5 / duration; // 5 errors

      // Verify error rate metric exists
      const metrics = await prometheusExporter.register.metrics();
      expect(metrics).toContain('test_error_boundary_triggered_total');
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should continue processing after errors', async () => {
      // Cause an error
      await request(app).get('/error/sync').expect(500);
      
      // Subsequent requests should work
      const response = await request(app)
        .get('/success')
        .expect(200);
      
      expect(response.body.status).toBe('ok');
    });

    it('should handle error handler failures gracefully', async () => {
      // Mock Sentry to throw an error
      const Sentry = require('@sentry/node');
      Sentry.captureException.mockImplementationOnce(() => {
        throw new Error('Sentry failed');
      });

      // Should still return error response
      const response = await request(app)
        .get('/error/sync')
        .expect(500);
      
      expect(response.body.error).toBe('Synchronous error');
    });
  });

  describe('Error Reporting', () => {
    it('should generate error statistics', () => {
      // Generate some errors
      errorTracker.captureError(new Error('Test 1'));
      errorTracker.captureError(new Error('Test 2'));
      errorTracker.captureError(new TypeError('Type error'));

      const stats = errorTracker.getStatistics();
      
      expect(stats.totalErrors).toBeGreaterThanOrEqual(3);
      expect(stats.errorTypes).toHaveProperty('Error');
      expect(stats.errorTypes).toHaveProperty('TypeError');
      expect(stats.recentErrors).toBeDefined();
      expect(stats.recentErrors.length).toBeGreaterThan(0);
    });

    it('should track error trends', async () => {
      const errorCounts = [];
      
      // Simulate error spike
      for (let minute = 0; minute < 5; minute++) {
        const count = minute === 2 ? 10 : 2; // Spike at minute 2
        
        for (let i = 0; i < count; i++) {
          errorTracker.captureError(new Error(`Error at minute ${minute}`));
        }
        
        errorCounts.push({
          minute,
          count,
          total: errorTracker.getStatistics().totalErrors
        });
        
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Verify spike was captured
      expect(errorCounts[2].count).toBe(10);
      expect(errorCounts[2].total).toBeGreaterThan(errorCounts[1].total);
    });
  });

  describe('Error Context Preservation', () => {
    it('should maintain context through async operations', async () => {
      const context = {
        requestId: 'req-async-123',
        userId: 'user-456',
        tenantId: 'tenant-789'
      };

      // Set context
      errorTracker.setContext(context);

      // Simulate async operation
      await new Promise(resolve => setTimeout(resolve, 50));

      // Capture error
      const error = new Error('Async context error');
      errorTracker.captureError(error);

      const Sentry = require('@sentry/node');
      expect(Sentry.captureException).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          extra: expect.objectContaining(context)
        })
      );
    });
  });
});