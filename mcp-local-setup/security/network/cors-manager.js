/**
 * CORS Manager
 * Manages Cross-Origin Resource Sharing policies
 */

class CORSManager {
    constructor() {
        this.policy = {
            origins: ['http://localhost:3000'],
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            headers: ['Content-Type', 'Authorization', 'X-API-Key'],
            credentials: true,
            maxAge: 86400 // 24 hours
        };
    }

    async initialize() {
        // Load saved CORS policy if exists
        // In production, this would load from persistent storage
    }

    async cleanup() {
        // Save current policy
    }

    /**
     * Configure CORS policy
     */
    async configure(policy) {
        this.policy = {
            ...this.policy,
            ...policy
        };
    }

    /**
     * Get CORS middleware
     */
    getMiddleware() {
        return (req, res, next) => {
            const origin = req.headers.origin;

            // Check if origin is allowed
            if (this.isOriginAllowed(origin)) {
                res.set({
                    'Access-Control-Allow-Origin': origin,
                    'Access-Control-Allow-Credentials': this.policy.credentials
                });
            }

            // Handle preflight requests
            if (req.method === 'OPTIONS') {
                res.set({
                    'Access-Control-Allow-Methods': this.policy.methods.join(', '),
                    'Access-Control-Allow-Headers': this.policy.headers.join(', '),
                    'Access-Control-Max-Age': this.policy.maxAge
                });
                return res.sendStatus(204);
            }

            next();
        };
    }

    /**
     * Check if origin is allowed
     */
    isOriginAllowed(origin) {
        if (!origin) {
            return false;
        }

        // Check exact match
        if (this.policy.origins.includes(origin)) {
            return true;
        }

        // Check wildcard patterns
        for (const allowed of this.policy.origins) {
            if (allowed === '*') {
                return true;
            }

            // Support wildcard subdomains
            if (allowed.startsWith('*.')) {
                const domain = allowed.substring(2);
                if (origin.endsWith(domain)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Get current policy
     */
    getPolicy() {
        return { ...this.policy };
    }

    /**
     * Add allowed origin
     */
    addOrigin(origin) {
        if (!this.policy.origins.includes(origin)) {
            this.policy.origins.push(origin);
        }
    }

    /**
     * Remove allowed origin
     */
    removeOrigin(origin) {
        const index = this.policy.origins.indexOf(origin);
        if (index > -1) {
            this.policy.origins.splice(index, 1);
        }
    }

    /**
     * Validate CORS policy
     */
    validatePolicy(policy) {
        if (!policy.origins || !Array.isArray(policy.origins)) {
            throw new Error('Origins must be an array');
        }

        if (!policy.methods || !Array.isArray(policy.methods)) {
            throw new Error('Methods must be an array');
        }

        if (!policy.headers || !Array.isArray(policy.headers)) {
            throw new Error('Headers must be an array');
        }

        // Validate methods
        const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'];
        for (const method of policy.methods) {
            if (!validMethods.includes(method)) {
                throw new Error(`Invalid HTTP method: ${method}`);
            }
        }

        return true;
    }
}

module.exports = CORSManager;