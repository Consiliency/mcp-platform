/**
 * User-based Rate Limiting Strategy
 * Implements rate limiting based on authenticated user IDs
 * 
 * @module security/rate-limiting/user-limiter
 */

class UserRateLimiter {
  constructor(options = {}) {
    this.options = {
      storage: options.storage || 'memory',
      redis: options.redis,
      keyPrefix: options.keyPrefix || 'user-ratelimit:',
      ...options
    };

    // In-memory storage
    this.memoryStore = new Map();

    // User tiers with different rate limits
    this.tiers = {
      free: {
        'api-calls': { limit: 100, window: 3600000 }, // 100 per hour
        'uploads': { limit: 5, window: 3600000 }, // 5 per hour
        'exports': { limit: 10, window: 86400000 }, // 10 per day
        'webhooks': { limit: 10, window: 3600000 } // 10 per hour
      },
      basic: {
        'api-calls': { limit: 1000, window: 3600000 }, // 1000 per hour
        'uploads': { limit: 50, window: 3600000 }, // 50 per hour
        'exports': { limit: 100, window: 86400000 }, // 100 per day
        'webhooks': { limit: 100, window: 3600000 } // 100 per hour
      },
      premium: {
        'api-calls': { limit: 10000, window: 3600000 }, // 10000 per hour
        'uploads': { limit: 500, window: 3600000 }, // 500 per hour
        'exports': { limit: 1000, window: 86400000 }, // 1000 per day
        'webhooks': { limit: 1000, window: 3600000 } // 1000 per hour
      },
      enterprise: {
        'api-calls': { limit: -1, window: 3600000 }, // Unlimited
        'uploads': { limit: -1, window: 3600000 }, // Unlimited
        'exports': { limit: -1, window: 86400000 }, // Unlimited
        'webhooks': { limit: -1, window: 3600000 } // Unlimited
      },
      ...options.tiers
    };

    // User tier assignments (in production, fetch from database)
    this.userTiers = new Map(options.userTiers || []);
    
    // Track user violations
    this.violations = new Map();
  }

  /**
   * Get user tier
   */
  getUserTier(userId) {
    return this.userTiers.get(userId) || 'free';
  }

  /**
   * Set user tier
   */
  setUserTier(userId, tier) {
    if (!this.tiers[tier]) {
      throw new Error(`Unknown tier: ${tier}`);
    }
    this.userTiers.set(userId, tier);
    return { success: true, tier };
  }

  /**
   * Get rate limit for user and resource
   */
  getRateLimitForUser(userId, resource) {
    const tier = this.getUserTier(userId);
    const tierLimits = this.tiers[tier];
    
    if (!tierLimits || !tierLimits[resource]) {
      // Default to free tier if resource not found
      return this.tiers.free[resource] || { limit: 50, window: 3600000 };
    }

    return tierLimits[resource];
  }

  /**
   * Build storage key
   */
  buildKey(userId, resource) {
    return `${this.options.keyPrefix}${userId}:${resource}`;
  }

  /**
   * Check rate limit for user
   */
  async checkLimit(userId, resource) {
    if (!userId || !resource) {
      throw new Error('userId and resource are required');
    }

    const rateLimit = this.getRateLimitForUser(userId, resource);
    
    // Unlimited tier
    if (rateLimit.limit === -1) {
      return {
        allowed: true,
        remaining: Infinity,
        limit: 'unlimited',
        resetAt: null,
        tier: this.getUserTier(userId)
      };
    }

    const key = this.buildKey(userId, resource);
    const now = Date.now();
    const windowStart = now - rateLimit.window;

    if (this.options.storage === 'memory') {
      const record = this.memoryStore.get(key) || { requests: [] };
      
      // Remove expired requests
      record.requests = record.requests.filter(timestamp => timestamp > windowStart);
      
      const used = record.requests.length;
      const allowed = used < rateLimit.limit;
      const remaining = Math.max(0, rateLimit.limit - used);
      
      let resetAt;
      if (record.requests.length > 0) {
        resetAt = new Date(Math.min(...record.requests) + rateLimit.window);
      } else {
        resetAt = new Date(now + rateLimit.window);
      }

      return {
        allowed,
        remaining,
        limit: rateLimit.limit,
        resetAt,
        used,
        tier: this.getUserTier(userId)
      };
    }

    // Redis implementation would use the redis client
    if (this.options.storage === 'redis' && this.options.redis) {
      // Similar logic but using Redis commands
      throw new Error('Redis storage not implemented in this example');
    }

    throw new Error('Invalid storage configuration');
  }

