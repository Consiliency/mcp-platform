/**
 * Token Refresh Mechanism Module
 * Handles token lifecycle management and automatic refresh
 * 
 * @module security/api-auth/token-refresh
 */

const crypto = require('crypto');
const EventEmitter = require('events');

class TokenRefreshManager extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      refreshBeforeExpiry: options.refreshBeforeExpiry || 300000, // 5 minutes before expiry
      maxRetries: options.maxRetries || 3,
      retryDelay: options.retryDelay || 1000,
      cleanupInterval: options.cleanupInterval || 300000, // 5 minutes
      ...options
    };

    // Token storage (in production, use Redis)
    this.tokens = new Map();
    this.refreshTimers = new Map();
    this.refreshCallbacks = new Map();

    // Start cleanup interval
    this.cleanupTimer = setInterval(() => this.cleanup(), this.options.cleanupInterval);
  }

  /**
   * Register a token for automatic refresh
   */
  registerToken(tokenId, tokenData, refreshCallback) {
    if (!tokenId || !tokenData || !refreshCallback) {
      throw new Error('tokenId, tokenData, and refreshCallback are required');
    }

    if (!tokenData.expiresAt && !tokenData.expiresIn) {
      throw new Error('Token must have expiresAt or expiresIn');
    }

    const expiresAt = tokenData.expiresAt || Date.now() + (tokenData.expiresIn * 1000);
    
    // Store token data
    this.tokens.set(tokenId, {
      ...tokenData,
      expiresAt,
      registeredAt: Date.now(),
      lastRefreshed: null,
      refreshCount: 0
    });

    // Store refresh callback
    this.refreshCallbacks.set(tokenId, refreshCallback);

    // Schedule refresh
    this.scheduleRefresh(tokenId);

    this.emit('token:registered', { tokenId, expiresAt: new Date(expiresAt) });

    return {
      tokenId,
      expiresAt: new Date(expiresAt),
      willRefreshAt: new Date(expiresAt - this.options.refreshBeforeExpiry)
    };
  }

  /**
   * Unregister a token
   */
  unregisterToken(tokenId) {
    if (!tokenId) {
      return { success: false, error: 'tokenId is required' };
    }

    // Clear refresh timer
    if (this.refreshTimers.has(tokenId)) {
      clearTimeout(this.refreshTimers.get(tokenId));
      this.refreshTimers.delete(tokenId);
    }

    // Remove token data and callback
    this.tokens.delete(tokenId);
    this.refreshCallbacks.delete(tokenId);

    this.emit('token:unregistered', { tokenId });

    return { success: true };
  }

  /**
   * Schedule token refresh
   */
  scheduleRefresh(tokenId) {
    const tokenData = this.tokens.get(tokenId);
    if (!tokenData) {
      return;
    }

    // Clear existing timer
    if (this.refreshTimers.has(tokenId)) {
      clearTimeout(this.refreshTimers.get(tokenId));
    }

    const now = Date.now();
    const refreshAt = tokenData.expiresAt - this.options.refreshBeforeExpiry;
    const delay = Math.max(0, refreshAt - now);

    // If token is already expired or very close to expiry, refresh immediately
    if (delay === 0) {
      this.refreshToken(tokenId);
      return;
    }

    const timer = setTimeout(() => {
      this.refreshToken(tokenId);
    }, delay);

    this.refreshTimers.set(tokenId, timer);

    this.emit('token:scheduled', {
      tokenId,
      refreshAt: new Date(refreshAt),
      delay
    });
  }

  /**
   * Refresh a token
   */
  async refreshToken(tokenId, retryCount = 0) {
    const tokenData = this.tokens.get(tokenId);
    const refreshCallback = this.refreshCallbacks.get(tokenId);

    if (!tokenData || !refreshCallback) {
      this.emit('token:refresh:failed', {
        tokenId,
        error: 'Token or refresh callback not found'
      });
      return;
    }

    try {
      this.emit('token:refresh:start', { tokenId, retryCount });

      // Call the refresh callback
      const newTokenData = await refreshCallback(tokenData);

      if (!newTokenData) {
        throw new Error('Refresh callback returned no data');
      }

      // Update token data
      const expiresAt = newTokenData.expiresAt || 
                       Date.now() + (newTokenData.expiresIn * 1000);

      this.tokens.set(tokenId, {
        ...tokenData,
        ...newTokenData,
        expiresAt,
        lastRefreshed: Date.now(),
        refreshCount: tokenData.refreshCount + 1
      });

      // Schedule next refresh
      this.scheduleRefresh(tokenId);

      this.emit('token:refresh:success', {
        tokenId,
        expiresAt: new Date(expiresAt),
        refreshCount: tokenData.refreshCount + 1
      });

      return newTokenData;
    } catch (error) {
      this.emit('token:refresh:error', {
        tokenId,
        error: error.message,
        retryCount
      });

      // Retry if we haven't exceeded max retries
      if (retryCount < this.options.maxRetries) {
        const delay = this.options.retryDelay * Math.pow(2, retryCount); // Exponential backoff
        
        setTimeout(() => {
          this.refreshToken(tokenId, retryCount + 1);
        }, delay);

        this.emit('token:refresh:retry', {
          tokenId,
          retryCount: retryCount + 1,
          nextRetryIn: delay
        });
      } else {
        this.emit('token:refresh:failed', {
          tokenId,
          error: 'Max retries exceeded',
          originalError: error.message
        });

        // Unregister the token as it can't be refreshed
        this.unregisterToken(tokenId);
      }
    }
  }

  /**
   * Get token information
   */
  getTokenInfo(tokenId) {
    const tokenData = this.tokens.get(tokenId);
    if (!tokenData) {
      return null;
    }

    const now = Date.now();
    const expiresIn = Math.max(0, tokenData.expiresAt - now);
    const isExpired = expiresIn === 0;

    return {
      tokenId,
      expiresAt: new Date(tokenData.expiresAt),
      expiresIn: Math.floor(expiresIn / 1000),
      isExpired,
      registeredAt: new Date(tokenData.registeredAt),
      lastRefreshed: tokenData.lastRefreshed ? new Date(tokenData.lastRefreshed) : null,
      refreshCount: tokenData.refreshCount
    };
  }

  /**
   * Get all registered tokens
   */
  getAllTokens() {
    const tokens = [];
    
    for (const [tokenId] of this.tokens.entries()) {
      const info = this.getTokenInfo(tokenId);
      if (info) {
        tokens.push(info);
      }
    }

    return tokens;
  }

  /**
   * Manually refresh a token
   */
  async forceRefresh(tokenId) {
    if (!this.tokens.has(tokenId)) {
      throw new Error('Token not found');
    }

    return await this.refreshToken(tokenId);
  }

  /**
   * Check if a token needs refresh
   */
  needsRefresh(tokenId) {
    const tokenData = this.tokens.get(tokenId);
    if (!tokenData) {
      return false;
    }

    const now = Date.now();
    const refreshThreshold = tokenData.expiresAt - this.options.refreshBeforeExpiry;
    
    return now >= refreshThreshold;
  }

  /**
   * Clean up expired tokens
   */
  cleanup() {
    const now = Date.now();
    const expiredTokens = [];

    for (const [tokenId, tokenData] of this.tokens.entries()) {
      // Remove tokens that have been expired for more than 1 hour
      if (now - tokenData.expiresAt > 3600000) {
        expiredTokens.push(tokenId);
      }
    }

    expiredTokens.forEach(tokenId => {
      this.unregisterToken(tokenId);
      this.emit('token:cleaned', { tokenId });
    });

    if (expiredTokens.length > 0) {
      this.emit('cleanup:complete', {
        cleanedCount: expiredTokens.length,
        remainingCount: this.tokens.size
      });
    }
  }

  /**
   * Create middleware for automatic token refresh
   */
  createAutoRefreshMiddleware(getTokenId, getTokenData, refreshCallback) {
    return async (req, res, next) => {
      try {
        const tokenId = getTokenId(req);
        if (!tokenId) {
          return next();
        }

        // Check if token is already registered
        if (!this.tokens.has(tokenId)) {
          const tokenData = await getTokenData(req);
          if (tokenData) {
            this.registerToken(tokenId, tokenData, async () => {
              return await refreshCallback(req, tokenData);
            });
          }
        }

        // Check if token needs refresh
        if (this.needsRefresh(tokenId)) {
          try {
            const newTokenData = await this.forceRefresh(tokenId);
            
            // Update request with new token data
            if (req.user) {
              req.user.tokenData = newTokenData;
            }
          } catch (error) {
            console.error('Token refresh failed:', error);
          }
        }

        next();
      } catch (error) {
        console.error('Auto-refresh middleware error:', error);
        next(); // Don't block on errors
      }
    };
  }

  /**
   * Destroy the refresh manager
   */
  destroy() {
    // Clear all timers
    for (const timer of this.refreshTimers.values()) {
      clearTimeout(timer);
    }

    // Clear cleanup timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    // Clear all data
    this.tokens.clear();
    this.refreshTimers.clear();
    this.refreshCallbacks.clear();

    this.emit('destroyed');
  }
}

