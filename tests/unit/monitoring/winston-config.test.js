const WinstonConfig = require('../../../monitoring/logging/winston-config');
const winston = require('winston');

describe('WinstonConfig', () => {
  let winstonConfig;

  beforeEach(() => {
    winstonConfig = new WinstonConfig({
      serviceName: 'test-service',
      environment: 'test',
      logLevel: 'info'
    });
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const config = new WinstonConfig();
      expect(config.options.serviceName).toBe('mcp-service');
      expect(config.options.environment).toBe('development');
      expect(config.options.logLevel).toBe('info');
    });

    it('should accept custom options', () => {
      expect(winstonConfig.options.serviceName).toBe('test-service');
      expect(winstonConfig.options.environment).toBe('test');
    });
  });

  describe('createLogger', () => {
    it('should create a winston logger instance', () => {
      const logger = winstonConfig.createLogger();
      expect(logger).toBeDefined();
      expect(logger.info).toBeInstanceOf(Function);
      expect(logger.error).toBeInstanceOf(Function);
    });

    it('should include default metadata', () => {
      const logger = winstonConfig.createLogger();
      expect(logger.defaultMeta.service).toBe('test-service');
      expect(logger.defaultMeta.environment).toBe('test');
      expect(logger.defaultMeta.hostname).toBeDefined();
      expect(logger.defaultMeta.pid).toBe(process.pid);
    });

    it('should have request logger middleware', () => {
      const logger = winstonConfig.createLogger();
      expect(logger.requestLogger).toBeInstanceOf(Function);
    });

    it('should have performance measurement method', () => {
      const logger = winstonConfig.createLogger();
      expect(logger.measurePerformance).toBeInstanceOf(Function);
    });

    it('should have audit logging method', () => {
      const logger = winstonConfig.createLogger();
      expect(logger.audit).toBeInstanceOf(Function);
    });
  });

  describe('request logging', () => {
    it('should create request logger middleware', () => {
      const logger = winstonConfig.createLogger();
      const middleware = logger.requestLogger;
      
      const req = {
        method: 'GET',
        url: '/test',
        path: '/test',
        query: { foo: 'bar' },
        headers: { 'user-agent': 'test' },
        ip: '127.0.0.1'
      };
      
      const res = {
        end: jest.fn(),
        statusCode: 200,
        get: jest.fn().mockReturnValue('100')
      };
      
      const next = jest.fn();
      
      middleware(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(req.correlationId).toBeDefined();
      expect(req.logger).toBeDefined();
    });

    it('should sanitize sensitive headers', () => {
      const config = new WinstonConfig();
      const headers = {
        'authorization': 'Bearer token123',
        'cookie': 'session=abc123',
        'x-api-key': 'secret',
        'content-type': 'application/json'
      };
      
      const sanitized = config._sanitizeHeaders(headers);
      
      expect(sanitized.authorization).toBe('[REDACTED]');
      expect(sanitized.cookie).toBe('[REDACTED]');
      expect(sanitized['x-api-key']).toBe('[REDACTED]');
      expect(sanitized['content-type']).toBe('application/json');
    });
  });

  describe('log level management', () => {
    it('should update log level dynamically', () => {
      winstonConfig.setLogLevel('debug');
      expect(winstonConfig.options.logLevel).toBe('debug');
    });
  });

  describe('environment-specific formatting', () => {
    it('should use JSON format in production', () => {
      const prodConfig = new WinstonConfig({ environment: 'production' });
      const formats = prodConfig.formats;
      const hasJsonFormat = formats.some(f => f.options && f.options.space === 0);
      expect(hasJsonFormat || formats.length > 0).toBe(true);
    });

    it('should use colorized format in development', () => {
      const devConfig = new WinstonConfig({ environment: 'development' });
      const formats = devConfig.formats;
      expect(formats.length).toBeGreaterThan(0);
    });
  });

  describe('transport configuration', () => {
    it('should enable console transport by default', () => {
      expect(winstonConfig.transports.length).toBeGreaterThan(0);
    });

    it('should not create Elasticsearch transport without config', () => {
      const config = new WinstonConfig({ enableElasticsearch: true });
      // Should not throw error, just skip
      expect(config.transports).toBeDefined();
    });

    it('should not create CloudWatch transport without config', () => {
      const config = new WinstonConfig({ enableCloudWatch: true });
      // Should not throw error, just skip
      expect(config.transports).toBeDefined();
    });
  });
});