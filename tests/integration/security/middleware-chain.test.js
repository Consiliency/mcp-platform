const JWTAuth = require('../../../security/api-auth/jwt-auth');
const APIKeyManager = require('../../../security/api-auth/api-key');
const CORSMiddleware = require('../../../security/middleware/cors');
const HelmetMiddleware = require('../../../security/middleware/helmet');
const IPRateLimiter = require('../../../security/rate-limiting/ip-limiter');
const UserRateLimiter = require('../../../security/rate-limiting/user-limiter');

describe('Security Middleware Chain Integration', () => {
  let jwtAuth, apiKeyManager, corsMiddleware, helmetMiddleware;
  let ipLimiter, userLimiter;
  let app, req, res, next;

  beforeEach(() => {
    // Initialize security components
    jwtAuth = new JWTAuth({
      secretKey: 'test-secret',
      algorithm: 'HS256',
      expiresIn: '1h'
    });

    apiKeyManager = new APIKeyManager();

    corsMiddleware = new CORSMiddleware({
      allowedOrigins: ['https://example.com', 'http://localhost:3000'],
      allowedMethods: ['GET', 'POST', 'PUT', 'DELETE'],
      allowCredentials: true
    });

    helmetMiddleware = new HelmetMiddleware({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"]
        }
      }
    });

    ipLimiter = new IPRateLimiter();
    userLimiter = new UserRateLimiter();

    // Mock Express app structure
    app = {
      middlewares: [],
      use: function(middleware) {
        this.middlewares.push(middleware);
      },
      async process(req, res) {
        for (const middleware of this.middlewares) {
          let nextCalled = false;
          const next = (error) => {
            if (error) throw error;
            nextCalled = true;
          };
          
          await middleware(req, res, next);
          
          if (!nextCalled && res.statusCode && res.statusCode >= 400) {
            break; // Response was sent, stop processing
          }
        }
      }
    };

    // Mock request/response
    req = {
      method: 'GET',
      path: '/api/users',
      headers: {
        origin: 'https://example.com',
        'user-agent': 'Mozilla/5.0'
      },
      connection: { remoteAddress: '192.168.1.100' },
      socket: { remoteAddress: '192.168.1.100' }
    };

    res = {
      statusCode: null,
      headers: {},
      setHeader: jest.fn((key, value) => {
        res.headers[key] = value;
      }),
      status: jest.fn((code) => {
        res.statusCode = code;
        return res;
      }),
      json: jest.fn(),
      end: jest.fn()
    };

    next = jest.fn();
  });

  describe('Complete Security Middleware Stack', () => {
    it('should process request through full security stack', async () => {
      // Setup middleware chain
      app.use(helmetMiddleware.middleware());
      app.use(corsMiddleware.handle());
      app.use(ipLimiter.createMiddleware());
      app.use(jwtAuth.middleware({ optional: true }));
      app.use(userLimiter.createMiddleware('api-calls', { skipOnError: true }));

      // Add JWT token
      const token = jwtAuth.generateToken({ userId: 'user123', email: 'test@example.com' });
      req.headers.authorization = `Bearer ${token}`;

      // Process request
      await app.process(req, res);

      // Verify all middlewares ran
      expect(res.headers['X-Content-Type-Options']).toBe('nosniff');
      expect(res.headers['Access-Control-Allow-Origin']).toBe('https://example.com');
      expect(res.headers['X-RateLimit-Limit']).toBeDefined();
      expect(req.user).toBeDefined();
      expect(req.user.userId).toBe('user123');
    });

    it('should handle authentication failure in middleware chain', async () => {
      // Setup middleware chain with required auth
      app.use(corsMiddleware.handle());
      app.use(jwtAuth.middleware({ optional: false }));
      app.use(userLimiter.createMiddleware('api-calls'));

      // No authentication provided
      await app.process(req, res);

      expect(res.statusCode).toBe(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'No token provided' });
    });

    it('should handle rate limit exceeded in middleware chain', async () => {
      // Setup middleware chain
      app.use(corsMiddleware.handle());
      app.use(ipLimiter.createMiddleware());

      // Exhaust IP rate limit
      for (let i = 0; i < 500; i++) {
        await ipLimiter.consumeToken('192.168.1.100', '/api/users');
      }

      // Process request
      await app.process(req, res);

      expect(res.statusCode).toBe(429);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Too many requests from this IP'
      }));
    });
  });

  describe('Authentication Middleware Combinations', () => {
    it('should support multiple authentication methods', async () => {
      // Create API key
      const apiKey = apiKeyManager.generateKey('user123', ['read']);

      // Setup middleware that accepts either JWT or API key
      const authMiddleware = async (req, res, next) => {
        // Try JWT first
        const jwtMiddleware = jwtAuth.middleware({ optional: true });
        await jwtMiddleware(req, res, () => {});

        if (req.user) {
          return next();
        }

        // Try API key
        const apiKeyMiddleware = apiKeyManager.middleware();
        await apiKeyMiddleware(req, res, next);
      };

      app.use(authMiddleware);
      app.use((req, res) => {
        res.json({ authenticated: true, userId: req.user?.userId || req.apiKey?.userId });
      });

      // Test with JWT
      const token = jwtAuth.generateToken({ userId: 'jwt-user' });
      req.headers.authorization = `Bearer ${token}`;
      await app.process(req, res);
      expect(res.json).toHaveBeenCalledWith({ authenticated: true, userId: 'jwt-user' });

      // Reset and test with API key
      res.json.mockClear();
      delete req.headers.authorization;
      req.headers['x-api-key'] = apiKey.apiKey;
      await app.process(req, res);
      expect(res.json).toHaveBeenCalledWith({ authenticated: true, userId: 'user123' });
    });

    it('should enforce permission requirements across auth methods', async () => {
      // Create tokens with different permissions
      const readOnlyKey = apiKeyManager.generateKey('user1', ['read']);
      const adminToken = jwtAuth.generateToken({ userId: 'admin', roles: ['admin'] });

      // Permission checking middleware
      const requirePermission = (permission) => (req, res, next) => {
        const hasPermission = 
          (req.apiKey?.permissions?.includes(permission)) ||
          (req.user?.roles?.includes(permission));
        
        if (!hasPermission) {
          return res.status(403).json({ error: 'Insufficient permissions' });
        }
        next();
      };

      // Setup middleware chain
      app.use(async (req, res, next) => {
        // Try both auth methods
        await jwtAuth.middleware({ optional: true })(req, res, () => {});
        if (!req.user) {
          await apiKeyManager.middleware()(req, res, next);
        } else {
          next();
        }
      });
      app.use(requirePermission('admin'));
      app.use((req, res) => res.json({ success: true }));

      // Test with read-only API key
      req.headers['x-api-key'] = readOnlyKey.apiKey;
      await app.process(req, res);
      expect(res.statusCode).toBe(403);

      // Reset and test with admin JWT
      res.status.mockClear();
      res.json.mockClear();
      delete req.headers['x-api-key'];
      req.headers.authorization = `Bearer ${adminToken}`;
      await app.process(req, res);
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });
  });

  describe('CORS and Security Headers', () => {
    it('should handle preflight requests with security headers', async () => {
      // Setup middleware
      app.use(helmetMiddleware.middleware());
      app.use(corsMiddleware.handle());

      // Preflight request
      req.method = 'OPTIONS';
      req.headers['access-control-request-method'] = 'POST';
      req.headers['access-control-request-headers'] = 'Content-Type, Authorization';

      await app.process(req, res);

      // Check CORS headers
      expect(res.headers['Access-Control-Allow-Origin']).toBe('https://example.com');
      expect(res.headers['Access-Control-Allow-Methods']).toContain('POST');
      expect(res.headers['Access-Control-Allow-Headers']).toContain('Authorization');
      expect(res.headers['Access-Control-Max-Age']).toBe('86400');

      // Check security headers from Helmet
      expect(res.headers['X-DNS-Prefetch-Control']).toBe('off');
      expect(res.headers['X-Frame-Options']).toBe('SAMEORIGIN');
    });

    it('should apply CSP headers dynamically', async () => {
      // Custom CSP for specific routes
      const dynamicCSP = (req, res, next) => {
        if (req.path.startsWith('/admin')) {
          res.setHeader('Content-Security-Policy', 
            "default-src 'self'; script-src 'self' 'unsafe-eval'");
        }
        next();
      };

      app.use(helmetMiddleware.middleware());
      app.use(dynamicCSP);

      // Test admin route
      req.path = '/admin/dashboard';
      await app.process(req, res);
      expect(res.headers['Content-Security-Policy']).toContain('unsafe-eval');

      // Test regular route
      res.headers = {};
      req.path = '/api/users';
      await app.process(req, res);
      expect(res.headers['Content-Security-Policy']).not.toContain('unsafe-eval');
    });
  });

  describe('Rate Limiting with Authentication', () => {
    it('should apply different rate limits for authenticated vs anonymous users', async () => {
      // Setup middleware chain
      app.use(jwtAuth.middleware({ optional: true }));
      app.use(async (req, res, next) => {
        if (req.user) {
          // Authenticated users get user-based limits
          const userMiddleware = userLimiter.createMiddleware('api-calls');
          await userMiddleware(req, res, next);
        } else {
          // Anonymous users get stricter IP-based limits
          const ipMiddleware = ipLimiter.createMiddleware();
          await ipMiddleware(req, res, next);
        }
      });
      app.use((req, res) => res.json({ success: true }));

      // Test authenticated request
      const token = jwtAuth.generateToken({ userId: 'user123' });
      req.headers.authorization = `Bearer ${token}`;
      await app.process(req, res);
      expect(res.headers['X-RateLimit-Tier']).toBe('free');
      expect(res.headers['X-RateLimit-Limit']).toBe('100'); // User limit

      // Test anonymous request
      res.headers = {};
      res.json.mockClear();
      delete req.headers.authorization;
      await app.process(req, res);
      expect(res.headers['X-RateLimit-Limit']).toBe('500'); // IP limit for API
      expect(res.headers['X-RateLimit-Tier']).toBeUndefined();
    });

    it('should combine IP and user rate limiting for defense in depth', async () => {
      // Setup both limiters
      app.use(ipLimiter.createMiddleware());
      app.use(jwtAuth.middleware({ optional: true }));
      app.use((req, res, next) => {
        if (req.user) {
          const userMiddleware = userLimiter.createMiddleware('api-calls');
          return userMiddleware(req, res, next);
        }
        next();
      });

      // Authenticated user from specific IP
      const token = jwtAuth.generateToken({ userId: 'user123' });
      req.headers.authorization = `Bearer ${token}`;

      // Exhaust user limit (100 for free tier)
      for (let i = 0; i < 100; i++) {
        await userLimiter.consumeToken('user123', 'api-calls');
      }

      // Should be blocked by user limit even though IP limit is not exhausted
      await app.process(req, res);
      expect(res.statusCode).toBe(429);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Rate limit exceeded',
        tier: 'free'
      }));
    });
  });

  describe('Error Handling in Middleware Chain', () => {
    it('should handle middleware errors gracefully', async () => {
      // Middleware that throws error
      const errorMiddleware = (req, res, next) => {
        throw new Error('Middleware error');
      };

      // Error handling middleware
      const errorHandler = (err, req, res, next) => {
        res.status(500).json({ error: err.message });
      };

      app.use(corsMiddleware.handle());
      app.use(errorMiddleware);
      app.use(errorHandler);

      try {
        await app.process(req, res);
      } catch (error) {
        // Simulate Express error handling
        errorHandler(error, req, res, next);
      }

      expect(res.statusCode).toBe(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Middleware error' });
    });

    it('should continue on optional middleware failures', async () => {
      // Setup middleware chain with failures
      app.use(corsMiddleware.handle());
      
      // Auth middleware that fails but is optional
      app.use(async (req, res, next) => {
        try {
          // Simulate auth check that fails
          throw new Error('Auth service unavailable');
        } catch (error) {
          // Log error but continue
          req.authError = error.message;
          next();
        }
      });

      // Rate limiter that fails but continues
      app.use(async (req, res, next) => {
        try {
          // Simulate rate limit check that fails
          throw new Error('Redis unavailable');
        } catch (error) {
          // Fail open - allow request
          req.rateLimitError = error.message;
          next();
        }
      });

      app.use((req, res) => {
        res.json({
          success: true,
          warnings: {
            auth: req.authError,
            rateLimit: req.rateLimitError
          }
        });
      });

      await app.process(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        warnings: {
          auth: 'Auth service unavailable',
          rateLimit: 'Redis unavailable'
        }
      });
    });
  });

  describe('Advanced Middleware Patterns', () => {
    it('should support conditional middleware application', async () => {
      // Apply different middleware based on route
      app.use((req, res, next) => {
        if (req.path.startsWith('/public')) {
          // Public routes - minimal security
          return corsMiddleware.handle()(req, res, next);
        } else if (req.path.startsWith('/api')) {
          // API routes - full security
          return helmetMiddleware.middleware()(req, res, next);
        } else if (req.path.startsWith('/admin')) {
          // Admin routes - strict security
          res.setHeader('X-Admin-Route', 'true');
          return next();
        }
        next();
      });

      // Apply auth conditionally
      app.use(async (req, res, next) => {
        if (req.path.startsWith('/admin')) {
          // Require auth for admin
          return jwtAuth.middleware({ optional: false })(req, res, next);
        } else if (req.path.startsWith('/api')) {
          // Optional auth for API
          return jwtAuth.middleware({ optional: true })(req, res, next);
        }
        next();
      });

      app.use((req, res) => res.json({ path: req.path }));

      // Test public route
      req.path = '/public/info';
      await app.process(req, res);
      expect(res.headers['Access-Control-Allow-Origin']).toBe('https://example.com');
      expect(res.headers['X-Content-Type-Options']).toBeUndefined();

      // Test API route
      res.headers = {};
      res.json.mockClear();
      req.path = '/api/users';
      await app.process(req, res);
      expect(res.headers['X-Content-Type-Options']).toBe('nosniff');

      // Test admin route without auth
      res.headers = {};
      res.status.mockClear();
      res.json.mockClear();
      req.path = '/admin/settings';
      await app.process(req, res);
      expect(res.statusCode).toBe(401);
      expect(res.headers['X-Admin-Route']).toBe('true');
    });

    it('should support middleware composition', async () => {
      // Compose multiple middleware into one
      const securityMiddleware = (options = {}) => {
        const middlewares = [];
        
        if (options.cors) {
          middlewares.push(corsMiddleware.handle());
        }
        if (options.helmet) {
          middlewares.push(helmetMiddleware.middleware());
        }
        if (options.rateLimit) {
          middlewares.push(ipLimiter.createMiddleware());
        }
        if (options.auth) {
          middlewares.push(jwtAuth.middleware({ optional: options.authOptional }));
        }

        return async (req, res, next) => {
          for (const middleware of middlewares) {
            let nextCalled = false;
            await middleware(req, res, (err) => {
              if (err) return next(err);
              nextCalled = true;
            });
            if (!nextCalled) return; // Response was sent
          }
          next();
        };
      };

      // Use composed middleware
      app.use(securityMiddleware({
        cors: true,
        helmet: true,
        rateLimit: true,
        auth: true,
        authOptional: true
      }));

      app.use((req, res) => res.json({ secure: true }));

      // Add auth token
      const token = jwtAuth.generateToken({ userId: 'user123' });
      req.headers.authorization = `Bearer ${token}`;

      await app.process(req, res);

      // Verify all security features applied
      expect(res.headers['Access-Control-Allow-Origin']).toBe('https://example.com');
      expect(res.headers['X-Content-Type-Options']).toBe('nosniff');
      expect(res.headers['X-RateLimit-Limit']).toBeDefined();
      expect(req.user).toBeDefined();
      expect(res.json).toHaveBeenCalledWith({ secure: true });
    });
  });
});