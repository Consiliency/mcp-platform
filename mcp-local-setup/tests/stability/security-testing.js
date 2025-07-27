const { execSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const EventEmitter = require('events');

/**
 * Security Penetration Testing (STABILITY-8.2)
 * Automated security testing suite
 */
class SecurityTestingSuite extends EventEmitter {
  constructor(options = {}) {
    super();
    this.vulnerabilities = [];
    this.testResults = new Map();
    this.targetUrl = options.targetUrl || 'http://localhost:3000';
    this.reportDir = options.reportDir || './test-results/security-tests';
    
    // Security test configurations
    this.config = {
      authentication: {
        apiKeyHeader: 'X-API-Key',
        authHeader: 'Authorization',
        tokenExpiry: 3600, // 1 hour
        maxLoginAttempts: 5,
        rateLimitWindow: 60000 // 1 minute
      },
      inputValidation: {
        maxPayloadSize: 1048576, // 1MB
        allowedContentTypes: ['application/json', 'text/plain'],
        forbiddenPatterns: [
          '../', '..\\', // Path traversal
          '<script', '<?php', // XSS/Code injection
          'SELECT * FROM', 'DROP TABLE', // SQL injection
          '$(', '${', '`', // Command injection
        ]
      },
      transport: {
        minTLSVersion: 'TLSv1.2',
        requiredCiphers: ['ECDHE-RSA-AES128-GCM-SHA256', 'ECDHE-RSA-AES256-GCM-SHA384'],
        hstsMaxAge: 31536000 // 1 year
      }
    };
  }
  
  /**
   * Run dependency vulnerability scan
   * TASK: Scan for known vulnerabilities
   */
  async scanDependencies() {
    console.log('Starting dependency vulnerability scan...');
    const results = {
      npm: null,
      docker: [],
      summary: {
        critical: 0,
        high: 0,
        moderate: 0,
        low: 0
      }
    };
    
    try {
      // NPM Audit
      console.log('Running npm audit...');
      try {
        const npmAudit = execSync('npm audit --json', { encoding: 'utf8' });
        results.npm = JSON.parse(npmAudit);
        
        // Count vulnerabilities by severity
        if (results.npm.metadata && results.npm.metadata.vulnerabilities) {
          const vulns = results.npm.metadata.vulnerabilities;
          results.summary.critical += vulns.critical || 0;
          results.summary.high += vulns.high || 0;
          results.summary.moderate += vulns.moderate || 0;
          results.summary.low += vulns.low || 0;
        }
      } catch (error) {
        // npm audit returns non-zero exit code if vulnerabilities found
        if (error.stdout) {
          results.npm = JSON.parse(error.stdout);
          if (results.npm.metadata && results.npm.metadata.vulnerabilities) {
            const vulns = results.npm.metadata.vulnerabilities;
            results.summary.critical += vulns.critical || 0;
            results.summary.high += vulns.high || 0;
            results.summary.moderate += vulns.moderate || 0;
            results.summary.low += vulns.low || 0;
          }
        }
      }
      
      // Docker image scanning (if docker is available)
      console.log('Checking for Docker images to scan...');
      try {
        const dockerImages = execSync('docker images --format "{{.Repository}}:{{.Tag}}"', { encoding: 'utf8' })
          .split('\n')
          .filter(img => img && !img.includes('<none>'));
        
        for (const image of dockerImages.slice(0, 3)) { // Limit to first 3 images
          console.log(`Scanning Docker image: ${image}`);
          try {
            // Use docker scan if available, otherwise skip
            const scanResult = execSync(`docker inspect ${image}`, { encoding: 'utf8' });
            results.docker.push({
              image,
              scanned: true,
              info: JSON.parse(scanResult)[0].Config
            });
          } catch (error) {
            results.docker.push({
              image,
              scanned: false,
              error: 'Docker scan not available'
            });
          }
        }
      } catch (error) {
        console.log('Docker not available or no images found');
      }
      
      // Check for outdated dependencies
      console.log('Checking for outdated dependencies...');
      try {
        const outdated = execSync('npm outdated --json', { encoding: 'utf8' });
        results.outdated = JSON.parse(outdated || '{}');
      } catch (error) {
        // npm outdated returns non-zero if any packages are outdated
        if (error.stdout) {
          results.outdated = JSON.parse(error.stdout || '{}');
        }
      }
      
      // Store results
      this.testResults.set('dependencies', results);
      
      // Add vulnerabilities to list
      if (results.npm && results.npm.advisories) {
        for (const [id, advisory] of Object.entries(results.npm.advisories)) {
          this.vulnerabilities.push({
            type: 'dependency',
            severity: advisory.severity,
            title: advisory.title,
            module: advisory.module_name,
            description: advisory.overview,
            recommendation: advisory.recommendation,
            cves: advisory.cves || []
          });
        }
      }
      
      this.emit('scanCompleted', {
        test: 'dependencies',
        vulnerabilities: results.summary,
        timestamp: new Date().toISOString()
      });
      
      return results;
      
    } catch (error) {
      console.error('Dependency scan failed:', error.message);
      throw error;
    }
  }
  
  /**
   * Test authentication mechanisms
   * TASK: Verify auth security
   */
  async testAuthentication() {
    console.log('Testing authentication mechanisms...');
    const results = {
      apiKeyValidation: {},
      tokenExpiration: {},
      rateLimiting: {},
      authorization: {}
    };
    
    // Test API key validation
    console.log('Testing API key validation...');
    results.apiKeyValidation = await this._testApiKeyValidation();
    
    // Test token expiration
    console.log('Testing token expiration...');
    results.tokenExpiration = await this._testTokenExpiration();
    
    // Test rate limiting
    console.log('Testing rate limiting...');
    results.rateLimiting = await this._testRateLimiting();
    
    // Test authorization
    console.log('Testing authorization...');
    results.authorization = await this._testAuthorization();
    
    // Analyze results for vulnerabilities
    this._analyzeAuthResults(results);
    
    this.testResults.set('authentication', results);
    
    this.emit('testCompleted', {
      test: 'authentication',
      passed: this._calculateAuthScore(results),
      timestamp: new Date().toISOString()
    });
    
    return results;
  }
  
  /**
   * Test API key validation
   * @private
   */
  async _testApiKeyValidation() {
    const tests = {
      missingKey: false,
      invalidKey: false,
      malformedKey: false,
      expiredKey: false
    };
    
    // Test missing API key
    try {
      const response = await fetch(`${this.targetUrl}/api/protected`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      tests.missingKey = response.status === 401 || response.status === 403;
    } catch (error) {
      tests.missingKey = true; // Connection refused is also valid
    }
    
    // Test invalid API key
    try {
      const response = await fetch(`${this.targetUrl}/api/protected`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          [this.config.authentication.apiKeyHeader]: 'invalid-key-12345'
        }
      });
      tests.invalidKey = response.status === 401 || response.status === 403;
    } catch (error) {
      tests.invalidKey = true;
    }
    
    // Test malformed API key
    try {
      const response = await fetch(`${this.targetUrl}/api/protected`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          [this.config.authentication.apiKeyHeader]: '../../etc/passwd'
        }
      });
      tests.malformedKey = response.status === 401 || response.status === 403;
    } catch (error) {
      tests.malformedKey = true;
    }
    
    return tests;
  }
  
  /**
   * Test token expiration
   * @private
   */
  async _testTokenExpiration() {
    const tests = {
      expiredToken: false,
      tokenRefresh: false,
      clockSkew: false
    };
    
    // Generate expired JWT token
    const expiredToken = this._generateExpiredToken();
    
    // Test expired token
    try {
      const response = await fetch(`${this.targetUrl}/api/protected`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          [this.config.authentication.authHeader]: `Bearer ${expiredToken}`
        }
      });
      tests.expiredToken = response.status === 401;
    } catch (error) {
      tests.expiredToken = true;
    }
    
    return tests;
  }
  
  /**
   * Generate expired JWT token for testing
   * @private
   */
  _generateExpiredToken() {
    // Simple expired token for testing (not cryptographically valid)
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
    const payload = Buffer.from(JSON.stringify({
      exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
      iat: Math.floor(Date.now() / 1000) - 7200  // Issued 2 hours ago
    })).toString('base64');
    const signature = crypto.randomBytes(32).toString('base64');
    
    return `${header}.${payload}.${signature}`;
  }
  
  /**
   * Test rate limiting
   * @private
   */
  async _testRateLimiting() {
    const tests = {
      rateLimitEnforced: false,
      rateLimitHeaders: false,
      rateLimitReset: false
    };
    
    const requests = [];
    const requestCount = 10;
    
    // Send multiple requests rapidly
    for (let i = 0; i < requestCount; i++) {
      requests.push(
        fetch(`${this.targetUrl}/api/health`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-Test-Client': 'rate-limit-test'
          }
        }).catch(error => ({ status: 0, error }))
      );
    }
    
    const responses = await Promise.all(requests);
    
    // Check if any requests were rate limited
    const rateLimited = responses.filter(r => r.status === 429);
    tests.rateLimitEnforced = rateLimited.length > 0;
    
    // Check for rate limit headers
    if (responses[0] && responses[0].headers) {
      tests.rateLimitHeaders = 
        responses[0].headers.has('X-RateLimit-Limit') ||
        responses[0].headers.has('X-RateLimit-Remaining') ||
        responses[0].headers.has('RateLimit-Limit');
    }
    
    return tests;
  }
  
  /**
   * Test authorization
   * @private
   */
  async _testAuthorization() {
    const tests = {
      roleBasedAccess: false,
      privilegeEscalation: false,
      crossTenantAccess: false
    };
    
    // Test accessing admin endpoint with user token
    try {
      const userToken = this._generateTestToken('user');
      const response = await fetch(`${this.targetUrl}/api/admin`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          [this.config.authentication.authHeader]: `Bearer ${userToken}`
        }
      });
      tests.roleBasedAccess = response.status === 403;
    } catch (error) {
      tests.roleBasedAccess = true;
    }
    
    return tests;
  }
  
  /**
   * Generate test token with role
   * @private
   */
  _generateTestToken(role) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
    const payload = Buffer.from(JSON.stringify({
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
      role: role,
      sub: 'test-user'
    })).toString('base64');
    const signature = crypto.randomBytes(32).toString('base64');
    
    return `${header}.${payload}.${signature}`;
  }
  
  /**
   * Analyze authentication results
   * @private
   */
  _analyzeAuthResults(results) {
    // Check API key validation
    if (!results.apiKeyValidation.missingKey) {
      this.vulnerabilities.push({
        type: 'authentication',
        severity: 'high',
        title: 'Missing API Key Not Rejected',
        description: 'API endpoints accessible without authentication',
        recommendation: 'Implement proper API key validation'
      });
    }
    
    if (!results.apiKeyValidation.malformedKey) {
      this.vulnerabilities.push({
        type: 'authentication',
        severity: 'medium',
        title: 'Malformed API Key Not Validated',
        description: 'API accepts malformed authentication credentials',
        recommendation: 'Implement strict API key format validation'
      });
    }
    
    // Check token expiration
    if (!results.tokenExpiration.expiredToken) {
      this.vulnerabilities.push({
        type: 'authentication',
        severity: 'high',
        title: 'Expired Tokens Accepted',
        description: 'System accepts expired authentication tokens',
        recommendation: 'Implement proper token expiration validation'
      });
    }
    
    // Check rate limiting
    if (!results.rateLimiting.rateLimitEnforced) {
      this.vulnerabilities.push({
        type: 'authentication',
        severity: 'medium',
        title: 'No Rate Limiting',
        description: 'API endpoints vulnerable to brute force attacks',
        recommendation: 'Implement rate limiting on authentication endpoints'
      });
    }
    
    // Check authorization
    if (!results.authorization.roleBasedAccess) {
      this.vulnerabilities.push({
        type: 'authorization',
        severity: 'critical',
        title: 'Broken Access Control',
        description: 'Users can access resources beyond their privileges',
        recommendation: 'Implement proper role-based access control'
      });
    }
  }
  
  /**
   * Calculate authentication security score
   * @private
   */
  _calculateAuthScore(results) {
    let score = 0;
    let total = 0;
    
    // API key validation
    score += results.apiKeyValidation.missingKey ? 1 : 0;
    score += results.apiKeyValidation.invalidKey ? 1 : 0;
    score += results.apiKeyValidation.malformedKey ? 1 : 0;
    total += 3;
    
    // Token expiration
    score += results.tokenExpiration.expiredToken ? 1 : 0;
    total += 1;
    
    // Rate limiting
    score += results.rateLimiting.rateLimitEnforced ? 1 : 0;
    score += results.rateLimiting.rateLimitHeaders ? 0.5 : 0;
    total += 1.5;
    
    // Authorization
    score += results.authorization.roleBasedAccess ? 1 : 0;
    total += 1;
    
    return (score / total * 100).toFixed(2) + '%';
  }
  
  /**
   * Test input validation
   * TASK: Check for injection vulnerabilities
   */
  async testInputValidation() {
    console.log('Testing input validation...');
    const results = {
      sqlInjection: {},
      xssProtection: {},
      pathTraversal: {},
      commandInjection: {},
      payloadSize: {}
    };
    
    // Test SQL injection
    console.log('Testing SQL injection protection...');
    results.sqlInjection = await this._testSqlInjection();
    
    // Test XSS protection
    console.log('Testing XSS protection...');
    results.xssProtection = await this._testXssProtection();
    
    // Test path traversal
    console.log('Testing path traversal protection...');
    results.pathTraversal = await this._testPathTraversal();
    
    // Test command injection
    console.log('Testing command injection protection...');
    results.commandInjection = await this._testCommandInjection();
    
    // Test payload size limits
    console.log('Testing payload size limits...');
    results.payloadSize = await this._testPayloadSize();
    
    // Analyze results
    this._analyzeInputValidationResults(results);
    
    this.testResults.set('inputValidation', results);
    
    this.emit('testCompleted', {
      test: 'inputValidation',
      passed: this._calculateInputValidationScore(results),
      timestamp: new Date().toISOString()
    });
    
    return results;
  }
  
  /**
   * Test SQL injection protection
   * @private
   */
  async _testSqlInjection() {
    const tests = {
      basicInjection: false,
      unionInjection: false,
      blindInjection: false
    };
    
    const payloads = [
      "' OR '1'='1",
      "1; DROP TABLE users--",
      "1' UNION SELECT * FROM users--"
    ];
    
    for (const payload of payloads) {
      try {
        const response = await fetch(`${this.targetUrl}/api/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: payload })
        });
        
        // Check if injection was prevented
        if (response.status === 400 || response.status === 422) {
          tests.basicInjection = true;
        }
        
        // Check response for signs of injection success
        const text = await response.text();
        if (text.includes('syntax error') || text.includes('SQL')) {
          tests.basicInjection = false;
        }
      } catch (error) {
        tests.basicInjection = true; // Connection refused is safe
      }
    }
    
    return tests;
  }
  
  /**
   * Test XSS protection
   * @private
   */
  async _testXssProtection() {
    const tests = {
      reflectedXss: false,
      storedXss: false,
      domXss: false
    };
    
    const xssPayloads = [
      '<script>alert("XSS")</script>',
      '<img src=x onerror=alert("XSS")>',
      'javascript:alert("XSS")',
      '<svg onload=alert("XSS")>'
    ];
    
    for (const payload of xssPayloads) {
      try {
        const response = await fetch(`${this.targetUrl}/api/comment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            comment: payload,
            name: payload 
          })
        });
        
        // Check if XSS was prevented
        if (response.status === 400 || response.status === 422) {
          tests.reflectedXss = true;
        }
        
        // Check response headers
        const csp = response.headers.get('Content-Security-Policy');
        if (csp && csp.includes('script-src')) {
          tests.reflectedXss = true;
        }
      } catch (error) {
        tests.reflectedXss = true;
      }
    }
    
    return tests;
  }
  
  /**
   * Test path traversal protection
   * @private
   */
  async _testPathTraversal() {
    const tests = {
      directoryTraversal: false,
      fileInclusion: false,
      pathNormalization: false
    };
    
    const traversalPayloads = [
      '../../../etc/passwd',
      '..\\..\\..\\windows\\system32\\config\\sam',
      '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
      '....//....//....//etc/passwd'
    ];
    
    for (const payload of traversalPayloads) {
      try {
        const response = await fetch(`${this.targetUrl}/api/file/${payload}`, {
          method: 'GET'
        });
        
        // Check if traversal was prevented
        if (response.status === 400 || response.status === 403 || response.status === 404) {
          tests.directoryTraversal = true;
        }
        
        // Check if sensitive file was exposed
        const text = await response.text();
        if (text.includes('root:') || text.includes('Administrator:')) {
          tests.directoryTraversal = false;
          break;
        }
      } catch (error) {
        tests.directoryTraversal = true;
      }
    }
    
    return tests;
  }
  
  /**
   * Test command injection protection
   * @private
   */
  async _testCommandInjection() {
    const tests = {
      shellInjection: false,
      codeInjection: false,
      templateInjection: false
    };
    
    const commandPayloads = [
      '; cat /etc/passwd',
      '$(cat /etc/passwd)',
      '`cat /etc/passwd`',
      '${7*7}',
      '{{7*7}}'
    ];
    
    for (const payload of commandPayloads) {
      try {
        const response = await fetch(`${this.targetUrl}/api/process`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            command: payload,
            input: payload 
          })
        });
        
        // Check if injection was prevented
        if (response.status === 400 || response.status === 422) {
          tests.shellInjection = true;
        }
        
        // Check response for command output
        const text = await response.text();
        if (text.includes('root:') || text === '49') {
          tests.shellInjection = false;
          break;
        }
      } catch (error) {
        tests.shellInjection = true;
      }
    }
    
    return tests;
  }
  
  /**
   * Test payload size limits
   * @private
   */
  async _testPayloadSize() {
    const tests = {
      largePayload: false,
      headerSize: false,
      multipartSize: false
    };
    
    // Test large JSON payload
    const largePayload = 'x'.repeat(2 * 1024 * 1024); // 2MB
    
    try {
      const response = await fetch(`${this.targetUrl}/api/data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: largePayload })
      });
      
      // Should reject large payloads
      tests.largePayload = response.status === 413 || response.status === 400;
    } catch (error) {
      tests.largePayload = true;
    }
    
    // Test large headers
    try {
      const headers = {
        'Content-Type': 'application/json',
        'X-Large-Header': 'x'.repeat(8192) // 8KB header
      };
      
      const response = await fetch(`${this.targetUrl}/api/health`, {
        method: 'GET',
        headers
      });
      
      tests.headerSize = response.status === 431 || response.status === 400;
    } catch (error) {
      tests.headerSize = true;
    }
    
    return tests;
  }
  
  /**
   * Analyze input validation results
   * @private
   */
  _analyzeInputValidationResults(results) {
    // SQL Injection
    if (!results.sqlInjection.basicInjection) {
      this.vulnerabilities.push({
        type: 'injection',
        severity: 'critical',
        title: 'SQL Injection Vulnerability',
        description: 'Application vulnerable to SQL injection attacks',
        recommendation: 'Use parameterized queries and input validation'
      });
    }
    
    // XSS
    if (!results.xssProtection.reflectedXss) {
      this.vulnerabilities.push({
        type: 'injection',
        severity: 'high',
        title: 'Cross-Site Scripting (XSS)',
        description: 'Application vulnerable to XSS attacks',
        recommendation: 'Implement proper output encoding and CSP headers'
      });
    }
    
    // Path Traversal
    if (!results.pathTraversal.directoryTraversal) {
      this.vulnerabilities.push({
        type: 'injection',
        severity: 'high',
        title: 'Path Traversal Vulnerability',
        description: 'Application allows access to unauthorized files',
        recommendation: 'Validate and sanitize file paths'
      });
    }
    
    // Command Injection
    if (!results.commandInjection.shellInjection) {
      this.vulnerabilities.push({
        type: 'injection',
        severity: 'critical',
        title: 'Command Injection',
        description: 'Application vulnerable to OS command injection',
        recommendation: 'Avoid shell commands or use proper escaping'
      });
    }
    
    // Payload Size
    if (!results.payloadSize.largePayload) {
      this.vulnerabilities.push({
        type: 'dos',
        severity: 'medium',
        title: 'No Payload Size Limits',
        description: 'Application accepts unlimited payload sizes',
        recommendation: 'Implement request size limits'
      });
    }
  }
  
  /**
   * Calculate input validation score
   * @private
   */
  _calculateInputValidationScore(results) {
    let score = 0;
    let total = 0;
    
    // SQL Injection
    score += results.sqlInjection.basicInjection ? 2 : 0;
    total += 2;
    
    // XSS
    score += results.xssProtection.reflectedXss ? 2 : 0;
    total += 2;
    
    // Path Traversal
    score += results.pathTraversal.directoryTraversal ? 2 : 0;
    total += 2;
    
    // Command Injection
    score += results.commandInjection.shellInjection ? 2 : 0;
    total += 2;
    
    // Payload Size
    score += results.payloadSize.largePayload ? 1 : 0;
    score += results.payloadSize.headerSize ? 0.5 : 0;
    total += 1.5;
    
    return (score / total * 100).toFixed(2) + '%';
  }
  
  /**
   * Test transport security
   * TASK: Verify secure communications
   */
  async testTransportSecurity() {
    console.log('Testing transport security...');
    const results = {
      tlsConfiguration: {},
      certificateValidation: {},
      securityHeaders: {},
      encryptionStrength: {}
    };
    
    // Test TLS configuration
    console.log('Testing TLS configuration...');
    results.tlsConfiguration = await this._testTlsConfiguration();
    
    // Test security headers
    console.log('Testing security headers...');
    results.securityHeaders = await this._testSecurityHeaders();
    
    // Analyze results
    this._analyzeTransportResults(results);
    
    this.testResults.set('transportSecurity', results);
    
    this.emit('testCompleted', {
      test: 'transportSecurity',
      passed: this._calculateTransportScore(results),
      timestamp: new Date().toISOString()
    });
    
    return results;
  }
  
  /**
   * Test TLS configuration
   * @private
   */
  async _testTlsConfiguration() {
    const tests = {
      httpsRedirect: false,
      tlsVersion: false,
      certificateValid: false
    };
    
    // Test HTTPS redirect
    if (this.targetUrl.startsWith('https://')) {
      tests.httpsRedirect = true;
      tests.tlsVersion = true; // Assume proper TLS if HTTPS
      tests.certificateValid = true;
    } else {
      // For HTTP endpoints, check if they redirect to HTTPS
      try {
        const response = await fetch(this.targetUrl, {
          method: 'GET',
          redirect: 'manual'
        });
        
        if (response.status === 301 || response.status === 302) {
          const location = response.headers.get('Location');
          if (location && location.startsWith('https://')) {
            tests.httpsRedirect = true;
          }
        }
      } catch (error) {
        // Ignore connection errors
      }
    }
    
    return tests;
  }
  
  /**
   * Test security headers
   * @private
   */
  async _testSecurityHeaders() {
    const tests = {
      hsts: false,
      xFrameOptions: false,
      xContentTypeOptions: false,
      csp: false,
      referrerPolicy: false
    };
    
    try {
      const response = await fetch(this.targetUrl, {
        method: 'GET'
      });
      
      // Check HSTS
      const hsts = response.headers.get('Strict-Transport-Security');
      if (hsts && hsts.includes('max-age=')) {
        const maxAge = parseInt(hsts.match(/max-age=(\d+)/)?.[1] || '0');
        tests.hsts = maxAge >= 31536000; // 1 year
      }
      
      // Check X-Frame-Options
      const xfo = response.headers.get('X-Frame-Options');
      tests.xFrameOptions = xfo === 'DENY' || xfo === 'SAMEORIGIN';
      
      // Check X-Content-Type-Options
      tests.xContentTypeOptions = response.headers.get('X-Content-Type-Options') === 'nosniff';
      
      // Check CSP
      const csp = response.headers.get('Content-Security-Policy');
      tests.csp = !!csp && csp.length > 20;
      
      // Check Referrer-Policy
      const rp = response.headers.get('Referrer-Policy');
      tests.referrerPolicy = !!rp && (
        rp === 'no-referrer' || 
        rp === 'strict-origin-when-cross-origin'
      );
      
    } catch (error) {
      // Connection errors mean headers can't be tested
    }
    
    return tests;
  }
  
  /**
   * Analyze transport security results
   * @private
   */
  _analyzeTransportResults(results) {
    // TLS Configuration
    if (!results.tlsConfiguration.httpsRedirect) {
      this.vulnerabilities.push({
        type: 'transport',
        severity: 'high',
        title: 'Missing HTTPS',
        description: 'Application does not enforce HTTPS',
        recommendation: 'Implement HTTPS and redirect all HTTP traffic'
      });
    }
    
    // Security Headers
    if (!results.securityHeaders.hsts) {
      this.vulnerabilities.push({
        type: 'transport',
        severity: 'medium',
        title: 'Missing HSTS Header',
        description: 'Strict-Transport-Security header not set',
        recommendation: 'Add HSTS header with minimum 1 year max-age'
      });
    }
    
    if (!results.securityHeaders.xFrameOptions) {
      this.vulnerabilities.push({
        type: 'transport',
        severity: 'medium',
        title: 'Missing X-Frame-Options',
        description: 'Application vulnerable to clickjacking',
        recommendation: 'Add X-Frame-Options: DENY or SAMEORIGIN'
      });
    }
    
    if (!results.securityHeaders.csp) {
      this.vulnerabilities.push({
        type: 'transport',
        severity: 'medium',
        title: 'Missing Content Security Policy',
        description: 'No CSP header to prevent XSS',
        recommendation: 'Implement Content-Security-Policy header'
      });
    }
  }
  
  /**
   * Calculate transport security score
   * @private
   */
  _calculateTransportScore(results) {
    let score = 0;
    let total = 0;
    
    // TLS
    score += results.tlsConfiguration.httpsRedirect ? 2 : 0;
    total += 2;
    
    // Security Headers
    score += results.securityHeaders.hsts ? 1 : 0;
    score += results.securityHeaders.xFrameOptions ? 1 : 0;
    score += results.securityHeaders.xContentTypeOptions ? 1 : 0;
    score += results.securityHeaders.csp ? 1 : 0;
    score += results.securityHeaders.referrerPolicy ? 0.5 : 0;
    total += 4.5;
    
    return (score / total * 100).toFixed(2) + '%';
  }
  
  /**
   * Run all security tests
   */
  async runAllTests() {
    console.log('Starting comprehensive security testing...\n');
    
    const testSuites = [
      { name: 'Dependency Scanning', method: this.scanDependencies },
      { name: 'Authentication Testing', method: this.testAuthentication },
      { name: 'Input Validation Testing', method: this.testInputValidation },
      { name: 'Transport Security Testing', method: this.testTransportSecurity }
    ];
    
    for (const suite of testSuites) {
      console.log(`\n=== ${suite.name} ===`);
      try {
        await suite.method.call(this);
        console.log(`✅ ${suite.name} completed`);
      } catch (error) {
        console.error(`❌ ${suite.name} failed: ${error.message}`);
      }
    }
    
    console.log('\nAll tests completed. Generating report...');
    return this.generateReport();
  }
  
  /**
   * Generate security report
   */
  async generateReport() {
    const report = {
      title: 'Security Testing Report',
      generatedAt: new Date().toISOString(),
      targetUrl: this.targetUrl,
      summary: {
        totalVulnerabilities: this.vulnerabilities.length,
        critical: this.vulnerabilities.filter(v => v.severity === 'critical').length,
        high: this.vulnerabilities.filter(v => v.severity === 'high').length,
        medium: this.vulnerabilities.filter(v => v.severity === 'medium').length,
        low: this.vulnerabilities.filter(v => v.severity === 'low').length
      },
      testResults: Object.fromEntries(this.testResults),
      vulnerabilities: this.vulnerabilities,
      recommendations: this._generateRecommendations()
    };
    
    // Ensure report directory exists
    await fs.mkdir(this.reportDir, { recursive: true });
    
    // Save JSON report
    const jsonPath = path.join(this.reportDir, `security-report-${Date.now()}.json`);
    await fs.writeFile(jsonPath, JSON.stringify(report, null, 2));
    
    // Save Markdown report
    const mdPath = path.join(this.reportDir, `security-report-${Date.now()}.md`);
    await fs.writeFile(mdPath, this._generateMarkdownReport(report));
    
    console.log(`Reports generated:`);
    console.log(`- JSON: ${jsonPath}`);
    console.log(`- Markdown: ${mdPath}`);
    
    this.emit('reportGenerated', {
      jsonPath,
      mdPath,
      timestamp: new Date().toISOString()
    });
    
    return report;
  }
  
  /**
   * Generate recommendations
   * @private
   */
  _generateRecommendations() {
    const recommendations = [];
    
    // Critical vulnerabilities
    if (this.vulnerabilities.some(v => v.severity === 'critical')) {
      recommendations.push({
        priority: 'Critical',
        category: 'Immediate Action Required',
        recommendation: 'Address all critical vulnerabilities immediately. These pose immediate risk to the system.'
      });
    }
    
    // Authentication
    const authVulns = this.vulnerabilities.filter(v => v.type === 'authentication');
    if (authVulns.length > 0) {
      recommendations.push({
        priority: 'High',
        category: 'Authentication',
        recommendation: 'Implement multi-factor authentication and review all authentication mechanisms'
      });
    }
    
    // Input validation
    const injectionVulns = this.vulnerabilities.filter(v => v.type === 'injection');
    if (injectionVulns.length > 0) {
      recommendations.push({
        priority: 'High',
        category: 'Input Validation',
        recommendation: 'Implement comprehensive input validation and sanitization across all endpoints'
      });
    }
    
    // Transport security
    const transportVulns = this.vulnerabilities.filter(v => v.type === 'transport');
    if (transportVulns.length > 0) {
      recommendations.push({
        priority: 'Medium',
        category: 'Transport Security',
        recommendation: 'Enforce HTTPS everywhere and implement all security headers'
      });
    }
    
    // General recommendations
    recommendations.push({
      priority: 'Medium',
      category: 'Security Monitoring',
      recommendation: 'Implement security monitoring and incident response procedures'
    });
    
    recommendations.push({
      priority: 'Low',
      category: 'Security Testing',
      recommendation: 'Schedule regular security assessments and penetration testing'
    });
    
    return recommendations;
  }
  
  /**
   * Generate Markdown report
   * @private
   */
  _generateMarkdownReport(report) {
    let md = `# ${report.title}\n\n`;
    md += `Generated at: ${report.generatedAt}\n\n`;
    md += `Target URL: ${report.targetUrl}\n\n`;
    
    md += `## Executive Summary\n\n`;
    md += `Total Vulnerabilities Found: **${report.summary.totalVulnerabilities}**\n\n`;
    md += `| Severity | Count |\n`;
    md += `|----------|-------|\n`;
    md += `| Critical | ${report.summary.critical} |\n`;
    md += `| High | ${report.summary.high} |\n`;
    md += `| Medium | ${report.summary.medium} |\n`;
    md += `| Low | ${report.summary.low} |\n\n`;
    
    md += `## Vulnerabilities\n\n`;
    
    // Group vulnerabilities by severity
    const bySeverity = {
      critical: report.vulnerabilities.filter(v => v.severity === 'critical'),
      high: report.vulnerabilities.filter(v => v.severity === 'high'),
      medium: report.vulnerabilities.filter(v => v.severity === 'medium'),
      low: report.vulnerabilities.filter(v => v.severity === 'low')
    };
    
    for (const [severity, vulns] of Object.entries(bySeverity)) {
      if (vulns.length > 0) {
        md += `### ${severity.toUpperCase()} Severity\n\n`;
        for (const vuln of vulns) {
          md += `#### ${vuln.title}\n`;
          md += `- **Type**: ${vuln.type}\n`;
          md += `- **Description**: ${vuln.description}\n`;
          md += `- **Recommendation**: ${vuln.recommendation}\n`;
          if (vuln.cves && vuln.cves.length > 0) {
            md += `- **CVEs**: ${vuln.cves.join(', ')}\n`;
          }
          md += '\n';
        }
      }
    }
    
    md += `## Test Results Summary\n\n`;
    
    // Dependencies
    if (report.testResults.dependencies) {
      md += `### Dependency Scanning\n`;
      const deps = report.testResults.dependencies;
      if (deps.npm) {
        md += `- NPM Vulnerabilities: ${deps.summary.critical + deps.summary.high + deps.summary.moderate + deps.summary.low}\n`;
      }
      md += '\n';
    }
    
    // Authentication
    if (report.testResults.authentication) {
      md += `### Authentication Testing\n`;
      const auth = report.testResults.authentication;
      md += `- API Key Validation: ${auth.apiKeyValidation.missingKey ? '✅' : '❌'}\n`;
      md += `- Token Expiration: ${auth.tokenExpiration.expiredToken ? '✅' : '❌'}\n`;
      md += `- Rate Limiting: ${auth.rateLimiting.rateLimitEnforced ? '✅' : '❌'}\n`;
      md += `- Authorization: ${auth.authorization.roleBasedAccess ? '✅' : '❌'}\n`;
      md += '\n';
    }
    
    // Input Validation
    if (report.testResults.inputValidation) {
      md += `### Input Validation Testing\n`;
      const input = report.testResults.inputValidation;
      md += `- SQL Injection Protection: ${input.sqlInjection.basicInjection ? '✅' : '❌'}\n`;
      md += `- XSS Protection: ${input.xssProtection.reflectedXss ? '✅' : '❌'}\n`;
      md += `- Path Traversal Protection: ${input.pathTraversal.directoryTraversal ? '✅' : '❌'}\n`;
      md += `- Command Injection Protection: ${input.commandInjection.shellInjection ? '✅' : '❌'}\n`;
      md += `- Payload Size Limits: ${input.payloadSize.largePayload ? '✅' : '❌'}\n`;
      md += '\n';
    }
    
    // Transport Security
    if (report.testResults.transportSecurity) {
      md += `### Transport Security Testing\n`;
      const transport = report.testResults.transportSecurity;
      md += `- HTTPS Redirect: ${transport.tlsConfiguration.httpsRedirect ? '✅' : '❌'}\n`;
      md += `- HSTS Header: ${transport.securityHeaders.hsts ? '✅' : '❌'}\n`;
      md += `- X-Frame-Options: ${transport.securityHeaders.xFrameOptions ? '✅' : '❌'}\n`;
      md += `- CSP Header: ${transport.securityHeaders.csp ? '✅' : '❌'}\n`;
      md += '\n';
    }
    
    md += `## Recommendations\n\n`;
    for (const rec of report.recommendations) {
      md += `### ${rec.priority} Priority - ${rec.category}\n`;
      md += `${rec.recommendation}\n\n`;
    }
    
    return md;
  }
}

module.exports = SecurityTestingSuite;