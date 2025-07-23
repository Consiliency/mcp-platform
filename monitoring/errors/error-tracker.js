const crypto = require('crypto');
const ErrorTrackerInterface = require('../../interfaces/phase6/error-tracker.interface');

class ErrorTracker extends ErrorTrackerInterface {
  constructor(config = {}) {
    super(config);
    
    this.config = {
      dsn: config.dsn,
      environment: config.environment || 'development',
      release: config.release,
      sampleRate: config.sampleRate || 1.0,
      maxBreadcrumbs: config.maxBreadcrumbs || 100,
      ...config
    };
    
    // Context storage
    this.context = {
      user: null,
      tags: {},
      extra: {},
      breadcrumbs: []
    };
    
    // Transaction storage
    this.transactions = new Map();
    
    // Error storage (for local development/testing)
    this.capturedErrors = [];
    
    // Alert rules
    this.alertRules = new Map();
  }
  
  captureException(error, context = {}) {
    const eventId = this._generateEventId();
    
    // Check sample rate
    if (Math.random() > this.config.sampleRate) {
      return { eventId };
    }
    
    const errorEvent = {
      eventId,
      timestamp: new Date().toISOString(),
      environment: this.config.environment,
      release: this.config.release,
      error: {
        type: error.name || 'Error',
        value: error.message,
        stacktrace: this._parseStackTrace(error.stack)
      },
      user: context.user || this.context.user,
      tags: { ...this.context.tags, ...(context.tags || {}) },
      extra: { ...this.context.extra, ...(context.extra || {}) },
      breadcrumbs: [...this.context.breadcrumbs],
      level: 'error'
    };
    
    // Store error event
    this.capturedErrors.push(errorEvent);
    
    // Check alert rules
    this._checkAlertRules(errorEvent);
    
    // In production, this would send to Sentry or similar service
    if (this.config.dsn) {
      this._sendToSentry(errorEvent);
    }
    
    return { eventId };
  }
  
  captureMessage(message, level = 'info', context = {}) {
    const eventId = this._generateEventId();
    
    // Check sample rate
    if (Math.random() > this.config.sampleRate) {
      return { eventId };
    }
    
    const messageEvent = {
      eventId,
      timestamp: new Date().toISOString(),
      environment: this.config.environment,
      release: this.config.release,
      message,
      level,
      user: context.user || this.context.user,
      tags: { ...this.context.tags, ...(context.tags || {}) },
      extra: { ...this.context.extra, ...(context.extra || {}) },
      breadcrumbs: [...this.context.breadcrumbs]
    };
    
    // Store message event
    this.capturedErrors.push(messageEvent);
    
    // Check alert rules
    this._checkAlertRules(messageEvent);
    
    // In production, this would send to Sentry or similar service
    if (this.config.dsn) {
      this._sendToSentry(messageEvent);
    }
    
    return { eventId };
  }
  
  setUser(user) {
    this.context.user = user;
  }
  
  setTag(key, value) {
    this.context.tags[key] = value;
  }
  
  setContext(key, context) {
    this.context.extra[key] = context;
  }
  
  addBreadcrumb(breadcrumb) {
    const crumb = {
      timestamp: new Date().toISOString(),
      message: breadcrumb.message,
      category: breadcrumb.category || 'default',
      level: breadcrumb.level || 'info',
      data: breadcrumb.data || {}
    };
    
    this.context.breadcrumbs.push(crumb);
    
    // Limit breadcrumbs
    if (this.context.breadcrumbs.length > this.config.maxBreadcrumbs) {
      this.context.breadcrumbs.shift();
    }
  }
  
  createErrorHandler(options = {}) {
    const {
      showStack = false,
      shouldHandleError = () => true
    } = options;
    
    return (error, req, res, next) => {
      // Check if we should handle this error
      if (!shouldHandleError(error)) {
        return next(error);
      }
      
      // Capture the error
      const { eventId } = this.captureException(error, {
        tags: {
          path: req.path,
          method: req.method
        },
        extra: {
          params: req.params,
          query: req.query,
          headers: req.headers
        }
      });
      
      // Send error response
      const statusCode = error.statusCode || error.status || 500;
      const response = {
        error: {
          message: error.message || 'Internal Server Error',
          eventId
        }
      };
      
      if (showStack && this.config.environment !== 'production') {
        response.error.stack = error.stack;
      }
      
      res.status(statusCode).json(response);
    };
  }
  
  createRequestHandler(options = {}) {
    const {
      include = [],
      exclude = []
    } = options;
    
    return (req, res, next) => {
      // Add request breadcrumb
      this.addBreadcrumb({
        message: `${req.method} ${req.path}`,
        category: 'http',
        data: {
          method: req.method,
          url: req.url,
          path: req.path,
          query: req.query
        }
      });
      
      // Set request context
      const requestId = req.headers['x-request-id'] || this._generateEventId();
      this.setContext('request', {
        id: requestId,
        method: req.method,
        url: req.url,
        headers: this._filterHeaders(req.headers, include, exclude),
        ip: req.ip || req.connection.remoteAddress
      });
      
      next();
    };
  }
  
