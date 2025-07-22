/**
 * Jest Setup File
 * Global test configuration and setup
 */

const path = require('path');

// Set up test environment variables
process.env.NODE_ENV = 'test';
process.env.MCP_HOME = path.join(__dirname, '..', '.test-mcp-home');
process.env.HEALTH_SERVICE_URL = 'http://localhost:8080/health';

// Mock console methods to reduce noise during tests
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn()
};

// Global test utilities
global.testHelpers = require('./framework/test-helpers');

// Clean up after all tests
afterAll(async () => {
  // Clean up any test resources
  await global.testHelpers.cleanupTestResources();
});