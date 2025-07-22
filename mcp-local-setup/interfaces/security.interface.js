/**
 * Security Interface
 * Defines authentication and authorization contracts for MCP Platform
 */

/**
 * @typedef {Object} AuthToken
 * @property {string} token - The authentication token
 * @property {string} type - Token type (e.g., 'Bearer', 'ApiKey')
 * @property {Date} expiresAt - Token expiration time
 * @property {string[]} scopes - List of granted scopes
 */

/**
 * @typedef {Object} ApiKeyInfo
 * @property {string} key - The API key
 * @property {string} name - Key name/description
 * @property {string[]} permissions - List of permissions
 * @property {Date} createdAt - Creation timestamp
 * @property {Date} [lastUsed] - Last usage timestamp
 */

/**
 * @typedef {Object} RateLimitInfo
 * @property {number} limit - Maximum requests allowed
 * @property {number} remaining - Requests remaining
 * @property {Date} resetAt - When the limit resets
 * @property {boolean} exceeded - Whether limit is exceeded
 */

/**
 * @typedef {Object} SecurityCredentials
 * @property {string} [username] - Username for basic auth
 * @property {string} [password] - Password for basic auth
 * @property {string} [apiKey] - API key for key-based auth
 * @property {string} [token] - Existing token for token refresh
 */

class SecurityInterface {
    /**
     * Authenticate with provided credentials
     * @param {SecurityCredentials} credentials - Authentication credentials
     * @returns {Promise<AuthToken>} Authentication token
     * @throws {Error} If authentication fails
     */
    async authenticate(credentials) {
        throw new Error('authenticate() method must be implemented');
    }

    /**
     * Authorize access to a resource
     * @param {string} token - Authentication token
     * @param {string} resource - Resource identifier (e.g., 'services.filesystem')
     * @param {string} action - Action to perform (e.g., 'read', 'write', 'admin')
     * @returns {Promise<boolean>} Whether access is authorized
     */
    async authorize(token, resource, action) {
        throw new Error('authorize() method must be implemented');
    }

    /**
     * Rotate an existing token
     * @param {string} oldToken - Current token to rotate
     * @returns {Promise<AuthToken>} New authentication token
     * @throws {Error} If token rotation fails
     */
    async rotateToken(oldToken) {
        throw new Error('rotateToken() method must be implemented');
    }

    /**
     * Validate an API key
     * @param {string} key - API key to validate
     * @returns {Promise<ApiKeyInfo>} API key information and permissions
     * @throws {Error} If key is invalid
     */
    async validateApiKey(key) {
        throw new Error('validateApiKey() method must be implemented');
    }

    /**
     * Get rate limit status for an identifier
     * @param {string} identifier - Client identifier (IP, API key, user ID)
     * @returns {Promise<RateLimitInfo>} Current rate limit status
     */
    async getRateLimitStatus(identifier) {
        throw new Error('getRateLimitStatus() method must be implemented');
    }

    /**
     * Generate a new API key
     * @param {string} name - Name/description for the key
     * @param {string[]} permissions - List of permissions to grant
     * @returns {Promise<ApiKeyInfo>} Generated API key information
     */
    async generateApiKey(name, permissions) {
        throw new Error('generateApiKey() method must be implemented');
    }

    /**
     * Revoke an API key
     * @param {string} key - API key to revoke
     * @returns {Promise<boolean>} Whether revocation was successful
     */
    async revokeApiKey(key) {
        throw new Error('revokeApiKey() method must be implemented');
    }

    /**
     * Configure CORS policy
     * @param {Object} policy - CORS policy configuration
     * @param {string[]} policy.origins - Allowed origins
     * @param {string[]} policy.methods - Allowed HTTP methods
     * @param {string[]} policy.headers - Allowed headers
     * @returns {Promise<void>}
     */
    async configureCORS(policy) {
        throw new Error('configureCORS() method must be implemented');
    }

    /**
     * Set rate limiting rules
     * @param {Object} rules - Rate limiting rules
     * @param {number} rules.requestsPerMinute - Max requests per minute
     * @param {number} rules.requestsPerHour - Max requests per hour
     * @param {string[]} rules.whitelist - IPs/keys to exclude from limits
     * @returns {Promise<void>}
     */
    async setRateLimitRules(rules) {
        throw new Error('setRateLimitRules() method must be implemented');
    }

    /**
     * Generate SSL certificate
     * @param {Object} options - Certificate options
     * @param {string} options.domain - Domain for the certificate
     * @param {string} options.type - Certificate type ('self-signed', 'lets-encrypt')
     * @returns {Promise<Object>} Certificate and key paths
     */
    async generateCertificate(options) {
        throw new Error('generateCertificate() method must be implemented');
    }

    /**
     * Renew SSL certificate
     * @param {string} domain - Domain to renew certificate for
     * @returns {Promise<Object>} New certificate information
     */
    async renewCertificate(domain) {
        throw new Error('renewCertificate() method must be implemented');
    }
}

module.exports = SecurityInterface;