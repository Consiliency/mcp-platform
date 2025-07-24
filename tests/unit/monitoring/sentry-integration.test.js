const SentryIntegration = require('../../../monitoring/errors/sentry-integration');
const Sentry = require('@sentry/node');

// Mock Sentry
jest.mock('@sentry/node', () => ({
  init: jest.fn(),
  captureException: jest.fn().mockReturnValue('mock-event-id'),
  captureMessage: jest.fn().mockReturnValue('mock-event-id'),
  setUser: jest.fn(),
  setTags: jest.fn(),
  setContext: jest.fn(),
  addBreadcrumb: jest.fn(),
  startTransaction: jest.fn().mockReturnValue({
    startChild: jest.fn().mockReturnValue({
      finish: jest.fn()
    }),
    setStatus: jest.fn(),
    finish: jest.fn()
  }),
  getCurrentHub: jest.fn().mockReturnValue({
    configureScope: jest.fn(),
    getClient: jest.fn(),
    getScope: jest.fn()
  }),
  configureScope: jest.fn(),
  withScope: jest.fn(),
  flush: jest.fn().mockResolvedValue(true),
  close: jest.fn().mockResolvedValue(true),
  lastEventId: jest.fn().mockReturnValue('last-event-id'),
  addGlobalEventProcessor: jest.fn(),
  Handlers: {
    errorHandler: jest.fn().mockReturnValue((err, req, res, next) => {}),
    requestHandler: jest.fn().mockReturnValue((req, res, next) => {}),
    tracingHandler: jest.fn().mockReturnValue((req, res, next) => {})
  },
  Integrations: {
    Http: jest.fn(),
    Console: jest.fn(),
    Modules: jest.fn(),
    ContextLines: jest.fn(),
    LinkedErrors: jest.fn(),
    RequestData: jest.fn()
  }
}));

