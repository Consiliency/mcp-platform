// API Authentication
const JWTAuth = require('./api-auth/jwt-auth');
const APIKeyManager = require('./api-auth/api-key');
const { OAuth2Provider, createOAuth2Provider } = require('./api-auth/oauth');
const { TokenRefreshManager, createJWTRefreshManager, createOAuth2RefreshManager } = require('./api-auth/token-refresh');

// Rate Limiting
const RateLimiter = require('./rate-limiting/rate-limiter');
const RedisRateLimiter = require('./rate-limiting/redis-limiter');
const IPRateLimiter = require('./rate-limiting/ip-limiter');
const UserRateLimiter = require('./rate-limiting/user-limiter');

// Security Middleware
const SecurityMiddleware = require('./middleware/security');
const HelmetMiddleware = require('./middleware/helmet');
const XSSProtection = require('./middleware/xss');

// Validation
const InputValidator = require('./validation/input-validator');

module.exports = {
  // API Authentication exports
  JWTAuth,
  APIKeyManager,
  OAuth2Provider,
  TokenRefreshManager,
  
  // Rate Limiting exports
  RateLimiter,
  RedisRateLimiter,
  IPRateLimiter,
  UserRateLimiter,
  
  // Security Middleware exports
  SecurityMiddleware,
  HelmetMiddleware,
  XSSProtection,
  
  // Validation exports
  InputValidator,
  
  // Factory functions for easier instantiation
  createJWTAuth: (config) => new JWTAuth(config),
  createAPIKeyManager: () => new APIKeyManager(),
  createRateLimiter: (config) => new RateLimiter(config),
  createSecurityMiddleware: (options) => new SecurityMiddleware(options),
  
  // New factory functions
  createOAuth2Provider,
  createJWTRefreshManager,
  createOAuth2RefreshManager,
  createRedisRateLimiter: (redisClient, options) => new RedisRateLimiter(redisClient, options),
  createIPRateLimiter: (options) => new IPRateLimiter(options),
  createUserRateLimiter: (options) => new UserRateLimiter(options),
  createHelmetMiddleware: (options) => new HelmetMiddleware(options),
  createXSSProtection: (options) => new XSSProtection(options),
  createInputValidator: (options) => new InputValidator(options),
  
  // Convenience function to apply all security middleware
  applyAllSecurityMiddleware: (app, options = {}) => {
    const security = new SecurityMiddleware(options.security);
    const helmet = new HelmetMiddleware(options.helmet);
    const xss = new XSSProtection(options.xss);
    
    // Apply middleware in order
    app.use(helmet.createMiddleware());
    app.use(...security.apply());
    app.use(xss.createMiddleware());
    
    return {
      security,
      helmet,
      xss
    };
  }
};