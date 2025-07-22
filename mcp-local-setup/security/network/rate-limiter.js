/**
 * Rate Limiter
 * Implements rate limiting with sliding window algorithm
 */

class RateLimiter {
    constructor() {
        this.requests = new Map(); // identifier -> request timestamps
        this.rules = {
            requestsPerMinute: 60,
            requestsPerHour: 1000,
            whitelist: []
        };
        this.cleanupInterval = null;
    }

    async initialize() {
        // Start cleanup interval
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, 60000); // Clean up old entries every minute
    }

    async cleanup() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }

        const now = Date.now();
        const hourAgo = now - 3600000;

        // Remove old request records
        for (const [identifier, timestamps] of this.requests.entries()) {
            const filtered = timestamps.filter(ts => ts > hourAgo);
            if (filtered.length === 0) {
                this.requests.delete(identifier);
            } else {
                this.requests.set(identifier, filtered);
            }
        }
    }

    /**
     * Get rate limit status for an identifier
     */
    async getStatus(identifier) {
        // Check if whitelisted
        if (this.rules.whitelist.includes(identifier)) {
            return {
                limit: this.rules.requestsPerMinute,
                remaining: this.rules.requestsPerMinute,
                resetAt: new Date(Date.now() + 60000),
                exceeded: false
            };
        }

        const now = Date.now();
        const minuteAgo = now - 60000;
        const hourAgo = now - 3600000;

        // Get request timestamps
        const timestamps = this.requests.get(identifier) || [];
        
        // Count requests in last minute
        const minuteRequests = timestamps.filter(ts => ts > minuteAgo).length;
        
        // Count requests in last hour
        const hourRequests = timestamps.filter(ts => ts > hourAgo).length;

        // Check if limits exceeded
        const minuteExceeded = minuteRequests >= this.rules.requestsPerMinute;
        const hourExceeded = hourRequests >= this.rules.requestsPerHour;
        const exceeded = minuteExceeded || hourExceeded;

        // Calculate remaining requests (use minute limit for simplicity)
        const remaining = Math.max(0, this.rules.requestsPerMinute - minuteRequests);

        // Record this request if not exceeded
        if (!exceeded) {
            timestamps.push(now);
            this.requests.set(identifier, timestamps);
        }

        return {
            limit: this.rules.requestsPerMinute,
            remaining,
            resetAt: new Date(now + 60000),
            exceeded
        };
    }

    /**
     * Set rate limiting rules
     */
    async setRules(rules) {
        this.rules = {
            ...this.rules,
            ...rules
        };
    }

    /**
     * Get rate limiting middleware
     */
    getMiddleware() {
        return async (req, res, next) => {
            // Extract client identifier
            const identifier = this.extractIdentifier(req);

            // Get rate limit status
            const status = await this.getStatus(identifier);

            // Set rate limit headers
            res.set({
                'X-RateLimit-Limit': status.limit,
                'X-RateLimit-Remaining': status.remaining,
                'X-RateLimit-Reset': status.resetAt.toISOString()
            });

            if (status.exceeded) {
                return res.status(429).json({
                    error: 'Rate limit exceeded',
                    retryAfter: status.resetAt
                });
            }

            next();
        };
    }

    /**
     * Extract client identifier from request
     */
    extractIdentifier(req) {
        // Priority: API key > authenticated user > IP address
        if (req.apiKey) {
            return `api_key:${req.apiKey.key}`;
        }

        if (req.authToken) {
            return `token:${req.authToken}`;
        }

        // Get client IP
        const ip = req.headers['x-forwarded-for'] || 
                  req.connection.remoteAddress || 
                  req.ip;

        return `ip:${ip}`;
    }

    /**
     * Reset rate limit for an identifier
     */
    async reset(identifier) {
        this.requests.delete(identifier);
    }

    /**
     * Get current rules
     */
    getRules() {
        return { ...this.rules };
    }
}

module.exports = RateLimiter;