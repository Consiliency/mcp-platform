// Contract: Rate Limiter
// Purpose: Define the rate limiting interface for API protection
// Team responsible: Security API Team

class RateLimiterInterface {
  constructor(config) {
    // config: { redis?: RedisClient, defaultLimits: object, storage: 'memory'|'redis' }
    throw new Error('Not implemented - Security API team will implement');
  }

  // Rate limiting operations
  async checkLimit(identifier, rule) {
    // identifier: string (IP, userId, apiKey), rule: string (e.g., 'api-calls', 'auth-attempts')
    // returns: { allowed: boolean, remaining: number, resetAt: Date, limit: number }
    throw new Error('Not implemented - Security API team will implement');
  }

  async consumeToken(identifier, rule, tokens = 1) {
    // identifier: string, rule: string, tokens: number
    // returns: { success: boolean, remaining: number, resetAt: Date }
    throw new Error('Not implemented - Security API team will implement');
  }

  async resetLimit(identifier, rule) {
    // identifier: string, rule: string
    // returns: { success: boolean }
    throw new Error('Not implemented - Security API team will implement');
  }

  // Rule management
  async setRule(ruleName, config) {
    // ruleName: string, config: { limit: number, window: number, blockDuration?: number }
    // returns: { success: boolean }
    throw new Error('Not implemented - Security API team will implement');
  }

  async getRule(ruleName) {
    // ruleName: string
    // returns: { limit: number, window: number, blockDuration?: number }
    throw new Error('Not implemented - Security API team will implement');
  }

  // Middleware factory
  createRateLimitMiddleware(ruleName, identifierFn) {
    // ruleName: string, identifierFn: (req) => string
    // returns: Express/Koa middleware function
    throw new Error('Not implemented - Security API team will implement');
  }

  // IP-based rate limiting
  createIPRateLimiter(options) {
    // options: { limit: number, window: number, skipFailedRequests?: boolean }
    // returns: Express/Koa middleware function
    throw new Error('Not implemented - Security API team will implement');
  }

  // User-based rate limiting
  createUserRateLimiter(options) {
    // options: { limit: number, window: number, keyGenerator?: (req) => string }
    // returns: Express/Koa middleware function
    throw new Error('Not implemented - Security API team will implement');
  }
}

module.exports = RateLimiterInterface;