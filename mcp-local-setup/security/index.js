/**
 * Security Implementation
 * Main security module that implements the SecurityInterface
 */

const SecurityInterface = require('../interfaces/security.interface');
const AuthManager = require('./auth/auth-manager');
const NetworkManager = require('./network/network-manager');
const TLSManager = require('./tls/tls-manager');

class SecurityImplementation extends SecurityInterface {
    constructor() {
        super();
        this.authManager = new AuthManager();
        this.networkManager = new NetworkManager();
        this.tlsManager = new TLSManager();
        this.initialized = false;
    }

    /**
     * Initialize the security system
     */
    async initialize() {
        if (this.initialized) {
            return;
        }

        await Promise.all([
            this.authManager.initialize(),
            this.networkManager.initialize(),
            this.tlsManager.initialize()
        ]);

        this.initialized = true;
    }

    /**
     * Cleanup resources
     */
    async cleanup() {
        await Promise.all([
            this.authManager.cleanup(),
            this.networkManager.cleanup(),
            this.tlsManager.cleanup()
        ]);

        this.initialized = false;
    }

    /**
     * Authenticate with provided credentials
     * @param {SecurityCredentials} credentials - Authentication credentials
     * @returns {Promise<AuthToken>} Authentication token
     * @throws {Error} If authentication fails
     */
    async authenticate(credentials) {
        await this.ensureInitialized();
        return this.authManager.authenticate(credentials);
    }

    /**
     * Authorize access to a resource
     * @param {string} token - Authentication token
     * @param {string} resource - Resource identifier
     * @param {string} action - Action to perform
     * @returns {Promise<boolean>} Whether access is authorized
     */
    async authorize(token, resource, action) {
        await this.ensureInitialized();
        return this.authManager.authorize(token, resource, action);
    }

    /**
     * Rotate an existing token
     * @param {string} oldToken - Current token to rotate
     * @returns {Promise<AuthToken>} New authentication token
     * @throws {Error} If token rotation fails
     */
    async rotateToken(oldToken) {
        await this.ensureInitialized();
        return this.authManager.rotateToken(oldToken);
    }

    /**
     * Validate an API key
     * @param {string} key - API key to validate
     * @returns {Promise<ApiKeyInfo>} API key information and permissions
     * @throws {Error} If key is invalid
     */
    async validateApiKey(key) {
        await this.ensureInitialized();
        return this.authManager.validateApiKey(key);
    }

    /**
     * Get rate limit status for an identifier
     * @param {string} identifier - Client identifier
     * @returns {Promise<RateLimitInfo>} Current rate limit status
     */
    async getRateLimitStatus(identifier) {
        await this.ensureInitialized();
        return this.networkManager.getRateLimitStatus(identifier);
    }

    /**
     * Generate a new API key
     * @param {string} name - Name/description for the key
     * @param {string[]} permissions - List of permissions to grant
     * @returns {Promise<ApiKeyInfo>} Generated API key information
     */
    async generateApiKey(name, permissions) {
        await this.ensureInitialized();
        return this.authManager.generateApiKey(name, permissions);
    }

    /**
     * Revoke an API key
     * @param {string} key - API key to revoke
     * @returns {Promise<boolean>} Whether revocation was successful
     */
    async revokeApiKey(key) {
        await this.ensureInitialized();
        return this.authManager.revokeApiKey(key);
    }

    /**
     * Configure CORS policy
     * @param {Object} policy - CORS policy configuration
     * @returns {Promise<void>}
     */
    async configureCORS(policy) {
        await this.ensureInitialized();
        return this.networkManager.configureCORS(policy);
    }

    /**
     * Set rate limiting rules
     * @param {Object} rules - Rate limiting rules
     * @returns {Promise<void>}
     */
    async setRateLimitRules(rules) {
        await this.ensureInitialized();
        return this.networkManager.setRateLimitRules(rules);
    }

    /**
     * Generate SSL certificate
     * @param {Object} options - Certificate options
     * @returns {Promise<Object>} Certificate and key paths
     */
    async generateCertificate(options) {
        await this.ensureInitialized();
        return this.tlsManager.generateCertificate(options);
    }

    /**
     * Renew SSL certificate
     * @param {string} domain - Domain to renew certificate for
     * @returns {Promise<Object>} New certificate information
     */
    async renewCertificate(domain) {
        await this.ensureInitialized();
        return this.tlsManager.renewCertificate(domain);
    }

    /**
     * Ensure the security system is initialized
     * @private
     */
    async ensureInitialized() {
        if (!this.initialized) {
            await this.initialize();
        }
    }
}

module.exports = SecurityImplementation;