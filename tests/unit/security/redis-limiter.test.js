const RedisRateLimiter = require('../../../security/rate-limiting/redis-limiter');

describe('RedisRateLimiter', () => {
  let redisClient;
  let rateLimiter;
  let pipelineCommands;
  
  beforeEach(() => {
    // Mock Redis pipeline
    pipelineCommands = [];
    const pipeline = {
      zremrangebyscore: jest.fn((...args) => {
        pipelineCommands.push(['zremrangebyscore', args]);
        return pipeline;
      }),
      zcard: jest.fn((...args) => {
        pipelineCommands.push(['zcard', args]);
        return pipeline;
      }),
      zrange: jest.fn((...args) => {
        pipelineCommands.push(['zrange', args]);
        return pipeline;
      }),
      exec: jest.fn(() => Promise.resolve([
        [null, 1], // zremrangebyscore result
        [null, 2], // zcard result
        [null, []] // zrange result
      ]))
    };

    // Mock Redis client
    redisClient = {
      pipeline: jest.fn(() => pipeline),
      get: jest.fn(() => Promise.resolve(null)),
      setex: jest.fn(() => Promise.resolve('OK')),
      del: jest.fn(() => Promise.resolve(1)),
      zremrangebyscore: jest.fn(() => Promise.resolve(1)),
      zcard: jest.fn(() => Promise.resolve(0)),
      zrange: jest.fn(() => Promise.resolve([])),
      zadd: jest.fn(() => Promise.resolve(1)),
      expire: jest.fn(() => Promise.resolve(1)),
      eval: jest.fn(() => Promise.resolve([1, 2, 98])), // [success, count, remaining]
      scan: jest.fn(() => Promise.resolve(['0', []])),
      ttl: jest.fn(() => Promise.resolve(3600))
    };

    rateLimiter = new RedisRateLimiter(redisClient);
  });

  describe('constructor', () => {
    it('should throw error if redis client is not provided', () => {
      expect(() => new RedisRateLimiter()).toThrow('Redis client is required');
      expect(() => new RedisRateLimiter(null)).toThrow('Redis client is required');
    });

    it('should initialize with default options', () => {
      expect(rateLimiter.options.keyPrefix).toBe('ratelimit:');
      expect(rateLimiter.options.defaultTTL).toBe(3600);
    });

    it('should accept custom options', () => {
      const customOptions = {
        keyPrefix: 'custom:',
        defaultTTL: 7200,
        rules: {
          custom: { limit: 50, window: 60000 }
        }
      };
      
      const customLimiter = new RedisRateLimiter(redisClient, customOptions);
      
      expect(customLimiter.options.keyPrefix).toBe('custom:');
      expect(customLimiter.options.defaultTTL).toBe(7200);
      expect(customLimiter.rules.get('custom')).toEqual({ limit: 50, window: 60000 });
    });

    it('should initialize with default rules', () => {
      expect(rateLimiter.rules.get('api-calls')).toEqual({ limit: 100, window: 3600000 });
      expect(rateLimiter.rules.get('auth-attempts')).toEqual({ 
        limit: 5, 
        window: 900000, 
        blockDuration: 3600000 
      });
      expect(rateLimiter.rules.get('uploads')).toEqual({ limit: 10, window: 3600000 });
      expect(rateLimiter.rules.get('webhooks')).toEqual({ limit: 50, window: 60000 });
    });
  });

  describe('buildKey', () => {
    it('should build correct Redis key', () => {
      const key = rateLimiter.buildKey('user123', 'api-calls');
      expect(key).toBe('ratelimit:api-calls:user123');
    });

    it('should use custom key prefix', () => {
      const customLimiter = new RedisRateLimiter(redisClient, { keyPrefix: 'myapp:' });
      const key = customLimiter.buildKey('user123', 'api-calls');
      expect(key).toBe('myapp:api-calls:user123');
    });
  });

  describe('checkLimit', () => {
    it('should check rate limit successfully', async () => {
      const result = await rateLimiter.checkLimit('user123', 'api-calls');
      
      expect(result).toMatchObject({
        allowed: true,
        remaining: 98,
        limit: 100,
        blocked: false
      });
      expect(result.resetAt).toBeInstanceOf(Date);
    });

    it('should throw error if identifier or rule is missing', async () => {
      await expect(rateLimiter.checkLimit()).rejects.toThrow('Identifier and rule are required');
      await expect(rateLimiter.checkLimit('user123')).rejects.toThrow('Identifier and rule are required');
      await expect(rateLimiter.checkLimit(null, 'api-calls')).rejects.toThrow('Identifier and rule are required');
    });

    it('should throw error for unknown rule', async () => {
      await expect(rateLimiter.checkLimit('user123', 'unknown')).rejects.toThrow("Rule 'unknown' not found");
    });

    it('should handle blocked identifiers', async () => {
      const blockExpiry = Date.now() + 3600000;
      redisClient.get.mockResolvedValueOnce(blockExpiry.toString());
      
      const result = await rateLimiter.checkLimit('user123', 'api-calls');
      
      expect(result).toMatchObject({
        allowed: false,
        remaining: 0,
        limit: 100,
        blocked: true
      });
      expect(result.resetAt.getTime()).toBe(blockExpiry);
    });

    it('should not allow when limit is reached', async () => {
      redisClient.pipeline().exec.mockResolvedValueOnce([
        [null, 1], // zremrangebyscore
        [null, 100], // zcard - at limit
        [null, [[`${Date.now() - 1800000}`, `${Date.now() - 1800000}`]]] // zrange
      ]);
      
      const result = await rateLimiter.checkLimit('user123', 'api-calls');
      
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should calculate correct reset time from oldest entry', async () => {
      const oldestTime = Date.now() - 1800000; // 30 minutes ago
      redisClient.pipeline().exec.mockResolvedValueOnce([
        [null, 1],
        [null, 50],
        [null, [[`entry`, oldestTime.toString()]]]
      ]);
      
      const result = await rateLimiter.checkLimit('user123', 'api-calls');
      
      const expectedReset = new Date(oldestTime + 3600000);
      expect(result.resetAt.getTime()).toBe(expectedReset.getTime());
    });

    it('should fail open on Redis errors', async () => {
      redisClient.pipeline().exec.mockRejectedValueOnce(new Error('Redis error'));
      
      const result = await rateLimiter.checkLimit('user123', 'api-calls');
      
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(100);
      expect(result.error).toBe('Redis error');
    });

    it('should handle pipeline errors', async () => {
      redisClient.pipeline().exec.mockResolvedValueOnce([
        ['REDIS_ERROR', null],
        [null, 2],
        [null, []]
      ]);
      
      const result = await rateLimiter.checkLimit('user123', 'api-calls');
      
      expect(result.allowed).toBe(true);
      expect(result.error).toBeDefined();
    });
  });

  describe('consumeToken', () => {
    it('should consume tokens successfully', async () => {
      const result = await rateLimiter.consumeToken('user123', 'api-calls', 1);
      
      expect(result).toMatchObject({
        success: true,
        remaining: 98,
        count: 2
      });
      expect(result.resetAt).toBeInstanceOf(Date);
    });

    it('should handle multiple tokens', async () => {
      redisClient.eval.mockResolvedValueOnce([1, 5, 95]);
      
      const result = await rateLimiter.consumeToken('user123', 'api-calls', 5);
      
      expect(result.success).toBe(true);
      expect(result.remaining).toBe(95);
      expect(result.count).toBe(5);
    });

    it('should throw error if identifier or rule is missing', async () => {
      await expect(rateLimiter.consumeToken()).rejects.toThrow('Identifier and rule are required');
      await expect(rateLimiter.consumeToken('user123')).rejects.toThrow('Identifier and rule are required');
    });

    it('should throw error for unknown rule', async () => {
      await expect(rateLimiter.consumeToken('user123', 'unknown')).rejects.toThrow("Rule 'unknown' not found");
    });

    it('should handle blocked identifiers', async () => {
      const blockExpiry = Date.now() + 3600000;
      redisClient.get.mockResolvedValueOnce(blockExpiry.toString());
      
      const result = await rateLimiter.consumeToken('user123', 'api-calls');
      
      expect(result).toMatchObject({
        success: false,
        remaining: 0,
        blocked: true
      });
      expect(result.resetAt.getTime()).toBe(blockExpiry);
    });

    it('should block identifier when limit exceeded with blockDuration', async () => {
      redisClient.eval.mockResolvedValueOnce([0, 5, 0]); // Failed
      
      const result = await rateLimiter.consumeToken('user123', 'auth-attempts');
      
      expect(result.success).toBe(false);
      expect(result.blocked).toBe(true);
      expect(redisClient.setex).toHaveBeenCalled();
    });

    it('should not block when blockDuration is not set', async () => {
      redisClient.eval.mockResolvedValueOnce([0, 100, 0]); // Failed
      
      const result = await rateLimiter.consumeToken('user123', 'api-calls');
      
      expect(result.success).toBe(false);
      expect(result.blocked).toBeUndefined();
      expect(redisClient.setex).not.toHaveBeenCalled();
    });

    it('should fail open on Redis errors', async () => {
      redisClient.eval.mockRejectedValueOnce(new Error('Redis error'));
      
      const result = await rateLimiter.consumeToken('user123', 'api-calls');
      
      expect(result.success).toBe(true);
      expect(result.remaining).toBe(100);
      expect(result.error).toBe('Redis error');
    });
  });

  describe('resetLimit', () => {
    it('should reset limit successfully', async () => {
      const result = await rateLimiter.resetLimit('user123', 'api-calls');
      
      expect(result.success).toBe(true);
      expect(redisClient.del).toHaveBeenCalledWith(
        'ratelimit:api-calls:user123',
        'ratelimit:api-calls:user123:blocked'
      );
    });

    it('should throw error if identifier or rule is missing', async () => {
      await expect(rateLimiter.resetLimit()).rejects.toThrow('Identifier and rule are required');
      await expect(rateLimiter.resetLimit('user123')).rejects.toThrow('Identifier and rule are required');
    });

    it('should handle Redis errors', async () => {
      redisClient.del.mockRejectedValueOnce(new Error('Redis error'));
      
      const result = await rateLimiter.resetLimit('user123', 'api-calls');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Redis error');
    });
  });

  describe('getUsage', () => {
    it('should get usage statistics', async () => {
      redisClient.zcard.mockResolvedValueOnce(25);
      
      const result = await rateLimiter.getUsage('user123', 'api-calls');
      
      expect(result).toMatchObject({
        used: 25,
        limit: 100,
        remaining: 75,
        percentage: 25,
        blocked: false,
        blockExpiry: null
      });
    });

    it('should handle blocked identifiers', async () => {
      redisClient.zcard.mockResolvedValueOnce(5);
      const blockExpiry = Date.now() + 3600000;
      redisClient.get.mockResolvedValueOnce(blockExpiry.toString());
      
      const result = await rateLimiter.getUsage('user123', 'auth-attempts');
      
      expect(result.blocked).toBe(true);
      expect(result.blockExpiry.getTime()).toBe(blockExpiry);
    });

    it('should throw error for unknown rule', async () => {
      await expect(rateLimiter.getUsage('user123', 'unknown')).rejects.toThrow("Rule 'unknown' not found");
    });

    it('should handle Redis errors gracefully', async () => {
      redisClient.zremrangebyscore.mockRejectedValueOnce(new Error('Redis error'));
      
      const result = await rateLimiter.getUsage('user123', 'api-calls');
      
      expect(result).toMatchObject({
        used: 0,
        limit: 100,
        remaining: 100,
        percentage: 0,
        error: 'Redis error'
      });
    });
  });

  describe('setRule', () => {
    it('should set a new rule', async () => {
      const result = await rateLimiter.setRule('custom', {
        limit: 200,
        window: 60000,
        blockDuration: 300000
      });
      
      expect(result.success).toBe(true);
      expect(rateLimiter.rules.get('custom')).toEqual({
        limit: 200,
        window: 60000,
        blockDuration: 300000
      });
    });

    it('should update existing rule', async () => {
      await rateLimiter.setRule('api-calls', {
        limit: 200,
        window: 3600000
      });
      
      expect(rateLimiter.rules.get('api-calls')).toEqual({
        limit: 200,
        window: 3600000,
        blockDuration: undefined
      });
    });

    it('should throw error if rule name or config is missing', async () => {
      await expect(rateLimiter.setRule()).rejects.toThrow('Rule name and config are required');
      await expect(rateLimiter.setRule('custom')).rejects.toThrow('Rule name and config are required');
    });

    it('should throw error if config is invalid', async () => {
      await expect(rateLimiter.setRule('custom', {})).rejects.toThrow('Rule config must include limit and window');
      await expect(rateLimiter.setRule('custom', { limit: 100 })).rejects.toThrow('Rule config must include limit and window');
      await expect(rateLimiter.setRule('custom', { window: 60000 })).rejects.toThrow('Rule config must include limit and window');
    });
  });

  describe('getRules', () => {
    it('should return all rules', () => {
      const rules = rateLimiter.getRules();
      
      expect(rules).toHaveProperty('api-calls');
      expect(rules).toHaveProperty('auth-attempts');
      expect(rules).toHaveProperty('uploads');
      expect(rules).toHaveProperty('webhooks');
      expect(Object.keys(rules)).toHaveLength(4);
    });

    it('should return copies of rules', () => {
      const rules = rateLimiter.getRules();
      rules['api-calls'].limit = 999;
      
      const rulesAgain = rateLimiter.getRules();
      expect(rulesAgain['api-calls'].limit).toBe(100);
    });
  });

  describe('createMiddleware', () => {
    let req, res, next;

    beforeEach(() => {
      req = { ip: '192.168.1.1' };
      res = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      next = jest.fn();
    });

    it('should create middleware that allows requests within limit', async () => {
      const identifierFn = (req) => req.ip;
      const middleware = rateLimiter.createMiddleware('api-calls', identifierFn);
      
      await middleware(req, res, next);
      
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 100);
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 98);
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(String));
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should block requests exceeding limit', async () => {
      redisClient.eval.mockResolvedValueOnce([0, 100, 0]); // Failed
      redisClient.zrange.mockResolvedValueOnce([]);
      
      const identifierFn = (req) => req.ip;
      const middleware = rateLimiter.createMiddleware('api-calls', identifierFn);
      
      await middleware(req, res, next);
      
      expect(res.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(Number));
      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Too many requests',
        retryAfter: expect.any(Date),
        blocked: false
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should show blocked message for blocked identifiers', async () => {
      const blockExpiry = Date.now() + 3600000;
      redisClient.get.mockResolvedValueOnce(blockExpiry.toString());
      
      const identifierFn = (req) => req.ip;
      const middleware = rateLimiter.createMiddleware('auth-attempts', identifierFn);
      
      await middleware(req, res, next);
      
      expect(res.json).toHaveBeenCalledWith({
        error: 'Too many requests - you have been temporarily blocked',
        retryAfter: expect.any(Date),
        blocked: true
      });
    });

    it('should skip if identifier function returns null', async () => {
      const identifierFn = () => null;
      const middleware = rateLimiter.createMiddleware('api-calls', identifierFn);
      
      await middleware(req, res, next);
      
      expect(redisClient.eval).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });

    it('should fail open on errors', async () => {
      redisClient.eval.mockRejectedValueOnce(new Error('Redis error'));
      
      const identifierFn = (req) => req.ip;
      const middleware = rateLimiter.createMiddleware('api-calls', identifierFn);
      
      await middleware(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should throw error if rule name or identifier function is missing', () => {
      expect(() => rateLimiter.createMiddleware()).toThrow('Rule name and identifier function are required');
      expect(() => rateLimiter.createMiddleware('api-calls')).toThrow('Rule name and identifier function are required');
    });
  });

  describe('getStats', () => {
    it('should get statistics for a rule', async () => {
      redisClient.scan.mockResolvedValueOnce(['0', [
        'ratelimit:api-calls:user1',
        'ratelimit:api-calls:user2',
        'ratelimit:api-calls:user2:blocked'
      ]]);
      redisClient.zcard
        .mockResolvedValueOnce(50)
        .mockResolvedValueOnce(75);
      
      const stats = await rateLimiter.getStats('api-calls');
      
      expect(stats).toMatchObject({
        rule: 'api-calls',
        limit: 100,
        window: 3600000,
        totalIdentifiers: 2,
        blockedIdentifiers: 1,
        averageUsage: 62.5,
        topUsers: expect.any(Array)
      });
      expect(stats.topUsers).toHaveLength(2);
      expect(stats.topUsers[0]).toMatchObject({
        identifier: 'user2',
        count: 75,
        percentage: 75
      });
    });

    it('should handle empty results', async () => {
      redisClient.scan.mockResolvedValueOnce(['0', []]);
      
      const stats = await rateLimiter.getStats('api-calls');
      
      expect(stats).toMatchObject({
        totalIdentifiers: 0,
        blockedIdentifiers: 0,
        averageUsage: 0,
        topUsers: []
      });
    });

    it('should limit top users', async () => {
      const keys = Array.from({ length: 20 }, (_, i) => `ratelimit:api-calls:user${i}`);
      redisClient.scan.mockResolvedValueOnce(['0', keys]);
      
      // Mock zcard to return different counts
      keys.forEach((_, i) => {
        redisClient.zcard.mockResolvedValueOnce(i + 1);
      });
      
      const stats = await rateLimiter.getStats('api-calls', { topUsersLimit: 5 });
      
      expect(stats.topUsers).toHaveLength(5);
    });

    it('should throw error for unknown rule', async () => {
      await expect(rateLimiter.getStats('unknown')).rejects.toThrow("Rule 'unknown' not found");
    });

    it('should handle errors gracefully', async () => {
      redisClient.scan.mockRejectedValueOnce(new Error('Redis error'));
      
      const stats = await rateLimiter.getStats('api-calls');
      
      expect(stats.error).toBe('Redis error');
      expect(stats.totalIdentifiers).toBe(0);
    });
  });

  describe('scanKeys', () => {
    it('should scan all keys matching pattern', async () => {
      redisClient.scan
        .mockResolvedValueOnce(['1', ['key1', 'key2']])
        .mockResolvedValueOnce(['0', ['key3']]);
      
      const keys = await rateLimiter.scanKeys('ratelimit:*');
      
      expect(keys).toEqual(['key1', 'key2', 'key3']);
      expect(redisClient.scan).toHaveBeenCalledTimes(2);
    });

    it('should handle empty scan results', async () => {
      redisClient.scan.mockResolvedValueOnce(['0', []]);
      
      const keys = await rateLimiter.scanKeys('ratelimit:*');
      
      expect(keys).toEqual([]);
    });

    it('should use custom count parameter', async () => {
      redisClient.scan.mockResolvedValueOnce(['0', []]);
      
      await rateLimiter.scanKeys('pattern*', 50);
      
      expect(redisClient.scan).toHaveBeenCalledWith('0', 'MATCH', 'pattern*', 'COUNT', 50);
    });
  });

  describe('cleanup', () => {
    it('should clean up keys without TTL', async () => {
      redisClient.scan.mockResolvedValueOnce(['0', [
        'ratelimit:api-calls:user1',
        'ratelimit:api-calls:user1:blocked',
        'ratelimit:api-calls:user2'
      ]]);
      redisClient.ttl
        .mockResolvedValueOnce(-1) // No TTL
        .mockResolvedValueOnce(3600); // Has TTL
      
      const result = await rateLimiter.cleanup();
      
      expect(result.success).toBe(true);
      expect(result.cleaned).toBe(1);
      expect(redisClient.expire).toHaveBeenCalledWith('ratelimit:api-calls:user1', 3600);
      expect(redisClient.expire).toHaveBeenCalledTimes(1);
    });

    it('should skip blocked keys', async () => {
      redisClient.scan.mockResolvedValueOnce(['0', [
        'ratelimit:api-calls:user1:blocked'
      ]]);
      
      const result = await rateLimiter.cleanup();
      
      expect(result.cleaned).toBe(0);
      expect(redisClient.ttl).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      redisClient.scan.mockRejectedValueOnce(new Error('Redis error'));
      
      const result = await rateLimiter.cleanup();
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Redis error');
    });
  });
});