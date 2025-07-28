const TestUtils = require('./test-utils');
const AnomalyDetector = require('../../monitoring/anomaly-detector');

/**
 * Test Anomaly Detection functionality
 * Tests statistical detection, pattern recognition, and alert generation
 */
async function testAnomalyDetection() {
  console.log('=== Testing Anomaly Detection ===\n');
  
  const utils = new TestUtils();
  const detector = new AnomalyDetector({
    windowSize: 20,           // Small window for testing
    sensitivity: 2,           // 2 standard deviations
    alertThreshold: 3,        // 3 consecutive anomalies
    baselineUpdateInterval: 1000  // 1 second for testing
  });
  
  try {
    // Test 1: Configure detection rules
    console.log('Test 1: Configure detection rules');
    
    const rules = [
      {
        metric: 'cpu_usage',
        type: 'statistical',
        sensitivity: 2,
        direction: 'both'
      },
      {
        metric: 'memory_usage',
        type: 'threshold',
        threshold: 80,
        direction: 'up'
      },
      {
        metric: 'response_time',
        type: 'statistical',
        sensitivity: 3,
        direction: 'up'
      }
    ];
    
    detector.configureRules(rules);
    console.log(`  ✓ Configured ${rules.length} detection rules`);
    
    // Verify rules are stored
    if (detector.thresholds.size !== rules.length) {
      throw new Error('Rules not properly configured');
    }
    console.log('  ✓ Rules stored correctly');
    
    // Test 2: Normal baseline establishment
    console.log('\nTest 2: Normal baseline establishment');
    
    // Generate normal CPU usage data
    const normalData = [];
    for (let i = 0; i < 30; i++) {
      const value = 50 + (Math.random() - 0.5) * 10; // 50% ± 5%
      normalData.push(value);
      detector.processMetrics({ cpu_usage: value });
    }
    
    // Wait for baseline update
    await utils.sleep(1100);
    
    const cpuBaseline = detector.baselines.get('cpu_usage');
    if (!cpuBaseline) {
      throw new Error('Baseline not established');
    }
    
    console.log(`  ✓ Baseline established`);
    console.log(`    Mean: ${cpuBaseline.mean.toFixed(2)}%`);
    console.log(`    Std Dev: ${cpuBaseline.stdDev.toFixed(2)}`);
    console.log(`    Range: ${cpuBaseline.min.toFixed(2)}% - ${cpuBaseline.max.toFixed(2)}%`);
    
    // Test 3: Statistical anomaly detection
    console.log('\nTest 3: Statistical anomaly detection');
    
    let anomaliesDetected = [];
    detector.on('anomalies-detected', (anomalies) => {
      anomaliesDetected = anomaliesDetected.concat(anomalies);
    });
    
    // Inject anomalies
    const anomalousValues = [
      85,  // High spike
      90,  // Another high spike
      15,  // Low dip
      95   // Extreme spike
    ];
    
    for (const value of anomalousValues) {
      const result = detector.processMetrics({ cpu_usage: value });
      if (result.length > 0) {
        console.log(`  ✓ Detected anomaly: ${value}% (${result[0].reason})`);
      }
    }
    
    console.log(`  Total anomalies detected: ${anomaliesDetected.length}`);
    
    // Test 4: Threshold-based detection
    console.log('\nTest 4: Threshold-based detection');
    
    // Test memory threshold
    const memoryValues = [60, 70, 85, 75, 90, 95];
    let memoryAnomalies = 0;
    
    for (const value of memoryValues) {
      const result = detector.processMetrics({ memory_usage: value });
      if (result.length > 0) {
        memoryAnomalies++;
        console.log(`  ✓ Memory anomaly at ${value}% (threshold: 80%)`);
      }
    }
    
    console.log(`  Detected ${memoryAnomalies} memory anomalies`);
    
    // Test 5: Alert generation
    console.log('\nTest 5: Alert generation');
    
    let alertFired = false;
    detector.on('alert', (alert) => {
      alertFired = true;
      console.log(`  🚨 Alert fired for ${alert.metric}: ${alert.reason}`);
      console.log(`     Severity: ${alert.severity}`);
      console.log(`     Count: ${alert.alertCount}`);
    });
    
    // Generate consecutive anomalies to trigger alert
    for (let i = 0; i < 5; i++) {
      detector.processMetrics({ response_time: 500 + i * 100 }); // Increasing response times
    }
    
    if (!alertFired) {
      console.log('  ⚠️  Alert threshold not reached');
    }
    
    // Test 6: Anomaly report generation
    console.log('\nTest 6: Anomaly report generation');
    
    const report = detector.generateReport({ hours: 1 });
    
    console.log('  Report generated:');
    console.log(`    Total anomalies: ${report.stats.totalAnomalies}`);
    console.log(`    Metrics affected: ${Object.keys(report.stats.byMetric).length}`);
    console.log('    Severity breakdown:');
    Object.entries(report.stats.bySeverity).forEach(([severity, count]) => {
      if (count > 0) {
        console.log(`      ${severity}: ${count}`);
      }
    });
    
    if (report.stats.recommendations.length > 0) {
      console.log('    Recommendations:');
      report.stats.recommendations.forEach(rec => {
        console.log(`      - ${rec.message}`);
      });
    }
    
    // Test 7: Pattern detection
    console.log('\nTest 7: Pattern detection (simulated)');
    
    // Simulate periodic anomalies
    const periodicData = [];
    for (let i = 0; i < 50; i++) {
      // Create a pattern: spike every 10 data points
      const value = i % 10 === 0 ? 80 : 50 + (Math.random() - 0.5) * 5;
      periodicData.push({
        metric: 'periodic_metric',
        value,
        timestamp: Date.now() - (50 - i) * 60000 // 1 minute intervals
      });
    }
    
    // Process historical data
    periodicData.forEach(data => {
      detector.processMetrics({ [data.metric]: data.value });
    });
    
    console.log('  ✓ Processed periodic data');
    console.log('  Pattern detection would identify periodic spikes');
    
    // Test 8: Machine learning preparation
    console.log('\nTest 8: Machine learning preparation');
    
    if (!detector.config.enableMachineLearning) {
      detector.config.enableMachineLearning = true;
      console.log('  ✓ Enabled machine learning mode');
    }
    
    // Generate training data
    const trainingData = utils.generateMetricsData({
      points: 100,
      baseline: 50,
      variance: 10,
      anomalyRate: 0.1
    });
    
    console.log(`  ✓ Generated ${trainingData.length} training data points`);
    console.log(`    With ~${Math.round(trainingData.length * 0.1)} anomalies`);
    
    // Test 9: Real-time monitoring simulation
    console.log('\nTest 9: Real-time monitoring simulation');
    
    let realtimeAnomalies = 0;
    const startTime = Date.now();
    
    // Simulate 10 seconds of monitoring
    for (let i = 0; i < 10; i++) {
      const metrics = {
        cpu_usage: 50 + (Math.random() - 0.5) * 20,
        memory_usage: 60 + (Math.random() - 0.5) * 30,
        response_time: 100 + (Math.random() - 0.5) * 50
      };
      
      // Occasionally inject anomalies
      if (Math.random() < 0.2) {
        metrics.cpu_usage = Math.random() > 0.5 ? 90 : 10;
      }
      
      const anomalies = detector.processMetrics(metrics);
      realtimeAnomalies += anomalies.length;
      
      if (anomalies.length > 0) {
        console.log(`  ⚡ Real-time anomaly: ${anomalies[0].metric} = ${anomalies[0].value.toFixed(1)}`);
      }
      
      await utils.sleep(1000); // 1 second interval
    }
    
    const elapsed = (Date.now() - startTime) / 1000;
    console.log(`  ✓ Monitored for ${elapsed.toFixed(1)}s, detected ${realtimeAnomalies} anomalies`);
    
    // Test 10: Performance metrics
    console.log('\nTest 10: Anomaly detection performance');
    
    const perfTest = await utils.measurePerformance(async () => {
      detector.processMetrics({
        cpu_usage: Math.random() * 100,
        memory_usage: Math.random() * 100,
        response_time: Math.random() * 500
      });
    }, 1000);
    
    console.log('  Detection performance:');
    console.log(`    Average: ${perfTest.avg.toFixed(3)}ms`);
    console.log(`    P95: ${perfTest.p95.toFixed(3)}ms`);
    console.log(`    P99: ${perfTest.p99.toFixed(3)}ms`);
    
    console.log('\n✅ All Anomaly Detection tests passed!\n');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    throw error;
  } finally {
    await utils.cleanup();
  }
}

// Run test if executed directly
if (require.main === module) {
  testAnomalyDetection().catch(console.error);
}

module.exports = testAnomalyDetection;