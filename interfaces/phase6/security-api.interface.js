// Contract: Security API
// Purpose: Define the authentication and authorization interface
// Team responsible: Security API Team

class SecurityAPIInterface {
  constructor(config) {
    // config: { jwtSecret: string, tokenExpiry: number, refreshTokenExpiry: number }
    throw new Error('Not implemented - Security API team will implement');
  }

  // JWT Authentication
  async generateToken(payload) {
    // payload: { userId: string, roles: string[], permissions: string[] }
    // returns: { accessToken: string, refreshToken: string, expiresIn: number }
    throw new Error('Not implemented - Security API team will implement');
  }

  async verifyToken(token) {
    // token: string
    // returns: { valid: boolean, payload?: object, error?: string }
    throw new Error('Not implemented - Security API team will implement');
  }

  async refreshAccessToken(refreshToken) {
    // refreshToken: string
    // returns: { accessToken: string, expiresIn: number }
    throw new Error('Not implemented - Security API team will implement');
  }

  async revokeToken(token) {
    // token: string
    // returns: { success: boolean }
    throw new Error('Not implemented - Security API team will implement');
  }

  // API Key Management
  async generateAPIKey(userId, permissions) {
    // userId: string, permissions: string[]
    // returns: { apiKey: string, keyId: string }
    throw new Error('Not implemented - Security API team will implement');
  }

  async validateAPIKey(apiKey) {
    // apiKey: string
    // returns: { valid: boolean, userId?: string, permissions?: string[] }
    throw new Error('Not implemented - Security API team will implement');
  }

  async revokeAPIKey(keyId) {
    // keyId: string
    // returns: { success: boolean }
    throw new Error('Not implemented - Security API team will implement');
  }

  // Middleware factory
  createAuthMiddleware(options) {
    // options: { requireAuth: boolean, roles?: string[], permissions?: string[] }
    // returns: Express/Koa middleware function
    throw new Error('Not implemented - Security API team will implement');
  }
}

module.exports = SecurityAPIInterface;