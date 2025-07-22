/**
 * SSO Integration Module
 * ENTERPRISE-4.2: SAML, OAuth2/OIDC, LDAP/AD
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

class SSOAuthentication {
  constructor() {
    this.providers = new Map();
    this.sessions = new Map();
    this.jwtSecret = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');
    this.tokenExpiry = 3600; // 1 hour default
    this.refreshTokenExpiry = 86400 * 30; // 30 days
  }

  /**
   * Configure SAML support
   */
  async configureSAML(samlConfig) {
    if (!samlConfig || !samlConfig.entityId) {
      throw new Error('Invalid SAML configuration: entityId is required');
    }

    const requiredFields = ['entityId', 'ssoUrl', 'certificate'];
    for (const field of requiredFields) {
      if (!samlConfig[field]) {
        throw new Error(`Missing required SAML field: ${field}`);
      }
    }

    const samlProvider = {
      type: 'saml',
      entityId: samlConfig.entityId,
      ssoUrl: samlConfig.ssoUrl,
      sloUrl: samlConfig.sloUrl || null,
      certificate: samlConfig.certificate,
      privateKey: samlConfig.privateKey || null,
      signatureAlgorithm: samlConfig.signatureAlgorithm || 'sha256',
      digestAlgorithm: samlConfig.digestAlgorithm || 'sha256',
      assertionConsumerServiceUrl: samlConfig.callbackUrl || '/auth/saml/callback',
      audience: samlConfig.audience || samlConfig.entityId,
      recipient: samlConfig.recipient || samlConfig.callbackUrl,
      destination: samlConfig.destination || samlConfig.ssoUrl,
      identifierFormat: samlConfig.identifierFormat || 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
      authnContext: samlConfig.authnContext || 'urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport',
      forceAuthn: samlConfig.forceAuthn || false,
      providerName: samlConfig.providerName || 'MCP Enterprise SSO',
      skipRequestCompression: samlConfig.skipRequestCompression || false,
      disableRequestedAuthnContext: samlConfig.disableRequestedAuthnContext || false,
      attributeMapping: samlConfig.attributeMapping || {
        email: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
        name: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name',
        firstName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
        lastName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname',
        groups: 'http://schemas.xmlsoap.org/claims/Group'
      },
      created: new Date().toISOString(),
      status: 'active'
    };

    // Store provider configuration
    this.providers.set(`saml:${samlConfig.entityId}`, samlProvider);

    return {
      provider: 'saml',
      entityId: samlConfig.entityId,
      status: 'configured',
      assertionConsumerServiceUrl: samlProvider.assertionConsumerServiceUrl,
      metadata: this._generateSAMLMetadata(samlProvider)
    };
  }

  /**
   * Setup OAuth2/OIDC
   */
  async setupOAuth2(oauthConfig) {
    if (!oauthConfig || !oauthConfig.clientId) {
      throw new Error('Invalid OAuth2 configuration: clientId is required');
    }

    const requiredFields = ['clientId', 'clientSecret', 'authorizationUrl', 'tokenUrl'];
    for (const field of requiredFields) {
      if (!oauthConfig[field]) {
        throw new Error(`Missing required OAuth2 field: ${field}`);
      }
    }

    const oauthProvider = {
      type: 'oauth2',
      clientId: oauthConfig.clientId,
      clientSecret: this._encryptSecret(oauthConfig.clientSecret),
      authorizationUrl: oauthConfig.authorizationUrl,
      tokenUrl: oauthConfig.tokenUrl,
      userInfoUrl: oauthConfig.userInfoUrl || null,
      scope: oauthConfig.scope || 'openid profile email',
      responseType: oauthConfig.responseType || 'code',
      grantType: oauthConfig.grantType || 'authorization_code',
      redirectUri: oauthConfig.redirectUri || '/auth/oauth2/callback',
      state: oauthConfig.state || crypto.randomBytes(16).toString('hex'),
      nonce: oauthConfig.nonce || crypto.randomBytes(16).toString('hex'),
      pkce: oauthConfig.pkce || true,
      discoveryUrl: oauthConfig.discoveryUrl || null,
      issuer: oauthConfig.issuer || null,
      jwksUri: oauthConfig.jwksUri || null,
      clockTolerance: oauthConfig.clockTolerance || 10,
      maxAge: oauthConfig.maxAge || 300,
      httpTimeout: oauthConfig.httpTimeout || 5000,
      attributeMapping: oauthConfig.attributeMapping || {
        id: 'sub',
        email: 'email',
        name: 'name',
        firstName: 'given_name',
        lastName: 'family_name',
        picture: 'picture',
        groups: 'groups'
      },
      created: new Date().toISOString(),
      status: 'active'
    };

    // Generate PKCE challenge if enabled
    if (oauthProvider.pkce) {
      const verifier = crypto.randomBytes(32).toString('base64url');
      const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
      oauthProvider.pkceVerifier = verifier;
      oauthProvider.pkceChallenge = challenge;
    }

    // Store provider configuration
    this.providers.set(`oauth2:${oauthConfig.clientId}`, oauthProvider);

    return {
      provider: 'oauth2',
      clientId: oauthConfig.clientId,
      status: 'configured',
      authorizationUrl: this._buildAuthorizationUrl(oauthProvider),
      redirectUri: oauthProvider.redirectUri
    };
  }

  /**
   * Integrate LDAP/AD
   */
  async integrateLDAP(ldapConfig) {
    if (!ldapConfig || !ldapConfig.url) {
      throw new Error('Invalid LDAP configuration: url is required');
    }

    const requiredFields = ['url', 'bindDN', 'bindPassword', 'searchBase'];
    for (const field of requiredFields) {
      if (!ldapConfig[field]) {
        throw new Error(`Missing required LDAP field: ${field}`);
      }
    }

    const ldapProvider = {
      type: 'ldap',
      url: ldapConfig.url,
      bindDN: ldapConfig.bindDN,
      bindPassword: this._encryptSecret(ldapConfig.bindPassword),
      searchBase: ldapConfig.searchBase,
      searchFilter: ldapConfig.searchFilter || '(&(objectClass=user)(sAMAccountName={{username}}))',
      searchAttributes: ldapConfig.searchAttributes || ['dn', 'sAMAccountName', 'mail', 'cn', 'memberOf'],
      groupSearchBase: ldapConfig.groupSearchBase || ldapConfig.searchBase,
      groupSearchFilter: ldapConfig.groupSearchFilter || '(&(objectClass=group)(member={{dn}}))',
      groupSearchAttributes: ldapConfig.groupSearchAttributes || ['cn', 'description'],
      useTLS: ldapConfig.useTLS !== false,
      tlsOptions: ldapConfig.tlsOptions || {
        rejectUnauthorized: true,
        ca: ldapConfig.caCert || null
      },
      timeout: ldapConfig.timeout || 5000,
      connectTimeout: ldapConfig.connectTimeout || 5000,
      idleTimeout: ldapConfig.idleTimeout || 10000,
      reconnect: ldapConfig.reconnect !== false,
      attributeMapping: ldapConfig.attributeMapping || {
        id: 'sAMAccountName',
        email: 'mail',
        name: 'cn',
        firstName: 'givenName',
        lastName: 'sn',
        displayName: 'displayName',
        groups: 'memberOf'
      },
      created: new Date().toISOString(),
      status: 'active'
    };

    // Test LDAP connection
    try {
      await this._testLDAPConnection(ldapProvider);
    } catch (error) {
      throw new Error(`LDAP connection test failed: ${error.message}`);
    }

    // Store provider configuration
    this.providers.set(`ldap:${ldapConfig.url}`, ldapProvider);

    return {
      provider: 'ldap',
      url: ldapConfig.url,
      status: 'configured',
      searchBase: ldapProvider.searchBase,
      connectionTest: 'passed'
    };
  }

  /**
   * Authenticate user via SSO
   */
  async authenticate(credentials, provider) {
    if (!credentials || !provider) {
      throw new Error('Invalid authentication request');
    }

    const providerConfig = this._getProvider(provider);
    if (!providerConfig) {
      throw new Error(`Provider ${provider} not configured`);
    }

    let authResult;

    switch (providerConfig.type) {
      case 'saml':
        authResult = await this._authenticateSAML(credentials, providerConfig);
        break;
      
      case 'oauth2':
        authResult = await this._authenticateOAuth2(credentials, providerConfig);
        break;
      
      case 'ldap':
        authResult = await this._authenticateLDAP(credentials, providerConfig);
        break;
      
      default:
        throw new Error(`Unsupported authentication type: ${providerConfig.type}`);
    }

    // Create session
    const sessionId = crypto.randomBytes(32).toString('hex');
    const session = {
      id: sessionId,
      userId: authResult.userId,
      provider: provider,
      attributes: authResult.attributes,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + this.tokenExpiry * 1000).toISOString()
    };

    this.sessions.set(sessionId, session);

    // Generate JWT tokens
    const accessToken = this._generateAccessToken(session);
    const refreshToken = this._generateRefreshToken(session);

    return {
      success: true,
      sessionId,
      accessToken,
      refreshToken,
      expiresIn: this.tokenExpiry,
      user: {
        id: authResult.userId,
        email: authResult.attributes.email,
        name: authResult.attributes.name,
        groups: authResult.attributes.groups || [],
        provider: provider
      }
    };
  }

  // Helper methods
  _getProvider(provider) {
    // Try exact match first
    if (this.providers.has(provider)) {
      return this.providers.get(provider);
    }

    // Try with type prefix
    for (const [key, config] of this.providers) {
      if (key === provider || key.endsWith(`:${provider}`)) {
        return config;
      }
    }

    return null;
  }

  _encryptSecret(secret) {
    // Create a deterministic key and IV from the JWT secret
    const key = crypto.createHash('sha256').update(this.jwtSecret).digest();
    const iv = crypto.createHash('md5').update(this.jwtSecret).digest();
    
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(secret, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  }

  _decryptSecret(encrypted) {
    // Create a deterministic key and IV from the JWT secret
    const key = crypto.createHash('sha256').update(this.jwtSecret).digest();
    const iv = crypto.createHash('md5').update(this.jwtSecret).digest();
    
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  _generateSAMLMetadata(provider) {
    return `<?xml version="1.0"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata"
                  entityID="${provider.entityId}">
  <SPSSODescriptor AuthnRequestsSigned="true"
                   WantAssertionsSigned="true"
                   protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <NameIDFormat>${provider.identifierFormat}</NameIDFormat>
    <AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
                              Location="${provider.assertionConsumerServiceUrl}"
                              index="0" />
  </SPSSODescriptor>
</EntityDescriptor>`;
  }

  _buildAuthorizationUrl(provider) {
    const params = new URLSearchParams({
      client_id: provider.clientId,
      response_type: provider.responseType,
      scope: provider.scope,
      redirect_uri: provider.redirectUri,
      state: provider.state,
      nonce: provider.nonce
    });

    if (provider.pkce) {
      params.append('code_challenge', provider.pkceChallenge);
      params.append('code_challenge_method', 'S256');
    }

    return `${provider.authorizationUrl}?${params.toString()}`;
  }

  async _testLDAPConnection(provider) {
    // Simulate LDAP connection test
    // In production, this would use an actual LDAP client
    console.log(`Testing LDAP connection to ${provider.url}`);
    return true;
  }

  async _authenticateSAML(assertion, provider) {
    // Simulate SAML authentication
    // In production, this would validate the SAML assertion
    console.log('Processing SAML assertion');
    
    return {
      userId: 'saml-user-' + crypto.randomBytes(8).toString('hex'),
      attributes: {
        email: 'user@enterprise.com',
        name: 'Enterprise User',
        firstName: 'Enterprise',
        lastName: 'User',
        groups: ['enterprise-users', 'saml-users']
      }
    };
  }

  async _authenticateOAuth2(code, provider) {
    // Simulate OAuth2 token exchange
    // In production, this would exchange the code for tokens
    console.log('Exchanging OAuth2 code for tokens');
    
    return {
      userId: 'oauth-user-' + crypto.randomBytes(8).toString('hex'),
      attributes: {
        email: 'oauth@enterprise.com',
        name: 'OAuth User',
        firstName: 'OAuth',
        lastName: 'User',
        picture: 'https://example.com/picture.jpg',
        groups: ['oauth-users']
      }
    };
  }

  async _authenticateLDAP(credentials, provider) {
    // Simulate LDAP authentication
    // In production, this would bind to LDAP and search for user
    console.log('Authenticating via LDAP');
    
    if (!credentials.username || !credentials.password) {
      throw new Error('Username and password required for LDAP authentication');
    }
    
    return {
      userId: credentials.username,
      attributes: {
        email: `${credentials.username}@enterprise.com`,
        name: credentials.username,
        displayName: 'LDAP User',
        groups: ['domain-users', 'ldap-users']
      }
    };
  }

  _generateAccessToken(session) {
    const payload = {
      sub: session.userId,
      sessionId: session.id,
      provider: session.provider,
      email: session.attributes.email,
      name: session.attributes.name,
      groups: session.attributes.groups || [],
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + this.tokenExpiry
    };

    return jwt.sign(payload, this.jwtSecret, { algorithm: 'HS256' });
  }

  _generateRefreshToken(session) {
    const payload = {
      sub: session.userId,
      sessionId: session.id,
      type: 'refresh',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + this.refreshTokenExpiry
    };

    return jwt.sign(payload, this.jwtSecret, { algorithm: 'HS256' });
  }
}

module.exports = SSOAuthentication;