/**
 * Production Settings Configuration
 * Core application settings for production deployment
 */

const path = require('path');

// Configuration validation helper
function validateConfig(config, schema) {
  for (const [key, validator] of Object.entries(schema)) {
    const value = config[key];
    if (!validator(value)) {
      throw new Error(`Invalid configuration: ${key} = ${value}`);
    }
  }
  return config;
}

// Validation schemas
const validationSchema = {
  port: (v) => Number.isInteger(v) && v > 0 && v <= 65535,
  host: (v) => typeof v === 'string' && v.length > 0,
  nodeEnv: (v) => ['production', 'staging'].includes(v),
  logLevel: (v) => ['error', 'warn', 'info'].includes(v),
  apiVersion: (v) => /^v\d+$/.test(v),
  maxRequestSize: (v) => typeof v === 'string' && /^\d+[kmg]b$/i.test(v),
  requestTimeout: (v) => Number.isInteger(v) && v > 0,
  corsEnabled: (v) => typeof v === 'boolean',
  compressionEnabled: (v) => typeof v === 'boolean',
  trustProxy: (v) => typeof v === 'boolean' || Number.isInteger(v),
};

// Production settings with sensible defaults
const settings = {
  // Server configuration
  server: {
    port: parseInt(process.env.PORT, 10) || 443,
    host: process.env.API_HOST || '0.0.0.0',
    nodeEnv: process.env.NODE_ENV || 'production',
    trustProxy: process.env.TRUST_PROXY === 'true' || 1,
  },

  // Application metadata
  app: {
    name: process.env.APP_NAME || 'mcp-api',
    version: process.env.APP_VERSION || '1.0.0',
    environment: process.env.APP_ENVIRONMENT || 'production',
    apiVersion: process.env.API_VERSION || 'v1',
  },

  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
    output: process.env.LOG_OUTPUT || 'stdout',
    filePath: process.env.LOG_FILE_PATH || '/var/log/mcp/app.log',
    maxSize: process.env.LOG_MAX_SIZE || '100M',
    maxFiles: parseInt(process.env.LOG_MAX_FILES, 10) || 10,
    includeMetadata: true,
    redactSecrets: true,
  },

  // Request handling
  requests: {
    maxRequestSize: process.env.MAX_REQUEST_SIZE || '10mb',
    requestTimeout: parseInt(process.env.REQUEST_TIMEOUT, 10) || 30000,
    keepAliveTimeout: parseInt(process.env.KEEP_ALIVE_TIMEOUT, 10) || 65000,
    headersTimeout: parseInt(process.env.HEADERS_TIMEOUT, 10) || 60000,
  },

  // Security settings
  security: {
    corsEnabled: process.env.CORS_ENABLED !== 'false',
    corsOrigin: process.env.CORS_ORIGIN 
      ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
      : ['https://app.mcp-platform.com'],
    corsCredentials: process.env.CORS_CREDENTIALS === 'true',
    helmetEnabled: process.env.HELMET_ENABLED !== 'false',
    compressionEnabled: process.env.COMPRESSION_ENABLED !== 'false',
    strictTransportSecurity: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  },

  // Session configuration
  session: {
    secret: process.env.SESSION_SECRET || undefined,
    maxAge: parseInt(process.env.SESSION_MAX_AGE, 10) || 86400000, // 24 hours
    secure: true,
    httpOnly: true,
    sameSite: 'strict',
  },

  // Paths configuration
  paths: {
    root: path.resolve(__dirname, '../..'),
    public: path.resolve(__dirname, '../../public'),
    uploads: process.env.UPLOAD_PATH || '/var/lib/mcp/uploads',
    temp: process.env.TEMP_PATH || '/tmp/mcp',
    logs: process.env.LOG_PATH || '/var/log/mcp',
  },

  // Health check configuration
  healthCheck: {
    enabled: process.env.HEALTH_CHECK_ENABLED !== 'false',
    path: process.env.HEALTH_CHECK_PATH || '/health',
    interval: parseInt(process.env.HEALTH_CHECK_INTERVAL, 10) || 30000,
    timeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT, 10) || 5000,
    includeDetails: process.env.HEALTH_CHECK_DETAILS === 'true',
  },

  // Performance settings
  performance: {
    workerThreads: parseInt(process.env.WORKER_THREADS, 10) || 4,
    clusterEnabled: process.env.CLUSTER_ENABLED === 'true',
    maxConcurrency: parseInt(process.env.MAX_CONCURRENCY, 10) || 100,
    queueSize: parseInt(process.env.QUEUE_SIZE, 10) || 1000,
  },

  // Graceful shutdown
  shutdown: {
    gracefulTimeout: parseInt(process.env.GRACEFUL_TIMEOUT, 10) || 30000,
    forceTimeout: parseInt(process.env.FORCE_TIMEOUT, 10) || 35000,
    drainConnections: process.env.DRAIN_CONNECTIONS !== 'false',
  },

  // Timezone and locale
  localization: {
    timezone: process.env.TZ || 'UTC',
    locale: process.env.LOCALE || 'en-US',
    dateFormat: process.env.DATE_FORMAT || 'ISO',
  },
};

// Validate configuration
try {
  validateConfig({
    port: settings.server.port,
    host: settings.server.host,
    nodeEnv: settings.server.nodeEnv,
    logLevel: settings.logging.level,
    apiVersion: settings.app.apiVersion,
    maxRequestSize: settings.requests.maxRequestSize,
    requestTimeout: settings.requests.requestTimeout,
    corsEnabled: settings.security.corsEnabled,
    compressionEnabled: settings.security.compressionEnabled,
    trustProxy: settings.server.trustProxy,
  }, validationSchema);
} catch (error) {
  console.error('Configuration validation failed:', error.message);
  process.exit(1);
}

module.exports = settings;