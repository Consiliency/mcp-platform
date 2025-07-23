// Contract: Error Tracker
// Purpose: Define the error tracking and reporting interface
// Team responsible: Observability Team

class ErrorTrackerInterface {
  constructor(config) {
    // config: { dsn?: string, environment: string, release?: string, sampleRate?: number }
    throw new Error('Not implemented - Observability team will implement');
  }

  // Error capture
  captureException(error, context) {
    // error: Error, context?: { user?: object, tags?: object, extra?: object }
    // returns: { eventId: string }
    throw new Error('Not implemented - Observability team will implement');
  }

  captureMessage(message, level, context) {
    // message: string, level: 'debug'|'info'|'warning'|'error'|'fatal', context?: object
    // returns: { eventId: string }
    throw new Error('Not implemented - Observability team will implement');
  }

  // Context management
  setUser(user) {
    // user: { id?: string, email?: string, username?: string, [key: string]: any }
    throw new Error('Not implemented - Observability team will implement');
  }

  setTag(key, value) {
    // key: string, value: string|number|boolean
    throw new Error('Not implemented - Observability team will implement');
  }

  setContext(key, context) {
    // key: string, context: object
    throw new Error('Not implemented - Observability team will implement');
  }

  // Breadcrumbs
  addBreadcrumb(breadcrumb) {
    // breadcrumb: { message: string, category?: string, level?: string, data?: object }
    throw new Error('Not implemented - Observability team will implement');
  }

  // Middleware
  createErrorHandler(options) {
    // options?: { showStack?: boolean, shouldHandleError?: (error) => boolean }
    // returns: Express/Koa error middleware function
    throw new Error('Not implemented - Observability team will implement');
  }

  createRequestHandler(options) {
    // options?: { include?: string[], exclude?: string[] }
    // returns: Express/Koa middleware function
    throw new Error('Not implemented - Observability team will implement');
  }

  // Performance monitoring
  startTransaction(name, op) {
    // name: string, op: string (e.g., 'http.server', 'db.query')
    // returns: { finish: () => void, setTag: (key, value) => void }
    throw new Error('Not implemented - Observability team will implement');
  }

  // Alert configuration
  async configureAlert(rule) {
    // rule: { name: string, conditions: object, actions: object[] }
    // returns: { alertId: string, enabled: boolean }
    throw new Error('Not implemented - Observability team will implement');
  }

  // Error boundaries (React)
  createErrorBoundary(fallback) {
    // fallback: React.Component
    // returns: React.Component
    throw new Error('Not implemented - Observability team will implement');
  }
}

module.exports = ErrorTrackerInterface;