const crypto = require('crypto');

class APIKeyManager {
  constructor() {
    this.apiKeys = new Map();
    this.keysByUser = new Map(); // Track keys by user
  }

  generateKey(userId, permissions = []) {
    if (!userId) {
      throw new Error('userId is required');
    }

    const apiKey = this.createSecureKey();
    const keyId = crypto.randomUUID();
    const keyData = {
      keyId,
      userId,
      permissions,
      createdAt: new Date(),
      lastUsed: null,
      usageCount: 0
    };

    this.apiKeys.set(apiKey, keyData);
    
    // Track by user
    if (!this.keysByUser.has(userId)) {
      this.keysByUser.set(userId, new Set());
    }
    this.keysByUser.get(userId).add(apiKey);

    return {
      apiKey,
      keyId,
      userId,
      permissions
    };
  }

  validateKey(apiKey) {
    if (!apiKey || !this.apiKeys.has(apiKey)) {
      return { valid: false };
    }

    const keyData = this.apiKeys.get(apiKey);
    
    // Update usage statistics
    keyData.lastUsed = new Date();
    keyData.usageCount++;

    return {
      valid: true,
      userId: keyData.userId,
      permissions: keyData.permissions,
      keyId: keyData.keyId
    };
  }

  revokeKey(keyId) {
    // Find key by ID
    for (const [apiKey, data] of this.apiKeys.entries()) {
      if (data.keyId === keyId) {
        // Remove from main storage
        this.apiKeys.delete(apiKey);
        
        // Remove from user tracking
        const userKeys = this.keysByUser.get(data.userId);
        if (userKeys) {
          userKeys.delete(apiKey);
          if (userKeys.size === 0) {
            this.keysByUser.delete(data.userId);
          }
        }
        
        return { success: true, revoked: apiKey };
      }
    }
    
    return { success: false };
  }

  revokeUserKeys(userId) {
    const userKeys = this.keysByUser.get(userId);
    if (!userKeys) {
      return { success: false, count: 0 };
    }

    let count = 0;
    for (const apiKey of userKeys) {
      this.apiKeys.delete(apiKey);
      count++;
    }
    
    this.keysByUser.delete(userId);
    return { success: true, count };
  }

  listUserKeys(userId) {
    const userKeys = this.keysByUser.get(userId);
    if (!userKeys) {
      return [];
    }

    const keys = [];
    for (const apiKey of userKeys) {
      const data = this.apiKeys.get(apiKey);
      keys.push({
        keyId: data.keyId,
        permissions: data.permissions,
        createdAt: data.createdAt,
        lastUsed: data.lastUsed,
        usageCount: data.usageCount
      });
    }
    
    return keys;
  }

  getKeyStats(keyId) {
    for (const [apiKey, data] of this.apiKeys.entries()) {
      if (data.keyId === keyId) {
        return {
          found: true,
          stats: {
            userId: data.userId,
            permissions: data.permissions,
            createdAt: data.createdAt,
            lastUsed: data.lastUsed,
            usageCount: data.usageCount
          }
        };
      }
    }
    
    return { found: false };
  }

  createSecureKey() {
    // Generate a secure API key with prefix
    const prefix = 'mcp';
    const randomBytes = crypto.randomBytes(32).toString('base64url');
    return `${prefix}_${randomBytes}`;
  }

  // Middleware helper for Express/Koa
  middleware(requiredPermissions = []) {
    return async (req, res, next) => {
      const apiKey = this.extractApiKey(req);
      
      if (!apiKey) {
        return res.status(401).json({ error: 'API key required' });
      }

      const validation = this.validateKey(apiKey);
      if (!validation.valid) {
        return res.status(401).json({ error: 'Invalid API key' });
      }

      // Check permissions
      if (requiredPermissions.length > 0) {
        const hasPermission = requiredPermissions.every(perm =>
          validation.permissions.includes(perm)
        );
        
        if (!hasPermission) {
          return res.status(403).json({ error: 'Insufficient permissions' });
        }
      }

      // Attach user info to request
      req.apiKey = {
        userId: validation.userId,
        permissions: validation.permissions,
        keyId: validation.keyId
      };

      next();
    };
  }

  extractApiKey(req) {
    // Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('ApiKey ')) {
      return authHeader.substring(7);
    }

    // Check X-API-Key header
    if (req.headers['x-api-key']) {
      return req.headers['x-api-key'];
    }

    // Check query parameter
    if (req.query && req.query.api_key) {
      return req.query.api_key;
    }

    return null;
  }
}

module.exports = APIKeyManager;