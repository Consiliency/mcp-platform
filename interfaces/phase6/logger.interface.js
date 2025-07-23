// Contract: Logger
// Purpose: Define the structured logging interface
// Team responsible: Observability Team

class LoggerInterface {
  constructor(config) {
    // config: { level: string, format: string, transports: object[], metadata?: object }
    throw new Error('Not implemented - Observability team will implement');
  }

  // Logging methods
  debug(message, meta) {
    // message: string, meta?: object
    throw new Error('Not implemented - Observability team will implement');
  }

  info(message, meta) {
    // message: string, meta?: object
    throw new Error('Not implemented - Observability team will implement');
  }

  warn(message, meta) {
    // message: string, meta?: object
    throw new Error('Not implemented - Observability team will implement');
  }

  error(message, error, meta) {
    // message: string, error?: Error, meta?: object
    throw new Error('Not implemented - Observability team will implement');
  }

  // Child logger for request context
  child(metadata) {
    // metadata: object (e.g., { requestId: string, userId: string })
    // returns: LoggerInterface instance with inherited metadata
    throw new Error('Not implemented - Observability team will implement');
  }

  // Performance logging
  startTimer(label) {
    // label: string
    // returns: { end: (meta?: object) => void }
    throw new Error('Not implemented - Observability team will implement');
  }

  // Middleware
  createRequestLogger(options) {
    // options: { skipPaths?: string[], includeBody?: boolean, includeHeaders?: boolean }
    // returns: Express/Koa middleware function
    throw new Error('Not implemented - Observability team will implement');
  }

  // Log management
  async query(options) {
    // options: { level?: string, from?: Date, to?: Date, limit?: number, filter?: object }
    // returns: { logs: LogEntry[], total: number }
    throw new Error('Not implemented - Observability team will implement');
  }

  async rotate() {
    // Trigger log rotation
    // returns: { success: boolean, archivedFile?: string }
    throw new Error('Not implemented - Observability team will implement');
  }
}

module.exports = LoggerInterface;