const GracefulShutdown = require('../../../docker/production/graceful-shutdown');
const EventEmitter = require('events');

describe('GracefulShutdown', () => {
  let shutdown;
  let mockServer;
  let mockLogger;
  let processExitSpy;
  let processOnSpy;
  let setTimeoutSpy;
  let clearTimeoutSpy;

  beforeEach(() => {
    // Create mocks
    mockServer = {
      close: jest.fn((cb) => cb())
    };

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    // Spy on process methods
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation();
    processOnSpy = jest.spyOn(process, 'on');
    
    // Spy on timers
    jest.useFakeTimers();
    setTimeoutSpy = jest.spyOn(global, 'setTimeout');
    clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

    // Create instance
    shutdown = new GracefulShutdown({
      server: mockServer,
      logger: mockLogger
    });
  });

  afterEach(() => {
    // Restore all mocks
    processExitSpy.mockRestore();
    processOnSpy.mockRestore();
    jest.useRealTimers();
    jest.clearAllMocks();
    
    // Remove all event listeners to prevent memory leaks
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('uncaughtException');
    process.removeAllListeners('unhandledRejection');
  });

  describe('constructor', () => {
    it('should set default values', () => {
      const shutdown = new GracefulShutdown();
      expect(shutdown.shutdownTimeout).toBe(30000);
      expect(shutdown.server).toBeUndefined();
      expect(shutdown.cleanup).toEqual([]);
      expect(shutdown.logger).toBe(console);
      expect(shutdown.isShuttingDown).toBe(false);
      expect(shutdown.connections).toBeInstanceOf(Set);
    });

    it('should accept custom options', () => {
      const cleanupFn = jest.fn();
      const options = {
        shutdownTimeout: 60000,
        server: mockServer,
        cleanup: [cleanupFn],
        logger: mockLogger
      };
      
      const shutdown = new GracefulShutdown(options);
      expect(shutdown.shutdownTimeout).toBe(60000);
      expect(shutdown.server).toBe(mockServer);
      expect(shutdown.cleanup).toContain(cleanupFn);
      expect(shutdown.logger).toBe(mockLogger);
    });

    it('should setup signal handlers', () => {
      new GracefulShutdown();
      
      expect(process.on).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
      expect(process.on).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      expect(process.on).toHaveBeenCalledWith('uncaughtException', expect.any(Function));
      expect(process.on).toHaveBeenCalledWith('unhandledRejection', expect.any(Function));
    });
  });

  describe('shutdown()', () => {
    it('should handle graceful shutdown on SIGTERM', async () => {
      await shutdown.shutdown('SIGTERM');
      
      expect(mockLogger.info).toHaveBeenCalledWith('Received SIGTERM, starting graceful shutdown...');
      expect(mockServer.close).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Graceful shutdown complete');
      expect(processExitSpy).toHaveBeenCalledWith(0);
    });

    it('should handle graceful shutdown on SIGINT', async () => {
      await shutdown.shutdown('SIGINT');
      
      expect(mockLogger.info).toHaveBeenCalledWith('Received SIGINT, starting graceful shutdown...');
      expect(processExitSpy).toHaveBeenCalledWith(0);
    });

    it('should exit with code 1 for uncaughtException', async () => {
      await shutdown.shutdown('uncaughtException', 1);
      
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should prevent multiple shutdowns', async () => {
      shutdown.isShuttingDown = true;
      
      await shutdown.shutdown('SIGTERM');
      
      expect(mockLogger.warn).toHaveBeenCalledWith('Shutdown already in progress');
      expect(mockServer.close).not.toHaveBeenCalled();
    });

    it('should set timeout for forced shutdown', async () => {
      const shutdownPromise = shutdown.shutdown('SIGTERM');
      
      expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 30000);
      
      await shutdownPromise;
      expect(clearTimeout).toHaveBeenCalled();
    });

    it('should force shutdown on timeout', async () => {
      // Make server.close hang
      mockServer.close = jest.fn(() => {
        // Don't call callback, simulating a hang
      });

      const shutdownPromise = shutdown.shutdown('SIGTERM');
      
      // Fast-forward timers to trigger timeout
      jest.advanceTimersByTime(30000);
      
      expect(mockLogger.error).toHaveBeenCalledWith('Forced shutdown due to timeout');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle errors during shutdown', async () => {
      const error = new Error('Shutdown error');
      mockServer.close = jest.fn((cb) => cb(error));
      
      await shutdown.shutdown('SIGTERM');
      
      expect(mockLogger.error).toHaveBeenCalledWith('Error during shutdown:', error);
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('closeServer()', () => {
    it('should close server successfully', async () => {
      await shutdown.closeServer();
      
      expect(mockLogger.info).toHaveBeenCalledWith('Closing server to new connections...');
      expect(mockServer.close).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Server closed to new connections');
    });

    it('should resolve immediately if no server', async () => {
      shutdown.server = null;
      
      await shutdown.closeServer();
      
      expect(mockServer.close).not.toHaveBeenCalled();
    });

    it('should handle server close errors', async () => {
      const error = new Error('Close error');
      mockServer.close = jest.fn((cb) => cb(error));
      
      await expect(shutdown.closeServer()).rejects.toThrow('Close error');
      expect(mockLogger.error).toHaveBeenCalledWith('Error closing server:', error);
    });
  });

  describe('closeConnections()', () => {
    let mockConnection1, mockConnection2;

    beforeEach(() => {
      mockConnection1 = {
        end: jest.fn((cb) => cb()),
        destroy: jest.fn()
      };
      mockConnection2 = {
        end: jest.fn((cb) => cb()),
        destroy: jest.fn()
      };
    });

    it('should close all active connections', async () => {
      shutdown.connections.add(mockConnection1);
      shutdown.connections.add(mockConnection2);
      
      await shutdown.closeConnections();
      
      expect(mockLogger.info).toHaveBeenCalledWith('Closing 2 active connections...');
      expect(mockConnection1.end).toHaveBeenCalled();
      expect(mockConnection2.end).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('All connections closed');
    });

    it('should resolve immediately if no connections', async () => {
      await shutdown.closeConnections();
      
      expect(mockLogger.info).toHaveBeenCalledWith('No active connections to close');
    });

    it('should force close connections on timeout', async () => {
      // Make connection.end hang
      mockConnection1.end = jest.fn();
      shutdown.connections.add(mockConnection1);
      
      const closePromise = shutdown.closeConnections();
      
      // Fast-forward to timeout
      jest.advanceTimersByTime(10000);
      
      expect(mockLogger.warn).toHaveBeenCalledWith('Connection close timeout reached, forcing closure');
      expect(mockConnection1.destroy).toHaveBeenCalled();
      
      await closePromise;
    });

    it('should handle connections without destroy method', async () => {
      const mockConnection = { end: jest.fn() };
      shutdown.connections.add(mockConnection);
      
      const closePromise = shutdown.closeConnections();
      jest.advanceTimersByTime(10000);
      
      await expect(closePromise).resolves.not.toThrow();
    });
  });

  describe('runCleanup()', () => {
    it('should run all cleanup functions', async () => {
      const cleanup1 = jest.fn().mockResolvedValue();
      const cleanup2 = jest.fn().mockResolvedValue();
      shutdown.cleanup = [cleanup1, cleanup2];
      
      await shutdown.runCleanup();
      
      expect(mockLogger.info).toHaveBeenCalledWith('Running cleanup tasks...');
      expect(cleanup1).toHaveBeenCalled();
      expect(cleanup2).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Cleanup tasks completed');
    });

    it('should handle cleanup function errors', async () => {
      const error = new Error('Cleanup error');
      const cleanup1 = jest.fn().mockRejectedValue(error);
      const cleanup2 = jest.fn().mockResolvedValue();
      shutdown.cleanup = [cleanup1, cleanup2];
      
      await shutdown.runCleanup();
      
      expect(mockLogger.error).toHaveBeenCalledWith('Cleanup function error:', error);
      expect(cleanup2).toHaveBeenCalled(); // Should continue with other cleanup
    });

    it('should handle synchronous cleanup functions', async () => {
      const cleanup = jest.fn();
      shutdown.cleanup = [cleanup];
      
      await shutdown.runCleanup();
      
      expect(cleanup).toHaveBeenCalled();
    });
  });

  describe('trackConnection()', () => {
    it('should add connection to set', () => {
      const mockConnection = new EventEmitter();
      
      shutdown.trackConnection(mockConnection);
      
      expect(shutdown.connections.has(mockConnection)).toBe(true);
    });

    it('should remove connection on close', () => {
      const mockConnection = new EventEmitter();
      
      shutdown.trackConnection(mockConnection);
      expect(shutdown.connections.has(mockConnection)).toBe(true);
      
      mockConnection.emit('close');
      expect(shutdown.connections.has(mockConnection)).toBe(false);
    });
  });

  describe('middleware()', () => {
    let req, res, next;

    beforeEach(() => {
      req = {};
      res = Object.assign(new EventEmitter(), {
        status: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
      });
      next = jest.fn();
    });

    it('should track connection and call next when not shutting down', () => {
      const middleware = shutdown.middleware();
      
      middleware(req, res, next);
      
      expect(shutdown.connections.has(res)).toBe(true);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should reject requests when shutting down', () => {
      shutdown.isShuttingDown = true;
      const middleware = shutdown.middleware();
      
      middleware(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.set).toHaveBeenCalledWith('Connection', 'close');
      expect(res.json).toHaveBeenCalledWith({
        error: 'Service is shutting down'
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('Signal Handlers', () => {
    let shutdownSpy;

    beforeEach(() => {
      shutdownSpy = jest.spyOn(shutdown, 'shutdown');
    });

    it('should handle SIGTERM signal', () => {
      const sigTermHandler = processOnSpy.mock.calls.find(
        call => call[0] === 'SIGTERM'
      )[1];
      
      sigTermHandler();
      
      expect(shutdownSpy).toHaveBeenCalledWith('SIGTERM');
    });

    it('should handle SIGINT signal', () => {
      const sigIntHandler = processOnSpy.mock.calls.find(
        call => call[0] === 'SIGINT'
      )[1];
      
      sigIntHandler();
      
      expect(shutdownSpy).toHaveBeenCalledWith('SIGINT');
    });

    it('should handle uncaughtException', () => {
      const error = new Error('Uncaught error');
      const handler = processOnSpy.mock.calls.find(
        call => call[0] === 'uncaughtException'
      )[1];
      
      handler(error);
      
      expect(mockLogger.error).toHaveBeenCalledWith('Uncaught exception:', error);
      expect(shutdownSpy).toHaveBeenCalledWith('uncaughtException', 1);
    });

    it('should handle unhandledRejection', () => {
      const reason = 'Rejection reason';
      // Create a handled promise to prevent actual unhandled rejection
      const promise = Promise.reject(reason);
      promise.catch(() => {}); // Handle the rejection to prevent warnings
      
      const handler = processOnSpy.mock.calls.find(
        call => call[0] === 'unhandledRejection'
      )[1];
      
      handler(reason, promise);
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Unhandled rejection at:',
        promise,
        'reason:',
        reason
      );
      expect(shutdownSpy).toHaveBeenCalledWith('unhandledRejection', 1);
    });
  });

  describe('Integration with Express', () => {
    it('should integrate with Express server', async () => {
      // Mock Express app and server
      const mockApp = {
        use: jest.fn(),
        listen: jest.fn().mockReturnValue(mockServer)
      };

      // Create shutdown with Express integration
      const expressShutdown = new GracefulShutdown({
        server: mockServer,
        cleanup: [
          async () => {
            mockLogger.info('Closing database connections...');
          },
          async () => {
            mockLogger.info('Flushing logs...');
          }
        ],
        logger: mockLogger
      });

      // Use middleware
      mockApp.use(expressShutdown.middleware());

      // Test shutdown
      await expressShutdown.shutdown('SIGTERM');

      expect(mockLogger.info).toHaveBeenCalledWith('Closing database connections...');
      expect(mockLogger.info).toHaveBeenCalledWith('Flushing logs...');
      expect(processExitSpy).toHaveBeenCalledWith(0);
    });
  });

  describe('Error Scenarios', () => {
    it('should handle multiple errors during shutdown', async () => {
      // Setup multiple failing components
      mockServer.close = jest.fn((cb) => cb(new Error('Server close error')));
      
      const cleanup1 = jest.fn().mockRejectedValue(new Error('Cleanup 1 error'));
      const cleanup2 = jest.fn().mockRejectedValue(new Error('Cleanup 2 error'));
      shutdown.cleanup = [cleanup1, cleanup2];

      await shutdown.shutdown('SIGTERM');

      // Check the actual error calls
      const errorCalls = mockLogger.error.mock.calls;
      
      // Depending on implementation, we get 2-4 errors
      expect(mockLogger.error.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle connection tracking errors', () => {
      const badConnection = null;
      
      expect(() => {
        shutdown.trackConnection(badConnection);
      }).toThrow();
    });
  });
});