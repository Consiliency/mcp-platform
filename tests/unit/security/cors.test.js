const CORSMiddleware = require('../../../security/middleware/cors');

describe('CORSMiddleware', () => {
  let corsMiddleware;
  let req, res, next;

  beforeEach(() => {
    req = {
      headers: {},
      method: 'GET'
    };
    res = {
      setHeader: jest.fn(),
      statusCode: 200,
      end: jest.fn()
    };
    next = jest.fn();
  });

  describe('constructor', () => {
    it('should use default options when none provided', () => {
      corsMiddleware = new CORSMiddleware();
      
      expect(corsMiddleware.options.allowedOrigins).toEqual(['*']);
      expect(corsMiddleware.options.allowedMethods).toEqual(['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']);
      expect(corsMiddleware.options.allowedHeaders).toEqual(['Content-Type', 'Authorization', 'X-API-Key']);
      expect(corsMiddleware.options.allowCredentials).toBe(true);
      expect(corsMiddleware.options.maxAge).toBe(86400);
    });

    it('should accept custom options', () => {
      const options = {
        allowedOrigins: ['https://example.com'],
        allowedMethods: ['GET', 'POST'],
        allowedHeaders: ['Content-Type'],
        allowCredentials: false,
        maxAge: 3600,
        exposedHeaders: ['X-Total-Count'],
        preflightContinue: true,
        optionsSuccessStatus: 200
      };
      
      corsMiddleware = new CORSMiddleware(options);
      
      expect(corsMiddleware.options).toMatchObject(options);
    });
  });

  describe('isOriginAllowed', () => {
    it('should allow any origin with wildcard', () => {
      corsMiddleware = new CORSMiddleware({ allowedOrigins: ['*'] });
      
      expect(corsMiddleware.isOriginAllowed('https://example.com')).toBe(true);
      expect(corsMiddleware.isOriginAllowed('http://localhost:3000')).toBe(true);
    });

    it('should allow exact match origins', () => {
      corsMiddleware = new CORSMiddleware({ 
        allowedOrigins: ['https://example.com', 'http://localhost:3000'] 
      });
      
      expect(corsMiddleware.isOriginAllowed('https://example.com')).toBe(true);
      expect(corsMiddleware.isOriginAllowed('http://localhost:3000')).toBe(true);
      expect(corsMiddleware.isOriginAllowed('https://other.com')).toBe(false);
    });

    it('should support regex patterns', () => {
      corsMiddleware = new CORSMiddleware({ 
        allowedOrigins: [/^https:\/\/.*\.example\.com$/] 
      });
      
      expect(corsMiddleware.isOriginAllowed('https://api.example.com')).toBe(true);
      expect(corsMiddleware.isOriginAllowed('https://www.example.com')).toBe(true);
      expect(corsMiddleware.isOriginAllowed('http://api.example.com')).toBe(false);
      expect(corsMiddleware.isOriginAllowed('https://example.org')).toBe(false);
    });

    it('should support wildcard subdomains', () => {
      corsMiddleware = new CORSMiddleware({ 
        allowedOrigins: ['*.example.com'] 
      });
      
      expect(corsMiddleware.isOriginAllowed('https://api.example.com')).toBe(true);
      expect(corsMiddleware.isOriginAllowed('http://www.example.com')).toBe(true);
      expect(corsMiddleware.isOriginAllowed('https://example.com')).toBe(true);
      expect(corsMiddleware.isOriginAllowed('https://example.org')).toBe(false);
    });

    it('should return false for null or undefined origin', () => {
      corsMiddleware = new CORSMiddleware({ allowedOrigins: ['*'] });
      
      expect(corsMiddleware.isOriginAllowed(null)).toBe(false);
      expect(corsMiddleware.isOriginAllowed(undefined)).toBe(false);
      expect(corsMiddleware.isOriginAllowed('')).toBe(false);
    });
  });

  describe('handle', () => {
    beforeEach(() => {
      corsMiddleware = new CORSMiddleware();
    });

    it('should handle regular requests with allowed origin', () => {
      req.headers.origin = 'https://example.com';
      const middleware = corsMiddleware.handle();
      
      middleware(req, res, next);
      
      expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', 'https://example.com');
      expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Credentials', 'true');
      expect(next).toHaveBeenCalled();
    });

    it('should use referer if origin is not present', () => {
      req.headers.referer = 'https://example.com';
      const middleware = corsMiddleware.handle();
      
      middleware(req, res, next);
      
      expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', 'https://example.com');
      expect(next).toHaveBeenCalled();
    });

    it('should handle wildcard origin without credentials', () => {
      corsMiddleware = new CORSMiddleware({ 
        allowedOrigins: ['*'], 
        allowCredentials: false 
      });
      const middleware = corsMiddleware.handle();
      
      middleware(req, res, next);
      
      expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*');
      expect(res.setHeader).not.toHaveBeenCalledWith('Access-Control-Allow-Credentials', 'true');
      expect(next).toHaveBeenCalled();
    });

    it('should not set wildcard origin when credentials are enabled', () => {
      corsMiddleware = new CORSMiddleware({ 
        allowedOrigins: ['*'], 
        allowCredentials: true 
      });
      req.headers.origin = 'https://untrusted.com';
      const middleware = corsMiddleware.handle();
      
      middleware(req, res, next);
      
      expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', 'https://untrusted.com');
      expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Credentials', 'true');
      expect(next).toHaveBeenCalled();
    });

    it('should expose custom headers', () => {
      corsMiddleware = new CORSMiddleware({ 
        exposedHeaders: ['X-Total-Count', 'X-Page-Number'] 
      });
      req.headers.origin = 'https://example.com';
      const middleware = corsMiddleware.handle();
      
      middleware(req, res, next);
      
      expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Expose-Headers', 'X-Total-Count, X-Page-Number');
      expect(next).toHaveBeenCalled();
    });

    it('should call handlePreflight for OPTIONS requests', () => {
      req.method = 'OPTIONS';
      req.headers.origin = 'https://example.com';
      corsMiddleware.handlePreflight = jest.fn();
      const middleware = corsMiddleware.handle();
      
      middleware(req, res, next);
      
      expect(corsMiddleware.handlePreflight).toHaveBeenCalledWith(req, res, next);
      expect(next).not.toHaveBeenCalled();
    });

    it('should not set headers for disallowed origins', () => {
      corsMiddleware = new CORSMiddleware({ 
        allowedOrigins: ['https://trusted.com'] 
      });
      req.headers.origin = 'https://untrusted.com';
      const middleware = corsMiddleware.handle();
      
      middleware(req, res, next);
      
      expect(res.setHeader).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });
  });

  describe('handlePreflight', () => {
    beforeEach(() => {
      corsMiddleware = new CORSMiddleware();
      req.method = 'OPTIONS';
    });

    it('should handle preflight requests with all headers', () => {
      req.headers.origin = 'https://example.com';
      req.headers['access-control-request-method'] = 'POST';
      req.headers['access-control-request-headers'] = 'Content-Type, Authorization';
      
      corsMiddleware.handlePreflight(req, res, next);
      
      expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', 'https://example.com');
      expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Credentials', 'true');
      expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
      expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Max-Age', '86400');
      expect(res.statusCode).toBe(204);
      expect(res.end).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    it('should validate requested method', () => {
      corsMiddleware = new CORSMiddleware({ 
        allowedMethods: ['GET', 'POST'] 
      });
      req.headers.origin = 'https://example.com';
      req.headers['access-control-request-method'] = 'DELETE';
      
      corsMiddleware.handlePreflight(req, res, next);
      
      expect(res.setHeader).not.toHaveBeenCalledWith('Access-Control-Allow-Methods', expect.any(String));
    });

    it('should validate requested headers case-insensitively', () => {
      req.headers.origin = 'https://example.com';
      req.headers['access-control-request-headers'] = 'content-type, AUTHORIZATION';
      
      corsMiddleware.handlePreflight(req, res, next);
      
      expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
    });

    it('should handle preflight without request headers', () => {
      req.headers.origin = 'https://example.com';
      req.headers['access-control-request-method'] = 'GET';
      
      corsMiddleware.handlePreflight(req, res, next);
      
      expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
    });

    it('should continue to next middleware if preflightContinue is true', () => {
      corsMiddleware = new CORSMiddleware({ 
        preflightContinue: true 
      });
      req.headers.origin = 'https://example.com';
      
      corsMiddleware.handlePreflight(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(res.end).not.toHaveBeenCalled();
    });

    it('should use custom success status', () => {
      corsMiddleware = new CORSMiddleware({ 
        optionsSuccessStatus: 200 
      });
      req.headers.origin = 'https://example.com';
      
      corsMiddleware.handlePreflight(req, res, next);
      
      expect(res.statusCode).toBe(200);
      expect(res.end).toHaveBeenCalled();
    });

    it('should handle wildcard origin without credentials in preflight', () => {
      corsMiddleware = new CORSMiddleware({ 
        allowedOrigins: ['*'], 
        allowCredentials: false 
      });
      req.headers.origin = 'https://example.com';
      
      corsMiddleware.handlePreflight(req, res, next);
      
      expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*');
      expect(res.setHeader).not.toHaveBeenCalledWith('Access-Control-Allow-Credentials', 'true');
    });

    it('should not set origin header for disallowed origins in preflight', () => {
      corsMiddleware = new CORSMiddleware({ 
        allowedOrigins: ['https://trusted.com'] 
      });
      req.headers.origin = 'https://untrusted.com';
      
      corsMiddleware.handlePreflight(req, res, next);
      
      expect(res.setHeader).not.toHaveBeenCalledWith('Access-Control-Allow-Origin', expect.any(String));
      expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Max-Age', '86400');
    });

    it('should handle preflight with custom max age', () => {
      corsMiddleware = new CORSMiddleware({ 
        maxAge: 7200 
      });
      req.headers.origin = 'https://example.com';
      
      corsMiddleware.handlePreflight(req, res, next);
      
      expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Max-Age', '7200');
    });
  });

  describe('Edge cases', () => {
    beforeEach(() => {
      corsMiddleware = new CORSMiddleware();
    });

    it('should handle requests without any origin headers', () => {
      const middleware = corsMiddleware.handle();
      
      middleware(req, res, next);
      
      expect(res.setHeader).not.toHaveBeenCalledWith('Access-Control-Allow-Origin', expect.any(String));
      expect(next).toHaveBeenCalled();
    });

    it('should handle malformed request headers gracefully', () => {
      req.method = 'OPTIONS';
      req.headers.origin = 'https://example.com';
      req.headers['access-control-request-headers'] = ',,,Content-Type,,,';
      
      corsMiddleware.handlePreflight(req, res, next);
      
      expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
    });

    it('should handle mixed origin configurations', () => {
      corsMiddleware = new CORSMiddleware({ 
        allowedOrigins: [
          'https://exact.com',
          '*.wildcard.com',
          /^https:\/\/regex\./
        ] 
      });
      
      expect(corsMiddleware.isOriginAllowed('https://exact.com')).toBe(true);
      expect(corsMiddleware.isOriginAllowed('https://sub.wildcard.com')).toBe(true);
      expect(corsMiddleware.isOriginAllowed('https://regex.example.com')).toBe(true);
      expect(corsMiddleware.isOriginAllowed('https://none.com')).toBe(false);
    });
  });
});