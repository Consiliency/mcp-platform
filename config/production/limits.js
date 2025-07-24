/**
 * Production Limits Configuration
 * Defines rate limits, quotas, and resource constraints
 */

// Helper to parse time strings (e.g., "1h", "30m", "60s") to milliseconds
function parseTimeToMs(timeStr) {
  const match = timeStr.match(/^(\d+)([smhd])$/);
  if (!match) {
    throw new Error(`Invalid time format: ${timeStr}`);
  }
  
  const value = parseInt(match[1], 10);
  const unit = match[2];
  
  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  
  return value * multipliers[unit];
}

// Helper to parse size strings (e.g., "10MB", "1GB") to bytes
function parseSizeToBytes(sizeStr) {
  const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*([KMGT]?B)$/i);
  if (!match) {
    throw new Error(`Invalid size format: ${sizeStr}`);
  }
  
  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  
  const multipliers = {
    B: 1,
    KB: 1024,
    MB: 1024 * 1024,
    GB: 1024 * 1024 * 1024,
    TB: 1024 * 1024 * 1024 * 1024,
  };
  
  return Math.floor(value * multipliers[unit]);
}

// Production limits configuration
const limits = {
  // API Rate Limiting
  rateLimit: {
    // Global rate limits
    global: {
      windowMs: parseTimeToMs(process.env.RATE_LIMIT_WINDOW || '15m'),
      maxRequests: parseInt(process.env.RATE_LIMIT_MAX || '1000', 10),
      message: 'Too many requests, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
    },
    
    // Per-endpoint rate limits
    endpoints: {
      // Authentication endpoints (stricter limits)
      '/auth/login': {
        windowMs: parseTimeToMs('15m'),
        maxRequests: 5,
        skipSuccessfulRequests: false,
      },
      '/auth/register': {
        windowMs: parseTimeToMs('1h'),
        maxRequests: 3,
      },
      '/auth/reset-password': {
        windowMs: parseTimeToMs('1h'),
        maxRequests: 3,
      },
      
      // API endpoints
      '/api/*': {
        windowMs: parseTimeToMs('1m'),
        maxRequests: 100,
      },
      '/api/*/create': {
        windowMs: parseTimeToMs('1m'),
        maxRequests: 10,
      },
      '/api/*/update': {
        windowMs: parseTimeToMs('1m'),
        maxRequests: 20,
      },
      '/api/*/delete': {
        windowMs: parseTimeToMs('1m'),
        maxRequests: 10,
      },
      '/api/*/bulk': {
        windowMs: parseTimeToMs('5m'),
        maxRequests: 5,
      },
      
      // Search endpoints
      '/search': {
        windowMs: parseTimeToMs('1m'),
        maxRequests: 30,
      },
      
      // Webhook endpoints
      '/webhooks/*': {
        windowMs: parseTimeToMs('1s'),
        maxRequests: 10,
      },
      
      // Health check (no limit)
      '/health': {
        skip: true,
      },
      '/metrics': {
        skip: true,
      },
    },
    
    // Per-user rate limits (requires authentication)
    perUser: {
      free: {
        windowMs: parseTimeToMs('1h'),
        maxRequests: 1000,
      },
      basic: {
        windowMs: parseTimeToMs('1h'),
        maxRequests: 5000,
      },
      pro: {
        windowMs: parseTimeToMs('1h'),
        maxRequests: 20000,
      },
      enterprise: {
        windowMs: parseTimeToMs('1h'),
        maxRequests: 100000,
      },
    },
  },
  
  // Resource Quotas
  quotas: {
    // Storage quotas per tier
    storage: {
      free: {
        maxStorage: parseSizeToBytes('1GB'),
        maxFileSize: parseSizeToBytes('10MB'),
        maxFiles: 100,
      },
      basic: {
        maxStorage: parseSizeToBytes('10GB'),
        maxFileSize: parseSizeToBytes('100MB'),
        maxFiles: 1000,
      },
      pro: {
        maxStorage: parseSizeToBytes('100GB'),
        maxFileSize: parseSizeToBytes('1GB'),
        maxFiles: 10000,
      },
      enterprise: {
        maxStorage: parseSizeToBytes('1TB'),
        maxFileSize: parseSizeToBytes('10GB'),
        maxFiles: 100000,
      },
    },
    
    // API usage quotas
    api: {
      free: {
        dailyRequests: 1000,
        monthlyRequests: 10000,
        concurrentRequests: 5,
      },
      basic: {
        dailyRequests: 10000,
        monthlyRequests: 100000,
        concurrentRequests: 20,
      },
      pro: {
        dailyRequests: 100000,
        monthlyRequests: 1000000,
        concurrentRequests: 100,
      },
      enterprise: {
        dailyRequests: -1, // Unlimited
        monthlyRequests: -1, // Unlimited
        concurrentRequests: 1000,
      },
    },
    
    // Service quotas
    services: {
      free: {
        maxServices: 3,
        maxInstances: 1,
        maxDomains: 0,
      },
      basic: {
        maxServices: 10,
        maxInstances: 3,
        maxDomains: 1,
      },
      pro: {
        maxServices: 50,
        maxInstances: 10,
        maxDomains: 5,
      },
      enterprise: {
        maxServices: -1, // Unlimited
        maxInstances: -1, // Unlimited
        maxDomains: -1, // Unlimited
      },
    },
  },
  
  // Request Limits
  requests: {
    // Body size limits
    bodySize: {
      json: parseSizeToBytes(process.env.MAX_JSON_SIZE || '10MB'),
      urlencoded: parseSizeToBytes(process.env.MAX_URLENCODED_SIZE || '10MB'),
      multipart: parseSizeToBytes(process.env.MAX_UPLOAD_SIZE || '100MB'),
      raw: parseSizeToBytes(process.env.MAX_RAW_SIZE || '10MB'),
    },
    
    // Query limits
    query: {
      maxLength: 2048,
      maxParams: 100,
      maxDepth: 5, // For nested query params
    },
    
    // Header limits
    headers: {
      maxSize: 8192,
      maxCount: 100,
    },
    
    // Pagination limits
    pagination: {
      defaultLimit: 20,
      maxLimit: 100,
      maxOffset: 10000,
    },
    
    // Timeout limits
    timeouts: {
      request: parseTimeToMs(process.env.REQUEST_TIMEOUT || '30s'),
      upload: parseTimeToMs(process.env.UPLOAD_TIMEOUT || '5m'),
      download: parseTimeToMs(process.env.DOWNLOAD_TIMEOUT || '5m'),
      longPolling: parseTimeToMs('30s'),
      websocket: parseTimeToMs('1h'),
    },
  },
  
  // Connection Limits
  connections: {
    // Maximum concurrent connections
    maxConnections: parseInt(process.env.MAX_CONNECTIONS || '10000', 10),
    
    // Per-IP connection limits
    perIp: {
      maxConnections: 100,
      maxWebsockets: 10,
    },
    
    // Database connection pool
    database: {
      min: parseInt(process.env.DB_POOL_MIN || '2', 10),
      max: parseInt(process.env.DB_POOL_MAX || '20', 10),
      acquireTimeout: parseTimeToMs('30s'),
      idleTimeout: parseTimeToMs('10m'),
    },
    
    // Redis connection pool
    redis: {
      maxConnections: 50,
      minConnections: 5,
      connectTimeout: parseTimeToMs('10s'),
      idleTimeout: parseTimeToMs('30s'),
    },
  },
  
  // Processing Limits
  processing: {
    // CPU limits
    cpu: {
      maxWorkers: parseInt(process.env.MAX_WORKERS || '4', 10),
      maxThreads: parseInt(process.env.MAX_THREADS || '8', 10),
      maxQueueSize: 1000,
    },
    
    // Memory limits
    memory: {
      maxHeapSize: parseSizeToBytes('1GB'),
      maxBufferSize: parseSizeToBytes('100MB'),
      gcThreshold: 0.9, // Trigger GC at 90% memory usage
    },
    
    // Task limits
    tasks: {
      maxConcurrent: 100,
      maxQueued: 1000,
      defaultTimeout: parseTimeToMs('5m'),
      maxRetries: 3,
    },
  },
  
  // Security Limits
  security: {
    // Password requirements
    password: {
      minLength: 8,
      maxLength: 128,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: true,
      maxAttempts: 5,
      lockoutDuration: parseTimeToMs('15m'),
    },
    
    // Session limits
    session: {
      maxSessions: 10,
      maxIdleTime: parseTimeToMs('30m'),
      absoluteTimeout: parseTimeToMs('24h'),
    },
    
    // Token limits
    tokens: {
      maxActiveTokens: 5,
      accessTokenExpiry: parseTimeToMs('1h'),
      refreshTokenExpiry: parseTimeToMs('30d'),
      apiKeyExpiry: parseTimeToMs('365d'),
    },
    
    // IP-based limits
    ip: {
      maxFailedAttempts: 10,
      blockDuration: parseTimeToMs('1h'),
      whitelistSize: 1000,
      blacklistSize: 10000,
    },
  },
};

