/**
 * Authentication Manager
 * Handles authentication, authorization, API key management, and token rotation
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const TokenStore = require('./token-store');
const ApiKeyStore = require('./api-key-store');

class AuthManager {
    constructor() {
        this.tokenStore = new TokenStore();
        this.apiKeyStore = new ApiKeyStore();
        this.jwtSecret = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
        this.tokenExpiration = 3600000; // 1 hour in ms
        this.gracePeriod = 300000; // 5 minutes grace period for token rotation
    }

    async initialize() {
        await Promise.all([
            this.tokenStore.initialize(),
            this.apiKeyStore.initialize()
        ]);

        // Create default admin credentials if not exists
        await this.createDefaultCredentials();
    }

    async cleanup() {
        await Promise.all([
            this.tokenStore.cleanup(),
            this.apiKeyStore.cleanup()
        ]);
    }

    /**
     * Authenticate with provided credentials
     */
    async authenticate(credentials) {
        if (credentials.apiKey) {
            return this.authenticateWithApiKey(credentials.apiKey);
        } else if (credentials.username && credentials.password) {
            return this.authenticateWithPassword(credentials.username, credentials.password);
        } else if (credentials.token) {
            return this.refreshToken(credentials.token);
        }

        throw new Error('Invalid credentials format');
    }

    /**
     * Authenticate with username/password
     */
    async authenticateWithPassword(username, password) {
        const user = await this.validateUserCredentials(username, password);
        if (!user) {
            throw new Error('Authentication failed');
        }

        const token = this.generateJWT(user);
        const authToken = {
            token,
            type: 'Bearer',
            expiresAt: new Date(Date.now() + this.tokenExpiration),
            scopes: user.scopes || ['services.read', 'services.list']
        };

        await this.tokenStore.store(token, authToken);
        return authToken;
    }

    /**
     * Authenticate with API key
     */
    async authenticateWithApiKey(apiKey) {
        const keyInfo = await this.apiKeyStore.validate(apiKey);
        if (!keyInfo) {
            throw new Error('Invalid API key');
        }

        // Update last used timestamp
        await this.apiKeyStore.updateLastUsed(apiKey);

        const token = this.generateJWT({
            type: 'api_key',
            keyId: keyInfo.id,
            permissions: keyInfo.permissions
        });

        const authToken = {
            token,
            type: 'ApiKey',
            expiresAt: new Date(Date.now() + this.tokenExpiration),
            scopes: keyInfo.permissions
        };

        await this.tokenStore.store(token, authToken);
        return authToken;
    }

    /**
     * Refresh an existing token
     */
    async refreshToken(oldToken) {
        const existingToken = await this.tokenStore.get(oldToken);
        if (!existingToken) {
            throw new Error('Invalid token');
        }

        // Allow refresh even if expired within grace period
        const now = Date.now();
        const expiry = new Date(existingToken.expiresAt).getTime();
        if (now > expiry + this.gracePeriod) {
            throw new Error('Token expired');
        }

        return this.rotateToken(oldToken);
    }

    /**
     * Authorize access to a resource
     */
    async authorize(token, resource, action) {
        const authToken = await this.tokenStore.get(token);
        if (!authToken) {
            return false;
        }

        // Check if token is expired
        if (new Date() > new Date(authToken.expiresAt)) {
            return false;
        }

        // Check scopes
        const requiredScope = `${resource}.${action}`;
        const hasWildcard = authToken.scopes.some(scope => 
            scope === '*' || scope === `${resource}.*`
        );

        return hasWildcard || authToken.scopes.includes(requiredScope);
    }

    /**
     * Rotate an existing token
     */
    async rotateToken(oldToken) {
        const existingToken = await this.tokenStore.get(oldToken);
        if (!existingToken) {
            throw new Error('Invalid token');
        }

        // Decode the old token to get user info
        const decoded = jwt.verify(oldToken, this.jwtSecret, { ignoreExpiration: true });
        const newToken = this.generateJWT(decoded);

        const authToken = {
            token: newToken,
            type: existingToken.type,
            expiresAt: new Date(Date.now() + this.tokenExpiration),
            scopes: existingToken.scopes
        };

        await this.tokenStore.store(newToken, authToken);

        // Keep old token valid for grace period
        existingToken.expiresAt = new Date(Date.now() + this.gracePeriod);
        await this.tokenStore.store(oldToken, existingToken);

        return authToken;
    }

    /**
     * Validate an API key
     */
    async validateApiKey(key) {
        const keyInfo = await this.apiKeyStore.validate(key);
        if (!keyInfo) {
            throw new Error('Invalid API key');
        }

        return {
            key: keyInfo.key,
            name: keyInfo.name,
            permissions: keyInfo.permissions,
            createdAt: keyInfo.createdAt,
            lastUsed: keyInfo.lastUsed
        };
    }

    /**
     * Generate a new API key
     */
    async generateApiKey(name, permissions) {
        const key = `mcp_${crypto.randomBytes(32).toString('hex')}`;
        const keyInfo = {
            key,
            name,
            permissions,
            createdAt: new Date(),
            lastUsed: null
        };

        await this.apiKeyStore.store(key, keyInfo);
        return keyInfo;
    }

    /**
     * Revoke an API key
     */
    async revokeApiKey(key) {
        return this.apiKeyStore.revoke(key);
    }

    /**
     * Generate JWT token
     */
    generateJWT(payload) {
        return jwt.sign(payload, this.jwtSecret, {
            expiresIn: '1h'
        });
    }

    /**
     * Validate user credentials
     */
    async validateUserCredentials(username, password) {
        // In a real implementation, this would check against a user database
        // For now, we'll use a simple in-memory check
        const users = {
            'test-user': {
                password: await bcrypt.hash('test-password', 10),
                scopes: ['services.read', 'services.list']
            },
            'admin': {
                password: await bcrypt.hash(process.env.ADMIN_PASSWORD || 'admin-password', 10),
                scopes: ['*']
            }
        };

        const user = users[username];
        if (!user) {
            return null;
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return null;
        }

        return {
            username,
            scopes: user.scopes
        };
    }

    /**
     * Create default credentials
     */
    async createDefaultCredentials() {
        // Create a default admin API key if it doesn't exist
        const adminKey = process.env.ADMIN_API_KEY;
        if (adminKey) {
            const existing = await this.apiKeyStore.validate(adminKey);
            if (!existing) {
                await this.apiKeyStore.store(adminKey, {
                    key: adminKey,
                    name: 'Default Admin Key',
                    permissions: ['*'],
                    createdAt: new Date(),
                    lastUsed: null
                });
            }
        }
    }
}

module.exports = AuthManager;