  /**
   * Consume tokens for user
   */
  async consumeToken(userId, resource, tokens = 1) {
    if (!userId || !resource) {
      throw new Error('userId and resource are required');
    }

    const rateLimit = this.getRateLimitForUser(userId, resource);
    
    // Unlimited tier
    if (rateLimit.limit === -1) {
      return {
        success: true,
        remaining: Infinity,
        resetAt: null,
        tier: this.getUserTier(userId)
      };
    }

    const key = this.buildKey(userId, resource);
    const now = Date.now();
    const windowStart = now - rateLimit.window;

    if (this.options.storage === 'memory') {
      const record = this.memoryStore.get(key) || { requests: [] };
      
      // Remove expired requests
      record.requests = record.requests.filter(timestamp => timestamp > windowStart);
      
      // Check if we can consume tokens
      if (record.requests.length + tokens > rateLimit.limit) {
        // Track violation
        this.trackViolation(userId, resource);
        
        return {
          success: false,
          remaining: Math.max(0, rateLimit.limit - record.requests.length),
          resetAt: new Date(Math.min(...record.requests, now) + rateLimit.window),
          tier: this.getUserTier(userId)
        };
      }
      
      // Consume tokens
      for (let i = 0; i < tokens; i++) {
        record.requests.push(now);
      }
      
      this.memoryStore.set(key, record);
      
      return {
        success: true,
        remaining: Math.max(0, rateLimit.limit - record.requests.length),
        resetAt: new Date(Math.min(...record.requests) + rateLimit.window),
        tier: this.getUserTier(userId)
      };
    }

    throw new Error('Invalid storage configuration');
  }

  /**
   * Track rate limit violations
   */
  trackViolation(userId, resource) {
    const key = `${userId}:${resource}`;
    const violations = this.violations.get(key) || {
      count: 0,
      firstViolation: Date.now(),
      lastViolation: Date.now()
    };

    violations.count++;
    violations.lastViolation = Date.now();
    
    this.violations.set(key, violations);

    // Emit event for monitoring
    if (this.options.onViolation) {
      this.options.onViolation({
        userId,
        resource,
        violations: violations.count,
        tier: this.getUserTier(userId)
      });
    }
  }

  /**
   * Get user violations
   */
  getUserViolations(userId) {
    const userViolations = {};
    
    for (const [key, violations] of this.violations.entries()) {
      if (key.startsWith(`${userId}:`)) {
        const resource = key.replace(`${userId}:`, '');
        userViolations[resource] = violations;
      }
    }

    return userViolations;
  }

  /**
   * Reset rate limit for user
   */
  async resetLimit(userId, resource) {
    if (!userId) {
      throw new Error('userId is required');
    }

    if (resource) {
      // Reset specific resource
      const key = this.buildKey(userId, resource);
      if (this.options.storage === 'memory') {
        this.memoryStore.delete(key);
      }
      this.violations.delete(`${userId}:${resource}`);
    } else {
      // Reset all resources for user
      if (this.options.storage === 'memory') {
        for (const key of this.memoryStore.keys()) {
          if (key.startsWith(`${this.options.keyPrefix}${userId}:`)) {
            this.memoryStore.delete(key);
          }
        }
      }
      
      // Clear violations
      for (const key of this.violations.keys()) {
        if (key.startsWith(`${userId}:`)) {
          this.violations.delete(key);
        }
      }
    }

    return { success: true };
  }

  /**
   * Get user usage statistics
   */
  async getUserStats(userId) {
    const tier = this.getUserTier(userId);
    const tierLimits = this.tiers[tier];
    const stats = {
      userId,
      tier,
      resources: {},
      violations: this.getUserViolations(userId)
    };

    // Get usage for each resource
    for (const [resource, limits] of Object.entries(tierLimits)) {
      const usage = await this.checkLimit(userId, resource);
      stats.resources[resource] = {
        used: usage.used || 0,
        limit: usage.limit,
        remaining: usage.remaining,
        percentage: usage.limit === 'unlimited' ? 0 : ((usage.used || 0) / usage.limit) * 100,
        resetAt: usage.resetAt
      };
    }

    return stats;
  }

