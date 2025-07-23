/**
 * Redis-based Rate Limiter
 * Provides distributed rate limiting using Redis
 * 
 * @module security/rate-limiting/redis-limiter
 */

const crypto = require('crypto');

class RedisRateLimiter {
  constructor(redisClient, options = {}) {
    if (!redisClient) {
      throw new Error('Redis client is required');
    }

    this.redis = redisClient;
    this.options = {
      keyPrefix: options.keyPrefix || 'ratelimit:',
      defaultTTL: options.defaultTTL || 3600, // 1 hour
      ...options
    };

    // Default rate limit rules
    this.rules = new Map([
      ['api-calls', { limit: 100, window: 3600000 }], // 100 per hour
      ['auth-attempts', { limit: 5, window: 900000, blockDuration: 3600000 }], // 5 per 15 min
      ['uploads', { limit: 10, window: 3600000 }], // 10 per hour
      ['webhooks', { limit: 50, window: 60000 }] // 50 per minute
    ]);

    // Merge custom rules
    if (options.rules) {
      Object.entries(options.rules).forEach(([name, config]) => {
        this.rules.set(name, config);
      });
    }
  }

  /**
   * Build Redis key
   */
  buildKey(identifier, rule) {
    return `${this.options.keyPrefix}${rule}:${identifier}`;
  }

  /**
   * Check rate limit using sliding window algorithm
   */
  async checkLimit(identifier, rule) {
    if (!identifier || !rule) {
      throw new Error('Identifier and rule are required');
    }

    const ruleConfig = this.rules.get(rule);
    if (!ruleConfig) {
      throw new Error(`Rule '${rule}' not found`);
    }

    const key = this.buildKey(identifier, rule);
    const now = Date.now();
    const windowStart = now - ruleConfig.window;

    try {
      // Use Redis pipeline for atomic operations
      const pipeline = this.redis.pipeline();
      
      // Remove old entries
      pipeline.zremrangebyscore(key, '-inf', windowStart);
      
      // Count current entries
      pipeline.zcard(key);
      
      // Get the oldest entry
      pipeline.zrange(key, 0, 0, 'WITHSCORES');
      
      // Execute pipeline
      const results = await pipeline.exec();
      
      if (!results || results.some(r => r[0])) {
        throw new Error('Redis pipeline error');
      }

      const count = results[1][1];
      const oldestEntry = results[2][1];

      // Check if blocked
      const blockKey = `${key}:blocked`;
      const isBlocked = await this.redis.get(blockKey);
      
      if (isBlocked) {
        const blockExpiry = parseInt(isBlocked);
        return {
          allowed: false,
          remaining: 0,
          resetAt: new Date(blockExpiry),
          limit: ruleConfig.limit,
          blocked: true
        };
      }

      const allowed = count < ruleConfig.limit;
      const remaining = Math.max(0, ruleConfig.limit - count);
      
      // Calculate reset time
      let resetAt;
      if (oldestEntry && oldestEntry.length > 0) {
        resetAt = new Date(parseInt(oldestEntry[1]) + ruleConfig.window);
      } else {
        resetAt = new Date(now + ruleConfig.window);
      }

      return {
        allowed,
        remaining,
        resetAt,
        limit: ruleConfig.limit,
        blocked: false
      };
    } catch (error) {
      console.error('Redis rate limit check error:', error);
      // Fail open - allow request on Redis errors
      return {
        allowed: true,
        remaining: ruleConfig.limit,
        resetAt: new Date(now + ruleConfig.window),
        limit: ruleConfig.limit,
        error: error.message
      };
    }
  }

