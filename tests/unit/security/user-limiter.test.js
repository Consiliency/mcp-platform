const UserRateLimiter = require('../../../security/rate-limiting/user-limiter');

describe('UserRateLimiter', () => {
  let userLimiter;

  beforeEach(() => {
    userLimiter = new UserRateLimiter();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      expect(userLimiter.options.storage).toBe('memory');
      expect(userLimiter.options.keyPrefix).toBe('user-ratelimit:');
      expect(userLimiter.memoryStore).toBeInstanceOf(Map);
      expect(userLimiter.userTiers).toBeInstanceOf(Map);
      expect(userLimiter.violations).toBeInstanceOf(Map);
    });

    it('should accept custom options', () => {
      const customOptions = {
        storage: 'redis',
        keyPrefix: 'custom:',
        userTiers: [['user1', 'premium'], ['user2', 'basic']],
        tiers: {
          custom: {
            'api-calls': { limit: 200, window: 3600000 }
          }
        }
      };
      
      const customLimiter = new UserRateLimiter(customOptions);
      
      expect(customLimiter.options.storage).toBe('redis');
      expect(customLimiter.options.keyPrefix).toBe('custom:');
      expect(customLimiter.userTiers.get('user1')).toBe('premium');
      expect(customLimiter.tiers.custom).toBeDefined();
    });

    it('should initialize default tiers', () => {
      expect(userLimiter.tiers.free).toBeDefined();
      expect(userLimiter.tiers.basic).toBeDefined();
      expect(userLimiter.tiers.premium).toBeDefined();
      expect(userLimiter.tiers.enterprise).toBeDefined();
    });
  });

  describe('getUserTier', () => {
    it('should return user tier', () => {
      userLimiter.userTiers.set('user1', 'premium');
      expect(userLimiter.getUserTier('user1')).toBe('premium');
    });

    it('should return free tier by default', () => {
      expect(userLimiter.getUserTier('unknown-user')).toBe('free');
    });
  });

  describe('setUserTier', () => {
    it('should set user tier successfully', () => {
      const result = userLimiter.setUserTier('user1', 'premium');
      
      expect(result.success).toBe(true);
      expect(result.tier).toBe('premium');
      expect(userLimiter.getUserTier('user1')).toBe('premium');
    });

    it('should throw error for unknown tier', () => {
      expect(() => userLimiter.setUserTier('user1', 'unknown'))
        .toThrow('Unknown tier: unknown');
    });
  });

  describe('getRateLimitForUser', () => {
    beforeEach(() => {
      userLimiter.setUserTier('premium-user', 'premium');
      userLimiter.setUserTier('enterprise-user', 'enterprise');
    });

    it('should get rate limit based on user tier', () => {
      const limit = userLimiter.getRateLimitForUser('premium-user', 'api-calls');
      expect(limit).toEqual({ limit: 10000, window: 3600000 });
    });

    it('should return unlimited for enterprise users', () => {
      const limit = userLimiter.getRateLimitForUser('enterprise-user', 'api-calls');
      expect(limit).toEqual({ limit: -1, window: 3600000 });
    });

    it('should default to free tier for unknown users', () => {
      const limit = userLimiter.getRateLimitForUser('unknown-user', 'api-calls');
      expect(limit).toEqual({ limit: 100, window: 3600000 });
    });

    it('should return default limit for unknown resource', () => {
      const limit = userLimiter.getRateLimitForUser('premium-user', 'unknown-resource');
      expect(limit).toEqual({ limit: 50, window: 3600000 });
    });
  });

  describe('buildKey', () => {
    it('should build correct storage key', () => {
      const key = userLimiter.buildKey('user123', 'api-calls');
      expect(key).toBe('user-ratelimit:user123:api-calls');
    });

    it('should use custom key prefix', () => {
      const customLimiter = new UserRateLimiter({ keyPrefix: 'custom:' });
      const key = customLimiter.buildKey('user123', 'api-calls');
      expect(key).toBe('custom:user123:api-calls');
    });
  });

  describe('checkLimit', () => {
    it('should check rate limit successfully', async () => {
      const result = await userLimiter.checkLimit('user1', 'api-calls');
      
      expect(result).toMatchObject({
        allowed: true,
        remaining: 100,
        limit: 100,
        used: 0,
        tier: 'free'
      });
      expect(result.resetAt).toBeInstanceOf(Date);
    });

    it('should throw error if userId or resource is missing', async () => {
      await expect(userLimiter.checkLimit()).rejects.toThrow('userId and resource are required');
      await expect(userLimiter.checkLimit('user1')).rejects.toThrow('userId and resource are required');
      await expect(userLimiter.checkLimit(null, 'api-calls')).rejects.toThrow('userId and resource are required');
    });

    it('should handle unlimited tier', async () => {
      userLimiter.setUserTier('user1', 'enterprise');
      
      const result = await userLimiter.checkLimit('user1', 'api-calls');
      
      expect(result).toMatchObject({
        allowed: true,
        remaining: Infinity,
        limit: 'unlimited',
        resetAt: null,
        tier: 'enterprise'
      });
    });

    it('should track requests in memory storage', async () => {
      // Consume some tokens
      await userLimiter.consumeToken('user1', 'api-calls', 5);
      
      const result = await userLimiter.checkLimit('user1', 'api-calls');
      
      expect(result.used).toBe(5);
      expect(result.remaining).toBe(95);
      expect(result.allowed).toBe(true);
    });

    it('should remove expired requests', async () => {
      const key = 'user-ratelimit:user1:api-calls';
      const now = Date.now();
      
      // Add old and new requests
      userLimiter.memoryStore.set(key, {
        requests: [
          now - 3700000, // Expired
          now - 1800000, // Not expired
          now - 900000   // Not expired
        ]
      });
      
      const result = await userLimiter.checkLimit('user1', 'api-calls');
      
      expect(result.used).toBe(2);
      expect(result.allowed).toBe(true);
    });

    it('should calculate correct reset time', async () => {
      const now = Date.now();
      const key = 'user-ratelimit:user1:api-calls';
      
      userLimiter.memoryStore.set(key, {
        requests: [now - 1800000] // 30 minutes ago
      });
      
      const result = await userLimiter.checkLimit('user1', 'api-calls');
      
      const expectedReset = new Date(now - 1800000 + 3600000);
      expect(result.resetAt.getTime()).toBeCloseTo(expectedReset.getTime(), -2);
    });

    it('should throw error for invalid storage configuration', async () => {
      userLimiter.options.storage = 'invalid';
      
      await expect(userLimiter.checkLimit('user1', 'api-calls'))
        .rejects.toThrow('Invalid storage configuration');
    });

    it('should throw error for redis storage without client', async () => {
      userLimiter.options.storage = 'redis';
      userLimiter.options.redis = null;
      
      await expect(userLimiter.checkLimit('user1', 'api-calls'))
        .rejects.toThrow('Invalid storage configuration');
    });
  });

  describe('consumeToken', () => {
    it('should consume tokens successfully', async () => {
      const result = await userLimiter.consumeToken('user1', 'api-calls', 1);
      
      expect(result).toMatchObject({
        success: true,
        remaining: 99,
        tier: 'free'
      });
      expect(result.resetAt).toBeInstanceOf(Date);
    });

    it('should throw error if userId or resource is missing', async () => {
      await expect(userLimiter.consumeToken()).rejects.toThrow('userId and resource are required');
      await expect(userLimiter.consumeToken('user1')).rejects.toThrow('userId and resource are required');
    });

    it('should handle unlimited tier', async () => {
      userLimiter.setUserTier('user1', 'enterprise');
      
      const result = await userLimiter.consumeToken('user1', 'api-calls', 1000);
      
      expect(result).toMatchObject({
        success: true,
        remaining: Infinity,
        resetAt: null,
        tier: 'enterprise'
      });
    });

    it('should handle multiple tokens', async () => {
      const result = await userLimiter.consumeToken('user1', 'uploads', 3);
      
      expect(result.success).toBe(true);
      expect(result.remaining).toBe(2); // Free tier has 5 uploads
      
      // Check stored requests
      const key = 'user-ratelimit:user1:uploads';
      const record = userLimiter.memoryStore.get(key);
      expect(record.requests).toHaveLength(3);
    });

    it('should reject when limit exceeded', async () => {
      // Free tier has 5 uploads per hour
      for (let i = 0; i < 5; i++) {
        await userLimiter.consumeToken('user1', 'uploads');
      }
      
      const result = await userLimiter.consumeToken('user1', 'uploads');
      
      expect(result.success).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.tier).toBe('free');
    });

    it('should track violations when limit exceeded', async () => {
      const onViolation = jest.fn();
      userLimiter.options.onViolation = onViolation;
      
      // Exhaust limit
      for (let i = 0; i < 5; i++) {
        await userLimiter.consumeToken('user1', 'uploads');
      }
      
      // Trigger violation
      await userLimiter.consumeToken('user1', 'uploads');
      
      expect(onViolation).toHaveBeenCalledWith({
        userId: 'user1',
        resource: 'uploads',
        violations: 1,
        tier: 'free'
      });
    });

    it('should increment violation count on repeated violations', async () => {
      // Exhaust limit
      for (let i = 0; i < 5; i++) {
        await userLimiter.consumeToken('user1', 'uploads');
      }
      
      // Multiple violations
      await userLimiter.consumeToken('user1', 'uploads');
      await userLimiter.consumeToken('user1', 'uploads');
      
      const violations = userLimiter.violations.get('user1:uploads');
      expect(violations.count).toBe(2);
    });
  });

  describe('trackViolation', () => {
    it('should track new violation', () => {
      userLimiter.trackViolation('user1', 'api-calls');
      
      const violations = userLimiter.violations.get('user1:api-calls');
      expect(violations).toBeDefined();
      expect(violations.count).toBe(1);
      expect(violations.firstViolation).toBeLessThanOrEqual(Date.now());
      expect(violations.lastViolation).toBeLessThanOrEqual(Date.now());
    });

    it('should increment existing violation', () => {
      userLimiter.trackViolation('user1', 'api-calls');
      const firstTime = Date.now();
      
      // Wait a bit to ensure different timestamps
      setTimeout(() => {
        userLimiter.trackViolation('user1', 'api-calls');
        
        const violations = userLimiter.violations.get('user1:api-calls');
        expect(violations.count).toBe(2);
        expect(violations.firstViolation).toBeLessThanOrEqual(firstTime);
        expect(violations.lastViolation).toBeGreaterThan(firstTime);
      }, 10);
    });

    it('should call onViolation callback if provided', () => {
      const onViolation = jest.fn();
      userLimiter.options.onViolation = onViolation;
      
      userLimiter.trackViolation('user1', 'api-calls');
      
      expect(onViolation).toHaveBeenCalledWith({
        userId: 'user1',
        resource: 'api-calls',
        violations: 1,
        tier: 'free'
      });
    });
  });

  describe('getUserViolations', () => {
    beforeEach(() => {
      userLimiter.trackViolation('user1', 'api-calls');
      userLimiter.trackViolation('user1', 'uploads');
      userLimiter.trackViolation('user1', 'uploads');
      userLimiter.trackViolation('user2', 'api-calls');
    });

    it('should get all violations for a user', () => {
      const violations = userLimiter.getUserViolations('user1');
      
      expect(Object.keys(violations)).toHaveLength(2);
      expect(violations['api-calls'].count).toBe(1);
      expect(violations['uploads'].count).toBe(2);
    });

    it('should return empty object for user with no violations', () => {
      const violations = userLimiter.getUserViolations('user3');
      expect(violations).toEqual({});
    });

    it('should not include other users violations', () => {
      const violations = userLimiter.getUserViolations('user1');
      expect(Object.keys(violations)).not.toContain('user2');
    });
  });

  describe('resetLimit', () => {
    beforeEach(async () => {
      // Add some data
      await userLimiter.consumeToken('user1', 'api-calls', 5);
      await userLimiter.consumeToken('user1', 'uploads', 2);
      userLimiter.trackViolation('user1', 'api-calls');
      userLimiter.trackViolation('user1', 'uploads');
    });

    it('should reset specific resource for user', async () => {
      const result = await userLimiter.resetLimit('user1', 'api-calls');
      
      expect(result.success).toBe(true);
      
      // Check rate limit is reset
      const limit = await userLimiter.checkLimit('user1', 'api-calls');
      expect(limit.used).toBe(0);
      
      // Check violations are cleared
      expect(userLimiter.violations.has('user1:api-calls')).toBe(false);
      
      // Other resources should remain
      const uploadsLimit = await userLimiter.checkLimit('user1', 'uploads');
      expect(uploadsLimit.used).toBe(2);
    });

    it('should reset all resources for user when no resource specified', async () => {
      const result = await userLimiter.resetLimit('user1');
      
      expect(result.success).toBe(true);
      
      // Check all rate limits are reset
      const apiLimit = await userLimiter.checkLimit('user1', 'api-calls');
      const uploadsLimit = await userLimiter.checkLimit('user1', 'uploads');
      
      expect(apiLimit.used).toBe(0);
      expect(uploadsLimit.used).toBe(0);
      
      // Check all violations are cleared
      expect(userLimiter.violations.has('user1:api-calls')).toBe(false);
      expect(userLimiter.violations.has('user1:uploads')).toBe(false);
    });

    it('should throw error if userId is missing', async () => {
      await expect(userLimiter.resetLimit()).rejects.toThrow('userId is required');
    });
  });

  describe('getUserStats', () => {
    beforeEach(async () => {
      userLimiter.setUserTier('user1', 'basic');
      await userLimiter.consumeToken('user1', 'api-calls', 50);
      await userLimiter.consumeToken('user1', 'uploads', 3);
      userLimiter.trackViolation('user1', 'webhooks');
    });

    it('should get comprehensive user statistics', async () => {
      const stats = await userLimiter.getUserStats('user1');
      
      expect(stats).toMatchObject({
        userId: 'user1',
        tier: 'basic',
        resources: {
          'api-calls': {
            used: 50,
            limit: 1000,
            remaining: 950,
            percentage: 5
          },
          'uploads': {
            used: 3,
            limit: 50,
            remaining: 47,
            percentage: 6
          }
        },
        violations: {
          'webhooks': expect.objectContaining({
            count: 1
          })
        }
      });
    });

    it('should handle enterprise tier with unlimited resources', async () => {
      userLimiter.setUserTier('user2', 'enterprise');
      
      const stats = await userLimiter.getUserStats('user2');
      
      expect(stats.resources['api-calls']).toMatchObject({
        used: 0,
        limit: 'unlimited',
        remaining: Infinity,
        percentage: 0,
        resetAt: null
      });
    });
  });

  describe('createMiddleware', () => {
    let req, res, next;

    beforeEach(() => {
      req = {
        user: { userId: 'user1' }
      };
      res = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      next = jest.fn();
    });

    it('should create middleware that allows requests', async () => {
      const middleware = userLimiter.createMiddleware('api-calls');
      
      await middleware(req, res, next);
      
      expect(req.rateLimitInfo).toBeDefined();
      expect(req.rateLimitInfo.resource).toBe('api-calls');
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 100);
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 99);
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Tier', 'free');
      expect(next).toHaveBeenCalled();
    });

    it('should throw error if resource is missing', () => {
      expect(() => userLimiter.createMiddleware()).toThrow('Resource name is required');
    });

    it('should handle custom getUserId function', async () => {
      req.user = null;
      req.session = { userId: 'session-user' };
      
      const getUserId = (req) => req.session?.userId;
      const middleware = userLimiter.createMiddleware('api-calls', { getUserId });
      
      await middleware(req, res, next);
      
      expect(req.rateLimitInfo.userId).toBe('session-user');
      expect(next).toHaveBeenCalled();
    });

    it('should skip if no user ID found', async () => {
      req.user = null;
      const middleware = userLimiter.createMiddleware('api-calls');
      
      await middleware(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(req.rateLimitInfo).toBeUndefined();
    });

    it('should require auth if configured', async () => {
      req.user = null;
      const middleware = userLimiter.createMiddleware('api-calls', { requireAuth: true });
      
      await middleware(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should block requests when limit exceeded', async () => {
      // Exhaust limit
      for (let i = 0; i < 5; i++) {
        await userLimiter.consumeToken('user1', 'uploads');
      }
      
      const middleware = userLimiter.createMiddleware('uploads');
      
      await middleware(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Rate limit exceeded',
        resource: 'uploads',
        tier: 'free',
        retryAfter: expect.any(Date),
        upgradeUrl: '/pricing'
      });
      expect(res.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(Number));
      expect(next).not.toHaveBeenCalled();
    });

    it('should use custom upgrade URL', async () => {
      // Exhaust limit
      for (let i = 0; i < 100; i++) {
        await userLimiter.consumeToken('user1', 'api-calls');
      }
      
      const middleware = userLimiter.createMiddleware('api-calls', {
        upgradeUrl: '/upgrade'
      });
      
      await middleware(req, res, next);
      
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          upgradeUrl: '/upgrade'
        })
      );
    });

    it('should not set rate limit headers for unlimited tier', async () => {
      req.user.userId = 'enterprise-user';
      userLimiter.setUserTier('enterprise-user', 'enterprise');
      
      const middleware = userLimiter.createMiddleware('api-calls');
      
      await middleware(req, res, next);
      
      expect(res.setHeader).not.toHaveBeenCalledWith('X-RateLimit-Limit', expect.any(Number));
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Tier', 'enterprise');
      expect(next).toHaveBeenCalled();
    });

    it('should handle errors based on skipOnError option', async () => {
      // Force an error
      userLimiter.consumeToken = jest.fn().mockRejectedValue(new Error('Test error'));
      
      // Default behavior (skipOnError = true)
      const middleware1 = userLimiter.createMiddleware('api-calls');
      await middleware1(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      
      // With skipOnError = false
      next.mockClear();
      const middleware2 = userLimiter.createMiddleware('api-calls', { skipOnError: false });
      await middleware2(req, res, next);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Rate limiting error' });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('createTieredMiddleware', () => {
    let req, res, next;

    beforeEach(() => {
      req = {
        user: { userId: 'user1' },
        path: '/api/users'
      };
      res = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      next = jest.fn();
    });

    it('should create middleware with resource mapping', async () => {
      const resourceMapping = {
        '/api/upload': 'uploads',
        '/api/export': 'exports',
        '/webhook': 'webhooks'
      };
      
      const middleware = userLimiter.createTieredMiddleware(resourceMapping);
      
      // Test upload endpoint
      req.path = '/api/upload';
      await middleware(req, res, next);
      expect(req.rateLimitInfo.resource).toBe('uploads');
      
      // Test default
      req.path = '/api/users';
      req.rateLimitInfo = undefined;
      next.mockClear();
      await middleware(req, res, next);
      expect(req.rateLimitInfo.resource).toBe('api-calls');
    });

    it('should skip if no user', async () => {
      req.user = null;
      const middleware = userLimiter.createTieredMiddleware({});
      
      await middleware(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(req.rateLimitInfo).toBeUndefined();
    });

    it('should handle errors gracefully', async () => {
      // Force an error
      userLimiter.createMiddleware = jest.fn().mockImplementation(() => {
        throw new Error('Test error');
      });
      
      const middleware = userLimiter.createTieredMiddleware({});
      
      await middleware(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('getTierComparison', () => {
    it('should return formatted tier comparison', () => {
      const comparison = userLimiter.getTierComparison();
      
      expect(comparison).toHaveProperty('free');
      expect(comparison).toHaveProperty('basic');
      expect(comparison).toHaveProperty('premium');
      expect(comparison).toHaveProperty('enterprise');
      
      expect(comparison.free['api-calls']).toEqual({
        limit: 100,
        window: '1 hour'
      });
      
      expect(comparison.enterprise['api-calls']).toEqual({
        limit: 'Unlimited',
        window: '1 hour'
      });
    });
  });

  describe('formatWindow', () => {
    it('should format time windows correctly', () => {
      expect(userLimiter.formatWindow(1000)).toBe('1 second');
      expect(userLimiter.formatWindow(2000)).toBe('2 seconds');
      expect(userLimiter.formatWindow(60000)).toBe('1 minute');
      expect(userLimiter.formatWindow(120000)).toBe('2 minutes');
      expect(userLimiter.formatWindow(3600000)).toBe('1 hour');
      expect(userLimiter.formatWindow(7200000)).toBe('2 hours');
      expect(userLimiter.formatWindow(86400000)).toBe('1 day');
      expect(userLimiter.formatWindow(172800000)).toBe('2 days');
    });
  });

  describe('cleanup', () => {
    beforeEach(() => {
      const now = Date.now();
      
      // Add old and new violations
      userLimiter.violations.set('user1:api-calls', {
        count: 1,
        firstViolation: now - 2592000001, // Over 30 days old
        lastViolation: now - 2592000001
      });
      userLimiter.violations.set('user2:api-calls', {
        count: 1,
        firstViolation: now - 1000000, // Recent
        lastViolation: now - 1000000
      });
      
      // Add old and new rate limit data
      userLimiter.memoryStore.set('user-ratelimit:user1:api-calls', {
        requests: [
          now - 3700000, // Expired
          now - 1800000  // Not expired
        ]
      });
      userLimiter.memoryStore.set('user-ratelimit:user2:api-calls', {
        requests: [now - 3700000] // All expired
      });
    });

    it('should clean up old violations', () => {
      const result = userLimiter.cleanup();
      
      expect(result.success).toBe(true);
      expect(userLimiter.violations.has('user1:api-calls')).toBe(false);
      expect(userLimiter.violations.has('user2:api-calls')).toBe(true);
    });

    it('should clean up expired rate limit data', () => {
      userLimiter.cleanup();
      
      const record1 = userLimiter.memoryStore.get('user-ratelimit:user1:api-calls');
      expect(record1.requests).toHaveLength(1);
      expect(userLimiter.memoryStore.has('user-ratelimit:user2:api-calls')).toBe(false);
    });

    it('should handle unlimited tier in cleanup', () => {
      userLimiter.setUserTier('enterprise-user', 'enterprise');
      userLimiter.memoryStore.set('user-ratelimit:enterprise-user:api-calls', {
        requests: [Date.now() - 7200000] // Old but should not be cleaned for unlimited
      });
      
      userLimiter.cleanup();
      
      // Should still exist as enterprise has unlimited (-1) limit
      expect(userLimiter.memoryStore.has('user-ratelimit:enterprise-user:api-calls')).toBe(true);
    });
  });
});