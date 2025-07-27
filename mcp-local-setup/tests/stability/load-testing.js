const autocannon = require('autocannon');
const fs = require('fs').promises;
const path = require('path');
const EventEmitter = require('events');

/**
 * Load Testing Suite (STABILITY-8.2)
 * Performance testing under load
 */
class LoadTestingSuite extends EventEmitter {
  constructor(options = {}) {
    super();
    this.results = [];
    this.scenarios = new Map();
    this.targetUrl = options.targetUrl || 'http://localhost:3000';
    this.reportDir = options.reportDir || './test-results/load-tests';
    
    // SLA thresholds
    this.slaThresholds = {
      responseTime: {
        p50: 100,  // 50th percentile should be under 100ms
        p95: 500,  // 95th percentile should be under 500ms
        p99: 1000  // 99th percentile should be under 1s
      },
      errorRate: 0.01, // Less than 1% error rate
      throughput: 1000  // At least 1000 req/s
    };
    
    // Initialize scenarios
    this.defineScenarios();
  }
  
  /**
   * Define load test scenarios
   * TASK: Create realistic load scenarios
   */
  defineScenarios() {
    // Normal load scenario
    this.scenarios.set('normal', {
      name: 'Normal Load',
      description: 'Typical daily traffic pattern',
      connections: 10,
      pipelining: 1,
      duration: 30,
      requests: [
        { method: 'GET', path: '/api/health' },
        { method: 'GET', path: '/api/status' },
        { method: 'POST', path: '/api/data', body: JSON.stringify({ test: true }) }
      ]
    });
    
    // Peak load scenario
    this.scenarios.set('peak', {
      name: 'Peak Load',
      description: 'High traffic during peak hours',
      connections: 100,
      pipelining: 10,
      duration: 60,
      requests: [
        { method: 'GET', path: '/api/health', weight: 0.1 },
        { method: 'GET', path: '/api/products', weight: 0.4 },
        { method: 'POST', path: '/api/orders', weight: 0.3, body: JSON.stringify({ items: [] }) },
        { method: 'GET', path: '/api/user/profile', weight: 0.2 }
      ]
    });
    
    // Sustained load scenario
    this.scenarios.set('sustained', {
      name: 'Sustained Load',
      description: 'Extended period of moderate load',
      connections: 50,
      pipelining: 5,
      duration: 300, // 5 minutes
      requests: [
        { method: 'GET', path: '/api/health' },
        { method: 'GET', path: '/api/metrics' },
        { method: 'POST', path: '/api/events', body: JSON.stringify({ event: 'test' }) }
      ]
    });
    
    // Spike test scenario
    this.scenarios.set('spike', {
      name: 'Spike Test',
      description: 'Sudden traffic spike simulation',
      connections: 200,
      pipelining: 20,
      duration: 30,
      warmup: {
        connections: 10,
        duration: 10
      },
      requests: [
        { method: 'GET', path: '/api/health' },
        { method: 'GET', path: '/api/products' },
        { method: 'GET', path: '/api/featured' }
      ]
    });
    
    // Stress test scenario
    this.scenarios.set('stress', {
      name: 'Stress Test',
      description: 'Find system breaking point',
      connections: 500,
      pipelining: 50,
      duration: 60,
      bailout: 10000, // Stop if error rate exceeds 10k
      requests: [
        { method: 'GET', path: '/api/heavy-operation' },
        { method: 'POST', path: '/api/bulk-process', body: JSON.stringify({ count: 100 }) }
      ]
    });
  }
  