  /**
   * Consume tokens from rate limit
   */
  async consumeToken(identifier, rule, tokens = 1) {
    if (!identifier || !rule) {
      throw new Error('Identifier and rule are required');
    }

    const ruleConfig = this.rules.get(rule);
    if (!ruleConfig) {
      throw new Error(`Rule '${rule}' not found`);
    }

    const key = this.buildKey(identifier, rule);
    const now = Date.now();
    const windowStart = now - ruleConfig.window;

    try {
      // Check if blocked
      const blockKey = `${key}:blocked`;
      const isBlocked = await this.redis.get(blockKey);
      
      if (isBlocked) {
        const blockExpiry = parseInt(isBlocked);
        return {
          success: false,
          remaining: 0,
          resetAt: new Date(blockExpiry),
          blocked: true
        };
      }

      // Use Lua script for atomic operation
      const luaScript = `
        local key = KEYS[1]
        local now = tonumber(ARGV[1])
        local window = tonumber(ARGV[2])
        local limit = tonumber(ARGV[3])
        local tokens = tonumber(ARGV[4])
        local ttl = tonumber(ARGV[5])
        
        local windowStart = now - window
        
        -- Remove old entries
        redis.call('zremrangebyscore', key, '-inf', windowStart)
        
        -- Count current entries
        local count = redis.call('zcard', key)
        
        -- Check if we can consume tokens
        if count + tokens > limit then
          return {0, count, limit - count}
        end
        
        -- Add new entries
        for i = 1, tokens do
          redis.call('zadd', key, now, now .. ':' .. i .. ':' .. math.random())
        end
        
        -- Set TTL
        redis.call('expire', key, ttl)
        
        -- Get new count
        local newCount = redis.call('zcard', key)
        
        return {1, newCount, limit - newCount}
      `;

      const result = await this.redis.eval(
        luaScript,
        1,
        key,
        now,
        ruleConfig.window,
        ruleConfig.limit,
        tokens,
        Math.ceil(ruleConfig.window / 1000)
      );

      const success = result[0] === 1;
      const count = result[1];
      const remaining = result[2];

      // If failed and blockDuration is set, block the identifier
      if (!success && ruleConfig.blockDuration) {
        const blockExpiry = now + ruleConfig.blockDuration;
        await this.redis.setex(
          blockKey,
          Math.ceil(ruleConfig.blockDuration / 1000),
          blockExpiry
        );
        
        return {
          success: false,
          remaining: 0,
          resetAt: new Date(blockExpiry),
          blocked: true
        };
      }

      // Calculate reset time
      const oldestEntry = await this.redis.zrange(key, 0, 0, 'WITHSCORES');
      let resetAt;
      if (oldestEntry && oldestEntry.length > 0) {
        resetAt = new Date(parseInt(oldestEntry[1]) + ruleConfig.window);
      } else {
        resetAt = new Date(now + ruleConfig.window);
      }

      return {
        success,
        remaining,
        resetAt,
        count
      };
    } catch (error) {
      console.error('Redis consume token error:', error);
      // Fail open on Redis errors
      return {
        success: true,
        remaining: ruleConfig.limit,
        resetAt: new Date(now + ruleConfig.window),
        error: error.message
      };
    }
  }

