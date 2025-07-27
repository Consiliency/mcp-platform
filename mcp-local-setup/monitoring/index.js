/**
 * Monitoring Module Index
 * Exports all monitoring and observability features
 */

const DistributedTracing = require('./distributed-tracing');
const PerformanceProfiler = require('./performance-profiler');
const AnomalyDetector = require('./anomaly-detector');
const PredictiveScaler = require('./predictive-scaler');

module.exports = {
  // Advanced Monitoring Features (FEATURE-8.2)
  DistributedTracing,
  PerformanceProfiler,
  AnomalyDetector,
  PredictiveScaler,
  
  // Factory functions
  createTracing(config) {
    return new DistributedTracing(config);
  },
  
  createProfiler(config) {
    return new PerformanceProfiler(config);
  },
  
  createAnomalyDetector(config) {
    return new AnomalyDetector(config);
  },
  
  createPredictiveScaler(config) {
    return new PredictiveScaler(config);
  },
  
  // Integrated monitoring suite
  async createMonitoringSuite(config = {}) {
    const suite = {
      tracing: new DistributedTracing(config.tracing),
      profiler: new PerformanceProfiler(config.profiler),
      anomalyDetector: new AnomalyDetector(config.anomaly),
      predictiveScaler: new PredictiveScaler(config.scaling)
    };
    
    // Initialize all components
    if (config.autoInitialize !== false) {
      await suite.tracing.initialize().catch(err => 
        console.warn('Tracing initialization failed:', err.message)
      );
      
      await suite.profiler.initialize().catch(err =>
        console.warn('Profiler initialization failed:', err.message)
      );
    }
    
    // Wire up integrations
    if (config.enableIntegrations !== false) {
      // Profiler detects bottlenecks -> Anomaly detector
      suite.profiler.on('bottleneck-analysis', (analysis) => {
        suite.anomalyDetector.processMetrics({
          cpu: analysis.cpu.usage * 100,
          memory: analysis.memory.percent * 100
        });
      });
      
      // Anomaly detector alerts -> Predictive scaler
      suite.anomalyDetector.on('alert', (alert) => {
        suite.predictiveScaler.collectUsageData({
          [alert.metric]: {
            [alert.metric.split('.')[1] || 'value']: alert.value
          }
        });
      });
      
      // Performance metrics -> Predictive scaler
      suite.profiler.on('cpu-usage', (usage) => {
        const percent = (usage.user + usage.system) / 1000000 * 100;
        suite.predictiveScaler.collectUsageData({
          system: { cpu: percent }
        });
      });
      
      suite.profiler.on('memory-usage', (usage) => {
        const percent = usage.rss / require('os').totalmem() * 100;
        suite.predictiveScaler.collectUsageData({
          system: { memory: percent }
        });
      });
    }
    
    return suite;
  }
};