// Limit validation and utilities
const limitUtils = {
  // Get limit value by path
  getLimit(path) {
    const parts = path.split('.');
    let value = limits;
    
    for (const part of parts) {
      value = value[part];
      if (value === undefined) {
        throw new Error(`Unknown limit: ${path}`);
      }
    }
    
    return value;
  },
  
  // Check if a value exceeds a limit
  checkLimit(path, value) {
    const limit = this.getLimit(path);
    
    if (typeof limit === 'number') {
      return value <= limit || limit === -1; // -1 means unlimited
    }
    
    throw new Error(`Cannot check non-numeric limit: ${path}`);
  },
  
  // Get rate limit config for an endpoint
  getRateLimitConfig(endpoint) {
    // Check exact match first
    if (limits.rateLimit.endpoints[endpoint]) {
      return limits.rateLimit.endpoints[endpoint];
    }
    
    // Check wildcard matches
    for (const [pattern, config] of Object.entries(limits.rateLimit.endpoints)) {
      if (pattern.includes('*')) {
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        if (regex.test(endpoint)) {
          return config;
        }
      }
    }
    
    // Return global default
    return limits.rateLimit.global;
  },
  
  // Get quota for a user tier
  getQuotaForTier(tier, quotaType) {
    const quotas = limits.quotas[quotaType];
    if (!quotas || !quotas[tier]) {
      throw new Error(`Unknown quota: ${quotaType} for tier ${tier}`);
    }
    
    return quotas[tier];
  },
};

module.exports = {
  limits,
  limitUtils,
  parseTimeToMs,
  parseSizeToBytes,
  getLimit: limitUtils.getLimit.bind(limitUtils),
  checkLimit: limitUtils.checkLimit.bind(limitUtils),
  getRateLimitConfig: limitUtils.getRateLimitConfig.bind(limitUtils),
  getQuotaForTier: limitUtils.getQuotaForTier.bind(limitUtils),
};