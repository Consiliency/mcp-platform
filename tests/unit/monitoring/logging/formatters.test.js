const LogFormatters = require('../../../../monitoring/logging/formatters');
const winston = require('winston');

describe('LogFormatters', () => {
  describe('ecsFormat', () => {
    it('should format logs according to ECS schema', () => {
      const formatter = LogFormatters.ecsFormat();
      const logInfo = {
        level: 'info',
        message: 'Test message',
        timestamp: '2025-01-15T10:00:00.000Z',
        service: 'test-service',
        environment: 'test',
        correlationId: 'corr-123',
        transactionId: 'trans-456',
        spanId: 'span-789',
        hostname: 'test-host',
        pid: 12345
      };

      const formatted = formatter.transform(logInfo);
      const parsed = JSON.parse(formatted[Symbol.for('message')]);

      expect(parsed['@timestamp']).toBe('2025-01-15T10:00:00.000Z');
      expect(parsed['log.level']).toBe('info');
      expect(parsed.message).toBe('Test message');
      expect(parsed['service.name']).toBe('test-service');
      expect(parsed['service.environment']).toBe('test');
      expect(parsed['trace.id']).toBe('corr-123');
      expect(parsed['transaction.id']).toBe('trans-456');
      expect(parsed['span.id']).toBe('span-789');
    });

    it('should handle error fields', () => {
      const formatter = LogFormatters.ecsFormat();
      const error = new Error('Test error');
      error.code = 'TEST_ERROR';

      const logInfo = {
        level: 'error',
        message: 'Error occurred',
        timestamp: '2025-01-15T10:00:00.000Z',
        error
      };

      const formatted = formatter.transform(logInfo);
      const parsed = JSON.parse(formatted[Symbol.for('message')]);

      expect(parsed.error.message).toBe('Test error');
      expect(parsed.error.type).toBe('Error');
      expect(parsed.error.code).toBe('TEST_ERROR');
      expect(parsed.error.stack_trace).toContain('Test error');
    });

    it('should handle HTTP fields', () => {
      const formatter = LogFormatters.ecsFormat();
      const logInfo = {
        level: 'info',
        message: 'HTTP request',
        timestamp: '2025-01-15T10:00:00.000Z',
        http: {
          method: 'POST',
          requestBody: '{"test": true}',
          statusCode: 200,
          responseBody: '{"success": true}'
        }
      };

      const formatted = formatter.transform(logInfo);
      const parsed = JSON.parse(formatted[Symbol.for('message')]);

      expect(parsed.http.request.method).toBe('POST');
      expect(parsed.http.request.body).toBe('{"test": true}');
      expect(parsed.http.response.status_code).toBe(200);
      expect(parsed.http.response.body).toBe('{"success": true}');
    });
  });

  describe('jsonFormat', () => {
    it('should format logs as JSON', () => {
      const formatter = LogFormatters.jsonFormat();
      const logInfo = {
        level: 'info',
        message: 'Test message',
        timestamp: '2025-01-15T10:00:00.000Z',
        metadata: { userId: 123 }
      };

      const formatted = formatter.transform(logInfo);
      const parsed = JSON.parse(formatted[Symbol.for('message')]);

      expect(parsed.level).toBe('info');
      expect(parsed.message).toBe('Test message');
      expect(parsed.timestamp).toBe('2025-01-15T10:00:00.000Z');
      expect(parsed.metadata.userId).toBe(123);
    });

    it('should handle errors in JSON format', () => {
      const formatter = LogFormatters.jsonFormat();
      const error = new Error('Test error');
      
      const logInfo = {
        level: 'error',
        message: 'Error occurred',
        error
      };

      const formatted = formatter.transform(logInfo);
      const parsed = JSON.parse(formatted[Symbol.for('message')]);

      expect(parsed.error.message).toBe('Test error');
      expect(parsed.error.name).toBe('Error');
      expect(parsed.error.stack).toContain('Test error');
    });
  });

  describe('prettyFormat', () => {
    it('should format logs in human-readable format', () => {
      const formatter = LogFormatters.prettyFormat();
      const logInfo = {
        level: 'info',
        message: 'Test message',
        timestamp: '2025-01-15T10:00:00.000Z'
      };

      const formatted = formatter.transform(logInfo);
      const message = formatted[Symbol.for('message')];

      expect(message).toContain('[2025-01-15T10:00:00.000Z]');
      expect(message).toContain('[INFO]');
      expect(message).toContain('Test message');
    });

    it('should colorize output when enabled', () => {
      const formatter = LogFormatters.prettyFormat({ colorize: true });
      const logInfo = {
        level: 'error',
        message: 'Error message',
        timestamp: '2025-01-15T10:00:00.000Z'
      };

      const formatted = formatter.transform(logInfo);
      const message = formatted[Symbol.for('message')];

      // Check for ANSI color codes
      expect(message).toMatch(/\u001b\[\d+m/);
      expect(message).toContain('ERROR');
      expect(message).toContain('Error message');
    });

    it('should include metadata when present', () => {
      const formatter = LogFormatters.prettyFormat();
      const logInfo = {
        level: 'info',
        message: 'Test message',
        timestamp: '2025-01-15T10:00:00.000Z',
        userId: 123,
        action: 'login'
      };

      const formatted = formatter.transform(logInfo);
      const message = formatted[Symbol.for('message')];

      expect(message).toContain('userId=123');
      expect(message).toContain('action=login');
    });
  });

  describe('compactFormat', () => {
    it('should format logs in compact single-line format', () => {
      const formatter = LogFormatters.compactFormat();
      const logInfo = {
        level: 'info',
        message: 'Test message',
        timestamp: '2025-01-15T10:00:00.000Z',
        service: 'test-service'
      };

      const formatted = formatter.transform(logInfo);
      const message = formatted[Symbol.for('message')];

      expect(message).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\s+\w+\s+.+$/);
      expect(message).toContain('info');
      expect(message).toContain('Test message');
      expect(message).not.toContain('\n');
    });

    it('should truncate long messages', () => {
      const formatter = LogFormatters.compactFormat({ maxLength: 50 });
      const longMessage = 'A'.repeat(100);
      
      const logInfo = {
        level: 'info',
        message: longMessage,
        timestamp: '2025-01-15T10:00:00.000Z'
      };

      const formatted = formatter.transform(logInfo);
      const message = formatted[Symbol.for('message')];

      expect(message.length).toBeLessThanOrEqual(60); // 50 + timestamp/level
      expect(message).toContain('...');
    });
  });

  describe('logstashFormat', () => {
    it('should format logs for Logstash ingestion', () => {
      const formatter = LogFormatters.logstashFormat();
      const logInfo = {
        level: 'info',
        message: 'Test message',
        timestamp: '2025-01-15T10:00:00.000Z',
        host: 'test-host',
        service: 'test-service'
      };

      const formatted = formatter.transform(logInfo);
      const parsed = JSON.parse(formatted[Symbol.for('message')]);

      expect(parsed['@timestamp']).toBe('2025-01-15T10:00:00.000Z');
      expect(parsed['@version']).toBe('1');
      expect(parsed.message).toBe('Test message');
      expect(parsed.severity).toBe('info');
      expect(parsed.host).toBe('test-host');
      expect(parsed.service).toBe('test-service');
    });

    it('should add fields from metadata', () => {
      const formatter = LogFormatters.logstashFormat();
      const logInfo = {
        level: 'info',
        message: 'Test message',
        timestamp: '2025-01-15T10:00:00.000Z',
        userId: 123,
        requestId: 'req-456',
        tags: ['api', 'v2']
      };

      const formatted = formatter.transform(logInfo);
      const parsed = JSON.parse(formatted[Symbol.for('message')]);

      expect(parsed.fields.userId).toBe(123);
      expect(parsed.fields.requestId).toBe('req-456');
      expect(parsed.tags).toEqual(['api', 'v2']);
    });
  });

  describe('customFormat', () => {
    it('should allow custom formatting function', () => {
      const customFormatter = (info) => {
        return `CUSTOM: ${info.level.toUpperCase()} - ${info.message}`;
      };

      const formatter = LogFormatters.customFormat(customFormatter);
      const logInfo = {
        level: 'info',
        message: 'Test message'
      };

      const formatted = formatter.transform(logInfo);
      const message = formatted[Symbol.for('message')];

      expect(message).toBe('CUSTOM: INFO - Test message');
    });

    it('should support template strings', () => {
      const template = '{{timestamp}} [{{level}}] {{service}}: {{message}}';
      const formatter = LogFormatters.customFormat(template);
      
      const logInfo = {
        level: 'info',
        message: 'Test message',
        timestamp: '2025-01-15T10:00:00.000Z',
        service: 'test-service'
      };

      const formatted = formatter.transform(logInfo);
      const message = formatted[Symbol.for('message')];

      expect(message).toBe('2025-01-15T10:00:00.000Z [info] test-service: Test message');
    });
  });

  describe('multiFormat', () => {
    it('should combine multiple formatters', () => {
      const formatter = LogFormatters.multiFormat([
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ]);

      const logInfo = {
        level: 'error',
        message: 'Error occurred',
        error: new Error('Test error')
      };

      const formatted = formatter.transform(logInfo);
      expect(formatted.timestamp).toBeDefined();
      expect(formatted.stack).toContain('Test error');
    });
  });

  describe('filterFormat', () => {
    it('should filter logs based on criteria', () => {
      const formatter = LogFormatters.filterFormat({
        levels: ['error', 'warn'],
        excludeMessages: [/debug/i]
      });

      const infoLog = {
        level: 'info',
        message: 'Info message'
      };

      const errorLog = {
        level: 'error',
        message: 'Error message'
      };

      const debugLog = {
        level: 'error',
        message: 'Debug error message'
      };

      expect(formatter.transform(infoLog)).toBe(false);
      expect(formatter.transform(errorLog)).toBeTruthy();
      expect(formatter.transform(debugLog)).toBe(false);
    });

    it('should filter based on metadata fields', () => {
      const formatter = LogFormatters.filterFormat({
        metadata: {
          environment: 'production',
          userId: (value) => value > 100
        }
      });

      const log1 = {
        level: 'info',
        message: 'Test',
        environment: 'production',
        userId: 150
      };

      const log2 = {
        level: 'info',
        message: 'Test',
        environment: 'development',
        userId: 150
      };

      const log3 = {
        level: 'info',
        message: 'Test',
        environment: 'production',
        userId: 50
      };

      expect(formatter.transform(log1)).toBeTruthy();
      expect(formatter.transform(log2)).toBe(false);
      expect(formatter.transform(log3)).toBe(false);
    });
  });

  describe('maskFormat', () => {
    it('should mask sensitive fields', () => {
      const formatter = LogFormatters.maskFormat({
        fields: ['password', 'token', 'ssn'],
        patterns: [/\b\d{3}-\d{2}-\d{4}\b/g] // SSN pattern
      });

      const logInfo = {
        level: 'info',
        message: 'User login with SSN 123-45-6789',
        password: 'secret123',
        token: 'abc-def-ghi',
        userId: 123
      };

      const formatted = formatter.transform(logInfo);
      
      expect(formatted.message).toBe('User login with SSN ***-**-****');
      expect(formatted.password).toBe('********');
      expect(formatted.token).toBe('***-***-***');
      expect(formatted.userId).toBe(123); // Not masked
    });

    it('should handle nested fields', () => {
      const formatter = LogFormatters.maskFormat({
        fields: ['user.password', 'auth.token']
      });

      const logInfo = {
        level: 'info',
        message: 'Test',
        user: {
          name: 'John',
          password: 'secret123'
        },
        auth: {
          token: 'bearer-abc123'
        }
      };

      const formatted = formatter.transform(logInfo);
      
      expect(formatted.user.name).toBe('John');
      expect(formatted.user.password).toBe('*********');
      expect(formatted.auth.token).toBe('*************');
    });
  });
});