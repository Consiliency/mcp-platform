const jwt = require('jsonwebtoken');
const crypto = require('crypto');

class JWTAuth {
  constructor(config) {
    this.jwtSecret = config.jwtSecret || crypto.randomBytes(32).toString('hex');
    this.tokenExpiry = config.tokenExpiry || 3600; // 1 hour default
    this.refreshTokenExpiry = config.refreshTokenExpiry || 604800; // 7 days default
    this.revokedTokens = new Set(); // In-memory storage for revoked tokens
    this.apiKeys = new Map(); // In-memory storage for API keys
    this.refreshTokens = new Map(); // Store refresh tokens with user info
  }

  // JWT Authentication
  async generateToken(payload) {
    if (!payload || !payload.userId) {
      throw new Error('Invalid payload: userId is required');
    }

    const tokenId = crypto.randomBytes(16).toString('hex');
    const refreshTokenId = crypto.randomBytes(32).toString('hex');

    const accessToken = jwt.sign(
      {
        userId: payload.userId,
        roles: payload.roles || [],
        permissions: payload.permissions || [],
        jti: tokenId
      },
      this.jwtSecret,
      {
        expiresIn: this.tokenExpiry,
        algorithm: 'HS256'
      }
    );

    const refreshToken = jwt.sign(
      {
        userId: payload.userId,
        type: 'refresh',
        jti: refreshTokenId
      },
      this.jwtSecret,
      {
        expiresIn: this.refreshTokenExpiry,
        algorithm: 'HS256'
      }
    );

    // Store refresh token mapping
    this.refreshTokens.set(refreshTokenId, {
      userId: payload.userId,
      roles: payload.roles,
      permissions: payload.permissions,
      createdAt: new Date()
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: this.tokenExpiry
    };
  }

  async verifyToken(token) {
    if (!token) {
      return { valid: false, error: 'Token is required' };
    }

    try {
      const decoded = jwt.verify(token, this.jwtSecret, {
        algorithms: ['HS256']
      });

      // Check if token is revoked
      if (this.revokedTokens.has(decoded.jti)) {
        return { valid: false, error: 'Token has been revoked' };
      }

      return {
        valid: true,
        payload: {
          userId: decoded.userId,
          roles: decoded.roles,
          permissions: decoded.permissions
        }
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  async refreshAccessToken(refreshToken) {
    if (!refreshToken) {
      throw new Error('Refresh token is required');
    }

    try {
      const decoded = jwt.verify(refreshToken, this.jwtSecret, {
        algorithms: ['HS256']
      });

      if (decoded.type !== 'refresh') {
        throw new Error('Invalid token type');
      }

      // Check if refresh token exists and is not revoked
      if (!this.refreshTokens.has(decoded.jti) || this.revokedTokens.has(decoded.jti)) {
        throw new Error('Invalid or revoked refresh token');
      }

      const tokenData = this.refreshTokens.get(decoded.jti);
      const tokenId = crypto.randomBytes(16).toString('hex');

      const accessToken = jwt.sign(
        {
          userId: tokenData.userId,
          roles: tokenData.roles || [],
          permissions: tokenData.permissions || [],
          jti: tokenId
        },
        this.jwtSecret,
        {
          expiresIn: this.tokenExpiry,
          algorithm: 'HS256'
        }
      );

      return {
        accessToken,
        expiresIn: this.tokenExpiry
      };
    } catch (error) {
      throw new Error(`Failed to refresh token: ${error.message}`);
    }
  }

  async revokeToken(token) {
    if (!token) {
      return { success: false };
    }

    try {
      const decoded = jwt.decode(token);
      if (decoded && decoded.jti) {
        this.revokedTokens.add(decoded.jti);
        
        // If it's a refresh token, remove from refresh tokens map
        if (decoded.type === 'refresh') {
          this.refreshTokens.delete(decoded.jti);
        }
        
        return { success: true };
      }
      return { success: false };
    } catch (error) {
      return { success: false };
    }
  }

  // API Key Management
  async generateAPIKey(userId, permissions) {
    if (!userId) {
      throw new Error('userId is required');
    }

    const apiKey = `mcp_${crypto.randomBytes(32).toString('hex')}`;
    const keyId = crypto.randomUUID();

    this.apiKeys.set(apiKey, {
      keyId,
      userId,
      permissions: permissions || [],
      createdAt: new Date()
    });

    return {
      apiKey,
      keyId
    };
  }

  async validateAPIKey(apiKey) {
    if (!apiKey) {
      return { valid: false };
    }

    const keyData = this.apiKeys.get(apiKey);
    if (!keyData) {
      return { valid: false };
    }

    return {
      valid: true,
      userId: keyData.userId,
      permissions: keyData.permissions
    };
  }

  async revokeAPIKey(keyId) {
    if (!keyId) {
      return { success: false };
    }

    // Find and remove API key by keyId
    for (const [apiKey, data] of this.apiKeys.entries()) {
      if (data.keyId === keyId) {
        this.apiKeys.delete(apiKey);
        return { success: true };
      }
    }

    return { success: false };
  }

  // Middleware factory
  createAuthMiddleware(options = {}) {
    return async (req, res, next) => {
      if (!options.requireAuth) {
        return next();
      }

      // Check for Authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ error: 'Authorization header required' });
      }

      // Support both Bearer tokens and API keys
      if (authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const result = await this.verifyToken(token);

        if (!result.valid) {
          return res.status(401).json({ error: result.error || 'Invalid token' });
        }

        // Check roles if specified
        if (options.roles && options.roles.length > 0) {
          const hasRole = options.roles.some(role => 
            result.payload.roles.includes(role)
          );
          if (!hasRole) {
            return res.status(403).json({ error: 'Insufficient role permissions' });
          }
        }

        // Check permissions if specified
        if (options.permissions && options.permissions.length > 0) {
          const hasPermission = options.permissions.some(permission => 
            result.payload.permissions.includes(permission)
          );
          if (!hasPermission) {
            return res.status(403).json({ error: 'Insufficient permissions' });
          }
        }

        req.user = result.payload;
        next();
      } else if (authHeader.startsWith('ApiKey ')) {
        const apiKey = authHeader.substring(7);
        const result = await this.validateAPIKey(apiKey);

        if (!result.valid) {
          return res.status(401).json({ error: 'Invalid API key' });
        }

        // Check permissions for API keys
        if (options.permissions && options.permissions.length > 0) {
          const hasPermission = options.permissions.some(permission => 
            result.permissions.includes(permission)
          );
          if (!hasPermission) {
            return res.status(403).json({ error: 'Insufficient permissions' });
          }
        }

        req.user = {
          userId: result.userId,
          permissions: result.permissions,
          authType: 'apikey'
        };
        next();
      } else {
        res.status(401).json({ error: 'Invalid authorization format' });
      }
    };
  }
}

module.exports = JWTAuth;