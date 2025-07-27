const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');
const CircuitBreaker = require('../../src/error-recovery/circuit-breaker');
const RetryStrategy = require('../../src/error-recovery/retry-strategy');
const GracefulDegradation = require('../../src/error-recovery/graceful-degradation');
const FaultTolerance = require('../../src/error-recovery/fault-tolerance');

/**
 * Chaos Engineering Tests (STABILITY-8.2)
 * Tests system behavior under failure conditions
 */
describe('Chaos Engineering Tests', () => {
  let circuitBreaker;
  let retryStrategy;
  let gracefulDegradation;
  let faultTolerance;
  
  beforeEach(() => {
    circuitBreaker = new CircuitBreaker({ name: 'test-service' });
    retryStrategy = new RetryStrategy({ maxRetries: 2, baseDelay: 100 });
    gracefulDegradation = new GracefulDegradation();
    faultTolerance = new FaultTolerance();
  });
  
  afterEach(() => {
    if (faultTolerance) {
      faultTolerance.stop();
    }
  });
  
  describe('Network Chaos', () => {
    test('should handle network partitions', async () => {
      let networkPartitioned = false;
      let requestCount = 0;
      
      // Simulate a service that fails when network is partitioned
      const service = async () => {
        requestCount++;
        if (networkPartitioned) {
          const error = new Error('Network partition detected');
          error.code = 'ENETUNREACH';
          throw error;
        }
        return { status: 'ok', requestCount };
      };
      
      // Test normal operation
      const result1 = await circuitBreaker.execute(service);
      expect(result1.status).toBe('ok');
      expect(result1.requestCount).toBe(1);
      
      // Simulate network partition
      networkPartitioned = true;
      
      // Circuit should open after threshold failures
      for (let i = 0; i < 5; i++) {
        await expect(circuitBreaker.execute(service)).rejects.toThrow();
      }
      
      expect(circuitBreaker.state).toBe('OPEN');
      
      // Further requests should be rejected immediately
      await expect(circuitBreaker.execute(service)).rejects.toThrow('Circuit breaker test-service is OPEN');
      
      // Simulate network recovery
      networkPartitioned = false;
      
      // Wait for circuit to transition to half-open
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Manually transition to half-open for testing
      circuitBreaker.halfOpen();
      
      // Circuit should close after successful request
      const result2 = await circuitBreaker.execute(service);
      expect(result2.status).toBe('ok');
      expect(circuitBreaker.state).toBe('CLOSED');
    });
    
    test('should handle high latency with retry', async () => {
      let latencyMs = 0;
      let attemptCount = 0;
      
      // Simulate a service with variable latency
      const service = async (attempt) => {
        attemptCount++;
        await new Promise(resolve => setTimeout(resolve, latencyMs));
        
        if (latencyMs > 200) {
          const error = new Error('Request timeout');
          error.code = 'ETIMEDOUT';
          throw error;
        }
        
        return { status: 'ok', attempt, attemptCount };
      };
      
      // Test normal latency
      latencyMs = 50;
      const result1 = await retryStrategy.executeWithBackoff(service);
      expect(result1.status).toBe('ok');
      expect(attemptCount).toBe(1);
      
      // Test high latency with retry
      latencyMs = 300;
      attemptCount = 0;
      
      await expect(
        retryStrategy.executeWithBackoff(service)
      ).rejects.toThrow('Operation failed after 3 attempts');
      
      // Should have attempted maxRetries + 1 times
      expect(attemptCount).toBe(3);
      
      // Test recovery
      latencyMs = 50;
      attemptCount = 0;
      const result2 = await retryStrategy.executeWithBackoff(service);
      expect(result2.status).toBe('ok');
      expect(attemptCount).toBe(1);
    });
    
    test('should handle intermittent network failures', async () => {
      let failureCount = 0;
      
      // Simulate intermittent failures
      const service = async () => {
        failureCount++;
        if (failureCount % 3 === 0) {
          const error = new Error('Connection reset');
          error.code = 'ECONNRESET';
          throw error;
        }
        return { status: 'ok', failureCount };
      };
      
      // Test with circuit breaker and retry
      const executeWithResilience = async () => {
        return circuitBreaker.execute(() => 
          retryStrategy.executeWithBackoff(service)
        );
      };
      
      // Should handle intermittent failures
      const results = [];
      for (let i = 0; i < 10; i++) {
        try {
          const result = await executeWithResilience();
          results.push(result);
        } catch (error) {
          // Some requests may fail, that's expected
        }
      }
      
      // Should have some successful requests
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(r => r.status === 'ok')).toBe(true);
    });
  });
  
  describe('Resource Chaos', () => {
    test('should handle memory pressure with degradation', async () => {
      let memoryUsage = 50; // Percentage
      
      // Register service with health check
      gracefulDegradation.registerDegradationLevel('memory-intensive-service', {
        thresholds: {
          DEGRADED_MINOR: { errorRate: 0, latency: 0, memoryUsage: 70 },
          DEGRADED_MAJOR: { errorRate: 0, latency: 0, memoryUsage: 85 },
          EMERGENCY: { errorRate: 0, latency: 0, memoryUsage: 95 }
        },
        healthCheck: () => ({
          healthy: memoryUsage < 95,
          memoryUsage,
          errorRate: 0,
          latency: 0
        }),
        fallback: async () => ({ status: 'degraded', cached: true })
      });
      
      // Normal operation
      const result1 = await gracefulDegradation.executeWithFallback(
        async () => ({ status: 'ok', features: 'all' }),
        null,
        { service: 'memory-intensive-service' }
      );
      expect(result1.status).toBe('ok');
      
      // Simulate memory pressure
      memoryUsage = 80;
      gracefulDegradation.calculateDegradationLevel();
      
      // Should disable some features
      expect(gracefulDegradation.isFeatureEnabled('analytics')).toBe(false);
      expect(gracefulDegradation.isFeatureEnabled('recommendations')).toBe(false);
      
      // Extreme memory pressure
      memoryUsage = 96;
      gracefulDegradation.calculateDegradationLevel();
      
      // Should use fallback
      const result2 = await gracefulDegradation.executeWithFallback(
        async () => { throw new Error('Out of memory'); },
        null,
        { service: 'memory-intensive-service' }
      );
      expect(result2.cached).toBe(true);
      expect(result2.status).toBe('degraded');
    });
    
    test('should handle CPU starvation', async () => {
      let cpuLoad = 0.5; // 50% CPU
      let processingTime = 100; // ms
      
      // Configure fault tolerance with CPU-aware health check
      faultTolerance.configureHealthCheck('cpu-intensive-service', {
        interval: 100,
        check: async () => {
          // Simulate CPU impact on processing time
          const actualProcessingTime = processingTime * (1 + cpuLoad);
          await new Promise(resolve => setTimeout(resolve, actualProcessingTime));
          
          return {
            healthy: cpuLoad < 0.9,
            responseTime: actualProcessingTime,
            cpuLoad
          };
        }
      });
      
      // Normal CPU load
      await new Promise(resolve => setTimeout(resolve, 150));
      const status1 = faultTolerance.getServiceStatus('cpu-intensive-service');
      expect(status1.healthy).toBe(true);
      
      // High CPU load
      cpuLoad = 0.95;
      
      // Wait for health check to detect high CPU
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const status2 = faultTolerance.getServiceStatus('cpu-intensive-service');
      expect(status2.healthy).toBe(false);
    });
    
    test('should handle resource exhaustion with circuit breaker', async () => {
      let resourcesAvailable = true;
      let requestCount = 0;
      
      const resourceIntensiveOperation = async () => {
        requestCount++;
        if (!resourcesAvailable) {
          throw new Error('Insufficient resources');
        }
        return { status: 'ok', requestCount };
      };
      
      // Normal operation
      const result1 = await circuitBreaker.execute(resourceIntensiveOperation);
      expect(result1.status).toBe('ok');
      
      // Simulate resource exhaustion
      resourcesAvailable = false;
      
      // Circuit should open after failures
      for (let i = 0; i < 5; i++) {
        await expect(
          circuitBreaker.execute(resourceIntensiveOperation)
        ).rejects.toThrow('Insufficient resources');
      }
      
      expect(circuitBreaker.state).toBe('OPEN');
      
      // Resources recovered
      resourcesAvailable = true;
      
      // Reset circuit for testing
      circuitBreaker.reset();
      
      // Should work again
      const result2 = await circuitBreaker.execute(resourceIntensiveOperation);
      expect(result2.status).toBe('ok');
    });
  });
  
  describe('Service Chaos', () => {
    test('should handle cascading failures', async () => {
      // Set up service dependencies
      const services = {
        'api-gateway': { healthy: true, dependencies: ['auth-service', 'data-service'] },
        'auth-service': { healthy: true, dependencies: ['database'] },
        'data-service': { healthy: true, dependencies: ['database', 'cache'] },
        'database': { healthy: true, dependencies: [] },
        'cache': { healthy: true, dependencies: [] }
      };
      
      // Configure fault tolerance for each service
      for (const [serviceName, config] of Object.entries(services)) {
        faultTolerance.configureHealthCheck(serviceName, {
          interval: 100,
          check: async () => {
            // Check if all dependencies are healthy
            const depsHealthy = config.dependencies.every(
              dep => services[dep] && services[dep].healthy
            );
            
            return {
              healthy: config.healthy && depsHealthy,
              dependencies: config.dependencies
            };
          }
        });
        
        // Set up redundancy
        faultTolerance.setupRedundancy(serviceName, {
          replicas: 2,
          failoverStrategy: 'automatic'
        });
      }
      
      // Wait for initial health checks
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // All services should be healthy
      expect(faultTolerance.getServiceStatus('api-gateway').healthy).toBe(true);
      expect(faultTolerance.getServiceStatus('auth-service').healthy).toBe(true);
      expect(faultTolerance.getServiceStatus('data-service').healthy).toBe(true);
      
      // Simulate database failure
      services['database'].healthy = false;
      
      // Wait for cascading effect
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Services depending on database should be unhealthy
      expect(faultTolerance.getServiceStatus('database').healthy).toBe(false);
      expect(faultTolerance.getServiceStatus('auth-service').healthy).toBe(false);
      expect(faultTolerance.getServiceStatus('data-service').healthy).toBe(false);
      
      // API gateway should be unhealthy due to dependencies
      expect(faultTolerance.getServiceStatus('api-gateway').healthy).toBe(false);
      
      // Cache should still be healthy (no dependency on database)
      expect(faultTolerance.getServiceStatus('cache').healthy).toBe(true);
      
      // Simulate database recovery
      services['database'].healthy = true;
      
      // Wait for recovery propagation
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // All services should recover
      expect(faultTolerance.getServiceStatus('database').healthy).toBe(true);
      expect(faultTolerance.getServiceStatus('auth-service').healthy).toBe(true);
      expect(faultTolerance.getServiceStatus('data-service').healthy).toBe(true);
      expect(faultTolerance.getServiceStatus('api-gateway').healthy).toBe(true);
    });
    
    test('should isolate failures with circuit breakers', async () => {
      const serviceA = new CircuitBreaker({ name: 'service-a', failureThreshold: 2 });
      const serviceB = new CircuitBreaker({ name: 'service-b', failureThreshold: 2 });
      
      let serviceAHealthy = true;
      let serviceBHealthy = true;
      
      const callServiceA = async () => {
        if (!serviceAHealthy) throw new Error('Service A failed');
        return { service: 'A', status: 'ok' };
      };
      
      const callServiceB = async () => {
        if (!serviceBHealthy) throw new Error('Service B failed');
        return { service: 'B', status: 'ok' };
      };
      
      // Both services working
      const resultA1 = await serviceA.execute(callServiceA);
      const resultB1 = await serviceB.execute(callServiceB);
      expect(resultA1.status).toBe('ok');
      expect(resultB1.status).toBe('ok');
      
      // Service A fails
      serviceAHealthy = false;
      
      // Trigger circuit breaker for service A
      await expect(serviceA.execute(callServiceA)).rejects.toThrow();
      await expect(serviceA.execute(callServiceA)).rejects.toThrow();
      
      expect(serviceA.state).toBe('OPEN');
      expect(serviceB.state).toBe('CLOSED');
      
      // Service B should still work (isolated)
      const resultB2 = await serviceB.execute(callServiceB);
      expect(resultB2.status).toBe('ok');
      
      // Service A circuit is open, requests rejected quickly
      await expect(serviceA.execute(callServiceA)).rejects.toThrow('Circuit breaker service-a is OPEN');
    });
  });
  
  describe('Chaos Metrics', () => {
    test('should track chaos engineering metrics', async () => {
      const metrics = {
        failuresInjected: 0,
        recoveriesObserved: 0,
        degradationEvents: 0
      };
      
      // Track circuit breaker events
      circuitBreaker.on('failure', () => metrics.failuresInjected++);
      circuitBreaker.on('stateChange', (event) => {
        if (event.to === 'CLOSED') metrics.recoveriesObserved++;
      });
      
      // Track degradation events
      gracefulDegradation.on('degradationLevelChanged', () => metrics.degradationEvents++);
      
      // Simulate chaos scenario
      let shouldFail = true;
      const chaoticService = async () => {
        if (shouldFail) throw new Error('Chaos injected');
        return { status: 'ok' };
      };
      
      // Inject failures
      for (let i = 0; i < 5; i++) {
        try {
          await circuitBreaker.execute(chaoticService);
        } catch (error) {
          // Expected
        }
      }
      
      expect(metrics.failuresInjected).toBe(5);
      expect(circuitBreaker.state).toBe('OPEN');
      
      // Recovery
      shouldFail = false;
      circuitBreaker.reset();
      
      await circuitBreaker.execute(chaoticService);
      expect(metrics.recoveriesObserved).toBeGreaterThanOrEqual(1);
      
      // Get final metrics
      const cbMetrics = circuitBreaker.getMetrics();
      expect(cbMetrics.totalFailures).toBe(5);
      expect(cbMetrics.failureRate).toBe('83.33%'); // 5 failures out of 6 total
    });
  });
});