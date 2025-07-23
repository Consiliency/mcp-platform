/**
 * Production API Configuration
 * TODO: Complete production API settings
 * 
 * @module config/production/api
 * @assigned-to Security API Team & CI/CD Team
 * 
 * Requirements:
 * - Secure API endpoints
 * - Rate limiting configuration
 * - CORS settings
 * - Authentication providers
 * - TLS/SSL configuration
 */

module.exports = {
  // TODO: API Server Configuration
  server: {
    host: process.env.API_HOST || '0.0.0.0',
    port: process.env.API_PORT || 443,
    protocol: 'https',
    // TODO: Configure TLS
    tls: {
      enabled: true,
      cert: process.env.TLS_CERT_PATH,
      key: process.env.TLS_KEY_PATH,
      ca: process.env.TLS_CA_PATH
    }
  },

  // TODO: Authentication Configuration
  auth: {
    jwt: {
      secret: process.env.JWT_SECRET,
      expiresIn: '1h',
      refreshExpiresIn: '7d',
      algorithm: 'RS256'
    },
    oauth: {
      providers: {
        // TODO: Configure OAuth providers
        github: {
          clientId: process.env.GITHUB_CLIENT_ID,
          clientSecret: process.env.GITHUB_CLIENT_SECRET,
          callbackURL: '/auth/github/callback'
        }
      }
    },
    apiKey: {
      headerName: 'X-API-Key',
      expiresIn: '365d'
    }
  },

  // TODO: Rate Limiting Configuration
  rateLimiting: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP',
    standardHeaders: true,
    legacyHeaders: false,
    // TODO: Configure tier-based limits
    tiers: {
      free: { max: 100 },
      basic: { max: 1000 },
      premium: { max: 10000 },
      enterprise: { max: -1 } // unlimited
    }
  },

  // TODO: CORS Configuration
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || [],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    maxAge: 86400
  },

  // TODO: Security Headers
  security: {
    helmet: {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"]
        }
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      }
    }
  },

  // TODO: API Versioning
  versioning: {
    type: 'header', // 'header', 'url', or 'accept'
    header: 'API-Version',
    default: 'v1',
    versions: ['v1', 'v2']
  }
};