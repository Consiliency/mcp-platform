/**
 * Input Validation Module
 * Provides comprehensive input validation and sanitization
 * 
 * @module security/validation/input-validator
 */

const validator = require('validator');
const createDOMPurify = require('isomorphic-dompurify');

class InputValidator {
  constructor(options = {}) {
    this.options = {
      // Validation options
      stripUnknown: options.stripUnknown !== false,
      abortEarly: options.abortEarly || false,
      allowUnknown: options.allowUnknown || false,
      
      // Sanitization options
      trim: options.trim !== false,
      escape: options.escape || false,
      normalizeEmail: options.normalizeEmail !== false,
      
      // SQL injection prevention
      sqlBlacklist: options.sqlBlacklist || [
        'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE',
        'ALTER', 'EXEC', 'UNION', 'FETCH', 'DECLARE', 'TRUNCATE'
      ],
      
      // Custom error messages
      messages: {
        required: '{field} is required',
        email: '{field} must be a valid email',
        min: '{field} must be at least {min}',
        max: '{field} must be at most {max}',
        pattern: '{field} has invalid format',
        ...options.messages
      },
      
      ...options
    };

    // Initialize validators and sanitizers
    this.validators = new Map();
    this.sanitizers = new Map();
    this.schemas = new Map();
    
    // Initialize DOMPurify for XSS prevention
    this.DOMPurify = createDOMPurify();
    
    // Register default validators
    this.registerDefaultValidators();
    
    // Register default sanitizers
    this.registerDefaultSanitizers();
  }

  /**
   * Register default validators
   */
  registerDefaultValidators() {
    // Required validator
    this.registerValidator('required', (value) => {
      return value !== undefined && value !== null && value !== '';
    });

    // Email validator
    this.registerValidator('email', (value) => {
      return typeof value === 'string' && validator.isEmail(value);
    });

    // URL validator
    this.registerValidator('url', (value) => {
      return typeof value === 'string' && validator.isURL(value);
    });

    // Alpha validator
    this.registerValidator('alpha', (value) => {
      return typeof value === 'string' && validator.isAlpha(value);
    });

    // Alphanumeric validator
    this.registerValidator('alphanumeric', (value) => {
      return typeof value === 'string' && validator.isAlphanumeric(value);
    });

    // Numeric validator
    this.registerValidator('numeric', (value) => {
      return typeof value === 'string' && validator.isNumeric(value);
    });

    // Integer validator
    this.registerValidator('integer', (value) => {
      return Number.isInteger(Number(value));
    });

    // Float validator
    this.registerValidator('float', (value) => {
      return !isNaN(parseFloat(value)) && isFinite(value);
    });

    // Boolean validator
    this.registerValidator('boolean', (value) => {
      return typeof value === 'boolean' || ['true', 'false', '1', '0'].includes(String(value));
    });

    // Date validator
    this.registerValidator('date', (value) => {
      return typeof value === 'string' && validator.isISO8601(value);
    });

    // UUID validator
    this.registerValidator('uuid', (value) => {
      return typeof value === 'string' && validator.isUUID(value);
    });

    // JSON validator
    this.registerValidator('json', (value) => {
      try {
        JSON.parse(value);
        return true;
      } catch {
        return false;
      }
    });

    // Length validators
    this.registerValidator('min', (value, min) => {
      if (typeof value === 'string') return value.length >= min;
      if (typeof value === 'number') return value >= min;
      if (Array.isArray(value)) return value.length >= min;
      return false;
    });

    this.registerValidator('max', (value, max) => {
      if (typeof value === 'string') return value.length <= max;
      if (typeof value === 'number') return value <= max;
      if (Array.isArray(value)) return value.length <= max;
      return false;
    });

    // Pattern validator
    this.registerValidator('pattern', (value, pattern) => {
      const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern);
      return regex.test(String(value));
    });

    // In validator
    this.registerValidator('in', (value, allowed) => {
      return allowed.includes(value);
    });

    // Not in validator
    this.registerValidator('notIn', (value, disallowed) => {
      return !disallowed.includes(value);
    });

    // Credit card validator
    this.registerValidator('creditCard', (value) => {
      return typeof value === 'string' && validator.isCreditCard(value);
    });

