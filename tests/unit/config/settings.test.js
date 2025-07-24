/**
 * Unit tests for production settings configuration
 */

const path = require('path');

describe('Production Settings Configuration', () => {
  let settings;
  let originalEnv;
  let originalExit;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Mock process.exit to prevent test failures
    originalExit = process.exit;
    process.exit = jest.fn();
    
    // Set NODE_ENV to production for tests
    process.env.NODE_ENV = 'production';
    
    // Clear module cache to allow reloading with different env vars
    jest.resetModules();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    
    // Restore process.exit
    process.exit = originalExit;
  });

  describe('Configuration Loading', () => {
    it('should load settings with default values', () => {
      settings = require('../../../config/production/settings');
      
      expect(settings).toBeDefined();
      expect(settings.server).toBeDefined();
      expect(settings.app).toBeDefined();
      expect(settings.logging).toBeDefined();
      expect(settings.security).toBeDefined();
    });

    it('should have correct default server configuration', () => {
      settings = require('../../../config/production/settings');
      
      expect(settings.server.port).toBe(443);
      expect(settings.server.host).toBe('0.0.0.0');
      expect(settings.server.nodeEnv).toBe('production');
      expect(settings.server.trustProxy).toBe(1);
    });
  });

  describe('Environment Variable Overrides', () => {
    it('should override port from environment variable', () => {
      process.env.PORT = '8080';
      settings = require('../../../config/production/settings');
      
      expect(settings.server.port).toBe(8080);
    });

    it('should override API host from environment variable', () => {
      process.env.API_HOST = '127.0.0.1';
      settings = require('../../../config/production/settings');
      
      expect(settings.server.host).toBe('127.0.0.1');
    });

    it('should override log level from environment variable', () => {
      process.env.LOG_LEVEL = 'error';
      settings = require('../../../config/production/settings');
      
      expect(settings.logging.level).toBe('error');
    });

    it('should parse CORS origins from comma-separated string', () => {
      process.env.CORS_ORIGIN = 'https://app1.com, https://app2.com,https://app3.com';
      settings = require('../../../config/production/settings');
      
      expect(settings.security.corsOrigin).toEqual([
        'https://app1.com',
        'https://app2.com',
        'https://app3.com'
      ]);
    });

    it('should handle boolean environment variables correctly', () => {
      process.env.CORS_ENABLED = 'false';
      process.env.CORS_CREDENTIALS = 'true';
      process.env.HEALTH_CHECK_ENABLED = 'false';
      process.env.TRUST_PROXY = 'true';
      
      settings = require('../../../config/production/settings');
      
      expect(settings.security.corsEnabled).toBe(false);
      expect(settings.security.corsCredentials).toBe(true);
      expect(settings.healthCheck.enabled).toBe(false);
      expect(settings.server.trustProxy).toBe(true);
    });

    it('should parse numeric environment variables correctly', () => {
      process.env.REQUEST_TIMEOUT = '60000';
      process.env.SESSION_MAX_AGE = '172800000';
      process.env.WORKER_THREADS = '8';
      process.env.MAX_CONCURRENCY = '200';
      
      settings = require('../../../config/production/settings');
      
      expect(settings.requests.requestTimeout).toBe(60000);
      expect(settings.session.maxAge).toBe(172800000);
      expect(settings.performance.workerThreads).toBe(8);
      expect(settings.performance.maxConcurrency).toBe(200);
    });
  });

  describe('Configuration Validation', () => {
    it('should fail validation with invalid port', () => {
      process.env.PORT = '70000'; // Invalid port (> 65535)
      
      expect(() => {
        require('../../../config/production/settings');
      }).toThrow();
    });

    it('should fail validation with invalid log level', () => {
      process.env.LOG_LEVEL = 'debug'; // Not allowed in production
      
      expect(() => {
        require('../../../config/production/settings');
      }).toThrow();
    });

    it('should fail validation with invalid node environment', () => {
      process.env.NODE_ENV = 'development'; // Not allowed in production config
      
      expect(() => {
        require('../../../config/production/settings');
      }).toThrow();
    });

    it('should fail validation with invalid API version format', () => {
      process.env.API_VERSION = 'version1'; // Should be v1, v2, etc.
      
      expect(() => {
        require('../../../config/production/settings');
      }).toThrow();
    });

    it('should fail validation with invalid max request size format', () => {
      process.env.MAX_REQUEST_SIZE = '10megabytes'; // Should be 10mb, 10MB, etc.
      
      expect(() => {
        require('../../../config/production/settings');
      }).toThrow();
    });
  });

  describe('Path Configuration', () => {
    it('should have correct absolute paths', () => {
      settings = require('../../../config/production/settings');
      
      expect(path.isAbsolute(settings.paths.root)).toBe(true);
      expect(path.isAbsolute(settings.paths.public)).toBe(true);
      expect(settings.paths.root).toContain('config/production/../..');
    });

    it('should allow overriding paths via environment variables', () => {
      process.env.UPLOAD_PATH = '/custom/uploads';
      process.env.TEMP_PATH = '/custom/tmp';
      process.env.LOG_PATH = '/custom/logs';
      
      settings = require('../../../config/production/settings');
      
      expect(settings.paths.uploads).toBe('/custom/uploads');
      expect(settings.paths.temp).toBe('/custom/tmp');
      expect(settings.paths.logs).toBe('/custom/logs');
    });
  });

  describe('Security Configuration', () => {
    it('should have secure defaults for production', () => {
      settings = require('../../../config/production/settings');
      
      expect(settings.session.secure).toBe(true);
      expect(settings.session.httpOnly).toBe(true);
      expect(settings.session.sameSite).toBe('strict');
      expect(settings.security.helmetEnabled).toBe(true);
      expect(settings.security.strictTransportSecurity.maxAge).toBe(31536000);
      expect(settings.security.strictTransportSecurity.includeSubDomains).toBe(true);
      expect(settings.security.strictTransportSecurity.preload).toBe(true);
    });

    it('should require session secret in production', () => {
      settings = require('../../../config/production/settings');
      
      // Session secret should be undefined by default (must be set via env var)
      expect(settings.session.secret).toBeUndefined();
      
      // When set, it should be used
      process.env.SESSION_SECRET = 'super-secret-key';
      jest.resetModules();
      settings = require('../../../config/production/settings');
      
      expect(settings.session.secret).toBe('super-secret-key');
    });
  });

  describe('Performance Configuration', () => {
    it('should have reasonable performance defaults', () => {
      settings = require('../../../config/production/settings');
      
      expect(settings.performance.workerThreads).toBe(4);
      expect(settings.performance.clusterEnabled).toBe(false);
      expect(settings.performance.maxConcurrency).toBe(100);
      expect(settings.performance.queueSize).toBe(1000);
    });

    it('should enable clustering via environment variable', () => {
      process.env.CLUSTER_ENABLED = 'true';
      settings = require('../../../config/production/settings');
      
      expect(settings.performance.clusterEnabled).toBe(true);
    });
  });

  describe('Graceful Shutdown Configuration', () => {
    it('should have appropriate shutdown timeouts', () => {
      settings = require('../../../config/production/settings');
      
      expect(settings.shutdown.gracefulTimeout).toBe(30000);
      expect(settings.shutdown.forceTimeout).toBe(35000);
      expect(settings.shutdown.forceTimeout).toBeGreaterThan(settings.shutdown.gracefulTimeout);
      expect(settings.shutdown.drainConnections).toBe(true);
    });
  });

  describe('Localization Configuration', () => {
    it('should have correct default localization settings', () => {
      settings = require('../../../config/production/settings');
      
      expect(settings.localization.timezone).toBe('UTC');
      expect(settings.localization.locale).toBe('en-US');
      expect(settings.localization.dateFormat).toBe('ISO');
    });

    it('should allow overriding localization settings', () => {
      process.env.TZ = 'America/New_York';
      process.env.LOCALE = 'fr-FR';
      process.env.DATE_FORMAT = 'DD/MM/YYYY';
      
      settings = require('../../../config/production/settings');
      
      expect(settings.localization.timezone).toBe('America/New_York');
      expect(settings.localization.locale).toBe('fr-FR');
      expect(settings.localization.dateFormat).toBe('DD/MM/YYYY');
    });
  });

  describe('Logging Configuration', () => {
    it('should have production-appropriate logging defaults', () => {
      settings = require('../../../config/production/settings');
      
      expect(settings.logging.level).toBe('info');
      expect(settings.logging.format).toBe('json');
      expect(settings.logging.output).toBe('stdout');
      expect(settings.logging.includeMetadata).toBe(true);
      expect(settings.logging.redactSecrets).toBe(true);
    });

    it('should configure log rotation settings', () => {
      settings = require('../../../config/production/settings');
      
      expect(settings.logging.maxSize).toBe('100M');
      expect(settings.logging.maxFiles).toBe(10);
      expect(settings.logging.filePath).toBe('/var/log/mcp/app.log');
    });
  });

  describe('Health Check Configuration', () => {
    it('should have health check enabled by default', () => {
      settings = require('../../../config/production/settings');
      
      expect(settings.healthCheck.enabled).toBe(true);
      expect(settings.healthCheck.path).toBe('/health');
      expect(settings.healthCheck.interval).toBe(30000);
      expect(settings.healthCheck.timeout).toBe(5000);
      expect(settings.healthCheck.includeDetails).toBe(false);
    });

    it('should allow enabling detailed health checks', () => {
      process.env.HEALTH_CHECK_DETAILS = 'true';
      settings = require('../../../config/production/settings');
      
      expect(settings.healthCheck.includeDetails).toBe(true);
    });
  });

  describe('Request Configuration', () => {
    it('should have appropriate request limits', () => {
      settings = require('../../../config/production/settings');
      
      expect(settings.requests.maxRequestSize).toBe('10mb');
      expect(settings.requests.requestTimeout).toBe(30000);
      expect(settings.requests.keepAliveTimeout).toBe(65000);
      expect(settings.requests.headersTimeout).toBe(60000);
    });

    it('should ensure keepAliveTimeout > requestTimeout', () => {
      settings = require('../../../config/production/settings');
      
      expect(settings.requests.keepAliveTimeout).toBeGreaterThan(settings.requests.requestTimeout);
    });
  });
});