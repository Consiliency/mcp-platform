# MCP Local Setup - Testing Infrastructure

This directory contains a comprehensive testing suite for the MCP Local Setup platform, including unit tests, integration tests, and end-to-end tests.

## Overview

The testing infrastructure is built using Jest and follows a structured approach:

- **Unit Tests**: Test individual functions and modules in isolation
- **Integration Tests**: Test interactions between different components
- **End-to-End Tests**: Test complete user workflows and scenarios

## Directory Structure

```
tests/
├── unit/                 # Unit tests for individual modules
├── integration/          # Integration tests for component interactions
├── e2e/                  # End-to-end tests for complete workflows
├── framework/            # Testing utilities and helpers
│   ├── test-runner.js    # Unified test runner
│   └── test-helpers.js   # Common test utilities
├── jest.config.js        # Jest configuration
├── setup.js              # Global test setup
└── README.md             # This file
```

## Prerequisites

Before running tests, ensure you have:

1. Node.js (v14 or higher)
2. npm or yarn installed
3. Docker (for integration and e2e tests)
4. All dependencies installed:

```bash
cd mcp-local-setup
npm install
```

## Running Tests

### Run All Tests
```bash
npm test
# or
npm run test:all
```

### Run Unit Tests Only
```bash
npm run test:unit
```

### Run Integration Tests Only
```bash
npm run test:integration
```

### Run E2E Tests Only
```bash
npm run test:e2e
```

### Run Tests with Coverage
```bash
npm run test:coverage
```

### Watch Mode (for development)
```bash
npm run test:watch
```

## Test Files

### Unit Tests

- **`cli-mcp-cli.unit.test.js`**: Tests for CLI command parsing and options
- **`scripts-registry-manager.unit.test.js`**: Tests for registry management functions
- **`cli-commands-health.unit.test.js`**: Tests for health check command functionality

### Integration Tests

- **`service-lifecycle.integration.test.js`**: Tests service start, stop, and restart operations
- **`profile-switching.integration.test.js`**: Tests profile creation, switching, and deletion
- **`health-check.integration.test.js`**: Tests health check system and monitoring

### E2E Tests

- **`installation-flow.e2e.test.js`**: Tests complete installation process
- **`service-deployment.e2e.test.js`**: Tests service deployment scenarios
- **`client-configuration.e2e.test.js`**: Tests client SDK configuration generation

## Writing Tests

### Using Test Helpers

The framework provides helpful utilities in `test-helpers.js`:

```javascript
const {
  createMockService,
  createTestProfile,
  waitForHealthy,
  startService,
  stopService,
  cleanupTestResources
} = require('../framework/test-helpers');

describe('My Test Suite', () => {
  const testResources = [];

  afterEach(async () => {
    await cleanupTestResources(testResources);
  });

  it('should test something', async () => {
    const service = createMockService({ name: 'test-service' });
    testResources.push(`service:${service.name}`);
    
    // Your test logic here
  });
});
```

### Test Environment

Tests run with the following environment variables set:

- `NODE_ENV=test`
- `MCP_HOME=.test-mcp-home` (isolated test directory)
- `HEALTH_SERVICE_URL=http://localhost:8080/health`

### Mocking

Common mocks are pre-configured:

- Console methods are mocked to reduce noise
- External dependencies like `axios` are mocked where appropriate
- File system operations can be mocked as needed

## Test Coverage

The project aims for the following coverage thresholds:

- **Branches**: 70%
- **Functions**: 70%
- **Lines**: 80%
- **Statements**: 80%

View the coverage report after running tests with coverage:

```bash
npm run test:coverage
open coverage/lcov-report/index.html
```

## Continuous Integration

Tests are automatically run in CI/CD pipelines. Ensure all tests pass before merging:

```bash
# Run all checks
npm run test:all
```

## Debugging Tests

### Run a Single Test File
```bash
npx jest tests/unit/cli-mcp-cli.unit.test.js
```

### Run Tests in Debug Mode
```bash
node --inspect-brk node_modules/.bin/jest --runInBand
```

### Verbose Output
```bash
npx jest --verbose
```

### Show Test Names Only
```bash
npx jest --listTests
```

## Common Issues

### Docker Not Running
Integration and E2E tests require Docker. Ensure Docker daemon is running:
```bash
docker info
```

### Port Conflicts
Tests use various ports. Ensure these ports are available:
- 8080 (Health service)
- 3000-4000 (Test services)
- 5432 (Database tests)
- 6379 (Cache tests)

### Timeout Errors
Some tests have longer timeouts. If you encounter timeout errors:
- Ensure your system isn't under heavy load
- Consider increasing timeout values in jest.config.js
- Check for network connectivity issues

### Permission Errors
Some tests create files and directories. Ensure you have write permissions in the test directory.

## Contributing

When adding new tests:

1. Follow the existing naming convention: `[module-name].[test-type].test.js`
2. Place tests in the appropriate directory (unit/integration/e2e)
3. Use descriptive test names that explain what is being tested
4. Clean up test resources using the cleanup utilities
5. Ensure tests are independent and can run in any order
6. Add appropriate timeout values for longer-running tests

## Best Practices

1. **Keep tests focused**: Each test should verify one specific behavior
2. **Use descriptive names**: Test names should clearly indicate what they test
3. **Mock external dependencies**: Don't rely on external services in unit tests
4. **Clean up resources**: Always clean up created resources after tests
5. **Avoid hard-coded values**: Use variables and constants for test data
6. **Test error cases**: Include tests for error conditions and edge cases
7. **Keep tests maintainable**: Refactor common test logic into helper functions

## Support

If you encounter issues with the test suite:

1. Check the test output for specific error messages
2. Review the test file that's failing
3. Ensure all prerequisites are met
4. Check for recent changes that might affect tests
5. Consult the main project documentation

Happy testing! 🚀