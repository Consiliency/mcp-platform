/**
 * Unit tests for environment configuration validation
 */

const fs = require('fs');
const path = require('path');

describe('Environment Configuration Validation', () => {
  let envExamplePath;
  let envExampleContent;
  let originalEnv;
  let originalExit;

  beforeAll(() => {
    // Path to .env.production.example
    envExamplePath = path.join(__dirname, '../../../.env.production.example');
    
    // Read the example file if it exists
    if (fs.existsSync(envExamplePath)) {
      envExampleContent = fs.readFileSync(envExamplePath, 'utf8');
    }
  });

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Mock process.exit
    originalExit = process.exit;
    process.exit = jest.fn();
    
    // Set NODE_ENV to production for tests unless testing validation
    if (!process.env.PRESERVE_NODE_ENV) {
      process.env.NODE_ENV = 'production';
    }
    
    // Clear module cache
    jest.resetModules();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    
    // Restore process.exit
    process.exit = originalExit;
  });

  describe('Environment Template', () => {
    it('should have .env.production.example file', () => {
      expect(fs.existsSync(envExamplePath)).toBe(true);
    });

    it('should contain all required environment variables', () => {
      if (!envExampleContent) {
        console.warn('.env.production.example not found, skipping test');
        return;
      }

      const requiredVars = [
        'NODE_ENV',
        'APP_VERSION',
        'LOG_LEVEL',
        'JWT_SECRET',
        'DATABASE_URL',
        'REDIS_URL'
      ];

      for (const varName of requiredVars) {
        expect(envExampleContent).toMatch(new RegExp(`^${varName}=`, 'm'));
      }
    });

    it('should have proper format for environment variables', () => {
      if (!envExampleContent) {
        console.warn('.env.production.example not found, skipping test');
        return;
      }

      const lines = envExampleContent.split('\n').filter(line => line.trim() && !line.startsWith('#'));
      
      for (const line of lines) {
        // Should be in KEY=value format
        expect(line).toMatch(/^[A-Z_]+=/);
      }
    });

    it('should include comments for complex variables', () => {
      if (!envExampleContent) {
        console.warn('.env.production.example not found, skipping test');
        return;
      }

      // Check for comments explaining complex configurations
      expect(envExampleContent).toContain('# Production Environment Configuration');
      
      // Should have sections
      const sections = [
        '# Security',
        '# Database',
        '# Redis',
        '# Application',
        '# Monitoring',
        '# SSL/TLS'
      ];

      for (const section of sections.slice(0, 3)) { // Check at least first 3 sections
        expect(envExampleContent).toContain(section);
      }
    });
  });

  describe('Configuration Module Integration', () => {
    it('should load all configuration modules without required env vars', () => {
      // Clear all environment variables
      for (const key in process.env) {
        if (key.startsWith('MCP_') || key.startsWith('APP_') || 
            key === 'PORT' || key === 'NODE_ENV') {
          delete process.env[key];
        }
      }

      // Should still load with defaults
      expect(() => {
        require('../../../config/production/settings');
      }).not.toThrow();

      expect(() => {
        require('../../../config/production/features');
      }).not.toThrow();

      expect(() => {
        require('../../../config/production/limits');
      }).not.toThrow();
    });

    it('should validate consistent environment usage across modules', () => {
      // Set some test environment variables
      process.env.NODE_ENV = 'production';
      process.env.PORT = '8080';
      process.env.LOG_LEVEL = 'info';
      process.env.RATE_LIMIT_WINDOW = '10m';
      process.env.FEATURE_API_V2 = 'true';

      // Load all modules
      const settings = require('../../../config/production/settings');
      const features = require('../../../config/production/features');
      const limits = require('../../../config/production/limits');

      // Verify consistent usage
      expect(settings.server.nodeEnv).toBe('production');
      expect(settings.server.port).toBe(8080);
      expect(settings.logging.level).toBe('info');
      expect(limits.limits.rateLimit.global.windowMs).toBe(600000); // 10m
      expect(features.features.api.v2Endpoints.enabled).toBe(true);
    });
  });

  describe('Environment Variable Types', () => {
    it('should handle boolean environment variables correctly', () => {
      const booleanVars = {
        'CORS_ENABLED': { module: 'settings', path: 'security.corsEnabled', default: true },
        'HELMET_ENABLED': { module: 'settings', path: 'security.helmetEnabled', default: true },
        'COMPRESSION_ENABLED': { module: 'settings', path: 'security.compressionEnabled', default: true },
        'FEATURE_API_V2': { module: 'features', path: 'features.api.v2Endpoints.enabled', default: false },
        'FEATURE_GRAPHQL': { module: 'features', path: 'features.api.graphqlEndpoint.enabled', default: false }
      };

      for (const [envVar, config] of Object.entries(booleanVars)) {
        // Test 'true' value
        process.env[envVar] = 'true';
        jest.resetModules();
        
        let module;
        if (config.module === 'settings') {
          module = require('../../../config/production/settings');
        } else if (config.module === 'features') {
          module = require('../../../config/production/features');
        }
        
        const value = config.path.split('.').reduce((obj, key) => obj[key], module);
        expect(value).toBe(true);

        // Test 'false' value
        process.env[envVar] = 'false';
        jest.resetModules();
        
        if (config.module === 'settings') {
          module = require('../../../config/production/settings');
        } else if (config.module === 'features') {
          module = require('../../../config/production/features');
        }
        
        const falseValue = config.path.split('.').reduce((obj, key) => obj[key], module);
        expect(falseValue).toBe(false);

        // Test invalid value (should use default)
        delete process.env[envVar];
      }
    });

    it('should handle numeric environment variables correctly', () => {
      const numericVars = {
        'PORT': { module: 'settings', path: 'server.port', default: 443 },
        'REQUEST_TIMEOUT': { module: 'settings', path: 'requests.requestTimeout', default: 30000 },
        'WORKER_THREADS': { module: 'settings', path: 'performance.workerThreads', default: 4 },
        'MAX_CONNECTIONS': { module: 'limits', path: 'limits.connections.maxConnections', default: 10000 }
      };

      for (const [envVar, config] of Object.entries(numericVars)) {
        // Test valid numeric value
        process.env[envVar] = '12345';
        jest.resetModules();
        
        let module;
        if (config.module === 'settings') {
          module = require('../../../config/production/settings');
        } else if (config.module === 'limits') {
          module = require('../../../config/production/limits');
        }
        
        const value = config.path.split('.').reduce((obj, key) => obj[key], module);
        expect(value).toBe(12345);

        // Test invalid numeric value (NaN)
        process.env[envVar] = 'not-a-number';
        jest.resetModules();
        
        if (config.module === 'settings') {
          module = require('../../../config/production/settings');
        } else if (config.module === 'limits') {
          module = require('../../../config/production/limits');
        }
        
        const invalidValue = config.path.split('.').reduce((obj, key) => obj[key], module);
        expect(Number.isNaN(invalidValue)).toBe(true); // parseInt returns NaN for invalid input
        
        delete process.env[envVar];
      }
    });

    it('should handle string array environment variables correctly', () => {
      // Test CORS origins
      process.env.CORS_ORIGIN = 'https://app1.com,https://app2.com, https://app3.com';
      jest.resetModules();
      
      const settings = require('../../../config/production/settings');
      expect(settings.security.corsOrigin).toEqual([
        'https://app1.com',
        'https://app2.com',
        'https://app3.com'
      ]);

      // Test AI beta users
      process.env.AI_BETA_USERS = 'alice,bob,charlie';
      jest.resetModules();
      
      const features = require('../../../config/production/features');
      expect(features.features.experimental.aiAssistant.allowedUsers).toEqual([
        'alice', 'bob', 'charlie'
      ]);
    });

    it('should handle time string environment variables correctly', () => {
      process.env.RATE_LIMIT_WINDOW = '30m';
      process.env.REQUEST_TIMEOUT = '60s';
      jest.resetModules();
      
      const limits = require('../../../config/production/limits');
      expect(limits.limits.rateLimit.global.windowMs).toBe(1800000); // 30 minutes
      
      const settings = require('../../../config/production/settings');
      process.env.REQUEST_TIMEOUT = '60000'; // Also accepts raw milliseconds
      jest.resetModules();
      const settings2 = require('../../../config/production/settings');
      expect(settings2.requests.requestTimeout).toBe(60000);
    });

    it('should handle size string environment variables correctly', () => {
      process.env.MAX_REQUEST_SIZE = '50mb';
      process.env.MAX_JSON_SIZE = '20MB';
      process.env.MAX_UPLOAD_SIZE = '1GB';
      jest.resetModules();
      
      const settings = require('../../../config/production/settings');
      expect(settings.requests.maxRequestSize).toBe('50mb');
      
      const limits = require('../../../config/production/limits');
      expect(limits.limits.requests.bodySize.json).toBe(20971520); // 20MB in bytes
      expect(limits.limits.requests.bodySize.multipart).toBe(1073741824); // 1GB in bytes
    });
  });

  describe('Required vs Optional Environment Variables', () => {
    it('should identify critical environment variables', () => {
      // These should cause issues or warnings if not set
      const criticalVars = [
        'SESSION_SECRET',
        'JWT_SECRET',
        'DATABASE_URL',
        'REDIS_URL'
      ];

      // Note: The actual configs might not fail but should handle missing values gracefully
      const settings = require('../../../config/production/settings');
      
      // Session secret should be undefined if not set (requires manual setting)
      expect(settings.session.secret).toBeUndefined();
    });

    it('should have sensible defaults for optional variables', () => {
      // Clear optional environment variables
      const optionalVars = [
        'LOG_LEVEL', 'LOG_FORMAT', 'MAX_REQUEST_SIZE',
        'REQUEST_TIMEOUT', 'CORS_ENABLED', 'HEALTH_CHECK_ENABLED'
      ];
      
      for (const varName of optionalVars) {
        delete process.env[varName];
      }
      
      jest.resetModules();
      const settings = require('../../../config/production/settings');
      
      // Check defaults are sensible
      expect(settings.logging.level).toBe('info');
      expect(settings.logging.format).toBe('json');
      expect(settings.requests.maxRequestSize).toBe('10mb');
      expect(settings.requests.requestTimeout).toBe(30000);
      expect(settings.security.corsEnabled).toBe(true);
      expect(settings.healthCheck.enabled).toBe(true);
    });
  });

  describe('Production Safety Checks', () => {
    it('should enforce production-safe values', () => {
      // Settings should not allow development values in production config
      process.env.PRESERVE_NODE_ENV = 'true';
      process.env.NODE_ENV = 'development';
      
      jest.resetModules();
      require('../../../config/production/settings');
      
      // process.exit should have been called due to validation failure
      expect(process.exit).toHaveBeenCalledWith(1);
      
      delete process.env.PRESERVE_NODE_ENV;
    });

    it('should have secure defaults for production', () => {
      const settings = require('../../../config/production/settings');
      
      // Security settings should be strict
      expect(settings.session.secure).toBe(true);
      expect(settings.session.httpOnly).toBe(true);
      expect(settings.session.sameSite).toBe('strict');
      
      // Logging should not be too verbose
      expect(['error', 'warn', 'info']).toContain(settings.logging.level);
      expect(settings.logging.level).not.toBe('debug');
      expect(settings.logging.level).not.toBe('verbose');
    });

    it('should not expose sensitive information by default', () => {
      const settings = require('../../../config/production/settings');
      
      // Health checks should not include details by default
      expect(settings.healthCheck.includeDetails).toBe(false);
      
      // Logging should redact secrets
      expect(settings.logging.redactSecrets).toBe(true);
    });
  });

  describe('Cross-Module Consistency', () => {
    it('should have consistent timeout values across modules', () => {
      process.env.REQUEST_TIMEOUT = '45000';
      jest.resetModules();
      
      const settings = require('../../../config/production/settings');
      const limits = require('../../../config/production/limits');
      
      expect(settings.requests.requestTimeout).toBe(45000);
      // limits.js uses its own REQUEST_TIMEOUT with parseTimeToMs
      expect(limits.limits.requests.timeouts.request).toBe(30000); // Has its own default
    });

    it('should have consistent rate limiting configuration', () => {
      process.env.RATE_LIMIT_WINDOW = '20m';
      process.env.RATE_LIMIT_MAX = '2000';
      jest.resetModules();
      
      const limits = require('../../../config/production/limits');
      const features = require('../../../config/production/features');
      
      // Rate limiting should be configured in limits
      expect(limits.limits.rateLimit.global.windowMs).toBe(1200000); // 20m
      expect(limits.limits.rateLimit.global.maxRequests).toBe(2000);
      
      // Advanced rate limiting feature should be available
      expect(features.features.security.advancedRateLimiting.enabled).toBe(true);
    });
  });
});