    // IP validator
    this.registerValidator('ip', (value, version) => {
      return typeof value === 'string' && validator.isIP(value, version);
    });

    // Phone validator
    this.registerValidator('phone', (value, locale) => {
      return typeof value === 'string' && validator.isMobilePhone(value, locale || 'any');
    });

    // Postal code validator
    this.registerValidator('postalCode', (value, locale) => {
      return typeof value === 'string' && validator.isPostalCode(value, locale || 'any');
    });
  }

  /**
   * Register default sanitizers
   */
  registerDefaultSanitizers() {
    // Trim sanitizer
    this.registerSanitizer('trim', (value) => {
      return typeof value === 'string' ? value.trim() : value;
    });

    // Lowercase sanitizer
    this.registerSanitizer('lowercase', (value) => {
      return typeof value === 'string' ? value.toLowerCase() : value;
    });

    // Uppercase sanitizer
    this.registerSanitizer('uppercase', (value) => {
      return typeof value === 'string' ? value.toUpperCase() : value;
    });

    // Escape HTML sanitizer
    this.registerSanitizer('escape', (value) => {
      return typeof value === 'string' ? validator.escape(value) : value;
    });

    // Normalize email sanitizer
    this.registerSanitizer('normalizeEmail', (value) => {
      return typeof value === 'string' ? validator.normalizeEmail(value) : value;
    });

    // To integer sanitizer
    this.registerSanitizer('toInt', (value) => {
      return validator.toInt(String(value));
    });

    // To float sanitizer
    this.registerSanitizer('toFloat', (value) => {
      return validator.toFloat(String(value));
    });

    // To boolean sanitizer
    this.registerSanitizer('toBoolean', (value) => {
      return validator.toBoolean(String(value));
    });

    // To date sanitizer
    this.registerSanitizer('toDate', (value) => {
      const date = validator.toDate(String(value));
      return date || value;
    });

    // Strip tags sanitizer
    this.registerSanitizer('stripTags', (value) => {
      return typeof value === 'string' ? validator.stripLow(value) : value;
    });

    // Blacklist sanitizer
    this.registerSanitizer('blacklist', (value, chars) => {
      return typeof value === 'string' ? validator.blacklist(value, chars) : value;
    });

    // Whitelist sanitizer
    this.registerSanitizer('whitelist', (value, chars) => {
      return typeof value === 'string' ? validator.whitelist(value, chars) : value;
    });
  }

  /**
   * Register custom validator
   */
  registerValidator(name, validatorFn) {
    if (typeof validatorFn !== 'function') {
      throw new Error('Validator must be a function');
    }
    this.validators.set(name, validatorFn);
    return this;
  }

  /**
   * Register custom sanitizer
   */
  registerSanitizer(name, sanitizerFn) {
    if (typeof sanitizerFn !== 'function') {
      throw new Error('Sanitizer must be a function');
    }
    this.sanitizers.set(name, sanitizerFn);
    return this;
  }

  /**
   * Register validation schema
   */
  registerSchema(name, schema) {
    this.schemas.set(name, schema);
    return this;
  }

  /**
   * Validate input against schema
   */
  validate(schema) {
    // If schema is a string, look it up
    if (typeof schema === 'string') {
      schema = this.schemas.get(schema);
      if (!schema) {
        throw new Error(`Schema '${schema}' not found`);
      }
    }

    return async (req, res, next) => {
      try {
        const errors = [];
        const validated = {};

        // Validate each source (body, query, params)
        const sources = {
          body: req.body || {},
          query: req.query || {},
          params: req.params || {}
        };

        for (const [source, fields] of Object.entries(schema)) {
          if (!sources[source]) continue;

          for (const [field, rules] of Object.entries(fields)) {
            const value = sources[source][field];
            const fieldErrors = await this.validateField(field, value, rules);

            if (fieldErrors.length > 0) {
              errors.push(...fieldErrors);
              if (this.options.abortEarly) {
                break;
              }
            } else {
              // Apply sanitizers
              let sanitizedValue = value;
              if (rules.sanitize) {
                sanitizedValue = await this.sanitizeValue(value, rules.sanitize);
              }

              if (!validated[source]) validated[source] = {};
              validated[source][field] = sanitizedValue;
            }
          }

          // Strip unknown fields if configured
          if (this.options.stripUnknown) {
            const allowedFields = Object.keys(fields);
            for (const field in sources[source]) {
              if (!allowedFields.includes(field) && !this.options.allowUnknown) {
                delete sources[source][field];
              }
            }
          }
        }

        if (errors.length > 0) {
          return res.status(400).json({
            error: 'Validation failed',
            errors: errors.map(e => ({
              field: e.field,
              message: e.message,
              value: e.value
            }))
          });
        }

        // Update request with validated and sanitized data
        Object.assign(req.body || {}, validated.body || {});
        Object.assign(req.query || {}, validated.query || {});
        Object.assign(req.params || {}, validated.params || {});

        next();
      } catch (error) {
        console.error('Validation middleware error:', error);
        res.status(500).json({ error: 'Validation error' });
      }
    };
  }

  /**
   * Validate a single field
   */
  async validateField(field, value, rules) {
    const errors = [];

    // Check required
    if (rules.required && (value === undefined || value === null || value === '')) {
      errors.push({
        field,
        message: this.formatMessage(this.options.messages.required, { field }),
        value
      });
      return errors; // No point in further validation
    }

    // Skip validation if not required and empty
    if (!rules.required && (value === undefined || value === null || value === '')) {
      return errors;
    }

    // Check type
    if (rules.type && !this.checkType(value, rules.type)) {
      errors.push({
        field,
        message: `${field} must be of type ${rules.type}`,
        value
      });
    }

    // Apply validators
    for (const [validatorName, validatorParam] of Object.entries(rules)) {
      if (['required', 'type', 'sanitize'].includes(validatorName)) continue;

      const validator = this.validators.get(validatorName);
      if (!validator) continue;

      const isValid = await validator(value, validatorParam);
      if (!isValid) {
        const message = this.formatMessage(
          this.options.messages[validatorName] || `${field} is invalid`,
          { field, [validatorName]: validatorParam, value }
        );
        errors.push({ field, message, value });
      }
    }

    return errors;
  }

  /**
   * Check value type
   */
  checkType(value, type) {
    switch (type) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' || !isNaN(Number(value));
      case 'boolean':
        return typeof value === 'boolean' || ['true', 'false', '1', '0'].includes(String(value));
      case 'array':
        return Array.isArray(value);
      case 'object':
        return typeof value === 'object' && !Array.isArray(value) && value !== null;
      default:
        return true;
    }
  }

  /**
   * Format error message
   */
  formatMessage(template, params) {
    return template.replace(/{(\w+)}/g, (match, key) => {
      return params[key] !== undefined ? params[key] : match;
    });
  }

  /**
   * Sanitize value
   */
  async sanitizeValue(value, sanitizers) {
    let sanitized = value;

    if (typeof sanitizers === 'string') {
      sanitizers = [sanitizers];
    }

    for (const sanitizerConfig of sanitizers) {
      let sanitizerName, sanitizerParam;

      if (typeof sanitizerConfig === 'string') {
        sanitizerName = sanitizerConfig;
      } else if (typeof sanitizerConfig === 'object') {
        sanitizerName = sanitizerConfig.name;
        sanitizerParam = sanitizerConfig.param;
      }

      const sanitizer = this.sanitizers.get(sanitizerName);
      if (sanitizer) {
        sanitized = await sanitizer(sanitized, sanitizerParam);
      }
    }

    return sanitized;
  }

  /**
   * Sanitize input to prevent various attacks
   */
  sanitize(input, rules = {}) {
    if (typeof input === 'string') {
      // Apply default sanitization
      let sanitized = input;

      if (this.options.trim) {
        sanitized = sanitized.trim();
      }

      if (this.options.escape || rules.escape) {
        sanitized = validator.escape(sanitized);
      }

      // Prevent SQL injection
      if (rules.sql !== false) {
        sanitized = this.preventSQLInjection(sanitized);
      }

      // Prevent XSS
      if (rules.xss !== false) {
        sanitized = this.preventXSS(sanitized);
      }

      return sanitized;
    }

    if (typeof input === 'object' && input !== null) {
      const sanitized = Array.isArray(input) ? [] : {};
      
      for (const key in input) {
        if (input.hasOwnProperty(key)) {
          sanitized[key] = this.sanitize(input[key], rules);
        }
      }
      
      return sanitized;
    }

    return input;
  }

  /**
   * Prevent SQL injection
   */
  preventSQLInjection(input) {
    if (typeof input !== 'string') return input;

    // Remove SQL keywords (case-insensitive)
    let sanitized = input;
    
    this.options.sqlBlacklist.forEach(keyword => {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      sanitized = sanitized.replace(regex, '');
    });

    // Escape single quotes
    sanitized = sanitized.replace(/'/g, "''");

    // Remove SQL comment indicators
    sanitized = sanitized.replace(/--/g, '');
    sanitized = sanitized.replace(/\/\*/g, '');
    sanitized = sanitized.replace(/\*\//g, '');

    // Remove semicolons that could terminate statements
    sanitized = sanitized.replace(/;/g, '');

    return sanitized;
  }

  /**
   * Prevent XSS attacks
   */
  preventXSS(input) {
    if (typeof input !== 'string') return input;

    // Use DOMPurify for comprehensive XSS prevention
    return this.DOMPurify.sanitize(input, {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
      KEEP_CONTENT: true
    });
  }

  /**
   * Create validation rules from OpenAPI/Swagger schema
   */
  fromOpenAPISchema(openAPISchema) {
    const validationSchema = {};

    // Parse parameters
    if (openAPISchema.parameters) {
      openAPISchema.parameters.forEach(param => {
        const location = param.in; // 'query', 'path', 'header', 'cookie'
        const name = param.name;
        const schema = param.schema || {};

        if (!validationSchema[location]) {
          validationSchema[location] = {};
        }

        const rules = {
          required: param.required || false,
          type: schema.type
        };

        // Add format-based validators
        switch (schema.format) {
          case 'email':
            rules.email = true;
            break;
          case 'uri':
          case 'url':
            rules.url = true;
            break;
          case 'uuid':
            rules.uuid = true;
            break;
          case 'date':
          case 'date-time':
            rules.date = true;
            break;
        }

        // Add constraints
        if (schema.minimum !== undefined) rules.min = schema.minimum;
        if (schema.maximum !== undefined) rules.max = schema.maximum;
        if (schema.minLength !== undefined) rules.min = schema.minLength;
        if (schema.maxLength !== undefined) rules.max = schema.maxLength;
        if (schema.pattern) rules.pattern = schema.pattern;
        if (schema.enum) rules.in = schema.enum;

        validationSchema[location][name] = rules;
      });
    }

    // Parse request body
    if (openAPISchema.requestBody && openAPISchema.requestBody.content) {
      const jsonSchema = openAPISchema.requestBody.content['application/json'];
      if (jsonSchema && jsonSchema.schema) {
        validationSchema.body = this.parseJSONSchema(jsonSchema.schema);
      }
    }

    return validationSchema;
  }

  /**
   * Parse JSON Schema to validation rules
   */
  parseJSONSchema(schema, required = []) {
    const rules = {};

    if (schema.properties) {
      Object.entries(schema.properties).forEach(([key, prop]) => {
        rules[key] = {
          required: required.includes(key) || (schema.required && schema.required.includes(key)),
          type: prop.type
        };

        // Add validators based on schema
        if (prop.format) {
          switch (prop.format) {
            case 'email':
              rules[key].email = true;
              break;
            case 'uri':
              rules[key].url = true;
              break;
            // Add more format mappings as needed
          }
        }

        if (prop.minimum !== undefined) rules[key].min = prop.minimum;
        if (prop.maximum !== undefined) rules[key].max = prop.maximum;
        if (prop.minLength !== undefined) rules[key].min = prop.minLength;
        if (prop.maxLength !== undefined) rules[key].max = prop.maxLength;
        if (prop.pattern) rules[key].pattern = prop.pattern;
        if (prop.enum) rules[key].in = prop.enum;
      });
    }

    return rules;
  }
}

module.exports = InputValidator;