/**
 * Create a token refresh manager for JWT tokens
 */
function createJWTRefreshManager(jwtAuth, options = {}) {
  const manager = new TokenRefreshManager(options);

  // Helper to register JWT tokens
  manager.registerJWTToken = function(userId, tokens) {
    const tokenId = `jwt_${userId}_${crypto.randomBytes(8).toString('hex')}`;
    
    return this.registerToken(
      tokenId,
      {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
        userId
      },
      async (tokenData) => {
        // Use the JWT auth instance to refresh the token
        const newTokens = await jwtAuth.refreshAccessToken(tokenData.refreshToken);
        return {
          accessToken: newTokens.accessToken,
          expiresIn: newTokens.expiresIn
        };
      }
    );
  };

  return manager;
}

/**
 * Create a token refresh manager for OAuth2 tokens
 */
function createOAuth2RefreshManager(oauth2Provider, options = {}) {
  const manager = new TokenRefreshManager(options);

  // Helper to register OAuth2 tokens
  manager.registerOAuth2Token = function(userId, tokens) {
    const tokenId = `oauth2_${userId}_${crypto.randomBytes(8).toString('hex')}`;
    
    return this.registerToken(
      tokenId,
      {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
        userId
      },
      async (tokenData) => {
        // Use the OAuth2 provider to refresh the token
        const newTokens = await oauth2Provider.refreshToken(tokenData.refreshToken);
        return {
          accessToken: newTokens.accessToken,
          refreshToken: newTokens.refreshToken || tokenData.refreshToken,
          expiresIn: newTokens.expiresIn
        };
      }
    );
  };

  return manager;
}

module.exports = {
  TokenRefreshManager,
  createJWTRefreshManager,
  createOAuth2RefreshManager
};