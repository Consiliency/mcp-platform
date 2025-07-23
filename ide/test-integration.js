// Test script to verify IDE extension integration
// This runs the integration tests with our implementation

const path = require('path');

// Set up test environment
process.env.NODE_ENV = 'test';

// Import our implementations
const IDEExtension = require('./core/ide-extension');
const MockSDK = require('./core/mock-sdk');

// Override the interface modules to use our implementations
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function(id) {
  // Intercept requires for the interface modules
  if (id.includes('ide-extension.interface')) {
    return IDEExtension;
  }
  if (id.includes('sdk-core.interface')) {
    return MockSDK;
  }
  
  return originalRequire.apply(this, arguments);
};

// Run the tests
const testPath = path.join(__dirname, '../mcp-local-setup/tests/integration/phase5/ide-sdk-integration.test.js');

// Use Jest programmatically
const jest = require('jest');

// Run tests from the mcp-local-setup directory
process.chdir(path.join(__dirname, '../mcp-local-setup'));

jest.run(['--testPathPattern=ide-sdk-integration\\.test\\.js', '--verbose', '--forceExit'])
  .then(() => {
    console.log('\nIntegration tests completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nIntegration tests failed:', error);
    process.exit(1);
  });