const ErrorTrackerInterface = require('../../../interfaces/phase6/error-tracker.interface');

describe('ErrorTracker Unit Tests', () => {
  let errorTracker;
  
  beforeEach(() => {
    errorTracker = new ErrorTrackerInterface({ 
      environment: 'test',
      sampleRate: 1.0
    });
  });
  
  describe('Error capture', () => {
    test('should capture exceptions', () => {
      const error = new Error('Test error');
      const result = errorTracker.captureException(error);
      
      expect(result).toHaveProperty('eventId');
      expect(typeof result.eventId).toBe('string');
    });
    
    test('should capture with context', () => {
      const error = new Error('Database error');
      const result = errorTracker.captureException(error, {
        user: { id: '123', email: 'test@example.com' },
        tags: { component: 'database' },
        extra: { query: 'SELECT * FROM users' }
      });
      
      expect(result).toHaveProperty('eventId');
    });
    
    test('should respect sample rate', () => {
      const tracker = new ErrorTrackerInterface({ 
        environment: 'test',
        sampleRate: 0 // Never sample
      });
      
      const error = new Error('Test');
      const result = tracker.captureException(error);
      expect(result).toHaveProperty('eventId');
      expect(tracker.capturedErrors).toHaveLength(0);
    });
  });
  
  describe('Message capture', () => {
    test('should capture messages', () => {
      const result = errorTracker.captureMessage('Test message', 'info');
      expect(result).toHaveProperty('eventId');
    });
    
    test('should capture with different levels', () => {
      expect(() => errorTracker.captureMessage('Debug', 'debug')).not.toThrow();
      expect(() => errorTracker.captureMessage('Info', 'info')).not.toThrow();
      expect(() => errorTracker.captureMessage('Warning', 'warning')).not.toThrow();
      expect(() => errorTracker.captureMessage('Error', 'error')).not.toThrow();
      expect(() => errorTracker.captureMessage('Fatal', 'fatal')).not.toThrow();
    });
  });
  
  describe('Context management', () => {
    test('should set user context', () => {
      expect(() => errorTracker.setUser({
        id: '123',
        email: 'user@example.com',
        username: 'testuser'
      })).not.toThrow();
    });
    
    test('should set tags', () => {
      expect(() => errorTracker.setTag('version', '1.0.0')).not.toThrow();
      expect(() => errorTracker.setTag('environment', 'production')).not.toThrow();
    });
    
    test('should set extra context', () => {
      expect(() => errorTracker.setContext('request', {
        method: 'POST',
        url: '/api/users'
      })).not.toThrow();
    });
  });
  
  describe('Breadcrumbs', () => {
    test('should add breadcrumbs', () => {
      expect(() => errorTracker.addBreadcrumb({
        message: 'User clicked button',
        category: 'ui',
        level: 'info'
      })).not.toThrow();
    });
    
    test('should limit breadcrumbs', () => {
      const tracker = new ErrorTrackerInterface({ 
        environment: 'test',
        maxBreadcrumbs: 5
      });
      
      for (let i = 0; i < 10; i++) {
        tracker.addBreadcrumb({ message: `Breadcrumb ${i}` });
      }
      
      expect(tracker.context.breadcrumbs).toHaveLength(5);
    });
  });
  
  describe('Middleware', () => {
    test('should create error handler middleware', () => {
      const handler = errorTracker.createErrorHandler();
      expect(typeof handler).toBe('function');
      expect(handler.length).toBe(4); // Error middleware has 4 params
    });
    
    test('should handle errors in middleware', () => {
      const handler = errorTracker.createErrorHandler({ showStack: false });
      const error = new Error('Test error');
      error.statusCode = 400;
      
      const mockReq = { path: '/api/test', method: 'GET' };
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const mockNext = jest.fn();
      
      handler(error, mockReq, mockRes, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalled();
    });
    
    test('should create request handler middleware', () => {
      const handler = errorTracker.createRequestHandler();
      expect(typeof handler).toBe('function');
    });
    
    test('should add request breadcrumbs', () => {
      const handler = errorTracker.createRequestHandler();
      
      const mockReq = {
        method: 'POST',
        path: '/api/users',
        url: '/api/users?limit=10',
        headers: { 'x-request-id': 'req-123' },
        query: { limit: '10' }
      };
      const mockRes = {};
      const mockNext = jest.fn();
      
      handler(mockReq, mockRes, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      expect(errorTracker.context.breadcrumbs.length).toBeGreaterThan(0);
    });
  });
  
  describe('Performance monitoring', () => {
    test('should start transaction', () => {
      const transaction = errorTracker.startTransaction('api-request', 'http.server');
      
      expect(transaction).toHaveProperty('id');
      expect(transaction).toHaveProperty('setTag');
      expect(transaction).toHaveProperty('finish');
    });
    
    test('should set transaction tags', () => {
      const transaction = errorTracker.startTransaction('db-query', 'db.sql');
      
      expect(() => transaction.setTag('db.name', 'users')).not.toThrow();
      expect(() => transaction.setTag('db.operation', 'SELECT')).not.toThrow();
    });
    
    test('should finish transaction', async () => {
      const transaction = errorTracker.startTransaction('operation', 'custom');
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(() => transaction.finish()).not.toThrow();
    });
  });
  
  describe('Alert configuration', () => {
    test('should configure alerts', async () => {
      const result = await errorTracker.configureAlert({
        name: 'High Error Rate',
        conditions: { level: 'error', errorType: 'DatabaseError' },
        actions: [{ type: 'email', to: 'ops@example.com' }]
      });
      
      expect(result).toHaveProperty('alertId');
      expect(result).toHaveProperty('enabled', true);
    });
  });
  
  describe('Error boundary', () => {
    test('should create error boundary', () => {
      const ErrorBoundary = errorTracker.createErrorBoundary('Fallback Component');
      expect(ErrorBoundary).toBeDefined();
    });
  });
  
  describe('Private methods', () => {
    test('should generate unique event IDs', () => {
      const id1 = errorTracker._generateEventId();
      const id2 = errorTracker._generateEventId();
      
      expect(id1).not.toBe(id2);
      expect(typeof id1).toBe('string');
      expect(id1.length).toBe(32);
    });
    
    test('should parse stack traces', () => {
      const error = new Error('Test');
      const frames = errorTracker._parseStackTrace(error.stack);
      
      expect(Array.isArray(frames)).toBe(true);
      if (frames.length > 0) {
        expect(frames[0]).toHaveProperty('function');
        expect(frames[0]).toHaveProperty('filename');
        expect(frames[0]).toHaveProperty('lineno');
        expect(frames[0]).toHaveProperty('colno');
      }
    });
    
    test('should filter headers', () => {
      const headers = {
        'content-type': 'application/json',
        'authorization': 'Bearer token123',
        'x-api-key': 'secret',
        'user-agent': 'Mozilla/5.0'
      };
      
      const filtered = errorTracker._filterHeaders(headers, [], []);
      
      expect(filtered['content-type']).toBe('application/json');
      expect(filtered['authorization']).toBe('[REDACTED]');
      expect(filtered['x-api-key']).toBe('[REDACTED]');
    });
  });
});