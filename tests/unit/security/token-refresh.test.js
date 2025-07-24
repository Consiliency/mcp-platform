const { TokenRefreshManager, createJWTRefreshManager } = require('../../../security/api-auth/token-refresh');

describe('TokenRefreshManager', () => {
  let manager;
  let mockRefreshCallback;

  beforeEach(() => {
    manager = new TokenRefreshManager({
      refreshBeforeExpiry: 1000, // 1 second for testing
      maxRetries: 2,
      retryDelay: 100,
      cleanupInterval: 5000
    });
    
    mockRefreshCallback = jest.fn().mockResolvedValue({
      accessToken: 'new-access-token',
      expiresIn: 3600
    });
  });

  afterEach(() => {
    manager.destroy();
  });

  describe('registerToken', () => {
    it('should register token for auto-refresh', () => {
      const result = manager.registerToken('token-1', {
        accessToken: 'access-123',
        expiresIn: 10 // 10 seconds
      }, mockRefreshCallback);

      expect(result.tokenId).toBe('token-1');
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(manager.tokens.has('token-1')).toBe(true);
      expect(manager.refreshCallbacks.has('token-1')).toBe(true);
    });

    it('should require tokenId, tokenData, and refreshCallback', () => {
      expect(() => manager.registerToken()).toThrow('tokenId, tokenData, and refreshCallback are required');
    });

    it('should require expiresAt or expiresIn', () => {
      expect(() => manager.registerToken('token-1', {}, mockRefreshCallback))
        .toThrow('Token must have expiresAt or expiresIn');
    });

    it('should emit token:registered event', (done) => {
      manager.on('token:registered', (data) => {
        expect(data.tokenId).toBe('token-1');
        expect(data.expiresAt).toBeInstanceOf(Date);
        done();
      });

      manager.registerToken('token-1', { expiresIn: 10 }, mockRefreshCallback);
    });
  });

  describe('unregisterToken', () => {
    beforeEach(() => {
      manager.registerToken('token-1', { expiresIn: 10 }, mockRefreshCallback);
    });

    it('should unregister token', () => {
      const result = manager.unregisterToken('token-1');
      
      expect(result.success).toBe(true);
      expect(manager.tokens.has('token-1')).toBe(false);
      expect(manager.refreshCallbacks.has('token-1')).toBe(false);
    });

    it('should clear refresh timer', () => {
      expect(manager.refreshTimers.has('token-1')).toBe(true);
      
      manager.unregisterToken('token-1');
      
      expect(manager.refreshTimers.has('token-1')).toBe(false);
    });

    it('should emit token:unregistered event', (done) => {
      manager.on('token:unregistered', (data) => {
        expect(data.tokenId).toBe('token-1');
        done();
      });

      manager.unregisterToken('token-1');
    });
  });

  describe('scheduleRefresh', () => {
    it('should schedule refresh before expiry', (done) => {
      manager.on('token:scheduled', (data) => {
        expect(data.tokenId).toBe('token-1');
        expect(data.delay).toBeGreaterThan(0);
        expect(data.delay).toBeLessThanOrEqual(1000);
        done();
      });

      manager.registerToken('token-1', {
        expiresIn: 2 // 2 seconds
      }, mockRefreshCallback);
    });

    it('should refresh immediately if token is expired', async () => {
      manager.registerToken('token-1', {
        expiresAt: Date.now() - 1000 // Already expired
      }, mockRefreshCallback);

      // Wait a bit for immediate refresh
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(mockRefreshCallback).toHaveBeenCalled();
    });
  });

  describe('refreshToken', () => {
    beforeEach(() => {
      manager.registerToken('token-1', {
        accessToken: 'old-token',
        expiresIn: 10
      }, mockRefreshCallback);
    });

    it('should refresh token successfully', async () => {
      const result = await manager.refreshToken('token-1');
      
      expect(result.accessToken).toBe('new-access-token');
      expect(mockRefreshCallback).toHaveBeenCalled();
      
      const tokenData = manager.tokens.get('token-1');
      expect(tokenData.lastRefreshed).toBeDefined();
      expect(tokenData.refreshCount).toBe(1);
    });

    it('should emit refresh events', async () => {
      const events = [];
      
      manager.on('token:refresh:start', (data) => events.push({ type: 'start', data }));
      manager.on('token:refresh:success', (data) => events.push({ type: 'success', data }));
      
      await manager.refreshToken('token-1');
      
      expect(events).toHaveLength(2);
      expect(events[0].type).toBe('start');
      expect(events[1].type).toBe('success');
    });

    it('should retry on failure', async () => {
      mockRefreshCallback
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ accessToken: 'retry-token', expiresIn: 3600 });

      const events = [];
      manager.on('token:refresh:retry', (data) => events.push(data));
      
      // Start refresh (it will retry automatically)
      manager.refreshToken('token-1');
      
      // Wait for retry
      await new Promise(resolve => setTimeout(resolve, 200));
      
      expect(events).toHaveLength(1);
      expect(events[0].retryCount).toBe(1);
      expect(mockRefreshCallback).toHaveBeenCalledTimes(2);
    });

    it('should fail after max retries', async () => {
      mockRefreshCallback.mockRejectedValue(new Error('Persistent error'));
      
      const events = [];
      manager.on('token:refresh:failed', (data) => events.push(data));
      
      // Start refresh
      manager.refreshToken('token-1');
      
      // Wait for retries
      await new Promise(resolve => setTimeout(resolve, 500));
      
      expect(events).toHaveLength(1);
      expect(events[0].error).toBe('Max retries exceeded');
      expect(manager.tokens.has('token-1')).toBe(false); // Token should be unregistered
    });
  });

  describe('getTokenInfo', () => {
    it('should return token information', () => {
      const now = Date.now();
      manager.registerToken('token-1', {
        expiresAt: now + 10000 // 10 seconds from now
      }, mockRefreshCallback);
      
      const info = manager.getTokenInfo('token-1');
      
      expect(info.tokenId).toBe('token-1');
      expect(info.expiresAt).toBeInstanceOf(Date);
      expect(info.expiresIn).toBeGreaterThan(0);
      expect(info.isExpired).toBe(false);
      expect(info.refreshCount).toBe(0);
    });

    it('should detect expired tokens', () => {
      manager.registerToken('token-1', {
        expiresAt: Date.now() - 1000 // Expired
      }, mockRefreshCallback);
      
      const info = manager.getTokenInfo('token-1');
      
      expect(info.isExpired).toBe(true);
      expect(info.expiresIn).toBe(0);
    });

    it('should return null for unknown token', () => {
      const info = manager.getTokenInfo('unknown');
      expect(info).toBeNull();
    });
  });

  describe('forceRefresh', () => {
    it('should manually refresh token', async () => {
      manager.registerToken('token-1', {
        expiresIn: 3600
      }, mockRefreshCallback);
      
      const result = await manager.forceRefresh('token-1');
      
      expect(result.accessToken).toBe('new-access-token');
      expect(mockRefreshCallback).toHaveBeenCalled();
    });

    it('should throw for unknown token', async () => {
      await expect(manager.forceRefresh('unknown'))
        .rejects.toThrow('Token not found');
    });
  });

  describe('needsRefresh', () => {
    it('should detect when token needs refresh', () => {
      manager.registerToken('token-1', {
        expiresAt: Date.now() + 500 // Expires in 0.5 seconds
      }, mockRefreshCallback);
      
      expect(manager.needsRefresh('token-1')).toBe(true);
    });

    it('should return false when token is fresh', () => {
      manager.registerToken('token-1', {
        expiresAt: Date.now() + 10000 // Expires in 10 seconds
      }, mockRefreshCallback);
      
      expect(manager.needsRefresh('token-1')).toBe(false);
    });
  });

  describe('createAutoRefreshMiddleware', () => {
    const mockGetTokenId = jest.fn().mockReturnValue('user-123');
    const mockGetTokenData = jest.fn().mockResolvedValue({
      accessToken: 'current-token',
      expiresIn: 2 // Short expiry for testing
    });
    const mockRefreshCallbackMiddleware = jest.fn().mockResolvedValue({
      accessToken: 'refreshed-token',
      expiresIn: 3600
    });

    it('should register token on first request', async () => {
      const middleware = manager.createAutoRefreshMiddleware(
        mockGetTokenId,
        mockGetTokenData,
        mockRefreshCallbackMiddleware
      );

      const req = {};
      const res = {};
      const next = jest.fn();
      
      await middleware(req, res, next);
      
      expect(mockGetTokenId).toHaveBeenCalledWith(req);
      expect(mockGetTokenData).toHaveBeenCalledWith(req);
      expect(manager.tokens.has('user-123')).toBe(true);
      expect(next).toHaveBeenCalled();
    });

    it('should refresh token if needed', async () => {
      // Register token that needs refresh
      manager.registerToken('user-123', {
        expiresAt: Date.now() + 500 // Needs refresh
      }, mockRefreshCallbackMiddleware);

      const middleware = manager.createAutoRefreshMiddleware(
        mockGetTokenId,
        mockGetTokenData,
        mockRefreshCallbackMiddleware
      );

      const req = { user: {} };
      const res = {};
      const next = jest.fn();
      
      await middleware(req, res, next);
      
      expect(mockRefreshCallbackMiddleware).toHaveBeenCalled();
      expect(req.user.tokenData).toBeDefined();
      expect(req.user.tokenData.accessToken).toBe('refreshed-token');
    });

    it('should continue on errors', async () => {
      mockGetTokenId.mockImplementation(() => {
        throw new Error('Test error');
      });

      const middleware = manager.createAutoRefreshMiddleware(
        mockGetTokenId,
        mockGetTokenData,
        mockRefreshCallbackMiddleware
      );

      const req = {};
      const res = {};
      const next = jest.fn();
      
      await middleware(req, res, next);
      
      expect(next).toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should remove expired tokens', () => {
      // Add expired token
      manager.tokens.set('expired', {
        expiresAt: Date.now() - 3700000 // Expired over 1 hour ago
      });
      
      // Add fresh token
      manager.tokens.set('fresh', {
        expiresAt: Date.now() + 3600000
      });
      
      manager.cleanup();
      
      expect(manager.tokens.has('expired')).toBe(false);
      expect(manager.tokens.has('fresh')).toBe(true);
    });

    it('should emit cleanup events', (done) => {
      manager.on('cleanup:complete', (data) => {
        expect(data.cleanedCount).toBe(1);
        expect(data.remainingCount).toBe(0);
        done();
      });

      manager.tokens.set('expired', {
        expiresAt: Date.now() - 3700000
      });
      
      manager.cleanup();
    });
  });

  describe('destroy', () => {
    it('should clean up all resources', (done) => {
      manager.on('destroyed', () => {
        expect(manager.tokens.size).toBe(0);
        expect(manager.refreshTimers.size).toBe(0);
        expect(manager.refreshCallbacks.size).toBe(0);
        done();
      });

      manager.registerToken('token-1', { expiresIn: 10 }, mockRefreshCallback);
      manager.destroy();
    });
  });

  describe('createJWTRefreshManager', () => {
    it('should create manager with JWT-specific helpers', () => {
      const mockJWTAuth = {
        refreshAccessToken: jest.fn().mockResolvedValue({
          accessToken: 'new-jwt',
          expiresIn: 3600
        })
      };

      const jwtManager = createJWTRefreshManager(mockJWTAuth);
      
      expect(jwtManager).toBeInstanceOf(TokenRefreshManager);
      expect(jwtManager.registerJWTToken).toBeDefined();
      
      jwtManager.destroy();
    });

    it('should register JWT tokens with refresh logic', async () => {
      const mockJWTAuth = {
        refreshAccessToken: jest.fn().mockResolvedValue({
          accessToken: 'new-jwt',
          expiresIn: 3600
        })
      };

      const jwtManager = createJWTRefreshManager(mockJWTAuth);
      
      const result = jwtManager.registerJWTToken('user-123', {
        accessToken: 'old-jwt',
        refreshToken: 'refresh-jwt',
        expiresIn: 10
      });
      
      expect(result.tokenId).toMatch(/^jwt_user-123_/);
      
      // Force refresh to test JWT refresh logic
      await jwtManager.forceRefresh(result.tokenId);
      
      expect(mockJWTAuth.refreshAccessToken).toHaveBeenCalledWith('refresh-jwt');
      
      jwtManager.destroy();
    });
  });
});