  /**
   * Reset rate limit for an identifier
   */
  async resetLimit(identifier, rule) {
    if (!identifier || !rule) {
      throw new Error('Identifier and rule are required');
    }

    const key = this.buildKey(identifier, rule);
    const blockKey = `${key}:blocked`;

    try {
      await this.redis.del(key, blockKey);
      return { success: true };
    } catch (error) {
      console.error('Redis reset limit error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get current usage for an identifier
   */
  async getUsage(identifier, rule) {
    if (!identifier || !rule) {
      throw new Error('Identifier and rule are required');
    }

    const ruleConfig = this.rules.get(rule);
    if (!ruleConfig) {
      throw new Error(`Rule '${rule}' not found`);
    }

    const key = this.buildKey(identifier, rule);
    const now = Date.now();
    const windowStart = now - ruleConfig.window;

    try {
      // Remove old entries and get count
      await this.redis.zremrangebyscore(key, '-inf', windowStart);
      const count = await this.redis.zcard(key);
      
      // Check if blocked
      const blockKey = `${key}:blocked`;
      const blockExpiry = await this.redis.get(blockKey);

      return {
        used: count,
        limit: ruleConfig.limit,
        remaining: Math.max(0, ruleConfig.limit - count),
        percentage: (count / ruleConfig.limit) * 100,
        blocked: !!blockExpiry,
        blockExpiry: blockExpiry ? new Date(parseInt(blockExpiry)) : null
      };
    } catch (error) {
      console.error('Redis get usage error:', error);
      return {
        used: 0,
        limit: ruleConfig.limit,
        remaining: ruleConfig.limit,
        percentage: 0,
        error: error.message
      };
    }
  }

  /**
   * Set or update a rate limit rule
   */
  async setRule(ruleName, config) {
    if (!ruleName || !config) {
      throw new Error('Rule name and config are required');
    }

    if (!config.limit || !config.window) {
      throw new Error('Rule config must include limit and window');
    }

    this.rules.set(ruleName, {
      limit: config.limit,
      window: config.window,
      blockDuration: config.blockDuration
    });

    return { success: true };
  }

  /**
   * Get all rules
   */
  getRules() {
    const rules = {};
    for (const [name, config] of this.rules.entries()) {
      rules[name] = { ...config };
    }
    return rules;
  }

  /**
   * Create rate limit middleware
   */
  createMiddleware(ruleName, identifierFn) {
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
        const ruleConfig = this.rules.get(ruleName);
        res.setHeader('X-RateLimit-Limit', ruleConfig.limit);
        res.setHeader('X-RateLimit-Remaining', result.remaining);
        res.setHeader('X-RateLimit-Reset', result.resetAt.toISOString());

        if (!result.success) {
          res.setHeader('Retry-After', Math.ceil((result.resetAt - Date.now()) / 1000));
          
          const message = result.blocked 
            ? 'Too many requests - you have been temporarily blocked'
            : 'Too many requests';
            
          return res.status(429).json({
            error: message,
            retryAfter: result.resetAt,
            blocked: result.blocked
          });
        }

        next();
      } catch (error) {
        console.error('Rate limit middleware error:', error);
        next(); // Fail open
      }
    };
  }

  /**
   * Get statistics for a rule
   */
  async getStats(rule, options = {}) {
    const ruleConfig = this.rules.get(rule);
    if (!ruleConfig) {
      throw new Error(`Rule '${rule}' not found`);
    }

    const pattern = `${this.options.keyPrefix}${rule}:*`;
    const stats = {
      rule,
      limit: ruleConfig.limit,
      window: ruleConfig.window,
      totalIdentifiers: 0,
      blockedIdentifiers: 0,
      averageUsage: 0,
      topUsers: []
    };

    try {
      // Get all keys matching the pattern
      const keys = await this.scanKeys(pattern);
      stats.totalIdentifiers = keys.filter(k => !k.endsWith(':blocked')).length;
      stats.blockedIdentifiers = keys.filter(k => k.endsWith(':blocked')).length;

      // Get usage for each identifier
      const usages = [];
      const limit = options.topUsersLimit || 10;

      for (const key of keys) {
        if (key.endsWith(':blocked')) continue;

        const identifier = key.replace(`${this.options.keyPrefix}${rule}:`, '');
        const count = await this.redis.zcard(key);
        
        if (count > 0) {
          usages.push({ identifier, count, percentage: (count / ruleConfig.limit) * 100 });
        }
      }

      // Calculate average usage
      if (usages.length > 0) {
        stats.averageUsage = usages.reduce((sum, u) => sum + u.percentage, 0) / usages.length;
      }

      // Get top users
      stats.topUsers = usages
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);

      return stats;
    } catch (error) {
      console.error('Redis get stats error:', error);
      return { ...stats, error: error.message };
    }
  }

  /**
   * Scan Redis keys matching a pattern
   */
  async scanKeys(pattern, count = 100) {
    const keys = [];
    let cursor = '0';

    do {
      const result = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', count);
      cursor = result[0];
      keys.push(...result[1]);
    } while (cursor !== '0');

    return keys;
  }

  /**
   * Clean up expired entries
   */
  async cleanup() {
    try {
      const pattern = `${this.options.keyPrefix}*`;
      const keys = await this.scanKeys(pattern);
      let cleaned = 0;

      for (const key of keys) {
        if (key.endsWith(':blocked')) continue;

        const ttl = await this.redis.ttl(key);
        if (ttl === -1) {
          // No TTL set, set default TTL
          await this.redis.expire(key, this.options.defaultTTL);
          cleaned++;
        }
      }

      return { success: true, cleaned };
    } catch (error) {
      console.error('Redis cleanup error:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = RedisRateLimiter;