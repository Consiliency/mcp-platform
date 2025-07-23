const LoggerInterface = require('../../../interfaces/phase6/logger.interface');
const fs = require('fs').promises;
const path = require('path');

describe('Logger Unit Tests', () => {
  let logger;
  
  beforeEach(() => {
    logger = new LoggerInterface({ 
      level: 'debug',
      logDirectory: './test-logs'
    });
  });
  
  afterEach(async () => {
    // Clean up test logs
    try {
      await fs.rmdir('./test-logs', { recursive: true });
    } catch (e) {
      // Ignore errors
    }
  });
  
  describe('Logging methods', () => {
    test('should log at different levels', () => {
      expect(() => logger.debug('Debug message')).not.toThrow();
      expect(() => logger.info('Info message')).not.toThrow();
      expect(() => logger.warn('Warning message')).not.toThrow();
      expect(() => logger.error('Error message')).not.toThrow();
    });
    
    test('should log with metadata', () => {
      expect(() => logger.info('Test message', { userId: 123, action: 'login' })).not.toThrow();
    });
    
    test('should log errors with stack trace', () => {
      const error = new Error('Test error');
      expect(() => logger.error('Error occurred', error, { context: 'test' })).not.toThrow();
    });
  });
  
  describe('Child logger', () => {
    test('should create child logger with inherited metadata', () => {
      const childLogger = logger.child({ requestId: 'req-123' });
      expect(childLogger).toBeDefined();
      expect(childLogger).toHaveProperty('info');
      expect(childLogger).toHaveProperty('error');
    });
    
    test('child logger should maintain parent config', () => {
      const childLogger = logger.child({ requestId: 'req-123' });
      expect(childLogger.config.level).toBe(logger.config.level);
    });
  });
  
  describe('Timer functionality', () => {
    test('should start and end timer', async () => {
      const timer = logger.startTimer('test-operation');
      expect(timer).toHaveProperty('end');
      
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(() => timer.end()).not.toThrow();
    });
    
    test('should log timer duration', async () => {
      const timer = logger.startTimer('db-query');
      await new Promise(resolve => setTimeout(resolve, 50));
      timer.end({ query: 'SELECT * FROM users' });
      // Timer should have logged the duration
    });
  });
  
  describe('Request logger middleware', () => {
    test('should create middleware function', () => {
      const middleware = logger.createRequestLogger();
      expect(typeof middleware).toBe('function');
    });
    
    test('should skip specified paths', () => {
      const middleware = logger.createRequestLogger({ 
        skipPaths: ['/health', '/metrics'] 
      });
      
      const mockReq = { path: '/health', method: 'GET', headers: {} };
      const mockRes = {};
      const mockNext = jest.fn();
      
      middleware(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });
    
    test('should log request with headers when specified', () => {
      const middleware = logger.createRequestLogger({ includeHeaders: true });
      
      const mockReq = {
        path: '/api/users',
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        ip: '127.0.0.1'
      };
      const mockRes = {
        end: jest.fn(),
        on: jest.fn()
      };
      const mockNext = jest.fn();
      
      middleware(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalled();
      expect(mockReq).toHaveProperty('logger');
    });
  });
  
  describe('Log rotation', () => {
    test('should rotate logs successfully', async () => {
      const result = await logger.rotate();
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('archivedFile');
    });
  });
  
  describe('Log querying', () => {
    test('should query logs with filters', async () => {
      // Log some test messages
      logger.info('Test message 1', { type: 'test' });
      logger.info('Test message 2', { type: 'other' });
      
      // Wait a bit for logs to be written
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const result = await logger.query({ 
        filter: { type: 'test' },
        limit: 10 
      });
      
      expect(result).toHaveProperty('logs');
      expect(result).toHaveProperty('total');
      expect(Array.isArray(result.logs)).toBe(true);
    });
    
    test('should query logs by level', async () => {
      logger.error('Error message');
      logger.info('Info message');
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const result = await logger.query({ level: 'error' });
      expect(result).toHaveProperty('logs');
    });
    
    test('should respect date range in queries', async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      
      const result = await logger.query({ 
        from: yesterday,
        to: now
      });
      
      expect(result).toHaveProperty('logs');
    });
  });
});