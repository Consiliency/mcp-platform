const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

/**
 * Winston configuration for production-ready logging
 * Provides structured logging with different transports based on environment
 */
class WinstonConfig {
  constructor(options = {}) {
    this.options = {
      serviceName: options.serviceName || 'mcp-service',
      environment: options.environment || process.env.NODE_ENV || 'development',
      logLevel: options.logLevel || process.env.LOG_LEVEL || 'info',
      logDirectory: options.logDirectory || process.env.LOG_DIRECTORY || './logs',
      correlationIdHeader: options.correlationIdHeader || 'x-correlation-id',
      enableConsole: options.enableConsole !== false,
      enableFile: options.enableFile !== false,
      enableElasticsearch: options.enableElasticsearch || false,
      enableCloudWatch: options.enableCloudWatch || false,
      ...options
    };

    this.transports = [];
    this.formats = [];
    
    this._setupFormats();
    this._setupTransports();
  }

  /**
   * Set up Winston formats for structured logging
   */
  _setupFormats() {
    // Always include timestamp
    this.formats.push(winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss.SSS'
    }));

    // Add errors format to capture stack traces
    this.formats.push(winston.format.errors({ stack: true }));

    // Add metadata for correlation IDs and service info
    this.formats.push(winston.format.metadata({
      fillExcept: ['message', 'level', 'timestamp', 'service', 'environment']
    }));

    // Add service and environment labels
    this.formats.push(winston.format.label({
      label: this.options.serviceName
    }));

    // Normalize log level
    this.formats.push(winston.format.align());

    // Format based on environment
    if (this.options.environment === 'production') {
      // JSON format for production (easier to parse)
      this.formats.push(winston.format.json());
    } else {
      // Colorized and pretty-printed for development
      this.formats.push(winston.format.colorize({ all: true }));
      this.formats.push(winston.format.printf(({ 
        timestamp, level, message, service, metadata, ...rest 
      }) => {
        let msg = `${timestamp} [${service || this.options.serviceName}] ${level}: ${message}`;
        
        // Add metadata if present
        if (metadata && Object.keys(metadata).length > 0) {
          msg += ` ${JSON.stringify(metadata)}`;
        }
        
        // Add any additional fields
        const additionalFields = Object.keys(rest).filter(key => 
          !['label', 'splat', 'error'].includes(key)
        );
        
        if (additionalFields.length > 0) {
          const additional = {};
          additionalFields.forEach(key => {
            additional[key] = rest[key];
          });
          msg += ` ${JSON.stringify(additional)}`;
        }
        
        return msg;
      }));
    }
  }

  /**
   * Set up Winston transports based on configuration
   */
  _setupTransports() {
    // Console transport
    if (this.options.enableConsole) {
      this.transports.push(new winston.transports.Console({
        handleExceptions: true,
        handleRejections: true
      }));
    }

    // File transports with rotation
    if (this.options.enableFile) {
      // General application logs
      this.transports.push(new DailyRotateFile({
        filename: path.join(this.options.logDirectory, '%DATE%-app.log'),
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true,
        maxSize: '20m',
        maxFiles: '14d',
        level: this.options.logLevel,
        handleExceptions: true,
        handleRejections: true
      }));

      // Error logs (separate file)
      this.transports.push(new DailyRotateFile({
        filename: path.join(this.options.logDirectory, '%DATE%-error.log'),
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true,
        maxSize: '20m',
        maxFiles: '30d',
        level: 'error',
        handleExceptions: true,
        handleRejections: true
      }));

      // Audit logs (for security-relevant events)
      this.transports.push(new DailyRotateFile({
        filename: path.join(this.options.logDirectory, '%DATE%-audit.log'),
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true,
        maxSize: '50m',
        maxFiles: '90d',
        level: 'info',
        auditLog: true,
        filter: (log) => log.audit === true
      }));
    }

    // Elasticsearch transport for centralized logging
    if (this.options.enableElasticsearch && this.options.elasticsearch) {
      try {
        const ElasticsearchTransport = require('winston-elasticsearch');
        this.transports.push(new ElasticsearchTransport({
          level: this.options.logLevel,
          clientOpts: this.options.elasticsearch.clientOpts || {
            node: this.options.elasticsearch.node || 'http://localhost:9200'
          },
          index: this.options.elasticsearch.index || 'logs',
          dataStream: true,
          transformer: (logData) => {
            return {
              '@timestamp': logData.timestamp,
              severity: logData.level,
              service: this.options.serviceName,
              environment: this.options.environment,
              message: logData.message,
              metadata: logData.metadata,
              ...logData
            };
          }
        }));
      } catch (error) {
        console.error('Failed to setup Elasticsearch transport:', error.message);
      }
    }

    // CloudWatch transport for AWS environments
    if (this.options.enableCloudWatch && this.options.cloudWatch) {
      try {
        const CloudWatchTransport = require('winston-cloudwatch');
        this.transports.push(new CloudWatchTransport({
          logGroupName: this.options.cloudWatch.logGroupName || `/aws/application/${this.options.serviceName}`,
          logStreamName: this.options.cloudWatch.logStreamName || 
            `${this.options.environment}-${new Date().toISOString().split('T')[0]}`,
          awsRegion: this.options.cloudWatch.region || process.env.AWS_REGION,
          jsonMessage: true,
          retentionInDays: this.options.cloudWatch.retentionInDays || 30,
          uploadRate: 2000, // 2 seconds
          errorHandler: (err) => {
            console.error('CloudWatch transport error:', err);
          }
        }));
      } catch (error) {
        console.error('Failed to setup CloudWatch transport:', error.message);
      }
    }
  }

  /**
   * Create Winston logger instance with configuration
   */
  createLogger() {
    const logger = winston.createLogger({
      level: this.options.logLevel,
      format: winston.format.combine(...this.formats),
      defaultMeta: {
        service: this.options.serviceName,
        environment: this.options.environment,
        hostname: require('os').hostname(),
        pid: process.pid
      },
      transports: this.transports,
      exitOnError: false
    });

    // Add request ID tracking
    logger.requestLogger = (req, res, next) => {
      const correlationId = req.headers[this.options.correlationIdHeader] || 
        `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      req.correlationId = correlationId;
      
      // Create child logger with correlation ID
      req.logger = logger.child({ correlationId });
      
      // Log request
      req.logger.info('Incoming request', {
        method: req.method,
        url: req.url,
        headers: this._sanitizeHeaders(req.headers),
        ip: req.ip || req.connection.remoteAddress
      });
      
      // Track response
      const originalEnd = res.end;
      const startTime = Date.now();
      
      res.end = function(...args) {
        const duration = Date.now() - startTime;
        
        req.logger.info('Request completed', {
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          duration: `${duration}ms`,
          contentLength: res.get('content-length')
        });
        
        originalEnd.apply(res, args);
      };
      
      next();
    };

    // Add performance logging
    logger.measurePerformance = (operation) => {
      const startTime = process.hrtime.bigint();
      const startMemory = process.memoryUsage();
      
      return {
        end: (metadata = {}) => {
          const endTime = process.hrtime.bigint();
          const endMemory = process.memoryUsage();
          const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds
          
          logger.info(`Performance: ${operation}`, {
            ...metadata,
            performance: {
              duration: `${duration}ms`,
              memory: {
                heapUsed: `${((endMemory.heapUsed - startMemory.heapUsed) / 1024 / 1024).toFixed(2)}MB`,
                external: `${((endMemory.external - startMemory.external) / 1024 / 1024).toFixed(2)}MB`
              }
            }
          });
        }
      };
    };

    // Add audit logging
    logger.audit = (action, metadata = {}) => {
      logger.info(`Audit: ${action}`, {
        ...metadata,
        audit: true,
        timestamp: new Date().toISOString(),
        action
      });
    };

    return logger;
  }

  /**
   * Get current configuration
   */
  getConfig() {
    return { ...this.options };
  }

  /**
   * Update log level dynamically
   */
  setLogLevel(level) {
    this.options.logLevel = level;
    this.transports.forEach(transport => {
      if (transport.level) {
        transport.level = level;
      }
    });
  }

  /**
   * Sanitize headers to remove sensitive information
   */
  _sanitizeHeaders(headers) {
    const sanitized = { ...headers };
    const sensitiveHeaders = [
      'authorization',
      'cookie',
      'x-api-key',
      'x-auth-token',
      'x-access-token'
    ];
    
    sensitiveHeaders.forEach(header => {
      if (sanitized[header]) {
        sanitized[header] = '[REDACTED]';
      }
    });
    
    return sanitized;
  }
}

module.exports = WinstonConfig;