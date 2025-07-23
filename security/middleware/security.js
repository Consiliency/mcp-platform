const helmet = require('helmet');
const crypto = require('crypto');

class SecurityMiddleware {
  constructor(options = {}) {
    this.options = {
      cors: {
        enabled: true,
        origin: options.cors?.origin || '*',
        credentials: options.cors?.credentials || true,
        methods: options.cors?.methods || ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: options.cors?.allowedHeaders || ['Content-Type', 'Authorization', 'X-API-Key'],
        exposedHeaders: options.cors?.exposedHeaders || ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset']
      },
      csrf: {
        enabled: options.csrf?.enabled !== false,
        cookieName: options.csrf?.cookieName || 'csrf-token',
        headerName: options.csrf?.headerName || 'X-CSRF-Token',
        secret: options.csrf?.secret || crypto.randomBytes(32).toString('hex')
      },
      xss: {
        enabled: options.xss?.enabled !== false
      },
      helmet: options.helmet || {}
    };

    // CSRF token storage (in production, use Redis or similar)
    this.csrfTokens = new Map();
  }

  // Main security middleware bundle
  apply() {
    const middlewares = [];

    // Add Helmet for security headers
    middlewares.push(this.helmetMiddleware());

    // Add CORS if enabled
    if (this.options.cors.enabled) {
      middlewares.push(this.corsMiddleware());
    }

    // Add XSS protection
    if (this.options.xss.enabled) {
      middlewares.push(this.xssProtection());
    }

    // Add CSRF protection if enabled
    if (this.options.csrf.enabled) {
      middlewares.push(this.csrfProtection());
    }

    return middlewares;
  }

  // Helmet middleware configuration
  helmetMiddleware() {
    const helmetConfig = {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
          ...this.options.helmet.contentSecurityPolicy?.directives
        }
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
        ...this.options.helmet.hsts
      },
      ...this.options.helmet
    };

    return helmet(helmetConfig);
  }

  // CORS middleware
  corsMiddleware() {
    return (req, res, next) => {
      const origin = req.headers.origin;
      const corsOptions = this.options.cors;

      // Handle origin
      if (corsOptions.origin === '*') {
        res.setHeader('Access-Control-Allow-Origin', '*');
      } else if (typeof corsOptions.origin === 'string') {
        res.setHeader('Access-Control-Allow-Origin', corsOptions.origin);
      } else if (Array.isArray(corsOptions.origin) && corsOptions.origin.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
      } else if (typeof corsOptions.origin === 'function') {
        const allowed = corsOptions.origin(origin);
        if (allowed) {
          res.setHeader('Access-Control-Allow-Origin', origin);
        }
      }

      // Set other CORS headers
      if (corsOptions.credentials) {
        res.setHeader('Access-Control-Allow-Credentials', 'true');
      }

      res.setHeader('Access-Control-Allow-Methods', corsOptions.methods.join(', '));
      res.setHeader('Access-Control-Allow-Headers', corsOptions.allowedHeaders.join(', '));
      
      if (corsOptions.exposedHeaders.length > 0) {
        res.setHeader('Access-Control-Expose-Headers', corsOptions.exposedHeaders.join(', '));
      }

      // Handle preflight
      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
        return res.sendStatus(204);
      }

      next();
    };
  }

  // XSS Protection
  xssProtection() {
    return (req, res, next) => {
      // Sanitize common injection points
      if (req.body) {
        req.body = this.sanitizeObject(req.body);
      }
      
      if (req.query) {
        req.query = this.sanitizeObject(req.query);
      }

      if (req.params) {
        req.params = this.sanitizeObject(req.params);
      }

      // Add XSS protection headers
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('X-Content-Type-Options', 'nosniff');

      next();
    };
  }

  // CSRF Protection
  csrfProtection() {
    return (req, res, next) => {
      // Skip CSRF for safe methods
      if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return next();
      }

      // Skip if explicitly disabled for this route
      if (req.skipCSRF) {
        return next();
      }

      const token = req.headers[this.options.csrf.headerName.toLowerCase()] || 
                   req.body?._csrf ||
                   req.query?._csrf;

      const sessionId = req.sessionID || req.ip; // Use session ID or IP as fallback
      const expectedToken = this.csrfTokens.get(sessionId);

      if (!token || token !== expectedToken) {
        return res.status(403).json({ error: 'Invalid CSRF token' });
      }

      next();
    };
  }

  // Generate CSRF token
  generateCSRFToken(sessionId) {
    const token = crypto.randomBytes(32).toString('hex');
    this.csrfTokens.set(sessionId, token);
    
    // Clean up old tokens periodically
    if (this.csrfTokens.size > 10000) {
      const entries = Array.from(this.csrfTokens.entries());
      this.csrfTokens = new Map(entries.slice(-5000));
    }

    return token;
  }

  // Get CSRF token middleware
  csrfTokenMiddleware() {
    return (req, res, next) => {
      const sessionId = req.sessionID || req.ip;
      let token = this.csrfTokens.get(sessionId);
      
      if (!token) {
        token = this.generateCSRFToken(sessionId);
      }

      // Make token available to views
      res.locals.csrfToken = token;
      
      // Also set as cookie for AJAX requests
      res.cookie(this.options.csrf.cookieName, token, {
        httpOnly: false, // Must be readable by JavaScript
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
      });

      next();
    };
  }

  // Sanitize object to prevent XSS
  sanitizeObject(obj) {
    if (typeof obj !== 'object' || obj === null) {
      return this.sanitizeValue(obj);
    }

    const sanitized = Array.isArray(obj) ? [] : {};
    
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        // Sanitize the key itself
        const sanitizedKey = this.sanitizeValue(key);
        sanitized[sanitizedKey] = this.sanitizeObject(obj[key]);
      }
    }

    return sanitized;
  }

  // Sanitize individual values
  sanitizeValue(value) {
    if (typeof value !== 'string') {
      return value;
    }

    // Basic XSS prevention - encode HTML entities
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }

  // Content-Type validation middleware
  contentTypeValidation(allowedTypes = ['application/json']) {
    return (req, res, next) => {
      // Skip for GET requests
      if (req.method === 'GET' || req.method === 'HEAD') {
        return next();
      }

      const contentType = req.headers['content-type'];
      if (!contentType) {
        return res.status(400).json({ error: 'Content-Type header is required' });
      }

      const isAllowed = allowedTypes.some(type => 
        contentType.toLowerCase().includes(type.toLowerCase())
      );

      if (!isAllowed) {
        return res.status(415).json({ 
          error: 'Unsupported Media Type',
          allowed: allowedTypes 
        });
      }

      next();
    };
  }

  // Request size limiting
  requestSizeLimit(maxSize = '10mb') {
    return (req, res, next) => {
      let size = 0;
      
      req.on('data', (chunk) => {
        size += chunk.length;
        
        if (size > this.parseSize(maxSize)) {
          res.status(413).json({ error: 'Request entity too large' });
          req.connection.destroy();
        }
      });

      next();
    };
  }

  // Parse size string to bytes
  parseSize(size) {
    if (typeof size === 'number') return size;
    
    const units = {
      b: 1,
      kb: 1024,
      mb: 1024 * 1024,
      gb: 1024 * 1024 * 1024
    };

    const match = size.toLowerCase().match(/^(\d+(?:\.\d+)?)\s*([a-z]+)$/);
    if (!match) return parseInt(size, 10);

    const num = parseFloat(match[1]);
    const unit = match[2];
    
    return Math.floor(num * (units[unit] || 1));
  }
}

module.exports = SecurityMiddleware;