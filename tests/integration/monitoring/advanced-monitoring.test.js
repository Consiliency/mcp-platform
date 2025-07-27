/**
 * Integration tests for Advanced Monitoring Features (FEATURE-8.2)
 */

const {
  DistributedTracing,
  PerformanceProfiler,
  AnomalyDetector,
  PredictiveScaler,
  createMonitoringSuite
} = require('../../../mcp-local-setup/monitoring');
const path = require('path');
const fs = require('fs').promises;

describe('Advanced Monitoring Features', () => {
  describe('Distributed Tracing', () => {
    let tracing;
    
    beforeEach(() => {
      tracing = new DistributedTracing({
        serviceName: 'test-service',
        exporterUrl: 'http://localhost:4318/v1/traces',
        enableAutoInstrumentation: false
      });
    });
    
    afterEach(async () => {
      if (tracing.initialized) {
        await tracing.shutdown();
      }
    });
    
    test('should create distributed tracing instance', () => {
      expect(tracing).toBeDefined();
      expect(tracing.config.serviceName).toBe('test-service');
    });
    
    test('should handle span lifecycle', async () => {
      // Mock OpenTelemetry dependencies
      tracing.api = {
        trace: {
          getTracer: () => ({
            startSpan: jest.fn().mockReturnValue({
              spanContext: () => ({ spanId: 'test-span-123' }),
              setAttribute: jest.fn(),
              addEvent: jest.fn(),
              setStatus: jest.fn(),
              end: jest.fn()
            })
          })
        },
        context: {
          active: () => ({}),
          with: (ctx, fn) => fn()
        },
        propagation: {
          inject: jest.fn(),
          extract: jest.fn()
        },
        SpanKind: { INTERNAL: 'internal' }
      };
      
      tracing.tracer = tracing.api.trace.getTracer();
      
      const span = tracing.startSpan('test-operation', {
        attributes: { 'test.attribute': 'value' }
      });
      
      expect(span).toBeDefined();
      expect(span.spanId).toBe('test-span-123');
      
      span.setAttribute('additional', 'attribute');
      span.addEvent('test-event', { detail: 'test' });
      span.end();
      
      expect(tracing.spans.has('test-span-123')).toBe(false);
    });
    
    test('should inject and extract trace context', () => {
      tracing.api = {
        propagation: {
          inject: jest.fn(),
          extract: jest.fn().mockReturnValue({ traceId: 'test-trace' })
        },
        context: {
          active: () => ({})
        }
      };
      
      const message = { type: 'test' };
      const injected = tracing.injectTraceContext(message);
      
      expect(injected.headers).toBeDefined();
      expect(tracing.api.propagation.inject).toHaveBeenCalled();
      
      const context = tracing.extractTraceContext(injected);
      expect(context).toEqual({ traceId: 'test-trace' });
    });
  });
  
  describe('Performance Profiler', () => {
    let profiler;
    const profileDir = path.join(__dirname, 'test-profiles');
    
    beforeEach(async () => {
      await fs.mkdir(profileDir, { recursive: true });
      profiler = new PerformanceProfiler({
        outputDir: profileDir,
        autoProfile: false,
        enableCpuProfiling: true,
        enableMemoryProfiling: true
      });
    });
    
    afterEach(async () => {
      if (profiler.isProfilingEnabled) {
        await profiler.shutdown();
      }
      // Clean up profile directory
      try {
        await fs.rm(profileDir, { recursive: true, force: true });
      } catch (e) {
        // Ignore
      }
    });
    
    test('should create performance profiler instance', () => {
      expect(profiler).toBeDefined();
      expect(profiler.config.outputDir).toBe(profileDir);
    });
    
    test('should initialize profiler', async () => {
      await profiler.initialize();
      expect(profiler.isProfilingEnabled).toBe(true);
    });
    
    test('should analyze bottlenecks', async () => {
      await profiler.initialize();
      
      const analysis = await profiler.analyzeBottlenecks();
      
      expect(analysis).toBeDefined();
      expect(analysis.cpu).toBeDefined();
      expect(analysis.memory).toBeDefined();
      expect(analysis.recommendations).toBeInstanceOf(Array);
    });
    
    test('should start and stop CPU profiling', async () => {
      await profiler.initialize();
      
      const profileId = profiler.startCpuProfiling('test-profile');
      expect(profileId).toBe('test-profile');
      expect(profiler.profiles.has(profileId)).toBe(true);
      
      // Wait a bit for some samples
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const result = await profiler.stopCpuProfiling(profileId);
      expect(result.filename).toContain('test-profile');
      expect(result.analysis).toBeDefined();
    });
    
    test('should take heap snapshot', async () => {
      await profiler.initialize();
      
      const snapshot = await profiler.takeHeapSnapshot('test-heap');
      
      expect(snapshot).toBeDefined();
      expect(snapshot.id).toBe('test-heap');
      expect(snapshot.filename).toContain('test-heap');
      expect(snapshot.memoryUsage).toBeDefined();
    });
  });
  
  describe('Anomaly Detector', () => {
    let detector;
    
    beforeEach(() => {
      detector = new AnomalyDetector({
        windowSize: 50,
        sensitivity: 2,
        algorithms: ['statistical'],
        alertThreshold: 2
      });
    });
    
    test('should create anomaly detector instance', () => {
      expect(detector).toBeDefined();
      expect(detector.config.windowSize).toBe(50);
    });
    
    test('should configure detection rules', () => {
      const rules = [
        {
          metric: 'cpu.usage',
          type: 'threshold',
          threshold: 80,
          direction: 'up'
        },
        {
          metric: 'memory.usage',
          type: 'statistical',
          sensitivity: 3
        }
      ];
      
      detector.configureRules(rules);
      
      expect(detector.thresholds.has('cpu.usage')).toBe(true);
      expect(detector.thresholds.has('memory.usage')).toBe(true);
    });
    
    test('should detect threshold anomalies', () => {
      detector.configureRules([{
        metric: 'cpu',
        type: 'threshold',
        threshold: 80,
        direction: 'up'
      }]);
      
      // Build baseline
      for (let i = 0; i < 20; i++) {
        detector.processMetrics({ cpu: 50 + Math.random() * 10 });
      }
      
      // Trigger anomaly
      const anomalies = detector.processMetrics({ cpu: 90 });
      
      expect(anomalies).toHaveLength(1);
      expect(anomalies[0].metric).toBe('cpu');
      expect(anomalies[0].reason).toContain('exceeds threshold');
    });
    
    test('should detect statistical anomalies', () => {
      detector.configureRules([{
        metric: 'latency',
        type: 'statistical',
        sensitivity: 2
      }]);
      
      // Build baseline with normal values
      for (let i = 0; i < 50; i++) {
        detector.processMetrics({ latency: 100 + Math.random() * 10 });
      }
      
      // Inject anomaly
      const anomalies = detector.processMetrics({ latency: 200 });
      
      expect(anomalies.length).toBeGreaterThan(0);
      expect(anomalies[0].reason).toContain('Statistical anomaly');
    });
    
    test('should generate anomaly report', () => {
      // Add some test anomalies
      detector.anomalies = [
        {
          metric: 'cpu',
          value: 95,
          timestamp: Date.now() - 1000,
          severity: 'high',
          reason: 'Test anomaly'
        },
        {
          metric: 'memory',
          value: 85,
          timestamp: Date.now() - 2000,
          severity: 'medium',
          reason: 'Test anomaly'
        }
      ];
      
      const report = detector.generateReport({ hours: 1 });
      
      expect(report).toBeDefined();
      expect(report.stats.totalAnomalies).toBe(2);
      expect(report.stats.byMetric).toBeDefined();
      expect(report.stats.recommendations).toBeInstanceOf(Array);
    });
  });
  
  describe('Predictive Scaler', () => {
    let scaler;
    
    beforeEach(() => {
      scaler = new PredictiveScaler({
        windowSize: 100,
        predictionHorizon: 60000,
        enableAutoScaling: false,
        minInstances: 1,
        maxInstances: 5
      });
    });
    
    afterEach(() => {
      scaler.stop();
    });
    
    test('should create predictive scaler instance', () => {
      expect(scaler).toBeDefined();
      expect(scaler.config.windowSize).toBe(100);
    });
    
    test('should collect usage data', () => {
      const metrics = {
        'server-1': {
          cpu: 50,
          memory: 60,
          requests: 100
        }
      };
      
      scaler.collectUsageData(metrics);
      
      expect(scaler.historicalData.has('server-1')).toBe(true);
      const history = scaler.historicalData.get('server-1');
      expect(history.cpu).toHaveLength(1);
      expect(history.cpu[0]).toBe(50);
    });
    
    test('should configure scaling policy', () => {
      const policy = scaler.configurePolicy('server-1', {
        minInstances: 2,
        maxInstances: 10,
        scaleUpThreshold: 0.75,
        scaleDownThreshold: 0.25
      });
      
      expect(policy.serverId).toBe('server-1');
      expect(policy.minInstances).toBe(2);
      expect(policy.maxInstances).toBe(10);
    });
    
    test('should predict resource needs', async () => {
      // Add historical data
      for (let i = 0; i < 20; i++) {
        scaler.collectUsageData({
          'server-1': {
            cpu: 40 + i * 2, // Increasing trend
            memory: 50 + Math.random() * 10,
            requests: 100 + i * 10
          }
        });
      }
      
      const prediction = await scaler.predictResourceNeeds('server-1');
      
      expect(prediction).toBeDefined();
      expect(prediction.serverId).toBe('server-1');
      expect(prediction.metrics.cpu).toBeDefined();
      expect(prediction.metrics.cpu.trend).toBe('increasing');
      expect(prediction.recommendation).toBeDefined();
    });
    
    test('should calculate scaling recommendations', async () => {
      scaler.configurePolicy('server-1', {
        scaleUpThreshold: 0.7,
        scaleDownThreshold: 0.3
      });
      
      // High utilization scenario
      for (let i = 0; i < 20; i++) {
        scaler.collectUsageData({
          'server-1': {
            cpu: 80 + Math.random() * 10,
            memory: 75 + Math.random() * 10,
            requests: 1000
          }
        });
      }
      
      const prediction = await scaler.predictResourceNeeds('server-1');
      expect(prediction.recommendation.action).toBe('scale-up');
      
      // Low utilization scenario
      scaler.historicalData.clear();
      for (let i = 0; i < 20; i++) {
        scaler.collectUsageData({
          'server-1': {
            cpu: 20 + Math.random() * 5,
            memory: 25 + Math.random() * 5,
            requests: 100
          }
        });
      }
      
      const prediction2 = await scaler.predictResourceNeeds('server-1');
      expect(prediction2.recommendation.action).toBe('scale-down');
    });
  });
  
  describe('Integrated Monitoring Suite', () => {
    let suite;
    
    beforeEach(async () => {
      suite = await createMonitoringSuite({
        autoInitialize: false,
        enableIntegrations: true
      });
    });
    
    afterEach(async () => {
      if (suite.tracing.initialized) {
        await suite.tracing.shutdown();
      }
      if (suite.profiler.isProfilingEnabled) {
        await suite.profiler.shutdown();
      }
      if (suite.predictiveScaler.predictionInterval) {
        suite.predictiveScaler.stop();
      }
    });
    
    test('should create integrated monitoring suite', () => {
      expect(suite).toBeDefined();
      expect(suite.tracing).toBeInstanceOf(DistributedTracing);
      expect(suite.profiler).toBeInstanceOf(PerformanceProfiler);
      expect(suite.anomalyDetector).toBeInstanceOf(AnomalyDetector);
      expect(suite.predictiveScaler).toBeInstanceOf(PredictiveScaler);
    });
    
    test('should integrate components via events', async () => {
      const mockData = [];
      
      // Capture data flow
      suite.predictiveScaler.collectUsageData = jest.fn();
      suite.anomalyDetector.processMetrics = jest.fn();
      
      // Trigger profiler event
      suite.profiler.emit('bottleneck-analysis', {
        cpu: { usage: 0.8 },
        memory: { percent: 0.7 }
      });
      
      expect(suite.anomalyDetector.processMetrics).toHaveBeenCalledWith({
        cpu: 80,
        memory: 70
      });
      
      // Trigger anomaly alert
      suite.anomalyDetector.emit('alert', {
        metric: 'system.cpu',
        value: 90
      });
      
      expect(suite.predictiveScaler.collectUsageData).toHaveBeenCalledWith({
        'system.cpu': { cpu: 90 }
      });
    });
  });
});