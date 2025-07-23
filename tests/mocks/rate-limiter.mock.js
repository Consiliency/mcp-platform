// Mock implementation of RateLimiterInterface for testing
class MockRateLimiterInterface {
  constructor(config) {
    this.config = config;
    this.limits = new Map();
    this.counters = new Map();
    this.rules = new Map();
  }

  async checkLimit(identifier, rule) {
    const key = `${identifier}-${rule}`;
    const count = this.counters.get(key) || 0;
    const limit = this.rules.get(rule)?.limit || 10;
    
    const allowed = count < limit;
    const remaining = Math.max(0, limit - count - 1);
    
    if (allowed) {
      this.counters.set(key, count + 1);
    }
    
    return {
      allowed,
      remaining,
      resetAt: new Date(Date.now() + 60000),
      limit
    };
  }

  async consumeToken(identifier, rule) {
    const result = await this.checkLimit(identifier, rule);
    if (!result.allowed) {
      throw new Error('Rate limit exceeded');
    }
    return result;
  }

  async setRule(ruleName, config) {
    this.rules.set(ruleName, config);
    return { created: true, rule: ruleName };
  }

  createIPRateLimiter(options) {
    return async (req, res, next) => {
      const ip = req.ip || '127.0.0.1';
      const result = await this.checkLimit(ip, 'ip-rate-limit');
      
      res.setHeader('X-RateLimit-Limit', result.limit);
      res.setHeader('X-RateLimit-Remaining', result.remaining);
      res.setHeader('X-RateLimit-Reset', result.resetAt.toISOString());
      
      if (!result.allowed) {
        return res.status(429).json({ error: 'Rate limit exceeded' });
      }
      
      next();
    };
  }
}

module.exports = MockRateLimiterInterface;