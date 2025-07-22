/**
 * Token Store
 * Manages authentication tokens with in-memory storage
 */

class TokenStore {
    constructor() {
        this.tokens = new Map();
        this.cleanupInterval = null;
    }

    async initialize() {
        // Start cleanup interval to remove expired tokens
        this.cleanupInterval = setInterval(() => {
            this.cleanupExpiredTokens();
        }, 60000); // Run every minute
    }

    async cleanup() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        this.tokens.clear();
    }

    /**
     * Store a token
     */
    async store(token, data) {
        this.tokens.set(token, {
            ...data,
            storedAt: new Date()
        });
    }

    /**
     * Get token data
     */
    async get(token) {
        return this.tokens.get(token);
    }

    /**
     * Remove a token
     */
    async remove(token) {
        return this.tokens.delete(token);
    }

    /**
     * Check if token exists
     */
    async exists(token) {
        return this.tokens.has(token);
    }

    /**
     * Clean up expired tokens
     */
    cleanupExpiredTokens() {
        const now = new Date();
        for (const [token, data] of this.tokens.entries()) {
            if (data.expiresAt && new Date(data.expiresAt) < now) {
                this.tokens.delete(token);
            }
        }
    }

    /**
     * Get all tokens (for debugging/admin purposes)
     */
    async getAllTokens() {
        return Array.from(this.tokens.entries()).map(([token, data]) => ({
            token: token.substring(0, 10) + '...', // Partial token for security
            ...data
        }));
    }
}

module.exports = TokenStore;