const Sentry = require('@sentry/node');
const { ProfilingIntegration } = require('@sentry/profiling-node');

/**
 * Sentry integration for advanced error tracking
 * Provides production-ready error monitoring with Sentry
 */
class SentryIntegration {
  constructor(options = {}) {
    this.options = {
      dsn: options.dsn || process.env.SENTRY_DSN,
      environment: options.environment || process.env.NODE_ENV || 'development',
      release: options.release || process.env.APP_VERSION,
      sampleRate: options.sampleRate || 1.0,
      tracesSampleRate: options.tracesSampleRate || 0.1,
      profilesSampleRate: options.profilesSampleRate || 0.1,
      serverName: options.serverName || require('os').hostname(),
      attachStacktrace: options.attachStacktrace !== false,
      debug: options.debug || false,
      ...options
    };

    this.initialized = false;
    this.integrations = [];
    this.beforeSendHandlers = [];
    this.eventProcessors = [];
  }

  /**
   * Initialize Sentry with configuration
   */
  initialize() {
    if (this.initialized) {
      return;
    }

    if (!this.options.dsn) {
      console.warn('Sentry DSN not provided. Error tracking disabled.');
      return;
    }

    // Configure integrations
    this._configureIntegrations();

    // Initialize Sentry
    Sentry.init({
      dsn: this.options.dsn,
      environment: this.options.environment,
      release: this.options.release,
      sampleRate: this.options.sampleRate,
      tracesSampleRate: this.options.tracesSampleRate,
      profilesSampleRate: this.options.profilesSampleRate,
      serverName: this.options.serverName,
      attachStacktrace: this.options.attachStacktrace,
      debug: this.options.debug,
      integrations: this.integrations,
      
      // Performance monitoring
      tracesSampler: this._createTracesSampler(),
      
      // Before send hook
      beforeSend: this._createBeforeSendHandler(),
      
      // Breadcrumb filtering
      beforeBreadcrumb: this._createBeforeBreadcrumbHandler(),
      
      // Transport options
      transportOptions: {
        // Increase timeout for slow networks
        requestTimeout: 30000,
        // Retry failed requests
        shouldRetry: true,
        retryDelay: 5000
      },
      
      // Additional options
      normalizeDepth: 10,
      maxBreadcrumbs: 100,
      maxValueLength: 1000,
      
      // Ignore specific errors
      ignoreErrors: [
        // Browser-specific errors
        'ResizeObserver loop limit exceeded',
        'Non-Error promise rejection captured',
        // Network errors
        'NetworkError',
        'Network request failed',
        // Common non-critical errors
        'AbortError',
        'Non-Error exception captured'
      ],
      
      // Denied URLs
      denyUrls: [
        // Chrome extensions
        /extensions\//i,
        /^chrome:\/\//i,
        // Firefox extensions
        /^resource:\/\//i,
        // Other browser extensions
        /^moz-extension:\/\//i,
        /^safari-extension:\/\//i
      ]
    });

    // Add event processors
    this.eventProcessors.forEach(processor => {
      Sentry.addGlobalEventProcessor(processor);
    });

    this.initialized = true;
  }

  /**
   * Configure Sentry integrations
   */
  _configureIntegrations() {
    // Default integrations
    this.integrations = [
      // HTTP integration for request/response tracking
      new Sentry.Integrations.Http({
        tracing: true,
        breadcrumbs: true
      }),
      
      // Console integration
      new Sentry.Integrations.Console(),
      
      // Modules integration
      new Sentry.Integrations.Modules(),
      
      // Context lines integration
      new Sentry.Integrations.ContextLines(),
      
      // Linked errors integration
      new Sentry.Integrations.LinkedErrors(),
      
      // Request data integration
      new Sentry.Integrations.RequestData({
        include: {
          data: true,
          headers: true,
          query_string: true,
          url: true,
          user: true
        }
      })
    ];

    // Add profiling integration if enabled
    if (this.options.profilesSampleRate > 0) {
      this.integrations.push(new ProfilingIntegration());
    }

    // Add custom integrations
    if (this.options.integrations) {
      this.integrations.push(...this.options.integrations);
    }
  }

  /**
   * Create traces sampler for performance monitoring
   */
  _createTracesSampler() {
    return (samplingContext) => {
      // Always trace critical transactions
      if (samplingContext.transactionContext.name.includes('critical')) {
        return 1.0;
      }
      
      // Lower sample rate for health checks
      if (samplingContext.transactionContext.name.includes('health')) {
        return 0.01;
      }
      
      // Use default sample rate for everything else
      return this.options.tracesSampleRate;
    };
  }

