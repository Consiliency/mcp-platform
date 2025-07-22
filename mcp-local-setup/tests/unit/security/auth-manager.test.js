/**
 * Unit tests for AuthManager
 */

const AuthManager = require('../../../security/auth/auth-manager');
const jwt = require('jsonwebtoken');

describe('AuthManager', () => {
    let authManager;

    beforeEach(async () => {
        authManager = new AuthManager();
        await authManager.initialize();
    });

    afterEach(async () => {
        await authManager.cleanup();
    });

    describe('authenticate', () => {
        it('should authenticate with valid username/password', async () => {
            const credentials = {
                username: 'test-user',
                password: 'test-password'
            };

            const token = await authManager.authenticate(credentials);

            expect(token).toBeDefined();
            expect(token.token).toBeTruthy();
            expect(token.type).toBe('Bearer');
            expect(token.expiresAt).toBeInstanceOf(Date);
            expect(token.scopes).toContain('services.read');
        });

        it('should fail authentication with invalid password', async () => {
            const credentials = {
                username: 'test-user',
                password: 'wrong-password'
            };

            await expect(authManager.authenticate(credentials))
                .rejects.toThrow('Authentication failed');
        });

        it('should authenticate with API key', async () => {
            // First generate an API key
            const keyInfo = await authManager.generateApiKey('test-key', ['services.read']);
            
            const credentials = {
                apiKey: keyInfo.key
            };

            const token = await authManager.authenticate(credentials);

            expect(token).toBeDefined();
            expect(token.type).toBe('ApiKey');
            expect(token.scopes).toContain('services.read');
        });

        it('should throw error for invalid credentials format', async () => {
            const credentials = {};

            await expect(authManager.authenticate(credentials))
                .rejects.toThrow('Invalid credentials format');
        });
    });

    describe('authorize', () => {
        let validToken;

        beforeEach(async () => {
            const credentials = {
                username: 'test-user',
                password: 'test-password'
            };
            const auth = await authManager.authenticate(credentials);
            validToken = auth.token;
        });

        it('should authorize valid token for allowed resource', async () => {
            const authorized = await authManager.authorize(validToken, 'services', 'read');
            expect(authorized).toBe(true);
        });

        it('should deny access for unauthorized resource', async () => {
            const authorized = await authManager.authorize(validToken, 'admin', 'write');
            expect(authorized).toBe(false);
        });

        it('should deny access for invalid token', async () => {
            const authorized = await authManager.authorize('invalid-token', 'services', 'read');
            expect(authorized).toBe(false);
        });

        it('should handle wildcard permissions', async () => {
            // Create admin token
            const credentials = {
                username: 'admin',
                password: process.env.ADMIN_PASSWORD || 'admin-password'
            };
            const auth = await authManager.authenticate(credentials);
            
            const authorized = await authManager.authorize(auth.token, 'any-resource', 'any-action');
            expect(authorized).toBe(true);
        });
    });

    describe('rotateToken', () => {
        let originalToken;

        beforeEach(async () => {
            const credentials = {
                username: 'test-user',
                password: 'test-password'
            };
            const auth = await authManager.authenticate(credentials);
            originalToken = auth.token;
        });

        it('should rotate valid token', async () => {
            const newAuth = await authManager.rotateToken(originalToken);

            expect(newAuth.token).toBeDefined();
            expect(newAuth.token).not.toBe(originalToken);
            expect(newAuth.type).toBe('Bearer');
            expect(newAuth.expiresAt).toBeInstanceOf(Date);
        });

        it('should keep old token valid during grace period', async () => {
            const newAuth = await authManager.rotateToken(originalToken);

            // Both tokens should be valid
            const oldValid = await authManager.authorize(originalToken, 'services', 'read');
            const newValid = await authManager.authorize(newAuth.token, 'services', 'read');

            expect(oldValid).toBe(true);
            expect(newValid).toBe(true);
        });

        it('should throw error for invalid token', async () => {
            await expect(authManager.rotateToken('invalid-token'))
                .rejects.toThrow('Invalid token');
        });
    });

    describe('API Key Management', () => {
        it('should generate API key with permissions', async () => {
            const keyInfo = await authManager.generateApiKey('test-key', ['services.read', 'services.write']);

            expect(keyInfo.key).toMatch(/^mcp_[a-f0-9]{64}$/);
            expect(keyInfo.name).toBe('test-key');
            expect(keyInfo.permissions).toContain('services.read');
            expect(keyInfo.permissions).toContain('services.write');
            expect(keyInfo.createdAt).toBeInstanceOf(Date);
        });

        it('should validate API key', async () => {
            const keyInfo = await authManager.generateApiKey('test-key', ['services.read']);
            
            const validation = await authManager.validateApiKey(keyInfo.key);

            expect(validation.name).toBe('test-key');
            expect(validation.permissions).toContain('services.read');
        });

        it('should revoke API key', async () => {
            const keyInfo = await authManager.generateApiKey('test-key', ['services.read']);
            
            const revoked = await authManager.revokeApiKey(keyInfo.key);
            expect(revoked).toBe(true);

            await expect(authManager.validateApiKey(keyInfo.key))
                .rejects.toThrow('Invalid API key');
        });

        it('should update last used timestamp', async () => {
            const keyInfo = await authManager.generateApiKey('test-key', ['services.read']);
            
            // Authenticate with the key
            await authManager.authenticate({ apiKey: keyInfo.key });

            const validation = await authManager.validateApiKey(keyInfo.key);
            expect(validation.lastUsed).toBeInstanceOf(Date);
        });
    });

    describe('JWT Generation', () => {
        it('should generate valid JWT', () => {
            const payload = { userId: '123', role: 'user' };
            const token = authManager.generateJWT(payload);

            const decoded = jwt.verify(token, authManager.jwtSecret);
            expect(decoded.userId).toBe('123');
            expect(decoded.role).toBe('user');
        });

        it('should set correct expiration', () => {
            const payload = { userId: '123' };
            const token = authManager.generateJWT(payload);

            const decoded = jwt.decode(token);
            const exp = new Date(decoded.exp * 1000);
            const now = new Date();
            const diff = exp - now;

            // Should be approximately 1 hour (3600000ms)
            expect(diff).toBeGreaterThan(3500000);
            expect(diff).toBeLessThan(3700000);
        });
    });
});