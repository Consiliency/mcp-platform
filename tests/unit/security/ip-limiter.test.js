const IPRateLimiter = require('../../../security/rate-limiting/ip-limiter');

describe('IPRateLimiter', () => {
  let ipLimiter;

  beforeEach(() => {
    ipLimiter = new IPRateLimiter();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      expect(ipLimiter.options.trustProxy).toBe(true);
      expect(ipLimiter.options.proxyDepth).toBe(1);
      expect(ipLimiter.storage).toBe('memory');
      expect(ipLimiter.options.ipWhitelist).toBeInstanceOf(Set);
      expect(ipLimiter.options.ipBlacklist).toBeInstanceOf(Set);
    });

    it('should accept custom options', () => {
      const customOptions = {
        trustProxy: false,
        proxyDepth: 2,
        ipWhitelist: ['192.168.1.1'],
        ipBlacklist: ['10.0.0.1'],
        subnetWhitelist: ['192.168.0.0/24'],
        subnetBlacklist: ['10.0.0.0/8'],
        limits: {
          default: { limit: 50, window: 3600000 }
        }
      };
      
      const customLimiter = new IPRateLimiter(customOptions);
      
      expect(customLimiter.options.trustProxy).toBe(false);
      expect(customLimiter.options.proxyDepth).toBe(2);
      expect(customLimiter.options.ipWhitelist.has('192.168.1.1')).toBe(true);
      expect(customLimiter.options.ipBlacklist.has('10.0.0.1')).toBe(true);
      expect(customLimiter.limits.default.limit).toBe(50);
    });

    it('should initialize default rate limits', () => {
      expect(ipLimiter.limits.default).toEqual({ limit: 100, window: 3600000 });
      expect(ipLimiter.limits.trusted).toEqual({ limit: 1000, window: 3600000 });
      expect(ipLimiter.limits.suspicious).toEqual({ limit: 20, window: 3600000 });
      expect(ipLimiter.limits.api).toEqual({ limit: 500, window: 3600000 });
      expect(ipLimiter.limits.auth).toEqual({ limit: 10, window: 900000 });
    });
  });

  describe('getClientIP', () => {
    let req;

    beforeEach(() => {
      req = {
        headers: {},
        connection: { remoteAddress: '127.0.0.1' },
        socket: { remoteAddress: '127.0.0.1' }
      };
    });

    it('should get IP from connection when not trusting proxy', () => {
      ipLimiter.options.trustProxy = false;
      const ip = ipLimiter.getClientIP(req);
      expect(ip).toBe('127.0.0.1');
    });

    it('should get IP from x-real-ip header when trusting proxy', () => {
      req.headers['x-real-ip'] = '192.168.1.100';
      const ip = ipLimiter.getClientIP(req);
      expect(ip).toBe('192.168.1.100');
    });

    it('should get IP from x-forwarded-for header', () => {
      req.headers['x-forwarded-for'] = '192.168.1.100, 10.0.0.1';
      const ip = ipLimiter.getClientIP(req);
      expect(ip).toBe('10.0.0.1'); // Gets last IP with proxyDepth=1
    });

    it('should handle proxy depth correctly', () => {
      ipLimiter.options.proxyDepth = 2;
      req.headers['x-forwarded-for'] = '192.168.1.100, 10.0.0.1, 172.16.0.1';
      const ip = ipLimiter.getClientIP(req);
      expect(ip).toBe('10.0.0.1'); // Gets IP at depth 2
    });

    it('should check multiple headers in order', () => {
      req.headers['x-forwarded-for'] = '192.168.1.100';
      req.headers['x-client-ip'] = '10.0.0.1';
      const ip = ipLimiter.getClientIP(req);
      expect(ip).toBe('192.168.1.100'); // x-forwarded-for has higher priority
    });

    it('should handle Cloudflare header', () => {
      req.headers['cf-connecting-ip'] = '192.168.1.100';
      const ip = ipLimiter.getClientIP(req);
      expect(ip).toBe('192.168.1.100');
    });

    it('should validate IP addresses', () => {
      req.headers['x-real-ip'] = 'invalid-ip';
      req.headers['x-forwarded-for'] = '192.168.1.100';
      const ip = ipLimiter.getClientIP(req);
      expect(ip).toBe('192.168.1.100'); // Falls back to valid IP
    });

    it('should fallback to socket address', () => {
      ipLimiter.options.trustProxy = true;
      req.connection.socket = { remoteAddress: '192.168.1.50' };
      const ip = ipLimiter.getClientIP(req);
      expect(ip).toBe('127.0.0.1'); // Uses connection.remoteAddress first
    });
  });

  describe('isValidIP', () => {
    it('should validate IPv4 addresses', () => {
      expect(ipLimiter.isValidIP('192.168.1.1')).toBe(true);
      expect(ipLimiter.isValidIP('0.0.0.0')).toBe(true);
      expect(ipLimiter.isValidIP('255.255.255.255')).toBe(true);
    });

    it('should reject invalid IPv4 addresses', () => {
      expect(ipLimiter.isValidIP('256.1.1.1')).toBe(false);
      expect(ipLimiter.isValidIP('192.168.1')).toBe(false);
      expect(ipLimiter.isValidIP('192.168.1.1.1')).toBe(false);
      expect(ipLimiter.isValidIP('invalid')).toBe(false);
    });

    it('should validate IPv6 addresses', () => {
      expect(ipLimiter.isValidIP('2001:db8::1')).toBe(true);
      expect(ipLimiter.isValidIP('::1')).toBe(true);
      expect(ipLimiter.isValidIP('fe80::1')).toBe(true);
    });

    it('should handle null and undefined', () => {
      expect(ipLimiter.isValidIP(null)).toBe(false);
      expect(ipLimiter.isValidIP(undefined)).toBe(false);
      expect(ipLimiter.isValidIP('')).toBe(false);
    });
  });

  describe('isWhitelisted', () => {
    beforeEach(() => {
      ipLimiter.options.ipWhitelist.add('192.168.1.100');
      ipLimiter.options.subnetWhitelist = ['192.168.2.0/24'];
    });

    it('should check exact IP whitelist', () => {
      expect(ipLimiter.isWhitelisted('192.168.1.100')).toBe(true);
      expect(ipLimiter.isWhitelisted('192.168.1.101')).toBe(false);
    });

    it('should check subnet whitelist', () => {
      expect(ipLimiter.isWhitelisted('192.168.2.1')).toBe(true);
      expect(ipLimiter.isWhitelisted('192.168.2.255')).toBe(true);
      expect(ipLimiter.isWhitelisted('192.168.3.1')).toBe(false);
    });
  });

  describe('isBlacklisted', () => {
    beforeEach(() => {
      ipLimiter.options.ipBlacklist.add('10.0.0.1');
      ipLimiter.options.subnetBlacklist = ['10.0.1.0/24'];
    });

    it('should check exact IP blacklist', () => {
      expect(ipLimiter.isBlacklisted('10.0.0.1')).toBe(true);
      expect(ipLimiter.isBlacklisted('10.0.0.2')).toBe(false);
    });

    it('should check subnet blacklist', () => {
      expect(ipLimiter.isBlacklisted('10.0.1.1')).toBe(true);
      expect(ipLimiter.isBlacklisted('10.0.1.255')).toBe(true);
      expect(ipLimiter.isBlacklisted('10.0.2.1')).toBe(false);
    });
  });

  describe('isIPInSubnet', () => {
    it('should handle exact IP match without mask', () => {
      expect(ipLimiter.isIPInSubnet('192.168.1.1', '192.168.1.1')).toBe(true);
      expect(ipLimiter.isIPInSubnet('192.168.1.2', '192.168.1.1')).toBe(false);
    });

    it('should handle /24 subnet', () => {
      expect(ipLimiter.isIPInSubnet('192.168.1.1', '192.168.1.0/24')).toBe(true);
      expect(ipLimiter.isIPInSubnet('192.168.1.255', '192.168.1.0/24')).toBe(true);
      expect(ipLimiter.isIPInSubnet('192.168.2.1', '192.168.1.0/24')).toBe(false);
    });

    it('should handle /16 subnet', () => {
      expect(ipLimiter.isIPInSubnet('192.168.1.1', '192.168.0.0/16')).toBe(true);
      expect(ipLimiter.isIPInSubnet('192.168.255.255', '192.168.0.0/16')).toBe(true);
      expect(ipLimiter.isIPInSubnet('192.169.1.1', '192.168.0.0/16')).toBe(false);
    });
  });

  describe('suspicious IP handling', () => {
    const testIP = '192.168.1.100';

    it('should mark IP as suspicious', () => {
      ipLimiter.markSuspicious(testIP, 'Test reason');
      
      expect(ipLimiter.isSuspicious(testIP)).toBe(true);
      const data = ipLimiter.suspiciousIPs.get(testIP);
      expect(data.reason).toBe('Test reason');
      expect(data.violations).toBe(1);
    });

    it('should increment violations on repeated marking', () => {
      ipLimiter.markSuspicious(testIP, 'First violation');
      ipLimiter.markSuspicious(testIP, 'Second violation');
      
      const data = ipLimiter.suspiciousIPs.get(testIP);
      expect(data.violations).toBe(2);
      expect(data.reason).toBe('Second violation');
    });

    it('should clear old suspicious markers', () => {
      // Mark as suspicious with old timestamp
      ipLimiter.suspiciousIPs.set(testIP, {
        markedAt: Date.now() - 86400001, // Just over 24 hours
        reason: 'Old violation',
        violations: 1
      });
      
      expect(ipLimiter.isSuspicious(testIP)).toBe(false);
      expect(ipLimiter.suspiciousIPs.has(testIP)).toBe(false);
    });

    it('should clear suspicious marking', () => {
      ipLimiter.markSuspicious(testIP, 'Test');
      const result = ipLimiter.clearSuspicious(testIP);
      
      expect(result.success).toBe(true);
      expect(ipLimiter.isSuspicious(testIP)).toBe(false);
    });

    it('should get all suspicious IPs', () => {
      ipLimiter.markSuspicious('192.168.1.1', 'Reason 1');
      ipLimiter.markSuspicious('192.168.1.2', 'Reason 2');
      ipLimiter.markSuspicious('192.168.1.2', 'Reason 2 again');
      
      const suspicious = ipLimiter.getSuspiciousIPs();
      
      expect(suspicious).toHaveLength(2);
      expect(suspicious[0].ip).toBe('192.168.1.2'); // More violations
      expect(suspicious[0].violations).toBe(2);
      expect(suspicious[1].ip).toBe('192.168.1.1');
      expect(suspicious[1].violations).toBe(1);
    });
  });

  describe('getRateLimitForIP', () => {
    it('should return zero limit for blacklisted IPs', () => {
      ipLimiter.options.ipBlacklist.add('10.0.0.1');
      
      const limit = ipLimiter.getRateLimitForIP('10.0.0.1', '/api/users');
      expect(limit).toEqual({ limit: 0, window: 3600000 });
    });

    it('should return trusted limit for whitelisted IPs', () => {
      ipLimiter.options.ipWhitelist.add('192.168.1.1');
      
      const limit = ipLimiter.getRateLimitForIP('192.168.1.1', '/api/users');
      expect(limit).toEqual(ipLimiter.limits.trusted);
    });

    it('should return suspicious limit for suspicious IPs', () => {
      ipLimiter.markSuspicious('192.168.1.1', 'Test');
      
      const limit = ipLimiter.getRateLimitForIP('192.168.1.1', '/api/users');
      expect(limit).toEqual(ipLimiter.limits.suspicious);
    });

    it('should return auth limit for auth endpoints', () => {
      const limit1 = ipLimiter.getRateLimitForIP('192.168.1.1', '/auth/login');
      const limit2 = ipLimiter.getRateLimitForIP('192.168.1.1', '/api/login');
      
      expect(limit1).toEqual(ipLimiter.limits.auth);
      expect(limit2).toEqual(ipLimiter.limits.auth);
    });

    it('should return api limit for api endpoints', () => {
      const limit = ipLimiter.getRateLimitForIP('192.168.1.1', '/api/users');
      expect(limit).toEqual(ipLimiter.limits.api);
    });

    it('should return default limit otherwise', () => {
      const limit = ipLimiter.getRateLimitForIP('192.168.1.1', '/home');
      expect(limit).toEqual(ipLimiter.limits.default);
    });
  });

  describe('checkLimit', () => {
    it('should check rate limit successfully', async () => {
      const result = await ipLimiter.checkLimit('192.168.1.1', '/api/users');
      
      expect(result).toMatchObject({
        allowed: true,
        remaining: 500,
        limit: 500,
        used: 0
      });
      expect(result.resetAt).toBeInstanceOf(Date);
    });

    it('should throw error if IP is missing', async () => {
      await expect(ipLimiter.checkLimit()).rejects.toThrow('IP address is required');
      await expect(ipLimiter.checkLimit(null)).rejects.toThrow('IP address is required');
    });

    it('should block blacklisted IPs', async () => {
      ipLimiter.options.ipBlacklist.add('10.0.0.1');
      
      const result = await ipLimiter.checkLimit('10.0.0.1', '/api/users');
      
      expect(result).toMatchObject({
        allowed: false,
        remaining: 0,
        limit: 0,
        reason: 'IP blacklisted'
      });
    });

    it('should track requests in memory storage', async () => {
      // First request
      await ipLimiter.consumeToken('192.168.1.1', '/api/users');
      
      // Check limit
      const result = await ipLimiter.checkLimit('192.168.1.1', '/api/users');
      
      expect(result.used).toBe(1);
      expect(result.remaining).toBe(499);
    });

    it('should remove expired requests', async () => {
      const key = 'ip:192.168.1.1:global';
      const now = Date.now();
      
      // Add old and new requests
      ipLimiter.memoryStore.set(key, {
        requests: [
          now - 3700000, // Expired
          now - 1800000, // Not expired
          now - 900000   // Not expired
        ]
      });
      
      const result = await ipLimiter.checkLimit('192.168.1.1', 'global');
      
      expect(result.used).toBe(2);
      expect(result.allowed).toBe(true);
    });

    it('should throw error for non-memory storage', async () => {
      ipLimiter.storage = 'redis';
      
      await expect(ipLimiter.checkLimit('192.168.1.1'))
        .rejects.toThrow('Redis storage not implemented in this module');
    });
  });

  describe('consumeToken', () => {
    it('should consume tokens successfully', async () => {
      const result = await ipLimiter.consumeToken('192.168.1.1', '/api/users', 1);
      
      expect(result).toMatchObject({
        success: true,
        remaining: 499
      });
      expect(result.resetAt).toBeInstanceOf(Date);
    });

    it('should throw error if IP is missing', async () => {
      await expect(ipLimiter.consumeToken()).rejects.toThrow('IP address is required');
    });

    it('should block blacklisted IPs', async () => {
      ipLimiter.options.ipBlacklist.add('10.0.0.1');
      
      const result = await ipLimiter.consumeToken('10.0.0.1', '/api/users');
      
      expect(result).toMatchObject({
        success: false,
        remaining: 0,
        reason: 'IP blacklisted'
      });
    });

    it('should handle multiple tokens', async () => {
      const result = await ipLimiter.consumeToken('192.168.1.1', '/api/users', 5);
      
      expect(result.success).toBe(true);
      expect(result.remaining).toBe(495);
      
      // Check stored requests
      const key = 'ip:192.168.1.1:/api/users';
      const record = ipLimiter.memoryStore.get(key);
      expect(record.requests).toHaveLength(5);
    });

    it('should reject when limit exceeded', async () => {
      // Consume all tokens
      for (let i = 0; i < 10; i++) {
        await ipLimiter.consumeToken('192.168.1.1', '/auth/login');
      }
      
      // Try to consume one more
      const result = await ipLimiter.consumeToken('192.168.1.1', '/auth/login');
      
      expect(result.success).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should mark IP as suspicious on auth limit exceeded', async () => {
      // Consume all auth tokens
      for (let i = 0; i < 10; i++) {
        await ipLimiter.consumeToken('192.168.1.1', '/auth/login');
      }
      
      // Try to consume one more
      await ipLimiter.consumeToken('192.168.1.1', '/auth/login');
      
      expect(ipLimiter.isSuspicious('192.168.1.1')).toBe(true);
      const data = ipLimiter.suspiciousIPs.get('192.168.1.1');
      expect(data.reason).toBe('Excessive auth attempts');
    });

    it('should calculate correct reset time', async () => {
      const before = Date.now();
      await ipLimiter.consumeToken('192.168.1.1', '/api/users');
      
      const result = await ipLimiter.consumeToken('192.168.1.1', '/api/users');
      
      expect(result.resetAt.getTime()).toBeGreaterThanOrEqual(before + 3600000 - 1000);
      expect(result.resetAt.getTime()).toBeLessThanOrEqual(before + 3600000 + 1000);
    });
  });

  describe('createMiddleware', () => {
    let req, res, next;

    beforeEach(() => {
      req = {
        headers: {},
        connection: { remoteAddress: '192.168.1.1' },
        socket: { remoteAddress: '192.168.1.1' },
        path: '/api/users'
      };
      res = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      next = jest.fn();
    });

    it('should create middleware that allows requests', async () => {
      const middleware = ipLimiter.createMiddleware();
      
      await middleware(req, res, next);
      
      expect(req.clientIP).toBe('192.168.1.1');
      expect(req.rateLimitInfo).toBeDefined();
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 500);
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 499);
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(String));
      expect(next).toHaveBeenCalled();
    });

    it('should skip rate limiting for whitelisted IPs', async () => {
      ipLimiter.options.ipWhitelist.add('192.168.1.1');
      const middleware = ipLimiter.createMiddleware();
      
      await middleware(req, res, next);
      
      expect(req.clientIP).toBe('192.168.1.1');
      expect(req.rateLimitSkipped).toBe(true);
      expect(next).toHaveBeenCalled();
      expect(res.setHeader).not.toHaveBeenCalled();
    });

    it('should not skip whitelisted IPs if configured', async () => {
      ipLimiter.options.ipWhitelist.add('192.168.1.1');
      const middleware = ipLimiter.createMiddleware({ skipWhitelisted: false });
      
      await middleware(req, res, next);
      
      expect(req.rateLimitSkipped).toBeUndefined();
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 1000);
    });

    it('should use custom endpoint', async () => {
      const middleware = ipLimiter.createMiddleware({ endpoint: '/custom' });
      
      await middleware(req, res, next);
      
      expect(req.rateLimitInfo.endpoint).toBe('/custom');
    });

    it('should block requests when limit exceeded', async () => {
      // Exhaust the limit
      for (let i = 0; i < 500; i++) {
        await ipLimiter.consumeToken('192.168.1.1', '/api/users');
      }
      
      const middleware = ipLimiter.createMiddleware();
      
      await middleware(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Too many requests from this IP',
        retryAfter: expect.any(Date)
      });
      expect(res.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(Number));
      expect(next).not.toHaveBeenCalled();
    });

    it('should show blacklist message for blacklisted IPs', async () => {
      ipLimiter.options.ipBlacklist.add('192.168.1.1');
      const middleware = ipLimiter.createMiddleware();
      
      await middleware(req, res, next);
      
      expect(res.json).toHaveBeenCalledWith({
        error: 'IP blacklisted',
        retryAfter: expect.any(Date)
      });
    });

    it('should handle missing IP gracefully', async () => {
      req.connection = {};
      req.socket = {};
      const middleware = ipLimiter.createMiddleware();
      
      await middleware(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should fail open on errors', async () => {
      // Force an error by setting invalid storage
      ipLimiter.storage = 'redis';
      const middleware = ipLimiter.createMiddleware();
      
      await middleware(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('getIPStats', () => {
    it('should get comprehensive IP statistics', async () => {
      const ip = '192.168.1.1';
      
      // Add some activity
      await ipLimiter.consumeToken(ip, '/api/users', 5);
      await ipLimiter.consumeToken(ip, '/auth/login', 2);
      
      const stats = await ipLimiter.getIPStats(ip);
      
      expect(stats).toMatchObject({
        ip,
        isWhitelisted: false,
        isBlacklisted: false,
        isSuspicious: false,
        endpoints: {
          '/api/users': {
            used: 5,
            limit: 500,
            remaining: 495,
            percentage: 1
          },
          '/auth/login': {
            used: 2,
            limit: 10,
            remaining: 8,
            percentage: 20
          }
        }
      });
    });

    it('should include suspicious data when applicable', async () => {
      const ip = '192.168.1.1';
      ipLimiter.markSuspicious(ip, 'Test reason');
      
      const stats = await ipLimiter.getIPStats(ip);
      
      expect(stats.isSuspicious).toBe(true);
      expect(stats.suspiciousData).toBeDefined();
      expect(stats.suspiciousData.reason).toBe('Test reason');
    });

    it('should filter expired requests in stats', async () => {
      const ip = '192.168.1.1';
      const key = 'ip:192.168.1.1:/api/users';
      const now = Date.now();
      
      ipLimiter.memoryStore.set(key, {
        requests: [
          now - 3700000, // Expired
          now - 1800000, // Not expired
          now - 900000   // Not expired
        ]
      });
      
      const stats = await ipLimiter.getIPStats(ip);
      
      expect(stats.endpoints['/api/users'].used).toBe(2);
    });
  });

  describe('whitelist/blacklist management', () => {
    it('should add IP to whitelist', () => {
      const result = ipLimiter.addToWhitelist('192.168.1.1');
      
      expect(result.success).toBe(true);
      expect(ipLimiter.isWhitelisted('192.168.1.1')).toBe(true);
    });

    it('should validate IP when adding to whitelist', () => {
      expect(() => ipLimiter.addToWhitelist('invalid-ip'))
        .toThrow('Invalid IP address');
    });

    it('should remove IP from whitelist', () => {
      ipLimiter.options.ipWhitelist.add('192.168.1.1');
      
      const result = ipLimiter.removeFromWhitelist('192.168.1.1');
      
      expect(result.success).toBe(true);
      expect(ipLimiter.isWhitelisted('192.168.1.1')).toBe(false);
    });

    it('should add IP to blacklist', () => {
      const result = ipLimiter.addToBlacklist('10.0.0.1');
      
      expect(result.success).toBe(true);
      expect(ipLimiter.isBlacklisted('10.0.0.1')).toBe(true);
    });

    it('should validate IP when adding to blacklist', () => {
      expect(() => ipLimiter.addToBlacklist('invalid-ip'))
        .toThrow('Invalid IP address');
    });

    it('should remove IP from blacklist', () => {
      ipLimiter.options.ipBlacklist.add('10.0.0.1');
      
      const result = ipLimiter.removeFromBlacklist('10.0.0.1');
      
      expect(result.success).toBe(true);
      expect(ipLimiter.isBlacklisted('10.0.0.1')).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('should clean up old suspicious IP entries', () => {
      const now = Date.now();
      
      // Add old and new suspicious IPs
      ipLimiter.suspiciousIPs.set('192.168.1.1', {
        markedAt: now - 86400001, // Old
        reason: 'Old',
        violations: 1
      });
      ipLimiter.suspiciousIPs.set('192.168.1.2', {
        markedAt: now - 3600000, // Recent
        reason: 'Recent',
        violations: 1
      });
      
      const result = ipLimiter.cleanup();
      
      expect(result.success).toBe(true);
      expect(ipLimiter.suspiciousIPs.has('192.168.1.1')).toBe(false);
      expect(ipLimiter.suspiciousIPs.has('192.168.1.2')).toBe(true);
    });

    it('should clean up expired rate limit data', () => {
      const now = Date.now();
      
      // Add some data
      ipLimiter.memoryStore.set('ip:192.168.1.1:/api/users', {
        requests: [
          now - 3700000, // Expired
          now - 3650000, // Expired
          now - 1800000  // Not expired
        ]
      });
      ipLimiter.memoryStore.set('ip:192.168.1.2:/api/users', {
        requests: [now - 3700000] // All expired
      });
      
      ipLimiter.cleanup();
      
      const record1 = ipLimiter.memoryStore.get('ip:192.168.1.1:/api/users');
      expect(record1.requests).toHaveLength(1);
      expect(ipLimiter.memoryStore.has('ip:192.168.1.2:/api/users')).toBe(false);
    });

    it('should handle different endpoint rate limits in cleanup', () => {
      const now = Date.now();
      
      // Auth endpoint has 15-minute window
      ipLimiter.memoryStore.set('ip:192.168.1.1:/auth/login', {
        requests: [
          now - 1800000, // Expired for auth (> 15 min)
          now - 600000   // Not expired
        ]
      });
      
      ipLimiter.cleanup();
      
      const record = ipLimiter.memoryStore.get('ip:192.168.1.1:/auth/login');
      expect(record.requests).toHaveLength(1);
    });
  });
});