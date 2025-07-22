/**
 * Tests for SSO Authentication Module
 */

const SSOAuthentication = require('../sso/authentication');
const jwt = require('jsonwebtoken');

describe('SSOAuthentication', () => {
  let ssoAuth;

  beforeEach(() => {
    ssoAuth = new SSOAuthentication();
  });

  describe('configureSAML', () => {
    it('should configure SAML provider with valid config', async () => {
      const samlConfig = {
        entityId: 'https://example.com/saml',
        ssoUrl: 'https://idp.example.com/sso',
        certificate: '-----BEGIN CERTIFICATE-----\nMIIC...\n-----END CERTIFICATE-----',
        callbackUrl: 'https://app.example.com/auth/saml/callback'
      };

      const result = await ssoAuth.configureSAML(samlConfig);

      expect(result).toBeDefined();
      expect(result.provider).toBe('saml');
      expect(result.entityId).toBe(samlConfig.entityId);
      expect(result.status).toBe('configured');
      expect(result.metadata).toContain('<?xml version="1.0"?>');
      expect(result.metadata).toContain(samlConfig.entityId);
    });

    it('should throw error for missing required fields', async () => {
      const invalidConfig = {
        entityId: 'https://example.com/saml'
        // Missing ssoUrl and certificate
      };

      await expect(ssoAuth.configureSAML(invalidConfig))
        .rejects.toThrow('Missing required SAML field: ssoUrl');
    });

    it('should use default values for optional fields', async () => {
      const minimalConfig = {
        entityId: 'https://example.com/saml',
        ssoUrl: 'https://idp.example.com/sso',
        certificate: 'cert'
      };

      await ssoAuth.configureSAML(minimalConfig);
      
      const provider = ssoAuth.providers.get(`saml:${minimalConfig.entityId}`);
      expect(provider.signatureAlgorithm).toBe('sha256');
      expect(provider.forceAuthn).toBe(false);
      expect(provider.identifierFormat).toContain('emailAddress');
    });

    it('should store provider configuration', async () => {
      const samlConfig = {
        entityId: 'https://example.com/saml',
        ssoUrl: 'https://idp.example.com/sso',
        certificate: 'cert'
      };

      await ssoAuth.configureSAML(samlConfig);
      
      expect(ssoAuth.providers.has(`saml:${samlConfig.entityId}`)).toBe(true);
    });
  });

  describe('setupOAuth2', () => {
    it('should setup OAuth2 provider with valid config', async () => {
      const oauthConfig = {
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        authorizationUrl: 'https://oauth.example.com/authorize',
        tokenUrl: 'https://oauth.example.com/token',
        redirectUri: 'https://app.example.com/auth/callback'
      };

      const result = await ssoAuth.setupOAuth2(oauthConfig);

      expect(result).toBeDefined();
      expect(result.provider).toBe('oauth2');
      expect(result.clientId).toBe(oauthConfig.clientId);
      expect(result.status).toBe('configured');
      expect(result.authorizationUrl).toContain(oauthConfig.clientId);
    });

    it('should encrypt client secret', async () => {
      const oauthConfig = {
        clientId: 'test-client',
        clientSecret: 'super-secret',
        authorizationUrl: 'https://oauth.example.com/authorize',
        tokenUrl: 'https://oauth.example.com/token'
      };

      await ssoAuth.setupOAuth2(oauthConfig);
      
      const provider = ssoAuth.providers.get(`oauth2:${oauthConfig.clientId}`);
      expect(provider.clientSecret).not.toBe(oauthConfig.clientSecret);
      expect(provider.clientSecret).toBeTruthy();
    });

    it('should generate PKCE challenge when enabled', async () => {
      const oauthConfig = {
        clientId: 'test-client',
        clientSecret: 'secret',
        authorizationUrl: 'https://oauth.example.com/authorize',
        tokenUrl: 'https://oauth.example.com/token',
        pkce: true
      };

      await ssoAuth.setupOAuth2(oauthConfig);
      
      const provider = ssoAuth.providers.get(`oauth2:${oauthConfig.clientId}`);
      expect(provider.pkceVerifier).toBeDefined();
      expect(provider.pkceChallenge).toBeDefined();
    });

    it('should build authorization URL with parameters', async () => {
      const oauthConfig = {
        clientId: 'test-client',
        clientSecret: 'secret',
        authorizationUrl: 'https://oauth.example.com/authorize',
        tokenUrl: 'https://oauth.example.com/token',
        scope: 'openid profile email custom'
      };

      const result = await ssoAuth.setupOAuth2(oauthConfig);
      
      expect(result.authorizationUrl).toContain('client_id=test-client');
      expect(result.authorizationUrl).toContain('scope=openid+profile+email+custom');
      expect(result.authorizationUrl).toContain('response_type=code');
    });
  });

  describe('integrateLDAP', () => {
    it('should integrate LDAP with valid config', async () => {
      const ldapConfig = {
        url: 'ldaps://ldap.example.com:636',
        bindDN: 'cn=admin,dc=example,dc=com',
        bindPassword: 'admin-password',
        searchBase: 'ou=users,dc=example,dc=com'
      };

      const result = await ssoAuth.integrateLDAP(ldapConfig);

      expect(result).toBeDefined();
      expect(result.provider).toBe('ldap');
      expect(result.url).toBe(ldapConfig.url);
      expect(result.status).toBe('configured');
      expect(result.connectionTest).toBe('passed');
    });

    it('should encrypt bind password', async () => {
      const ldapConfig = {
        url: 'ldaps://ldap.example.com',
        bindDN: 'cn=admin,dc=example,dc=com',
        bindPassword: 'secret-password',
        searchBase: 'dc=example,dc=com'
      };

      await ssoAuth.integrateLDAP(ldapConfig);
      
      const provider = ssoAuth.providers.get(`ldap:${ldapConfig.url}`);
      expect(provider.bindPassword).not.toBe(ldapConfig.bindPassword);
      expect(provider.bindPassword).toBeTruthy();
    });

    it('should use default search filters', async () => {
      const ldapConfig = {
        url: 'ldaps://ldap.example.com',
        bindDN: 'cn=admin,dc=example,dc=com',
        bindPassword: 'password',
        searchBase: 'dc=example,dc=com'
      };

      await ssoAuth.integrateLDAP(ldapConfig);
      
      const provider = ssoAuth.providers.get(`ldap:${ldapConfig.url}`);
      expect(provider.searchFilter).toContain('objectClass=user');
      expect(provider.groupSearchFilter).toContain('objectClass=group');
    });

    it('should throw error for missing required fields', async () => {
      const invalidConfig = {
        url: 'ldaps://ldap.example.com'
        // Missing other required fields
      };

      await expect(ssoAuth.integrateLDAP(invalidConfig))
        .rejects.toThrow('Missing required LDAP field: bindDN');
    });
  });

  describe('authenticate', () => {
    beforeEach(async () => {
      // Setup test providers
      await ssoAuth.configureSAML({
        entityId: 'test-saml',
        ssoUrl: 'https://idp.test.com/sso',
        certificate: 'test-cert'
      });

      await ssoAuth.setupOAuth2({
        clientId: 'test-oauth',
        clientSecret: 'secret',
        authorizationUrl: 'https://oauth.test.com/auth',
        tokenUrl: 'https://oauth.test.com/token'
      });

      await ssoAuth.integrateLDAP({
        url: 'ldap://test.com',
        bindDN: 'cn=admin',
        bindPassword: 'pass',
        searchBase: 'dc=test'
      });
    });

    it('should authenticate via SAML', async () => {
      const result = await ssoAuth.authenticate(
        { assertion: 'saml-assertion-data' },
        'saml:test-saml'
      );

      expect(result.success).toBe(true);
      expect(result.sessionId).toBeDefined();
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.user.provider).toBe('saml:test-saml');
      expect(result.user.groups).toContain('saml-users');
    });

    it('should authenticate via OAuth2', async () => {
      const result = await ssoAuth.authenticate(
        { code: 'oauth-authorization-code' },
        'oauth2:test-oauth'
      );

      expect(result.success).toBe(true);
      expect(result.sessionId).toBeDefined();
      expect(result.accessToken).toBeDefined();
      expect(result.user.provider).toBe('oauth2:test-oauth');
      expect(result.user.groups).toContain('oauth-users');
    });

    it('should authenticate via LDAP', async () => {
      const result = await ssoAuth.authenticate(
        { username: 'testuser', password: 'testpass' },
        'ldap:ldap://test.com'
      );

      expect(result.success).toBe(true);
      expect(result.sessionId).toBeDefined();
      expect(result.accessToken).toBeDefined();
      expect(result.user.id).toBe('testuser');
      expect(result.user.groups).toContain('ldap-users');
    });

    it('should throw error for invalid provider', async () => {
      await expect(ssoAuth.authenticate({}, 'invalid-provider'))
        .rejects.toThrow('Provider invalid-provider not configured');
    });

    it('should throw error for LDAP without credentials', async () => {
      await expect(ssoAuth.authenticate({}, 'ldap:ldap://test.com'))
        .rejects.toThrow('Username and password required for LDAP authentication');
    });

    it('should create and store session', async () => {
      const result = await ssoAuth.authenticate(
        { assertion: 'test' },
        'saml:test-saml'
      );

      const session = ssoAuth.sessions.get(result.sessionId);
      expect(session).toBeDefined();
      expect(session.userId).toBeDefined();
      expect(session.provider).toBe('saml:test-saml');
      expect(session.createdAt).toBeDefined();
      expect(session.expiresAt).toBeDefined();
    });

    it('should generate valid JWT tokens', async () => {
      const result = await ssoAuth.authenticate(
        { code: 'test' },
        'oauth2:test-oauth'
      );

      // Verify access token
      const decoded = jwt.verify(result.accessToken, ssoAuth.jwtSecret);
      expect(decoded.sub).toBeDefined();
      expect(decoded.sessionId).toBe(result.sessionId);
      expect(decoded.email).toBeDefined();
      
      // Verify refresh token
      const refreshDecoded = jwt.verify(result.refreshToken, ssoAuth.jwtSecret);
      expect(refreshDecoded.type).toBe('refresh');
      expect(refreshDecoded.sessionId).toBe(result.sessionId);
    });
  });

  describe('Provider management', () => {
    it('should find provider by exact match', async () => {
      await ssoAuth.configureSAML({
        entityId: 'test',
        ssoUrl: 'https://test.com',
        certificate: 'cert'
      });

      const provider = ssoAuth._getProvider('saml:test');
      expect(provider).toBeDefined();
      expect(provider.type).toBe('saml');
    });

    it('should find provider by suffix match', async () => {
      await ssoAuth.setupOAuth2({
        clientId: 'my-client',
        clientSecret: 'secret',
        authorizationUrl: 'https://auth.com',
        tokenUrl: 'https://token.com'
      });

      const provider = ssoAuth._getProvider('my-client');
      expect(provider).toBeDefined();
      expect(provider.type).toBe('oauth2');
    });
  });

  describe('Token generation', () => {
    it('should generate access token with correct claims', () => {
      const session = {
        id: 'session-123',
        userId: 'user-456',
        provider: 'test-provider',
        attributes: {
          email: 'user@test.com',
          name: 'Test User',
          groups: ['group1', 'group2']
        }
      };

      const token = ssoAuth._generateAccessToken(session);
      const decoded = jwt.verify(token, ssoAuth.jwtSecret);

      expect(decoded.sub).toBe(session.userId);
      expect(decoded.sessionId).toBe(session.id);
      expect(decoded.email).toBe(session.attributes.email);
      expect(decoded.groups).toEqual(session.attributes.groups);
      expect(decoded.exp - decoded.iat).toBe(ssoAuth.tokenExpiry);
    });

    it('should generate refresh token with longer expiry', () => {
      const session = {
        id: 'session-789',
        userId: 'user-012'
      };

      const token = ssoAuth._generateRefreshToken(session);
      const decoded = jwt.verify(token, ssoAuth.jwtSecret);

      expect(decoded.type).toBe('refresh');
      expect(decoded.sessionId).toBe(session.id);
      expect(decoded.exp - decoded.iat).toBe(ssoAuth.refreshTokenExpiry);
    });
  });
});