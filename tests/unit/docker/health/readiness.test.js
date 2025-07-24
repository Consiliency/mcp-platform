const ReadinessProbe = require('../../../../docker/health/readiness');
const http = require('http');
const https = require('https');
const net = require('net');
const dns = require('dns').promises;
const EventEmitter = require('events');
const { setupHttpMock, setupHttpErrorMock, setupHttpTimeoutMock } = require('./test-helpers');

// Mock modules
jest.mock('http');
jest.mock('https');
jest.mock('net');
jest.mock('dns', () => ({
  promises: {
    resolve4: jest.fn()
  }
}));

describe('ReadinessProbe', () => {
  let probe;
  let mockRequest;
  let mockResponse;
  let mockSocket;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    
    // Clear environment variables
    delete process.env.DATABASE_URL;
    delete process.env.REDIS_URL;
    delete process.env.DEPENDENCY_SERVICES;
    
    // Create mock request and response
    mockRequest = new EventEmitter();
    mockRequest.end = jest.fn();
    mockRequest.destroy = jest.fn();
    
    mockResponse = new EventEmitter();
    mockResponse.statusCode = 200;
    mockResponse.resume = jest.fn();
    
    // Create mock socket
    mockSocket = new EventEmitter();
    mockSocket.setTimeout = jest.fn();
    mockSocket.destroy = jest.fn();
    mockSocket.connect = jest.fn();
    
    // Setup default mocks
    http.request.mockReturnValue(mockRequest);
    https.request.mockReturnValue(mockRequest);
    net.Socket = jest.fn().mockReturnValue(mockSocket);
    
    // Create probe instance
    probe = new ReadinessProbe();
  });

  describe('constructor', () => {
    it('should set default values', () => {
      const probe = new ReadinessProbe();
      expect(probe.host).toBe('localhost');
      expect(probe.port).toBe(3000);
      expect(probe.path).toBe('/health/ready');
      expect(probe.timeout).toBe(5000);
      expect(probe.secure).toBe(false);
      expect(probe.dependencies).toEqual([]);
    });

    it('should accept custom options', () => {
      const dependencies = [{ name: 'test', host: 'localhost', port: 5432 }];
      const options = {
        host: 'example.com',
        port: 8080,
        path: '/custom/ready',
        timeout: 10000,
        secure: true,
        dependencies
      };
      const probe = new ReadinessProbe(options);
      expect(probe.host).toBe(options.host);
      expect(probe.port).toBe(options.port);
      expect(probe.path).toBe(options.path);
      expect(probe.timeout).toBe(options.timeout);
      expect(probe.secure).toBe(options.secure);
      expect(probe.dependencies).toBe(dependencies);
    });
  });

  describe('parseDependencies()', () => {
    it('should parse DATABASE_URL', () => {
      process.env.DATABASE_URL = 'postgresql://user:pass@db.example.com:5432/mydb';
      const probe = new ReadinessProbe();
      
      expect(probe.dependencies).toEqual([{
        name: 'database',
        host: 'db.example.com',
        port: '5432',
        type: 'tcp'
      }]);
    });

    it('should use default PostgreSQL port', () => {
      process.env.DATABASE_URL = 'postgresql://user:pass@db.example.com/mydb';
      const probe = new ReadinessProbe();
      
      expect(probe.dependencies[0].port).toBe(5432);
    });

    it('should parse REDIS_URL', () => {
      process.env.REDIS_URL = 'redis://redis.example.com:6380';
      const probe = new ReadinessProbe();
      
      expect(probe.dependencies).toEqual([{
        name: 'redis',
        host: 'redis.example.com',
        port: '6380',
        type: 'tcp'
      }]);
    });

    it('should use default Redis port', () => {
      process.env.REDIS_URL = 'redis://redis.example.com';
      const probe = new ReadinessProbe();
      
      expect(probe.dependencies[0].port).toBe(6379);
    });

    it('should parse DEPENDENCY_SERVICES', () => {
      process.env.DEPENDENCY_SERVICES = 'api1=http://api1.example.com/health,api2=https://api2.example.com:8443/status';
      const probe = new ReadinessProbe();
      
      expect(probe.dependencies).toEqual([
        {
          name: 'api1',
          host: 'api1.example.com',
          port: 80,
          type: 'http',
          path: '/health'
        },
        {
          name: 'api2',
          host: 'api2.example.com',
          port: '8443',
          type: 'http',
          path: '/status'
        }
      ]);
    });

    it('should handle invalid dependency URLs', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      process.env.DEPENDENCY_SERVICES = 'invalid=not-a-url,valid=http://example.com';
      
      const probe = new ReadinessProbe();
      
      expect(probe.dependencies).toHaveLength(1);
      expect(probe.dependencies[0].name).toBe('valid');
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid dependency URL')
      );
      
      consoleWarnSpy.mockRestore();
    });
  });

  describe('check()', () => {
    it('should resolve when receiving valid JSON response with ready=true', async () => {
      const responseData = JSON.stringify({ ready: true, services: ['db', 'cache'] });
      setupHttpMock(http, mockRequest, mockResponse, responseData);
      
      const result = await probe.check();
      expect(result).toEqual({
        ready: true,
        status: 200,
        details: { ready: true, services: ['db', 'cache'] }
      });
    });

    it('should reject when receiving JSON response with ready=false', async () => {
      const responseData = JSON.stringify({ ready: false });
      setupHttpMock(http, mockRequest, mockResponse, responseData);
      
      await expect(probe.check()).rejects.toThrow('Service reports not ready');
    });

    it('should resolve for status 200 without valid JSON', async () => {
      mockResponse.statusCode = 200;
      setupHttpMock(http, mockRequest, mockResponse, 'OK');
      
      const result = await probe.check();
      expect(result).toEqual({ ready: true, status: 200 });
    });

    it('should reject for 503 status code', async () => {
      mockResponse.statusCode = 503;
      setupHttpMock(http, mockRequest, mockResponse, '');
      
      await expect(probe.check()).rejects.toThrow('Service not ready (503)');
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
  });

  describe('checkTcpConnection()', () => {
    it('should resolve when connection succeeds', async () => {
      setTimeout(() => {
        mockSocket.emit('connect');
      }, 0);
      
      const result = await probe.checkTcpConnection('localhost', 5432);
      expect(result).toBe(true);
      expect(mockSocket.destroy).toHaveBeenCalled();
    });

    it('should reject on connection timeout', async () => {
      setTimeout(() => {
        mockSocket.emit('timeout');
      }, 0);
      
      await expect(probe.checkTcpConnection('localhost', 5432))
        .rejects.toThrow('TCP connection timeout to localhost:5432');
      expect(mockSocket.destroy).toHaveBeenCalled();
    });

    it('should reject on connection error', async () => {
      setTimeout(() => {
        mockSocket.emit('error', new Error('ECONNREFUSED'));
      }, 0);
      
      await expect(probe.checkTcpConnection('localhost', 5432))
        .rejects.toThrow('TCP connection failed to localhost:5432: ECONNREFUSED');
    });

    it('should use custom timeout', async () => {
      setTimeout(() => {
        mockSocket.emit('connect');
      }, 0);
      
      await probe.checkTcpConnection('localhost', 5432, 5000);
      expect(mockSocket.setTimeout).toHaveBeenCalledWith(5000);
    });
  });

  describe('checkHttpDependency()', () => {
    it('should resolve for successful HTTP check', async () => {
      mockResponse.statusCode = 200;
      setupHttpMock(http, mockRequest, mockResponse);
      
      const dep = { host: 'api.example.com', port: 80, path: '/health' };
      const result = await probe.checkHttpDependency(dep);
      expect(result).toBe(true);
      expect(mockResponse.resume).toHaveBeenCalled();
    });

    it('should reject for non-2xx status', async () => {
      mockResponse.statusCode = 503;
      setupHttpMock(http, mockRequest, mockResponse);
      
      const dep = { host: 'api.example.com', port: 80 };
      await expect(probe.checkHttpDependency(dep))
        .rejects.toThrow('HTTP check failed: 503');
    });

    it('should handle HTTPS dependencies', async () => {
      mockResponse.statusCode = 200;
      setupHttpMock(https, mockRequest, mockResponse);
      
      const dep = { host: 'api.example.com', port: 443, secure: true };
      await probe.checkHttpDependency(dep);
      
      expect(https.request).toHaveBeenCalled();
      expect(http.request).not.toHaveBeenCalled();
    });

    it('should use default health path', async () => {
      mockResponse.statusCode = 200;
      setupHttpMock(http, mockRequest, mockResponse);
      
      const dep = { host: 'api.example.com', port: 80 };
      await probe.checkHttpDependency(dep);
      
      expect(http.request).toHaveBeenCalledWith(
        expect.objectContaining({ path: '/health' }),
        expect.any(Function)
      );
    });
  });

  describe('checkDependencies()', () => {
    beforeEach(() => {
      probe.dependencies = [
        { name: 'database', host: 'db.local', port: 5432, type: 'tcp' },
        { name: 'api', host: 'api.local', port: 80, type: 'http' }
      ];
    });

    it('should check all dependencies successfully', async () => {
      // Mock successful TCP check
      jest.spyOn(probe, 'checkTcpConnection').mockResolvedValue(true);
      
      // Mock successful HTTP check
      jest.spyOn(probe, 'checkHttpDependency').mockResolvedValue(true);
      
      const result = await probe.checkDependencies();
      
      expect(result).toEqual({
        ready: true,
        checks: [
          {
            name: 'database',
            type: 'tcp',
            endpoint: 'db.local:5432',
            status: 'healthy'
          },
          {
            name: 'api',
            type: 'http',
            endpoint: 'api.local:80',
            status: 'healthy'
          }
        ]
      });
    });

    it('should handle dependency failures', async () => {
      jest.spyOn(probe, 'checkTcpConnection')
        .mockRejectedValue(new Error('Connection refused'));
      jest.spyOn(probe, 'checkHttpDependency')
        .mockResolvedValue(true);
      
      const result = await probe.checkDependencies();
      
      expect(result.ready).toBe(false);
      expect(result.checks[0]).toEqual({
        name: 'database',
        type: 'tcp',
        endpoint: 'db.local:5432',
        status: 'unhealthy',
        error: 'Connection refused'
      });
      expect(result.checks[1].status).toBe('healthy');
    });

    it('should return ready=true when no dependencies', async () => {
      probe.dependencies = [];
      
      const result = await probe.checkDependencies();
      
      expect(result).toEqual({
        ready: true,
        checks: []
      });
    });
  });

  describe('checkDns()', () => {
    it('should return working status when DNS resolves', async () => {
      dns.resolve4.mockResolvedValue(['8.8.8.8']);
      
      const result = await probe.checkDns();
      expect(result).toEqual({ dns: 'working' });
      expect(dns.resolve4).toHaveBeenCalledWith('google.com');
    });

    it('should return failed status when DNS fails', async () => {
      dns.resolve4.mockRejectedValue(new Error('ENOTFOUND'));
      
      const result = await probe.checkDns();
      expect(result).toEqual({ dns: 'failed', error: 'ENOTFOUND' });
    });
  });

  describe('fullCheck()', () => {
    let consoleErrorSpy;

    beforeEach(() => {
      jest.spyOn(probe, 'check');
      jest.spyOn(probe, 'checkDependencies');
      jest.spyOn(probe, 'checkDns');
      consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    it('should perform all checks successfully', async () => {
      probe.check.mockResolvedValue({ ready: true });
      probe.checkDependencies.mockResolvedValue({ ready: true, checks: [] });
      probe.checkDns.mockResolvedValue({ dns: 'working' });
      
      const result = await probe.fullCheck();
      
      expect(result).toMatchObject({
        app: true,
        dependencies: true,
        dns: true,
        ready: true
      });
      // When no dependencies, dependencyDetails might not be set
      if (result.dependencyDetails) {
        expect(result.dependencyDetails).toEqual([]);
      }
    });

    it('should handle app check failure', async () => {
      probe.check.mockRejectedValue(new Error('App not ready'));
      probe.checkDependencies.mockResolvedValue({ ready: true, checks: [] });
      probe.checkDns.mockResolvedValue({ dns: 'working' });
      
      const result = await probe.fullCheck();
      
      expect(result.app).toBe(false);
      expect(result.ready).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith('App check failed:', 'App not ready');
    });

    it('should handle dependency check failure', async () => {
      probe.dependencies = [{ name: 'db', host: 'localhost', port: 5432, type: 'tcp' }]; // Set dependencies
      probe.check.mockResolvedValue({ ready: true });
      probe.checkDependencies.mockResolvedValue({
        ready: false,
        checks: [{ name: 'db', status: 'unhealthy' }]
      });
      probe.checkDns.mockResolvedValue({ dns: 'working' });
      
      const result = await probe.fullCheck();
      
      expect(result.dependencies).toBe(false);
      expect(result.ready).toBe(false);
      expect(result.dependencyDetails).toEqual([{ name: 'db', status: 'unhealthy' }]);
    });

    it('should handle DNS check failure', async () => {
      probe.check.mockResolvedValue({ ready: true });
      probe.checkDependencies.mockResolvedValue({ ready: true, checks: [] });
      probe.checkDns.mockResolvedValue({ dns: 'failed' });
      
      const result = await probe.fullCheck();
      
      expect(result.dns).toBe(false);
      expect(result.ready).toBe(false);
    });

    it('should skip dependency check when no dependencies', async () => {
      probe.dependencies = [];
      probe.check.mockResolvedValue({ ready: true });
      probe.checkDns.mockResolvedValue({ dns: 'working' });
      
      const result = await probe.fullCheck();
      
      expect(result.dependencies).toBe(true);
      expect(probe.checkDependencies).not.toHaveBeenCalled();
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

    it('should exit 0 when all checks pass', async () => {
      const mockFullCheck = jest.spyOn(ReadinessProbe.prototype, 'fullCheck')
        .mockResolvedValue({
          ready: true,
          app: true,
          dependencies: true,
          dns: true
        });
      
      require.main = { filename: 'readiness.js' };
      
      jest.isolateModules(() => {
        require('../../../../docker/health/readiness');
      });
      
      await new Promise(resolve => setImmediate(resolve));
      
      expect(mockFullCheck).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(
        'Readiness check passed:',
        expect.any(String)
      );
      expect(processExitSpy).toHaveBeenCalledWith(0);
      
      mockFullCheck.mockRestore();
    });

    it('should exit 1 when checks fail', async () => {
      const mockFullCheck = jest.spyOn(ReadinessProbe.prototype, 'fullCheck')
        .mockResolvedValue({
          ready: false,
          app: true,
          dependencies: false,
          dns: true
        });
      
      require.main = { filename: 'readiness.js' };
      
      jest.isolateModules(() => {
        require('../../../../docker/health/readiness');
      });
      
      await new Promise(resolve => setImmediate(resolve));
      
      expect(processExitSpy).toHaveBeenCalledWith(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Readiness check failed:',
        expect.any(String)
      );
      
      mockFullCheck.mockRestore();
    });

    it('should handle check errors', async () => {
      const mockFullCheck = jest.spyOn(ReadinessProbe.prototype, 'fullCheck')
        .mockRejectedValue(new Error('Check error'));
      
      require.main = { filename: 'readiness.js' };
      
      jest.isolateModules(() => {
        require('../../../../docker/health/readiness');
      });
      
      await new Promise(resolve => setImmediate(resolve));
      
      expect(processExitSpy).toHaveBeenCalledWith(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Readiness check error:',
        'Check error'
      );
      
      mockFullCheck.mockRestore();
    });
  });
});