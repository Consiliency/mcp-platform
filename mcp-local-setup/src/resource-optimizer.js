const os = require('os');
const v8 = require('v8');

/**
 * LRU Cache implementation for resource optimization
 */
class LRUCache {
  constructor(maxSize = 100, ttl = 3600000) { // default 1 hour TTL
    this.maxSize = maxSize;
    this.ttl = ttl;
    this.cache = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0
    };
  }
  
  get(key) {
    const item = this.cache.get(key);
    if (!item) {
      this.stats.misses++;
      return null;
    }
    
    // Check if expired
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }
    
    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, item);
    this.stats.hits++;
    return item.value;
  }
  
  set(key, value, customTTL = null) {
    // Remove oldest if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
      this.stats.evictions++;
    }
    
    this.cache.set(key, {
      value,
      expiry: Date.now() + (customTTL || this.ttl)
    });
  }
  
  clear() {
    this.cache.clear();
  }
  
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      hitRate: total > 0 ? (this.stats.hits / total) : 0,
      size: this.cache.size
    };
  }
}

/**
 * Object Pool for reducing garbage collection pressure
 */
class ObjectPool {
  constructor(factory, reset, maxSize = 50) {
    this.factory = factory;
    this.reset = reset;
    this.maxSize = maxSize;
    this.pool = [];
    this.inUse = new Set();
  }
  
  acquire() {
    let obj;
    if (this.pool.length > 0) {
      obj = this.pool.pop();
    } else {
      obj = this.factory();
    }
    this.inUse.add(obj);
    return obj;
  }
  
  release(obj) {
    if (!this.inUse.has(obj)) return;
    
    this.inUse.delete(obj);
    this.reset(obj);
    
    if (this.pool.length < this.maxSize) {
      this.pool.push(obj);
    }
  }
  
  getStats() {
    return {
      poolSize: this.pool.length,
      inUse: this.inUse.size,
      maxSize: this.maxSize
    };
  }
}

/**
 * Resource Optimizer (PERF-8.2)
 * Optimizes memory and CPU usage across the platform
 */
class ResourceOptimizer {
  constructor() {
    this.memoryThreshold = 0.8; // 80% memory usage
    this.cpuThreshold = 0.7; // 70% CPU usage
    this.optimizations = new Map();
    this.objectPools = new Map();
    this.caches = new Map();
    this.queryCache = new LRUCache(1000, 300000); // 5 min TTL for queries
    this.cpuSamples = [];
    this.memoryLeaks = new Map();
  }
  
  /**
   * Optimize memory usage
   * TASK: Implement memory optimization strategies
   */
  optimizeMemoryUsage() {
    const memInfo = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usageRatio = 1 - (freeMem / totalMem);
    
    const optimization = {
      timestamp: Date.now(),
      before: { ...memInfo },
      actions: []
    };
    
    // Trigger garbage collection if available and memory usage is high
    if (usageRatio > this.memoryThreshold) {
      if (global.gc) {
        global.gc();
        optimization.actions.push('garbage_collection');
      }
      
      // Clear caches if memory pressure is high
      for (const [name, cache] of this.caches) {
        const stats = cache.getStats();
        if (stats.hitRate < 0.3) { // Low hit rate cache
          cache.clear();
          optimization.actions.push(`cleared_cache_${name}`);
        }
      }
    }
    
    // Get heap statistics for leak detection
    const heapStats = v8.getHeapStatistics();
    this.detectMemoryLeaks(heapStats);
    
    optimization.after = process.memoryUsage();
    optimization.heapStats = heapStats;
    
    this.optimizations.set('memory', optimization);
    return optimization;
  }
  
  /**
   * Detect potential memory leaks
   */
  detectMemoryLeaks(heapStats) {
    const now = Date.now();
    const threshold = 5; // 5 consecutive increases
    
    // Track heap size over time
    if (!this.memoryLeaks.has('heap')) {
      this.memoryLeaks.set('heap', []);
    }
    
    const heapHistory = this.memoryLeaks.get('heap');
    heapHistory.push({
      timestamp: now,
      used: heapStats.used_heap_size,
      total: heapStats.total_heap_size
    });
    
    // Keep only last 10 samples
    if (heapHistory.length > 10) {
      heapHistory.shift();
    }
    
    // Check for continuous growth
    if (heapHistory.length >= threshold) {
      let increases = 0;
      for (let i = 1; i < heapHistory.length; i++) {
        if (heapHistory[i].used > heapHistory[i-1].used) {
          increases++;
        }
      }
      
      if (increases >= threshold - 1) {
        console.warn('Potential memory leak detected:', {
          samples: heapHistory.length,
          increases,
          growth: heapHistory[heapHistory.length-1].used - heapHistory[0].used
        });
      }
    }
  }
  
