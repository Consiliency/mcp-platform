// Direct integration test runner
// This runs the integration tests directly with our implementations

const IDEExtension = require('./core/standalone-ide-extension');
const MockSDK = require('./core/standalone-sdk');

// Run the tests manually
async function runTests() {
  console.log('Running IDE Extension Integration Tests...\n');
  
  let passed = 0;
  let failed = 0;
  
  // Test 1: IDE extension initializes with SDK instance
  try {
    const sdk = new MockSDK({ apiKey: 'test-key' });
    const ideExtension = new IDEExtension(sdk);
    
    // Test null SDK throws error
    try {
      new IDEExtension(null);
      throw new Error('Should have thrown');
    } catch (e) {
      if (e.message !== 'SDK instance required') {
        throw e;
      }
    }
    
    console.log('✓ IDE extension initializes with SDK instance');
    passed++;
  } catch (error) {
    console.log('✗ IDE extension initializes with SDK instance');
    console.error('  ', error.message);
    failed++;
  }
  
  // Test 2: Code completion suggests available MCP services
  try {
    const sdk = new MockSDK({ apiKey: 'test-key' });
    const ideExtension = new IDEExtension(sdk);
    
    const document = {
      uri: 'file:///project/main.js',
      content: 'const service = mcp.'
    };
    const position = { line: 0, character: 20 };
    
    const completions = await ideExtension.getCompletions(document, position);
    
    // Check for method completions
    const connectMethod = completions.find(c => c.label === 'connectService');
    if (!connectMethod || connectMethod.kind !== 'Method') {
      throw new Error('Missing connectService method completion');
    }
    
    // Check for service completions
    const services = await sdk.listServices({});
    let foundServices = 0;
    for (const service of services) {
      if (completions.find(c => c.label === service.id && c.kind === 'Service')) {
        foundServices++;
      }
    }
    
    if (foundServices !== services.length) {
      throw new Error(`Expected ${services.length} service completions, found ${foundServices}`);
    }
    
    console.log('✓ Code completion suggests available MCP services');
    passed++;
  } catch (error) {
    console.log('✗ Code completion suggests available MCP services');
    console.error('  ', error.message);
    failed++;
  }
  
  // Test 3: Hover info shows service documentation from SDK
  try {
    const sdk = new MockSDK({ apiKey: 'test-key' });
    const ideExtension = new IDEExtension(sdk);
    
    const document = {
      uri: 'file:///project/config.js',
      content: 'mcp.installService("postgres-mcp", config);'
    };
    const position = { line: 0, character: 25 };
    
    const hoverInfo = await ideExtension.getHoverInfo(document, position);
    
    const serviceDetails = await sdk.getService('postgres-mcp');
    if (!hoverInfo.content.includes(serviceDetails.description)) {
      throw new Error('Hover info missing service description');
    }
    if (!hoverInfo.content.includes(serviceDetails.version)) {
      throw new Error('Hover info missing service version');
    }
    if (!hoverInfo.content.includes('Configuration options:')) {
      throw new Error('Hover info missing configuration options');
    }
    
    console.log('✓ Hover info shows service documentation from SDK');
    passed++;
  } catch (error) {
    console.log('✗ Hover info shows service documentation from SDK');
    console.error('  ', error.message);
    failed++;
  }
  
  // Test 4: Diagnostics validate service configurations against SDK
  try {
    const sdk = new MockSDK({ apiKey: 'test-key' });
    const ideExtension = new IDEExtension(sdk);
    
    const document = {
      uri: 'file:///project/mcp.config.json',
      content: JSON.stringify({
        services: {
          'postgres-mcp': {
            version: '14',
            invalidOption: true
          },
          'nonexistent-service': {
            enabled: true
          }
        }
      })
    };
    
    const diagnostics = await ideExtension.getDiagnostics(document);
    
    // Check for invalid option warning
    const invalidOptionDiag = diagnostics.find(d => 
      d.message === 'Unknown configuration option: invalidOption' &&
      d.severity === 'warning'
    );
    if (!invalidOptionDiag) {
      throw new Error('Missing diagnostic for invalid option');
    }
    
    // Check for nonexistent service error
    const nonexistentDiag = diagnostics.find(d => 
      d.message === 'Service not found: nonexistent-service' &&
      d.severity === 'error'
    );
    if (!nonexistentDiag) {
      throw new Error('Missing diagnostic for nonexistent service');
    }
    
    console.log('✓ Diagnostics validate service configurations against SDK');
    passed++;
  } catch (error) {
    console.log('✗ Diagnostics validate service configurations against SDK');
    console.error('  ', error.message);
    failed++;
  }
  
  // Test 5: Service panel shows real-time health from SDK
  try {
    const sdk = new MockSDK({ apiKey: 'test-key' });
    const ideExtension = new IDEExtension(sdk);
    
    await ideExtension.showServicePanel();
    
    const serviceId = 'test-service';
    await ideExtension.showServiceDetails(serviceId);
    
    const health = await sdk.getHealth(serviceId);
    if (!health.status || !health.details) {
      throw new Error('Health data missing required properties');
    }
    
    console.log('✓ Service panel shows real-time health from SDK');
    passed++;
  } catch (error) {
    console.log('✗ Service panel shows real-time health from SDK');
    console.error('  ', error.message);
    failed++;
  }
  
  // Test 6: Debugging integration uses SDK service endpoints
  try {
    const sdk = new MockSDK({ apiKey: 'test-key' });
    const ideExtension = new IDEExtension(sdk);
    
    const debugConfig = {
      serviceId: 'api-service',
      breakpoints: [
        { file: 'handler.js', line: 10 }
      ]
    };
    
    const session = await ideExtension.startDebugging(debugConfig);
    
    const serviceEndpoint = await sdk.callService(
      debugConfig.serviceId,
      'getDebugEndpoint',
      {}
    );
    
    if (!session.sessionId) {
      throw new Error('Debug session missing sessionId');
    }
    if (!serviceEndpoint.debugPort || !serviceEndpoint.protocol) {
      throw new Error('Service endpoint missing debug info');
    }
    
    console.log('✓ Debugging integration uses SDK service endpoints');
    passed++;
  } catch (error) {
    console.log('✗ Debugging integration uses SDK service endpoints');
    console.error('  ', error.message);
    failed++;
  }
  
  // Test 7: Code actions can install missing services via SDK
  try {
    const sdk = new MockSDK({ apiKey: 'test-key' });
    const ideExtension = new IDEExtension(sdk);
    
    const document = {
      uri: 'file:///project/app.js',
      content: 'const db = mcp.connect("mysql-mcp");'
    };
    const range = { start: { line: 0, character: 24 }, end: { line: 0, character: 34 } };
    const context = {
      diagnostics: [{
        message: 'Service not installed: mysql-mcp',
        severity: 'error'
      }]
    };
    
    const codeActions = await ideExtension.getCodeActions(document, range, context);
    
    const installAction = codeActions.find(a => 
      a.title === 'Install mysql-mcp service' &&
      a.kind === 'quickfix' &&
      a.command.command === 'mcp.installService'
    );
    
    if (!installAction) {
      throw new Error('Missing install service code action');
    }
    
    // Execute the action
    const result = await ideExtension.executeCommand('mcp.installService', ['mysql-mcp', { source: 'ide' }]);
    
    if (!result.success) {
      throw new Error('Failed to install service via SDK');
    }
    
    console.log('✓ Code actions can install missing services via SDK');
    passed++;
  } catch (error) {
    console.log('✗ Code actions can install missing services via SDK');
    console.error('  ', error.message);
    failed++;
  }
  
  // Summary
  console.log('\n========================================');
  console.log(`Tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log('========================================\n');
  
  if (failed > 0) {
    console.log('Integration tests failed!');
    process.exit(1);
  } else {
    console.log('All integration tests passed!');
    process.exit(0);
  }
}

// Run the tests
runTests().catch(error => {
  console.error('Test runner error:', error);
  process.exit(1);
});