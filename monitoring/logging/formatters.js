const winston = require('winston');
const { format } = winston;

/**
 * Custom formatters for structured logging
 * Provides various formatting options for different use cases
 */
class LogFormatters {
  /**
   * ECS (Elastic Common Schema) formatter
   * Formats logs according to Elastic Common Schema for better Elasticsearch integration
   */
  static ecsFormat() {
    return format.combine(
      format.timestamp(),
      format.errors({ stack: true }),
      format.printf((info) => {
        const ecsLog = {
          '@timestamp': info.timestamp,
          'log.level': info.level,
          message: info.message,
          'service.name': info.service || 'unknown',
          'service.environment': info.environment || 'unknown',
          'trace.id': info.correlationId || info.traceId,
          'transaction.id': info.transactionId,
          'span.id': info.spanId,
          'host.hostname': info.hostname,
          'process.pid': info.pid
        };

        // Add error fields if present
        if (info.error) {
          ecsLog.error = {
            message: info.error.message,
            stack_trace: info.error.stack,
            type: info.error.name || 'Error',
            code: info.error.code
          };
        }

        // Add HTTP fields if present
        if (info.http) {
          ecsLog.http = {
            request: {
              method: info.http.method,
              body: info.http.requestBody
            },
            response: {
              status_code: info.http.statusCode,
              body: info.http.responseBody
            }
          };
          ecsLog.url = {
            path: info.http.path,
            query: info.http.query,
            full: info.http.url
          };
        }

        // Add user fields if present
        if (info.user) {
          ecsLog.user = {
            id: info.user.id,
            name: info.user.name,
            email: info.user.email,
            roles: info.user.roles
          };
        }

        // Add custom fields
        if (info.metadata) {
          ecsLog.labels = info.metadata;
        }

        return JSON.stringify(ecsLog);
      })
    );
  }

  /**
   * Logstash formatter
   * Formats logs for Logstash ingestion
   */
  static logstashFormat() {
    return format.combine(
      format.timestamp(),
      format.errors({ stack: true }),
      format.printf((info) => {
        const logstashLog = {
          '@timestamp': info.timestamp,
          '@version': '1',
          level: info.level,
          message: info.message,
          logger_name: info.service || 'application',
          thread_name: `pid-${info.pid}`,
          level_value: this._getLevelValue(info.level)
        };

        // Add MDC (Mapped Diagnostic Context) fields
        if (info.correlationId) {
          logstashLog.mdc = {
            correlationId: info.correlationId,
            ...info.metadata
          };
        }

        // Add exception fields
        if (info.error) {
          logstashLog.stack_trace = info.error.stack;
          logstashLog.exception_class = info.error.name;
          logstashLog.exception_message = info.error.message;
        }

        // Merge additional fields
        Object.keys(info).forEach(key => {
          if (!['timestamp', 'level', 'message', 'error', 'service', 'pid'].includes(key)) {
            logstashLog[key] = info[key];
          }
        });

        return JSON.stringify(logstashLog);
      })
    );
  }

  /**
   * GCP (Google Cloud Platform) formatter
   * Formats logs for Google Cloud Logging
   */
  static gcpFormat() {
    return format.combine(
      format.timestamp(),
      format.errors({ stack: true }),
      format.printf((info) => {
        const gcpLog = {
          severity: info.level.toUpperCase(),
          message: info.message,
          timestamp: info.timestamp,
          'logging.googleapis.com/trace': info.traceId,
          'logging.googleapis.com/spanId': info.spanId,
          'logging.googleapis.com/operation': info.operation ? {
            id: info.operation.id,
            producer: info.service,
            first: info.operation.first || false,
            last: info.operation.last || false
          } : undefined
        };

        // Add error reporting fields
        if (info.error) {
          gcpLog['@type'] = 'type.googleapis.com/google.devtools.clouderrorreporting.v1beta1.ReportedErrorEvent';
          gcpLog.context = {
            reportLocation: {
              filePath: info.error.fileName,
              lineNumber: info.error.lineNumber,
              functionName: info.error.functionName
            }
          };
          gcpLog.message = info.error.stack || info.error.message;
        }

        // Add HTTP request context
        if (info.httpRequest) {
          gcpLog.httpRequest = {
            requestMethod: info.httpRequest.method,
            requestUrl: info.httpRequest.url,
            status: info.httpRequest.status,
            responseSize: info.httpRequest.responseSize,
            userAgent: info.httpRequest.userAgent,
            remoteIp: info.httpRequest.remoteIp,
            latency: info.httpRequest.latency
          };
        }

        // Add labels
        if (info.labels) {
          gcpLog.labels = info.labels;
        }

        return JSON.stringify(gcpLog);
      })
    );
  }

  /**
   * Splunk formatter
   * Formats logs for Splunk ingestion
   */
  static splunkFormat() {
    return format.combine(
      format.timestamp(),
      format.errors({ stack: true }),
      format.printf((info) => {
        const splunkEvent = {
          time: new Date(info.timestamp).getTime() / 1000, // Unix timestamp
          host: info.hostname,
          source: info.service || 'application',
          sourcetype: '_json',
          event: {
            level: info.level,
            message: info.message,
            logger: info.logger || info.service,
            thread: info.pid,
            correlationId: info.correlationId
          }
        };

        // Add fields
        if (info.metadata || info.fields) {
          splunkEvent.fields = {
            ...info.metadata,
            ...info.fields
          };
        }

        // Add error details
        if (info.error) {
          splunkEvent.event.exception = {
            type: info.error.name,
            message: info.error.message,
            stacktrace: info.error.stack
          };
        }

        return JSON.stringify(splunkEvent);
      })
    );
  }

