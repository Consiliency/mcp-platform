/**
 * XSS Protection Middleware
 * Provides comprehensive XSS protection for Express applications
 * 
 * @module security/middleware/xss
 */

const createDOMPurify = require('isomorphic-dompurify');

class XSSProtection {
  constructor(options = {}) {
    this.options = {
      // Sanitization options
      stripIgnoreTag: options.stripIgnoreTag !== false,
      stripIgnoreTagBody: options.stripIgnoreTagBody || ['script', 'style'],
      allowedTags: options.allowedTags || [
        'a', 'b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li',
        'blockquote', 'code', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'
      ],
      allowedAttributes: options.allowedAttributes || {
        'a': ['href', 'title', 'target'],
        '*': ['class', 'id']
      },
      allowedSchemes: options.allowedSchemes || ['http', 'https', 'mailto'],
      
      // Protection levels
      mode: options.mode || 'sanitize', // 'sanitize', 'escape', 'reject'
      
      // Field filtering
      includeQuery: options.includeQuery !== false,
      includeBody: options.includeBody !== false,
      includeParams: options.includeParams !== false,
      includeCookies: options.includeCookies || false,
      includeHeaders: options.includeHeaders || false,
      
      // Whitelist/blacklist fields
      whitelistFields: options.whitelistFields || [],
      blacklistFields: options.blacklistFields || ['password', 'token', 'secret', 'key'],
      
      // Custom sanitizers
      customSanitizers: options.customSanitizers || {},
      
      // Logging
      logViolations: options.logViolations !== false,
      onViolation: options.onViolation,
      
      ...options
    };

    // Initialize DOMPurify
    this.DOMPurify = createDOMPurify();
    
    // Configure DOMPurify
    this.configureDOMPurify();
    
    // Track violations
    this.violations = [];
    this.maxViolations = options.maxViolations || 1000;
  }

