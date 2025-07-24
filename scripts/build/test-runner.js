#!/usr/bin/env node

/**
 * Test Runner Script
 * Executes comprehensive test suites with coverage and reporting
 * 
 * @module scripts/build/test-runner
 * @assigned-to CI/CD Team
 */

const path = require('path');
const fs = require('fs').promises;
const { spawn } = require('child_process');
const os = require('os');

class TestRunner {
  constructor(options = {}) {
    this.options = {
      testTypes: options.testTypes || ['unit', 'integration', 'e2e'],
      coverage: options.coverage !== false,
      parallel: options.parallel || false,
      bail: options.bail || false,
      reporter: options.reporter || 'default',
      maxWorkers: options.maxWorkers || os.cpus().length,
      timeout: options.timeout || 300000, // 5 minutes default
      outputDir: options.outputDir || path.join(__dirname, '../../test-results'),
      coverageDir: options.coverageDir || path.join(__dirname, '../../coverage'),
      verbose: options.verbose || false,
      watch: options.watch || false,
      updateSnapshots: options.updateSnapshots || false,
      ...options
    };
    
    this.results = {
      suites: {},
      totals: {
        passed: 0,
        failed: 0,
        skipped: 0,
        duration: 0
      }
    };
  }

  // Main test execution method
  async runTests() {
    console.log(`🧪 Running tests: ${this.options.testTypes.join(', ')}...`);
    
    try {
      const startTime = Date.now();
      
      await this.setupEnvironment();
      
      if (this.options.parallel && this.options.testTypes.length > 1) {
        await this.runTestsParallel();
      } else {
        await this.runTestsSequential();
      }
      
      this.results.totals.duration = Date.now() - startTime;
      
      if (this.options.coverage) {
        await this.generateCoverageReport();
      }
      
      await this.generateTestReport();
      
      if (this.results.totals.failed > 0) {
        console.error(`\n❌ Tests failed: ${this.results.totals.failed} failures`);
        process.exit(1);
      }
      
      console.log(`\n✅ All tests passed! (${this.results.totals.passed} tests in ${(this.results.totals.duration / 1000).toFixed(2)}s)`);
      return this.results;
    } catch (error) {
      console.error('❌ Test execution failed:', error);
      process.exit(1);
    }
  }

  async runTestsSequential() {
    for (const testType of this.options.testTypes) {
      console.log(`\n  Running ${testType} tests...`);
      
      const results = await this.runTestType(testType);
      this.results.suites[testType] = results;
      this.mergeResults(this.results.totals, results);
      
      if (this.options.bail && results.failed > 0) {
        console.error(`  ⚠️  Bailing due to failures in ${testType} tests`);
        break;
      }
    }
  }

  async runTestsParallel() {
    console.log(`  Running tests in parallel (max ${this.options.maxWorkers} workers)...`);
    
    const promises = this.options.testTypes.map(testType => 
      this.runTestType(testType).then(results => {
        this.results.suites[testType] = results;
        return results;
      })
    );
    
    const results = await Promise.all(promises);
    results.forEach(result => this.mergeResults(this.results.totals, result));
  }

  // Setup test environment
  async setupEnvironment() {
    console.log('  Setting up test environment...');
    
    // Create output directories
    await fs.mkdir(this.options.outputDir, { recursive: true });
    await fs.mkdir(this.options.coverageDir, { recursive: true });
    
    // Set environment variables
    process.env.NODE_ENV = 'test';
    process.env.CI = 'true';
    
    // Clean previous results
    const files = await fs.readdir(this.options.outputDir);
    for (const file of files) {
      if (file.endsWith('.xml') || file.endsWith('.json')) {
        await fs.unlink(path.join(this.options.outputDir, file));
      }
    }
    
    console.log('    ✓ Environment ready');
  }

  // Run specific test type
  async runTestType(testType) {
    const results = {
      testType,
      passed: 0,
      failed: 0,
      skipped: 0,
      duration: 0,
      tests: [],
      coverage: null
    };
    
    const startTime = Date.now();
    
    try {
      switch (testType) {
        case 'unit':
          await this.runUnitTests(results);
          break;
        case 'integration':
          await this.runIntegrationTests(results);
          break;
        case 'e2e':
          await this.runE2ETests(results);
          break;
        default:
          throw new Error(`Unknown test type: ${testType}`);
      }
      
      results.duration = Date.now() - startTime;
      console.log(`    ✓ ${testType} tests: ${results.passed} passed, ${results.failed} failed (${(results.duration / 1000).toFixed(2)}s)`);
      
      return results;
    } catch (error) {
      results.failed++;
      results.duration = Date.now() - startTime;
      console.error(`    ✗ ${testType} tests failed: ${error.message}`);
      return results;
    }
  }

