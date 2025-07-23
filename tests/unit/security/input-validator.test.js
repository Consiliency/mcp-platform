const InputValidator = require('../../../security/validation/input-validator');

describe('InputValidator', () => {
  let validator;

  beforeEach(() => {
    validator = new InputValidator();
  });

  describe('default validators', () => {
    describe('required validator', () => {
      it('should validate required fields', () => {
        const requiredValidator = validator.validators.get('required');
        
        expect(requiredValidator('value')).toBe(true);
        expect(requiredValidator('')).toBe(false);
        expect(requiredValidator(null)).toBe(false);
        expect(requiredValidator(undefined)).toBe(false);
      });
    });

    describe('email validator', () => {
      it('should validate email addresses', () => {
        const emailValidator = validator.validators.get('email');
        
        expect(emailValidator('test@example.com')).toBe(true);
        expect(emailValidator('invalid-email')).toBe(false);
        expect(emailValidator('test@')).toBe(false);
        expect(emailValidator('@example.com')).toBe(false);
      });
    });

    describe('url validator', () => {
      it('should validate URLs', () => {
        const urlValidator = validator.validators.get('url');
        
        expect(urlValidator('https://example.com')).toBe(true);
        expect(urlValidator('http://example.com/path')).toBe(true);
        expect(urlValidator('invalid-url')).toBe(false);
        expect(urlValidator('example.com')).toBe(false);
      });
    });

    describe('numeric validators', () => {
      it('should validate integers', () => {
        const intValidator = validator.validators.get('integer');
        
        expect(intValidator(123)).toBe(true);
        expect(intValidator('123')).toBe(true);
        expect(intValidator(123.45)).toBe(false);
        expect(intValidator('abc')).toBe(false);
      });

      it('should validate floats', () => {
        const floatValidator = validator.validators.get('float');
        
        expect(floatValidator(123.45)).toBe(true);
        expect(floatValidator('123.45')).toBe(true);
        expect(floatValidator(123)).toBe(true);
        expect(floatValidator('abc')).toBe(false);
      });
    });

    describe('length validators', () => {
      it('should validate min length', () => {
        const minValidator = validator.validators.get('min');
        
        expect(minValidator('hello', 3)).toBe(true);
        expect(minValidator('hi', 3)).toBe(false);
        expect(minValidator(10, 5)).toBe(true);
        expect(minValidator(3, 5)).toBe(false);
        expect(minValidator([1, 2, 3], 2)).toBe(true);
        expect(minValidator([1], 2)).toBe(false);
      });

      it('should validate max length', () => {
        const maxValidator = validator.validators.get('max');
        
        expect(maxValidator('hello', 10)).toBe(true);
        expect(maxValidator('hello world', 5)).toBe(false);
        expect(maxValidator(5, 10)).toBe(true);
        expect(maxValidator(15, 10)).toBe(false);
      });
    });

    describe('pattern validator', () => {
      it('should validate against regex patterns', () => {
        const patternValidator = validator.validators.get('pattern');
        
        expect(patternValidator('ABC123', /^[A-Z]+\d+$/)).toBe(true);
        expect(patternValidator('abc123', /^[A-Z]+\d+$/)).toBe(false);
        expect(patternValidator('test-123', '^test-\\d+$')).toBe(true);
      });
    });

    describe('in/notIn validators', () => {
      it('should validate inclusion', () => {
        const inValidator = validator.validators.get('in');
        
        expect(inValidator('apple', ['apple', 'banana', 'orange'])).toBe(true);
        expect(inValidator('grape', ['apple', 'banana', 'orange'])).toBe(false);
      });

      it('should validate exclusion', () => {
        const notInValidator = validator.validators.get('notIn');
        
        expect(notInValidator('grape', ['apple', 'banana', 'orange'])).toBe(true);
        expect(notInValidator('apple', ['apple', 'banana', 'orange'])).toBe(false);
      });
    });
  });

  describe('default sanitizers', () => {
    it('should trim strings', () => {
      const trimSanitizer = validator.sanitizers.get('trim');
      
      expect(trimSanitizer('  hello  ')).toBe('hello');
      expect(trimSanitizer('no trim')).toBe('no trim');
      expect(trimSanitizer(123)).toBe(123);
    });

    it('should convert case', () => {
      const lowercase = validator.sanitizers.get('lowercase');
      const uppercase = validator.sanitizers.get('uppercase');
      
      expect(lowercase('HELLO')).toBe('hello');
      expect(uppercase('hello')).toBe('HELLO');
    });

    it('should escape HTML', () => {
      const escape = validator.sanitizers.get('escape');
      
      expect(escape('<script>alert("xss")</script>'))
        .toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;');
    });

    it('should normalize email', () => {
      const normalizeEmail = validator.sanitizers.get('normalizeEmail');
      
      expect(normalizeEmail('Test@Example.COM')).toMatch(/test@example.com/i);
    });

    it('should convert types', () => {
      const toInt = validator.sanitizers.get('toInt');
      const toFloat = validator.sanitizers.get('toFloat');
      const toBoolean = validator.sanitizers.get('toBoolean');
      
      expect(toInt('123')).toBe(123);
      expect(toFloat('123.45')).toBe(123.45);
      expect(toBoolean('true')).toBe(true);
      expect(toBoolean('1')).toBe(true);
      expect(toBoolean('false')).toBe(false);
    });
  });

  describe('validate middleware', () => {
    let req, res, next;

    beforeEach(() => {
      req = {
        body: {},
        query: {},
        params: {}
      };
      res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      next = jest.fn();
    });

    it('should validate request body', async () => {
      const schema = {
        body: {
          email: {
            required: true,
            email: true
          },
          age: {
            required: true,
            type: 'number',
            min: 18,
            max: 100
          }
        }
      };

      const middleware = validator.validate(schema);
      
      req.body = {
        email: 'test@example.com',
        age: 25
      };

      await middleware(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should return validation errors', async () => {
      const schema = {
        body: {
          email: {
            required: true,
            email: true
          }
        }
      };

      const middleware = validator.validate(schema);
      
      req.body = {
        email: 'invalid-email'
      };

      await middleware(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Validation failed',
        errors: expect.arrayContaining([
          expect.objectContaining({
            field: 'email',
            message: expect.stringContaining('email')
          })
        ])
      });
    });

    it('should validate query parameters', async () => {
      const schema = {
        query: {
          page: {
            type: 'number',
            min: 1
          },
          limit: {
            type: 'number',
            min: 1,
            max: 100
          }
        }
      };

      const middleware = validator.validate(schema);
      
      req.query = {
        page: '2',
        limit: '20'
      };

      await middleware(req, res, next);
      
      expect(next).toHaveBeenCalled();
    });

    it('should sanitize input', async () => {
      const schema = {
        body: {
          email: {
            required: true,
            email: true,
            sanitize: ['trim', 'lowercase']
          },
          description: {
            sanitize: ['trim', 'escape']
          }
        }
      };

      const middleware = validator.validate(schema);
      
      req.body = {
        email: '  TEST@EXAMPLE.COM  ',
        description: '  <script>alert("xss")</script>  '
      };

      await middleware(req, res, next);
      
      expect(req.body.email).toBe('test@example.com');
      expect(req.body.description).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;');
      expect(next).toHaveBeenCalled();
    });

    it('should strip unknown fields', async () => {
      validator.options.stripUnknown = true;
      
      const schema = {
        body: {
          allowed: { type: 'string' }
        }
      };

      const middleware = validator.validate(schema);
      
      req.body = {
        allowed: 'value',
        unknown: 'should be removed'
      };

      await middleware(req, res, next);
      
      expect(req.body.allowed).toBe('value');
      expect(req.body.unknown).toBeUndefined();
    });

    it('should abort early on first error', async () => {
      validator.options.abortEarly = true;
      
      const schema = {
        body: {
          field1: { required: true },
          field2: { required: true }
        }
      };

      const middleware = validator.validate(schema);
      
      req.body = {};

      await middleware(req, res, next);
      
      expect(res.json).toHaveBeenCalledWith({
        error: 'Validation failed',
        errors: expect.arrayContaining([
          expect.objectContaining({ field: 'field1' })
        ])
      });
      expect(res.json.mock.calls[0][0].errors).toHaveLength(1);
    });
  });

  describe('custom validators and sanitizers', () => {
    it('should register custom validator', () => {
      validator.registerValidator('isEven', (value) => {
        return Number(value) % 2 === 0;
      });

      const isEven = validator.validators.get('isEven');
      expect(isEven(4)).toBe(true);
      expect(isEven(3)).toBe(false);
    });

    it('should register custom sanitizer', () => {
      validator.registerSanitizer('reverse', (value) => {
        return typeof value === 'string' ? value.split('').reverse().join('') : value;
      });

      const reverse = validator.sanitizers.get('reverse');
      expect(reverse('hello')).toBe('olleh');
    });

    it('should throw on invalid validator', () => {
      expect(() => validator.registerValidator('bad', 'not a function'))
        .toThrow('Validator must be a function');
    });

    it('should throw on invalid sanitizer', () => {
      expect(() => validator.registerSanitizer('bad', 'not a function'))
        .toThrow('Sanitizer must be a function');
    });
  });

  describe('schema registration', () => {
    it('should register and use named schemas', async () => {
      const userSchema = {
        body: {
          username: { required: true, min: 3 },
          email: { required: true, email: true }
        }
      };

      validator.registerSchema('user', userSchema);
      
      const middleware = validator.validate('user');
      
      const req = {
        body: { username: 'john', email: 'john@example.com' }
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      await middleware(req, res, next);
      
      expect(next).toHaveBeenCalled();
    });

    it('should throw for unknown schema', () => {
      expect(() => validator.validate('unknown'))
        .toThrow("Schema 'unknown' not found");
    });
  });

  describe('SQL injection prevention', () => {
    it('should remove SQL keywords', () => {
      const input = "SELECT * FROM users WHERE id = 1; DROP TABLE users;";
      const sanitized = validator.preventSQLInjection(input);
      
      expect(sanitized).not.toContain('SELECT');
      expect(sanitized).not.toContain('DROP');
      expect(sanitized).not.toContain('TABLE');
    });

    it('should escape quotes', () => {
      const input = "O'Reilly";
      const sanitized = validator.preventSQLInjection(input);
      
      expect(sanitized).toBe("O''Reilly");
    });

    it('should remove SQL comments', () => {
      const input = "value -- comment /* block comment */";
      const sanitized = validator.preventSQLInjection(input);
      
      expect(sanitized).not.toContain('--');
      expect(sanitized).not.toContain('/*');
      expect(sanitized).not.toContain('*/');
    });

    it('should handle non-string input', () => {
      expect(validator.preventSQLInjection(123)).toBe(123);
      expect(validator.preventSQLInjection(null)).toBe(null);
    });
  });

  describe('XSS prevention', () => {
    it('should remove script tags', () => {
      const input = '<script>alert("xss")</script>Hello';
      const sanitized = validator.preventXSS(input);
      
      expect(sanitized).toBe('Hello');
      expect(sanitized).not.toContain('<script>');
    });

    it('should keep text content', () => {
      const input = '<p>Hello <b>world</b></p>';
      const sanitized = validator.preventXSS(input);
      
      expect(sanitized).toBe('Hello world');
    });

    it('should handle non-string input', () => {
      expect(validator.preventXSS(123)).toBe(123);
      expect(validator.preventXSS(null)).toBe(null);
    });
  });

  describe('sanitize method', () => {
    it('should apply multiple sanitizations', () => {
      const input = '  <script>SELECT * FROM users</script>  ';
      const sanitized = validator.sanitize(input);
      
      expect(sanitized).not.toMatch(/^\s+/); // Trimmed
      expect(sanitized).not.toContain('SELECT'); // SQL removed
      expect(sanitized).not.toContain('<script>'); // XSS removed
    });

    it('should sanitize objects recursively', () => {
      const input = {
        name: '  John  ',
        comment: '<script>alert("xss")</script>',
        nested: {
          value: 'SELECT * FROM users'
        }
      };

      const sanitized = validator.sanitize(input);
      
      expect(sanitized.name).toBe('John');
      expect(sanitized.comment).not.toContain('<script>');
      expect(sanitized.nested.value).not.toContain('SELECT');
    });

    it('should handle arrays', () => {
      const input = ['  value1  ', '<script>xss</script>', 'normal'];
      const sanitized = validator.sanitize(input);
      
      expect(sanitized[0]).toBe('value1');
      expect(sanitized[1]).not.toContain('<script>');
      expect(sanitized[2]).toBe('normal');
    });
  });

  describe('OpenAPI/Swagger integration', () => {
    it('should create validation rules from OpenAPI schema', () => {
      const openAPISchema = {
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'integer' }
          },
          {
            name: 'email',
            in: 'query',
            schema: { type: 'string', format: 'email' }
          }
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                properties: {
                  username: { type: 'string', minLength: 3, maxLength: 20 },
                  age: { type: 'integer', minimum: 18, maximum: 100 }
                },
                required: ['username']
              }
            }
          }
        }
      };

      const validationSchema = validator.fromOpenAPISchema(openAPISchema);
      
      expect(validationSchema.path?.id).toEqual({
        required: true,
        type: 'integer'
      });
      
      expect(validationSchema.query?.email).toEqual({
        required: false,
        type: 'string',
        email: true
      });
      
      expect(validationSchema.body?.username).toEqual({
        required: true,
        type: 'string',
        min: 3,
        max: 20
      });
      
      expect(validationSchema.body?.age).toEqual({
        required: false,
        type: 'integer',
        min: 18,
        max: 100
      });
    });
  });
});