  /**
   * Configure DOMPurify with our options
   */
  configureDOMPurify() {
    // Add hook to track removed elements
    this.DOMPurify.addHook('uponSanitizeElement', (node, data) => {
      if (data.tagName) {
        this.trackViolation('element', data.tagName);
      }
    });

    // Add hook to track removed attributes
    this.DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
      if (data.attrName) {
        this.trackViolation('attribute', data.attrName);
      }
    });
  }

  /**
   * Track XSS violation
   */
  trackViolation(type, value, context = {}) {
    const violation = {
      type,
      value,
      timestamp: new Date(),
      ...context
    };

    this.violations.push(violation);
    
    // Limit stored violations
    if (this.violations.length > this.maxViolations) {
      this.violations = this.violations.slice(-this.maxViolations);
    }

    if (this.options.logViolations) {
      console.warn('XSS violation detected:', violation);
    }

    if (this.options.onViolation) {
      this.options.onViolation(violation);
    }
  }

  /**
   * Sanitize a value based on mode
   */
  sanitizeValue(value, fieldName, context = {}) {
    if (typeof value !== 'string') {
      return value;
    }

    // Check if field is whitelisted (skip sanitization)
    if (this.options.whitelistFields.includes(fieldName)) {
      return value;
    }

    // Check if field is blacklisted (skip entirely)
    if (this.options.blacklistFields.includes(fieldName)) {
      return value;
    }

    // Apply custom sanitizer if available
    if (this.options.customSanitizers[fieldName]) {
      return this.options.customSanitizers[fieldName](value);
    }

    const originalValue = value;
    let sanitized;

    switch (this.options.mode) {
      case 'escape':
        sanitized = this.escapeHtml(value);
        break;
        
      case 'reject':
        if (this.containsXSS(value)) {
          this.trackViolation('rejected', fieldName, { ...context, value: originalValue });
          throw new Error(`XSS detected in field: ${fieldName}`);
        }
        return value;
        
      case 'sanitize':
      default:
        sanitized = this.DOMPurify.sanitize(value, {
          ALLOWED_TAGS: this.options.allowedTags,
          ALLOWED_ATTR: Object.keys(this.options.allowedAttributes).reduce((attrs, tag) => {
            return attrs.concat(this.options.allowedAttributes[tag]);
          }, []),
          ALLOWED_URI_REGEXP: this.createUriRegexp(),
          KEEP_CONTENT: this.options.stripIgnoreTag,
          FORBID_TAGS: this.options.stripIgnoreTagBody,
          FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover']
        });
    }

    // Track if value was modified
    if (sanitized !== originalValue) {
      this.trackViolation('sanitized', fieldName, { 
        ...context,
        original: originalValue,
        sanitized 
      });
    }

    return sanitized;
  }

  /**
   * Escape HTML entities
   */
  escapeHtml(value) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;',
      '/': '&#x2F;'
    };
    
    return value.replace(/[&<>"'/]/g, char => map[char]);
  }

  /**
   * Check if value contains potential XSS
   */
  containsXSS(value) {
    if (typeof value !== 'string') {
      return false;
    }

    // Common XSS patterns
    const xssPatterns = [
      /<script[\s\S]*?>/i,
      /<iframe[\s\S]*?>/i,
      /javascript:/i,
      /on\w+\s*=/i,
      /<object[\s\S]*?>/i,
      /<embed[\s\S]*?>/i,
      /<link[\s\S]*?>/i,
      /eval\s*\(/i,
      /expression\s*\(/i,
      /<img[\s\S]*?onerror/i,
      /<svg[\s\S]*?onload/i
    ];

    return xssPatterns.some(pattern => pattern.test(value));
  }

  /**
   * Create URI validation regexp
   */
  createUriRegexp() {
    const schemes = this.options.allowedSchemes.join('|');
    return new RegExp(`^(${schemes})://`, 'i');
  }

  /**
   * Sanitize an object recursively
   */
  sanitizeObject(obj, path = '', context = {}) {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string') {
      return this.sanitizeValue(obj, path, context);
    }

    if (Array.isArray(obj)) {
      return obj.map((item, index) => 
        this.sanitizeObject(item, `${path}[${index}]`, context)
      );
    }

    if (typeof obj === 'object') {
      const sanitized = {};
      
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          const fieldPath = path ? `${path}.${key}` : key;
          
          // Sanitize the key itself
          const sanitizedKey = this.sanitizeValue(key, 'objectKey', context);
          
          // Sanitize the value
          sanitized[sanitizedKey] = this.sanitizeObject(obj[key], fieldPath, context);
        }
      }
      
      return sanitized;
    }

    return obj;
  }

  /**
   * Create XSS protection middleware
   */
  createMiddleware() {
    return (req, res, next) => {
      try {
        const context = {
          method: req.method,
          path: req.path,
          ip: req.ip
        };

        // Sanitize query parameters
        if (this.options.includeQuery && req.query) {
          req.query = this.sanitizeObject(req.query, 'query', context);
        }

        // Sanitize body
        if (this.options.includeBody && req.body) {
          req.body = this.sanitizeObject(req.body, 'body', context);
        }

        // Sanitize params
        if (this.options.includeParams && req.params) {
          req.params = this.sanitizeObject(req.params, 'params', context);
        }

        // Sanitize cookies
        if (this.options.includeCookies && req.cookies) {
          req.cookies = this.sanitizeObject(req.cookies, 'cookies', context);
        }

        // Sanitize specific headers
        if (this.options.includeHeaders && req.headers) {
          const headersToSanitize = Array.isArray(this.options.includeHeaders) 
            ? this.options.includeHeaders 
            : ['user-agent', 'referer'];
            
          headersToSanitize.forEach(header => {
            if (req.headers[header]) {
              req.headers[header] = this.sanitizeValue(
                req.headers[header], 
                `header.${header}`, 
                context
              );
            }
          });
        }

        // Add XSS protection headers
        res.setHeader('X-XSS-Protection', '1; mode=block');
        res.setHeader('X-Content-Type-Options', 'nosniff');

        next();
      } catch (error) {
        if (this.options.mode === 'reject' && error.message.includes('XSS detected')) {
          return res.status(400).json({ 
            error: 'Invalid input detected',
            message: error.message 
          });
        }
        
        console.error('XSS protection middleware error:', error);
        next(error);
      }
    };
  }

  /**
   * Create output sanitization middleware
   */
  createOutputSanitizer() {
    return (req, res, next) => {
      // Override res.json to sanitize output
      const originalJson = res.json.bind(res);
      
      res.json = (data) => {
        try {
          const sanitized = this.sanitizeObject(data, 'response', {
            method: req.method,
            path: req.path
          });
          return originalJson(sanitized);
        } catch (error) {
          console.error('Output sanitization error:', error);
          return originalJson(data);
        }
      };

      // Override res.send for string responses
      const originalSend = res.send.bind(res);
      
      res.send = (data) => {
        if (typeof data === 'string') {
          try {
            data = this.sanitizeValue(data, 'response', {
              method: req.method,
              path: req.path
            });
          } catch (error) {
            console.error('Output sanitization error:', error);
          }
        }
        return originalSend(data);
      };

      next();
    };
  }

  /**
   * Create field-specific sanitizer
   */
  createFieldSanitizer(fields) {
    return (req, res, next) => {
      try {
        fields.forEach(field => {
          const parts = field.split('.');
          let obj = req;
          
          // Navigate to the field
          for (let i = 0; i < parts.length - 1; i++) {
            obj = obj[parts[i]];
            if (!obj) return;
          }
          
          const fieldName = parts[parts.length - 1];
          if (obj[fieldName]) {
            obj[fieldName] = this.sanitizeValue(obj[fieldName], field, {
              method: req.method,
              path: req.path
            });
          }
        });

        next();
      } catch (error) {
        console.error('Field sanitizer error:', error);
        next(error);
      }
    };
  }

  /**
   * Get violation statistics
   */
  getViolationStats() {
    const stats = {
      total: this.violations.length,
      byType: {},
      byField: {},
      byPath: {},
      recentViolations: []
    };

    for (const violation of this.violations) {
      // Count by type
      stats.byType[violation.type] = (stats.byType[violation.type] || 0) + 1;
      
      // Count by field
      if (violation.value) {
        stats.byField[violation.value] = (stats.byField[violation.value] || 0) + 1;
      }
      
      // Count by path
      if (violation.path) {
        stats.byPath[violation.path] = (stats.byPath[violation.path] || 0) + 1;
      }
    }

    // Get recent violations
    stats.recentViolations = this.violations
      .slice(-10)
      .map(v => ({
        type: v.type,
        value: v.value,
        timestamp: v.timestamp,
        path: v.path
      }));

    return stats;
  }

  /**
   * Clear violation history
   */
  clearViolations() {
    this.violations = [];
    return { success: true };
  }

  /**
   * Test if a value would be sanitized
   */
  testSanitization(value, options = {}) {
    const originalMode = this.options.mode;
    this.options.mode = options.mode || 'sanitize';

    try {
      const sanitized = this.sanitizeValue(value, 'test');
      const wouldBeSanitized = sanitized !== value;
      
      return {
        original: value,
        sanitized,
        wouldBeSanitized,
        containsXSS: this.containsXSS(value)
      };
    } finally {
      this.options.mode = originalMode;
    }
  }
}

module.exports = XSSProtection;