  async runUnitTests(results) {
    const args = [
      'run',
      'test:unit',
      '--',
      '--json',
      '--outputFile=' + path.join(this.options.outputDir, 'unit-results.json')
    ];
    
    if (this.options.coverage) {
      args.push('--coverage');
      args.push('--coverageDirectory=' + path.join(this.options.coverageDir, 'unit'));
    }
    
    if (this.options.watch) {
      args.push('--watch');
    }
    
    if (this.options.updateSnapshots) {
      args.push('--updateSnapshot');
    }
    
    if (this.options.verbose) {
      args.push('--verbose');
    }
    
    const output = await this.runCommand('npm', args);
    await this.parseJestResults(results, path.join(this.options.outputDir, 'unit-results.json'));
  }

  async runIntegrationTests(results) {
    // Start test database
    await this.startTestDatabase();
    
    try {
      const args = [
        'run',
        'test:integration',
        '--',
        '--json',
        '--outputFile=' + path.join(this.options.outputDir, 'integration-results.json')
      ];
      
      if (this.options.coverage) {
        args.push('--coverage');
        args.push('--coverageDirectory=' + path.join(this.options.coverageDir, 'integration'));
      }
      
      const output = await this.runCommand('npm', args);
      await this.parseJestResults(results, path.join(this.options.outputDir, 'integration-results.json'));
    } finally {
      await this.stopTestDatabase();
    }
  }

  async runE2ETests(results) {
    // Start application server
    await this.startTestServer();
    
    try {
      const args = [
        'run',
        'test:e2e',
        '--',
        '--reporter=json',
        '--reporter-options',
        'output=' + path.join(this.options.outputDir, 'e2e-results.json')
      ];
      
      if (this.options.verbose) {
        args.push('--headed');
      }
      
      const output = await this.runCommand('npm', args);
      await this.parsePlaywrightResults(results, path.join(this.options.outputDir, 'e2e-results.json'));
    } finally {
      await this.stopTestServer();
    }
  }

