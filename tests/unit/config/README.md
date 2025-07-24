# Configuration Module Unit Tests

This directory contains comprehensive unit tests for the production configuration modules in Phase 6.

## Test Structure

```
tests/unit/config/
├── settings.test.js       # Tests for production settings configuration
├── features.test.js       # Tests for feature flags system
├── limits.test.js         # Tests for rate limits and quotas
└── env-validation.test.js # Tests for environment variable validation
```

## Test Coverage

### settings.test.js
Tests the core application settings including:
- Server configuration (port, host, environment)
- Logging configuration
- Security settings
- Request handling
- Health checks
- Performance settings
- Graceful shutdown
- Localization

### features.test.js
Tests the feature flag system including:
- Feature flag validation
- Environment variable overrides
- User-specific feature flags
- Group-based access control
- Rollout percentage logic
- Feature categories (API, Security, Platform, UX, etc.)

### limits.test.js
Tests the limits and quotas system including:
- Rate limiting configuration
- Storage quotas per tier
- API usage quotas
- Request size and timeout limits
- Connection pool limits
- Security limits (passwords, sessions, tokens)
- Utility functions for limit checking

### env-validation.test.js
Tests environment configuration including:
- Environment template validation
- Variable type handling (boolean, numeric, arrays)
- Required vs optional variables
- Production safety checks
- Cross-module consistency

## Running Tests

```bash
# Run all config tests
npm run test:unit:config

# Run specific test file
npm test tests/unit/config/settings.test.js

# Run with coverage
npm run test:config:coverage

# Run all unit tests
npm run test:unit
```

## Coverage Requirements

All configuration modules must maintain at least 80% code coverage across:
- Statements
- Branches
- Functions
- Lines

## Environment Variables

Tests validate proper handling of environment variables including:

### Core Variables
- `NODE_ENV` - Must be 'production' or 'staging'
- `PORT` - Server port (default: 443)
- `API_HOST` - API host (default: '0.0.0.0')
- `LOG_LEVEL` - Logging level (error, warn, info)

### Feature Flags
- `FEATURE_API_V2` - Enable v2 API endpoints
- `FEATURE_GRAPHQL` - Enable GraphQL endpoint
- `FEATURE_WEBHOOKS` - Enable webhook functionality
- `FEATURE_MFA` - Enable multi-factor authentication

### Rate Limiting
- `RATE_LIMIT_WINDOW` - Rate limit window (e.g., '15m')
- `RATE_LIMIT_MAX` - Maximum requests per window
- `MAX_REQUEST_SIZE` - Maximum request body size
- `REQUEST_TIMEOUT` - Request timeout in milliseconds

### Security
- `SESSION_SECRET` - Session encryption secret (required in production)
- `JWT_SECRET` - JWT signing secret (required in production)
- `CORS_ORIGIN` - Comma-separated list of allowed origins
- `CORS_ENABLED` - Enable/disable CORS (default: true)

## Test Patterns

### Testing Environment Overrides
```javascript
it('should override setting from environment variable', () => {
  process.env.PORT = '8080';
  const settings = require('../../../config/production/settings');
  expect(settings.server.port).toBe(8080);
});
```

### Testing Validation
```javascript
it('should fail validation with invalid value', () => {
  process.env.PORT = '70000'; // Invalid port
  expect(() => {
    require('../../../config/production/settings');
  }).toThrow();
});
```

### Testing Feature Flags
```javascript
it('should respect user-specific feature flags', () => {
  const isEnabled = featuresModule.isEnabled('experimental.aiAssistant', 'alice');
  expect(isEnabled).toBe(true);
});
```

### Testing Limit Parsing
```javascript
it('should parse time strings correctly', () => {
  expect(limitsModule.parseTimeToMs('30m')).toBe(1800000);
  expect(limitsModule.parseSizeToBytes('10MB')).toBe(10485760);
});
```

## Best Practices

1. **Isolation**: Each test should be isolated using `beforeEach` and `afterEach` to save/restore environment
2. **Module Cache**: Use `jest.resetModules()` to reload modules with different environment variables
3. **Comprehensive Coverage**: Test both valid and invalid inputs, edge cases, and error conditions
4. **Production Safety**: Ensure tests validate production-safe defaults and configurations
5. **Cross-Module Consistency**: Test that related settings across modules are consistent

## Troubleshooting

### Module Caching Issues
If tests fail due to module caching:
```javascript
beforeEach(() => {
  jest.resetModules();
});
```

### Environment Pollution
Always restore original environment:
```javascript
const originalEnv = { ...process.env };
afterEach(() => {
  process.env = originalEnv;
});
```

### Validation Failures
Check that test environment variables meet validation requirements defined in the configuration modules.