  /**
   * Create before send handler
   */
  _createBeforeSendHandler() {
    return (event, hint) => {
      // Apply custom handlers
      for (const handler of this.beforeSendHandlers) {
        event = handler(event, hint);
        if (!event) return null;
      }
      
      // Filter sensitive data
      event = this._filterSensitiveData(event);
      
      // Add custom context
      event = this._addCustomContext(event);
      
      // Skip events in development based on configuration
      if (this.options.environment === 'development' && !this.options.captureInDevelopment) {
        return null;
      }
      
      return event;
    };
  }

  /**
   * Create before breadcrumb handler
   */
  _createBeforeBreadcrumbHandler() {
    return (breadcrumb, hint) => {
      // Filter out noisy breadcrumbs
      if (breadcrumb.category === 'console' && breadcrumb.level === 'debug') {
        return null;
      }
      
      // Sanitize breadcrumb data
      if (breadcrumb.data) {
        breadcrumb.data = this._sanitizeData(breadcrumb.data);
      }
      
      return breadcrumb;
    };
  }

  /**
   * Filter sensitive data from events
   */
  _filterSensitiveData(event) {
    const sensitiveKeys = [
      'password', 'passwd', 'secret', 'token', 'api_key', 'apikey',
      'auth', 'credential', 'mysql_pwd', 'stripetoken', 'card',
      'ssn', 'social_security', 'credit_card'
    ];
    
    const filterObject = (obj) => {
      if (!obj || typeof obj !== 'object') return obj;
      
      const filtered = Array.isArray(obj) ? [] : {};
      
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          const lowerKey = key.toLowerCase();
          
          if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive))) {
            filtered[key] = '[FILTERED]';
          } else if (typeof obj[key] === 'object') {
            filtered[key] = filterObject(obj[key]);
          } else {
            filtered[key] = obj[key];
          }
        }
      }
      
      return filtered;
    };
    
    // Filter request data
    if (event.request) {
      event.request = filterObject(event.request);
    }
    
    // Filter extra data
    if (event.extra) {
      event.extra = filterObject(event.extra);
    }
    
    // Filter contexts
    if (event.contexts) {
      event.contexts = filterObject(event.contexts);
    }
    
    return event;
  }

  /**
   * Add custom context to events
   */
  _addCustomContext(event) {
    // Add server context
    event.contexts = event.contexts || {};
    event.contexts.server = {
      name: this.options.serverName,
      node_version: process.version,
      platform: process.platform,
      arch: process.arch,
      uptime: process.uptime()
    };
    
    // Add memory context
    const memUsage = process.memoryUsage();
    event.contexts.memory = {
      heap_used: memUsage.heapUsed,
      heap_total: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss
    };
    
    // Add custom tags
    event.tags = event.tags || {};
    event.tags.node_env = process.env.NODE_ENV;
    event.tags.deployment = process.env.DEPLOYMENT_ENV || 'unknown';
    
    return event;
  }

  /**
   * Sanitize data to remove sensitive information
   */
  _sanitizeData(data) {
    const sanitized = { ...data };
    
    // Remove authorization headers
    if (sanitized.headers) {
      const headers = { ...sanitized.headers };
      ['authorization', 'cookie', 'x-api-key'].forEach(header => {
        if (headers[header]) {
          headers[header] = '[FILTERED]';
        }
      });
      sanitized.headers = headers;
    }
    
    return sanitized;
  }

  /**
   * Create Express error handler
   */
  createExpressErrorHandler(options = {}) {
    return Sentry.Handlers.errorHandler({
      shouldHandleError: (error) => {
        // Capture all 5xx errors
        if (error.status >= 500) return true;
        
        // Capture specific 4xx errors
        if ([401, 403, 429].includes(error.status)) return true;
        
        // Apply custom filter if provided
        if (options.shouldHandleError) {
          return options.shouldHandleError(error);
        }
        
        return true;
      }
    });
  }

  /**
   * Create Express request handler
   */
  createExpressRequestHandler(options = {}) {
    return Sentry.Handlers.requestHandler({
      include: {
        data: true,
        headers: true,
        query_string: true,
        url: true,
        user: true,
        transaction: 'methodPath'
      },
      ...options
    });
  }

  /**
   * Create tracing handler
   */
  createTracingHandler() {
    return Sentry.Handlers.tracingHandler();
  }

  /**
   * Capture exception with additional context
   */
  captureException(error, context = {}) {
    if (!this.initialized) {
      console.error('Sentry not initialized', error);
      return null;
    }
    
    return Sentry.captureException(error, {
      contexts: context.contexts,
      tags: context.tags,
      level: context.level || 'error',
      user: context.user,
      extra: context.extra,
      fingerprint: context.fingerprint
    });
  }

  /**
   * Capture message
   */
  captureMessage(message, level = 'info', context = {}) {
    if (!this.initialized) {
      console.log(`[${level}] ${message}`);
      return null;
    }
    
    return Sentry.captureMessage(message, {
      level,
      contexts: context.contexts,
      tags: context.tags,
      extra: context.extra
    });
  }

  /**
   * Set user context
   */
  setUser(user) {
    if (!this.initialized) return;
    
    Sentry.setUser({
      id: user.id,
      username: user.username,
      email: user.email,
      ip_address: user.ip,
      subscription: user.subscription,
      roles: user.roles
    });
  }

  /**
   * Clear user context
   */
  clearUser() {
    if (!this.initialized) return;
    Sentry.setUser(null);
  }

  /**
   * Set tags
   */
  setTags(tags) {
    if (!this.initialized) return;
    Sentry.setTags(tags);
  }

  /**
   * Set context
   */
  setContext(key, context) {
    if (!this.initialized) return;
    Sentry.setContext(key, context);
  }

  /**
   * Add breadcrumb
   */
  addBreadcrumb(breadcrumb) {
    if (!this.initialized) return;
    Sentry.addBreadcrumb(breadcrumb);
  }

  /**
   * Start transaction for performance monitoring
   */
  startTransaction(name, op, data = {}) {
    if (!this.initialized) return null;
    
    const transaction = Sentry.startTransaction({
      name,
      op,
      data,
      tags: data.tags,
      metadata: data.metadata
    });
    
    Sentry.getCurrentHub().configureScope(scope => scope.setSpan(transaction));
    
    return transaction;
  }

  /**
   * Create span for tracing
   */
  startSpan(op, description, transaction) {
    if (!transaction) return null;
    
    return transaction.startChild({
      op,
      description
    });
  }

  /**
   * Wrap async function with error handling
   */
  wrapAsync(fn, options = {}) {
    return async (...args) => {
      try {
        return await fn(...args);
      } catch (error) {
        this.captureException(error, {
          extra: {
            function: fn.name || 'anonymous',
            arguments: args,
            ...options.extra
          },
          tags: options.tags,
          level: options.level || 'error'
        });
        throw error;
      }
    };
  }

  /**
   * Create profiling transaction
   */
  profileTransaction(name, fn) {
    return async (...args) => {
      const transaction = this.startTransaction(name, 'function');
      
      try {
        const result = await fn(...args);
        transaction.setStatus('ok');
        return result;
      } catch (error) {
        transaction.setStatus('internal_error');
        throw error;
      } finally {
        transaction.finish();
      }
    };
  }

  /**
   * Flush events
   */
  async flush(timeout = 2000) {
    if (!this.initialized) return;
    return await Sentry.flush(timeout);
  }

  /**
   * Close Sentry client
   */
  async close(timeout = 2000) {
    if (!this.initialized) return;
    return await Sentry.close(timeout);
  }

  /**
   * Add custom before send handler
   */
  addBeforeSendHandler(handler) {
    this.beforeSendHandlers.push(handler);
  }

  /**
   * Add custom event processor
   */
  addEventProcessor(processor) {
    if (this.initialized) {
      Sentry.addGlobalEventProcessor(processor);
    } else {
      this.eventProcessors.push(processor);
    }
  }

  /**
   * Get last event ID
   */
  getLastEventId() {
    if (!this.initialized) return null;
    return Sentry.lastEventId();
  }

  /**
   * Show report dialog
   */
  showReportDialog(options = {}) {
    if (!this.initialized) return;
    
    const hub = Sentry.getCurrentHub();
    const client = hub.getClient();
    const scope = hub.getScope();
    
    if (client && scope) {
      client.showReportDialog({
        ...options,
        eventId: options.eventId || this.getLastEventId()
      });
    }
  }

  /**
   * Configure scope
   */
  configureScope(callback) {
    if (!this.initialized) return;
    Sentry.configureScope(callback);
  }

  /**
   * With scope
   */
  withScope(callback) {
    if (!this.initialized) {
      callback({});
      return;
    }
    Sentry.withScope(callback);
  }

  /**
   * Integration with Winston logger
   */
  createWinstonTransport() {
    const Transport = require('winston-transport');
    
    class SentryTransport extends Transport {
      constructor(opts = {}) {
        super(opts);
        this.sentry = opts.sentry;
        this.levelsMap = {
          error: 'error',
          warn: 'warning',
          info: 'info',
          debug: 'debug'
        };
      }
      
      log(info, callback) {
        setImmediate(() => {
          this.emit('logged', info);
        });
        
        const level = this.levelsMap[info.level] || 'info';
        
        if (info.level === 'error' && info.error) {
          this.sentry.captureException(info.error, {
            level,
            extra: info.metadata,
            tags: info.tags
          });
        } else {
          this.sentry.captureMessage(info.message, level, {
            extra: info.metadata,
            tags: info.tags
          });
        }
        
        callback();
      }
    }
    
    return new SentryTransport({ sentry: this });
  }
}

module.exports = SentryIntegration;