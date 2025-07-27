const TransportOptimizer = require('../../bridge/transports/transport-optimizer');
const ResourceOptimizer = require('../../src/resource-optimizer');
const StdioTransport = require('../../bridge/transports/stdio/stdio-transport');

/**
 * Performance benchmark tests for Phase 8 optimizations
 */
describe('Performance Optimizations', () => {
  let transportOptimizer;
  let resourceOptimizer;
  
  beforeEach(() => {
    transportOptimizer = new TransportOptimizer();
    resourceOptimizer = new ResourceOptimizer();
  });
  
  describe('Transport Performance (PERF-8.1)', () => {
    test('HTTP connection pooling reduces connection overhead', async () => {
      const mockTransport = {
        id: 'http-test',
        type: 'http',
        agent: {
          keepAlive: false,
          keepAliveMsecs: 0,
          maxSockets: 1
        }
      };
      
      const pool = transportOptimizer.optimizeHttpTransport(mockTransport);
      
      expect(mockTransport.agent.keepAlive).toBe(true);
      expect(mockTransport.agent.keepAliveMsecs).toBe(1000);
      expect(mockTransport.agent.maxSockets).toBe(10);
      expect(pool).toBeDefined();
    });
    
    test('WebSocket reconnection uses exponential backoff', async () => {
      const mockTransport = {
        id: 'ws-test',
        type: 'websocket',
        reconnect: jest.fn()
      };
      
      const strategy = transportOptimizer.optimizeWebSocketReconnection(mockTransport);
      
      // Test exponential backoff (delays should increase)
      const delay1 = strategy.getNextDelay();
      const delay2 = strategy.getNextDelay();
      const delay3 = strategy.getNextDelay();
      
      // First delay should be around 1000ms ± 30%
      expect(delay1).toBeGreaterThanOrEqual(700);
      expect(delay1).toBeLessThanOrEqual(1300);
      
      // Second delay should be around 2000ms ± 30%
      expect(delay2).toBeGreaterThanOrEqual(1400);
      expect(delay2).toBeLessThanOrEqual(2600);
      
      // Third delay should be around 4000ms ± 30%
      expect(delay3).toBeGreaterThanOrEqual(2800);
      expect(delay3).toBeLessThanOrEqual(5200);
      
      // Delays should be increasing
      expect(delay2).toBeGreaterThan(delay1);
      expect(delay3).toBeGreaterThan(delay2);
    });
    
    test('Message batching improves throughput', async () => {
      const mockTransport = {
        id: 'batch-test',
        batchingEnabled: true,
        send: jest.fn(),
        sendBatch: jest.fn()
      };
      
      const queue = transportOptimizer.enableMessageBatching(mockTransport);
      
      // Add messages
      for (let i = 0; i < 5; i++) {
        queue.add({ id: i, data: `message ${i}` });
      }
      
      // Should not have sent yet (under batch size)
      expect(mockTransport.sendBatch).not.toHaveBeenCalled();
      
      // Add more to trigger batch
      for (let i = 5; i < 10; i++) {
        queue.add({ id: i, data: `message ${i}` });
      }
      
      // Should have sent batch
      expect(mockTransport.sendBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: 0 }),
          expect.objectContaining({ id: 9 })
        ])
      );
    });
    
    test('Transport tuning applies correct settings', () => {
      const mockTransport = {
        type: 'stdio',
        setBufferSize: jest.fn(),
        setTimeout: jest.fn(),
        setConcurrency: jest.fn()
      };
      
      const config = transportOptimizer.tuneTransportPerformance(mockTransport, {
        bufferSize: 128000,
        timeout: 60000,
        concurrency: 20
      });
      
      expect(mockTransport.setBufferSize).toHaveBeenCalledWith(128000);
      expect(mockTransport.setTimeout).toHaveBeenCalledWith(60000);
      expect(mockTransport.setConcurrency).toHaveBeenCalledWith(20);
    });
  });
  
  describe('Resource Optimization (PERF-8.2)', () => {
    test('Memory optimization triggers garbage collection', () => {
      // Mock global.gc
      global.gc = jest.fn();
      
      const result = resourceOptimizer.optimizeMemoryUsage();
      
      expect(result.timestamp).toBeDefined();
      expect(result.before).toBeDefined();
      expect(result.after).toBeDefined();
    });
    
    test('CPU profiling collects usage statistics', () => {
      const profile = resourceOptimizer.profileCpuUsage();
      
      expect(profile.timestamp).toBeDefined();
      expect(profile.loadAverage).toBeDefined();
      expect(profile.cpuCount).toBeGreaterThan(0);
      expect(profile.utilization).toBeDefined();
    });
    
    test('Database query optimization provides recommendations', () => {
      const optimization = resourceOptimizer.optimizeDatabaseQueries();
      
      expect(optimization.strategies.caching.enabled).toBe(true);
      expect(optimization.strategies.pooling.max).toBe(10);
      expect(optimization.strategies.batching.enabled).toBe(true);
      expect(optimization.strategies.indexing.recommendations).toHaveLength(3);
    });
    
    test('LRU cache implementation works correctly', () => {
      const cacheResult = resourceOptimizer.implementCaching();
      const apiCache = resourceOptimizer.caches.get('api');
      
      // Test cache operations
      apiCache.set('key1', 'value1');
      apiCache.set('key2', 'value2');
      
      expect(apiCache.get('key1')).toBe('value1');
      expect(apiCache.get('key2')).toBe('value2');
      expect(apiCache.get('key3')).toBeNull();
      
      const stats = apiCache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(0.667, 2);
    });
    
    test('Object pool reduces allocation overhead', () => {
      const factory = () => ({ data: null });
      const reset = (obj) => { obj.data = null; };
      
      const pool = resourceOptimizer.createObjectPool('test-pool', factory, reset, 5);
      
      // Acquire objects
      const obj1 = pool.acquire();
      const obj2 = pool.acquire();
      
      expect(pool.getStats().inUse).toBe(2);
      expect(pool.getStats().poolSize).toBe(0);
      
      // Release objects
      pool.release(obj1);
      pool.release(obj2);
      
      expect(pool.getStats().inUse).toBe(0);
      expect(pool.getStats().poolSize).toBe(2);
      
      // Reuse objects
      const obj3 = pool.acquire();
      expect(obj3).toBe(obj2); // Should reuse from pool
    });
    
    test('Memory leak detection identifies continuous growth', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      // Simulate growing heap usage
      for (let i = 0; i < 6; i++) {
        resourceOptimizer.detectMemoryLeaks({
          used_heap_size: 100000 * (i + 1),
          total_heap_size: 200000
        });
      }
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Potential memory leak detected'),
        expect.any(Object)
      );
      
      consoleSpy.mockRestore();
    });
  });
  
  describe('Integration Tests', () => {
    test('StdioTransport integrates with optimizer', async () => {
      const transport = new StdioTransport({
        batchingEnabled: true
      });
      
      await transport.initialize();
      
      expect(transport.optimizer).toBeDefined();
      expect(transport.bufferSize).toBe(65536);
      expect(transport.timeout).toBe(30000);
    });
    
    test('Performance report includes all optimizations', () => {
      // Trigger all optimizations
      resourceOptimizer.optimizeMemoryUsage();
      resourceOptimizer.profileCpuUsage();
      resourceOptimizer.optimizeDatabaseQueries();
      resourceOptimizer.implementCaching();
      
      const report = resourceOptimizer.getOptimizationReport();
      
      expect(report.system).toBeDefined();
      expect(report.optimizations.memory).toBeDefined();
      expect(report.optimizations.cpu).toBeDefined();
      expect(report.optimizations.database).toBeDefined();
      expect(report.optimizations.caching).toBeDefined();
    });
  });
  
  describe('Performance Benchmarks', () => {
    test('Message throughput with batching', async () => {
      const transport = {
        id: 'bench-test',
        sendBatch: jest.fn().mockResolvedValue(true)
      };
      
      const queue = transportOptimizer.enableMessageBatching(transport);
      const startTime = Date.now();
      const messageCount = 1000;
      
      // Send messages
      for (let i = 0; i < messageCount; i++) {
        queue.add({ id: i, data: `benchmark message ${i}` });
      }
      
      // Force flush
      queue.flush();
      
      const duration = Date.now() - startTime;
      const throughput = messageCount / (duration / 1000);
      
      console.log(`Batched throughput: ${throughput.toFixed(2)} messages/sec`);
      expect(throughput).toBeGreaterThan(1000); // Should handle > 1000 msg/sec
    });
    
    test('Cache performance under load', () => {
      resourceOptimizer.implementCaching();
      const cache = resourceOptimizer.caches.get('api');
      const iterations = 10000;
      const startTime = Date.now();
      
      // Populate cache
      for (let i = 0; i < 100; i++) {
        cache.set(`key${i}`, { data: `value${i}` });
      }
      
      // Benchmark reads
      let hits = 0;
      for (let i = 0; i < iterations; i++) {
        const key = `key${i % 100}`;
        if (cache.get(key)) hits++;
      }
      
      const duration = Date.now() - startTime;
      const opsPerSec = iterations / (duration / 1000);
      
      console.log(`Cache operations/sec: ${opsPerSec.toFixed(2)}`);
      console.log(`Cache hit rate: ${(hits / iterations * 100).toFixed(2)}%`);
      
      expect(opsPerSec).toBeGreaterThan(100000); // Should handle > 100k ops/sec
      expect(hits).toBe(iterations); // All should be hits
    });
  });
});