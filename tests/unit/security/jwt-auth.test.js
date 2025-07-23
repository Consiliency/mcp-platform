const JWTAuth = require('../../../security/api-auth/jwt-auth');

describe('JWTAuth', () => {
  let jwtAuth;

  beforeEach(() => {
    jwtAuth = new JWTAuth({
      jwtSecret: 'test-secret',
      tokenExpiry: 3600,
      refreshTokenExpiry: 604800
    });
  });

  describe('Token Generation', () => {
    test('should generate access and refresh tokens', async () => {
      const payload = {
        userId: 'user-123',
        roles: ['user', 'admin'],
        permissions: ['read', 'write']
      };

      const result = await jwtAuth.generateToken(payload);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('expiresIn', 3600);
      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
    });

    test('should throw error for invalid payload', async () => {
      await expect(jwtAuth.generateToken({})).rejects.toThrow('Invalid payload: userId is required');
    });
  });

  describe('Token Verification', () => {
    test('should verify valid token', async () => {
      const payload = {
        userId: 'user-123',
        roles: ['admin'],
        permissions: ['all']
      };

      const { accessToken } = await jwtAuth.generateToken(payload);
      const result = await jwtAuth.verifyToken(accessToken);

      expect(result.valid).toBe(true);
      expect(result.payload.userId).toBe('user-123');
      expect(result.payload.roles).toEqual(['admin']);
      expect(result.payload.permissions).toEqual(['all']);
    });

    test('should reject invalid token', async () => {
      const result = await jwtAuth.verifyToken('invalid-token');
      
      expect(result.valid).toBe(false);
      expect(result.error).toBeTruthy();
    });

    test('should reject revoked token', async () => {
      const { accessToken } = await jwtAuth.generateToken({ userId: 'user-123' });
      await jwtAuth.revokeToken(accessToken);
      
      const result = await jwtAuth.verifyToken(accessToken);
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token has been revoked');
    });
  });

  describe('API Key Management', () => {
    test('should generate API key', async () => {
      const result = await jwtAuth.generateAPIKey('user-123', ['read', 'write']);
      
      expect(result.apiKey).toMatch(/^mcp_/);
      expect(result.keyId).toBeTruthy();
    });

    test('should validate API key', async () => {
      const { apiKey } = await jwtAuth.generateAPIKey('user-123', ['read']);
      const result = await jwtAuth.validateAPIKey(apiKey);
      
      expect(result.valid).toBe(true);
      expect(result.userId).toBe('user-123');
      expect(result.permissions).toEqual(['read']);
    });

    test('should revoke API key', async () => {
      const { apiKey, keyId } = await jwtAuth.generateAPIKey('user-123', []);
      const revokeResult = await jwtAuth.revokeAPIKey(keyId);
      
      expect(revokeResult.success).toBe(true);
      
      const validateResult = await jwtAuth.validateAPIKey(apiKey);
      expect(validateResult.valid).toBe(false);
    });
  });

  describe('Middleware', () => {
    test('should create auth middleware', () => {
      const middleware = jwtAuth.createAuthMiddleware({ requireAuth: true });
      
      expect(typeof middleware).toBe('function');
      expect(middleware.length).toBe(3); // (req, res, next)
    });

    test('middleware should reject missing auth header', async () => {
      const middleware = jwtAuth.createAuthMiddleware({ requireAuth: true });
      const req = { headers: {} };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();
      
      await middleware(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Authorization header required' });
      expect(next).not.toHaveBeenCalled();
    });

    test('middleware should pass valid token', async () => {
      const { accessToken } = await jwtAuth.generateToken({
        userId: 'user-123',
        roles: ['admin']
      });
      
      const middleware = jwtAuth.createAuthMiddleware({ requireAuth: true });
      const req = { headers: { authorization: `Bearer ${accessToken}` } };
      const res = { status: jest.fn(), json: jest.fn() };
      const next = jest.fn();
      
      await middleware(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(req.user).toBeDefined();
      expect(req.user.userId).toBe('user-123');
    });
  });
});