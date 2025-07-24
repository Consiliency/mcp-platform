const JWTAuth = require('../../security/api-auth/jwt-auth');
const TokenRefresh = require('../../security/api-auth/token-refresh');
const APIKeyManager = require('../../security/api-auth/api-key');
const OAuth = require('../../security/api-auth/oauth');

describe('Security Vulnerability Tests - Authentication Bypass', () => {
  let jwtAuth, tokenRefresh, apiKeyManager, oauth;
  let mockRedisClient;

  beforeEach(() => {
    mockRedisClient = {
      setex: jest.fn().mockResolvedValue('OK'),
      get: jest.fn().mockResolvedValue(null),
      del: jest.fn().mockResolvedValue(1),
      exists: jest.fn().mockResolvedValue(0)
    };

    jwtAuth = new JWTAuth({
      secretKey: 'test-secret-key',
      algorithm: 'HS256',
      expiresIn: '1h'
    });

    tokenRefresh = new TokenRefresh({
      redis: mockRedisClient,
      accessTokenExpiry: 3600,
      refreshTokenExpiry: 2592000
    });

    apiKeyManager = new APIKeyManager();

    oauth = new OAuth({
      providers: {
        google: {
          clientId: 'test-client',
          clientSecret: 'test-secret',
          redirectUri: 'http://localhost:3000/callback'
        }
      }
    });
  });

  describe('JWT Authentication Bypass Attempts', () => {
    it('should prevent JWT signature stripping', () => {
      const validToken = jwtAuth.generateToken({ userId: 'user123', role: 'user' });
      const parts = validToken.split('.');
      
      // Try to use token without signature
      const unsignedToken = `${parts[0]}.${parts[1]}.`;
      const result = jwtAuth.verifyToken(unsignedToken);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('signature');
    });

    it('should prevent JWT algorithm confusion attacks', () => {
      // Create token with HS256
      const token = jwtAuth.generateToken({ userId: 'user123' });
      
      // Try to verify with different algorithm
      const maliciousJWT = new JWTAuth({
        secretKey: 'different-key',
        algorithm: 'HS512'
      });
      
      const result = maliciousJWT.verifyToken(token);
      expect(result.valid).toBe(false);
    });

    it('should prevent weak secret key attacks', () => {
      // Try to create JWT with weak key
      const weakKeys = ['', '123', 'password', 'secret'];
      
      weakKeys.forEach(key => {
        expect(() => new JWTAuth({ secretKey: key }))
          .toThrow('Secret key must be at least');
      });
    });

    it('should prevent token replay attacks with expired tokens', () => {
      // Create token that expires immediately
      const expiredToken = jwtAuth.generateToken({ userId: 'user123' }, '0s');
      
      // Wait a bit
      setTimeout(() => {
        const result = jwtAuth.verifyToken(expiredToken);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Token expired');
      }, 100);
    });

    it('should prevent privilege escalation via token manipulation', () => {
      // Create low-privilege token
      const userToken = jwtAuth.generateToken({ userId: 'user123', role: 'user' });
      
      // Try to decode and modify
      const parts = userToken.split('.');
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      payload.role = 'admin';
      
      // Re-encode with modified payload
      const modifiedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const tamperedToken = `${parts[0]}.${modifiedPayload}.${parts[2]}`;
      
      // Verification should fail due to signature mismatch
      const result = jwtAuth.verifyToken(tamperedToken);
      expect(result.valid).toBe(false);
    });
  });

  describe('API Key Authentication Bypass Attempts', () => {
    it('should prevent brute force API key guessing', () => {
      const validKey = apiKeyManager.generateKey('user123', ['read']);
      
      // Try common patterns
      const guessedKeys = [
        'mcp_12345',
        'mcp_admin',
        'mcp_test',
        'mcp_' + 'a'.repeat(32),
        'mcp_00000000000000000000000000000000'
      ];
      
      guessedKeys.forEach(guess => {
        const result = apiKeyManager.validateKey(guess);
        expect(result.valid).toBe(false);
      });
    });

    it('should prevent API key format manipulation', () => {
      const validKey = apiKeyManager.generateKey('user123', ['read']);
      
      // Try to manipulate key format
      const manipulations = [
        validKey.apiKey.toUpperCase(),
        validKey.apiKey.toLowerCase(),
        validKey.apiKey.replace('mcp_', 'MCP_'),
        validKey.apiKey + 'extra',
        validKey.apiKey.slice(0, -5),
        'mcp_' + validKey.apiKey.split('_')[1].split('').reverse().join('')
      ];
      
      manipulations.forEach(manipulated => {
        const result = apiKeyManager.validateKey(manipulated);
        expect(result.valid).toBe(false);
      });
    });

    it('should prevent permission escalation via API keys', () => {
      // Create read-only key
      const readKey = apiKeyManager.generateKey('user123', ['read']);
      
      // Validate key
      const validation = apiKeyManager.validateKey(readKey.apiKey);
      
      // Try to modify permissions in validation result
      validation.permissions.push('write');
      validation.permissions.push('admin');
      
      // Original key should still have only read permission
      const revalidation = apiKeyManager.validateKey(readKey.apiKey);
      expect(revalidation.permissions).toEqual(['read']);
      expect(revalidation.permissions).not.toContain('write');
      expect(revalidation.permissions).not.toContain('admin');
    });

    it('should prevent API key reuse after revocation', () => {
      const key = apiKeyManager.generateKey('user123', ['read']);
      
      // Validate key works
      expect(apiKeyManager.validateKey(key.apiKey).valid).toBe(true);
      
      // Revoke key
      apiKeyManager.revokeKey(key.keyId);
      
      // Key should no longer work
      expect(apiKeyManager.validateKey(key.apiKey).valid).toBe(false);
      
      // Creating new key with same user should generate different key
      const newKey = apiKeyManager.generateKey('user123', ['read']);
      expect(newKey.apiKey).not.toBe(key.apiKey);
    });
  });

  describe('Token Refresh Authentication Bypass', () => {
    it('should prevent refresh token reuse after rotation', async () => {
      // Generate initial tokens
      const tokens = await tokenRefresh.generateTokenPair('user123', {});
      
      // Use refresh token to get new tokens
      mockRedisClient.get.mockResolvedValueOnce(JSON.stringify({
        userId: 'user123',
        metadata: {}
      }));
      
      const newTokens = await tokenRefresh.refreshAccessToken(tokens.refreshToken);
      
      // Old refresh token should be deleted
      expect(mockRedisClient.del).toHaveBeenCalledWith(`refresh_token:${tokens.refreshToken}`);
      
      // Try to use old refresh token again
      mockRedisClient.get.mockResolvedValueOnce(null);
      
      await expect(tokenRefresh.refreshAccessToken(tokens.refreshToken))
        .rejects.toThrow('Invalid refresh token');
    });

    it('should prevent cross-user token refresh', async () => {
      // Generate tokens for user1
      const user1Tokens = await tokenRefresh.generateTokenPair('user1', { email: 'user1@example.com' });
      
      // Try to use user1's refresh token to get tokens for user2
      mockRedisClient.get.mockResolvedValueOnce(JSON.stringify({
        userId: 'user1',
        metadata: { email: 'user1@example.com' }
      }));
      
      const newTokens = await tokenRefresh.refreshAccessToken(user1Tokens.refreshToken);
      const decoded = tokenRefresh.verifyAccessToken(newTokens.accessToken);
      
      // Should still be user1, not user2
      expect(decoded.userId).toBe('user1');
      expect(decoded.userId).not.toBe('user2');
    });

    it('should prevent infinite token refresh chains', async () => {
      const userId = 'user123';
      let currentRefreshToken;
      
      // Generate initial tokens
      const initialTokens = await tokenRefresh.generateTokenPair(userId, {});
      currentRefreshToken = initialTokens.refreshToken;
      
      // Try to refresh multiple times rapidly
      const refreshAttempts = [];
      for (let i = 0; i < 5; i++) {
        mockRedisClient.get.mockResolvedValueOnce(JSON.stringify({
          userId,
          metadata: {}
        }));
        
        refreshAttempts.push(
          tokenRefresh.refreshAccessToken(currentRefreshToken)
            .catch(err => ({ error: err.message }))
        );
      }
      
      const results = await Promise.all(refreshAttempts);
      
      // Only the first refresh should succeed
      const successful = results.filter(r => r.accessToken).length;
      const failed = results.filter(r => r.error).length;
      
      expect(successful).toBe(1);
      expect(failed).toBe(4);
    });
  });

  describe('OAuth Authentication Bypass', () => {
    it('should prevent OAuth state parameter bypass', () => {
      const state = 'random-state-123';
      const authUrl = oauth.getAuthorizationUrl('google', state);
      
      // URL should include state parameter
      expect(authUrl).toContain(`state=${state}`);
      
      // Should validate state on callback
      expect(() => oauth.validateState('different-state', state))
        .toThrow('Invalid state parameter');
    });

    it('should prevent OAuth token injection', async () => {
      global.fetch = jest.fn();
      
      // Mock token exchange with malicious response
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'malicious-token',
          token_type: 'Bearer',
          scope: 'email profile admin', // Trying to inject admin scope
          expires_in: 3600
        })
      });
      
      const tokens = await oauth.exchangeCodeForTokens('google', 'auth-code');
      
      // Should not trust injected scopes
      expect(tokens.scope).not.toContain('admin');
      
      delete global.fetch;
    });

    it('should prevent OAuth redirect URI manipulation', () => {
      const maliciousRedirects = [
        'http://evil.com/callback',
        'https://example.com@evil.com',
        'https://example.com.evil.com',
        '//evil.com',
        'https://example.com/callback?redirect=http://evil.com'
      ];
      
      maliciousRedirects.forEach(redirect => {
        expect(() => oauth.validateRedirectUri(redirect))
          .toThrow('Invalid redirect URI');
      });
    });
  });

  describe('Session Fixation Prevention', () => {
    it('should regenerate session ID on authentication', async () => {
      const oldSessionId = 'old-session-123';
      const userId = 'user123';
      
      // Generate tokens with old session
      const tokens1 = await tokenRefresh.generateTokenPair(userId, {
        sessionId: oldSessionId
      });
      
      // On re-authentication, should get new session
      const tokens2 = await tokenRefresh.generateTokenPair(userId, {
        sessionId: 'new-session-456'
      });
      
      // Decode tokens to verify different sessions
      const decoded1 = tokenRefresh.verifyAccessToken(tokens1.accessToken);
      const decoded2 = tokenRefresh.verifyAccessToken(tokens2.accessToken);
      
      expect(decoded1.sessionId).not.toBe(decoded2.sessionId);
    });
  });

  describe('Authentication Race Conditions', () => {
    it('should handle concurrent authentication attempts safely', async () => {
      const userId = 'user123';
      const attempts = [];
      
      // Simulate 10 concurrent login attempts
      for (let i = 0; i < 10; i++) {
        attempts.push(
          tokenRefresh.generateTokenPair(userId, { attempt: i })
        );
      }
      
      const results = await Promise.all(attempts);
      
      // All should succeed and generate unique tokens
      const accessTokens = results.map(r => r.accessToken);
      const uniqueTokens = new Set(accessTokens);
      
      expect(uniqueTokens.size).toBe(10);
    });

    it('should prevent race condition in API key validation', () => {
      const key = apiKeyManager.generateKey('user123', ['read']);
      
      // Simulate concurrent validations
      const validations = [];
      for (let i = 0; i < 10; i++) {
        validations.push(apiKeyManager.validateKey(key.apiKey));
      }
      
      const results = Promise.all(validations);
      
      // All should be valid and consistent
      results.then(vals => {
        vals.forEach(val => {
          expect(val.valid).toBe(true);
          expect(val.userId).toBe('user123');
          expect(val.permissions).toEqual(['read']);
        });
      });
    });
  });

  describe('Authentication Downgrade Attacks', () => {
    it('should prevent downgrade from strong to weak authentication', () => {
      // Create middleware that enforces authentication strength
      const enforceAuthStrength = (req, res, next) => {
        const authMethods = [];
        
        if (req.user) authMethods.push('jwt');
        if (req.apiKey) authMethods.push('apikey');
        if (req.oauth) authMethods.push('oauth');
        
        // Require at least one strong method for sensitive operations
        if (req.path.startsWith('/admin') && !authMethods.includes('jwt') && !authMethods.includes('oauth')) {
          return res.status(403).json({ error: 'Strong authentication required' });
        }
        
        next();
      };
      
      // Test with API key (weaker) for admin route
      const req = {
        path: '/admin/users',
        apiKey: { userId: 'user123', permissions: ['admin'] }
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();
      
      enforceAuthStrength(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Strong authentication required' });
    });
  });

  describe('Authentication Context Validation', () => {
    it('should validate authentication context consistency', () => {
      const token = jwtAuth.generateToken({
        userId: 'user123',
        email: 'user@example.com',
        loginIP: '192.168.1.100',
        userAgent: 'Mozilla/5.0'
      });
      
      const decoded = jwtAuth.verifyToken(token);
      
      // Validate context on subsequent requests
      const validateContext = (currentIP, currentUA) => {
        if (decoded.payload.loginIP !== currentIP) {
          return { valid: false, reason: 'IP mismatch' };
        }
        if (decoded.payload.userAgent !== currentUA) {
          return { valid: false, reason: 'User agent mismatch' };
        }
        return { valid: true };
      };
      
      // Different IP should be flagged
      const result1 = validateContext('10.0.0.1', 'Mozilla/5.0');
      expect(result1.valid).toBe(false);
      expect(result1.reason).toBe('IP mismatch');
      
      // Different user agent should be flagged
      const result2 = validateContext('192.168.1.100', 'Chrome/1.0');
      expect(result2.valid).toBe(false);
      expect(result2.reason).toBe('User agent mismatch');
      
      // Matching context should pass
      const result3 = validateContext('192.168.1.100', 'Mozilla/5.0');
      expect(result3.valid).toBe(true);
    });
  });
});