  /**
   * Execute load test
   * TASK: Run load tests with autocannon
   */
  async runLoadTest(scenarioName, options = {}) {
    const scenario = this.scenarios.get(scenarioName);
    if (!scenario) {
      throw new Error(`Unknown scenario: ${scenarioName}`);
    }
    
    console.log(`Starting load test: ${scenario.name}`);
    console.log(`Description: ${scenario.description}`);
    
    // Merge scenario with options
    const config = {
      url: this.targetUrl,
      connections: scenario.connections,
      pipelining: scenario.pipelining,
      duration: scenario.duration,
      bailout: scenario.bailout,
      ...options
    };
    
    // Add requests if defined
    if (scenario.requests) {
      config.requests = scenario.requests;
    }
    
    // Emit start event
    this.emit('testStarted', {
      scenario: scenarioName,
      config,
      timestamp: new Date().toISOString()
    });
    
    try {
      // Run warmup if defined
      if (scenario.warmup) {
        console.log('Running warmup phase...');
        await this._runWarmup(scenario.warmup);
      }
      
      // Execute the load test
      const instance = autocannon(config);
      
      // Track progress
      instance.on('tick', (counter) => {
        this.emit('progress', {
          scenario: scenarioName,
          counter,
          timestamp: new Date().toISOString()
        });
      });
      
      // Wait for completion
      const results = await instance;
      
      // Process and store results
      const processedResults = this._processResults(results, scenario);
      this.results.push(processedResults);
      
      // Emit completion event
      this.emit('testCompleted', {
        scenario: scenarioName,
        results: processedResults,
        timestamp: new Date().toISOString()
      });
      
      return processedResults;
      
    } catch (error) {
      this.emit('testFailed', {
        scenario: scenarioName,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      
      throw error;
    }
  }
  
  /**
   * Run warmup phase
   * @private
   */
  async _runWarmup(warmupConfig) {
    const config = {
      url: this.targetUrl,
      connections: warmupConfig.connections,
      duration: warmupConfig.duration,
      silent: true
    };
    
    await autocannon(config);
  }
  
  /**
   * Process raw results
   * @private
   */
  _processResults(raw, scenario) {
    return {
      scenario: scenario.name,
      timestamp: new Date().toISOString(),
      duration: raw.duration,
      connections: raw.connections,
      pipelining: raw.pipelining,
      requests: {
        total: raw.requests.total,
        average: raw.requests.average,
        mean: raw.requests.mean,
        stddev: raw.requests.stddev,
        min: raw.requests.min,
        max: raw.requests.max,
        p1: raw.requests.p1,
        p2_5: raw.requests.p2_5,
        p50: raw.requests.p50,
        p97_5: raw.requests.p97_5,
        p99: raw.requests.p99
      },
      latency: {
        average: raw.latency.average,
        mean: raw.latency.mean,
        stddev: raw.latency.stddev,
        min: raw.latency.min,
        max: raw.latency.max,
        p50: raw.latency.p50,
        p75: raw.latency.p75,
        p90: raw.latency.p90,
        p95: raw.latency.p95,
        p99: raw.latency.p99,
        p99_9: raw.latency.p99_9,
        p99_99: raw.latency.p99_99
      },
      throughput: {
        average: raw.throughput.average,
        mean: raw.throughput.mean,
        stddev: raw.throughput.stddev,
        min: raw.throughput.min,
        max: raw.throughput.max,
        total: raw.throughput.total
      },
      errors: raw.errors,
      timeouts: raw.timeouts,
      errorRate: raw.errors / raw.requests.total,
      non2xx: raw.non2xx || 0
    };
  }
  
  /**
   * Analyze performance results
   * TASK: Process test results
   */
  async analyzeResults(results = null) {
    const testResults = results || this.results;
    
    if (testResults.length === 0) {
      throw new Error('No results to analyze');
    }
    
    const analysis = {
      summary: {
        totalTests: testResults.length,
        timestamp: new Date().toISOString()
      },
      slaCompliance: {},
      bottlenecks: [],
      recommendations: []
    };
    
    // Analyze each test result
    for (const result of testResults) {
      const compliance = this._checkSLACompliance(result);
      analysis.slaCompliance[result.scenario] = compliance;
      
      // Identify bottlenecks
      if (result.latency.p95 > this.slaThresholds.responseTime.p95) {
        analysis.bottlenecks.push({
          scenario: result.scenario,
          issue: 'High p95 latency',
          value: result.latency.p95,
          threshold: this.slaThresholds.responseTime.p95
        });
      }
      
      if (result.errorRate > this.slaThresholds.errorRate) {
        analysis.bottlenecks.push({
          scenario: result.scenario,
          issue: 'High error rate',
          value: (result.errorRate * 100).toFixed(2) + '%',
          threshold: (this.slaThresholds.errorRate * 100) + '%'
        });
      }
      
      if (result.throughput.average < this.slaThresholds.throughput) {
        analysis.bottlenecks.push({
          scenario: result.scenario,
          issue: 'Low throughput',
          value: result.throughput.average,
          threshold: this.slaThresholds.throughput
        });
      }
    }
    
    // Generate recommendations
    analysis.recommendations = this._generateRecommendations(analysis.bottlenecks);
    
    return analysis;
  }
  
  /**
   * Check SLA compliance
   * @private
   */
  _checkSLACompliance(result) {
    return {
      responseTime: {
        p50: {
          value: result.latency.p50,
          threshold: this.slaThresholds.responseTime.p50,
          passed: result.latency.p50 <= this.slaThresholds.responseTime.p50
        },
        p95: {
          value: result.latency.p95,
          threshold: this.slaThresholds.responseTime.p95,
          passed: result.latency.p95 <= this.slaThresholds.responseTime.p95
        },
        p99: {
          value: result.latency.p99,
          threshold: this.slaThresholds.responseTime.p99,
          passed: result.latency.p99 <= this.slaThresholds.responseTime.p99
        }
      },
      errorRate: {
        value: (result.errorRate * 100).toFixed(2) + '%',
        threshold: (this.slaThresholds.errorRate * 100) + '%',
        passed: result.errorRate <= this.slaThresholds.errorRate
      },
      throughput: {
        value: result.throughput.average,
        threshold: this.slaThresholds.throughput,
        passed: result.throughput.average >= this.slaThresholds.throughput
      }
    };
  }
  
  /**
   * Generate recommendations based on bottlenecks
   * @private
   */
  _generateRecommendations(bottlenecks) {
    const recommendations = [];
    
    // Check for latency issues
    const latencyIssues = bottlenecks.filter(b => b.issue.includes('latency'));
    if (latencyIssues.length > 0) {
      recommendations.push({
        category: 'Performance',
        priority: 'High',
        recommendation: 'Consider implementing caching, optimizing database queries, or scaling horizontally'
      });
    }
    
    // Check for error rate issues
    const errorIssues = bottlenecks.filter(b => b.issue.includes('error'));
    if (errorIssues.length > 0) {
      recommendations.push({
        category: 'Reliability',
        priority: 'Critical',
        recommendation: 'Investigate error logs, implement retry mechanisms, and add circuit breakers'
      });
    }
    
    // Check for throughput issues
    const throughputIssues = bottlenecks.filter(b => b.issue.includes('throughput'));
    if (throughputIssues.length > 0) {
      recommendations.push({
        category: 'Scalability',
        priority: 'High',
        recommendation: 'Consider load balancing, connection pooling, or vertical scaling'
      });
    }
    
    // General recommendations
    if (bottlenecks.length === 0) {
      recommendations.push({
        category: 'General',
        priority: 'Low',
        recommendation: 'System is performing within SLA. Consider testing with higher loads'
      });
    }
    
    return recommendations;
  }
  
  /**
   * Generate load test report
   * TASK: Create detailed reports
   */
  async generateReport(format = 'json') {
    const analysis = await this.analyzeResults();
    
    const report = {
      title: 'Load Testing Report',
      generatedAt: new Date().toISOString(),
      targetUrl: this.targetUrl,
      scenarios: Array.from(this.scenarios.values()).map(s => ({
        name: s.name,
        description: s.description
      })),
      results: this.results,
      analysis,
      metadata: {
        testDuration: this._calculateTotalDuration(),
        totalRequests: this._calculateTotalRequests(),
        averageLatency: this._calculateAverageLatency(),
        peakThroughput: this._calculatePeakThroughput()
      }
    };
    
    // Ensure report directory exists
    await fs.mkdir(this.reportDir, { recursive: true });
    
    // Generate report based on format
    let filename;
    let content;
    
    switch (format) {
      case 'json':
        filename = `load-test-report-${Date.now()}.json`;
        content = JSON.stringify(report, null, 2);
        break;
        
      case 'html':
        filename = `load-test-report-${Date.now()}.html`;
        content = this._generateHTMLReport(report);
        break;
        
      case 'markdown':
        filename = `load-test-report-${Date.now()}.md`;
        content = this._generateMarkdownReport(report);
        break;
        
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
    
    // Write report to file
    const filepath = path.join(this.reportDir, filename);
    await fs.writeFile(filepath, content);
    
    console.log(`Report generated: ${filepath}`);
    
    // Emit report generated event
    this.emit('reportGenerated', {
      filepath,
      format,
      timestamp: new Date().toISOString()
    });
    
    return { filepath, report };
  }
  
  /**
   * Calculate total test duration
   * @private
   */
  _calculateTotalDuration() {
    return this.results.reduce((total, result) => total + result.duration, 0);
  }
  
  /**
   * Calculate total requests
   * @private
   */
  _calculateTotalRequests() {
    return this.results.reduce((total, result) => total + result.requests.total, 0);
  }
  
  /**
   * Calculate average latency across all tests
   * @private
   */
  _calculateAverageLatency() {
    if (this.results.length === 0) return 0;
    
    const totalLatency = this.results.reduce((sum, result) => sum + result.latency.average, 0);
    return Math.round(totalLatency / this.results.length);
  }
  
  /**
   * Calculate peak throughput
   * @private
   */
  _calculatePeakThroughput() {
    if (this.results.length === 0) return 0;
    
    return Math.max(...this.results.map(r => r.throughput.max));
  }
  
  /**
   * Generate HTML report
   * @private
   */
  _generateHTMLReport(report) {
    return `
<!DOCTYPE html>
<html>
<head>
  <title>${report.title}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    h1, h2, h3 { color: #333; }
    table { border-collapse: collapse; width: 100%; margin: 20px 0; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f2f2f2; }
    .passed { color: green; }
    .failed { color: red; }
    .metric { margin: 10px 0; }
  </style>
</head>
<body>
  <h1>${report.title}</h1>
  <p>Generated at: ${report.generatedAt}</p>
  <p>Target URL: ${report.targetUrl}</p>
  
  <h2>Test Summary</h2>
  <div class="metric">Total Duration: ${report.metadata.testDuration}s</div>
  <div class="metric">Total Requests: ${report.metadata.totalRequests}</div>
  <div class="metric">Average Latency: ${report.metadata.averageLatency}ms</div>
  <div class="metric">Peak Throughput: ${report.metadata.peakThroughput} req/s</div>
  
  <h2>SLA Compliance</h2>
  ${this._generateSLATable(report.analysis.slaCompliance)}
  
  <h2>Bottlenecks</h2>
  ${this._generateBottlenecksTable(report.analysis.bottlenecks)}
  
  <h2>Recommendations</h2>
  ${this._generateRecommendationsList(report.analysis.recommendations)}
</body>
</html>
    `;
  }
  
  /**
   * Generate SLA compliance table
   * @private
   */
  _generateSLATable(compliance) {
    let html = '<table><tr><th>Scenario</th><th>Metric</th><th>Value</th><th>Threshold</th><th>Status</th></tr>';
    
    for (const [scenario, metrics] of Object.entries(compliance)) {
      html += `<tr><td rowspan="5">${scenario}</td></tr>`;
      html += `<tr><td>Response Time p50</td><td>${metrics.responseTime.p50.value}ms</td><td>${metrics.responseTime.p50.threshold}ms</td><td class="${metrics.responseTime.p50.passed ? 'passed' : 'failed'}">${metrics.responseTime.p50.passed ? 'PASS' : 'FAIL'}</td></tr>`;
      html += `<tr><td>Response Time p95</td><td>${metrics.responseTime.p95.value}ms</td><td>${metrics.responseTime.p95.threshold}ms</td><td class="${metrics.responseTime.p95.passed ? 'passed' : 'failed'}">${metrics.responseTime.p95.passed ? 'PASS' : 'FAIL'}</td></tr>`;
      html += `<tr><td>Response Time p99</td><td>${metrics.responseTime.p99.value}ms</td><td>${metrics.responseTime.p99.threshold}ms</td><td class="${metrics.responseTime.p99.passed ? 'passed' : 'failed'}">${metrics.responseTime.p99.passed ? 'PASS' : 'FAIL'}</td></tr>`;
      html += `<tr><td>Error Rate</td><td>${metrics.errorRate.value}</td><td>${metrics.errorRate.threshold}</td><td class="${metrics.errorRate.passed ? 'passed' : 'failed'}">${metrics.errorRate.passed ? 'PASS' : 'FAIL'}</td></tr>`;
      html += `<tr><td>Throughput</td><td>${metrics.throughput.value} req/s</td><td>${metrics.throughput.threshold} req/s</td><td class="${metrics.throughput.passed ? 'passed' : 'failed'}">${metrics.throughput.passed ? 'PASS' : 'FAIL'}</td></tr>`;
    }
    
    html += '</table>';
    return html;
  }
  
  /**
   * Generate bottlenecks table
   * @private
   */
  _generateBottlenecksTable(bottlenecks) {
    if (bottlenecks.length === 0) {
      return '<p>No bottlenecks identified.</p>';
    }
    
    let html = '<table><tr><th>Scenario</th><th>Issue</th><th>Value</th><th>Threshold</th></tr>';
    
    for (const bottleneck of bottlenecks) {
      html += `<tr><td>${bottleneck.scenario}</td><td>${bottleneck.issue}</td><td>${bottleneck.value}</td><td>${bottleneck.threshold}</td></tr>`;
    }
    
    html += '</table>';
    return html;
  }
  
  /**
   * Generate recommendations list
   * @private
   */
  _generateRecommendationsList(recommendations) {
    let html = '<ul>';
    
    for (const rec of recommendations) {
      html += `<li><strong>${rec.category} (${rec.priority}):</strong> ${rec.recommendation}</li>`;
    }
    
    html += '</ul>';
    return html;
  }
  
  /**
   * Generate Markdown report
   * @private
   */
  _generateMarkdownReport(report) {
    let md = `# ${report.title}\n\n`;
    md += `Generated at: ${report.generatedAt}\n\n`;
    md += `Target URL: ${report.targetUrl}\n\n`;
    
    md += `## Test Summary\n\n`;
    md += `- Total Duration: ${report.metadata.testDuration}s\n`;
    md += `- Total Requests: ${report.metadata.totalRequests}\n`;
    md += `- Average Latency: ${report.metadata.averageLatency}ms\n`;
    md += `- Peak Throughput: ${report.metadata.peakThroughput} req/s\n\n`;
    
    md += `## Scenarios Tested\n\n`;
    for (const scenario of report.scenarios) {
      md += `- **${scenario.name}**: ${scenario.description}\n`;
    }
    
    md += `\n## SLA Compliance\n\n`;
    for (const [scenario, metrics] of Object.entries(report.analysis.slaCompliance)) {
      md += `### ${scenario}\n\n`;
      md += `| Metric | Value | Threshold | Status |\n`;
      md += `|--------|-------|-----------|--------|\n`;
      md += `| Response Time p50 | ${metrics.responseTime.p50.value}ms | ${metrics.responseTime.p50.threshold}ms | ${metrics.responseTime.p50.passed ? '✅ PASS' : '❌ FAIL'} |\n`;
      md += `| Response Time p95 | ${metrics.responseTime.p95.value}ms | ${metrics.responseTime.p95.threshold}ms | ${metrics.responseTime.p95.passed ? '✅ PASS' : '❌ FAIL'} |\n`;
      md += `| Response Time p99 | ${metrics.responseTime.p99.value}ms | ${metrics.responseTime.p99.threshold}ms | ${metrics.responseTime.p99.passed ? '✅ PASS' : '❌ FAIL'} |\n`;
      md += `| Error Rate | ${metrics.errorRate.value} | ${metrics.errorRate.threshold} | ${metrics.errorRate.passed ? '✅ PASS' : '❌ FAIL'} |\n`;
      md += `| Throughput | ${metrics.throughput.value} req/s | ${metrics.throughput.threshold} req/s | ${metrics.throughput.passed ? '✅ PASS' : '❌ FAIL'} |\n\n`;
    }
    
    if (report.analysis.bottlenecks.length > 0) {
      md += `## Bottlenecks Identified\n\n`;
      md += `| Scenario | Issue | Value | Threshold |\n`;
      md += `|----------|-------|-------|------------|\n`;
      for (const bottleneck of report.analysis.bottlenecks) {
        md += `| ${bottleneck.scenario} | ${bottleneck.issue} | ${bottleneck.value} | ${bottleneck.threshold} |\n`;
      }
      md += '\n';
    }
    
    md += `## Recommendations\n\n`;
    for (const rec of report.analysis.recommendations) {
      md += `- **${rec.category} (${rec.priority})**: ${rec.recommendation}\n`;
    }
    
    return md;
  }
  
  /**
   * Run all scenarios
   */
  async runAllScenarios() {
    console.log('Running all load test scenarios...\n');
    
    for (const [name, scenario] of this.scenarios) {
      console.log(`\n--- Running ${scenario.name} ---`);
      
      try {
        await this.runLoadTest(name);
        console.log(`✅ ${scenario.name} completed`);
      } catch (error) {
        console.error(`❌ ${scenario.name} failed: ${error.message}`);
      }
      
      // Pause between scenarios
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    console.log('\nAll scenarios completed. Generating report...');
    return this.generateReport('markdown');
  }
}

module.exports = LoadTestingSuite;