  /**
   * OpenTelemetry formatter
   * Formats logs according to OpenTelemetry standards
   */
  static openTelemetryFormat() {
    return format.combine(
      format.timestamp(),
      format.errors({ stack: true }),
      format.printf((info) => {
        const otelLog = {
          timestamp: info.timestamp,
          severityNumber: this._getSeverityNumber(info.level),
          severityText: info.level.toUpperCase(),
          body: info.message,
          resource: {
            'service.name': info.service,
            'service.namespace': info.namespace,
            'service.instance.id': info.instanceId || info.hostname,
            'service.version': info.version
          },
          attributes: {}
        };

        // Add trace context
        if (info.traceId) {
          otelLog.traceId = info.traceId;
          otelLog.spanId = info.spanId;
          otelLog.traceFlags = info.traceFlags || '01';
        }

        // Add attributes
        Object.keys(info).forEach(key => {
          if (!['timestamp', 'level', 'message', 'service', 'traceId', 'spanId'].includes(key)) {
            otelLog.attributes[key] = info[key];
          }
        });

        return JSON.stringify(otelLog);
      })
    );
  }

  /**
   * Simple formatter for development
   * Human-readable format with colors
   */
  static simpleFormat() {
    return format.combine(
      format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      format.errors({ stack: true }),
      format.colorize(),
      format.printf(({ timestamp, level, message, service, correlationId, ...metadata }) => {
        let log = `${timestamp} [${service || 'app'}] ${level}: ${message}`;
        
        if (correlationId) {
          log += ` [${correlationId}]`;
        }
        
        // Add metadata if present
        const metadataKeys = Object.keys(metadata).filter(key => 
          !['hostname', 'pid', 'environment'].includes(key)
        );
        
        if (metadataKeys.length > 0) {
          const metadataStr = metadataKeys.map(key => 
            `${key}=${JSON.stringify(metadata[key])}`
          ).join(' ');
          log += ` ${metadataStr}`;
        }
        
        return log;
      })
    );
  }

  /**
   * SQL formatter for database query logging
   */
  static sqlFormat() {
    return format.combine(
      format.timestamp(),
      format.printf((info) => {
        const sqlLog = {
          timestamp: info.timestamp,
          level: info.level,
          query: info.query,
          params: info.params,
          duration: info.duration,
          rows: info.rows,
          error: info.error
        };

        if (info.connection) {
          sqlLog.connection = {
            database: info.connection.database,
            host: info.connection.host,
            user: info.connection.user
          };
        }

        return JSON.stringify(sqlLog);
      })
    );
  }

  /**
   * Security audit formatter
   * Special format for security-related events
   */
  static securityAuditFormat() {
    return format.combine(
      format.timestamp(),
      format.printf((info) => {
        const auditLog = {
          timestamp: info.timestamp,
          eventType: 'SECURITY_AUDIT',
          action: info.action,
          outcome: info.outcome || 'UNKNOWN',
          actor: {
            userId: info.userId,
            username: info.username,
            ip: info.ip,
            userAgent: info.userAgent
          },
          target: {
            type: info.targetType,
            id: info.targetId,
            name: info.targetName
          },
          details: info.details || {},
          severity: this._getSecuritySeverity(info.action)
        };

        return JSON.stringify(auditLog);
      })
    );
  }

  /**
   * Performance metrics formatter
   */
  static performanceFormat() {
    return format.combine(
      format.timestamp(),
      format.printf((info) => {
        const perfLog = {
          timestamp: info.timestamp,
          type: 'PERFORMANCE',
          operation: info.operation,
          duration: info.duration,
          memory: info.memory,
          cpu: info.cpu,
          tags: info.tags || {}
        };

        if (info.breakdown) {
          perfLog.breakdown = info.breakdown;
        }

        return JSON.stringify(perfLog);
      })
    );
  }

  /**
   * Helper method to get numeric log level
   */
  static _getLevelValue(level) {
    const levels = {
      error: 40000,
      warn: 30000,
      info: 20000,
      debug: 10000,
      trace: 5000
    };
    return levels[level] || 0;
  }

  /**
   * Helper method to get OpenTelemetry severity number
   */
  static _getSeverityNumber(level) {
    const severities = {
      trace: 1,
      debug: 5,
      info: 9,
      warn: 13,
      error: 17,
      fatal: 21
    };
    return severities[level] || 0;
  }

  /**
   * Helper method to determine security severity
   */
  static _getSecuritySeverity(action) {
    const highSeverityActions = ['LOGIN_FAILED', 'UNAUTHORIZED_ACCESS', 'DATA_BREACH'];
    const mediumSeverityActions = ['PASSWORD_CHANGED', 'PERMISSIONS_MODIFIED'];
    
    if (highSeverityActions.includes(action)) return 'HIGH';
    if (mediumSeverityActions.includes(action)) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Create a custom formatter with field mapping
   */
  static createCustomFormat(fieldMapping) {
    return format.combine(
      format.timestamp(),
      format.errors({ stack: true }),
      format.printf((info) => {
        const customLog = {};
        
        Object.entries(fieldMapping).forEach(([targetField, sourceField]) => {
          if (typeof sourceField === 'function') {
            customLog[targetField] = sourceField(info);
          } else if (typeof sourceField === 'string') {
            customLog[targetField] = info[sourceField];
          } else {
            customLog[targetField] = sourceField;
          }
        });
        
        return JSON.stringify(customLog);
      })
    );
  }
}

module.exports = LogFormatters;