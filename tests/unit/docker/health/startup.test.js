const StartupProbe = require('../../../../docker/health/startup');
const http = require('http');
const https = require('https');
const fs = require('fs').promises;
const net = require('net');
const EventEmitter = require('events');
const { setupHttpMock, setupHttpErrorMock, setupHttpTimeoutMock } = require('./test-helpers');

// Mock modules
jest.mock('http');
jest.mock('https');
jest.mock('net');
jest.mock('fs', () => ({
  promises: {
    access: jest.fn(),
    stat: jest.fn()
  }
}));

describe('StartupProbe', () => {
  let probe;
  let mockRequest;
  let mockResponse;
  let mockServer;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    
    // Clear environment variables
    delete process.env.STARTUP_MARKERS;
    delete process.env.REQUIRED_FILES;
    delete process.env.MIN_UPTIME_SECONDS;
    delete process.env.STARTUP_MARKER_FILE;
    
    // Create mock request and response
    mockRequest = new EventEmitter();
    mockRequest.end = jest.fn();
    mockRequest.destroy = jest.fn();
    
    mockResponse = new EventEmitter();
    mockResponse.statusCode = 200;
    
    // Create mock server
    mockServer = new EventEmitter();
    mockServer.close = jest.fn();
    mockServer.listen = jest.fn();
    
    // Setup default mocks
    http.request.mockReturnValue(mockRequest);
    https.request.mockReturnValue(mockRequest);
    net.createServer = jest.fn().mockReturnValue(mockServer);
    
    // Mock process.uptime
    jest.spyOn(process, 'uptime').mockReturnValue(10);
    
    // Create probe instance
    probe = new StartupProbe();
  });

  afterEach(() => {
    process.uptime.mockRestore();
  });

  describe('constructor', () => {
    it('should set default values', () => {
      const probe = new StartupProbe();
      expect(probe.host).toBe('localhost');
      expect(probe.port).toBe(3000);
      expect(probe.path).toBe('/health/startup');
      expect(probe.timeout).toBe(10000);
      expect(probe.secure).toBe(false);
      expect(probe.minUptime).toBe(5);
      expect(probe.markers).toEqual([
        'database_connected',
        'cache_initialized',
        'services_registered',
        'routes_loaded'
      ]);
      expect(probe.requiredFiles).toEqual([]);
    });

    it('should accept custom options', () => {
      const options = {
        host: 'example.com',
        port: 8080,
        path: '/custom/startup',
        timeout: 15000,
        secure: true,
        markers: ['custom_marker'],
        requiredFiles: ['/app/config.json'],
        minUptime: 10
      };
      const probe = new StartupProbe(options);
      expect(probe.host).toBe(options.host);
      expect(probe.port).toBe(options.port);
      expect(probe.path).toBe(options.path);
      expect(probe.timeout).toBe(options.timeout);
      expect(probe.secure).toBe(options.secure);
      expect(probe.markers).toBe(options.markers);
      expect(probe.requiredFiles).toBe(options.requiredFiles);
      expect(probe.minUptime).toBe(options.minUptime);
    });

    it('should use environment variables', () => {
      process.env.MIN_UPTIME_SECONDS = '15';
      const probe = new StartupProbe();
      expect(probe.minUptime).toBe(15);
    });
  });

  describe('parseMarkers()', () => {
    it('should parse STARTUP_MARKERS environment variable', () => {
      process.env.STARTUP_MARKERS = 'db_ready,cache_ready,api_ready';
      const probe = new StartupProbe();
      
      expect(probe.markers).toEqual(['db_ready', 'cache_ready', 'api_ready']);
    });

    it('should trim marker names', () => {
      process.env.STARTUP_MARKERS = ' db_ready , cache_ready , api_ready ';
      const probe = new StartupProbe();
      
      expect(probe.markers).toEqual(['db_ready', 'cache_ready', 'api_ready']);
    });

    it('should use default markers when env not set', () => {
      const probe = new StartupProbe();
      
      expect(probe.markers).toEqual([
        'database_connected',
        'cache_initialized',
        'services_registered',
        'routes_loaded'
      ]);
    });
  });

  describe('parseRequiredFiles()', () => {
    it('should parse REQUIRED_FILES environment variable', () => {
      process.env.REQUIRED_FILES = '/app/config.json,/app/data/init.sql';
      const probe = new StartupProbe();
      
      expect(probe.requiredFiles).toEqual([
        '/app/config.json',
        '/app/data/init.sql'
      ]);
    });

    it('should trim file paths', () => {
      process.env.REQUIRED_FILES = ' /app/config.json , /app/data/init.sql ';
      const probe = new StartupProbe();
      
      expect(probe.requiredFiles).toEqual([
        '/app/config.json',
        '/app/data/init.sql'
      ]);
    });

    it('should return empty array when env not set', () => {
      const probe = new StartupProbe();
      expect(probe.requiredFiles).toEqual([]);
    });
  });

  describe('check()', () => {
    it('should resolve when receiving valid JSON response with started=true', async () => {
      const responseData = JSON.stringify({
        started: true,
        initialized: ['db', 'cache'],
        pending: []
      });
      setupHttpMock(http, mockRequest, mockResponse, responseData);
      
      const result = await probe.check();
      expect(result).toEqual({
        started: true,
        status: 200,
        initialized: ['db', 'cache'],
        pending: []
      });
    });

    it('should reject when receiving JSON response with started=false', async () => {
      const responseData = JSON.stringify({
        started: false,
        initialized: ['db'],
        pending: ['cache', 'api']
      });
      setupHttpMock(http, mockRequest, mockResponse, responseData);
      
      await expect(probe.check()).rejects.toThrow('Not started yet. Pending: cache, api');
    });

    it('should resolve for status 200 without valid JSON', async () => {
      mockResponse.statusCode = 200;
      setupHttpMock(http, mockRequest, mockResponse, 'OK');
      
      const result = await probe.check();
      expect(result).toEqual({ started: true, status: 200 });
    });

    it('should reject for 503 status code', async () => {
      mockResponse.statusCode = 503;
      setupHttpMock(http, mockRequest, mockResponse, '');
      
      await expect(probe.check()).rejects.toThrow('Service still starting (503)');
    });

    it('should handle connection errors', async () => {
      setupHttpErrorMock(http, mockRequest, new Error('ECONNREFUSED'));
      
      await expect(probe.check()).rejects.toThrow('Connection error: ECONNREFUSED');
    });

    it('should handle request timeout with specific message', async () => {
      setupHttpTimeoutMock(http, mockRequest);
      
      await expect(probe.check()).rejects.toThrow('Request timeout - service may still be starting');
      expect(mockRequest.destroy).toHaveBeenCalled();
    });
  });

  describe('checkUptime()', () => {
    it('should report uptime met when above minimum', async () => {
      process.uptime.mockReturnValue(10);
      probe.minUptime = 5;
      
      const result = await probe.checkUptime();
      
      expect(result).toEqual({
        uptime: 10,
        minUptimeMet: true,
        message: 'Minimum uptime met'
      });
    });

    it('should report uptime not met when below minimum', async () => {
      process.uptime.mockReturnValue(3.5);
      probe.minUptime = 5;
      
      const result = await probe.checkUptime();
      
      expect(result).toEqual({
        uptime: 3.5,
        minUptimeMet: false,
        message: 'Waiting for minimum uptime: 3.5s / 5s'
      });
    });

    it('should handle exact minimum uptime', async () => {
      process.uptime.mockReturnValue(5);
      probe.minUptime = 5;
      
      const result = await probe.checkUptime();
      
      expect(result.minUptimeMet).toBe(true);
    });
  });

  describe('checkRequiredFiles()', () => {
    beforeEach(() => {
      probe.requiredFiles = ['/app/config.json', '/app/data/init.sql'];
    });

    it('should report all files present', async () => {
      fs.access.mockResolvedValue(undefined);
      
      const result = await probe.checkRequiredFiles();
      
      expect(result).toEqual({
        allPresent: true,
        files: [
          { path: '/app/config.json', exists: true },
          { path: '/app/data/init.sql', exists: true }
        ]
      });
      
      expect(fs.access).toHaveBeenCalledTimes(2);
    });

    it('should report missing files', async () => {
      fs.access
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('ENOENT'));
      
      const result = await probe.checkRequiredFiles();
      
      expect(result).toEqual({
        allPresent: false,
        files: [
          { path: '/app/config.json', exists: true },
          { path: '/app/data/init.sql', exists: false, error: 'ENOENT' }
        ]
      });
    });

    it('should handle empty file list', async () => {
      probe.requiredFiles = [];
      
      const result = await probe.checkRequiredFiles();
      
      expect(result).toEqual({
        allPresent: true,
        files: []
      });
      
      expect(fs.access).not.toHaveBeenCalled();
    });
  });

  describe('checkMarkerFile()', () => {
    it('should report marker file exists', async () => {
      const birthtime = new Date('2024-01-01T00:00:00Z');
      const currentTime = new Date('2024-01-01T00:01:00Z').getTime();
      jest.spyOn(Date, 'now').mockReturnValue(currentTime);
      
      fs.stat.mockResolvedValue({
        birthtime: { getTime: () => birthtime.getTime() }
      });
      
      const result = await probe.checkMarkerFile();
      
      expect(result).toMatchObject({
        exists: true,
        path: '/tmp/app-started',
        age: 60000 // 1 minute in ms
      });
      expect(result.created.getTime()).toBe(birthtime.getTime());
      
      Date.now.mockRestore();
    });

    it('should report marker file missing', async () => {
      fs.stat.mockRejectedValue(new Error('ENOENT'));
      
      const result = await probe.checkMarkerFile();
      
      expect(result).toEqual({
        exists: false,
        path: '/tmp/app-started',
        error: 'ENOENT'
      });
    });

    it('should use custom marker file path', async () => {
      process.env.STARTUP_MARKER_FILE = '/custom/marker';
      const probe = new StartupProbe();
      
      fs.stat.mockRejectedValue(new Error('ENOENT'));
      
      const result = await probe.checkMarkerFile();
      
      expect(result.path).toBe('/custom/marker');
      expect(fs.stat).toHaveBeenCalledWith('/custom/marker');
    });
  });

  describe('checkPort()', () => {
    it('should detect port in use (EADDRINUSE)', async () => {
      process.nextTick(() => {
        const error = new Error('listen EADDRINUSE');
        error.code = 'EADDRINUSE';
        mockServer.emit('error', error);
      });
      
      const result = await probe.checkPort();
      
      expect(result).toEqual({
        portInUse: true,
        port: 3000,
        message: 'Application is listening on port'
      });
    });

    it('should detect port is free', async () => {
      process.nextTick(() => {
        mockServer.emit('listening');
      });
      
      const result = await probe.checkPort();
      
      expect(result).toEqual({
        portInUse: false,
        port: 3000,
        message: 'Port is free - application may not be listening'
      });
      expect(mockServer.close).toHaveBeenCalled();
    });

    it('should handle other errors', async () => {
      process.nextTick(() => {
        const error = new Error('Permission denied');
        error.code = 'EACCES';
        mockServer.emit('error', error);
      });
      
      const result = await probe.checkPort();
      
      expect(result).toEqual({
        portInUse: false,
        port: 3000,
        error: 'Permission denied'
      });
    });
  });

  describe('checkMemoryInit()', () => {
    let originalMemoryUsage;

    beforeEach(() => {
      originalMemoryUsage = process.memoryUsage;
      process.memoryUsage = jest.fn().mockReturnValue({
        heapUsed: 100 * 1024 * 1024, // 100MB
        heapTotal: 200 * 1024 * 1024,
        rss: 300 * 1024 * 1024
      });
    });

    afterEach(() => {
      process.memoryUsage = originalMemoryUsage;
    });

    it('should report memory stabilized', async () => {
      const result = await probe.checkMemoryInit();
      
      expect(result).toEqual({
        heapUsedMB: 100,
        rss: 300,
        stabilized: true
      });
    });

    it('should report memory not stabilized', async () => {
      process.memoryUsage.mockReturnValue({
        heapUsed: 250 * 1024 * 1024, // 250MB
        heapTotal: 300 * 1024 * 1024,
        rss: 400 * 1024 * 1024
      });
      
      const result = await probe.checkMemoryInit();
      
      expect(result).toEqual({
        heapUsedMB: 250,
        rss: 400,
        stabilized: false
      });
    });
  });

  describe('fullCheck()', () => {
    beforeEach(() => {
      jest.spyOn(probe, 'check');
      jest.spyOn(probe, 'checkUptime');
      jest.spyOn(probe, 'checkPort');
      jest.spyOn(probe, 'checkRequiredFiles');
      jest.spyOn(probe, 'checkMemoryInit');
      jest.spyOn(probe, 'checkMarkerFile');
    });

    it('should pass when endpoint check succeeds', async () => {
      probe.check.mockResolvedValue({ started: true, initialized: ['all'] });
      probe.checkUptime.mockResolvedValue({ minUptimeMet: true, uptime: 10 });
      probe.checkPort.mockResolvedValue({ portInUse: true, port: 3000 });
      probe.checkRequiredFiles.mockResolvedValue({ allPresent: true, files: [] });
      probe.checkMemoryInit.mockResolvedValue({ stabilized: true, heapUsedMB: 100 });
      probe.checkMarkerFile.mockResolvedValue({ exists: true, path: '/tmp/app-started' });
      
      const result = await probe.fullCheck();
      
      expect(result).toMatchObject({
        endpoint: true,
        uptime: true,
        port: true,
        files: true,
        memory: true,
        marker: true,
        started: true
      });
    });

    it('should pass with port and uptime when endpoint fails', async () => {
      probe.check.mockRejectedValue(new Error('Connection refused'));
      probe.checkUptime.mockResolvedValue({ minUptimeMet: true, uptime: 10 });
      probe.checkPort.mockResolvedValue({ portInUse: true, port: 3000 });
      probe.checkRequiredFiles.mockResolvedValue({ allPresent: true, files: [] });
      probe.checkMemoryInit.mockResolvedValue({ stabilized: true, heapUsedMB: 100 });
      probe.checkMarkerFile.mockResolvedValue({ exists: false });
      
      const result = await probe.fullCheck();
      
      expect(result).toMatchObject({
        endpoint: false,
        endpointError: 'Connection refused',
        uptime: true,
        port: true,
        files: true,
        memory: true,
        marker: false,
        started: true // Port + uptime + files + memory = started
      });
    });

    it('should fail when required conditions not met', async () => {
      probe.check.mockRejectedValue(new Error('Connection refused'));
      probe.checkUptime.mockResolvedValue({ minUptimeMet: false, uptime: 3 });
      probe.checkPort.mockResolvedValue({ portInUse: true, port: 3000 });
      probe.checkRequiredFiles.mockResolvedValue({ allPresent: true, files: [] });
      probe.checkMemoryInit.mockResolvedValue({ stabilized: true, heapUsedMB: 100 });
      probe.checkMarkerFile.mockResolvedValue({ exists: false });
      
      const result = await probe.fullCheck();
      
      expect(result.started).toBe(false); // Uptime not met
    });

    it('should fail when files missing', async () => {
      probe.requiredFiles = ['/app/config.json']; // Set required files
      probe.check.mockResolvedValue({ started: true });
      probe.checkUptime.mockResolvedValue({ minUptimeMet: true, uptime: 10 });
      probe.checkPort.mockResolvedValue({ portInUse: true, port: 3000 });
      probe.checkRequiredFiles.mockResolvedValue({ 
        allPresent: false, 
        files: [{ path: '/app/config.json', exists: false }] 
      });
      probe.checkMemoryInit.mockResolvedValue({ stabilized: true, heapUsedMB: 100 });
      probe.checkMarkerFile.mockResolvedValue({ exists: true });
      
      const result = await probe.fullCheck();
      
      expect(result.started).toBe(false); // Files missing
    });

    it('should fail when memory not stabilized', async () => {
      probe.check.mockResolvedValue({ started: true });
      probe.checkUptime.mockResolvedValue({ minUptimeMet: true, uptime: 10 });
      probe.checkPort.mockResolvedValue({ portInUse: true, port: 3000 });
      probe.checkRequiredFiles.mockResolvedValue({ allPresent: true, files: [] });
      probe.checkMemoryInit.mockResolvedValue({ stabilized: false, heapUsedMB: 250 });
      probe.checkMarkerFile.mockResolvedValue({ exists: true });
      
      const result = await probe.fullCheck();
      
      expect(result.started).toBe(false); // Memory not stabilized
    });

    it('should skip file check when no required files', async () => {
      probe.requiredFiles = [];
      probe.check.mockResolvedValue({ started: true });
      probe.checkUptime.mockResolvedValue({ minUptimeMet: true, uptime: 10 });
      probe.checkPort.mockResolvedValue({ portInUse: true, port: 3000 });
      probe.checkMemoryInit.mockResolvedValue({ stabilized: true, heapUsedMB: 100 });
      probe.checkMarkerFile.mockResolvedValue({ exists: true });
      
      const result = await probe.fullCheck();
      
      expect(result.files).toBe(true);
      expect(probe.checkRequiredFiles).not.toHaveBeenCalled();
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

    it('should exit 0 when startup checks pass', async () => {
      const mockFullCheck = jest.spyOn(StartupProbe.prototype, 'fullCheck')
        .mockResolvedValue({
          started: true,
          endpoint: true,
          uptime: true,
          port: true,
          files: true,
          memory: true
        });
      
      require.main = { filename: 'startup.js' };
      
      jest.isolateModules(() => {
        require('../../../../docker/health/startup');
      });
      
      await new Promise(resolve => setImmediate(resolve));
      
      expect(mockFullCheck).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(
        'Startup check passed:',
        expect.any(String)
      );
      expect(processExitSpy).toHaveBeenCalledWith(0);
      
      mockFullCheck.mockRestore();
    });

    it('should exit 1 when startup checks fail', async () => {
      const mockFullCheck = jest.spyOn(StartupProbe.prototype, 'fullCheck')
        .mockResolvedValue({
          started: false,
          endpoint: false,
          uptime: false,
          port: true,
          files: true,
          memory: true
        });
      
      require.main = { filename: 'startup.js' };
      
      jest.isolateModules(() => {
        require('../../../../docker/health/startup');
      });
      
      await new Promise(resolve => setImmediate(resolve));
      
      expect(processExitSpy).toHaveBeenCalledWith(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Startup check failed:',
        expect.any(String)
      );
      
      mockFullCheck.mockRestore();
    });

    it('should handle check errors', async () => {
      const mockFullCheck = jest.spyOn(StartupProbe.prototype, 'fullCheck')
        .mockRejectedValue(new Error('Check error'));
      
      require.main = { filename: 'startup.js' };
      
      jest.isolateModules(() => {
        require('../../../../docker/health/startup');
      });
      
      await new Promise(resolve => setImmediate(resolve));
      
      expect(processExitSpy).toHaveBeenCalledWith(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Startup check error:',
        'Check error'
      );
      
      mockFullCheck.mockRestore();
    });
  });
});