// Contract: Security API
// Purpose: Define the authentication and authorization interface
// Team responsible: Security API Team

// Import the actual implementation
const JWTAuth = require('../../security/api-auth/jwt-auth');

// Export the implementation as the interface
module.exports = JWTAuth;