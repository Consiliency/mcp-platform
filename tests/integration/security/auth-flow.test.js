const JWTAuth = require('../../../security/api-auth/jwt-auth');
const TokenRefresh = require('../../../security/api-auth/token-refresh');
const OAuth = require('../../../security/api-auth/oauth');
const APIKeyManager = require('../../../security/api-auth/api-key');

describe('Security Authentication Flow Integration', () => {
  let jwtAuth, tokenRefresh, oauth, apiKeyManager;
  let mockRedisClient;

  beforeEach(() => {
    // Mock Redis client for token refresh
    mockRedisClient = {
      setex: jest.fn().mockResolvedValue('OK'),
      get: jest.fn().mockResolvedValue(null),
      del: jest.fn().mockResolvedValue(1),
      exists: jest.fn().mockResolvedValue(0)
    };

    jwtAuth = new JWTAuth({
      secretKey: 'test-secret-key',
      algorithm: 'HS256',
      expiresIn: '1h',
      issuer: 'test-app'
    });

    tokenRefresh = new TokenRefresh({
      redis: mockRedisClient,
      accessTokenExpiry: 3600,
      refreshTokenExpiry: 2592000
    });

    oauth = new OAuth({
      providers: {
        google: {
          clientId: 'test-google-client',
          clientSecret: 'test-google-secret',
          redirectUri: 'http://localhost:3000/auth/google/callback'
        },
        github: {
          clientId: 'test-github-client',
          clientSecret: 'test-github-secret',
          redirectUri: 'http://localhost:3000/auth/github/callback'
        }
      }
    });

    apiKeyManager = new APIKeyManager();
  });

  describe('Complete JWT Authentication Flow', () => {
    it('should handle full JWT login and refresh flow', async () => {
      const user = {
        userId: 'user123',
        email: 'user@example.com',
        roles: ['user']
      };

      // Step 1: Generate JWT token on login
      const token = jwtAuth.generateToken(user);
      expect(token).toBeTruthy();

      // Step 2: Verify the token
      const decoded = jwtAuth.verifyToken(token);
      expect(decoded.userId).toBe(user.userId);
      expect(decoded.email).toBe(user.email);

      // Step 3: Generate refresh token
      const refreshResult = await tokenRefresh.generateTokenPair(user.userId, {
        email: user.email,
        roles: user.roles
      });
      expect(refreshResult.accessToken).toBeTruthy();
      expect(refreshResult.refreshToken).toBeTruthy();

      // Step 4: Use refresh token to get new access token
      mockRedisClient.get.mockResolvedValueOnce(JSON.stringify({
        userId: user.userId,
        metadata: { email: user.email, roles: user.roles }
      }));

      const newTokens = await tokenRefresh.refreshAccessToken(refreshResult.refreshToken);
      expect(newTokens.accessToken).toBeTruthy();
      expect(newTokens.accessToken).not.toBe(refreshResult.accessToken);

      // Step 5: Verify the new access token
      const newDecoded = tokenRefresh.verifyAccessToken(newTokens.accessToken);
      expect(newDecoded.userId).toBe(user.userId);
    });

    it('should handle token expiration and renewal', async () => {
      // Create an expired token
      const expiredToken = jwtAuth.generateToken({ userId: 'user123' }, '0s');
      
      // Verification should fail
      const result = jwtAuth.verifyToken(expiredToken);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token expired');

      // But refresh token should still work
      const refreshResult = await tokenRefresh.generateTokenPair('user123', {});
      mockRedisClient.get.mockResolvedValueOnce(JSON.stringify({
        userId: 'user123',
        metadata: {}
      }));

      const newTokens = await tokenRefresh.refreshAccessToken(refreshResult.refreshToken);
      expect(newTokens.accessToken).toBeTruthy();
    });
  });

  describe('OAuth Integration Flow', () => {
    it('should handle complete OAuth flow with Google', async () => {
      // Step 1: Get authorization URL
      const authUrl = oauth.getAuthorizationUrl('google', 'state123');
      expect(authUrl).toContain('accounts.google.com/o/oauth2/v2/auth');
      expect(authUrl).toContain('client_id=test-google-client');
      expect(authUrl).toContain('state=state123');

      // Step 2: Mock token exchange
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'google-access-token',
          refresh_token: 'google-refresh-token',
          expires_in: 3600,
          token_type: 'Bearer'
        })
      });

      const tokens = await oauth.exchangeCodeForTokens('google', 'auth-code-123');
      expect(tokens.accessToken).toBe('google-access-token');
      expect(tokens.refreshToken).toBe('google-refresh-token');

      // Step 3: Mock user info fetch
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'google-user-123',
          email: 'user@gmail.com',
          name: 'Test User',
          picture: 'https://example.com/photo.jpg'
        })
      });

      const userInfo = await oauth.getUserInfo('google', 'google-access-token');
      expect(userInfo.email).toBe('user@gmail.com');
      expect(userInfo.providerId).toBe('google-user-123');

      // Step 4: Generate JWT for the OAuth user
      const jwtToken = jwtAuth.generateToken({
        userId: userInfo.providerId,
        email: userInfo.email,
        provider: 'google'
      });
      expect(jwtToken).toBeTruthy();

      // Clean up
      delete global.fetch;
    });

    it('should handle OAuth errors gracefully', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Invalid authorization code'
      });

      await expect(oauth.exchangeCodeForTokens('google', 'invalid-code'))
        .rejects.toThrow('Failed to exchange code for tokens');

      delete global.fetch;
    });
  });

  describe('API Key Authentication Flow', () => {
    it('should handle API key generation and validation flow', async () => {
      const userId = 'user123';
      const permissions = ['read', 'write'];

      // Step 1: Generate API key for user
      const keyResult = apiKeyManager.generateKey(userId, permissions);
      expect(keyResult.apiKey).toMatch(/^mcp_/);
      expect(keyResult.permissions).toEqual(permissions);

      // Step 2: Validate the API key
      const validation = apiKeyManager.validateKey(keyResult.apiKey);
      expect(validation.valid).toBe(true);
      expect(validation.userId).toBe(userId);
      expect(validation.permissions).toEqual(permissions);

      // Step 3: Use the key multiple times and check usage stats
      apiKeyManager.validateKey(keyResult.apiKey);
      apiKeyManager.validateKey(keyResult.apiKey);

      const stats = apiKeyManager.getKeyStats(keyResult.keyId);
      expect(stats.stats.usageCount).toBe(3);
      expect(stats.stats.lastUsed).toBeInstanceOf(Date);

      // Step 4: List user's keys
      const userKeys = apiKeyManager.listUserKeys(userId);
      expect(userKeys).toHaveLength(1);
      expect(userKeys[0].usageCount).toBe(3);

      // Step 5: Revoke the key
      const revokeResult = apiKeyManager.revokeKey(keyResult.keyId);
      expect(revokeResult.success).toBe(true);

      // Step 6: Validation should now fail
      const postRevokeValidation = apiKeyManager.validateKey(keyResult.apiKey);
      expect(postRevokeValidation.valid).toBe(false);
    });
  });

  describe('Multi-Auth Strategy Flow', () => {
    it('should handle multiple authentication methods in sequence', async () => {
      const userId = 'user123';
      
      // Start with OAuth login
      global.fetch = jest.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: 'oauth-token',
            refresh_token: 'oauth-refresh',
            expires_in: 3600
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'oauth-user-123',
            email: 'user@example.com',
            name: 'OAuth User'
          })
        });

      // OAuth flow
      const oauthTokens = await oauth.exchangeCodeForTokens('github', 'code123');
      const oauthUser = await oauth.getUserInfo('github', oauthTokens.accessToken);

      // Generate JWT from OAuth
      const jwtToken = jwtAuth.generateToken({
        userId: oauthUser.providerId,
        email: oauthUser.email,
        authMethod: 'oauth'
      });

      // Also generate API key for the same user
      const apiKey = apiKeyManager.generateKey(oauthUser.providerId, ['api:read']);

      // Generate refresh tokens
      const refreshTokens = await tokenRefresh.generateTokenPair(oauthUser.providerId, {
        email: oauthUser.email,
        authMethods: ['oauth', 'apikey']
      });

      // Verify all authentication methods work
      expect(jwtAuth.verifyToken(jwtToken).valid).toBe(true);
      expect(apiKeyManager.validateKey(apiKey.apiKey).valid).toBe(true);
      expect(tokenRefresh.verifyAccessToken(refreshTokens.accessToken).userId).toBe(oauthUser.providerId);

      delete global.fetch;
    });
  });

  describe('Security Token Rotation', () => {
    it('should handle secure token rotation', async () => {
      const userId = 'user123';

      // Generate initial token pair
      const initialTokens = await tokenRefresh.generateTokenPair(userId, {});
      
      // Use the access token
      const decoded = tokenRefresh.verifyAccessToken(initialTokens.accessToken);
      expect(decoded.userId).toBe(userId);

      // Simulate token about to expire - refresh it
      mockRedisClient.get.mockResolvedValueOnce(JSON.stringify({
        userId,
        metadata: {}
      }));

      const rotatedTokens = await tokenRefresh.refreshAccessToken(initialTokens.refreshToken);
      
      // New access token should be different
      expect(rotatedTokens.accessToken).not.toBe(initialTokens.accessToken);
      
      // Old refresh token should be invalidated
      expect(mockRedisClient.del).toHaveBeenCalledWith(
        `refresh_token:${initialTokens.refreshToken}`
      );

      // New tokens should work
      const newDecoded = tokenRefresh.verifyAccessToken(rotatedTokens.accessToken);
      expect(newDecoded.userId).toBe(userId);
    });
  });

  describe('Permission-based Access Control', () => {
    it('should enforce permission-based access with API keys', () => {
      // Create keys with different permissions
      const readOnlyKey = apiKeyManager.generateKey('user1', ['read']);
      const readWriteKey = apiKeyManager.generateKey('user2', ['read', 'write']);
      const adminKey = apiKeyManager.generateKey('admin', ['read', 'write', 'admin']);

      // Create mock request/response
      const createMockReqRes = (apiKey) => ({
        req: {
          headers: { 'x-api-key': apiKey },
          query: {}
        },
        res: {
          status: jest.fn().mockReturnThis(),
          json: jest.fn()
        },
        next: jest.fn()
      });

      // Test read-only access
      const readOnlyMiddleware = apiKeyManager.middleware(['read']);
      const { req: req1, res: res1, next: next1 } = createMockReqRes(readOnlyKey.apiKey);
      readOnlyMiddleware(req1, res1, next1);
      expect(next1).toHaveBeenCalled();

      // Test write permission required
      const writeMiddleware = apiKeyManager.middleware(['write']);
      const { req: req2, res: res2, next: next2 } = createMockReqRes(readOnlyKey.apiKey);
      writeMiddleware(req2, res2, next2);
      expect(res2.status).toHaveBeenCalledWith(403);
      expect(next2).not.toHaveBeenCalled();

      // Test admin access
      const adminMiddleware = apiKeyManager.middleware(['admin']);
      const { req: req3, res: res3, next: next3 } = createMockReqRes(adminKey.apiKey);
      adminMiddleware(req3, res3, next3);
      expect(next3).toHaveBeenCalled();
    });

    it('should handle JWT permissions', () => {
      // Generate tokens with different roles
      const userToken = jwtAuth.generateToken({
        userId: 'user1',
        roles: ['user']
      });

      const adminToken = jwtAuth.generateToken({
        userId: 'admin1',
        roles: ['user', 'admin']
      });

      // Verify role information is preserved
      const userDecoded = jwtAuth.verifyToken(userToken);
      expect(userDecoded.payload.roles).toContain('user');
      expect(userDecoded.payload.roles).not.toContain('admin');

      const adminDecoded = jwtAuth.verifyToken(adminToken);
      expect(adminDecoded.payload.roles).toContain('admin');
    });
  });

  describe('Session Management Integration', () => {
    it('should handle session lifecycle with token refresh', async () => {
      const userId = 'user123';
      const sessionId = 'session-456';

      // Create session with tokens
      const tokens = await tokenRefresh.generateTokenPair(userId, {
        sessionId,
        loginTime: new Date().toISOString()
      });

      // Verify session info is in token
      const decoded = tokenRefresh.verifyAccessToken(tokens.accessToken);
      expect(decoded.sessionId).toBe(sessionId);

      // Simulate session activity - refresh token
      mockRedisClient.get.mockResolvedValueOnce(JSON.stringify({
        userId,
        metadata: { sessionId, loginTime: decoded.loginTime }
      }));

      const refreshed = await tokenRefresh.refreshAccessToken(tokens.refreshToken);
      const refreshedDecoded = tokenRefresh.verifyAccessToken(refreshed.accessToken);
      expect(refreshedDecoded.sessionId).toBe(sessionId);

      // Revoke session
      const revokeResult = await tokenRefresh.revokeRefreshToken(tokens.refreshToken);
      expect(revokeResult.success).toBe(true);

      // Revoke all user sessions
      const revokeAllResult = await tokenRefresh.revokeUserTokens(userId);
      expect(revokeAllResult.success).toBe(true);
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle authentication failures gracefully', async () => {
      // Invalid JWT
      const invalidJWT = 'invalid.jwt.token';
      const jwtResult = jwtAuth.verifyToken(invalidJWT);
      expect(jwtResult.valid).toBe(false);
      expect(jwtResult.error).toBeTruthy();

      // Invalid API key
      const invalidAPIKey = 'invalid_api_key';
      const apiResult = apiKeyManager.validateKey(invalidAPIKey);
      expect(apiResult.valid).toBe(false);

      // Invalid refresh token
      mockRedisClient.get.mockResolvedValueOnce(null);
      await expect(tokenRefresh.refreshAccessToken('invalid-refresh'))
        .rejects.toThrow('Invalid refresh token');

      // OAuth provider error
      global.fetch = jest.fn().mockRejectedValueOnce(new Error('Network error'));
      await expect(oauth.exchangeCodeForTokens('google', 'code'))
        .rejects.toThrow();
      
      delete global.fetch;
    });

    it('should handle Redis failures in token refresh', async () => {
      // Redis connection error
      mockRedisClient.setex.mockRejectedValueOnce(new Error('Redis connection failed'));
      
      await expect(tokenRefresh.generateTokenPair('user123', {}))
        .rejects.toThrow('Redis connection failed');

      // Redis get error during refresh
      mockRedisClient.get.mockRejectedValueOnce(new Error('Redis read failed'));
      
      await expect(tokenRefresh.refreshAccessToken('refresh-token'))
        .rejects.toThrow('Redis read failed');
    });
  });
});