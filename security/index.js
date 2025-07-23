const JWTAuth = require('./api-auth/jwt-auth');
const APIKeyManager = require('./api-auth/api-key');
const RateLimiter = require('./rate-limiting/rate-limiter');
const SecurityMiddleware = require('./middleware/security');

module.exports = {
  JWTAuth,
  APIKeyManager,
  RateLimiter,
  SecurityMiddleware,
  
  // Factory functions for easier instantiation
  createJWTAuth: (config) => new JWTAuth(config),
  createAPIKeyManager: () => new APIKeyManager(),
  createRateLimiter: (config) => new RateLimiter(config),
  createSecurityMiddleware: (options) => new SecurityMiddleware(options)
};