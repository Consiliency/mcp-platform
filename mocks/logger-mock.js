// Mock implementation for LoggerInterface to support testing
class LoggerMock {
  constructor(config) {
    this.level = config.level || 'info';
    this.format = config.format || 'json';
    this.transports = config.transports || ['console'];
    this.metadata = config.metadata || {};
    this.logs = [];
  }

  info(message, meta = {}) {
    this.log('info', message, meta);
  }

  warn(message, meta = {}) {
    this.log('warn', message, meta);
  }

  error(message, error, meta = {}) {
    const errorMeta = error instanceof Error ? {
      message: error.message,
      stack: error.stack,
      ...meta
    } : { error, ...meta };
    
    this.log('error', message, errorMeta);
  }

  debug(message, meta = {}) {
    this.log('debug', message, meta);
  }

  log(level, message, meta = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...this.metadata,
      ...meta
    };
    
    this.logs.push(entry);
    
    if (this.transports.includes('console')) {
      console.log(JSON.stringify(entry));
    }
  }

  child(metadata) {
    return new LoggerMock({
      level: this.level,
      format: this.format,
      transports: this.transports,
      metadata: { ...this.metadata, ...metadata }
    });
  }

  setLevel(level) {
    this.level = level;
    return { success: true };
  }

  addTransport(transport) {
    this.transports.push(transport);
    return { added: true };
  }

  removeTransport(transport) {
    const index = this.transports.indexOf(transport);
    if (index > -1) {
      this.transports.splice(index, 1);
      return { removed: true };
    }
    return { removed: false };
  }

  async query(options = {}) {
    const { filter = {}, limit = 100, startTime, endTime } = options;
    
    let filteredLogs = this.logs;
    
    // Apply filters
    if (filter.level) {
      filteredLogs = filteredLogs.filter(log => log.level === filter.level);
    }
    
    if (filter.requestId) {
      filteredLogs = filteredLogs.filter(log => log.requestId === filter.requestId);
    }
    
    if (startTime) {
      filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) >= startTime);
    }
    
    if (endTime) {
      filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) <= endTime);
    }
    
    return {
      logs: filteredLogs.slice(0, limit),
      total: filteredLogs.length
    };
  }

  async flush() {
    // Simulate flushing logs
    return { flushed: this.logs.length };
  }
}

module.exports = LoggerMock;