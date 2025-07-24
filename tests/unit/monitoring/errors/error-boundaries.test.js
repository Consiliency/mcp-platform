const ErrorBoundaries = require('../../../../monitoring/errors/error-boundaries');
const EventEmitter = require('events');

describe('ErrorBoundaries', () => {
  let errorBoundaries;
  let mockLogger;
  let mockMetrics;
  let mockAlertRouter;

  beforeEach(() => {
    mockLogger = {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn()
    };

    mockMetrics = {
      increment: jest.fn(),
      gauge: jest.fn(),
      histogram: jest.fn()
    };

    mockAlertRouter = {
      route: jest.fn().mockResolvedValue({ success: true })
    };

    errorBoundaries = new ErrorBoundaries({
      logger: mockLogger,
      metrics: mockMetrics,
      alertRouter: mockAlertRouter,
      errorThreshold: 5,
      resetInterval: 60000
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const boundaries = new ErrorBoundaries();
      expect(boundaries.options.errorThreshold).toBe(10);
      expect(boundaries.options.resetInterval).toBe(300000);
      expect(boundaries.options.captureStackTrace).toBe(true);
    });

    it('should accept custom options', () => {
      expect(errorBoundaries.options.errorThreshold).toBe(5);
      expect(errorBoundaries.options.resetInterval).toBe(60000);
    });
  });

  describe('wrap', () => {
    it('should wrap synchronous functions', () => {
      const fn = jest.fn().mockReturnValue('result');
      const wrapped = errorBoundaries.wrap(fn, 'testFunction');

      const result = wrapped('arg1', 'arg2');

      expect(result).toBe('result');
      expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
    });

    it('should catch and handle synchronous errors', () => {
      const error = new Error('Test error');
      const fn = jest.fn().mockImplementation(() => {
        throw error;
      });

      const wrapped = errorBoundaries.wrap(fn, 'testFunction');
      const onError = jest.fn();
      errorBoundaries.on('error', onError);

      expect(() => wrapped()).toThrow('Test error');
      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockMetrics.increment).toHaveBeenCalledWith('error_boundary.triggered', {
        boundary: 'testFunction',
        error_type: 'Error'
      });
      expect(onError).toHaveBeenCalledWith({
        boundary: 'testFunction',
        error,
        context: {}
      });
    });

    it('should wrap async functions', async () => {
      const fn = jest.fn().mockResolvedValue('async result');
      const wrapped = errorBoundaries.wrap(fn, 'asyncFunction');

      const result = await wrapped();

      expect(result).toBe('async result');
    });

    it('should catch and handle async errors', async () => {
      const error = new Error('Async error');
      const fn = jest.fn().mockRejectedValue(error);

      const wrapped = errorBoundaries.wrap(fn, 'asyncFunction');

      await expect(wrapped()).rejects.toThrow('Async error');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should pass context to error handlers', () => {
      const error = new Error('Context error');
      const fn = jest.fn().mockImplementation(() => {
        throw error;
      });

      const context = { userId: 123, requestId: 'req-456' };
      const wrapped = errorBoundaries.wrap(fn, 'contextFunction', { context });

      expect(() => wrapped()).toThrow();
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error caught in boundary: contextFunction',
        expect.objectContaining({
          boundary: 'contextFunction',
          error: error.message,
          context
        })
      );
    });
  });

  describe('wrapClass', () => {
    it('should wrap all methods of a class', () => {
      class TestClass {
        method1() {
          return 'method1';
        }

        method2() {
          throw new Error('Method2 error');
        }

        async asyncMethod() {
          return 'async';
        }
      }

      const WrappedClass = errorBoundaries.wrapClass(TestClass, 'TestClass');
      const instance = new WrappedClass();

      expect(instance.method1()).toBe('method1');
      expect(() => instance.method2()).toThrow('Method2 error');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should preserve class inheritance', () => {
      class BaseClass {
        baseMethod() {
          return 'base';
        }
      }

      class DerivedClass extends BaseClass {
        derivedMethod() {
          return 'derived';
        }
      }

      const WrappedClass = errorBoundaries.wrapClass(DerivedClass, 'DerivedClass');
      const instance = new WrappedClass();

      expect(instance).toBeInstanceOf(BaseClass);
      expect(instance.baseMethod()).toBe('base');
      expect(instance.derivedMethod()).toBe('derived');
    });

    it('should not wrap constructor', () => {
      let constructorCalled = false;
      
      class TestClass {
        constructor() {
          constructorCalled = true;
          throw new Error('Constructor error');
        }
      }

      const WrappedClass = errorBoundaries.wrapClass(TestClass, 'TestClass');
      
      expect(() => new WrappedClass()).toThrow('Constructor error');
      expect(constructorCalled).toBe(true);
      expect(mockLogger.error).not.toHaveBeenCalled();
    });
  });

  describe('wrapAsync', () => {
    it('should handle promise rejection', async () => {
      const promise = Promise.reject(new Error('Promise error'));
      
      await expect(
        errorBoundaries.wrapAsync(promise, 'promiseOperation')
      ).rejects.toThrow('Promise error');

      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockMetrics.increment).toHaveBeenCalledWith('error_boundary.triggered', {
        boundary: 'promiseOperation',
        error_type: 'Error'
      });
    });

    it('should pass through resolved promises', async () => {
      const promise = Promise.resolve('success');
      
      const result = await errorBoundaries.wrapAsync(promise, 'promiseOperation');
      
      expect(result).toBe('success');
      expect(mockLogger.error).not.toHaveBeenCalled();
    });
  });

  describe('createBoundary', () => {
    it('should create isolated error boundary', () => {
      const boundary = errorBoundaries.createBoundary('isolated', {
        errorThreshold: 3,
        onError: jest.fn()
      });

      const fn = jest.fn().mockImplementation(() => {
        throw new Error('Boundary error');
      });

      const wrapped = boundary.wrap(fn);

      // Trigger errors up to threshold
      for (let i = 0; i < 3; i++) {
        expect(() => wrapped()).toThrow();
      }

      expect(boundary.getState().errorCount).toBe(3);
      expect(boundary.getState().isOpen).toBe(false);
    });

    it('should open circuit after threshold', () => {
      const boundary = errorBoundaries.createBoundary('circuit', {
        errorThreshold: 2,
        circuitBreaker: true
      });

      const fn = jest.fn().mockImplementation(() => {
        throw new Error('Circuit error');
      });

      const wrapped = boundary.wrap(fn);

      // Trigger errors to open circuit
      expect(() => wrapped()).toThrow();
      expect(() => wrapped()).toThrow();

      // Circuit should be open
      expect(() => wrapped()).toThrow('Circuit breaker is open');
      expect(fn).toHaveBeenCalledTimes(2); // Not called on third attempt
    });

    it('should reset circuit after timeout', async () => {
      jest.useFakeTimers();
      
      const boundary = errorBoundaries.createBoundary('resetCircuit', {
        errorThreshold: 1,
        circuitBreaker: true,
        resetInterval: 1000
      });

      const fn = jest.fn()
        .mockImplementationOnce(() => { throw new Error('Error'); })
        .mockImplementationOnce(() => 'success');

      const wrapped = boundary.wrap(fn);

      // Open circuit
      expect(() => wrapped()).toThrow('Error');
      expect(() => wrapped()).toThrow('Circuit breaker is open');

      // Wait for reset
      jest.advanceTimersByTime(1000);

      // Circuit should be half-open, allowing one attempt
      expect(wrapped()).toBe('success');
      expect(boundary.getState().isOpen).toBe(false);

      jest.useRealTimers();
    });
  });

  describe('error recovery strategies', () => {
    it('should apply retry strategy', async () => {
      let attempts = 0;
      const fn = jest.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Retry error');
        }
        return 'success';
      });

      const wrapped = errorBoundaries.wrap(fn, 'retryFunction', {
        recovery: {
          strategy: 'retry',
          maxAttempts: 3,
          delay: 100
        }
      });

      const result = await wrapped();
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should apply fallback strategy', () => {
      const fn = jest.fn().mockImplementation(() => {
        throw new Error('Fallback error');
      });

      const fallback = jest.fn().mockReturnValue('fallback result');

      const wrapped = errorBoundaries.wrap(fn, 'fallbackFunction', {
        recovery: {
          strategy: 'fallback',
          fallbackFn: fallback
        }
      });

      const result = wrapped();
      
      expect(result).toBe('fallback result');
      expect(fallback).toHaveBeenCalled();
    });

    it('should apply cache strategy', () => {
      const fn = jest.fn()
        .mockReturnValueOnce('cached value')
        .mockImplementation(() => {
          throw new Error('Cache error');
        });

      const wrapped = errorBoundaries.wrap(fn, 'cacheFunction', {
        recovery: {
          strategy: 'cache',
          cacheKey: 'test-key'
        }
      });

      // First call succeeds and caches result
      expect(wrapped()).toBe('cached value');

      // Second call fails but returns cached value
      expect(wrapped()).toBe('cached value');
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('error filtering', () => {
    it('should filter errors by type', () => {
      class CustomError extends Error {}
      
      const boundary = errorBoundaries.createBoundary('filtered', {
        errorFilter: (error) => error instanceof CustomError
      });

      const fn1 = jest.fn().mockImplementation(() => {
        throw new Error('Regular error');
      });

      const fn2 = jest.fn().mockImplementation(() => {
        throw new CustomError('Custom error');
      });

      const wrapped1 = boundary.wrap(fn1);
      const wrapped2 = boundary.wrap(fn2);

      expect(() => wrapped1()).toThrow('Regular error');
      expect(mockLogger.error).not.toHaveBeenCalled();

      expect(() => wrapped2()).toThrow('Custom error');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should filter errors by message pattern', () => {
      const boundary = errorBoundaries.createBoundary('pattern', {
        errorFilter: (error) => /critical/i.test(error.message)
      });

      const fn = jest.fn().mockImplementation(() => {
        throw new Error('Critical system error');
      });

      const wrapped = boundary.wrap(fn);

      expect(() => wrapped()).toThrow();
      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockAlertRouter.route).toHaveBeenCalled();
    });
  });

  describe('alerting', () => {
    it('should trigger alerts for critical errors', async () => {
      const error = new Error('Critical error');
      error.severity = 'critical';

      const fn = jest.fn().mockImplementation(() => {
        throw error;
      });

      const wrapped = errorBoundaries.wrap(fn, 'criticalFunction', {
        alertOnError: true
      });

      expect(() => wrapped()).toThrow();

      expect(mockAlertRouter.route).toHaveBeenCalledWith({
        severity: 'error',
        title: 'Error Boundary Triggered: criticalFunction',
        description: 'Critical error',
        source: 'error-boundaries',
        tags: {
          boundary: 'criticalFunction',
          error_type: 'Error'
        },
        metadata: expect.any(Object)
      });
    });

    it('should respect alert threshold', () => {
      const fn = jest.fn().mockImplementation(() => {
        throw new Error('Threshold error');
      });

      const boundary = errorBoundaries.createBoundary('threshold', {
        alertThreshold: 3,
        alertOnError: true
      });

      const wrapped = boundary.wrap(fn);

      // First two errors shouldn't trigger alert
      expect(() => wrapped()).toThrow();
      expect(() => wrapped()).toThrow();
      expect(mockAlertRouter.route).not.toHaveBeenCalled();

      // Third error should trigger alert
      expect(() => wrapped()).toThrow();
      expect(mockAlertRouter.route).toHaveBeenCalled();
    });
  });

  describe('metrics', () => {
    it('should collect error metrics', () => {
      const fn = jest.fn().mockImplementation(() => {
        throw new Error('Metric error');
      });

      const wrapped = errorBoundaries.wrap(fn, 'metricFunction');

      expect(() => wrapped()).toThrow();

      expect(mockMetrics.increment).toHaveBeenCalledWith('error_boundary.triggered', {
        boundary: 'metricFunction',
        error_type: 'Error'
      });

      expect(mockMetrics.gauge).toHaveBeenCalledWith(
        'error_boundary.error_count',
        1,
        { boundary: 'metricFunction' }
      );
    });

    it('should track recovery success', async () => {
      let attempts = 0;
      const fn = jest.fn().mockImplementation(() => {
        attempts++;
        if (attempts === 1) {
          throw new Error('Recovery error');
        }
        return 'recovered';
      });

      const wrapped = errorBoundaries.wrap(fn, 'recoveryFunction', {
        recovery: {
          strategy: 'retry',
          maxAttempts: 2
        }
      });

      const result = await wrapped();

      expect(result).toBe('recovered');
      expect(mockMetrics.increment).toHaveBeenCalledWith('error_boundary.recovery_success', {
        boundary: 'recoveryFunction',
        strategy: 'retry'
      });
    });
  });

  describe('getStatistics', () => {
    it('should return boundary statistics', () => {
      const fn = jest.fn().mockImplementation(() => {
        throw new Error('Stats error');
      });

      const wrapped = errorBoundaries.wrap(fn, 'statsFunction');

      // Generate some errors
      for (let i = 0; i < 3; i++) {
        try { wrapped(); } catch (e) {}
      }

      const stats = errorBoundaries.getStatistics();

      expect(stats.totalErrors).toBe(3);
      expect(stats.boundaries.statsFunction).toBeDefined();
      expect(stats.boundaries.statsFunction.errorCount).toBe(3);
      expect(stats.boundaries.statsFunction.lastError).toBeDefined();
    });

    it('should track error types', () => {
      class CustomError extends Error {}

      const fn1 = () => { throw new Error('Regular'); };
      const fn2 = () => { throw new CustomError('Custom'); };

      const wrapped1 = errorBoundaries.wrap(fn1, 'fn1');
      const wrapped2 = errorBoundaries.wrap(fn2, 'fn2');

      try { wrapped1(); } catch (e) {}
      try { wrapped2(); } catch (e) {}

      const stats = errorBoundaries.getStatistics();

      expect(stats.errorTypes.Error).toBe(1);
      expect(stats.errorTypes.CustomError).toBe(1);
    });
  });
});