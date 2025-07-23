const HelmetMiddleware = require('../../../security/middleware/helmet');

// Mock helmet module
jest.mock('helmet', () => {
  const mockHelmet = jest.fn((config) => {
    return (req, res, next) => {
      // Set mock headers based on config
      if (config.contentSecurityPolicy !== false) {
        res.setHeader('Content-Security-Policy', "default-src 'self'");
      }
      if (config.hsts !== false) {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000');
      }
      if (config.frameguard !== false) {
        res.setHeader('X-Frame-Options', 'DENY');
      }
      if (config.noSniff !== false) {
        res.setHeader('X-Content-Type-Options', 'nosniff');
      }
      next();
    };
  });
  return mockHelmet;
});

describe('HelmetMiddleware', () => {
  let helmetMiddleware;
  let req, res, next;

  beforeEach(() => {
    helmetMiddleware = new HelmetMiddleware();
    req = {
      headers: {},
      body: {},
      ip: '127.0.0.1'
    };
    res = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      end: jest.fn(),
      locals: {}
    };
    next = jest.fn();
  });

  describe('createMiddleware', () => {
    it('should create helmet middleware with default config', () => {
      const middleware = helmetMiddleware.createMiddleware();
      
      middleware(req, res, next);
      
      expect(res.setHeader).toHaveBeenCalledWith('Content-Security-Policy', expect.any(String));
      expect(res.setHeader).toHaveBeenCalledWith('Strict-Transport-Security', expect.any(String));
      expect(res.setHeader).toHaveBeenCalledWith('X-Frame-Options', expect.any(String));
      expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', expect.any(String));
      expect(next).toHaveBeenCalled();
    });

    it('should allow disabling specific middleware', () => {
      const customHelmet = new HelmetMiddleware({
        contentSecurityPolicy: { enabled: false },
        hsts: { enabled: false }
      });
      
      const middleware = customHelmet.createMiddleware();
      middleware(req, res, next);
      
      // Should not set disabled headers
      const headerNames = res.setHeader.mock.calls.map(call => call[0]);
      expect(headerNames).not.toContain('Content-Security-Policy');
      expect(headerNames).not.toContain('Strict-Transport-Security');
      
      // Should still set enabled headers
      expect(headerNames).toContain('X-Frame-Options');
      expect(headerNames).toContain('X-Content-Type-Options');
    });

    it('should use custom CSP directives', () => {
      const customHelmet = new HelmetMiddleware({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'", 'https://trusted.com'],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'https:']
          }
        }
      });
      
      const middleware = customHelmet.createMiddleware();
      expect(middleware).toBeDefined();
    });
  });

  describe('CSP Report Handler', () => {
    beforeEach(() => {
      req.body = {
        'csp-report': {
          'document-uri': 'https://example.com/page',
          'violated-directive': 'script-src',
          'effective-directive': 'script-src',
          'original-policy': "default-src 'self'",
          'blocked-uri': 'https://evil.com/script.js',
          'status-code': 200
        }
      };
    });

    it('should handle CSP violation reports', () => {
      const handler = helmetMiddleware.createCspReportHandler();
      
      handler(req, res);
      
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.end).toHaveBeenCalled();
      expect(helmetMiddleware.cspReports).toHaveLength(1);
      expect(helmetMiddleware.cspReports[0]).toMatchObject({
        documentUri: 'https://example.com/page',
        violatedDirective: 'script-src',
        blockedUri: 'https://evil.com/script.js'
      });
    });

    it('should reject invalid CSP reports', () => {
      req.body = { invalid: 'report' };
      
      const handler = helmetMiddleware.createCspReportHandler();
      handler(req, res);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid CSP report' });
    });

    it('should limit stored reports', () => {
      const smallLimitHelmet = new HelmetMiddleware({ maxCspReports: 2 });
      const handler = smallLimitHelmet.createCspReportHandler();
      
      // Add 3 reports
      for (let i = 0; i < 3; i++) {
        req.body['csp-report']['blocked-uri'] = `https://evil${i}.com`;
        handler(req, res);
      }
      
      expect(smallLimitHelmet.cspReports).toHaveLength(2);
      expect(smallLimitHelmet.cspReports[0].blockedUri).toBe('https://evil1.com');
      expect(smallLimitHelmet.cspReports[1].blockedUri).toBe('https://evil2.com');
    });

    it('should handle errors gracefully', () => {
      req.body = null;
      
      const handler = helmetMiddleware.createCspReportHandler();
      handler(req, res);
      
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to process CSP report' });
    });
  });

  describe('getCspReports', () => {
    beforeEach(() => {
      // Add some test reports
      helmetMiddleware.cspReports = [
        {
          documentUri: 'https://example.com/page1',
          violatedDirective: 'script-src',
          blockedUri: 'https://evil1.com',
          timestamp: new Date('2024-01-01')
        },
        {
          documentUri: 'https://example.com/page2',
          violatedDirective: 'img-src',
          blockedUri: 'https://evil2.com',
          timestamp: new Date('2024-01-02')
        },
        {
          documentUri: 'https://example.com/page3',
          violatedDirective: 'script-src',
          blockedUri: 'https://evil3.com',
          timestamp: new Date('2024-01-03')
        }
      ];
    });

    it('should return all reports without filters', () => {
      const result = helmetMiddleware.getCspReports();
      
      expect(result.total).toBe(3);
      expect(result.reports).toHaveLength(3);
    });

    it('should filter by date range', () => {
      const result = helmetMiddleware.getCspReports({
        startDate: '2024-01-02',
        endDate: '2024-01-02'
      });
      
      expect(result.total).toBe(1);
      expect(result.reports[0].blockedUri).toBe('https://evil2.com');
    });

    it('should filter by directive', () => {
      const result = helmetMiddleware.getCspReports({
        directive: 'script-src'
      });
      
      expect(result.total).toBe(2);
      expect(result.reports.every(r => r.violatedDirective === 'script-src')).toBe(true);
    });

    it('should filter by blocked URI', () => {
      const result = helmetMiddleware.getCspReports({
        blockedUri: 'evil2'
      });
      
      expect(result.total).toBe(1);
      expect(result.reports[0].blockedUri).toBe('https://evil2.com');
    });

    it('should limit results', () => {
      const result = helmetMiddleware.getCspReports({ limit: 2 });
      
      expect(result.total).toBe(3);
      expect(result.reports).toHaveLength(2);
    });
  });

  describe('getCspStats', () => {
    beforeEach(() => {
      helmetMiddleware.cspReports = [
        {
          violatedDirective: 'script-src',
          blockedUri: 'https://evil.com/script.js',
          timestamp: new Date()
        },
        {
          violatedDirective: 'script-src',
          blockedUri: 'https://bad.com/script.js',
          timestamp: new Date()
        },
        {
          effectiveDirective: 'img-src',
          blockedUri: 'https://evil.com/image.jpg',
          timestamp: new Date()
        },
        {
          violatedDirective: 'style-src',
          blockedUri: 'invalid-uri',
          timestamp: new Date()
        }
      ];
    });

    it('should calculate statistics correctly', () => {
      const stats = helmetMiddleware.getCspStats();
      
      expect(stats.total).toBe(4);
      expect(stats.byDirective['script-src']).toBe(2);
      expect(stats.byDirective['img-src']).toBe(1);
      expect(stats.byDirective['style-src']).toBe(1);
      expect(stats.byBlockedUri['evil.com']).toBe(2);
      expect(stats.byBlockedUri['bad.com']).toBe(1);
      expect(stats.byBlockedUri['invalid-uri']).toBe(1);
    });

    it('should group by hour', () => {
      const currentHour = new Date().getHours();
      const stats = helmetMiddleware.getCspStats();
      
      expect(stats.byHour[currentHour]).toBe(4);
    });

    it('should include recent violations', () => {
      const stats = helmetMiddleware.getCspStats();
      
      expect(stats.recentViolations).toHaveLength(4);
      expect(stats.recentViolations[0]).toHaveProperty('directive');
      expect(stats.recentViolations[0]).toHaveProperty('blockedUri');
      expect(stats.recentViolations[0]).toHaveProperty('timestamp');
    });
  });

  describe('createRouteSpecificMiddleware', () => {
    it('should apply different configs for different routes', () => {
      const routeConfig = {
        '/api': {
          contentSecurityPolicy: { enabled: false }
        },
        '/admin': {
          frameguard: { action: 'sameorigin' }
        }
      };
      
      const middleware = helmetMiddleware.createRouteSpecificMiddleware(routeConfig);
      
      // Test API route
      req.path = '/api/users';
      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
      
      // Test admin route
      req.path = '/admin/dashboard';
      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
      
      // Test default route
      req.path = '/public';
      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('createNonceMiddleware', () => {
    it('should generate nonce for inline scripts', () => {
      const middleware = helmetMiddleware.createNonceMiddleware();
      
      middleware(req, res, next);
      
      expect(res.locals.nonce).toBeDefined();
      expect(res.locals.nonce).toMatch(/^[A-Za-z0-9+/=]+$/); // Base64 pattern
      expect(next).toHaveBeenCalled();
    });

    it('should modify CSP header to include nonce', () => {
      const middleware = helmetMiddleware.createNonceMiddleware();
      
      middleware(req, res, next);
      
      // Test the modified setHeader function
      res.setHeader('Content-Security-Policy', "script-src 'self'");
      
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Security-Policy',
        expect.stringContaining(`'nonce-${res.locals.nonce}'`)
      );
    });
  });

  describe('testHeaders', () => {
    it('should identify missing security headers', () => {
      const headers = {
        'content-type': 'text/html'
      };
      
      const result = helmetMiddleware.testHeaders(headers);
      
      expect(result.secure).toBe(false);
      expect(result.issues).toContain('Missing Strict-Transport-Security header');
      expect(result.issues).toContain('Missing Content-Security-Policy header');
      expect(result.issues).toContain('Missing X-Frame-Options header');
      expect(result.issues).toContain('Missing X-Content-Type-Options header');
      expect(result.issues).toContain('Missing Referrer-Policy header');
    });

    it('should pass with all security headers present', () => {
      const headers = {
        'strict-transport-security': 'max-age=31536000',
        'content-security-policy': "default-src 'self'",
        'x-frame-options': 'DENY',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer'
      };
      
      const result = helmetMiddleware.testHeaders(headers);
      
      expect(result.secure).toBe(true);
      expect(result.issues).toHaveLength(0);
      expect(result.headers).toContain('strict-transport-security');
      expect(result.headers).toContain('content-security-policy');
    });

    it('should provide recommendations', () => {
      const headers = {};
      
      const result = helmetMiddleware.testHeaders(headers);
      
      expect(result.recommendations).toContain('Enable HSTS to enforce HTTPS connections');
      expect(result.recommendations).toContain('Implement CSP to prevent XSS attacks');
    });
  });

  describe('configuration options', () => {
    it('should handle custom HSTS config', () => {
      const customHelmet = new HelmetMiddleware({
        hsts: {
          maxAge: 63072000, // 2 years
          includeSubDomains: true,
          preload: true
        }
      });
      
      expect(customHelmet.options.hsts.maxAge).toBe(63072000);
    });

    it('should handle custom referrer policy', () => {
      const customHelmet = new HelmetMiddleware({
        referrerPolicy: {
          policy: ['same-origin', 'strict-origin']
        }
      });
      
      expect(customHelmet.options.referrerPolicy.policy).toEqual(['same-origin', 'strict-origin']);
    });

    it('should handle CSP report-only mode', () => {
      const customHelmet = new HelmetMiddleware({
        contentSecurityPolicy: {
          reportOnly: true
        }
      });
      
      expect(customHelmet.options.contentSecurityPolicy.reportOnly).toBe(true);
    });
  });
});