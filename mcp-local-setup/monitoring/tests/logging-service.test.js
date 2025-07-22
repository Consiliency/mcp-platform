/**
 * Tests for LoggingService
 */

const LoggingService = require('../logging/logger');
const fs = require('fs');
const path = require('path');

jest.mock('fs');

// Mock winston properly
const mockLogger = {
  log: jest.fn(),
  configure: jest.fn()
};

const mockWinston = {
  createLogger: jest.fn(() => mockLogger),
  transports: {
    Console: jest.fn()
  },
  format: {
    combine: jest.fn(),
    timestamp: jest.fn(),
    colorize: jest.fn(),
    json: jest.fn(),
    printf: jest.fn()
  }
};

jest.mock('winston', () => mockWinston);

jest.mock('winston-daily-rotate-file', () => {
  return jest.fn().mockImplementation(() => ({}));
});

describe('LoggingService', () => {
  let loggingService;

  beforeEach(() => {
    // Mock fs methods
    fs.existsSync = jest.fn().mockReturnValue(true);
    fs.mkdirSync = jest.fn();
    fs.readdirSync = jest.fn().mockReturnValue([]);
    fs.readFileSync = jest.fn().mockReturnValue('');
    
    loggingService = new LoggingService();
  });

  afterEach(() => {
    // Clear any intervals
    jest.clearAllTimers();
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with default configuration', () => {
      expect(loggingService.loggers).toBeDefined();
      expect(loggingService.logBuffer).toEqual([]);
      expect(loggingService.logDirectory).toContain('logs');
      expect(loggingService.mainLogger).toBeDefined();
      expect(loggingService.analysisConfig).toBeDefined();
    });

    it('should ensure log directory exists', () => {
      fs.existsSync = jest.fn().mockReturnValue(false);
      
      new LoggingService();
      
      expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('logs'), { recursive: true });
    });
  });

  describe('initializeLogCollection', () => {
    it('should initialize log collection successfully', () => {
      const result = loggingService.initializeLogCollection();
      
      expect(result.success).toBe(true);
      expect(result.message).toBe('Log collection initialized successfully');
      expect(result.logDirectory).toBeDefined();
    });

    it('should handle initialization errors', () => {
      loggingService.mainLogger.configure = jest.fn().mockImplementation(() => {
        throw new Error('Configuration error');
      });
      
      expect(() => loggingService.initializeLogCollection()).toThrow('Log collection initialization failed');
    });
  });

  describe('aggregateLogs', () => {
    beforeEach(() => {
      // Add some test logs
      loggingService.logBuffer = [
        { timestamp: '2024-01-01T10:00:00Z', service: 'service1', level: 'info', message: 'Test 1' },
        { timestamp: '2024-01-01T10:01:00Z', service: 'service2', level: 'error', message: 'Test 2' },
        { timestamp: '2024-01-01T10:02:00Z', service: 'service1', level: 'warn', message: 'Test 3' }
      ];
    });

    it('should aggregate logs from multiple services', () => {
      const services = ['service1', 'service2'];
      const result = loggingService.aggregateLogs(services);
      
      expect(result.logs).toHaveLength(3);
      expect(result.stats.totalLogs).toBe(3);
      expect(result.stats.byService.service1).toBe(2);
      expect(result.stats.byService.service2).toBe(1);
      expect(result.stats.byLevel.info).toBe(1);
      expect(result.stats.byLevel.error).toBe(1);
      expect(result.stats.byLevel.warn).toBe(1);
    });

    it('should sort logs by timestamp (newest first)', () => {
      const services = ['service1', 'service2'];
      const result = loggingService.aggregateLogs(services);
      
      expect(result.logs[0].timestamp).toBe('2024-01-01T10:02:00Z');
      expect(result.logs[2].timestamp).toBe('2024-01-01T10:00:00Z');
    });

    it('should throw error if services is not an array', () => {
      expect(() => loggingService.aggregateLogs('service1')).toThrow('Services must be an array');
    });

    it('should handle empty services array', () => {
      const result = loggingService.aggregateLogs([]);
      
      expect(result.logs).toHaveLength(0);
      expect(result.stats.totalLogs).toBe(0);
    });
  });

  describe('searchLogs', () => {
    beforeEach(() => {
      loggingService.logBuffer = [
        { timestamp: '2024-01-01T10:00:00Z', service: 'api', level: 'error', message: 'Connection failed' },
        { timestamp: '2024-01-01T10:01:00Z', service: 'api', level: 'info', message: 'Request processed' },
        { timestamp: '2024-01-01T10:02:00Z', service: 'db', level: 'error', message: 'Query timeout' }
      ];
    });

    it('should search logs by query', () => {
      const result = loggingService.searchLogs('error');
      
      expect(result.results).toHaveLength(2);
      expect(result.results[0].level).toBe('error');
      expect(result.results[1].level).toBe('error');
      expect(result.query).toBe('error');
    });

    it('should filter by service', () => {
      const result = loggingService.searchLogs('', { service: 'api' });
      
      expect(result.results).toHaveLength(2);
      expect(result.results.every(log => log.service === 'api')).toBe(true);
    });

    it('should filter by level', () => {
      const result = loggingService.searchLogs('', { level: 'error' });
      
      expect(result.results).toHaveLength(2);
      expect(result.results.every(log => log.level === 'error')).toBe(true);
    });

    it('should apply pagination', () => {
      const result = loggingService.searchLogs('', { limit: 2, offset: 1 });
      
      expect(result.results).toHaveLength(2);
      expect(result.total).toBe(3);
    });

    it('should throw error if query is not provided', () => {
      expect(() => loggingService.searchLogs()).toThrow('Search query is required');
    });

    it('should search in files when buffer is not enough', () => {
      fs.readdirSync = jest.fn().mockReturnValue(['test.log']);
      fs.readFileSync = jest.fn().mockReturnValue(
        '{"timestamp":"2024-01-01T09:00:00Z","service":"old","level":"info","message":"Old log"}\n'
      );
      
      const result = loggingService.searchLogs('log', { limit: 10 });
      
      expect(fs.readdirSync).toHaveBeenCalled();
      expect(result.results.length).toBeGreaterThan(0);
    });
  });

  describe('setupAnalysisTools', () => {
    it('should setup analysis tools successfully', () => {
      const result = loggingService.setupAnalysisTools();
      
      expect(result.success).toBe(true);
      expect(result.patterns).toContain('error_spike');
      expect(result.patterns).toContain('memory_leak');
      expect(result.patterns).toContain('slow_response');
      expect(result.message).toBe('Analysis tools configured successfully');
    });

    it('should handle setup errors', () => {
      loggingService.startRealtimeAnalysis = jest.fn().mockImplementation(() => {
        throw new Error('Analysis error');
      });
      
      expect(() => loggingService.setupAnalysisTools()).toThrow('Analysis tools setup failed');
    });
  });

  describe('Logger management', () => {
    it('should create a logger for a service', () => {
      const serviceName = 'test-service';
      const logger = loggingService.createLogger(serviceName);
      
      expect(logger).toBeDefined();
      expect(loggingService.loggers.has(serviceName)).toBe(true);
    });

    it('should reuse existing logger', () => {
      const serviceName = 'test-service';
      const logger1 = loggingService.createLogger(serviceName);
      const logger2 = loggingService.createLogger(serviceName);
      
      expect(logger1).toBe(logger2);
    });

    it('should get logger for a service', () => {
      const serviceName = 'test-service';
      const logger = loggingService.getLogger(serviceName);
      
      expect(logger).toBeDefined();
      expect(loggingService.loggers.has(serviceName)).toBe(true);
    });
  });

  describe('log', () => {
    beforeEach(() => {
      loggingService.initializeLogCollection();
      loggingService.setupAnalysisTools();
    });

    it('should log a message', () => {
      const level = 'info';
      const message = 'Test message';
      const meta = { user: 'test' };
      
      loggingService.log(level, message, meta);
      
      expect(loggingService.logBuffer).toHaveLength(1);
      expect(loggingService.logBuffer[0].level).toBe(level);
      expect(loggingService.logBuffer[0].message).toBe(message);
      expect(loggingService.logBuffer[0].user).toBe('test');
    });

    it('should maintain buffer size limit', () => {
      // Fill buffer beyond limit
      for (let i = 0; i < 10005; i++) {
        loggingService.log('info', `Message ${i}`);
      }
      
      expect(loggingService.logBuffer.length).toBe(10000);
    });

    it('should update metrics', () => {
      loggingService.log('error', 'Error message');
      loggingService.log('warn', 'Warning message');
      loggingService.log('info', 'Info message');
      
      expect(loggingService.analysisConfig.metrics.totalLogs).toBe(3);
      expect(loggingService.analysisConfig.metrics.errorCount).toBe(1);
      expect(loggingService.analysisConfig.metrics.warningCount).toBe(1);
    });
  });

  describe('Pattern analysis', () => {
    beforeEach(() => {
      loggingService.setupAnalysisTools();
    });

    it('should detect error spikes', () => {
      // Generate error spike
      for (let i = 0; i < 15; i++) {
        loggingService.log('error', 'Server error occurred');
      }
      
      const alerts = loggingService.getAlerts();
      expect(alerts.some(alert => alert.pattern === 'error_spike')).toBe(true);
    });

    it('should detect memory leak patterns', () => {
      // Generate memory leak pattern
      for (let i = 0; i < 6; i++) {
        loggingService.log('error', 'Heap out of memory');
      }
      
      const alerts = loggingService.getAlerts();
      expect(alerts.some(alert => alert.pattern === 'memory_leak')).toBe(true);
    });
  });

  describe('Time range filtering', () => {
    it('should filter logs within time range', () => {
      const now = new Date();
      const oneHourAgo = new Date(now - 60 * 60 * 1000);
      const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000);
      
      loggingService.logBuffer = [
        { timestamp: twoHoursAgo.toISOString(), message: 'Old log' },
        { timestamp: oneHourAgo.toISOString(), message: 'Recent log' },
        { timestamp: now.toISOString(), message: 'Current log' }
      ];
      
      const result = loggingService.searchLogs('log', {
        startTime: oneHourAgo.toISOString(),
        endTime: now.toISOString()
      });
      
      expect(result.results).toHaveLength(2);
      expect(result.results[0].message).toBe('Recent log');
      expect(result.results[1].message).toBe('Current log');
    });
  });

  describe('Log streaming', () => {
    it('should subscribe to log stream', () => {
      const callback = jest.fn();
      const unsubscribe = loggingService.subscribe(callback);
      
      expect(typeof unsubscribe).toBe('function');
      expect(loggingService.logStream.subscribers.has(callback)).toBe(true);
      
      unsubscribe();
      expect(loggingService.logStream.subscribers.has(callback)).toBe(false);
    });

    it('should throw error for invalid callback', () => {
      expect(() => loggingService.subscribe('not a function')).toThrow('Callback must be a function');
    });
  });

  describe('Reports and statistics', () => {
    beforeEach(() => {
      loggingService.setupAnalysisTools();
    });

    it('should generate report', () => {
      // Add some logs
      loggingService.log('error', 'Error 1');
      loggingService.log('info', 'Info 1');
      
      const report = loggingService.generateReport('daily');
      
      expect(report.type).toBe('daily');
      expect(report.timestamp).toBeDefined();
      expect(report.metrics).toBeDefined();
      expect(report.topPatterns).toBeDefined();
    });

    it('should get analysis metrics', () => {
      loggingService.log('error', 'Error 1');
      loggingService.log('error', 'Error 2');
      loggingService.log('info', 'Info 1');
      
      const metrics = loggingService.getAnalysisMetrics();
      
      expect(metrics.totalLogs).toBe(3);
      expect(metrics.errorCount).toBe(2);
      expect(metrics.errorRate).toBeCloseTo(0.667, 2);
    });
  });

  describe('Alert management', () => {
    beforeEach(() => {
      loggingService.setupAnalysisTools();
    });

    it('should get current alerts', () => {
      // Trigger an alert
      for (let i = 0; i < 15; i++) {
        loggingService.log('error', 'Error occurred');
      }
      
      const alerts = loggingService.getAlerts();
      expect(Array.isArray(alerts)).toBe(true);
      expect(alerts.length).toBeGreaterThan(0);
    });

    it('should clear alerts', () => {
      // Trigger an alert
      for (let i = 0; i < 15; i++) {
        loggingService.log('error', 'Error occurred');
      }
      
      loggingService.clearAlerts();
      const alerts = loggingService.getAlerts();
      expect(alerts).toHaveLength(0);
    });
  });
});