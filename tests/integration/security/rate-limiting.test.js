const RedisRateLimiter = require('../../../security/rate-limiting/redis-limiter');
const IPRateLimiter = require('../../../security/rate-limiting/ip-limiter');
const UserRateLimiter = require('../../../security/rate-limiting/user-limiter');

describe('Rate Limiting Integration Tests', () => {
  let redisLimiter, ipLimiter, userLimiter;
  let mockRedisClient;

  beforeEach(() => {
    // Mock Redis client
    mockRedisClient = {
      pipeline: jest.fn(),
      get: jest.fn().mockResolvedValue(null),
      setex: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      zremrangebyscore: jest.fn().mockResolvedValue(0),
      zcard: jest.fn().mockResolvedValue(0),
      zrange: jest.fn().mockResolvedValue([]),
      zadd: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
      eval: jest.fn().mockResolvedValue([1, 0, 100]),
      scan: jest.fn().mockResolvedValue(['0', []]),
      ttl: jest.fn().mockResolvedValue(3600)
    };

    // Setup pipeline mock
    const pipeline = {
      zremrangebyscore: jest.fn().mockReturnThis(),
      zcard: jest.fn().mockReturnThis(),
      zrange: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([
        [null, 0], // zremrangebyscore
        [null, 0], // zcard
        [null, []] // zrange
      ])
    };
    mockRedisClient.pipeline.mockReturnValue(pipeline);

    // Initialize rate limiters
    redisLimiter = new RedisRateLimiter(mockRedisClient);
    ipLimiter = new IPRateLimiter();
    userLimiter = new UserRateLimiter();
  });

  describe('Combined Rate Limiting Strategies', () => {
    it('should apply multiple rate limiting strategies together', async () => {
      const req = {
        headers: {},
        connection: { remoteAddress: '192.168.1.100' },
        user: { userId: 'user123' },
        path: '/api/data'
      };
      const res = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      // Apply IP-based rate limiting
      const ipMiddleware = ipLimiter.createMiddleware();
      await ipMiddleware(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.clientIP).toBe('192.168.1.100');

      // Apply user-based rate limiting
      next.mockClear();
      const userMiddleware = userLimiter.createMiddleware('api-calls');
      await userMiddleware(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.rateLimitInfo.userId).toBe('user123');

      // Apply Redis-based rate limiting
      next.mockClear();
      const redisMiddleware = redisLimiter.createMiddleware('api-calls', 
        (req) => `${req.clientIP}:${req.user.userId}`
      );
      await redisMiddleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should handle rate limit exceeded across different strategies', async () => {
      const req = {
        headers: {},
        connection: { remoteAddress: '192.168.1.100' },
        user: { userId: 'user123' },
        path: '/api/data'
      };
      const res = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      // Exhaust IP rate limit
      for (let i = 0; i < 500; i++) {
        await ipLimiter.consumeToken('192.168.1.100', '/api/data');
      }

      // IP middleware should block
      const ipMiddleware = ipLimiter.createMiddleware();
      await ipMiddleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(429);
      expect(next).not.toHaveBeenCalled();

      // Reset for user limit test
      res.status.mockClear();
      res.json.mockClear();
      next.mockClear();

      // Even if IP is blocked, check user limits separately
      const newReq = { ...req, connection: { remoteAddress: '192.168.1.101' } };
      
      // Exhaust user rate limit
      for (let i = 0; i < 100; i++) {
        await userLimiter.consumeToken('user123', 'api-calls');
      }

      const userMiddleware = userLimiter.createMiddleware('api-calls');
      await userMiddleware(newReq, res, next);
      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Rate limit exceeded',
        tier: 'free'
      }));
    });
  });

  describe('Distributed Rate Limiting with Redis', () => {
    it('should handle distributed rate limiting across multiple instances', async () => {
      // Simulate requests from multiple app instances
      const identifier = 'distributed-user-123';
      const rule = 'api-calls';

      // Instance 1 consumes some tokens
      mockRedisClient.eval.mockResolvedValueOnce([1, 25, 75]);
      const result1 = await redisLimiter.consumeToken(identifier, rule, 25);
      expect(result1.success).toBe(true);
      expect(result1.remaining).toBe(75);

      // Instance 2 consumes more tokens
      mockRedisClient.eval.mockResolvedValueOnce([1, 50, 50]);
      const result2 = await redisLimiter.consumeToken(identifier, rule, 25);
      expect(result2.success).toBe(true);
      expect(result2.remaining).toBe(50);

      // Instance 3 tries to consume beyond limit
      mockRedisClient.eval.mockResolvedValueOnce([0, 100, 0]);
      const result3 = await redisLimiter.consumeToken(identifier, rule, 10);
      expect(result3.success).toBe(false);
      expect(result3.remaining).toBe(0);
    });

    it('should handle Redis failures gracefully', async () => {
      // Simulate Redis connection failure
      mockRedisClient.eval.mockRejectedValueOnce(new Error('Redis connection lost'));

      // Should fail open (allow request)
      const result = await redisLimiter.consumeToken('user123', 'api-calls');
      expect(result.success).toBe(true);
      expect(result.error).toBe('Redis connection lost');
    });
  });

  describe('Tiered Rate Limiting', () => {
    it('should apply different limits based on user tiers', async () => {
      // Set up users with different tiers
      userLimiter.setUserTier('free-user', 'free');
      userLimiter.setUserTier('premium-user', 'premium');
      userLimiter.setUserTier('enterprise-user', 'enterprise');

      // Test free tier limits
      const freeResult = await userLimiter.checkLimit('free-user', 'api-calls');
      expect(freeResult.limit).toBe(100);

      // Test premium tier limits
      const premiumResult = await userLimiter.checkLimit('premium-user', 'api-calls');
      expect(premiumResult.limit).toBe(10000);

      // Test enterprise tier (unlimited)
      const enterpriseResult = await userLimiter.checkLimit('enterprise-user', 'api-calls');
      expect(enterpriseResult.limit).toBe('unlimited');
      expect(enterpriseResult.remaining).toBe(Infinity);
    });

    it('should handle tier upgrades mid-session', async () => {
      const userId = 'upgradable-user';

      // Start as free user
      const freeResult = await userLimiter.consumeToken(userId, 'api-calls', 50);
      expect(freeResult.success).toBe(true);
      expect(freeResult.remaining).toBe(50);

      // Upgrade to premium
      userLimiter.setUserTier(userId, 'premium');

      // Should now have premium limits
      const premiumResult = await userLimiter.checkLimit(userId, 'api-calls');
      expect(premiumResult.limit).toBe(10000);
      expect(premiumResult.used).toBe(50); // Previous usage carries over
      expect(premiumResult.remaining).toBe(9950);
    });
  });

  describe('IP-based Security Features', () => {
    it('should handle IP whitelisting and blacklisting', async () => {
      // Add IPs to lists
      ipLimiter.addToWhitelist('192.168.1.100');
      ipLimiter.addToBlacklist('10.0.0.1');

      // Whitelisted IP should get higher limits
      const whitelistResult = await ipLimiter.checkLimit('192.168.1.100', '/api/data');
      expect(whitelistResult.limit).toBe(1000); // Trusted tier

      // Blacklisted IP should be blocked
      const blacklistResult = await ipLimiter.checkLimit('10.0.0.1', '/api/data');
      expect(blacklistResult.allowed).toBe(false);
      expect(blacklistResult.reason).toBe('IP blacklisted');
    });

    it('should detect and handle suspicious IPs', async () => {
      const suspiciousIP = '192.168.1.200';

      // Simulate multiple failed auth attempts
      for (let i = 0; i < 10; i++) {
        await ipLimiter.consumeToken(suspiciousIP, '/auth/login');
      }

      // Should be marked as suspicious
      expect(ipLimiter.isSuspicious(suspiciousIP)).toBe(true);

      // Should get reduced limits
      const limit = ipLimiter.getRateLimitForIP(suspiciousIP, '/api/data');
      expect(limit.limit).toBe(20); // Suspicious tier
    });

    it('should handle subnet-based rules', () => {
      ipLimiter.options.subnetWhitelist = ['192.168.0.0/16'];
      ipLimiter.options.subnetBlacklist = ['10.0.0.0/8'];

      // IPs in whitelisted subnet
      expect(ipLimiter.isWhitelisted('192.168.1.1')).toBe(true);
      expect(ipLimiter.isWhitelisted('192.168.255.255')).toBe(true);

      // IPs in blacklisted subnet
      expect(ipLimiter.isBlacklisted('10.0.0.1')).toBe(true);
      expect(ipLimiter.isBlacklisted('10.255.255.255')).toBe(true);
    });
  });

  describe('Rate Limit Headers and Responses', () => {
    it('should set appropriate rate limit headers', async () => {
      const req = {
        headers: {},
        connection: { remoteAddress: '192.168.1.100' },
        user: { userId: 'user123' },
        path: '/api/data'
      };
      const res = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      // Apply different rate limiters
      const ipMiddleware = ipLimiter.createMiddleware();
      await ipMiddleware(req, res, next);

      // Check IP rate limit headers
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 500);
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 499);
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(String));

      res.setHeader.mockClear();

      // Apply user rate limiter
      const userMiddleware = userLimiter.createMiddleware('api-calls');
      await userMiddleware(req, res, next);

      // Check user rate limit headers
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 100);
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 99);
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Tier', 'free');
    });

    it('should include retry-after header when rate limited', async () => {
      const req = {
        headers: {},
        connection: { remoteAddress: '192.168.1.100' },
        path: '/api/data'
      };
      const res = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      // Exhaust rate limit
      for (let i = 0; i < 500; i++) {
        await ipLimiter.consumeToken('192.168.1.100', '/api/data');
      }

      const middleware = ipLimiter.createMiddleware();
      await middleware(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(Number));
      expect(res.status).toHaveBeenCalledWith(429);
    });
  });

  describe('Rate Limit Statistics and Monitoring', () => {
    it('should track and report rate limit statistics', async () => {
      // Generate some traffic
      const users = ['user1', 'user2', 'user3'];
      for (const user of users) {
        for (let i = 0; i < 10; i++) {
          await userLimiter.consumeToken(user, 'api-calls');
        }
      }

      // Get statistics
      const stats1 = await userLimiter.getUserStats('user1');
      expect(stats1.resources['api-calls'].used).toBe(10);
      expect(stats1.resources['api-calls'].percentage).toBe(10);

      // Track violations
      for (let i = 0; i < 100; i++) {
        await userLimiter.consumeToken('user2', 'api-calls');
      }

      const stats2 = await userLimiter.getUserStats('user2');
      expect(stats2.violations['api-calls']).toBeDefined();
      expect(stats2.violations['api-calls'].count).toBeGreaterThan(0);
    });

    it('should provide aggregated statistics for Redis limiter', async () => {
      // Mock scan results
      mockRedisClient.scan.mockResolvedValueOnce(['0', [
        'ratelimit:api-calls:user1',
        'ratelimit:api-calls:user2',
        'ratelimit:api-calls:user1:blocked'
      ]]);

      // Mock zcard for usage
      mockRedisClient.zcard
        .mockResolvedValueOnce(80)
        .mockResolvedValueOnce(90);

      const stats = await redisLimiter.getStats('api-calls');
      
      expect(stats).toMatchObject({
        rule: 'api-calls',
        limit: 100,
        totalIdentifiers: 2,
        blockedIdentifiers: 1,
        averageUsage: 85,
        topUsers: expect.any(Array)
      });
    });
  });

  describe('Cleanup and Maintenance', () => {
    it('should clean up expired data', async () => {
      const now = Date.now();

      // Add old data to IP limiter
      ipLimiter.suspiciousIPs.set('192.168.1.1', {
        markedAt: now - 86400001, // Over 24 hours old
        reason: 'Old violation',
        violations: 1
      });

      // Add old data to user limiter
      userLimiter.violations.set('user1:api-calls', {
        count: 1,
        firstViolation: now - 2592000001, // Over 30 days old
        lastViolation: now - 2592000001
      });

      // Run cleanup
      ipLimiter.cleanup();
      userLimiter.cleanup();

      // Old data should be removed
      expect(ipLimiter.suspiciousIPs.has('192.168.1.1')).toBe(false);
      expect(userLimiter.violations.has('user1:api-calls')).toBe(false);
    });

    it('should handle Redis cleanup', async () => {
      // Mock scan for cleanup
      mockRedisClient.scan.mockResolvedValueOnce(['0', [
        'ratelimit:api-calls:user1',
        'ratelimit:api-calls:user2'
      ]]);

      // Mock TTL checks
      mockRedisClient.ttl
        .mockResolvedValueOnce(-1) // No TTL
        .mockResolvedValueOnce(3600); // Has TTL

      const result = await redisLimiter.cleanup();
      
      expect(result.success).toBe(true);
      expect(result.cleaned).toBe(1);
      expect(mockRedisClient.expire).toHaveBeenCalledWith('ratelimit:api-calls:user1', 3600);
    });
  });

  describe('Advanced Rate Limiting Scenarios', () => {
    it('should handle burst traffic patterns', async () => {
      const userId = 'burst-user';
      const requests = [];

      // Simulate burst of 50 requests
      for (let i = 0; i < 50; i++) {
        requests.push(userLimiter.consumeToken(userId, 'api-calls'));
      }

      const results = await Promise.all(requests);
      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      // Free tier allows 100 per hour
      expect(successful).toBe(50);
      expect(failed).toBe(0);

      // Next burst should start failing
      const moreRequests = [];
      for (let i = 0; i < 60; i++) {
        moreRequests.push(userLimiter.consumeToken(userId, 'api-calls'));
      }

      const moreResults = await Promise.all(moreRequests);
      const moreSuccessful = moreResults.filter(r => r.success).length;
      const moreFailed = moreResults.filter(r => !r.success).length;

      expect(moreSuccessful).toBe(50); // Remaining from 100 limit
      expect(moreFailed).toBe(10);
    });

    it('should handle different endpoints with different limits', async () => {
      const req = {
        user: { userId: 'user123' },
        path: '/api/upload'
      };
      const res = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      // Create tiered middleware with endpoint mapping
      const middleware = userLimiter.createTieredMiddleware({
        '/api/upload': 'uploads',
        '/api/export': 'exports',
        '/webhook': 'webhooks'
      });

      // Test upload endpoint
      await middleware(req, res, next);
      expect(req.rateLimitInfo.resource).toBe('uploads');
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 5); // Free tier upload limit

      // Test export endpoint
      req.path = '/api/export';
      req.rateLimitInfo = undefined;
      res.setHeader.mockClear();
      next.mockClear();

      await middleware(req, res, next);
      expect(req.rateLimitInfo.resource).toBe('exports');
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 10); // Free tier export limit
    });
  });
});