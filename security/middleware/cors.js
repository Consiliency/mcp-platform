/**
 * CORS Middleware
 * TODO: Implement CORS handling for API security
 * 
 * @module security/middleware/cors
 * @assigned-to Security API Team
 * 
 * Requirements:
 * - Configure allowed origins based on environment
 * - Handle preflight requests
 * - Support credentials in CORS requests
 * - Integrate with rate limiting
 */

class CORSMiddleware {
  constructor(options = {}) {
    this.options = {
      allowedOrigins: options.allowedOrigins || ['*'],
      allowedMethods: options.allowedMethods || ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: options.allowedHeaders || ['Content-Type', 'Authorization', 'X-API-Key'],
      exposedHeaders: options.exposedHeaders || [],
      allowCredentials: options.allowCredentials !== undefined ? options.allowCredentials : true,
      maxAge: options.maxAge || 86400,
      preflightContinue: options.preflightContinue || false,
      optionsSuccessStatus: options.optionsSuccessStatus || 204
    };
  }

  handle() {
    return (req, res, next) => {
      const origin = req.headers.origin || req.headers.referer;
      
      // Handle preflight requests
      if (req.method === 'OPTIONS') {
        return this.handlePreflight(req, res, next);
      }

      // Set CORS headers for actual requests
      if (origin && this.isOriginAllowed(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        
        if (this.options.allowCredentials) {
          res.setHeader('Access-Control-Allow-Credentials', 'true');
        }
        
        if (this.options.exposedHeaders.length > 0) {
          res.setHeader('Access-Control-Expose-Headers', this.options.exposedHeaders.join(', '));
        }
      } else if (this.options.allowedOrigins.includes('*') && !this.options.allowCredentials) {
        // Only allow wildcard if credentials are not allowed
        res.setHeader('Access-Control-Allow-Origin', '*');
      }

      next();
    };
  }

  isOriginAllowed(origin) {
    if (!origin) return false;
    
    // Check for wildcard
    if (this.options.allowedOrigins.includes('*')) {
      return true;
    }
    
    // Check exact match
    if (this.options.allowedOrigins.includes(origin)) {
      return true;
    }
    
    // Check for regex patterns
    return this.options.allowedOrigins.some(allowed => {
      if (allowed instanceof RegExp) {
        return allowed.test(origin);
      }
      
      // Support wildcard subdomains (e.g., *.example.com)
      if (typeof allowed === 'string' && allowed.startsWith('*.')) {
        const domain = allowed.substring(2);
        return origin.endsWith(domain) || origin === `https://${domain}` || origin === `http://${domain}`;
      }
      
      return false;
    });
  }

  handlePreflight(req, res, next) {
    const origin = req.headers.origin;
    
    if (origin && this.isOriginAllowed(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      
      if (this.options.allowCredentials) {
        res.setHeader('Access-Control-Allow-Credentials', 'true');
      }
    } else if (this.options.allowedOrigins.includes('*') && !this.options.allowCredentials) {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
    
    // Set allowed methods
    const requestedMethod = req.headers['access-control-request-method'];
    if (requestedMethod && this.options.allowedMethods.includes(requestedMethod)) {
      res.setHeader('Access-Control-Allow-Methods', this.options.allowedMethods.join(', '));
    }
    
    // Set allowed headers
    const requestedHeaders = req.headers['access-control-request-headers'];
    if (requestedHeaders) {
      const headers = requestedHeaders.split(',').map(h => h.trim().toLowerCase());
      const allowedLower = this.options.allowedHeaders.map(h => h.toLowerCase());
      
      if (headers.every(h => allowedLower.includes(h))) {
        res.setHeader('Access-Control-Allow-Headers', this.options.allowedHeaders.join(', '));
      }
    } else {
      res.setHeader('Access-Control-Allow-Headers', this.options.allowedHeaders.join(', '));
    }
    
    // Set max age
    res.setHeader('Access-Control-Max-Age', this.options.maxAge.toString());
    
    if (this.options.preflightContinue) {
      next();
    } else {
      res.statusCode = this.options.optionsSuccessStatus;
      res.end();
    }
  }
}

module.exports = CORSMiddleware;