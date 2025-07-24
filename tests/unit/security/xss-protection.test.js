const XSSProtection = require('../../../security/middleware/xss');

// Mock isomorphic-dompurify
jest.mock('isomorphic-dompurify', () => {
  return () => ({
    sanitize: jest.fn((dirty, config) => {
      // Simple mock sanitization
      if (config && config.ALLOWED_TAGS && config.ALLOWED_TAGS.length === 0) {
        // Strip all tags
        return dirty.replace(/<[^>]*>/g, '');
      }
      // Basic sanitization for testing
      return dirty
        .replace(/<script[^>]*>.*?<\/script>/gi, '')
        .replace(/on\w+\s*=/gi, '')
        .replace(/javascript:/gi, '');
    }),
    addHook: jest.fn()
  });
});

describe('XSSProtection', () => {
  let xssProtection;
  let req, res, next;

  beforeEach(() => {
    xssProtection = new XSSProtection();
    req = {
      method: 'POST',
      path: '/api/test',
      ip: '127.0.0.1',
      headers: {},
      body: {},
      query: {},
      params: {},
      cookies: {}
    };
    res = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      send: jest.fn()
    };
    next = jest.fn();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      expect(xssProtection.options.mode).toBe('sanitize');
      expect(xssProtection.options.includeQuery).toBe(true);
      expect(xssProtection.options.includeBody).toBe(true);
      expect(xssProtection.options.blacklistFields).toContain('password');
    });

    it('should accept custom options', () => {
      const customXss = new XSSProtection({
        mode: 'escape',
        whitelistFields: ['html_content'],
        logViolations: false
      });

      expect(customXss.options.mode).toBe('escape');
      expect(customXss.options.whitelistFields).toContain('html_content');
      expect(customXss.options.logViolations).toBe(false);
    });
  });

  describe('sanitizeValue', () => {
    it('should sanitize HTML in sanitize mode', () => {
      const input = '<script>alert("xss")</script>Hello';
      const result = xssProtection.sanitizeValue(input, 'test');
      
      expect(result).toBe('Hello');
      expect(result).not.toContain('<script>');
    });

    it('should escape HTML in escape mode', () => {
      xssProtection.options.mode = 'escape';
      
      const input = '<div>Hello</div>';
      const result = xssProtection.sanitizeValue(input, 'test');
      
      expect(result).toBe('&lt;div&gt;Hello&lt;&#x2F;div&gt;');
    });

    it('should reject XSS in reject mode', () => {
      xssProtection.options.mode = 'reject';
      
      const input = '<script>alert("xss")</script>';
      
      expect(() => xssProtection.sanitizeValue(input, 'test'))
        .toThrow('XSS detected in field: test');
    });

    it('should skip whitelisted fields', () => {
      xssProtection.options.whitelistFields = ['html_content'];
      
      const input = '<script>alert("xss")</script>';
      const result = xssProtection.sanitizeValue(input, 'html_content');
      
      expect(result).toBe(input);
    });

    it('should skip blacklisted fields', () => {
      const input = 'password123';
      const result = xssProtection.sanitizeValue(input, 'password');
      
      expect(result).toBe(input);
    });

    it('should apply custom sanitizers', () => {
      xssProtection.options.customSanitizers = {
        'special_field': (value) => value.toUpperCase()
      };
      
      const result = xssProtection.sanitizeValue('hello', 'special_field');
      expect(result).toBe('HELLO');
    });

    it('should track violations', () => {
      const input = '<script>alert("xss")</script>Hello';
      xssProtection.sanitizeValue(input, 'comment');
      
      expect(xssProtection.violations).toHaveLength(1);
      expect(xssProtection.violations[0]).toMatchObject({
        type: 'sanitized',
        value: 'comment',
        original: input,
        sanitized: 'Hello'
      });
    });
  });

  describe('escapeHtml', () => {
    it('should escape HTML entities', () => {
      const input = '<script>alert("xss")</script>';
      const result = xssProtection.escapeHtml(input);
      
      expect(result).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;');
    });

    it('should escape all dangerous characters', () => {
      const input = '& < > " \' /';
      const result = xssProtection.escapeHtml(input);
      
      expect(result).toBe('&amp; &lt; &gt; &quot; &#x27; &#x2F;');
    });
  });

  describe('containsXSS', () => {
    it('should detect script tags', () => {
      expect(xssProtection.containsXSS('<script>alert(1)</script>')).toBe(true);
      expect(xssProtection.containsXSS('<SCRIPT>alert(1)</SCRIPT>')).toBe(true);
    });

    it('should detect event handlers', () => {
      expect(xssProtection.containsXSS('<img onerror="alert(1)">')).toBe(true);
      expect(xssProtection.containsXSS('<div onclick="alert(1)">')).toBe(true);
    });

    it('should detect javascript: protocol', () => {
      expect(xssProtection.containsXSS('<a href="javascript:alert(1)">')).toBe(true);
    });

    it('should detect iframe tags', () => {
      expect(xssProtection.containsXSS('<iframe src="evil.com"></iframe>')).toBe(true);
    });

    it('should return false for safe content', () => {
      expect(xssProtection.containsXSS('Hello world')).toBe(false);
      expect(xssProtection.containsXSS('<p>Safe paragraph</p>')).toBe(false);
    });

    it('should handle non-string values', () => {
      expect(xssProtection.containsXSS(123)).toBe(false);
      expect(xssProtection.containsXSS(null)).toBe(false);
    });
  });

  describe('sanitizeObject', () => {
    it('should sanitize object recursively', () => {
      const obj = {
        name: 'John',
        comment: '<script>alert("xss")</script>Hello',
        nested: {
          value: '<img onerror="alert(1)">',
          safe: 'normal text'
        }
      };

      const result = xssProtection.sanitizeObject(obj);
      
      expect(result.name).toBe('John');
      expect(result.comment).toBe('Hello');
      expect(result.nested.value).toBe('');
      expect(result.nested.safe).toBe('normal text');
    });

    it('should sanitize arrays', () => {
      const arr = [
        'safe',
        '<script>alert(1)</script>',
        { value: '<iframe></iframe>' }
      ];

      const result = xssProtection.sanitizeObject(arr);
      
      expect(result[0]).toBe('safe');
      expect(result[1]).toBe('');
      expect(result[2].value).toBe('');
    });

    it('should sanitize object keys', () => {
      const obj = {
        '<script>key</script>': 'value'
      };

      const result = xssProtection.sanitizeObject(obj);
      const keys = Object.keys(result);
      
      expect(keys[0]).toBe('key');
    });

    it('should handle null and undefined', () => {
      expect(xssProtection.sanitizeObject(null)).toBe(null);
      expect(xssProtection.sanitizeObject(undefined)).toBe(undefined);
    });
  });

  describe('createMiddleware', () => {
    it('should sanitize request body', () => {
      req.body = {
        name: 'John',
        comment: '<script>alert("xss")</script>Hello'
      };

      const middleware = xssProtection.createMiddleware();
      middleware(req, res, next);
      
      expect(req.body.comment).toBe('Hello');
      expect(next).toHaveBeenCalled();
    });

    it('should sanitize query parameters', () => {
      req.query = {
        search: '<script>alert(1)</script>term',
        page: '1'
      };

      const middleware = xssProtection.createMiddleware();
      middleware(req, res, next);
      
      expect(req.query.search).toBe('term');
      expect(req.query.page).toBe('1');
    });

    it('should sanitize route params', () => {
      req.params = {
        id: '123',
        name: '<script>alert(1)</script>test'
      };

      const middleware = xssProtection.createMiddleware();
      middleware(req, res, next);
      
      expect(req.params.name).toBe('test');
    });

    it('should sanitize cookies when enabled', () => {
      xssProtection.options.includeCookies = true;
      req.cookies = {
        session: 'abc123',
        pref: '<script>alert(1)</script>value'
      };

      const middleware = xssProtection.createMiddleware();
      middleware(req, res, next);
      
      expect(req.cookies.pref).toBe('value');
    });

    it('should sanitize specific headers when enabled', () => {
      xssProtection.options.includeHeaders = ['user-agent', 'referer'];
      req.headers = {
        'user-agent': 'Mozilla<script>alert(1)</script>',
        'referer': 'https://example.com',
        'authorization': 'Bearer token123'
      };

      const middleware = xssProtection.createMiddleware();
      middleware(req, res, next);
      
      expect(req.headers['user-agent']).toBe('Mozilla');
      expect(req.headers['authorization']).toBe('Bearer token123'); // Not sanitized
    });

    it('should set XSS protection headers', () => {
      const middleware = xssProtection.createMiddleware();
      middleware(req, res, next);
      
      expect(res.setHeader).toHaveBeenCalledWith('X-XSS-Protection', '1; mode=block');
      expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    });

    it('should handle errors in reject mode', () => {
      xssProtection.options.mode = 'reject';
      req.body = {
        comment: '<script>alert(1)</script>'
      };

      const middleware = xssProtection.createMiddleware();
      middleware(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid input detected',
        message: expect.stringContaining('XSS detected')
      });
    });
  });

  describe('createOutputSanitizer', () => {
    it('should sanitize JSON responses', () => {
      const middleware = xssProtection.createOutputSanitizer();
      middleware(req, res, next);
      
      const data = {
        message: 'Hello',
        html: '<script>alert(1)</script>test'
      };
      
      res.json(data);
      
      expect(res.json).toHaveBeenCalledWith({
        message: 'Hello',
        html: 'test'
      });
    });

    it('should sanitize string responses', () => {
      const middleware = xssProtection.createOutputSanitizer();
      middleware(req, res, next);
      
      res.send('<script>alert(1)</script>Hello');
      
      expect(res.send).toHaveBeenCalledWith('Hello');
    });

    it('should handle non-string responses', () => {
      const middleware = xssProtection.createOutputSanitizer();
      middleware(req, res, next);
      
      res.send(123);
      
      expect(res.send).toHaveBeenCalledWith(123);
    });
  });

  describe('createFieldSanitizer', () => {
    it('should sanitize specific fields', () => {
      req.body = {
        title: 'Safe Title',
        description: '<script>alert(1)</script>Description',
        html_content: '<p>Paragraph</p>'
      };

      const middleware = xssProtection.createFieldSanitizer(['body.description']);
      middleware(req, res, next);
      
      expect(req.body.title).toBe('Safe Title');
      expect(req.body.description).toBe('Description');
      expect(req.body.html_content).toBe('<p>Paragraph</p>'); // Not sanitized
      expect(next).toHaveBeenCalled();
    });

    it('should handle nested fields', () => {
      req.body = {
        user: {
          profile: {
            bio: '<script>alert(1)</script>Bio text'
          }
        }
      };

      const middleware = xssProtection.createFieldSanitizer(['body.user.profile.bio']);
      middleware(req, res, next);
      
      expect(req.body.user.profile.bio).toBe('Bio text');
    });

    it('should handle missing fields gracefully', () => {
      req.body = {};

      const middleware = xssProtection.createFieldSanitizer(['body.nonexistent.field']);
      
      expect(() => middleware(req, res, next)).not.toThrow();
      expect(next).toHaveBeenCalled();
    });
  });

  describe('violation tracking', () => {
    it('should track violations with context', () => {
      xssProtection.trackViolation('element', 'script', {
        path: '/api/test',
        ip: '127.0.0.1'
      });

      expect(xssProtection.violations).toHaveLength(1);
      expect(xssProtection.violations[0]).toMatchObject({
        type: 'element',
        value: 'script',
        path: '/api/test',
        ip: '127.0.0.1'
      });
    });

    it('should limit violation history', () => {
      xssProtection.maxViolations = 2;
      
      for (let i = 0; i < 3; i++) {
        xssProtection.trackViolation('test', `violation${i}`);
      }
      
      expect(xssProtection.violations).toHaveLength(2);
      expect(xssProtection.violations[0].value).toBe('violation1');
      expect(xssProtection.violations[1].value).toBe('violation2');
    });

    it('should call onViolation callback', () => {
      const onViolation = jest.fn();
      const customXss = new XSSProtection({ onViolation });
      
      customXss.trackViolation('test', 'value');
      
      expect(onViolation).toHaveBeenCalledWith({
        type: 'test',
        value: 'value',
        timestamp: expect.any(Date)
      });
    });
  });

  describe('getViolationStats', () => {
    beforeEach(() => {
      xssProtection.violations = [
        { type: 'element', value: 'script', path: '/api/test' },
        { type: 'element', value: 'iframe', path: '/api/test' },
        { type: 'attribute', value: 'onerror', path: '/api/upload' },
        { type: 'sanitized', value: 'comment', path: '/api/test' }
      ];
    });

    it('should calculate statistics correctly', () => {
      const stats = xssProtection.getViolationStats();
      
      expect(stats.total).toBe(4);
      expect(stats.byType.element).toBe(2);
      expect(stats.byType.attribute).toBe(1);
      expect(stats.byType.sanitized).toBe(1);
      expect(stats.byField.script).toBe(1);
      expect(stats.byField.comment).toBe(1);
      expect(stats.byPath['/api/test']).toBe(3);
      expect(stats.byPath['/api/upload']).toBe(1);
    });

    it('should include recent violations', () => {
      const stats = xssProtection.getViolationStats();
      
      expect(stats.recentViolations).toHaveLength(4);
      expect(stats.recentViolations[0]).toHaveProperty('type');
      expect(stats.recentViolations[0]).toHaveProperty('value');
    });
  });

  describe('testSanitization', () => {
    it('should test sanitization without modifying options', () => {
      xssProtection.options.mode = 'escape';
      
      const result = xssProtection.testSanitization('<script>alert(1)</script>', {
        mode: 'sanitize'
      });
      
      expect(result.original).toBe('<script>alert(1)</script>');
      expect(result.sanitized).toBe('');
      expect(result.wouldBeSanitized).toBe(true);
      expect(result.containsXSS).toBe(true);
      
      // Original mode should be restored
      expect(xssProtection.options.mode).toBe('escape');
    });
  });

  describe('clearViolations', () => {
    it('should clear violation history', () => {
      xssProtection.violations = [
        { type: 'test', value: 'value' }
      ];
      
      const result = xssProtection.clearViolations();
      
      expect(result.success).toBe(true);
      expect(xssProtection.violations).toHaveLength(0);
    });
  });
});