  async startTestDatabase() {
    console.log('    Starting test database...');
    
    // Check if already running
    try {
      await this.runCommand('pg_isready', ['-h', 'localhost', '-p', '5433'], { silent: true });
      return; // Already running
    } catch {
      // Not running, start it
    }
    
    // Start PostgreSQL container
    await this.runCommand('docker', [
      'run',
      '-d',
      '--name', 'test-postgres',
      '-p', '5433:5432',
      '-e', 'POSTGRES_USER=test',
      '-e', 'POSTGRES_PASSWORD=test',
      '-e', 'POSTGRES_DB=test',
      'postgres:16-alpine'
    ]);
    
    // Wait for database to be ready
    let retries = 30;
    while (retries > 0) {
      try {
        await this.runCommand('pg_isready', ['-h', 'localhost', '-p', '5433'], { silent: true });
        break;
      } catch {
        retries--;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    if (retries === 0) {
      throw new Error('Test database failed to start');
    }
  }

  async stopTestDatabase() {
    console.log('    Stopping test database...');
    
    await this.runCommand('docker', ['stop', 'test-postgres'], { silent: true }).catch(() => {});
    await this.runCommand('docker', ['rm', 'test-postgres'], { silent: true }).catch(() => {});
  }

  async startTestServer() {
    console.log('    Starting test server...');
    
    this.testServer = spawn('npm', ['run', 'start:test'], {
      detached: true,
      stdio: 'ignore'
    });
    
    // Wait for server to be ready
    let retries = 30;
    while (retries > 0) {
      try {
        await this.runCommand('curl', ['-s', 'http://localhost:3001/health'], { silent: true });
        break;
      } catch {
        retries--;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    if (retries === 0) {
      throw new Error('Test server failed to start');
    }
  }

  async stopTestServer() {
    console.log('    Stopping test server...');
    
    if (this.testServer) {
      process.kill(-this.testServer.pid);
      this.testServer = null;
    }
  }

  async parseJestResults(results, filePath) {
    try {
      const data = await fs.readFile(filePath, 'utf8');
      const jestResults = JSON.parse(data);
      
      results.passed = jestResults.numPassedTests;
      results.failed = jestResults.numFailedTests;
      results.skipped = jestResults.numPendingTests;
      
      if (jestResults.testResults) {
        results.tests = jestResults.testResults.map(suite => ({
          name: suite.name,
          duration: suite.endTime - suite.startTime,
          passed: suite.numPassingTests,
          failed: suite.numFailingTests,
          skipped: suite.numPendingTests
        }));
      }
      
      if (jestResults.coverageMap) {
        results.coverage = {
          lines: jestResults.coverageMap.total.lines.pct,
          branches: jestResults.coverageMap.total.branches.pct,
          functions: jestResults.coverageMap.total.functions.pct,
          statements: jestResults.coverageMap.total.statements.pct
        };
      }
    } catch (error) {
      console.warn(`    ⚠️  Failed to parse Jest results: ${error.message}`);
    }
  }

  async parsePlaywrightResults(results, filePath) {
    try {
      const data = await fs.readFile(filePath, 'utf8');
      const playwrightResults = JSON.parse(data);
      
      results.passed = playwrightResults.stats.passes;
      results.failed = playwrightResults.stats.failures;
      results.skipped = playwrightResults.stats.pending;
      
      if (playwrightResults.tests) {
        results.tests = playwrightResults.tests.map(test => ({
          name: test.title,
          duration: test.duration,
          passed: test.state === 'passed',
          failed: test.state === 'failed',
          skipped: test.state === 'pending'
        }));
      }
    } catch (error) {
      console.warn(`    ⚠️  Failed to parse Playwright results: ${error.message}`);
    }
  }

  // Merge test results
  mergeResults(target, source) {
    target.passed += source.passed || 0;
    target.failed += source.failed || 0;
    target.skipped += source.skipped || 0;
  }

  // Generate coverage report
  async generateCoverageReport() {
    console.log('\n  Generating coverage report...');
    
    try {
      // Merge coverage from all test types
      await this.runCommand('nyc', [
        'merge',
        this.options.coverageDir,
        path.join(this.options.coverageDir, 'coverage-final.json')
      ]);
      
      // Generate reports
      await this.runCommand('nyc', [
        'report',
        '--reporter=html',
        '--reporter=text',
        '--reporter=lcov',
        '--report-dir=' + this.options.coverageDir
      ]);
      
      // Read coverage summary
      const lcovInfo = await fs.readFile(path.join(this.options.coverageDir, 'lcov.info'), 'utf8');
      const lines = lcovInfo.match(/LF:(\d+)/g)?.map(l => parseInt(l.split(':')[1])) || [];
      const linesHit = lcovInfo.match(/LH:(\d+)/g)?.map(l => parseInt(l.split(':')[1])) || [];
      
      const totalLines = lines.reduce((a, b) => a + b, 0);
      const totalLinesHit = linesHit.reduce((a, b) => a + b, 0);
      const coverage = totalLines > 0 ? (totalLinesHit / totalLines * 100).toFixed(2) : 0;
      
      console.log(`    ✓ Coverage: ${coverage}%`);
      console.log(`    ✓ Report: ${path.join(this.options.coverageDir, 'index.html')}`);
      
      return { coverage };
    } catch (error) {
      console.warn(`    ⚠️  Failed to generate coverage report: ${error.message}`);
      return null;
    }
  }

  // Generate test report
  async generateTestReport() {
    console.log('\n  Generating test report...');
    
    const report = {
      timestamp: new Date().toISOString(),
      duration: this.results.totals.duration,
      totals: this.results.totals,
      suites: this.results.suites,
      environment: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        ci: process.env.CI === 'true'
      }
    };
    
    // Write JSON report
    await fs.writeFile(
      path.join(this.options.outputDir, 'test-report.json'),
      JSON.stringify(report, null, 2)
    );
    
    // Generate HTML report
    const htmlReport = this.generateHTMLReport(report);
    await fs.writeFile(
      path.join(this.options.outputDir, 'test-report.html'),
      htmlReport
    );
    
    // Generate JUnit XML for CI
    const junitXml = this.generateJUnitXML(report);
    await fs.writeFile(
      path.join(this.options.outputDir, 'junit.xml'),
      junitXml
    );
    
    console.log(`    ✓ Reports generated in ${this.options.outputDir}`);
  }

  generateHTMLReport(report) {
    const { totals, suites } = report;
    const passRate = totals.passed / (totals.passed + totals.failed) * 100;
    
    return `
<!DOCTYPE html>
<html>
<head>
  <title>Test Report - ${new Date().toLocaleDateString()}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 40px; }
    h1, h2 { color: #333; }
    .summary { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .passed { color: #28a745; }
    .failed { color: #dc3545; }
    .skipped { color: #ffc107; }
    .suite { border: 1px solid #dee2e6; padding: 15px; margin: 10px 0; border-radius: 4px; }
    .progress { background: #e9ecef; height: 20px; border-radius: 4px; overflow: hidden; }
    .progress-bar { height: 100%; background: #28a745; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { padding: 8px; text-align: left; border-bottom: 1px solid #dee2e6; }
    th { background: #f8f9fa; }
  </style>
</head>
<body>
  <h1>Test Report</h1>
  
  <div class="summary">
    <h2>Summary</h2>
    <div class="progress">
      <div class="progress-bar" style="width: ${passRate}%"></div>
    </div>
    <p>
      <strong>Total:</strong> ${totals.passed + totals.failed + totals.skipped} tests<br>
      <span class="passed">Passed: ${totals.passed}</span> | 
      <span class="failed">Failed: ${totals.failed}</span> | 
      <span class="skipped">Skipped: ${totals.skipped}</span><br>
      <strong>Duration:</strong> ${(totals.duration / 1000).toFixed(2)}s<br>
      <strong>Pass Rate:</strong> ${passRate.toFixed(2)}%
    </p>
  </div>
  
  <h2>Test Suites</h2>
  ${Object.entries(suites).map(([type, suite]) => `
    <div class="suite">
      <h3>${type.charAt(0).toUpperCase() + type.slice(1)} Tests</h3>
      <p>
        <span class="passed">Passed: ${suite.passed}</span> | 
        <span class="failed">Failed: ${suite.failed}</span> | 
        <span class="skipped">Skipped: ${suite.skipped}</span> | 
        Duration: ${(suite.duration / 1000).toFixed(2)}s
      </p>
      ${suite.coverage ? `
        <p>
          <strong>Coverage:</strong> 
          Lines: ${suite.coverage.lines}% | 
          Branches: ${suite.coverage.branches}% | 
          Functions: ${suite.coverage.functions}% | 
          Statements: ${suite.coverage.statements}%
        </p>
      ` : ''}
    </div>
  `).join('')}
  
  <p><small>Generated on ${new Date().toString()}</small></p>
</body>
</html>
    `;
  }

  generateJUnitXML(report) {
    const { totals, suites } = report;
    
    return `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="Test Results" tests="${totals.passed + totals.failed + totals.skipped}" failures="${totals.failed}" skipped="${totals.skipped}" time="${(totals.duration / 1000).toFixed(3)}">
${Object.entries(suites).map(([type, suite]) => `
  <testsuite name="${type}" tests="${suite.passed + suite.failed + suite.skipped}" failures="${suite.failed}" skipped="${suite.skipped}" time="${(suite.duration / 1000).toFixed(3)}">
${suite.tests?.map(test => `
    <testcase name="${test.name}" time="${(test.duration / 1000).toFixed(3)}">
${test.failed ? '      <failure message="Test failed"/>' : ''}
${test.skipped ? '      <skipped/>' : ''}
    </testcase>`).join('') || ''}
  </testsuite>`).join('')}
</testsuites>`;
  }

  // Utility method to run commands
  async runCommand(command, args, options = {}) {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, {
        stdio: options.silent ? 'pipe' : 'inherit',
        timeout: this.options.timeout,
        ...options
      });
      
      let stdout = '';
      let stderr = '';
      
      if (options.silent || proc.stdout) {
        proc.stdout?.on('data', (data) => { stdout += data; });
        proc.stderr?.on('data', (data) => { stderr += data; });
      }
      
      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`${command} exited with code ${code}\n${stderr}`));
        } else {
          resolve(stdout);
        }
      });
      
      proc.on('error', reject);
    });
  }
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {
    testTypes: args.filter(a => !a.startsWith('--')),
    coverage: !args.includes('--no-coverage'),
    parallel: args.includes('--parallel'),
    bail: args.includes('--bail'),
    verbose: args.includes('--verbose') || args.includes('-v'),
    watch: args.includes('--watch') || args.includes('-w'),
    updateSnapshots: args.includes('--updateSnapshot') || args.includes('-u')
  };
  
  if (options.testTypes.length === 0) {
    options.testTypes = ['unit', 'integration', 'e2e'];
  }
  
  const runner = new TestRunner(options);
  runner.runTests().catch(console.error);
}

module.exports = TestRunner;