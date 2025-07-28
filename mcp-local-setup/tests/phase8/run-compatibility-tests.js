const CompatibilityTestFramework = require('../compatibility-test-framework');

// Use the test gateway on port 8091
const GATEWAY_URL = 'http://localhost:8091';
const API_KEY = process.env.GATEWAY_API_KEY || 'mcp-gateway-default-key';

async function runCompatibilityTests() {
  console.log('MCP Compatibility Test Runner\n');
  console.log(`Gateway URL: ${GATEWAY_URL}`);
  console.log(`Platform: ${process.platform}\n`);
  
  const framework = new CompatibilityTestFramework(GATEWAY_URL, API_KEY);
  
  try {
    // Test specific servers if provided as arguments
    const serversToTest = process.argv.slice(2);
    
    if (serversToTest.length > 0) {
      console.log(`Testing specific servers: ${serversToTest.join(', ')}\n`);
      
      for (const serverId of serversToTest) {
        const results = await framework.testServer(serverId);
        displayResults(results);
      }
      
      await framework.generateReports();
    } else {
      // Test all servers
      await framework.testAllServers();
      
      // Display summary
      console.log('\n=== Test Summary ===\n');
      
      for (const [serverId, results] of framework.testResults) {
        console.log(`${serverId}:`);
        console.log(`  Success Rate: ${results.summary.successRate}%`);
        console.log(`  Passed: ${results.summary.passed}/${results.summary.total}`);
        if (results.errors.length > 0) {
          console.log(`  Errors: ${results.errors.length}`);
        }
        console.log();
      }
    }
    
    console.log(`\nReports generated in: ${framework.outputDir}`);
    
  } catch (error) {
    console.error('Failed to run compatibility tests:', error.message);
    process.exit(1);
  }
}

function displayResults(results) {
  console.log(`\n=== ${results.serverId} Test Results ===`);
  console.log(`Platform: ${results.platform}`);
  console.log(`Success Rate: ${results.summary.successRate}%\n`);
  
  for (const [testName, testResult] of Object.entries(results.tests)) {
    const status = testResult.passed ? '✓' : '✗';
    console.log(`${status} ${testResult.name}`);
    
    if (testResult.message) {
      console.log(`  ${testResult.message}`);
    }
    
    if (testResult.error) {
      console.log(`  Error: ${testResult.error}`);
    }
    
    // Show additional details for some tests
    if (testName === 'toolDiscovery' && testResult.tools) {
      console.log(`  Tools found: ${testResult.tools.length}`);
    }
    
    if (testName === 'compatibilityFiltering' && testResult.details) {
      if (testResult.details.limitations?.length > 0) {
        console.log(`  Limitations: ${testResult.details.limitations.join(', ')}`);
      }
    }
    
    if (testName === 'performance' && testResult.metrics) {
      console.log(`  Tool discovery: ${testResult.metrics.toolDiscovery}ms`);
      console.log(`  Tool execution: ${testResult.metrics.toolExecution}ms`);
    }
  }
  
  if (results.errors.length > 0) {
    console.log('\nErrors:');
    for (const error of results.errors) {
      console.log(`  - ${error.test}: ${error.error}`);
    }
  }
}

// Run the tests
runCompatibilityTests();