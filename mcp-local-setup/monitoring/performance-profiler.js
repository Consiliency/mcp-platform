const { EventEmitter } = require('events');
const fs = require('fs').promises;
const path = require('path');
const { performance } = require('perf_hooks');

/**
 * Performance Profiler (FEATURE-8.2)
 * Advanced CPU and memory profiling for performance analysis
 */
class PerformanceProfiler extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      outputDir: config.outputDir || './profiles',
      samplingInterval: config.samplingInterval || 1000, // microseconds
      heapSnapshotInterval: config.heapSnapshotInterval || 60000, // ms
      autoProfile: config.autoProfile || false,
      profileDuration: config.profileDuration || 60000, // ms
      memoryThreshold: config.memoryThreshold || 0.8, // 80% memory usage
      cpuThreshold: config.cpuThreshold || 0.9, // 90% CPU usage
      enableMemoryProfiling: config.enableMemoryProfiling !== false,
      enableCpuProfiling: config.enableCpuProfiling !== false
    };
    
    this.profiles = new Map();
    this.snapshots = new Map();
    this.isProfilingEnabled = false;
    this.v8Profiler = null;
    this.memoryWatcher = null;
    this.cpuWatcher = null;
    this.performanceMarks = new Map();
  }
  
  /**
   * Initialize profiler
   */
  async initialize() {
    try {
      // Create output directory
      await fs.mkdir(this.config.outputDir, { recursive: true });
      
      // Lazy load v8-profiler-next
      try {
        this.v8Profiler = require('v8-profiler-next');
        this.v8Profiler.setGenerateType(1); // Use new format
        this.v8Profiler.setSamplingInterval(this.config.samplingInterval);
      } catch (error) {
        this.emit('warning', 'v8-profiler-next not available, using built-in profiling');
      }
      
      // Start automatic profiling if enabled
      if (this.config.autoProfile) {
        this._startAutoProfiling();
      }
      
      // Start resource monitoring
      this._startResourceMonitoring();
      
      this.isProfilingEnabled = true;
      this.emit('initialized');
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }
  
  /**
   * Start CPU profiling
   */
  startCpuProfiling(profileId = `cpu-${Date.now()}`) {
    if (!this.config.enableCpuProfiling) {
      throw new Error('CPU profiling is disabled');
    }
    
    if (this.profiles.has(profileId)) {
      throw new Error(`Profile ${profileId} already exists`);
    }
    
    const profileInfo = {
      id: profileId,
      type: 'cpu',
      startTime: Date.now(),
      startMark: `profile-start-${profileId}`
    };
    
    // Mark performance start
    performance.mark(profileInfo.startMark);
    
    if (this.v8Profiler) {
      // Use v8-profiler-next
      this.v8Profiler.startProfiling(profileId, true);
    } else {
      // Use built-in CPU profiling
      profileInfo.samples = [];
      profileInfo.interval = setInterval(() => {
        const usage = process.cpuUsage();
        const memory = process.memoryUsage();
        profileInfo.samples.push({
          timestamp: Date.now(),
          cpu: usage,
          memory: memory
        });
      }, 100);
    }
    
    this.profiles.set(profileId, profileInfo);
    this.emit('profiling-started', { profileId, type: 'cpu' });
    
    return profileId;
  }
  
  /**
   * Stop CPU profiling and save results
   */
  async stopCpuProfiling(profileId) {
    const profileInfo = this.profiles.get(profileId);
    if (!profileInfo || profileInfo.type !== 'cpu') {
      throw new Error(`CPU profile ${profileId} not found`);
    }
    
    const endMark = `profile-end-${profileId}`;
    performance.mark(endMark);
    
    let profileData;
    
    if (this.v8Profiler) {
      // Stop v8 profiling
      const profile = this.v8Profiler.stopProfiling(profileId);
      profileData = await new Promise((resolve, reject) => {
        profile.export((error, result) => {
          profile.delete();
          if (error) reject(error);
          else resolve(result);
        });
      });
    } else {
      // Stop built-in profiling
      clearInterval(profileInfo.interval);
      profileData = {
        profileId,
        samples: profileInfo.samples,
        duration: Date.now() - profileInfo.startTime
      };
    }
    
    // Measure performance
    performance.measure(
      `profile-duration-${profileId}`,
      profileInfo.startMark,
      endMark
    );
    
    // Save profile to file
    const filename = path.join(
      this.config.outputDir,
      `${profileId}-${Date.now()}.cpuprofile`
    );
    
    await fs.writeFile(
      filename,
      typeof profileData === 'string' ? profileData : JSON.stringify(profileData, null, 2)
    );
    
    // Analyze profile
    const analysis = await this._analyzeCpuProfile(profileData);
    
    this.profiles.delete(profileId);
    this.emit('profiling-stopped', { profileId, type: 'cpu', filename, analysis });
    
    return { filename, analysis };
  }
  
  /**
   * Take heap snapshot
   */
  async takeHeapSnapshot(snapshotId = `heap-${Date.now()}`) {
    if (!this.config.enableMemoryProfiling) {
      throw new Error('Memory profiling is disabled');
    }
    
    const snapshotInfo = {
      id: snapshotId,
      timestamp: Date.now(),
      memoryUsage: process.memoryUsage()
    };
    
    let snapshotData;
    
    if (this.v8Profiler) {
      // Use v8-profiler-next
      const snapshot = this.v8Profiler.takeSnapshot(snapshotId);
      snapshotData = await new Promise((resolve, reject) => {
        const chunks = [];
        snapshot.export()
          .on('data', chunk => chunks.push(chunk))
          .on('end', () => {
            snapshot.delete();
            resolve(Buffer.concat(chunks).toString());
          })
          .on('error', reject);
      });
    } else {
      // Use built-in memory analysis
      const memoryUsage = process.memoryUsage();
      snapshotData = {
        snapshot: {
          meta: {
            node: process.version,
            timestamp: Date.now()
          },
          nodes: [],
          edges: [],
          strings: []
        },
        memoryUsage,
        resourceUsage: process.resourceUsage()
      };
    }
    
    // Save snapshot to file
    const filename = path.join(
      this.config.outputDir,
      `${snapshotId}-${Date.now()}.heapsnapshot`
    );
    
    await fs.writeFile(
      filename,
      typeof snapshotData === 'string' ? snapshotData : JSON.stringify(snapshotData)
    );
    
    // Analyze snapshot
    const analysis = await this._analyzeHeapSnapshot(snapshotData);
    
    snapshotInfo.filename = filename;
    snapshotInfo.analysis = analysis;
    
    this.snapshots.set(snapshotId, snapshotInfo);
    this.emit('snapshot-taken', snapshotInfo);
    
    return snapshotInfo;
  }
  
  /**
   * Analyze performance bottlenecks
   */
  async analyzeBottlenecks() {
    const analysis = {
      timestamp: Date.now(),
      cpu: {},
      memory: {},
      recommendations: []
    };
    
    // Analyze CPU usage
    const cpuUsage = process.cpuUsage();
    const cpuPercent = (cpuUsage.user + cpuUsage.system) / 1000000; // Convert to seconds
    
    analysis.cpu = {
      usage: cpuPercent,
      threshold: this.config.cpuThreshold,
      isBottleneck: cpuPercent > this.config.cpuThreshold
    };
    
    // Analyze memory usage
    const memoryUsage = process.memoryUsage();
    const totalMemory = require('os').totalmem();
    const memoryPercent = memoryUsage.rss / totalMemory;
    
    analysis.memory = {
      usage: memoryUsage,
      percent: memoryPercent,
      threshold: this.config.memoryThreshold,
      isBottleneck: memoryPercent > this.config.memoryThreshold
    };
    
    // Generate recommendations
    if (analysis.cpu.isBottleneck) {
      analysis.recommendations.push({
        type: 'cpu',
        severity: 'high',
        message: 'High CPU usage detected. Consider optimizing compute-intensive operations.',
        suggestion: 'Profile CPU usage to identify hot functions'
      });
    }
    
    if (analysis.memory.isBottleneck) {
      analysis.recommendations.push({
        type: 'memory',
        severity: 'high',
        message: 'High memory usage detected. Check for memory leaks.',
        suggestion: 'Take a heap snapshot to analyze memory allocation'
      });
    }
    
    // Check for event loop lag
    const lagMeasurement = await this._measureEventLoopLag();
    if (lagMeasurement.max > 100) {
      analysis.recommendations.push({
        type: 'event-loop',
        severity: 'medium',
        message: `Event loop lag detected: ${lagMeasurement.max}ms`,
        suggestion: 'Consider breaking up long-running synchronous operations'
      });
    }
    
    this.emit('bottleneck-analysis', analysis);
    return analysis;
  }
  
  /**
   * Analyze CPU profile data
   */
  async _analyzeCpuProfile(profileData) {
    const analysis = {
      totalTime: 0,
      hotFunctions: [],
      recommendations: []
    };
    
    if (typeof profileData === 'string') {
      try {
        const profile = JSON.parse(profileData);
        
        // Find hot functions
        if (profile.nodes) {
          const functionTimes = new Map();
          
          profile.nodes.forEach(node => {
            if (node.callFrame && node.callFrame.functionName) {
              const name = node.callFrame.functionName || '(anonymous)';
              const time = functionTimes.get(name) || 0;
              functionTimes.set(name, time + (node.hitCount || 0));
            }
          });
          
          // Sort by time
          analysis.hotFunctions = Array.from(functionTimes.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([name, time]) => ({ name, time, percentage: 0 }));
          
          analysis.totalTime = profile.endTime - profile.startTime;
        }
      } catch (error) {
        this.emit('warning', `Failed to analyze CPU profile: ${error.message}`);
      }
    }
    
    return analysis;
  }
  
  /**
   * Analyze heap snapshot data
   */
  async _analyzeHeapSnapshot(snapshotData) {
    const analysis = {
      totalSize: 0,
      objectCounts: {},
      largestObjects: [],
      possibleLeaks: []
    };
    
    if (snapshotData.memoryUsage) {
      analysis.totalSize = snapshotData.memoryUsage.heapTotal;
      analysis.usedSize = snapshotData.memoryUsage.heapUsed;
      analysis.external = snapshotData.memoryUsage.external;
    }
    
    return analysis;
  }
  
  /**
   * Start automatic profiling
   */
  _startAutoProfiling() {
    setInterval(async () => {
      try {
        const bottlenecks = await this.analyzeBottlenecks();
        
        if (bottlenecks.cpu.isBottleneck && this.config.enableCpuProfiling) {
          const profileId = this.startCpuProfiling();
          setTimeout(() => {
            this.stopCpuProfiling(profileId).catch(err => 
              this.emit('error', err)
            );
          }, this.config.profileDuration);
        }
        
        if (bottlenecks.memory.isBottleneck && this.config.enableMemoryProfiling) {
          await this.takeHeapSnapshot();
        }
      } catch (error) {
        this.emit('error', error);
      }
    }, this.config.heapSnapshotInterval);
  }
  
  /**
   * Start resource monitoring
   */
  _startResourceMonitoring() {
    // Monitor memory
    this.memoryWatcher = setInterval(() => {
      const usage = process.memoryUsage();
      this.emit('memory-usage', usage);
    }, 5000);
    
    // Monitor CPU
    let lastCpuUsage = process.cpuUsage();
    this.cpuWatcher = setInterval(() => {
      const currentUsage = process.cpuUsage(lastCpuUsage);
      lastCpuUsage = process.cpuUsage();
      this.emit('cpu-usage', currentUsage);
    }, 5000);
  }
  
  /**
   * Measure event loop lag
   */
  async _measureEventLoopLag() {
    return new Promise(resolve => {
      const measurements = [];
      let count = 0;
      
      const measure = () => {
        const start = Date.now();
        setImmediate(() => {
          const lag = Date.now() - start;
          measurements.push(lag);
          
          if (++count < 10) {
            measure();
          } else {
            resolve({
              avg: measurements.reduce((a, b) => a + b) / measurements.length,
              max: Math.max(...measurements),
              min: Math.min(...measurements)
            });
          }
        });
      };
      
      measure();
    });
  }
  
  /**
   * Shutdown profiler
   */
  async shutdown() {
    // Clear intervals
    if (this.memoryWatcher) clearInterval(this.memoryWatcher);
    if (this.cpuWatcher) clearInterval(this.cpuWatcher);
    
    // Stop all active profiles
    for (const [profileId, profile] of this.profiles) {
      if (profile.type === 'cpu') {
        await this.stopCpuProfiling(profileId).catch(() => {});
      }
    }
    
    this.isProfilingEnabled = false;
    this.emit('shutdown');
  }
}

module.exports = PerformanceProfiler;