describe('SentryIntegration', () => {
  let sentryIntegration;

  beforeEach(() => {
    jest.clearAllMocks();
    
    sentryIntegration = new SentryIntegration({
      dsn: 'https://test@sentry.io/123456',
      environment: 'test',
      release: '1.0.0'
    });
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const integration = new SentryIntegration();
      expect(integration.options.environment).toBe('development');
      expect(integration.options.sampleRate).toBe(1.0);
      expect(integration.options.tracesSampleRate).toBe(0.1);
    });

    it('should accept custom options', () => {
      expect(sentryIntegration.options.dsn).toBe('https://test@sentry.io/123456');
      expect(sentryIntegration.options.environment).toBe('test');
      expect(sentryIntegration.options.release).toBe('1.0.0');
    });
  });

  describe('initialize', () => {
    it('should initialize Sentry with configuration', () => {
      sentryIntegration.initialize();
      
      expect(Sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({
          dsn: 'https://test@sentry.io/123456',
          environment: 'test',
          release: '1.0.0'
        })
      );
      expect(sentryIntegration.initialized).toBe(true);
    });

    it('should not initialize without DSN', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const integration = new SentryIntegration({ dsn: null });
      
      integration.initialize();
      
      expect(consoleWarnSpy).toHaveBeenCalledWith('Sentry DSN not provided. Error tracking disabled.');
      expect(Sentry.init).not.toHaveBeenCalled();
      
      consoleWarnSpy.mockRestore();
    });

    it('should not initialize twice', () => {
      sentryIntegration.initialize();
      sentryIntegration.initialize();
      
      expect(Sentry.init).toHaveBeenCalledTimes(1);
    });
  });

  describe('error capturing', () => {
    beforeEach(() => {
      sentryIntegration.initialize();
    });

    it('should capture exceptions', () => {
      const error = new Error('Test error');
      const context = {
        tags: { component: 'test' },
        extra: { debug: true }
      };
      
      const eventId = sentryIntegration.captureException(error, context);
      
      expect(Sentry.captureException).toHaveBeenCalledWith(error, expect.objectContaining({
        tags: context.tags,
        extra: context.extra
      }));
      expect(eventId).toBe('mock-event-id');
    });

    it('should capture messages', () => {
      const eventId = sentryIntegration.captureMessage('Test message', 'warning', {
        tags: { type: 'test' }
      });
      
      expect(Sentry.captureMessage).toHaveBeenCalledWith('Test message', expect.objectContaining({
        level: 'warning'
      }));
      expect(eventId).toBe('mock-event-id');
    });

    it('should handle uninitialized state', () => {
      const uninitializedIntegration = new SentryIntegration();
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      const eventId = uninitializedIntegration.captureException(new Error('Test'));
      
      expect(eventId).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalled();
      
      consoleErrorSpy.mockRestore();
    });
  });

  describe('context management', () => {
    beforeEach(() => {
      sentryIntegration.initialize();
    });

    it('should set user context', () => {
      const user = {
        id: '123',
        username: 'testuser',
        email: 'test@example.com'
      };
      
      sentryIntegration.setUser(user);
      
      expect(Sentry.setUser).toHaveBeenCalledWith(expect.objectContaining({
        id: '123',
        username: 'testuser',
        email: 'test@example.com'
      }));
    });

    it('should clear user context', () => {
      sentryIntegration.clearUser();
      expect(Sentry.setUser).toHaveBeenCalledWith(null);
    });

    it('should set tags', () => {
      const tags = { environment: 'production', version: '1.0.0' };
      sentryIntegration.setTags(tags);
      expect(Sentry.setTags).toHaveBeenCalledWith(tags);
    });

    it('should set context', () => {
      const context = { feature: 'payment', plan: 'premium' };
      sentryIntegration.setContext('subscription', context);
      expect(Sentry.setContext).toHaveBeenCalledWith('subscription', context);
    });

    it('should add breadcrumb', () => {
      const breadcrumb = {
        message: 'User clicked button',
        category: 'ui',
        level: 'info'
      };
      
      sentryIntegration.addBreadcrumb(breadcrumb);
      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(breadcrumb);
    });
  });

  describe('Express integration', () => {
    beforeEach(() => {
      sentryIntegration.initialize();
    });

    it('should create Express error handler', () => {
      const handler = sentryIntegration.createExpressErrorHandler();
      expect(Sentry.Handlers.errorHandler).toHaveBeenCalled();
      expect(handler).toBeInstanceOf(Function);
    });

    it('should create Express request handler', () => {
      const handler = sentryIntegration.createExpressRequestHandler();
      expect(Sentry.Handlers.requestHandler).toHaveBeenCalled();
      expect(handler).toBeInstanceOf(Function);
    });

    it('should create tracing handler', () => {
      const handler = sentryIntegration.createTracingHandler();
      expect(Sentry.Handlers.tracingHandler).toHaveBeenCalled();
      expect(handler).toBeInstanceOf(Function);
    });
  });

  describe('performance monitoring', () => {
    beforeEach(() => {
      sentryIntegration.initialize();
    });

    it('should start transaction', () => {
      const transaction = sentryIntegration.startTransaction('test-transaction', 'test');
      
      expect(Sentry.startTransaction).toHaveBeenCalledWith({
        name: 'test-transaction',
        op: 'test',
        data: {},
        tags: undefined,
        metadata: undefined
      });
      expect(transaction).toBeDefined();
    });

    it('should create span', () => {
      const transaction = sentryIntegration.startTransaction('test', 'test');
      const span = sentryIntegration.startSpan('db.query', 'SELECT * FROM users', transaction);
      
      expect(transaction.startChild).toHaveBeenCalledWith({
        op: 'db.query',
        description: 'SELECT * FROM users'
      });
      expect(span).toBeDefined();
    });
  });

  describe('utility methods', () => {
    beforeEach(() => {
      sentryIntegration.initialize();
    });

    it('should wrap async functions', async () => {
      const asyncFn = jest.fn().mockResolvedValue('success');
      const wrapped = sentryIntegration.wrapAsync(asyncFn, {
        tags: { wrapped: true }
      });
      
      const result = await wrapped('arg1', 'arg2');
      
      expect(asyncFn).toHaveBeenCalledWith('arg1', 'arg2');
      expect(result).toBe('success');
    });

    it('should capture errors in wrapped async functions', async () => {
      const error = new Error('Async error');
      const asyncFn = jest.fn().mockRejectedValue(error);
      const wrapped = sentryIntegration.wrapAsync(asyncFn);
      
      await expect(wrapped()).rejects.toThrow('Async error');
      expect(Sentry.captureException).toHaveBeenCalledWith(error, expect.any(Object));
    });

    it('should profile transactions', async () => {
      const fn = jest.fn().mockResolvedValue('result');
      const profiled = sentryIntegration.profileTransaction('test-profile', fn);
      
      const result = await profiled('arg');
      
      expect(fn).toHaveBeenCalledWith('arg');
      expect(result).toBe('result');
    });

    it('should flush events', async () => {
      await sentryIntegration.flush(5000);
      expect(Sentry.flush).toHaveBeenCalledWith(5000);
    });

    it('should close Sentry client', async () => {
      await sentryIntegration.close(5000);
      expect(Sentry.close).toHaveBeenCalledWith(5000);
    });

    it('should get last event ID', () => {
      const eventId = sentryIntegration.getLastEventId();
      expect(eventId).toBe('last-event-id');
    });
  });

  describe('event processors', () => {
    it('should add custom event processor', () => {
      sentryIntegration.initialize();
      
      const processor = jest.fn();
      sentryIntegration.addEventProcessor(processor);
      
      expect(Sentry.addGlobalEventProcessor).toHaveBeenCalledWith(processor);
    });

    it('should queue event processors before initialization', () => {
      const processor = jest.fn();
      sentryIntegration.addEventProcessor(processor);
      
      expect(sentryIntegration.eventProcessors).toContain(processor);
      
      sentryIntegration.initialize();
      expect(Sentry.addGlobalEventProcessor).toHaveBeenCalledWith(processor);
    });
  });

  describe('sensitive data filtering', () => {
    it('should filter sensitive data from events', () => {
      const event = {
        request: {
          headers: {
            authorization: 'Bearer token123',
            'content-type': 'application/json'
          },
          data: {
            password: 'secret123',
            username: 'testuser'
          }
        },
        extra: {
          api_key: 'key123',
          user: 'testuser'
        }
      };
      
      const filtered = sentryIntegration._filterSensitiveData(event);
      
      expect(filtered.request.headers.authorization).toBe('[FILTERED]');
      expect(filtered.request.headers['content-type']).toBe('application/json');
      expect(filtered.request.data.password).toBe('[FILTERED]');
      expect(filtered.request.data.username).toBe('testuser');
      expect(filtered.extra.api_key).toBe('[FILTERED]');
    });
  });

  describe('Winston transport', () => {
    it('should create Winston transport', () => {
      sentryIntegration.initialize();
      const transport = sentryIntegration.createWinstonTransport();
      
      expect(transport).toBeDefined();
      expect(transport.log).toBeInstanceOf(Function);
    });
  });
});