const LivenessProbe = require('../../../../docker/health/liveness');
const http = require('http');
const https = require('https');
const EventEmitter = require('events');
const { setupHttpMock, setupHttpErrorMock, setupHttpTimeoutMock } = require('./test-helpers');

// Mock modules
jest.mock('http');
jest.mock('https');

describe('LivenessProbe', () => {
  let probe;
  let mockRequest;
  let mockResponse;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    
    // Create mock request and response
    mockRequest = new EventEmitter();
    mockRequest.end = jest.fn();
    mockRequest.destroy = jest.fn();
    
    mockResponse = new EventEmitter();
    mockResponse.statusCode = 200;
    
    // Setup default mocks
    http.request.mockReturnValue(mockRequest);
    https.request.mockReturnValue(mockRequest);
    
    // Create probe instance
    probe = new LivenessProbe();
  });

  describe('constructor', () => {
    it('should set default values', () => {
      const probe = new LivenessProbe();
      expect(probe.host).toBe('localhost');
      expect(probe.port).toBe(3000);
      expect(probe.path).toBe('/health/live');
      expect(probe.timeout).toBe(3000);
      expect(probe.secure).toBe(false);
    });

    it('should accept custom options', () => {
      const options = {
        host: 'example.com',
        port: 8080,
        path: '/custom/health',
        timeout: 5000,
        secure: true
      };
      const probe = new LivenessProbe(options);
      expect(probe.host).toBe(options.host);
      expect(probe.port).toBe(options.port);
      expect(probe.path).toBe(options.path);
      expect(probe.timeout).toBe(options.timeout);
      expect(probe.secure).toBe(options.secure);
    });

    it('should use environment variables', () => {
      process.env.HEALTH_CHECK_HOST = 'env-host';
      process.env.HEALTH_CHECK_PORT = '9000';
      process.env.HEALTH_CHECK_PATH = '/env/health';
      process.env.HEALTH_CHECK_SECURE = 'true';
      
      const probe = new LivenessProbe();
      expect(probe.host).toBe('env-host');
      expect(probe.port).toBe('9000');
      expect(probe.path).toBe('/env/health');
      expect(probe.secure).toBe(true);
      
      // Cleanup
      delete process.env.HEALTH_CHECK_HOST;
      delete process.env.HEALTH_CHECK_PORT;
      delete process.env.HEALTH_CHECK_PATH;
      delete process.env.HEALTH_CHECK_SECURE;
    });
  });

  describe('check()', () => {
    it('should resolve when receiving valid JSON response with alive=true', async () => {
      const responseData = JSON.stringify({ alive: true });
      setupHttpMock(http, mockRequest, mockResponse, responseData);
      
      const result = await probe.check();
      expect(result).toEqual({ alive: true, status: 200 });
      expect(http.request).toHaveBeenCalledWith(
        expect.objectContaining({
          hostname: 'localhost',
          port: 3000,
          path: '/health/live',
          method: 'GET',
          timeout: 3000,
          headers: { 'User-Agent': 'Liveness-Probe/1.0' }
        }),
        expect.any(Function)
      );
    });

    it('should reject when receiving JSON response with alive=false', async () => {
      const responseData = JSON.stringify({ alive: false });
      setupHttpMock(http, mockRequest, mockResponse, responseData);
      
      await expect(probe.check()).rejects.toThrow('Service reports not alive');
    });

    it('should resolve for 2xx status even without valid JSON', async () => {
      mockResponse.statusCode = 204;
      setupHttpMock(http, mockRequest, mockResponse, 'not json');
      
      const result = await probe.check();
      expect(result).toEqual({ alive: true, status: 204 });
    });

    it('should reject for non-2xx status codes', async () => {
      mockResponse.statusCode = 503;
      setupHttpMock(http, mockRequest, mockResponse, '');
      
      await expect(probe.check()).rejects.toThrow('Unhealthy status code: 503');
    });

    it('should handle connection errors', async () => {
      setupHttpErrorMock(http, mockRequest, new Error('ECONNREFUSED'));
      
      await expect(probe.check()).rejects.toThrow('Connection error: ECONNREFUSED');
    });

    it('should handle request timeout', async () => {
      setupHttpTimeoutMock(http, mockRequest);
      
      await expect(probe.check()).rejects.toThrow('Request timeout');
      expect(mockRequest.destroy).toHaveBeenCalled();
    });

    it('should use https when secure is true', async () => {
      probe.secure = true;
      setupHttpMock(https, mockRequest, mockResponse, JSON.stringify({ alive: true }));
      
      await probe.check();
      expect(https.request).toHaveBeenCalled();
      expect(http.request).not.toHaveBeenCalled();
    });
  });

  describe('checkProcess()', () => {
    let originalMemoryUsage;
    let originalHrtime;
    let originalSetImmediate;

    beforeEach(() => {
      originalMemoryUsage = process.memoryUsage;
      originalHrtime = process.hrtime;
      originalSetImmediate = global.setImmediate;
      
      // Mock process.memoryUsage
      process.memoryUsage = jest.fn().mockReturnValue({
        heapUsed: 50 * 1024 * 1024, // 50MB
        heapTotal: 100 * 1024 * 1024, // 100MB
        rss: 150 * 1024 * 1024 // 150MB
      });
      
      // Mock process.hrtime.bigint
      process.hrtime.bigint = jest.fn()
        .mockReturnValueOnce(BigInt(1000000)) // Start time
        .mockReturnValueOnce(BigInt(2000000)); // End time (1ms later)
      
      // Mock setImmediate
      global.setImmediate = jest.fn((cb) => cb());
    });

    afterEach(() => {
      process.memoryUsage = originalMemoryUsage;
      process.hrtime = originalHrtime;
      global.setImmediate = originalSetImmediate;
    });

    it('should return alive status with memory info', async () => {
      const result = await probe.checkProcess();
      
      expect(result).toEqual({
        alive: true,
        memory: {
          heapUsedMB: 50,
          heapTotalMB: 100,
          rss: 150
        },
        uptime: expect.any(Number)
      });
    });

    it('should detect critical memory usage', async () => {
      process.memoryUsage.mockReturnValue({
        heapUsed: 96 * 1024 * 1024, // 96MB (96% of total)
        heapTotal: 100 * 1024 * 1024, // 100MB
        rss: 150 * 1024 * 1024
      });
      
      const result = await probe.checkProcess();
      
      expect(result).toEqual({
        alive: false,
        error: 'Memory usage critical'
      });
    });

    it('should detect event loop lag', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      process.hrtime.bigint = jest.fn()
        .mockReturnValueOnce(BigInt(1000000))
        .mockReturnValueOnce(BigInt(200000000)); // 199ms later
      
      await probe.checkProcess();
      
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Event loop lag detected'));
      
      consoleWarnSpy.mockRestore();
    });
  });

  describe.skip('CLI execution', () => {
    let originalRequireMain;
    let processExitSpy;
    let consoleLogSpy;
    let consoleErrorSpy;

    beforeEach(() => {
      originalRequireMain = require.main;
      processExitSpy = jest.spyOn(process, 'exit').mockImplementation();
      consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    });

    afterEach(() => {
      require.main = originalRequireMain;
      processExitSpy.mockRestore();
      consoleLogSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it('should exit 0 when HTTP check passes', async () => {
      // Mock successful HTTP check
      const mockCheck = jest.spyOn(LivenessProbe.prototype, 'check')
        .mockResolvedValue({ alive: true, status: 200 });
      
      // Set require.main to simulate CLI execution
      require.main = { filename: 'liveness.js' };
      
      // Re-require the module to trigger CLI execution
      jest.isolateModules(() => {
        require('../../../../docker/health/liveness');
      });
      
      // Wait for async operations
      await new Promise(resolve => setImmediate(resolve));
      
      expect(mockCheck).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(
        'Liveness check passed:',
        expect.objectContaining({ alive: true })
      );
      expect(processExitSpy).toHaveBeenCalledWith(0);
      
      mockCheck.mockRestore();
    });

    it('should fallback to process check when HTTP fails', async () => {
      const mockCheck = jest.spyOn(LivenessProbe.prototype, 'check')
        .mockRejectedValue(new Error('Connection refused'));
      
      const mockCheckProcess = jest.spyOn(LivenessProbe.prototype, 'checkProcess')
        .mockResolvedValue({ alive: true, memory: {} });
      
      require.main = { filename: 'liveness.js' };
      
      jest.isolateModules(() => {
        require('../../../../docker/health/liveness');
      });
      
      await new Promise(resolve => setImmediate(resolve));
      
      expect(mockCheck).toHaveBeenCalled();
      expect(mockCheckProcess).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(
        'HTTP check failed, trying process check:',
        'Connection refused'
      );
      expect(processExitSpy).toHaveBeenCalledWith(0);
      
      mockCheck.mockRestore();
      mockCheckProcess.mockRestore();
    });

    it('should exit 1 when both checks fail', async () => {
      const mockCheck = jest.spyOn(LivenessProbe.prototype, 'check')
        .mockRejectedValue(new Error('Connection refused'));
      
      const mockCheckProcess = jest.spyOn(LivenessProbe.prototype, 'checkProcess')
        .mockResolvedValue({ alive: false, error: 'Critical' });
      
      require.main = { filename: 'liveness.js' };
      
      jest.isolateModules(() => {
        require('../../../../docker/health/liveness');
      });
      
      await new Promise(resolve => setImmediate(resolve));
      
      expect(processExitSpy).toHaveBeenCalledWith(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Process check failed:',
        expect.objectContaining({ alive: false })
      );
      
      mockCheck.mockRestore();
      mockCheckProcess.mockRestore();
    });
  });
});