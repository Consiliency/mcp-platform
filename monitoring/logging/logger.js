const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs').promises;

const LoggerInterface = require('../../interfaces/phase6/logger.interface');

class Logger extends LoggerInterface {
  constructor(config = {}) {
    super(config);
    
    this.config = {
      level: config.level || 'info',
      format: config.format || 'json',
      transports: config.transports || [],
      metadata: config.metadata || {},
      ...config
    };
    
    this.winston = this._createWinstonLogger();
    this.timers = new Map();
    this.logDirectory = config.logDirectory || './logs';
  }
  
  _createWinstonLogger() {
    const formats = [];
    
    // Add timestamp
    formats.push(winston.format.timestamp());
    
    // Add metadata
    if (Object.keys(this.config.metadata).length > 0) {
      formats.push(winston.format.metadata({
        fillExcept: ['message', 'level', 'timestamp', 'label']
      }));
    }
    
    // Add format based on config
    if (this.config.format === 'json') {
      formats.push(winston.format.json());
    } else {
      formats.push(winston.format.simple());
    }
    
    // Create transports
    const transports = this._createTransports();
    
    return winston.createLogger({
      level: this.config.level,
      format: winston.format.combine(...formats),
      defaultMeta: this.config.metadata,
      transports
    });
  }
  
  _createTransports() {
    const transports = [];
    
    // Always add console transport
    transports.push(new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }));
    
    // Add file transports if specified
    if (this.config.transports.length === 0 || this.config.transports.includes('file')) {
      // Daily rotate file for all logs
      transports.push(new DailyRotateFile({
        filename: path.join(this.logDirectory, 'application-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true,
        maxSize: '20m',
        maxFiles: '14d',
        level: this.config.level
      }));
      
      // Separate error log file
      transports.push(new DailyRotateFile({
        filename: path.join(this.logDirectory, 'error-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true,
        maxSize: '20m',
        maxFiles: '30d',
        level: 'error'
      }));
    }
    
    // Add custom transports from config
    this.config.transports.forEach(transport => {
      if (typeof transport === 'object' && transport.type) {
        switch (transport.type) {
          case 'file':
            transports.push(new winston.transports.File(transport.options));
            break;
          case 'http':
            transports.push(new winston.transports.Http(transport.options));
            break;
          case 'stream':
            transports.push(new winston.transports.Stream(transport.options));
            break;
        }
      }
    });
    
    return transports;
  }
  
  debug(message, meta = {}) {
    this.winston.debug(message, meta);
  }
  
  info(message, meta = {}) {
    this.winston.info(message, meta);
  }
  
  warn(message, meta = {}) {
    this.winston.warn(message, meta);
  }
  
  error(message, error, meta = {}) {
    const errorMeta = { ...meta };
    
    if (error instanceof Error) {
      errorMeta.error = {
        message: error.message,
        stack: error.stack,
        name: error.name,
        ...error
      };
    }
    
    this.winston.error(message, errorMeta);
  }
  
  child(metadata) {
    const childConfig = {
      ...this.config,
      metadata: { ...this.config.metadata, ...metadata }
    };
    
    return new Logger(childConfig);
  }
  
  startTimer(label) {
    const startTime = Date.now();
    const timerId = `${label}-${startTime}-${Math.random()}`;
    
    this.timers.set(timerId, { label, startTime });
    
    return {
      end: (meta = {}) => {
        const timer = this.timers.get(timerId);
        if (timer) {
          const duration = Date.now() - timer.startTime;
          this.timers.delete(timerId);
          
          this.info(`Timer ${timer.label} completed`, {
            ...meta,
            duration,
            durationMs: duration,
            timer: timer.label
          });
        }
      }
    };
  }
  
  createRequestLogger(options = {}) {
    const {
      skipPaths = [],
      includeBody = false,
      includeHeaders = false
    } = options;
    
    return (req, res, next) => {
      // Skip logging for certain paths
      if (skipPaths.includes(req.path)) {
        return next();
      }
      
      const startTime = Date.now();
      const requestId = req.headers['x-request-id'] || `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Create child logger with request context
      req.logger = this.child({ requestId });
      
      // Log request
      const requestLog = {
        method: req.method,
        path: req.path,
        query: req.query,
        ip: req.ip || req.connection.remoteAddress
      };
      
      if (includeHeaders) {
        requestLog.headers = req.headers;
      }
      
      if (includeBody && req.body) {
        requestLog.body = req.body;
      }
      
      req.logger.info('Request received', requestLog);
      
      // Capture response
      const originalEnd = res.end;
      res.end = function(...args) {
        const duration = Date.now() - startTime;
        
        req.logger.info('Request completed', {
          method: req.method,
          path: req.path,
          status: res.statusCode,
          duration,
          durationMs: duration
        });
        
        originalEnd.apply(res, args);
      };
      
      next();
    };
  }
  
  async query(options = {}) {
    const {
      level,
      from = new Date(Date.now() - 24 * 60 * 60 * 1000), // Default to last 24 hours
      to = new Date(),
      limit = 100,
      filter = {}
    } = options;
    
    // For this implementation, we'll read from log files
    // In production, this would query a log aggregation service
    const logs = [];
    
    try {
      const files = await fs.readdir(this.logDirectory);
      const logFiles = files.filter(f => f.startsWith('application-') && f.endsWith('.log'));
      
      for (const file of logFiles) {
        const filePath = path.join(this.logDirectory, file);
        const content = await fs.readFile(filePath, 'utf8');
        const lines = content.trim().split('\n');
        
        for (const line of lines) {
          try {
            const log = JSON.parse(line);
            const logDate = new Date(log.timestamp);
            
            // Check date range
            if (logDate < from || logDate > to) continue;
            
            // Check level
            if (level && log.level !== level) continue;
            
            // Check filters
            let matchesFilter = true;
            for (const [key, value] of Object.entries(filter)) {
              if (log.metadata && log.metadata[key] !== value) {
                matchesFilter = false;
                break;
              }
            }
            
            if (matchesFilter) {
              logs.push({
                timestamp: log.timestamp,
                level: log.level,
                message: log.message,
                metadata: log.metadata || {}
              });
            }
            
            if (logs.length >= limit) break;
          } catch (e) {
            // Skip invalid log lines
          }
        }
        
        if (logs.length >= limit) break;
      }
    } catch (error) {
      this.error('Failed to query logs', error);
    }
    
    return {
      logs: logs.slice(0, limit),
      total: logs.length
    };
  }
  
  async rotate() {
    try {
      // Winston daily-rotate-file handles rotation automatically
      // This method triggers manual rotation if needed
      
      // Close current transports
      this.winston.close();
      
      // Recreate logger with fresh transports
      this.winston = this._createWinstonLogger();
      
      // Get the current log file name
      const date = new Date().toISOString().split('T')[0];
      const archivedFile = path.join(this.logDirectory, `application-${date}.log`);
      
      return {
        success: true,
        archivedFile
      };
    } catch (error) {
      this.error('Failed to rotate logs', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = Logger;