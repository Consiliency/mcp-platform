const PrometheusExporter = require('../../../monitoring/metrics/prometheus-exporter');
const CustomMetrics = require('../../../monitoring/metrics/custom-metrics');
const express = require('express');
const request = require('supertest');
const cluster = require('cluster');
const os = require('os');

describe('Metrics Performance Under Load', () => {
  let prometheusExporter;
  let customMetrics;

  beforeEach(() => {
    prometheusExporter = new PrometheusExporter({
      prefix: 'perf_test_',
      defaultLabels: {
        service: 'performance-test',
        environment: 'load-test'
      }
    });

    customMetrics = new CustomMetrics({
      prometheusExporter,
      namespace: 'load_test'
    });
  });

  afterEach(() => {
    prometheusExporter.clear();
  });

  describe('High-Frequency Metric Updates', () => {
    it('should handle 10k metrics/second', async () => {
      const httpExporter = prometheusExporter.getExporter('http');
      const targetOps = 10000;
      const duration = 1000; // 1 second
      
      const startTime = Date.now();
      let operations = 0;

      // Generate metrics at high frequency
      while (Date.now() - startTime < duration && operations < targetOps) {
        httpExporter.metrics.httpRequestsTotal.inc({
          method: ['GET', 'POST', 'PUT', 'DELETE'][operations % 4],
          status: ['200', '201', '400', '500'][operations % 4]
        });
        operations++;
      }

      const actualDuration = Date.now() - startTime;
      const opsPerSecond = (operations / actualDuration) * 1000;

      expect(opsPerSecond).toBeGreaterThan(9000); // Allow 10% margin
      
      // Verify metrics are still accessible
      const metrics = await prometheusExporter.register.metrics();
      expect(metrics).toContain('perf_test_http_requests_total');
    });

    it('should handle concurrent metric updates', async () => {
      const concurrency = 100;
      const operationsPerWorker = 100;
      
      const workers = Array(concurrency).fill(null).map((_, index) => {
        return async () => {
          const exporter = prometheusExporter.getExporter('business');
          
          for (let i = 0; i < operationsPerWorker; i++) {
            exporter.recordEvent(`event_${index}`, 'success');
            exporter.updateActiveUsers(Math.floor(Math.random() * 1000), 'daily');
          }
        };
      });

      const startTime = Date.now();
      await Promise.all(workers.map(w => w()));
      const duration = Date.now() - startTime;

      const totalOps = concurrency * operationsPerWorker * 2; // 2 metrics per iteration
      const opsPerSecond = (totalOps / duration) * 1000;

      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      expect(opsPerSecond).toBeGreaterThan(1000);
    });
  });

  describe('Memory Efficiency', () => {
    it('should maintain stable memory usage with high cardinality', async () => {
      if (global.gc) {
        global.gc(); // Force garbage collection if available
      }

      const initialMemory = process.memoryUsage().heapUsed;
      const cacheExporter = prometheusExporter.getExporter('cache');

      // Create high cardinality metrics
      for (let i = 0; i < 1000; i++) {
        for (let j = 0; j < 10; j++) {
          cacheExporter.hit(`cache_${i}`, `operation_${j}`);
        }
      }

      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      const memoryIncreaseMB = memoryIncrease / 1024 / 1024;

      // Should not use excessive memory (less than 50MB for 10k unique label combinations)
      expect(memoryIncreaseMB).toBeLessThan(50);

      // Verify metrics are still functional
      const metrics = await prometheusExporter.register.metrics();
      expect(metrics).toContain('perf_test_cache_hits_total');
    });

    it('should handle metric lifecycle efficiently', async () => {
      const iterations = 100;
      const metricsPerIteration = 50;

      for (let i = 0; i < iterations; i++) {
        // Create custom metrics
        const tempExporter = prometheusExporter.createCustomExporter(`temp_${i}`, {
          counter: {
            type: 'Counter',
            name: `temp_counter_${i}`,
            help: 'Temporary counter'
          },
          gauge: {
            type: 'Gauge',
            name: `temp_gauge_${i}`,
            help: 'Temporary gauge'
          }
        });

        // Use metrics
        for (let j = 0; j < metricsPerIteration; j++) {
          tempExporter.counter.inc();
          tempExporter.gauge.set(Math.random() * 100);
        }

        // Clear old metrics periodically
        if (i % 10 === 0 && i > 0) {
          prometheusExporter.resetMetrics(`temp_${i - 10}`);
        }
      }

      // Memory should remain reasonable despite creating many metrics
      const memoryUsage = process.memoryUsage();
      const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024;
      
      expect(heapUsedMB).toBeLessThan(200); // Reasonable memory limit
    });
  });

  describe('Metric Collection Performance', () => {
    it('should efficiently serialize large numbers of metrics', async () => {
      // Create many different metrics
      const httpExporter = prometheusExporter.getExporter('http');
      const dbExporter = prometheusExporter.getExporter('database');
      const cacheExporter = prometheusExporter.getExporter('cache');
      const businessExporter = prometheusExporter.getExporter('business');

      // Generate diverse metrics
      for (let i = 0; i < 100; i++) {
        httpExporter.metrics.httpRequestsTotal.inc({ method: 'GET', status: '200' }, i);
        httpExporter.metrics.httpRequestDuration.observe({ method: 'GET' }, Math.random());
        
        dbExporter.metrics.dbQueryDuration.observe({ operation: 'SELECT' }, Math.random() * 0.1);
        dbExporter.metrics.dbConnectionsActive.set({ pool: 'primary' }, Math.floor(Math.random() * 10));
        
        cacheExporter.hit('redis', 'get', i * 10);
        cacheExporter.miss('redis', 'get', i * 2);
        
        businessExporter.recordRevenue(Math.random() * 100, 'USD', 'product');
        businessExporter.updateConversionRate(Math.random(), 'checkout');
      }

      // Measure serialization performance
      const iterations = 100;
      const startTime = Date.now();
      
      for (let i = 0; i < iterations; i++) {
        await prometheusExporter.register.metrics();
      }
      
      const duration = Date.now() - startTime;
      const avgSerializationTime = duration / iterations;

      expect(avgSerializationTime).toBeLessThan(10); // Should serialize in < 10ms
    });

    it('should handle metric endpoint under load', async () => {
      const app = express();
      app.use('/metrics', prometheusExporter.createMetricsEndpoint());

      // Generate some baseline metrics
      const httpExporter = prometheusExporter.getExporter('http');
      for (let i = 0; i < 1000; i++) {
        httpExporter.metrics.httpRequestsTotal.inc({
          method: 'GET',
          status: '200',
          path: `/path${i % 10}`
        });
      }

      // Measure endpoint performance
      const concurrentRequests = 50;
      const startTime = Date.now();
      
      const requests = Array(concurrentRequests).fill(null).map(() => 
        request(app).get('/metrics')
      );
      
      const responses = await Promise.all(requests);
      const duration = Date.now() - startTime;

      // All requests should succeed
      responses.forEach(res => {
        expect(res.status).toBe(200);
        expect(res.text).toContain('perf_test_http_requests_total');
      });

      // Should handle concurrent requests efficiently
      const avgResponseTime = duration / concurrentRequests;
      expect(avgResponseTime).toBeLessThan(50); // < 50ms per request
    });
  });

  describe('Histogram Performance', () => {
    it('should efficiently calculate percentiles', async () => {
      const httpExporter = prometheusExporter.getExporter('http');
      const observations = 10000;

      // Generate many observations
      for (let i = 0; i < observations; i++) {
        // Simulate realistic response time distribution
        const responseTime = Math.random() * Math.random() * 2; // Skewed distribution
        httpExporter.metrics.httpRequestDuration.observe(
          { method: 'GET', status: '200' },
          responseTime
        );
      }

      // Measure percentile calculation time
      const startTime = Date.now();
      const metrics = await prometheusExporter.register.metrics();
      const calculationTime = Date.now() - startTime;

      expect(calculationTime).toBeLessThan(100); // Should calculate quickly
      
      // Verify histogram data is present
      expect(metrics).toContain('perf_test_http_request_duration_seconds_bucket');
      expect(metrics).toContain('perf_test_http_request_duration_seconds_sum');
      expect(metrics).toContain('perf_test_http_request_duration_seconds_count');
    });

    it('should handle multiple histogram updates concurrently', async () => {
      const workers = 10;
      const observationsPerWorker = 1000;
      
      const tasks = Array(workers).fill(null).map((_, workerIndex) => {
        return async () => {
          const dbExporter = prometheusExporter.getExporter('database');
          
          for (let i = 0; i < observationsPerWorker; i++) {
            dbExporter.metrics.dbQueryDuration.observe(
              { 
                operation: ['SELECT', 'INSERT', 'UPDATE'][i % 3],
                table: `table_${workerIndex}`
              },
              Math.random() * 0.5
            );
          }
        };
      });

      const startTime = Date.now();
      await Promise.all(tasks.map(t => t()));
      const duration = Date.now() - startTime;

      const totalObservations = workers * observationsPerWorker;
      const observationsPerSecond = (totalObservations / duration) * 1000;

      expect(observationsPerSecond).toBeGreaterThan(10000);
    });
  });

  describe('Label Cardinality Performance', () => {
    it('should handle high label cardinality efficiently', async () => {
      const systemExporter = prometheusExporter.getExporter('system');
      const hosts = 100;
      const metrics = 10;
      
      const startTime = Date.now();

      // Simulate metrics from many hosts
      for (let h = 0; h < hosts; h++) {
        for (let m = 0; m < metrics; m++) {
          systemExporter.metrics.cpuUsage.set(
            { 
              host: `host-${h}`,
              core: `core-${m % 4}`
            },
            Math.random()
          );
          
          systemExporter.metrics.memoryUsage.set(
            {
              host: `host-${h}`,
              type: ['used', 'free', 'cached'][m % 3]
            },
            Math.random() * 1024 * 1024 * 1024
          );
        }
      }

      const updateDuration = Date.now() - startTime;
      
      // Measure query performance with high cardinality
      const queryStart = Date.now();
      const metricsOutput = await prometheusExporter.register.metrics();
      const queryDuration = Date.now() - queryStart;

      expect(updateDuration).toBeLessThan(1000); // Updates should be fast
      expect(queryDuration).toBeLessThan(200); // Query should remain fast
      expect(metricsOutput.length).toBeGreaterThan(10000); // Should have many lines
    });
  });

  describe('Real-world Load Simulation', () => {
    it('should handle realistic mixed workload', async () => {
      const app = express();
      app.use('/metrics', prometheusExporter.createMetricsEndpoint());

      // Simulate realistic application metrics
      const simulation = {
        duration: 5000, // 5 seconds
        httpRequestRate: 100, // requests per second
        dbQueryRate: 50, // queries per second
        cacheOperationRate: 200, // cache ops per second
        businessEventRate: 10 // events per second
      };

      const startTime = Date.now();
      const endTime = startTime + simulation.duration;
      
      const httpExporter = prometheusExporter.getExporter('http');
      const dbExporter = prometheusExporter.getExporter('database');
      const cacheExporter = prometheusExporter.getExporter('cache');
      const businessExporter = prometheusExporter.getExporter('business');

      let metrics = {
        httpRequests: 0,
        dbQueries: 0,
        cacheOps: 0,
        businessEvents: 0
      };

      // Run simulation
      const intervals = [];
      
      // HTTP requests
      intervals.push(setInterval(() => {
        if (Date.now() > endTime) return;
        
        const method = ['GET', 'POST', 'PUT', 'DELETE'][Math.floor(Math.random() * 4)];
        const status = Math.random() > 0.95 ? '500' : '200';
        const duration = Math.random() * 0.5;
        
        httpExporter.metrics.httpRequestsTotal.inc({ method, status });
        httpExporter.metrics.httpRequestDuration.observe({ method, status }, duration);
        metrics.httpRequests++;
      }, 1000 / simulation.httpRequestRate));

      // Database queries
      intervals.push(setInterval(() => {
        if (Date.now() > endTime) return;
        
        const operation = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'][Math.floor(Math.random() * 4)];
        const duration = Math.random() * 0.1;
        
        const tracker = dbExporter.trackQuery(operation, 'users', 'primary');
        setTimeout(() => tracker.success(Math.floor(Math.random() * 100)), duration * 1000);
        metrics.dbQueries++;
      }, 1000 / simulation.dbQueryRate));

      // Cache operations
      intervals.push(setInterval(() => {
        if (Date.now() > endTime) return;
        
        if (Math.random() > 0.2) {
          cacheExporter.hit('redis', 'get');
        } else {
          cacheExporter.miss('redis', 'get');
        }
        metrics.cacheOps++;
      }, 1000 / simulation.cacheOperationRate));

      // Business events
      intervals.push(setInterval(() => {
        if (Date.now() > endTime) return;
        
        businessExporter.recordEvent('purchase', 'completed');
        businessExporter.recordRevenue(Math.random() * 200, 'USD', 'product');
        metrics.businessEvents++;
      }, 1000 / simulation.businessEventRate));

      // Wait for simulation to complete
      await new Promise(resolve => setTimeout(resolve, simulation.duration + 100));
      
      // Clean up intervals
      intervals.forEach(interval => clearInterval(interval));

      // Verify metrics were collected
      const metricsEndpoint = await request(app).get('/metrics').expect(200);
      const metricsText = metricsEndpoint.text;

      expect(metrics.httpRequests).toBeGreaterThan(simulation.httpRequestRate * 4);
      expect(metrics.dbQueries).toBeGreaterThan(simulation.dbQueryRate * 4);
      expect(metrics.cacheOps).toBeGreaterThan(simulation.cacheOperationRate * 4);
      expect(metrics.businessEvents).toBeGreaterThan(simulation.businessEventRate * 4);

      // Verify all metric types are present
      expect(metricsText).toContain('perf_test_http_requests_total');
      expect(metricsText).toContain('perf_test_db_query_duration_seconds');
      expect(metricsText).toContain('perf_test_cache_hits_total');
      expect(metricsText).toContain('perf_test_business_events_total');
    });
  });

  describe('Stress Testing', () => {
    it('should remain stable under extreme load', async function() {
      this.timeout(30000); // 30 second timeout for stress test
      
      const stressConfig = {
        duration: 10000, // 10 seconds
        concurrentWorkers: 50,
        metricsPerWorker: 100
      };

      const workers = Array(stressConfig.concurrentWorkers).fill(null).map((_, index) => {
        return async () => {
          const startTime = Date.now();
          let operations = 0;
          
          while (Date.now() - startTime < stressConfig.duration) {
            // Random metric type
            const metricType = Math.floor(Math.random() * 4);
            
            switch (metricType) {
              case 0: // HTTP
                prometheusExporter.getExporter('http').metrics.httpRequestsTotal.inc({
                  method: 'GET',
                  status: '200',
                  worker: index
                });
                break;
              case 1: // Cache
                prometheusExporter.getExporter('cache').hit(`cache-${index}`, 'get');
                break;
              case 2: // Database
                prometheusExporter.getExporter('database').metrics.dbConnectionsActive.set({
                  pool: `worker-${index}`
                }, Math.random() * 10);
                break;
              case 3: // Business
                prometheusExporter.getExporter('business').recordEvent(`event-${index}`, 'success');
                break;
            }
            
            operations++;
            
            // Prevent tight loop
            if (operations % 1000 === 0) {
              await new Promise(resolve => setImmediate(resolve));
            }
          }
          
          return operations;
        };
      });

      const startTime = Date.now();
      const results = await Promise.all(workers.map(w => w()));
      const duration = Date.now() - startTime;

      const totalOperations = results.reduce((sum, ops) => sum + ops, 0);
      const opsPerSecond = (totalOperations / duration) * 1000;

      console.log(`Stress test: ${totalOperations} operations in ${duration}ms (${Math.floor(opsPerSecond)} ops/sec)`);

      expect(opsPerSecond).toBeGreaterThan(10000); // Should handle at least 10k ops/sec
      
      // System should still be responsive
      const finalMetrics = await prometheusExporter.register.metrics();
      expect(finalMetrics).toBeDefined();
      expect(finalMetrics.length).toBeGreaterThan(1000);
    });
  });
});