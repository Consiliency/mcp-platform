// Mock implementation of SecurityAPIInterface for testing
class MockSecurityAPIInterface {
  constructor(config) {
    this.config = config;
    this.tokens = new Map();
  }

  async generateToken(payload) {
    const token = `mock-token-${Date.now()}`;
    this.tokens.set(token, payload);
    return {
      accessToken: token,
      refreshToken: `refresh-${token}`,
      expiresIn: 3600
    };
  }

  async verifyToken(token) {
    const payload = this.tokens.get(token);
    return {
      valid: !!payload,
      payload,
      expired: false
    };
  }

  async generateAPIKey(name, scopes) {
    return {
      apiKey: `mock-api-key-${Date.now()}`,
      apiKeyId: `key-id-${Date.now()}`,
      name,
      scopes,
      createdAt: new Date()
    };
  }

  createAuthMiddleware(options) {
    return async (req, res, next) => {
      if (options.requireAuth) {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) {
          return res.status(401).json({ error: 'No token provided' });
        }
        const result = await this.verifyToken(token);
        if (!result.valid) {
          return res.status(401).json({ error: 'Invalid token' });
        }
        req.user = result.payload;
      }
      next();
    };
  }
}

module.exports = MockSecurityAPIInterface;