  /**
   * Profile CPU usage
   * TASK: Add CPU profiling and optimization
   */
  profileCpuUsage() {
    const startUsage = process.cpuUsage();
    const startTime = process.hrtime.bigint();
    
    // Collect CPU samples
    const sample = {
      timestamp: Date.now(),
      loadAvg: os.loadavg(),
      cpus: os.cpus().map(cpu => ({
        model: cpu.model,
        speed: cpu.speed,
        times: { ...cpu.times }
      }))
    };
    
    this.cpuSamples.push(sample);
    if (this.cpuSamples.length > 60) { // Keep last minute of samples
      this.cpuSamples.shift();
    }
    
    // Identify hot paths (simplified - in real implementation would use profiler)
    const profile = {
      timestamp: sample.timestamp,
      loadAverage: sample.loadAvg,
      cpuCount: os.cpus().length,
      utilization: this.calculateCpuUtilization(),
      hotPaths: []
    };
    
    // Check if CPU usage is high
    if (profile.utilization > this.cpuThreshold) {
      profile.recommendations = [
        'Consider implementing worker threads for CPU-intensive tasks',
        'Review algorithm complexity in hot code paths',
        'Enable clustering to utilize multiple CPU cores'
      ];
    }
    
    this.optimizations.set('cpu', profile);
    return profile;
  }
  
  /**
   * Calculate CPU utilization from samples
   */
  calculateCpuUtilization() {
    if (this.cpuSamples.length < 2) return 0;
    
    const recent = this.cpuSamples[this.cpuSamples.length - 1];
    const previous = this.cpuSamples[this.cpuSamples.length - 2];
    
    let totalDiff = 0;
    let idleDiff = 0;
    
    for (let i = 0; i < recent.cpus.length; i++) {
      const cpu1 = recent.cpus[i].times;
      const cpu2 = previous.cpus[i].times;
      
      const total1 = Object.values(cpu1).reduce((a, b) => a + b, 0);
      const total2 = Object.values(cpu2).reduce((a, b) => a + b, 0);
      
      totalDiff += (total1 - total2);
      idleDiff += (cpu1.idle - cpu2.idle);
    }
    
    return totalDiff > 0 ? 1 - (idleDiff / totalDiff) : 0;
  }
  
  /**
   * Optimize database queries
   * TASK: Improve database query performance
   */
  optimizeDatabaseQueries() {
    const optimization = {
      timestamp: Date.now(),
      cacheStats: this.queryCache.getStats(),
      pools: new Map()
    };
    
    // Connection pool configuration
    const poolConfig = {
      min: 2,
      max: 10,
      idleTimeout: 30000,
      acquireTimeout: 10000
    };
    
    // Query optimization strategies
    optimization.strategies = {
      caching: {
        enabled: true,
        ttl: this.queryCache.ttl,
        maxSize: this.queryCache.maxSize
      },
      pooling: poolConfig,
      indexing: {
        recommendations: [
          'Create indexes on frequently queried columns',
          'Use compound indexes for multi-column queries',
          'Analyze query execution plans'
        ]
      },
      batching: {
        enabled: true,
        batchSize: 100,
        flushInterval: 100
      }
    };
    
    this.optimizations.set('database', optimization);
    return optimization;
  }
  
  /**
   * Implement caching strategies
   * TASK: Add intelligent caching
   */
  implementCaching() {
    // Create different caches for different purposes
    if (!this.caches.has('api')) {
      this.caches.set('api', new LRUCache(500, 600000)); // 10 min TTL
    }
    
    if (!this.caches.has('computation')) {
      this.caches.set('computation', new LRUCache(200, 1800000)); // 30 min TTL
    }
    
    if (!this.caches.has('session')) {
      this.caches.set('session', new LRUCache(1000, 3600000)); // 1 hour TTL
    }
    
    const cacheReport = {
      timestamp: Date.now(),
      caches: {}
    };
    
    // Collect cache statistics
    for (const [name, cache] of this.caches) {
      const stats = cache.getStats();
      cacheReport.caches[name] = {
        ...stats,
        recommendations: this.getCacheRecommendations(name, stats)
      };
    }
    
    this.optimizations.set('caching', cacheReport);
    return cacheReport;
  }
  
  /**
   * Get cache recommendations based on statistics
   */
  getCacheRecommendations(cacheName, stats) {
    const recommendations = [];
    
    if (stats.hitRate < 0.5) {
      recommendations.push('Consider adjusting cache key strategy');
      recommendations.push('Review cache invalidation logic');
    }
    
    if (stats.evictions > stats.hits) {
      recommendations.push('Increase cache size to reduce evictions');
    }
    
    if (stats.size === 0) {
      recommendations.push('Cache is empty - verify caching logic');
    }
    
    return recommendations;
  }
  
  /**
   * Create an object pool for a specific type
   */
  createObjectPool(name, factory, reset, maxSize = 50) {
    const pool = new ObjectPool(factory, reset, maxSize);
    this.objectPools.set(name, pool);
    return pool;
  }
  
  /**
   * Get optimization report
   */
  getOptimizationReport() {
    const report = {
      timestamp: Date.now(),
      system: {
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version,
        memory: {
          total: os.totalmem(),
          free: os.freemem(),
          usage: process.memoryUsage()
        },
        cpu: {
          model: os.cpus()[0]?.model,
          count: os.cpus().length,
          loadAverage: os.loadavg()
        }
      },
      optimizations: {}
    };
    
    for (const [type, data] of this.optimizations) {
      report.optimizations[type] = data;
    }
    
    return report;
  }
}

module.exports = ResourceOptimizer;