  startTransaction(name, op) {
    const transaction = {
      id: this._generateEventId(),
      name,
      op,
      startTime: Date.now(),
      tags: {},
      data: {}
    };
    
    this.transactions.set(transaction.id, transaction);
    
    return {
      id: transaction.id,
      setTag: (key, value) => {
        const trans = this.transactions.get(transaction.id);
        if (trans) {
          trans.tags[key] = value;
        }
      },
      finish: () => {
        const trans = this.transactions.get(transaction.id);
        if (trans) {
          trans.endTime = Date.now();
          trans.duration = trans.endTime - trans.startTime;
          
          // Add transaction breadcrumb
          this.addBreadcrumb({
            message: `Transaction ${trans.name} completed`,
            category: 'transaction',
            data: {
              duration: trans.duration,
              op: trans.op,
              tags: trans.tags
            }
          });
          
          // In production, send transaction data
          if (this.config.dsn) {
            this._sendTransactionToSentry(trans);
          }
          
          this.transactions.delete(transaction.id);
        }
      }
    };
  }
  
  async configureAlert(rule) {
    const alertId = this._generateEventId();
    
    const alertConfig = {
      id: alertId,
      name: rule.name,
      conditions: rule.conditions,
      actions: rule.actions,
      enabled: true,
      createdAt: new Date().toISOString()
    };
    
    this.alertRules.set(alertId, alertConfig);
    
    return {
      alertId,
      enabled: alertConfig.enabled
    };
  }
  
  createErrorBoundary(fallback) {
    // This is a React-specific implementation
    // In a real implementation, this would return a React component
    class ErrorBoundary {
      constructor(props) {
        this.props = props;
        this.state = { hasError: false, error: null };
      }
      
      static getDerivedStateFromError(error) {
        return { hasError: true, error };
      }
      
      componentDidCatch(error, errorInfo) {
        // Capture the error
        this.captureException(error, {
          extra: {
            componentStack: errorInfo.componentStack
          }
        });
      }
      
      render() {
        if (this.state.hasError) {
          return fallback;
        }
        
        return this.props.children;
      }
    }
    
    return ErrorBoundary;
  }
  
  // Private helper methods
  _generateEventId() {
    return crypto.randomBytes(16).toString('hex');
  }
  
  _parseStackTrace(stack) {
    if (!stack) return [];
    
    const lines = stack.split('\n');
    const frames = [];
    
    for (const line of lines) {
      const match = line.match(/at (?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?/);
      if (match) {
        frames.push({
          function: match[1] || '<anonymous>',
          filename: match[2],
          lineno: parseInt(match[3]),
          colno: parseInt(match[4])
        });
      }
    }
    
    return frames;
  }
  
  _filterHeaders(headers, include, exclude) {
    const filtered = {};
    
    for (const [key, value] of Object.entries(headers)) {
      if (exclude.includes(key)) continue;
      if (include.length > 0 && !include.includes(key)) continue;
      
      // Redact sensitive headers
      if (key.toLowerCase().includes('auth') || 
          key.toLowerCase().includes('token') ||
          key.toLowerCase().includes('key')) {
        filtered[key] = '[REDACTED]';
      } else {
        filtered[key] = value;
      }
    }
    
    return filtered;
  }
  
  _checkAlertRules(event) {
    for (const [id, rule] of this.alertRules) {
      if (this._evaluateAlertConditions(event, rule.conditions)) {
        this._executeAlertActions(event, rule.actions);
      }
    }
  }
  
  _evaluateAlertConditions(event, conditions) {
    // Simple condition evaluation
    // In production, this would be more sophisticated
    if (conditions.level && event.level !== conditions.level) {
      return false;
    }
    
    if (conditions.errorType && event.error && event.error.type !== conditions.errorType) {
      return false;
    }
    
    if (conditions.tag) {
      for (const [key, value] of Object.entries(conditions.tag)) {
        if (event.tags[key] !== value) return false;
      }
    }
    
    return true;
  }
  
  _executeAlertActions(event, actions) {
    // Execute alert actions
    // In production, this would send notifications, create tickets, etc.
    for (const action of actions) {
      console.log(`Alert triggered: ${action.type}`, { event, action });
    }
  }
  
  _sendToSentry(event) {
    // In production, this would send to actual Sentry endpoint
    // For now, just log it
    console.log('Would send to Sentry:', event);
  }
  
  _sendTransactionToSentry(transaction) {
    // In production, this would send transaction data to Sentry
    console.log('Would send transaction to Sentry:', transaction);
  }
}

module.exports = ErrorTracker;