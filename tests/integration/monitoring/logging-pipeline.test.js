const WinstonConfig = require('../../../monitoring/logging/winston-config');
const LogFormatters = require('../../../monitoring/logging/formatters');
const LogRotation = require('../../../monitoring/logging/rotation');
const Logger = require('../../../monitoring/logging/logger');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

describe('Logging Pipeline Integration', () => {
  let tempDir;
  let logger;
  let winstonConfig;
  let logRotation;

  beforeEach(async () => {
    // Create temporary directory for log files
    tempDir = path.join(os.tmpdir(), `log-integration-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    // Initialize components
    winstonConfig = new WinstonConfig({
      serviceName: 'test-service',
      environment: 'test',
      logLevel: 'debug',
      logDirectory: tempDir
    });

    logRotation = new LogRotation({
      logDirectory: tempDir,
      maxSize: '1m',
      maxFiles: '3d'
    });

    await logRotation.initialize();

    logger = new Logger({
      winstonConfig,
      namespace: 'integration-test'
    });
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      const files = await fs.readdir(tempDir);
      for (const file of files) {
        await fs.unlink(path.join(tempDir, file));
      }
      await fs.rmdir(tempDir);
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('End-to-End Logging', () => {
    it('should log messages through the complete pipeline', async () => {
      // Configure logger with multiple transports
      const fileTransport = logRotation.createRotatingTransport('app');
      const errorTransport = logRotation.createRotatingTransport('error', {
        level: 'error'
      });

      logger.addTransport(fileTransport);
      logger.addTransport(errorTransport);

      // Log various levels
      logger.debug('Debug message', { debugData: true });
      logger.info('Info message', { userId: 123 });
      logger.warn('Warning message', { threshold: 0.8 });
      logger.error('Error message', new Error('Test error'));

      // Wait for logs to be written
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify log files exist
      const files = await fs.readdir(tempDir);
      const appLogFile = files.find(f => f.startsWith('app-'));
      const errorLogFile = files.find(f => f.startsWith('error-'));

      expect(appLogFile).toBeDefined();
      expect(errorLogFile).toBeDefined();

      // Read and verify log contents
      const appLogs = await fs.readFile(path.join(tempDir, appLogFile), 'utf8');
      const errorLogs = await fs.readFile(path.join(tempDir, errorLogFile), 'utf8');

      expect(appLogs).toContain('Debug message');
      expect(appLogs).toContain('Info message');
      expect(appLogs).toContain('Warning message');
      expect(appLogs).toContain('Error message');
      
      expect(errorLogs).toContain('Error message');
      expect(errorLogs).not.toContain('Info message');
    });

    it('should apply formatters correctly', async () => {
      // Test different formatters
      const formats = {
        json: LogFormatters.jsonFormat(),
        ecs: LogFormatters.ecsFormat(),
        pretty: LogFormatters.prettyFormat()
      };

      for (const [formatName, formatter] of Object.entries(formats)) {
        const transport = logRotation.createRotatingTransport(`${formatName}-logs`, {
          format: formatter
        });

        const testLogger = new Logger({
          winstonConfig,
          namespace: `${formatName}-test`
        });
        
        testLogger.addTransport(transport);

        testLogger.info('Test message', {
          format: formatName,
          timestamp: new Date().toISOString()
        });
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      const files = await fs.readdir(tempDir);
      
      // Verify JSON format
      const jsonFile = files.find(f => f.startsWith('json-logs-'));
      if (jsonFile) {
        const content = await fs.readFile(path.join(tempDir, jsonFile), 'utf8');
        const lines = content.trim().split('\n');
        const parsed = JSON.parse(lines[0]);
        expect(parsed.message).toBe('Test message');
        expect(parsed.format).toBe('json');
      }

      // Verify ECS format
      const ecsFile = files.find(f => f.startsWith('ecs-logs-'));
      if (ecsFile) {
        const content = await fs.readFile(path.join(tempDir, ecsFile), 'utf8');
        const lines = content.trim().split('\n');
        const parsed = JSON.parse(lines[0]);
        expect(parsed['@timestamp']).toBeDefined();
        expect(parsed['log.level']).toBe('info');
      }
    });

    it('should handle high-volume logging', async () => {
      const transport = logRotation.createRotatingTransport('performance', {
        maxSize: '100k'
      });

      logger.addTransport(transport);

      // Log many messages rapidly
      const messageCount = 1000;
      const startTime = Date.now();

      for (let i = 0; i < messageCount; i++) {
        logger.info(`Message ${i}`, {
          index: i,
          timestamp: Date.now()
        });
      }

      const duration = Date.now() - startTime;

      // Wait for all logs to be written
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify performance
      expect(duration).toBeLessThan(1000); // Should complete within 1 second

      // Check for log rotation
      const files = await fs.readdir(tempDir);
      const performanceFiles = files.filter(f => f.startsWith('performance-'));
      
      // Should have rotated due to size limit
      expect(performanceFiles.length).toBeGreaterThan(1);
    });
  });

  describe('Log Rotation Integration', () => {
    it('should rotate logs based on size', async () => {
      const transport = logRotation.createRotatingTransport('size-test', {
        maxSize: '1k' // Very small for testing
      });

      logger.addTransport(transport);

      // Write enough data to trigger rotation
      for (let i = 0; i < 50; i++) {
        logger.info('X'.repeat(50), { index: i });
      }

      await new Promise(resolve => setTimeout(resolve, 200));

      const files = await fs.readdir(tempDir);
      const rotatedFiles = files.filter(f => f.startsWith('size-test-'));
      
      expect(rotatedFiles.length).toBeGreaterThan(1);
    });

    it('should compress rotated files', async () => {
      const transport = logRotation.createRotatingTransport('compress-test', {
        maxSize: '1k',
        zippedArchive: true
      });

      logger.addTransport(transport);

      // Generate logs to trigger rotation
      for (let i = 0; i < 100; i++) {
        logger.info('Compress test message ' + i);
      }

      // Force rotation
      await logRotation.rotateLog('compress-test.log').catch(() => {});

      await new Promise(resolve => setTimeout(resolve, 500));

      const files = await fs.readdir(tempDir);
      const gzFiles = files.filter(f => f.endsWith('.gz'));
      
      expect(gzFiles.length).toBeGreaterThan(0);
    });

    it('should clean up old logs', async () => {
      // Create some old log files
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 5);
      const oldFileName = `old-test-${oldDate.toISOString().split('T')[0]}.log`;
      
      await fs.writeFile(path.join(tempDir, oldFileName), 'Old log content');

      // Configure with short retention
      const cleanupRotation = new LogRotation({
        logDirectory: tempDir,
        maxFiles: '1d'
      });

      await cleanupRotation.cleanupOldLogs();

      const files = await fs.readdir(tempDir);
      expect(files).not.toContain(oldFileName);
    });
  });

  describe('Error Handling', () => {
    it('should handle logging errors gracefully', async () => {
      // Create a transport that will fail
      const failingTransport = {
        log: jest.fn().mockImplementation((info, callback) => {
          callback(new Error('Transport error'));
        })
      };

      logger.addTransport(failingTransport);

      // Should not throw
      expect(() => {
        logger.error('This should not crash');
      }).not.toThrow();
    });

    it('should continue logging after transport failure', async () => {
      const workingTransport = logRotation.createRotatingTransport('working');
      const failingTransport = {
        log: jest.fn().mockImplementation((info, callback) => {
          callback(new Error('Transport error'));
        })
      };

      logger.addTransport(workingTransport);
      logger.addTransport(failingTransport);

      logger.info('Test message after failure');

      await new Promise(resolve => setTimeout(resolve, 100));

      const files = await fs.readdir(tempDir);
      const workingFile = files.find(f => f.startsWith('working-'));
      
      expect(workingFile).toBeDefined();
      
      const content = await fs.readFile(path.join(tempDir, workingFile), 'utf8');
      expect(content).toContain('Test message after failure');
    });
  });

  describe('Context and Correlation', () => {
    it('should maintain correlation IDs across log entries', async () => {
      const transport = logRotation.createRotatingTransport('correlation');
      logger.addTransport(transport);

      const correlationId = 'corr-123-456';
      const childLogger = logger.child({ correlationId });

      childLogger.info('Request started');
      childLogger.info('Processing data');
      childLogger.info('Request completed');

      await new Promise(resolve => setTimeout(resolve, 100));

      const files = await fs.readdir(tempDir);
      const logFile = files.find(f => f.startsWith('correlation-'));
      const content = await fs.readFile(path.join(tempDir, logFile), 'utf8');

      const lines = content.trim().split('\n');
      lines.forEach(line => {
        expect(line).toContain(correlationId);
      });
    });

    it('should preserve context through async operations', async () => {
      const transport = logRotation.createRotatingTransport('async-context');
      logger.addTransport(transport);

      const context = {
        userId: 123,
        sessionId: 'sess-456',
        requestId: 'req-789'
      };

      const contextLogger = logger.child(context);

      await Promise.all([
        (async () => {
          await new Promise(resolve => setTimeout(resolve, 10));
          contextLogger.info('Async operation 1');
        })(),
        (async () => {
          await new Promise(resolve => setTimeout(resolve, 20));
          contextLogger.info('Async operation 2');
        })(),
        (async () => {
          await new Promise(resolve => setTimeout(resolve, 30));
          contextLogger.info('Async operation 3');
        })()
      ]);

      await new Promise(resolve => setTimeout(resolve, 100));

      const files = await fs.readdir(tempDir);
      const logFile = files.find(f => f.startsWith('async-context-'));
      const content = await fs.readFile(path.join(tempDir, logFile), 'utf8');

      expect(content).toContain('userId');
      expect(content).toContain('sessionId');
      expect(content).toContain('requestId');
    });
  });

  describe('Performance Monitoring', () => {
    it('should log performance metrics', async () => {
      const transport = logRotation.createRotatingTransport('performance');
      logger.addTransport(transport);

      const timer = logger.startTimer();
      
      // Simulate some work
      await new Promise(resolve => setTimeout(resolve, 50));
      
      timer.done({
        message: 'Operation completed',
        operation: 'test-operation'
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      const files = await fs.readdir(tempDir);
      const logFile = files.find(f => f.startsWith('performance-'));
      const content = await fs.readFile(path.join(tempDir, logFile), 'utf8');

      expect(content).toContain('duration');
      expect(content).toContain('test-operation');
    });
  });

  describe('Multi-transport Scenarios', () => {
    it('should route logs to appropriate transports based on level', async () => {
      const infoTransport = logRotation.createRotatingTransport('info', {
        level: 'info'
      });
      
      const errorTransport = logRotation.createRotatingTransport('errors', {
        level: 'error'
      });
      
      const debugTransport = logRotation.createRotatingTransport('debug', {
        level: 'debug'
      });

      logger.addTransport(infoTransport);
      logger.addTransport(errorTransport);
      logger.addTransport(debugTransport);

      logger.debug('Debug only');
      logger.info('Info and above');
      logger.error('Error everywhere');

      await new Promise(resolve => setTimeout(resolve, 100));

      const files = await fs.readdir(tempDir);
      
      // Read each file
      const debugFile = files.find(f => f.startsWith('debug-'));
      const infoFile = files.find(f => f.startsWith('info-'));
      const errorFile = files.find(f => f.startsWith('errors-'));

      const debugContent = await fs.readFile(path.join(tempDir, debugFile), 'utf8');
      const infoContent = await fs.readFile(path.join(tempDir, infoFile), 'utf8');
      const errorContent = await fs.readFile(path.join(tempDir, errorFile), 'utf8');

      // Debug file should have all messages
      expect(debugContent).toContain('Debug only');
      expect(debugContent).toContain('Info and above');
      expect(debugContent).toContain('Error everywhere');

      // Info file should have info and error
      expect(infoContent).not.toContain('Debug only');
      expect(infoContent).toContain('Info and above');
      expect(infoContent).toContain('Error everywhere');

      // Error file should only have errors
      expect(errorContent).not.toContain('Debug only');
      expect(errorContent).not.toContain('Info and above');
      expect(errorContent).toContain('Error everywhere');
    });
  });
});