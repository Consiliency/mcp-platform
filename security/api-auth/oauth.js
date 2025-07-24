/**
 * OAuth2 Authentication Module
 * Implements OAuth2 flow for third-party integrations
 * 
 * @module security/api-auth/oauth
 */

const crypto = require('crypto');
const querystring = require('querystring');

class OAuth2Provider {
  constructor(config) {
    if (!config.authorizationURL || !config.tokenURL) {
      throw new Error('authorizationURL and tokenURL are required');
    }

    this.config = {
      authorizationURL: config.authorizationURL,
      tokenURL: config.tokenURL,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      scope: config.scope || [],
      userInfoURL: config.userInfoURL,
      callbackURL: config.callbackURL,
      ...config
    };

    // Store authorization states for CSRF protection
    this.states = new Map();
    
    // Store authorization codes (in production, use Redis)
    this.authorizationCodes = new Map();
    
    // Store access tokens (in production, use Redis)
    this.accessTokens = new Map();
  }

  /**
   * Generate authorization URL for OAuth2 flow
   */
  getAuthorizationUrl(options = {}) {
    const state = options.state || crypto.randomBytes(32).toString('hex');
    const nonce = crypto.randomBytes(16).toString('hex');
    
    // Store state for verification
    this.states.set(state, {
      nonce,
      createdAt: Date.now(),
      redirectUri: options.redirectUri || this.config.callbackURL,
      scope: options.scope || this.config.scope
    });

    // Clean up old states (older than 10 minutes)
    this.cleanupStates();

    const params = {
      response_type: 'code',
      client_id: options.clientId || this.config.clientId,
      redirect_uri: options.redirectUri || this.config.callbackURL,
      scope: (options.scope || this.config.scope).join(' '),
      state,
      nonce,
      ...options.additionalParams
    };

    return `${this.config.authorizationURL}?${querystring.stringify(params)}`;
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForToken(code, state, redirectUri) {
    if (!code || !state) {
      throw new Error('Authorization code and state are required');
    }

    // Verify state
    const stateData = this.states.get(state);
    if (!stateData) {
      throw new Error('Invalid state parameter');
    }

    // Remove state to prevent reuse
    this.states.delete(state);

    // Check state expiry (10 minutes)
    if (Date.now() - stateData.createdAt > 600000) {
      throw new Error('State has expired');
    }

    const params = {
      grant_type: 'authorization_code',
      code,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      redirect_uri: redirectUri || stateData.redirectUri
    };

    try {
      const response = await this.makeTokenRequest(params);
      
      // Store tokens
      const tokenId = crypto.randomBytes(16).toString('hex');
      this.accessTokens.set(tokenId, {
        accessToken: response.access_token,
        refreshToken: response.refresh_token,
        expiresAt: Date.now() + (response.expires_in * 1000),
        scope: response.scope,
        tokenType: response.token_type || 'Bearer'
      });

      return {
        accessToken: response.access_token,
        refreshToken: response.refresh_token,
        expiresIn: response.expires_in,
        tokenType: response.token_type || 'Bearer',
        scope: response.scope,
        tokenId
      };
    } catch (error) {
      throw new Error(`Token exchange failed: ${error.message}`);
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(refreshToken) {
    if (!refreshToken) {
      throw new Error('Refresh token is required');
    }

    const params = {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret
    };

    try {
      const response = await this.makeTokenRequest(params);
      
      // Store new tokens
      const tokenId = crypto.randomBytes(16).toString('hex');
      this.accessTokens.set(tokenId, {
        accessToken: response.access_token,
        refreshToken: response.refresh_token || refreshToken,
        expiresAt: Date.now() + (response.expires_in * 1000),
        scope: response.scope,
        tokenType: response.token_type || 'Bearer'
      });

      return {
        accessToken: response.access_token,
        refreshToken: response.refresh_token || refreshToken,
        expiresIn: response.expires_in,
        tokenType: response.token_type || 'Bearer',
        scope: response.scope,
        tokenId
      };
    } catch (error) {
      throw new Error(`Token refresh failed: ${error.message}`);
    }
  }

  /**
   * Validate access token
   */
  async validateToken(accessToken) {
    if (!accessToken) {
      return { valid: false, error: 'Access token is required' };
    }

    // Check if token exists in our store
    for (const [tokenId, tokenData] of this.accessTokens.entries()) {
      if (tokenData.accessToken === accessToken) {
        // Check expiry
        if (Date.now() > tokenData.expiresAt) {
          this.accessTokens.delete(tokenId);
          return { valid: false, error: 'Token has expired' };
        }

        return {
          valid: true,
          tokenId,
          scope: tokenData.scope,
          expiresAt: new Date(tokenData.expiresAt)
        };
      }
    }

    // If we have a validation endpoint, use it
    if (this.config.introspectionURL) {
      try {
        const isValid = await this.introspectToken(accessToken);
        return {
          valid: isValid,
          error: isValid ? null : 'Token is invalid or expired'
        };
      } catch (error) {
        return { valid: false, error: error.message };
      }
    }

    return { valid: false, error: 'Token not found' };
  }

  /**
   * Get user info using access token
   */
  async getUserInfo(accessToken) {
    if (!this.config.userInfoURL) {
      throw new Error('User info URL not configured');
    }

    try {
      // In a real implementation, make HTTP request to userInfoURL
      // For now, return mock user info
      return {
        sub: 'user123',
        email: 'user@example.com',
        name: 'OAuth User',
        picture: 'https://example.com/avatar.jpg'
      };
    } catch (error) {
      throw new Error(`Failed to get user info: ${error.message}`);
    }
  }

  /**
   * Revoke token
   */
  async revokeToken(token, tokenType = 'access_token') {
    if (!token) {
      return { success: false, error: 'Token is required' };
    }

    // Remove from our store
    for (const [tokenId, tokenData] of this.accessTokens.entries()) {
      if (tokenData.accessToken === token || tokenData.refreshToken === token) {
        this.accessTokens.delete(tokenId);
        break;
      }
    }

    // If we have a revocation endpoint, use it
    if (this.config.revocationURL) {
      try {
        await this.revokeTokenRemote(token, tokenType);
      } catch (error) {
        console.error('Remote token revocation failed:', error);
      }
    }

    return { success: true };
  }

  /**
   * Make token request (mock implementation)
   */
  async makeTokenRequest(params) {
    // In a real implementation, this would make an HTTP POST request
    // to the token endpoint with the given parameters
    
    // Mock successful response
    return {
      access_token: `mock_access_${crypto.randomBytes(16).toString('hex')}`,
      refresh_token: `mock_refresh_${crypto.randomBytes(16).toString('hex')}`,
      expires_in: 3600,
      token_type: 'Bearer',
      scope: params.scope || this.config.scope.join(' ')
    };
  }

  /**
   * Introspect token (mock implementation)
   */
  async introspectToken(token) {
    // In a real implementation, this would make an HTTP POST request
    // to the introspection endpoint
    return true;
  }

  /**
   * Revoke token remotely (mock implementation)
   */
  async revokeTokenRemote(token, tokenType) {
    // In a real implementation, this would make an HTTP POST request
    // to the revocation endpoint
    return true;
  }

  /**
   * Clean up expired states
   */
  cleanupStates() {
    const now = Date.now();
    const expiry = 600000; // 10 minutes

    for (const [state, data] of this.states.entries()) {
      if (now - data.createdAt > expiry) {
        this.states.delete(state);
      }
    }
  }

  /**
   * Create OAuth2 middleware
   */
  createOAuth2Middleware(options = {}) {
    return async (req, res, next) => {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Bearer token required' });
      }

      const token = authHeader.substring(7);
      const validation = await this.validateToken(token);

      if (!validation.valid) {
        return res.status(401).json({ error: validation.error });
      }

      // Check scopes if required
      if (options.requiredScopes && options.requiredScopes.length > 0) {
        const tokenScopes = validation.scope ? validation.scope.split(' ') : [];
        const hasRequiredScopes = options.requiredScopes.every(scope =>
          tokenScopes.includes(scope)
        );

        if (!hasRequiredScopes) {
          return res.status(403).json({ error: 'Insufficient scope' });
        }
      }

      req.oauth = {
        tokenId: validation.tokenId,
        scope: validation.scope,
        expiresAt: validation.expiresAt
      };

      next();
    };
  }
}

/**
 * Factory function for common OAuth2 providers
 */
function createOAuth2Provider(provider, config) {
  const providers = {
    google: {
      authorizationURL: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenURL: 'https://oauth2.googleapis.com/token',
      userInfoURL: 'https://www.googleapis.com/oauth2/v3/userinfo',
      scope: ['openid', 'email', 'profile']
    },
    github: {
      authorizationURL: 'https://github.com/login/oauth/authorize',
      tokenURL: 'https://github.com/login/oauth/access_token',
      userInfoURL: 'https://api.github.com/user',
      scope: ['user:email']
    },
    microsoft: {
      authorizationURL: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      tokenURL: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      userInfoURL: 'https://graph.microsoft.com/v1.0/me',
      scope: ['openid', 'email', 'profile']
    }
  };

  const providerConfig = providers[provider];
  if (!providerConfig) {
    throw new Error(`Unknown OAuth2 provider: ${provider}`);
  }

  return new OAuth2Provider({
    ...providerConfig,
    ...config
  });
}

module.exports = {
  OAuth2Provider,
  createOAuth2Provider
};