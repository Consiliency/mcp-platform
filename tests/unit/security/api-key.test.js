const APIKeyManager = require('../../../security/api-auth/api-key');

describe('APIKeyManager', () => {
  let apiKeyManager;

  beforeEach(() => {
    apiKeyManager = new APIKeyManager();
  });

  describe('generateKey', () => {
    it('should generate a new API key for a user', () => {
      const userId = 'user123';
      const permissions = ['read', 'write'];
      
      const result = apiKeyManager.generateKey(userId, permissions);
      
      expect(result).toHaveProperty('apiKey');
      expect(result.apiKey).toMatch(/^mcp_[\w-]+$/);
      expect(result).toHaveProperty('keyId');
      expect(result.userId).toBe(userId);
      expect(result.permissions).toEqual(permissions);
    });

    it('should throw error if userId is not provided', () => {
      expect(() => apiKeyManager.generateKey()).toThrow('userId is required');
      expect(() => apiKeyManager.generateKey(null)).toThrow('userId is required');
      expect(() => apiKeyManager.generateKey('')).toThrow('userId is required');
    });

    it('should generate unique keys for multiple calls', () => {
      const key1 = apiKeyManager.generateKey('user1');
      const key2 = apiKeyManager.generateKey('user1');
      
      expect(key1.apiKey).not.toBe(key2.apiKey);
      expect(key1.keyId).not.toBe(key2.keyId);
    });

    it('should track keys by user', () => {
      const userId = 'user123';
      apiKeyManager.generateKey(userId, ['read']);
      apiKeyManager.generateKey(userId, ['write']);
      
      const userKeys = apiKeyManager.listUserKeys(userId);
      expect(userKeys).toHaveLength(2);
    });

    it('should handle empty permissions array', () => {
      const result = apiKeyManager.generateKey('user123', []);
      expect(result.permissions).toEqual([]);
    });

    it('should use default empty permissions when not specified', () => {
      const result = apiKeyManager.generateKey('user123');
      expect(result.permissions).toEqual([]);
    });
  });

  describe('validateKey', () => {
    let generatedKey;
    const userId = 'user123';
    const permissions = ['read', 'write'];

    beforeEach(() => {
      generatedKey = apiKeyManager.generateKey(userId, permissions);
    });

    it('should validate a valid API key', () => {
      const result = apiKeyManager.validateKey(generatedKey.apiKey);
      
      expect(result.valid).toBe(true);
      expect(result.userId).toBe(userId);
      expect(result.permissions).toEqual(permissions);
      expect(result.keyId).toBe(generatedKey.keyId);
    });

    it('should return invalid for non-existent key', () => {
      const result = apiKeyManager.validateKey('invalid_key');
      
      expect(result.valid).toBe(false);
      expect(result).not.toHaveProperty('userId');
    });

    it('should return invalid for null or undefined key', () => {
      expect(apiKeyManager.validateKey(null).valid).toBe(false);
      expect(apiKeyManager.validateKey(undefined).valid).toBe(false);
      expect(apiKeyManager.validateKey('').valid).toBe(false);
    });

    it('should update usage statistics on validation', () => {
      const beforeValidation = new Date();
      
      // First validation
      apiKeyManager.validateKey(generatedKey.apiKey);
      
      // Check stats
      const stats1 = apiKeyManager.getKeyStats(generatedKey.keyId);
      expect(stats1.stats.usageCount).toBe(1);
      expect(stats1.stats.lastUsed).toBeInstanceOf(Date);
      expect(stats1.stats.lastUsed.getTime()).toBeGreaterThanOrEqual(beforeValidation.getTime());
      
      // Second validation
      apiKeyManager.validateKey(generatedKey.apiKey);
      const stats2 = apiKeyManager.getKeyStats(generatedKey.keyId);
      expect(stats2.stats.usageCount).toBe(2);
    });
  });

  describe('revokeKey', () => {
    let generatedKey;
    const userId = 'user123';

    beforeEach(() => {
      generatedKey = apiKeyManager.generateKey(userId, ['read']);
    });

    it('should revoke a key by keyId', () => {
      const result = apiKeyManager.revokeKey(generatedKey.keyId);
      
      expect(result.success).toBe(true);
      expect(result.revoked).toBe(generatedKey.apiKey);
      
      // Key should no longer be valid
      const validation = apiKeyManager.validateKey(generatedKey.apiKey);
      expect(validation.valid).toBe(false);
    });

    it('should remove key from user tracking when revoked', () => {
      apiKeyManager.revokeKey(generatedKey.keyId);
      
      const userKeys = apiKeyManager.listUserKeys(userId);
      expect(userKeys).toHaveLength(0);
    });

    it('should return failure for non-existent keyId', () => {
      const result = apiKeyManager.revokeKey('non-existent-id');
      
      expect(result.success).toBe(false);
      expect(result).not.toHaveProperty('revoked');
    });

    it('should handle multiple keys per user correctly', () => {
      const key2 = apiKeyManager.generateKey(userId, ['write']);
      
      // Revoke first key
      apiKeyManager.revokeKey(generatedKey.keyId);
      
      // Second key should still be valid
      const validation = apiKeyManager.validateKey(key2.apiKey);
      expect(validation.valid).toBe(true);
      
      // User should still have one key
      const userKeys = apiKeyManager.listUserKeys(userId);
      expect(userKeys).toHaveLength(1);
    });
  });

  describe('revokeUserKeys', () => {
    const userId = 'user123';
    let keys;

    beforeEach(() => {
      keys = [
        apiKeyManager.generateKey(userId, ['read']),
        apiKeyManager.generateKey(userId, ['write']),
        apiKeyManager.generateKey(userId, ['admin'])
      ];
    });

    it('should revoke all keys for a user', () => {
      const result = apiKeyManager.revokeUserKeys(userId);
      
      expect(result.success).toBe(true);
      expect(result.count).toBe(3);
      
      // All keys should be invalid
      keys.forEach(key => {
        const validation = apiKeyManager.validateKey(key.apiKey);
        expect(validation.valid).toBe(false);
      });
    });

    it('should return failure for user with no keys', () => {
      const result = apiKeyManager.revokeUserKeys('no-keys-user');
      
      expect(result.success).toBe(false);
      expect(result.count).toBe(0);
    });

    it('should not affect other users keys', () => {
      const otherUserKey = apiKeyManager.generateKey('other-user', ['read']);
      
      apiKeyManager.revokeUserKeys(userId);
      
      const validation = apiKeyManager.validateKey(otherUserKey.apiKey);
      expect(validation.valid).toBe(true);
    });
  });

  describe('listUserKeys', () => {
    const userId = 'user123';

    it('should list all keys for a user', () => {
      const key1 = apiKeyManager.generateKey(userId, ['read']);
      const key2 = apiKeyManager.generateKey(userId, ['write']);
      
      const userKeys = apiKeyManager.listUserKeys(userId);
      
      expect(userKeys).toHaveLength(2);
      expect(userKeys[0]).toHaveProperty('keyId');
      expect(userKeys[0]).toHaveProperty('permissions');
      expect(userKeys[0]).toHaveProperty('createdAt');
      expect(userKeys[0]).toHaveProperty('lastUsed');
      expect(userKeys[0]).toHaveProperty('usageCount');
      
      // Should not expose the actual API key
      expect(userKeys[0]).not.toHaveProperty('apiKey');
    });

    it('should return empty array for user with no keys', () => {
      const userKeys = apiKeyManager.listUserKeys('no-keys-user');
      expect(userKeys).toEqual([]);
    });

    it('should include usage statistics', () => {
      const key = apiKeyManager.generateKey(userId, ['read']);
      
      // Use the key twice
      apiKeyManager.validateKey(key.apiKey);
      apiKeyManager.validateKey(key.apiKey);
      
      const userKeys = apiKeyManager.listUserKeys(userId);
      expect(userKeys[0].usageCount).toBe(2);
      expect(userKeys[0].lastUsed).toBeInstanceOf(Date);
    });
  });

  describe('getKeyStats', () => {
    let generatedKey;
    const userId = 'user123';

    beforeEach(() => {
      generatedKey = apiKeyManager.generateKey(userId, ['read']);
    });

    it('should return stats for existing key', () => {
      const result = apiKeyManager.getKeyStats(generatedKey.keyId);
      
      expect(result.found).toBe(true);
      expect(result.stats.userId).toBe(userId);
      expect(result.stats.permissions).toEqual(['read']);
      expect(result.stats.createdAt).toBeInstanceOf(Date);
      expect(result.stats.usageCount).toBe(0);
      expect(result.stats.lastUsed).toBeNull();
    });

    it('should return not found for non-existent key', () => {
      const result = apiKeyManager.getKeyStats('non-existent-id');
      
      expect(result.found).toBe(false);
      expect(result).not.toHaveProperty('stats');
    });
  });

  describe('middleware', () => {
    let req, res, next;

    beforeEach(() => {
      req = {
        headers: {},
        query: {}
      };
      res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      next = jest.fn();
    });

    it('should allow valid API key in Authorization header', async () => {
      const key = apiKeyManager.generateKey('user123', ['read']);
      req.headers.authorization = `ApiKey ${key.apiKey}`;
      
      const middleware = apiKeyManager.middleware();
      await middleware(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(req.apiKey).toEqual({
        userId: 'user123',
        permissions: ['read'],
        keyId: key.keyId
      });
    });

    it('should allow valid API key in X-API-Key header', async () => {
      const key = apiKeyManager.generateKey('user123', ['read']);
      req.headers['x-api-key'] = key.apiKey;
      
      const middleware = apiKeyManager.middleware();
      await middleware(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(req.apiKey.userId).toBe('user123');
    });

    it('should allow valid API key in query parameter', async () => {
      const key = apiKeyManager.generateKey('user123', ['read']);
      req.query.api_key = key.apiKey;
      
      const middleware = apiKeyManager.middleware();
      await middleware(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(req.apiKey.userId).toBe('user123');
    });

    it('should reject request without API key', async () => {
      const middleware = apiKeyManager.middleware();
      await middleware(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'API key required' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject invalid API key', async () => {
      req.headers['x-api-key'] = 'invalid_key';
      
      const middleware = apiKeyManager.middleware();
      await middleware(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid API key' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should check required permissions', async () => {
      const key = apiKeyManager.generateKey('user123', ['read']);
      req.headers['x-api-key'] = key.apiKey;
      
      const middleware = apiKeyManager.middleware(['read', 'write']);
      await middleware(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Insufficient permissions' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should allow request with sufficient permissions', async () => {
      const key = apiKeyManager.generateKey('user123', ['read', 'write', 'admin']);
      req.headers['x-api-key'] = key.apiKey;
      
      const middleware = apiKeyManager.middleware(['read', 'write']);
      await middleware(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(req.apiKey.permissions).toEqual(['read', 'write', 'admin']);
    });

    it('should handle empty required permissions', async () => {
      const key = apiKeyManager.generateKey('user123', []);
      req.headers['x-api-key'] = key.apiKey;
      
      const middleware = apiKeyManager.middleware([]);
      await middleware(req, res, next);
      
      expect(next).toHaveBeenCalled();
    });
  });

  describe('createSecureKey', () => {
    it('should generate keys with mcp prefix', () => {
      const key = apiKeyManager.createSecureKey();
      expect(key).toMatch(/^mcp_[\w-]+$/);
    });

    it('should generate unique keys', () => {
      const keys = new Set();
      for (let i = 0; i < 100; i++) {
        keys.add(apiKeyManager.createSecureKey());
      }
      expect(keys.size).toBe(100);
    });

    it('should generate keys of appropriate length', () => {
      const key = apiKeyManager.createSecureKey();
      // mcp_ prefix (4) + base64url encoded 32 bytes (43-44 chars)
      expect(key.length).toBeGreaterThanOrEqual(47);
      expect(key.length).toBeLessThanOrEqual(48);
    });
  });

  describe('extractApiKey', () => {
    let req;

    beforeEach(() => {
      req = {
        headers: {},
        query: {}
      };
    });

    it('should extract from Authorization header with ApiKey prefix', () => {
      req.headers.authorization = 'ApiKey test_key_123';
      const key = apiKeyManager.extractApiKey(req);
      expect(key).toBe('test_key_123');
    });

    it('should extract from X-API-Key header', () => {
      req.headers['x-api-key'] = 'test_key_456';
      const key = apiKeyManager.extractApiKey(req);
      expect(key).toBe('test_key_456');
    });

    it('should extract from query parameter', () => {
      req.query.api_key = 'test_key_789';
      const key = apiKeyManager.extractApiKey(req);
      expect(key).toBe('test_key_789');
    });

    it('should prioritize Authorization header over others', () => {
      req.headers.authorization = 'ApiKey auth_key';
      req.headers['x-api-key'] = 'x_api_key';
      req.query.api_key = 'query_key';
      
      const key = apiKeyManager.extractApiKey(req);
      expect(key).toBe('auth_key');
    });

    it('should return null if no API key found', () => {
      const key = apiKeyManager.extractApiKey(req);
      expect(key).toBeNull();
    });

    it('should ignore Authorization header without ApiKey prefix', () => {
      req.headers.authorization = 'Bearer token123';
      const key = apiKeyManager.extractApiKey(req);
      expect(key).toBeNull();
    });
  });
});