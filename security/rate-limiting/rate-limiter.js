class RateLimiter {
  constructor(config = {}) {
    this.storage = config.storage || 'memory';
    this.redis = config.redis || null;
    
    // If Redis storage is requested but no Redis client provided, fall back to memory
    if (this.storage === 'redis' && !this.redis) {
      console.warn('Redis storage requested but no Redis client provided, falling back to memory storage');
      this.storage = 'memory';
    }
    
    // Merge provided limits with defaults
    const providedLimits = config.defaultLimits || {};
    this.defaultLimits = {
      'api-calls': { limit: 100, window: 3600000 }, // 100 per hour
      'auth-attempts': { limit: 5, window: 900000, blockDuration: 3600000 }, // 5 per 15 min, block for 1 hour
      'health-check': { limit: 10, window: 60000 }, // 10 per minute for health checks
      ...providedLimits
    };
    
    // In-memory storage
    this.memoryStore = new Map();
    this.rules = new Map(Object.entries(this.defaultLimits));
    this.blocked = new Map(); // Track blocked identifiers
  }

  // Rate limiting operations
  async checkLimit(identifier, rule) {
    if (!identifier || !rule) {
      throw new Error('Identifier and rule are required');
    }

    const ruleConfig = this.rules.get(rule);
    if (!ruleConfig) {
      throw new Error(`Rule '${rule}' not found`);
    }

    // Check if identifier is blocked
    if (this.isBlocked(identifier, rule)) {
      const blockExpiry = this.blocked.get(`${identifier}:${rule}`);
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(blockExpiry),
        limit: ruleConfig.limit
      };
    }

    const key = `${identifier}:${rule}`;
    const now = Date.now();
    const windowStart = now - ruleConfig.window;

    if (this.storage === 'memory') {
      const record = this.memoryStore.get(key) || { tokens: [], windowStart: now };
      
      // Remove expired tokens
      record.tokens = record.tokens.filter(timestamp => timestamp > windowStart);
      
      const used = record.tokens.length;
      const allowed = used < ruleConfig.limit;
      
      // Consume a token if allowed
      if (allowed) {
        record.tokens.push(now);
        this.memoryStore.set(key, record);
      }
      
      const remaining = Math.max(0, ruleConfig.limit - record.tokens.length);
      const resetAt = record.tokens.length > 0 
        ? new Date(Math.min(...record.tokens) + ruleConfig.window)
        : new Date(now + ruleConfig.window);

      return {
        allowed,
        remaining,
        resetAt,
        limit: ruleConfig.limit
      };
    } else if (this.storage === 'redis' && this.redis) {
      // Redis implementation would go here
      throw new Error('Redis storage not yet implemented');
    }

    throw new Error('Invalid storage configuration');
  }

  async consumeToken(identifier, rule, tokens = 1) {
    if (!identifier || !rule) {
      throw new Error('Identifier and rule are required');
    }

    const ruleConfig = this.rules.get(rule);
    if (!ruleConfig) {
      throw new Error(`Rule '${rule}' not found`);
    }

    // Check if blocked
    if (this.isBlocked(identifier, rule)) {
      const blockExpiry = this.blocked.get(`${identifier}:${rule}`);
      return {
        success: false,
        remaining: 0,
        resetAt: new Date(blockExpiry)
      };
    }

    const key = `${identifier}:${rule}`;
    const now = Date.now();
    const windowStart = now - ruleConfig.window;

    if (this.storage === 'memory') {
      const record = this.memoryStore.get(key) || { tokens: [], windowStart: now };
      
      // Remove expired tokens
      record.tokens = record.tokens.filter(timestamp => timestamp > windowStart);
      
      // Check if we can consume tokens
      if (record.tokens.length + tokens > ruleConfig.limit) {
        // If blockDuration is set, block the identifier
        if (ruleConfig.blockDuration) {
          this.blockIdentifier(identifier, rule, ruleConfig.blockDuration);
        }
        
        return {
          success: false,
          remaining: Math.max(0, ruleConfig.limit - record.tokens.length),
          resetAt: new Date(Math.min(...record.tokens, now) + ruleConfig.window)
        };
      }
      
      // Consume tokens
      for (let i = 0; i < tokens; i++) {
        record.tokens.push(now);
      }
      
      this.memoryStore.set(key, record);
      
      const remaining = Math.max(0, ruleConfig.limit - record.tokens.length);
      const resetAt = new Date(Math.min(...record.tokens) + ruleConfig.window);
      
      return {
        success: true,
        remaining,
        resetAt
      };
    }

    throw new Error('Invalid storage configuration');
  }

  async resetLimit(identifier, rule) {
    if (!identifier || !rule) {
      throw new Error('Identifier and rule are required');
    }

    const key = `${identifier}:${rule}`;
    
    if (this.storage === 'memory') {
      this.memoryStore.delete(key);
      this.blocked.delete(key); // Also remove from blocked list
      return { success: true };
    }

    return { success: false };
  }

  // Rule management
  async setRule(ruleName, config) {
    if (!ruleName || !config) {
      throw new Error('Rule name and config are required');
    }

    if (config.limit === undefined || config.limit === null || !config.window) {
      throw new Error('Rule config must include limit and window');
    }

    this.rules.set(ruleName, {
      limit: config.limit,
      window: config.window,
      blockDuration: config.blockDuration
    });

    return { success: true };
  }

  async getRule(ruleName) {
    const rule = this.rules.get(ruleName);
    if (!rule) {
      return null;
    }

    return {
      limit: rule.limit,
      window: rule.window,
      blockDuration: rule.blockDuration
    };
  }

  // Middleware factories
  createRateLimitMiddleware(ruleName, identifierFn) {
    if (!ruleName || !identifierFn) {
      throw new Error('Rule name and identifier function are required');
    }

    return async (req, res, next) => {
      try {
        const identifier = identifierFn(req);
        if (!identifier) {
          return next();
        }

        const result = await this.consumeToken(identifier, ruleName);
        
        // Set rate limit headers
        res.setHeader('X-RateLimit-Limit', this.rules.get(ruleName).limit);
        res.setHeader('X-RateLimit-Remaining', result.remaining);
        res.setHeader('X-RateLimit-Reset', result.resetAt.toISOString());

        if (!result.success) {
          res.setHeader('Retry-After', Math.ceil((result.resetAt - Date.now()) / 1000));
          return res.status(429).json({
            error: 'Too many requests',
            retryAfter: result.resetAt
          });
        }

        next();
      } catch (error) {
        console.error('Rate limit middleware error:', error);
        next(); // Don't block on errors
      }
    };
  }

  createIPRateLimiter(options) {
    if (!options || !options.limit || !options.window) {
      throw new Error('Options with limit and window are required');
    }

    // Create or update rule
    const ruleName = `ip-limit-${options.limit}-${options.window}`;
    this.setRule(ruleName, options);

    return this.createRateLimitMiddleware(ruleName, (req) => {
      // Extract IP from various sources
      return req.ip || 
             req.connection.remoteAddress || 
             req.socket.remoteAddress ||
             req.connection.socket.remoteAddress;
    });
  }

  createUserRateLimiter(options) {
    if (!options || !options.limit || !options.window) {
      throw new Error('Options with limit and window are required');
    }

    const ruleName = `user-limit-${options.limit}-${options.window}`;
    this.setRule(ruleName, options);

    const keyGenerator = options.keyGenerator || ((req) => {
      // Default: use authenticated user ID
      return req.user && req.user.userId;
    });

    return this.createRateLimitMiddleware(ruleName, keyGenerator);
  }

  // Helper methods
  isBlocked(identifier, rule) {
    const key = `${identifier}:${rule}`;
    const blockExpiry = this.blocked.get(key);
    
    if (!blockExpiry) {
      return false;
    }

    if (Date.now() > blockExpiry) {
      this.blocked.delete(key);
      return false;
    }

    return true;
  }

  blockIdentifier(identifier, rule, duration) {
    const key = `${identifier}:${rule}`;
    const expiry = Date.now() + duration;
    this.blocked.set(key, expiry);
  }

  // Cleanup expired entries (should be called periodically)
  cleanup() {
    const now = Date.now();
    
    // Clean up blocked entries
    for (const [key, expiry] of this.blocked.entries()) {
      if (now > expiry) {
        this.blocked.delete(key);
      }
    }

    // Clean up memory store
    for (const [key, record] of this.memoryStore.entries()) {
      const rule = key.split(':')[1];
      const ruleConfig = this.rules.get(rule);
      
      if (ruleConfig) {
        const windowStart = now - ruleConfig.window;
        record.tokens = record.tokens.filter(timestamp => timestamp > windowStart);
        
        if (record.tokens.length === 0) {
          this.memoryStore.delete(key);
        }
      }
    }
  }
}

module.exports = RateLimiter;