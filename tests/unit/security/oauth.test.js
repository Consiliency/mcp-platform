const { OAuth2Provider, createOAuth2Provider } = require('../../../security/api-auth/oauth');

describe('OAuth2Provider', () => {
  let provider;
  
  beforeEach(() => {
    provider = new OAuth2Provider({
      authorizationURL: 'https://example.com/oauth/authorize',
      tokenURL: 'https://example.com/oauth/token',
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      scope: ['read', 'write'],
      callbackURL: 'https://myapp.com/callback'
    });
  });

  describe('constructor', () => {
    it('should require authorizationURL and tokenURL', () => {
      expect(() => new OAuth2Provider({})).toThrow('authorizationURL and tokenURL are required');
    });

    it('should initialize with provided config', () => {
      expect(provider.config.clientId).toBe('test-client-id');
      expect(provider.config.scope).toEqual(['read', 'write']);
    });
  });

  describe('getAuthorizationUrl', () => {
    it('should generate valid authorization URL', () => {
      const url = provider.getAuthorizationUrl();
      
      expect(url).toContain('https://example.com/oauth/authorize');
      expect(url).toContain('response_type=code');
      expect(url).toContain('client_id=test-client-id');
      expect(url).toContain('redirect_uri=https%3A%2F%2Fmyapp.com%2Fcallback');
      expect(url).toContain('scope=read%20write');
      expect(url).toContain('state=');
      expect(url).toContain('nonce=');
    });

    it('should use custom parameters', () => {
      const url = provider.getAuthorizationUrl({
        state: 'custom-state',
        scope: ['custom-scope'],
        additionalParams: { prompt: 'consent' }
      });
      
      expect(url).toContain('state=custom-state');
      expect(url).toContain('scope=custom-scope');
      expect(url).toContain('prompt=consent');
    });

    it('should store state for CSRF protection', () => {
      const url = provider.getAuthorizationUrl();
      const urlParams = new URLSearchParams(url.split('?')[1]);
      const state = urlParams.get('state');
      
      expect(provider.states.has(state)).toBe(true);
    });
  });

  describe('exchangeCodeForToken', () => {
    it('should require code and state', async () => {
      await expect(provider.exchangeCodeForToken()).rejects.toThrow('Authorization code and state are required');
    });

    it('should verify state exists', async () => {
      await expect(provider.exchangeCodeForToken('code123', 'invalid-state'))
        .rejects.toThrow('Invalid state parameter');
    });

    it('should exchange code for tokens', async () => {
      // Generate valid state
      const url = provider.getAuthorizationUrl();
      const urlParams = new URLSearchParams(url.split('?')[1]);
      const state = urlParams.get('state');
      
      const result = await provider.exchangeCodeForToken('auth-code-123', state);
      
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('expiresIn');
      expect(result).toHaveProperty('tokenType', 'Bearer');
      expect(result.accessToken).toMatch(/^mock_access_/);
    });

    it('should prevent state reuse', async () => {
      const url = provider.getAuthorizationUrl();
      const urlParams = new URLSearchParams(url.split('?')[1]);
      const state = urlParams.get('state');
      
      // First exchange should succeed
      await provider.exchangeCodeForToken('code1', state);
      
      // Second exchange with same state should fail
      await expect(provider.exchangeCodeForToken('code2', state))
        .rejects.toThrow('Invalid state parameter');
    });
  });

  describe('refreshToken', () => {
    it('should require refresh token', async () => {
      await expect(provider.refreshToken()).rejects.toThrow('Refresh token is required');
    });

    it('should return new access token', async () => {
      const result = await provider.refreshToken('refresh-token-123');
      
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('expiresIn');
      expect(result.accessToken).toMatch(/^mock_access_/);
    });
  });

  describe('validateToken', () => {
    it('should require access token', async () => {
      const result = await provider.validateToken();
      expect(result).toEqual({ valid: false, error: 'Access token is required' });
    });

    it('should validate stored tokens', async () => {
      // Exchange code for token first
      const url = provider.getAuthorizationUrl();
      const urlParams = new URLSearchParams(url.split('?')[1]);
      const state = urlParams.get('state');
      const tokens = await provider.exchangeCodeForToken('code', state);
      
      const result = await provider.validateToken(tokens.accessToken);
      expect(result.valid).toBe(true);
      expect(result).toHaveProperty('tokenId');
      expect(result).toHaveProperty('expiresAt');
    });

    it('should detect expired tokens', async () => {
      // Manually add expired token
      const tokenId = 'expired-token-id';
      provider.accessTokens.set(tokenId, {
        accessToken: 'expired-token',
        expiresAt: Date.now() - 1000 // Expired 1 second ago
      });
      
      const result = await provider.validateToken('expired-token');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token has expired');
    });
  });

  describe('getUserInfo', () => {
    it('should require userInfoURL', async () => {
      const providerNoUserInfo = new OAuth2Provider({
        authorizationURL: 'https://example.com/oauth/authorize',
        tokenURL: 'https://example.com/oauth/token'
      });
      
      await expect(providerNoUserInfo.getUserInfo('token'))
        .rejects.toThrow('User info URL not configured');
    });

    it('should return user info', async () => {
      const userInfo = await provider.getUserInfo('access-token');
      
      expect(userInfo).toHaveProperty('sub');
      expect(userInfo).toHaveProperty('email');
      expect(userInfo).toHaveProperty('name');
    });
  });

  describe('revokeToken', () => {
    it('should handle missing token', async () => {
      const result = await provider.revokeToken();
      expect(result).toEqual({ success: false, error: 'Token is required' });
    });

    it('should remove token from store', async () => {
      // Add token to store
      const tokenId = 'test-token-id';
      provider.accessTokens.set(tokenId, {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token'
      });
      
      const result = await provider.revokeToken('test-access-token');
      expect(result.success).toBe(true);
      expect(provider.accessTokens.has(tokenId)).toBe(false);
    });
  });

  describe('createOAuth2Middleware', () => {
    it('should require Bearer token', async () => {
      const middleware = provider.createOAuth2Middleware();
      const req = { headers: {} };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();
      
      await middleware(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Bearer token required' });
    });

    it('should validate token and call next', async () => {
      // Create valid token
      const url = provider.getAuthorizationUrl();
      const urlParams = new URLSearchParams(url.split('?')[1]);
      const state = urlParams.get('state');
      const tokens = await provider.exchangeCodeForToken('code', state);
      
      const middleware = provider.createOAuth2Middleware();
      const req = { headers: { authorization: `Bearer ${tokens.accessToken}` } };
      const res = {};
      const next = jest.fn();
      
      await middleware(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(req.oauth).toBeDefined();
      expect(req.oauth.tokenId).toBe(tokens.tokenId);
    });

    it('should check required scopes', async () => {
      const middleware = provider.createOAuth2Middleware({
        requiredScopes: ['admin']
      });
      
      // Create token with different scopes
      const url = provider.getAuthorizationUrl();
      const urlParams = new URLSearchParams(url.split('?')[1]);
      const state = urlParams.get('state');
      const tokens = await provider.exchangeCodeForToken('code', state);
      
      const req = { headers: { authorization: `Bearer ${tokens.accessToken}` } };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();
      
      await middleware(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Insufficient scope' });
    });
  });

  describe('createOAuth2Provider factory', () => {
    it('should create provider for known providers', () => {
      const googleProvider = createOAuth2Provider('google', {
        clientId: 'google-client',
        clientSecret: 'google-secret'
      });
      
      expect(googleProvider.config.authorizationURL).toContain('accounts.google.com');
      expect(googleProvider.config.tokenURL).toContain('oauth2.googleapis.com');
    });

    it('should throw for unknown provider', () => {
      expect(() => createOAuth2Provider('unknown', {}))
        .toThrow('Unknown OAuth2 provider: unknown');
    });
  });

  describe('cleanupStates', () => {
    it('should remove expired states', () => {
      // Add old state
      const oldState = 'old-state';
      provider.states.set(oldState, {
        createdAt: Date.now() - 700000 // 11+ minutes ago
      });
      
      // Add new state
      const newState = 'new-state';
      provider.states.set(newState, {
        createdAt: Date.now()
      });
      
      provider.cleanupStates();
      
      expect(provider.states.has(oldState)).toBe(false);
      expect(provider.states.has(newState)).toBe(true);
    });
  });
});