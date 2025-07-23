// Contract: Rate Limiter
// Purpose: Define the rate limiting interface for API protection
// Team responsible: Security API Team

// Import the actual implementation
const RateLimiter = require('../../security/rate-limiting/rate-limiter');

// Export the implementation as the interface
module.exports = RateLimiter;