const RateLimiter = require('../../../security/rate-limiting/rate-limiter');

describe('RateLimiter', () => {
  let rateLimiter;

  beforeEach(() => {
    rateLimiter = new RateLimiter({
      storage: 'memory',
      defaultLimits: {
        'test-rule': { limit: 5, window: 60000 }, // 5 per minute
        'blocking-rule': { limit: 2, window: 60000, blockDuration: 120000 } // 2 per minute, block for 2 min
      }
    });
  });

  describe('Rate Limiting', () => {
    test('should allow requests within limit', async () => {
      const identifier = 'user-123';
      
      for (let i = 0; i < 5; i++) {
        const result = await rateLimiter.checkLimit(identifier, 'test-rule');
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(4 - i);
      }
    });

    test('should block requests over limit', async () => {
      const identifier = 'user-456';
      
      // Consume all tokens
      for (let i = 0; i < 5; i++) {
        await rateLimiter.checkLimit(identifier, 'test-rule');
      }
      
      // Next request should be blocked
      const result = await rateLimiter.checkLimit(identifier, 'test-rule');
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    test('should respect time windows', async () => {
      const identifier = 'user-789';
      
      // Consume all tokens
      for (let i = 0; i < 5; i++) {
        await rateLimiter.checkLimit(identifier, 'test-rule');
      }
      
      // Should be blocked
      let result = await rateLimiter.checkLimit(identifier, 'test-rule');
      expect(result.allowed).toBe(false);
      
      // Reset the limit
      await rateLimiter.resetLimit(identifier, 'test-rule');
      
      // Should be allowed again
      result = await rateLimiter.checkLimit(identifier, 'test-rule');
      expect(result.allowed).toBe(true);
    });
  });

  describe('Rule Management', () => {
    test('should add new rule', async () => {
      await rateLimiter.setRule('custom-rule', {
        limit: 10,
        window: 30000
      });
      
      const rule = await rateLimiter.getRule('custom-rule');
      expect(rule.limit).toBe(10);
      expect(rule.window).toBe(30000);
    });

    test('should update existing rule', async () => {
      await rateLimiter.setRule('test-rule', {
        limit: 20,
        window: 120000
      });
      
      const rule = await rateLimiter.getRule('test-rule');
      expect(rule.limit).toBe(20);
      expect(rule.window).toBe(120000);
    });
  });

  describe('Middleware', () => {
    test('should create IP rate limiter', () => {
      const middleware = rateLimiter.createIPRateLimiter({
        limit: 100,
        window: 3600000
      });
      
      expect(typeof middleware).toBe('function');
    });

    test('should create user rate limiter', () => {
      const middleware = rateLimiter.createUserRateLimiter({
        limit: 50,
        window: 3600000
      });
      
      expect(typeof middleware).toBe('function');
    });

    test('IP rate limiter should block excessive requests', async () => {
      const middleware = rateLimiter.createIPRateLimiter({
        limit: 2,
        window: 60000
      });
      
      const req = { ip: '192.168.1.100' };
      const res = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();
      
      // First two requests should pass
      await middleware(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      
      await middleware(req, res, next);
      expect(next).toHaveBeenCalledTimes(2);
      
      // Third request should be blocked
      await middleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Too many requests'
        })
      );
    });
  });

  describe('Token Consumption', () => {
    test('should consume multiple tokens at once', async () => {
      const identifier = 'bulk-user';
      
      const result = await rateLimiter.consumeToken(identifier, 'test-rule', 3);
      expect(result.success).toBe(true);
      expect(result.remaining).toBe(2);
      
      const checkResult = await rateLimiter.checkLimit(identifier, 'test-rule');
      expect(checkResult.remaining).toBe(1); // checkLimit consumes one token
    });

    test('should block when consuming too many tokens', async () => {
      const identifier = 'bulk-user-2';
      
      const result = await rateLimiter.consumeToken(identifier, 'test-rule', 10);
      expect(result.success).toBe(false);
      expect(result.remaining).toBe(5);
    });
  });
});