  /**
   * Create user-based rate limiting middleware
   */
  createMiddleware(resource, options = {}) {
    if (!resource) {
      throw new Error('Resource name is required');
    }

    const getUserId = options.getUserId || ((req) => req.user?.userId || req.user?.id);
    const skipOnError = options.skipOnError !== false;

    return async (req, res, next) => {
      try {
        const userId = getUserId(req);
        
        // Skip if no user ID found
        if (!userId) {
          if (options.requireAuth) {
            return res.status(401).json({ error: 'Authentication required' });
          }
          return next();
        }

        // Consume a token
        const result = await this.consumeToken(userId, resource);
        
        // Add rate limit info to request
        req.rateLimitInfo = {
          userId,
          resource,
          ...result
        };

        // Set rate limit headers
        if (result.limit !== 'unlimited') {
          res.setHeader('X-RateLimit-Limit', result.limit);
          res.setHeader('X-RateLimit-Remaining', result.remaining);
          if (result.resetAt) {
            res.setHeader('X-RateLimit-Reset', result.resetAt.toISOString());
          }
        }
        res.setHeader('X-RateLimit-Tier', result.tier);

        if (!result.success) {
          res.setHeader('Retry-After', Math.ceil((result.resetAt - Date.now()) / 1000));
          
          return res.status(429).json({
            error: 'Rate limit exceeded',
            resource,
            tier: result.tier,
            retryAfter: result.resetAt,
            upgradeUrl: options.upgradeUrl || '/pricing'
          });
        }

        next();
      } catch (error) {
        console.error('User rate limit middleware error:', error);
        
        if (skipOnError) {
          next();
        } else {
          res.status(500).json({ error: 'Rate limiting error' });
        }
      }
    };
  }

  /**
   * Create tiered middleware that adjusts limits based on user tier
   */
  createTieredMiddleware(resourceMapping) {
    return async (req, res, next) => {
      try {
        const userId = req.user?.userId || req.user?.id;
        if (!userId) {
          return next();
        }

        // Determine resource based on endpoint
        let resource = 'api-calls'; // default
        
        for (const [pattern, resourceName] of Object.entries(resourceMapping)) {
          if (req.path.match(pattern)) {
            resource = resourceName;
            break;
          }
        }

        // Apply rate limiting
        const middleware = this.createMiddleware(resource);
        return middleware(req, res, next);
      } catch (error) {
        console.error('Tiered rate limit error:', error);
        next();
      }
    };
  }

  /**
   * Get tier comparison
   */
  getTierComparison() {
    const comparison = {};
    
    for (const [tierName, limits] of Object.entries(this.tiers)) {
      comparison[tierName] = {};
      
      for (const [resource, limit] of Object.entries(limits)) {
        comparison[tierName][resource] = {
          limit: limit.limit === -1 ? 'Unlimited' : limit.limit,
          window: this.formatWindow(limit.window)
        };
      }
    }

    return comparison;
  }

  /**
   * Format time window for display
   */
  formatWindow(ms) {
    const seconds = ms / 1000;
    const minutes = seconds / 60;
    const hours = minutes / 60;
    const days = hours / 24;

    if (days >= 1) {
      return `${days} day${days > 1 ? 's' : ''}`;
    }
    if (hours >= 1) {
      return `${hours} hour${hours > 1 ? 's' : ''}`;
    }
    if (minutes >= 1) {
      return `${minutes} minute${minutes > 1 ? 's' : ''}`;
    }
    return `${seconds} second${seconds > 1 ? 's' : ''}`;
  }

  /**
   * Clean up old data
   */
  cleanup() {
    const now = Date.now();
    
    // Clean up old violation records (older than 30 days)
    for (const [key, violation] of this.violations.entries()) {
      if (now - violation.lastViolation > 2592000000) { // 30 days
        this.violations.delete(key);
      }
    }

    // Clean up expired rate limit data
    if (this.options.storage === 'memory') {
      for (const [key, record] of this.memoryStore.entries()) {
        // Extract resource to get window
        const parts = key.split(':');
        if (parts.length >= 2) {
          const userId = parts[0].replace(this.options.keyPrefix, '');
          const resource = parts[1];
          const rateLimit = this.getRateLimitForUser(userId, resource);
          
          if (rateLimit.limit !== -1) {
            const windowStart = now - rateLimit.window;
            record.requests = record.requests.filter(ts => ts > windowStart);
            
            if (record.requests.length === 0) {
              this.memoryStore.delete(key);
            }
          }
        }
      }
    }

    return { success: true };
  }
}

module.exports = UserRateLimiter;