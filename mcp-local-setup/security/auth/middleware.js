/**
 * Authentication Middleware
 * Express middleware for protecting routes with authentication
 */

const SecurityImplementation = require('../index');

class AuthMiddleware {
    constructor(security) {
        this.security = security || new SecurityImplementation();
    }

    /**
     * Require authentication for a route
     */
    requireAuth() {
        return async (req, res, next) => {
            try {
                const token = this.extractToken(req);
                if (!token) {
                    return res.status(401).json({ error: 'Authentication required' });
                }

                // Validate token
                const isValid = await this.security.authorize(token, 'general', 'access');
                if (!isValid) {
                    return res.status(401).json({ error: 'Invalid token' });
                }

                // Attach token to request
                req.authToken = token;
                next();
            } catch (error) {
                res.status(401).json({ error: error.message });
            }
        };
    }

    /**
     * Require specific permission for a route
     */
    requirePermission(resource, action) {
        return async (req, res, next) => {
            try {
                const token = this.extractToken(req);
                if (!token) {
                    return res.status(401).json({ error: 'Authentication required' });
                }

                // Check authorization
                const isAuthorized = await this.security.authorize(token, resource, action);
                if (!isAuthorized) {
                    return res.status(403).json({ error: 'Insufficient permissions' });
                }

                req.authToken = token;
                next();
            } catch (error) {
                res.status(401).json({ error: error.message });
            }
        };
    }

    /**
     * API key authentication
     */
    apiKeyAuth() {
        return async (req, res, next) => {
            try {
                const apiKey = this.extractApiKey(req);
                if (!apiKey) {
                    return res.status(401).json({ error: 'API key required' });
                }

                // Validate API key
                const keyInfo = await this.security.validateApiKey(apiKey);
                if (!keyInfo) {
                    return res.status(401).json({ error: 'Invalid API key' });
                }

                // Attach key info to request
                req.apiKey = keyInfo;
                next();
            } catch (error) {
                res.status(401).json({ error: error.message });
            }
        };
    }

    /**
     * Service-to-service authentication
     */
    serviceAuth() {
        return async (req, res, next) => {
            try {
                const serviceToken = req.headers['x-service-token'];
                if (!serviceToken) {
                    return res.status(401).json({ error: 'Service authentication required' });
                }

                // Validate service token
                const isValid = await this.security.authorize(serviceToken, 'services', 'communicate');
                if (!isValid) {
                    return res.status(401).json({ error: 'Invalid service token' });
                }

                req.serviceToken = serviceToken;
                next();
            } catch (error) {
                res.status(401).json({ error: error.message });
            }
        };
    }

    /**
     * Extract token from request
     */
    extractToken(req) {
        // Check Authorization header
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            return authHeader.substring(7);
        }

        // Check query parameter
        if (req.query.token) {
            return req.query.token;
        }

        // Check cookie
        if (req.cookies && req.cookies.authToken) {
            return req.cookies.authToken;
        }

        return null;
    }

    /**
     * Extract API key from request
     */
    extractApiKey(req) {
        // Check X-API-Key header
        if (req.headers['x-api-key']) {
            return req.headers['x-api-key'];
        }

        // Check query parameter
        if (req.query.apiKey) {
            return req.query.apiKey;
        }

        return null;
    }
}

module.exports = AuthMiddleware;