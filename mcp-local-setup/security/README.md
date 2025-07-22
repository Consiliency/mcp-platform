# MCP Security Implementation

This directory contains the security implementation for the MCP platform, providing authentication, authorization, network security, and TLS/SSL support.

## Directory Structure

```
security/
├── index.js                 # Main SecurityImplementation class
├── auth/                    # Authentication and authorization
│   ├── auth-manager.js      # Core authentication logic
│   ├── token-store.js       # Token storage and management
│   ├── api-key-store.js     # API key management
│   └── middleware.js        # Express middleware for auth
├── network/                 # Network security
│   ├── network-manager.js   # Network security coordinator
│   ├── rate-limiter.js      # Rate limiting implementation
│   ├── cors-manager.js      # CORS policy management
│   └── service-isolation.js # Service-to-service security
└── tls/                     # TLS/SSL certificate management
    ├── tls-manager.js       # TLS coordinator
    ├── certificate-generator.js # Self-signed cert generation
    ├── lets-encrypt.js      # Let's Encrypt integration
    └── certificate-store.js # Certificate storage

```

## Features

### Authentication & Authorization (SECURITY-3.1)
- Username/password authentication
- API key generation and management
- JWT-based token authentication
- Token rotation with grace period
- Service-to-service authentication
- Role-based access control

### Network Security (SECURITY-3.2)
- Rate limiting with sliding window algorithm
- CORS policy management
- Service isolation rules
- Whitelisting support
- Request tracking and monitoring

### TLS/SSL Support (SECURITY-3.3)
- Self-signed certificate generation
- Let's Encrypt integration (production)
- Automatic certificate renewal
- Certificate storage and management
- Multiple domain support

## Usage

### Basic Setup

```javascript
const SecurityImplementation = require('./security');

// Initialize security
const security = new SecurityImplementation();
await security.initialize();

// Use security features
const token = await security.authenticate({
    username: 'user',
    password: 'password'
});
```

### Authentication

```javascript
// Password authentication
const token = await security.authenticate({
    username: 'user',
    password: 'password'
});

// API key authentication
const apiKeyAuth = await security.authenticate({
    apiKey: 'mcp_xxxxx'
});

// Token refresh
const newToken = await security.authenticate({
    token: existingToken
});
```

### Authorization

```javascript
// Check permissions
const canRead = await security.authorize(token, 'services.filesystem', 'read');
const canWrite = await security.authorize(token, 'services.filesystem', 'write');

// API key validation
const keyInfo = await security.validateApiKey('mcp_xxxxx');
```

### API Key Management

```javascript
// Generate new API key
const newKey = await security.generateApiKey('My Service Key', [
    'services.read',
    'services.write'
]);

// Revoke API key
await security.revokeApiKey(newKey.key);
```

### Express Middleware

```javascript
const AuthMiddleware = require('./security/auth/middleware');
const authMiddleware = new AuthMiddleware(security);

// Protect routes
app.get('/api/services', 
    authMiddleware.requireAuth(), 
    (req, res) => {
        // Route is protected
    }
);

// Require specific permissions
app.post('/api/services/:id', 
    authMiddleware.requirePermission('services', 'write'),
    (req, res) => {
        // Requires services.write permission
    }
);

// API key authentication
app.get('/api/data',
    authMiddleware.apiKeyAuth(),
    (req, res) => {
        // Requires valid API key
    }
);
```

### Rate Limiting

```javascript
// Set rate limit rules
await security.setRateLimitRules({
    requestsPerMinute: 60,
    requestsPerHour: 1000,
    whitelist: ['127.0.0.1', '::1']
});

// Check rate limit status
const status = await security.getRateLimitStatus('client-ip');
console.log(`Remaining requests: ${status.remaining}`);

// Use rate limiting middleware
const NetworkManager = require('./security/network/network-manager');
const networkManager = new NetworkManager();
app.use(networkManager.getRateLimitMiddleware());
```

### CORS Configuration

```javascript
// Configure CORS
await security.configureCORS({
    origins: ['http://localhost:3000', 'https://app.example.com'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    headers: ['Content-Type', 'Authorization', 'X-API-Key'],
    credentials: true
});

// Use CORS middleware
app.use(networkManager.getCORSMiddleware());
```

### SSL/TLS Certificates

```javascript
// Generate self-signed certificate
const selfSigned = await security.generateCertificate({
    domain: 'mcp.local',
    type: 'self-signed',
    validDays: 365
});

// Generate Let's Encrypt certificate (production only)
const letsEncrypt = await security.generateCertificate({
    domain: 'mcp.example.com',
    type: 'lets-encrypt',
    email: 'admin@example.com'
});

// Check certificate info
const certInfo = await security.tlsManager.getCertificateInfo('mcp.local');
console.log(`Certificate expires in ${certInfo.daysUntilExpiry} days`);

// Certificate renewal (automatic or manual)
await security.renewCertificate('mcp.local');
```

## Environment Variables

- `JWT_SECRET`: Secret key for JWT signing (auto-generated if not set)
- `ADMIN_PASSWORD`: Default admin password
- `ADMIN_API_KEY`: Pre-configured admin API key
- `LETSENCRYPT_EMAIL`: Email for Let's Encrypt registration
- `NODE_ENV`: Environment (production enables Let's Encrypt)

## Testing

```bash
# Run unit tests
npm test

# Run integration tests
npm run test:integration
```

## Security Best Practices

1. **Token Management**
   - Tokens expire after 1 hour
   - Use token rotation for long-running services
   - Grace period allows smooth transitions

2. **API Keys**
   - Keys are hashed before storage
   - Track last usage for audit
   - Assign minimal required permissions

3. **Rate Limiting**
   - Default: 60 requests/minute per client
   - Whitelist trusted IPs
   - Monitor for suspicious patterns

4. **TLS/SSL**
   - Auto-renewal 30 days before expiry
   - Use Let's Encrypt in production
   - Self-signed for development/testing

5. **Service Isolation**
   - Default deny policy
   - Explicit allow rules only
   - Separate networks for isolation

## Interface Implementation

This implementation follows the SecurityInterface defined in `/interfaces/security.interface.js`.