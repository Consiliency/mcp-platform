// Demo script to show the Security API implementations working

const { JWTAuth, RateLimiter, SecurityMiddleware } = require('./security');

async function demoJWTAuth() {
  console.log('\n=== JWT Authentication Demo ===');
  
  const jwtAuth = new JWTAuth({
    jwtSecret: 'demo-secret-key',
    tokenExpiry: 3600,
    refreshTokenExpiry: 86400
  });

  // Generate tokens
  const { accessToken, refreshToken, expiresIn } = await jwtAuth.generateToken({
    userId: 'demo-user-123',
    roles: ['user', 'admin'],
    permissions: ['read', 'write', 'delete']
  });

  console.log('Generated tokens:');
  console.log(`Access Token: ${accessToken.substring(0, 50)}...`);
  console.log(`Refresh Token: ${refreshToken.substring(0, 50)}...`);
  console.log(`Expires in: ${expiresIn} seconds`);

  // Verify token
  const verification = await jwtAuth.verifyToken(accessToken);
  console.log('\nToken verification:', verification);

  // Generate API key
  const { apiKey, keyId } = await jwtAuth.generateAPIKey('demo-user-123', ['api:read', 'api:write']);
  console.log('\nGenerated API Key:');
  console.log(`Key: ${apiKey}`);
  console.log(`ID: ${keyId}`);

  // Validate API key
  const keyValidation = await jwtAuth.validateAPIKey(apiKey);
  console.log('API Key validation:', keyValidation);
}

async function demoRateLimiter() {
  console.log('\n=== Rate Limiter Demo ===');
  
  const rateLimiter = new RateLimiter({
    storage: 'memory',
    defaultLimits: {
      'demo-api': { limit: 5, window: 10000 } // 5 requests per 10 seconds
    }
  });

  const clientIP = '192.168.1.100';

  // Make several requests
  console.log('\nMaking requests from IP:', clientIP);
  for (let i = 0; i < 7; i++) {
    const result = await rateLimiter.checkLimit(clientIP, 'demo-api');
    console.log(`Request ${i + 1}: ${result.allowed ? 'ALLOWED' : 'BLOCKED'} (${result.remaining} remaining)`);
  }

  // Set a custom rule
  await rateLimiter.setRule('strict-limit', {
    limit: 2,
    window: 60000,
    blockDuration: 120000
  });

  console.log('\nCustom rule created: 2 requests per minute with 2-minute block');
}

function demoSecurityMiddleware() {
  console.log('\n=== Security Middleware Demo ===');
  
  const securityMiddleware = new SecurityMiddleware({
    cors: {
      origin: ['http://localhost:3000', 'https://example.com'],
      credentials: true
    },
    csrf: {
      enabled: true
    },
    xss: {
      enabled: true
    }
  });

  // Get all security middlewares
  const middlewares = securityMiddleware.apply();
  console.log(`Created ${middlewares.length} security middlewares`);

  // Test XSS sanitization
  const maliciousInput = {
    name: '<script>alert("XSS")</script>',
    comment: 'Hello <img src=x onerror=alert("XSS")>'
  };

  const sanitized = securityMiddleware.sanitizeObject(maliciousInput);
  console.log('\nXSS Sanitization:');
  console.log('Input:', maliciousInput);
  console.log('Sanitized:', sanitized);

  // Generate CSRF token
  const csrfToken = securityMiddleware.generateCSRFToken('session-123');
  console.log('\nGenerated CSRF token:', csrfToken);
}

// Run all demos
async function runDemos() {
  try {
    await demoJWTAuth();
    await demoRateLimiter();
    demoSecurityMiddleware();
    
    console.log('\n=== All demos completed successfully! ===\n');
  } catch (error) {
    console.error('Demo error:', error);
  }
}

runDemos();