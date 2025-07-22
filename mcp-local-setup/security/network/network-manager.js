/**
 * Network Manager
 * Handles network security, CORS policies, and rate limiting
 */

const RateLimiter = require('./rate-limiter');
const CORSManager = require('./cors-manager');
const ServiceIsolation = require('./service-isolation');

class NetworkManager {
    constructor() {
        this.rateLimiter = new RateLimiter();
        this.corsManager = new CORSManager();
        this.serviceIsolation = new ServiceIsolation();
    }

    async initialize() {
        await Promise.all([
            this.rateLimiter.initialize(),
            this.corsManager.initialize(),
            this.serviceIsolation.initialize()
        ]);
    }

    async cleanup() {
        await Promise.all([
            this.rateLimiter.cleanup(),
            this.corsManager.cleanup(),
            this.serviceIsolation.cleanup()
        ]);
    }

    /**
     * Get rate limit status for an identifier
     */
    async getRateLimitStatus(identifier) {
        return this.rateLimiter.getStatus(identifier);
    }

    /**
     * Set rate limiting rules
     */
    async setRateLimitRules(rules) {
        return this.rateLimiter.setRules(rules);
    }

    /**
     * Configure CORS policy
     */
    async configureCORS(policy) {
        return this.corsManager.configure(policy);
    }

    /**
     * Get CORS middleware
     */
    getCORSMiddleware() {
        return this.corsManager.getMiddleware();
    }

    /**
     * Get rate limiting middleware
     */
    getRateLimitMiddleware() {
        return this.rateLimiter.getMiddleware();
    }

    /**
     * Configure service isolation
     */
    async configureServiceIsolation(config) {
        return this.serviceIsolation.configure(config);
    }

    /**
     * Get service isolation rules
     */
    async getServiceIsolationRules() {
        return this.serviceIsolation.getRules();
    }
}

module.exports = NetworkManager;