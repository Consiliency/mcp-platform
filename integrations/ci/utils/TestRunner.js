class TestRunner {
  constructor() {
    this.testResults = new Map();
    this.testSuites = {
      unit: ['auth', 'api', 'database', 'utils'],
      integration: ['api-endpoints', 'database-queries', 'external-services'],
      e2e: ['user-flows', 'payment-flow', 'admin-features']
    };
  }

  async run(serviceId, testType) {
    console.log(`Running ${testType} tests for ${serviceId}`);

    const suites = this.testSuites[testType] || ['default'];
    const results = [];
    let allPassed = true;

    // Sometimes make tests fail for specific services to test CI/CD behavior
    const shouldFail = serviceId === 'api-service' && testType === 'integration' && Math.random() < 0.3;

    for (const suite of suites) {
      const suiteResult = await this._runTestSuite(serviceId, testType, suite, shouldFail);
      results.push(...suiteResult.tests);
      
      if (!suiteResult.passed) {
        allPassed = false;
      }
    }

    // Store results
    const testRun = {
      serviceId,
      testType,
      timestamp: new Date(),
      passed: allPassed,
      details: results,
      summary: {
        total: results.length,
        passed: results.filter(r => r.status === 'passed').length,
        failed: results.filter(r => r.status === 'failed').length,
        skipped: results.filter(r => r.status === 'skipped').length
      }
    };

    this.testResults.set(`${serviceId}-${testType}-${Date.now()}`, testRun);

    return {
      passed: allPassed,
      details: results
    };
  }

  async runInContainer(serviceId, testType, containerConfig) {
    console.log(`Running ${testType} tests for ${serviceId} in container`);

    // Simulate container test execution
    const containerName = `test-${serviceId}-${Date.now()}`;
    
    await this._delay(1000); // Container startup
    
    const result = await this.run(serviceId, testType);
    
    await this._delay(500); // Container cleanup
    
    return {
      ...result,
      containerName,
      containerLogs: this._generateContainerLogs(serviceId, testType)
    };
  }

  async runTestSuite(serviceId, suitePath, options = {}) {
    const { 
      timeout = 300000, // 5 minutes
      parallel = false,
      coverage = true 
    } = options;

    console.log(`Running test suite at ${suitePath}`);

    const tests = this._discoverTests(suitePath);
    let results;

    if (parallel) {
      results = await Promise.all(
        tests.map(test => this._executeTest(test, timeout))
      );
    } else {
      results = [];
      for (const test of tests) {
        results.push(await this._executeTest(test, timeout));
      }
    }

    const coverageReport = coverage ? await this._generateCoverage(serviceId) : null;

    return {
      passed: results.every(r => r.status === 'passed'),
      tests: results,
      coverage: coverageReport
    };
  }

  async generateTestReport(serviceId, format = 'junit') {
    const results = Array.from(this.testResults.values())
      .filter(r => r.serviceId === serviceId);

    switch (format) {
      case 'junit':
        return this._generateJUnitReport(results);
      case 'html':
        return this._generateHTMLReport(results);
      case 'json':
        return JSON.stringify(results, null, 2);
      default:
        throw new Error(`Unsupported report format: ${format}`);
    }
  }

  async _runTestSuite(serviceId, testType, suite, shouldFail = false) {
    await this._delay(Math.random() * 2000 + 1000);

    // Simulate test execution with mostly passing tests
    const numTests = Math.floor(Math.random() * 10) + 5;
    const tests = [];

    for (let i = 0; i < numTests; i++) {
      // Force failure if shouldFail is true for at least one test
      const passed = shouldFail && i === 0 ? false : Math.random() > 0.1; // 90% pass rate normally
      const test = {
        name: `${suite}.test${i + 1}`,
        status: passed ? 'passed' : 'failed',
        duration: Math.floor(Math.random() * 1000) + 100,
        error: passed ? null : this._generateTestError()
      };
      
      tests.push(test);
    }

    return {
      passed: tests.every(t => t.status === 'passed'),
      tests
    };
  }

  _executeTest(test, timeout) {
    return new Promise(async (resolve) => {
      const startTime = Date.now();
      
      // Simulate test execution
      await this._delay(Math.random() * 2000);
      
      const duration = Date.now() - startTime;
      const passed = Math.random() > 0.15; // 85% pass rate
      
      resolve({
        name: test.name,
        file: test.file,
        status: passed ? 'passed' : 'failed',
        duration,
        error: passed ? null : this._generateTestError()
      });
    });
  }

  _discoverTests(suitePath) {
    // Simulate test discovery
    return Array.from({ length: Math.floor(Math.random() * 20) + 10 }, (_, i) => ({
      name: `test_${i + 1}`,
      file: `${suitePath}/test_${i + 1}.js`
    }));
  }

  async _generateCoverage(serviceId) {
    await this._delay(1000);

    return {
      lines: {
        total: Math.floor(Math.random() * 1000) + 500,
        covered: Math.floor(Math.random() * 800) + 400,
        percentage: Math.floor(Math.random() * 30) + 70
      },
      functions: {
        total: Math.floor(Math.random() * 200) + 100,
        covered: Math.floor(Math.random() * 180) + 80,
        percentage: Math.floor(Math.random() * 20) + 80
      },
      branches: {
        total: Math.floor(Math.random() * 100) + 50,
        covered: Math.floor(Math.random() * 70) + 30,
        percentage: Math.floor(Math.random() * 40) + 60
      }
    };
  }

  _generateJUnitReport(results) {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<testsuites>\n';

    results.forEach((result, index) => {
      xml += `  <testsuite name="${result.serviceId}-${result.testType}" `;
      xml += `tests="${result.summary.total}" `;
      xml += `failures="${result.summary.failed}" `;
      xml += `skipped="${result.summary.skipped}" `;
      xml += `timestamp="${result.timestamp.toISOString()}">\n`;

      result.details.forEach(test => {
        xml += `    <testcase name="${test.name}" time="${test.duration / 1000}">\n`;
        if (test.error) {
          xml += `      <failure message="${test.error.message}">${test.error.stack}</failure>\n`;
        }
        xml += '    </testcase>\n';
      });

      xml += '  </testsuite>\n';
    });

    xml += '</testsuites>';
    return xml;
  }

  _generateHTMLReport(results) {
    const html = `<!DOCTYPE html>
<html>
<head>
  <title>Test Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    .passed { color: green; }
    .failed { color: red; }
    .summary { background: #f0f0f0; padding: 10px; margin: 10px 0; }
  </style>
</head>
<body>
  <h1>Test Report</h1>
  ${results.map(result => `
    <div class="summary">
      <h2>${result.serviceId} - ${result.testType}</h2>
      <p>Total: ${result.summary.total}, 
         Passed: <span class="passed">${result.summary.passed}</span>, 
         Failed: <span class="failed">${result.summary.failed}</span></p>
    </div>
  `).join('')}
</body>
</html>`;
    
    return html;
  }

  _generateTestError() {
    const errors = [
      { message: 'Expected value to be true', stack: 'at Object.<anonymous> (test.js:42:15)' },
      { message: 'Connection timeout', stack: 'at Socket.<anonymous> (net.js:123:45)' },
      { message: 'Element not found', stack: 'at Page.click (puppeteer.js:234:12)' },
      { message: 'Assertion failed', stack: 'at Context.<anonymous> (spec.js:56:20)' }
    ];
    
    return errors[Math.floor(Math.random() * errors.length)];
  }

  _generateContainerLogs(serviceId, testType) {
    return `Starting test container for ${serviceId}
Running ${testType} tests...
Test suite 1: PASS
Test suite 2: PASS
Test suite 3: FAIL - 1 test failed
All tests completed in ${Math.floor(Math.random() * 60) + 30}s
Container cleanup completed`;
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = TestRunner;