# MCP Platform Security Guide

Comprehensive security guide for the MCP Platform covering authentication, authorization, network security, compliance, and best practices.

## Table of Contents

1. [Security Architecture](#security-architecture)
2. [Authentication](#authentication)
3. [Authorization](#authorization)
4. [Network Security](#network-security)
5. [Data Security](#data-security)
6. [Certificate Management](#certificate-management)
7. [Security Monitoring](#security-monitoring)
8. [Compliance](#compliance)
9. [Incident Response](#incident-response)
10. [Security Best Practices](#security-best-practices)

## Security Architecture

### Defense in Depth

```
┌─────────────────────────────────────────────────────────┐
│                   External Firewall                      │
├─────────────────────────────────────────────────────────┤
│                    WAF (Web Application Firewall)        │
├─────────────────────────────────────────────────────────┤
│                    Load Balancer (SSL/TLS)              │
├─────────────────────────────────────────────────────────┤
│                    Traefik (Rate Limiting)              │
├─────────────────────────────────────────────────────────┤
│                 Application Layer (Auth/AuthZ)           │
├─────────────────────────────────────────────────────────┤
│                    Service Mesh (mTLS)                   │
├─────────────────────────────────────────────────────────┤
│                 Container Security (AppArmor)            │
├─────────────────────────────────────────────────────────┤
│                   Network Policies                       │
├─────────────────────────────────────────────────────────┤
│                    Data Encryption                       │
└─────────────────────────────────────────────────────────┘
```

### Security Components

| Component | Purpose | Implementation |
|-----------|---------|----------------|
| Authentication | User identity verification | JWT, OAuth2, API Keys |
| Authorization | Access control | RBAC, ABAC |
| Network Security | Traffic control | Firewall, VPN, TLS |
| Data Protection | Encryption at rest/transit | AES-256, TLS 1.3 |
| Audit Logging | Activity tracking | Centralized logging |
| Vulnerability Management | Security scanning | Trivy, Snyk |
| Secret Management | Credential storage | Vault, K8s Secrets |

## Authentication

### JWT Authentication

#### Configuration

```javascript
// jwt-config.js
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

module.exports = {
  jwt: {
    algorithm: 'RS256',
    issuer: 'mcp-platform',
    audience: 'mcp-api',
    accessTokenExpiry: '15m',
    refreshTokenExpiry: '7d',
    keyRotationInterval: '30d'
  },
  
  generateKeyPair: () => {
    return crypto.generateKeyPairSync('rsa', {
      modulusLength: 4096,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
        cipher: 'aes-256-cbc',
        passphrase: process.env.JWT_KEY_PASSPHRASE
      }
    });
  }
};
```

#### Token Generation

```javascript
// auth-service.js
class AuthService {
  generateTokens(user) {
    const payload = {
      sub: user.id,
      email: user.email,
      roles: user.roles,
      permissions: user.permissions
    };
    
    const accessToken = jwt.sign(payload, privateKey, {
      algorithm: 'RS256',
      expiresIn: '15m',
      issuer: 'mcp-platform',
      audience: 'mcp-api'
    });
    
    const refreshToken = jwt.sign(
      { sub: user.id, type: 'refresh' }, 
      refreshPrivateKey, 
      { expiresIn: '7d' }
    );
    
    return {
      accessToken,
      refreshToken,
      expiresIn: 900 // 15 minutes
    };
  }
  
  async verifyToken(token) {
    try {
      const decoded = jwt.verify(token, publicKey, {
        algorithms: ['RS256'],
        issuer: 'mcp-platform',
        audience: 'mcp-api'
      });
      
      // Check if token is blacklisted
      if (await this.isTokenBlacklisted(decoded.jti)) {
        throw new Error('Token has been revoked');
      }
      
      return decoded;
    } catch (error) {
      throw new UnauthorizedError('Invalid token');
    }
  }
}
```

### OAuth2 Integration

#### Provider Configuration

```javascript
// oauth-config.js
module.exports = {
  providers: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      redirectUri: 'https://api.mcp-platform.io/auth/google/callback',
      scope: ['email', 'profile']
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      redirectUri: 'https://api.mcp-platform.io/auth/github/callback',
      scope: ['user:email', 'read:user']
    },
    microsoft: {
      clientId: process.env.MICROSOFT_CLIENT_ID,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
      redirectUri: 'https://api.mcp-platform.io/auth/microsoft/callback',
      scope: ['openid', 'email', 'profile']
    }
  }
};
```

#### OAuth Flow Implementation

```javascript
// oauth-flow.js
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

passport.use(new GoogleStrategy({
  clientID: config.providers.google.clientId,
  clientSecret: config.providers.google.clientSecret,
  callbackURL: config.providers.google.redirectUri
}, async (accessToken, refreshToken, profile, done) => {
  try {
    // Find or create user
    let user = await User.findOne({ googleId: profile.id });
    
    if (!user) {
      user = await User.create({
        googleId: profile.id,
        email: profile.emails[0].value,
        name: profile.displayName,
        provider: 'google'
      });
    }
    
    // Generate MCP tokens
    const tokens = authService.generateTokens(user);
    
    return done(null, { user, tokens });
  } catch (error) {
    return done(error);
  }
}));
```

### API Key Management

#### API Key Generation

```javascript
// api-key-service.js
const crypto = require('crypto');

class ApiKeyService {
  generateApiKey(userId, name, permissions) {
    const prefix = 'mcp_';
    const keyId = crypto.randomBytes(8).toString('hex');
    const secret = crypto.randomBytes(32).toString('hex');
    
    const apiKey = `${prefix}${keyId}_${secret}`;
    const hashedKey = crypto
      .createHash('sha256')
      .update(apiKey + process.env.API_KEY_SALT)
      .digest('hex');
    
    // Store hashed key
    return ApiKey.create({
      userId,
      name,
      keyId,
      hashedKey,
      permissions,
      lastUsed: null,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    });
  }
  
  async validateApiKey(apiKey) {
    const match = apiKey.match(/^mcp_([a-f0-9]{16})_([a-f0-9]{64})$/);
    if (!match) return null;
    
    const [, keyId, secret] = match;
    const hashedKey = crypto
      .createHash('sha256')
      .update(apiKey + process.env.API_KEY_SALT)
      .digest('hex');
    
    const key = await ApiKey.findOne({ keyId, hashedKey });
    if (!key || key.expiresAt < new Date()) {
      return null;
    }
    
    // Update last used
    await key.update({ lastUsed: new Date() });
    
    return key;
  }
}
```

## Authorization

### Role-Based Access Control (RBAC)

#### Role Definition

```yaml
# roles.yaml
roles:
  admin:
    description: "Full system access"
    permissions:
      - "*"
      
  developer:
    description: "Development access"
    permissions:
      - "services:read"
      - "services:write"
      - "services:deploy"
      - "logs:read"
      - "metrics:read"
      
  operator:
    description: "Operations access"
    permissions:
      - "services:read"
      - "services:restart"
      - "logs:read"
      - "metrics:read"
      - "backups:create"
      - "backups:restore"
      
  viewer:
    description: "Read-only access"
    permissions:
      - "services:read"
      - "logs:read"
      - "metrics:read"
```

#### Permission Checking

```javascript
// rbac-middleware.js
const checkPermission = (requiredPermission) => {
  return async (req, res, next) => {
    try {
      const user = req.user;
      
      // Check if user has admin role
      if (user.roles.includes('admin')) {
        return next();
      }
      
      // Get all permissions for user's roles
      const userPermissions = await getUserPermissions(user.roles);
      
      // Check exact permission
      if (userPermissions.includes(requiredPermission)) {
        return next();
      }
      
      // Check wildcard permissions
      const resource = requiredPermission.split(':')[0];
      if (userPermissions.includes(`${resource}:*`)) {
        return next();
      }
      
      throw new ForbiddenError('Insufficient permissions');
    } catch (error) {
      next(error);
    }
  };
};

// Usage
router.post('/services/:id/deploy', 
  authenticate(), 
  checkPermission('services:deploy'),
  deployService
);
```

### Attribute-Based Access Control (ABAC)

```javascript
// abac-policy.js
const policies = [
  {
    name: "service-owner-access",
    effect: "allow",
    actions: ["services:*"],
    resources: ["services/:serviceId"],
    condition: {
      "StringEquals": {
        "service.owner": "${user.id}"
      }
    }
  },
  {
    name: "time-based-access",
    effect: "allow",
    actions: ["services:deploy"],
    resources: ["services/*"],
    condition: {
      "DateGreaterThan": {
        "request.time": "08:00"
      },
      "DateLessThan": {
        "request.time": "18:00"
      }
    }
  }
];

const evaluatePolicy = (user, action, resource, context) => {
  for (const policy of policies) {
    if (matchesPolicy(policy, user, action, resource, context)) {
      return policy.effect === 'allow';
    }
  }
  return false;
};
```

## Network Security

### Firewall Configuration

#### iptables Rules

```bash
#!/bin/bash
# firewall-setup.sh

# Default policies
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT ACCEPT

# Allow loopback
iptables -A INPUT -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT

# Allow established connections
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

# Allow SSH (restricted to admin IPs)
iptables -A INPUT -p tcp --dport 22 -s 10.0.0.0/24 -j ACCEPT

# Allow HTTP/HTTPS
iptables -A INPUT -p tcp --dport 80 -j ACCEPT
iptables -A INPUT -p tcp --dport 443 -j ACCEPT

# Allow internal services
iptables -A INPUT -s 172.16.0.0/12 -j ACCEPT

# Rate limiting
iptables -A INPUT -p tcp --dport 443 -m limit --limit 100/minute --limit-burst 200 -j ACCEPT
iptables -A INPUT -p tcp --dport 443 -j DROP

# DDoS protection
iptables -A INPUT -p tcp --syn -m limit --limit 1/s --limit-burst 3 -j ACCEPT
iptables -A INPUT -p tcp --syn -j DROP

# Log dropped packets
iptables -A INPUT -m limit --limit 5/min -j LOG --log-prefix "IPTables-Dropped: "

# Save rules
iptables-save > /etc/iptables/rules.v4
```

### Rate Limiting

#### Redis-Based Rate Limiter

```javascript
// rate-limiter.js
const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL);

class RateLimiter {
  constructor(options = {}) {
    this.windowMs = options.windowMs || 60 * 1000; // 1 minute
    this.max = options.max || 100;
    this.keyPrefix = options.keyPrefix || 'rate-limit:';
  }
  
  async checkLimit(identifier) {
    const key = `${this.keyPrefix}${identifier}`;
    const now = Date.now();
    const window = now - this.windowMs;
    
    const pipeline = redis.pipeline();
    
    // Remove old entries
    pipeline.zremrangebyscore(key, '-inf', window);
    
    // Count current entries
    pipeline.zcard(key);
    
    // Add current request
    pipeline.zadd(key, now, `${now}-${Math.random()}`);
    
    // Set expiry
    pipeline.expire(key, Math.ceil(this.windowMs / 1000));
    
    const results = await pipeline.exec();
    const count = results[1][1];
    
    if (count >= this.max) {
      const oldestEntry = await redis.zrange(key, 0, 0, 'WITHSCORES');
      const resetTime = parseInt(oldestEntry[1]) + this.windowMs;
      
      return {
        allowed: false,
        limit: this.max,
        remaining: 0,
        resetTime: new Date(resetTime)
      };
    }
    
    return {
      allowed: true,
      limit: this.max,
      remaining: this.max - count - 1,
      resetTime: new Date(now + this.windowMs)
    };
  }
}

// Middleware
const rateLimitMiddleware = (options) => {
  const limiter = new RateLimiter(options);
  
  return async (req, res, next) => {
    const identifier = req.user?.id || req.ip;
    const result = await limiter.checkLimit(identifier);
    
    res.setHeader('X-RateLimit-Limit', result.limit);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', result.resetTime.toISOString());
    
    if (!result.allowed) {
      return res.status(429).json({
        error: 'Too many requests',
        retryAfter: result.resetTime
      });
    }
    
    next();
  };
};
```

### CORS Configuration

```javascript
// cors-config.js
const cors = require('cors');

const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = [
      'https://app.mcp-platform.io',
      'https://dashboard.mcp-platform.io',
      /^https:\/\/.*\.mcp-platform\.io$/
    ];
    
    // Allow requests with no origin (mobile apps, Postman)
    if (!origin) return callback(null, true);
    
    const allowed = allowedOrigins.some(allowed => {
      if (allowed instanceof RegExp) {
        return allowed.test(origin);
      }
      return allowed === origin;
    });
    
    if (allowed) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  
  credentials: true,
  maxAge: 86400, // 24 hours
  
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-API-Key',
    'X-Request-ID'
  ],
  
  exposedHeaders: [
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset'
  ],
  
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
};

app.use(cors(corsOptions));
```

## Data Security

### Encryption at Rest

```javascript
// encryption-service.js
const crypto = require('crypto');

class EncryptionService {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.keyDerivationIterations = 100000;
  }
  
  deriveKey(password, salt) {
    return crypto.pbkdf2Sync(
      password, 
      salt, 
      this.keyDerivationIterations, 
      32, 
      'sha256'
    );
  }
  
  encrypt(data, password) {
    const salt = crypto.randomBytes(32);
    const key = this.deriveKey(password, salt);
    const iv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipheriv(this.algorithm, key, iv);
    
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(data), 'utf8'),
      cipher.final()
    ]);
    
    const tag = cipher.getAuthTag();
    
    return {
      encrypted: encrypted.toString('base64'),
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      tag: tag.toString('base64')
    };
  }
  
  decrypt(encryptedData, password) {
    const salt = Buffer.from(encryptedData.salt, 'base64');
    const key = this.deriveKey(password, salt);
    const iv = Buffer.from(encryptedData.iv, 'base64');
    const tag = Buffer.from(encryptedData.tag, 'base64');
    
    const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
    decipher.setAuthTag(tag);
    
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedData.encrypted, 'base64')),
      decipher.final()
    ]);
    
    return JSON.parse(decrypted.toString('utf8'));
  }
}
```

### Database Encryption

```sql
-- PostgreSQL Transparent Data Encryption
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Encrypted column
ALTER TABLE users ADD COLUMN ssn_encrypted bytea;

-- Encrypt data
UPDATE users 
SET ssn_encrypted = pgp_sym_encrypt(ssn, 'encryption_key')
WHERE ssn IS NOT NULL;

-- Decrypt data
SELECT 
  id,
  email,
  pgp_sym_decrypt(ssn_encrypted, 'encryption_key') as ssn
FROM users;

-- Create encrypted view
CREATE VIEW users_decrypted AS
SELECT 
  id,
  email,
  pgp_sym_decrypt(ssn_encrypted, 'encryption_key') as ssn
FROM users;

-- Row-level encryption
CREATE TABLE sensitive_data (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  data JSONB,
  encrypted_data bytea,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Trigger for automatic encryption
CREATE OR REPLACE FUNCTION encrypt_sensitive_data()
RETURNS TRIGGER AS $$
BEGIN
  NEW.encrypted_data = pgp_sym_encrypt(
    NEW.data::text, 
    current_setting('app.encryption_key')
  );
  NEW.data = NULL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER encrypt_before_insert
BEFORE INSERT ON sensitive_data
FOR EACH ROW
EXECUTE FUNCTION encrypt_sensitive_data();
```

## Certificate Management

### Let's Encrypt Integration

```javascript
// lets-encrypt.js
const acme = require('acme-client');
const fs = require('fs').promises;

class LetsEncryptManager {
  constructor() {
    this.client = new acme.Client({
      directoryUrl: acme.directory.letsencrypt.production,
      accountKey: null
    });
  }
  
  async initialize() {
    // Create or load account key
    try {
      const accountKey = await fs.readFile('/etc/letsencrypt/account.key');
      this.client.accountKey = accountKey;
    } catch (error) {
      this.client.accountKey = await acme.forge.createPrivateKey();
      await fs.writeFile(
        '/etc/letsencrypt/account.key', 
        this.client.accountKey
      );
    }
    
    // Create account
    await this.client.createAccount({
      termsOfServiceAgreed: true,
      contact: ['mailto:admin@mcp-platform.io']
    });
  }
  
  async obtainCertificate(domain) {
    // Create CSR
    const [key, csr] = await acme.forge.createCsr({
      commonName: domain,
      altNames: [domain, `*.${domain}`]
    });
    
    // Create order
    const order = await this.client.createOrder({
      identifiers: [
        { type: 'dns', value: domain },
        { type: 'dns', value: `*.${domain}` }
      ]
    });
    
    // Get authorizations
    const authorizations = await this.client.getAuthorizations(order);
    
    // Complete challenges
    for (const auth of authorizations) {
      const challenge = auth.challenges.find(c => c.type === 'dns-01');
      const keyAuthorization = await this.client.getChallengeKeyAuthorization(challenge);
      
      // Set DNS record
      await this.setDnsRecord(auth.identifier.value, keyAuthorization);
      
      // Verify challenge
      await this.client.verifyChallenge(auth, challenge);
      await this.client.completeChallenge(challenge);
      await this.client.waitForValidStatus(challenge);
    }
    
    // Finalize order
    await this.client.finalizeOrder(order, csr);
    const cert = await this.client.getCertificate(order);
    
    // Save certificate
    await fs.writeFile(`/etc/letsencrypt/live/${domain}/fullchain.pem`, cert);
    await fs.writeFile(`/etc/letsencrypt/live/${domain}/privkey.pem`, key);
    
    return { cert, key };
  }
  
  async renewCertificate(domain) {
    const certPath = `/etc/letsencrypt/live/${domain}/fullchain.pem`;
    const cert = await fs.readFile(certPath, 'utf8');
    
    // Check expiration
    const certObj = acme.forge.readCertificateInfo(cert);
    const daysUntilExpiry = Math.floor(
      (certObj.notAfter - Date.now()) / (1000 * 60 * 60 * 24)
    );
    
    if (daysUntilExpiry > 30) {
      console.log(`Certificate for ${domain} expires in ${daysUntilExpiry} days`);
      return null;
    }
    
    console.log(`Renewing certificate for ${domain}`);
    return await this.obtainCertificate(domain);
  }
}
```

### Certificate Monitoring

```bash
#!/bin/bash
# cert-monitor.sh

DOMAINS="mcp-platform.io api.mcp-platform.io dashboard.mcp-platform.io"
ALERT_DAYS=30

for domain in $DOMAINS; do
  cert_file="/etc/letsencrypt/live/${domain}/fullchain.pem"
  
  if [ ! -f "$cert_file" ]; then
    echo "ERROR: Certificate not found for ${domain}"
    continue
  fi
  
  expiry_date=$(openssl x509 -enddate -noout -in "$cert_file" | cut -d= -f2)
  expiry_epoch=$(date -d "$expiry_date" +%s)
  current_epoch=$(date +%s)
  days_left=$(( ($expiry_epoch - $current_epoch) / 86400 ))
  
  if [ $days_left -lt $ALERT_DAYS ]; then
    echo "WARNING: Certificate for ${domain} expires in ${days_left} days"
    
    # Send alert
    curl -X POST https://hooks.slack.com/services/xxx/yyy/zzz \
      -H 'Content-type: application/json' \
      -d "{\"text\":\"Certificate for ${domain} expires in ${days_left} days\"}"
  else
    echo "OK: Certificate for ${domain} expires in ${days_left} days"
  fi
done
```

## Security Monitoring

### Security Event Logging

```javascript
// security-logger.js
const winston = require('winston');
const crypto = require('crypto');

class SecurityLogger {
  constructor() {
    this.logger = winston.createLogger({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
        winston.format.printf(info => {
          // Add integrity hash
          const hash = crypto
            .createHash('sha256')
            .update(JSON.stringify(info))
            .digest('hex');
          
          return JSON.stringify({
            ...info,
            integrity: hash
          });
        })
      ),
      transports: [
        new winston.transports.File({ 
          filename: '/var/log/mcp/security.log',
          maxsize: 100 * 1024 * 1024, // 100MB
          maxFiles: 10
        }),
        new winston.transports.Console({
          level: 'error'
        })
      ]
    });
  }
  
  logAuthEvent(event) {
    this.logger.info({
      type: 'AUTH',
      event: event.type,
      userId: event.userId,
      ip: event.ip,
      userAgent: event.userAgent,
      success: event.success,
      reason: event.reason,
      timestamp: new Date().toISOString()
    });
  }
  
  logAccessEvent(event) {
    this.logger.info({
      type: 'ACCESS',
      userId: event.userId,
      resource: event.resource,
      action: event.action,
      allowed: event.allowed,
      ip: event.ip,
      timestamp: new Date().toISOString()
    });
  }
  
  logSecurityAlert(alert) {
    this.logger.warn({
      type: 'ALERT',
      severity: alert.severity,
      category: alert.category,
      description: alert.description,
      source: alert.source,
      indicators: alert.indicators,
      timestamp: new Date().toISOString()
    });
  }
}
```

### Intrusion Detection

```javascript
// intrusion-detection.js
class IntrusionDetector {
  constructor() {
    this.thresholds = {
      failedLogins: { count: 5, window: 300 }, // 5 attempts in 5 minutes
      portScanning: { count: 10, window: 60 }, // 10 ports in 1 minute
      sqlInjection: { count: 3, window: 60 },  // 3 attempts in 1 minute
      xssAttempts: { count: 3, window: 60 },   // 3 attempts in 1 minute
    };
    
    this.events = new Map();
  }
  
  async detectFailedLogins(userId, ip) {
    const key = `failed-login:${ip}`;
    const events = this.getEvents(key);
    
    events.push(Date.now());
    
    const threshold = this.thresholds.failedLogins;
    const recentEvents = events.filter(
      time => time > Date.now() - (threshold.window * 1000)
    );
    
    if (recentEvents.length >= threshold.count) {
      await this.triggerAlert({
        type: 'BRUTE_FORCE',
        severity: 'HIGH',
        source: ip,
        userId,
        message: `${recentEvents.length} failed login attempts in ${threshold.window} seconds`
      });
      
      // Block IP
      await this.blockIp(ip, 3600); // 1 hour
    }
  }
  
  async detectSqlInjection(request) {
    const patterns = [
      /(\b(union|select|insert|update|delete|drop|create)\b.*\b(from|where|table)\b)/i,
      /(\'|\")(\s)*(or|and)(\s)*(\'|\")?(\s)*=/i,
      /(\b(exec|execute)\b\s*\()/i,
      /(;|\'|\"|--|\*|xp_|sp_)/i
    ];
    
    const suspicious = patterns.some(pattern => 
      pattern.test(request.query) || 
      pattern.test(JSON.stringify(request.body))
    );
    
    if (suspicious) {
      const key = `sql-injection:${request.ip}`;
      const events = this.getEvents(key);
      events.push(Date.now());
      
      const threshold = this.thresholds.sqlInjection;
      const recentEvents = events.filter(
        time => time > Date.now() - (threshold.window * 1000)
      );
      
      if (recentEvents.length >= threshold.count) {
        await this.triggerAlert({
          type: 'SQL_INJECTION',
          severity: 'CRITICAL',
          source: request.ip,
          path: request.path,
          payload: request.body,
          message: 'Potential SQL injection attack detected'
        });
        
        // Block IP immediately
        await this.blockIp(request.ip, 86400); // 24 hours
      }
    }
  }
  
  async triggerAlert(alert) {
    // Log alert
    securityLogger.logSecurityAlert(alert);
    
    // Send to SIEM
    await this.sendToSiem(alert);
    
    // Notify security team
    if (alert.severity === 'CRITICAL') {
      await this.notifySecurityTeam(alert);
    }
  }
}
```

## Compliance

### GDPR Compliance

```javascript
// gdpr-compliance.js
class GDPRCompliance {
  // Data portability
  async exportUserData(userId) {
    const userData = await this.collectUserData(userId);
    
    return {
      profile: userData.profile,
      activities: userData.activities,
      preferences: userData.preferences,
      consents: userData.consents,
      exportedAt: new Date().toISOString(),
      format: 'json'
    };
  }
  
  // Right to erasure
  async deleteUserData(userId) {
    // Verify request
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');
    
    // Create deletion record for audit
    await DeletionLog.create({
      userId,
      requestedAt: new Date(),
      reason: 'GDPR Article 17 - Right to erasure'
    });
    
    // Anonymize data instead of hard delete
    await this.anonymizeUser(userId);
    
    // Delete from all systems
    await Promise.all([
      this.deleteFromDatabase(userId),
      this.deleteFromCache(userId),
      this.deleteFromBackups(userId),
      this.deleteFromAnalytics(userId)
    ]);
    
    return {
      status: 'completed',
      deletedAt: new Date().toISOString()
    };
  }
  
  // Consent management
  async updateConsent(userId, consents) {
    const user = await User.findById(userId);
    
    await ConsentLog.create({
      userId,
      consents,
      ip: consents.ip,
      userAgent: consents.userAgent,
      timestamp: new Date()
    });
    
    user.consents = {
      marketing: consents.marketing || false,
      analytics: consents.analytics || false,
      personalisation: consents.personalisation || false,
      updatedAt: new Date()
    };
    
    await user.save();
  }
}
```

### PCI DSS Compliance

```javascript
// pci-compliance.js
class PCICompliance {
  // Credit card tokenization
  async tokenizeCard(cardData) {
    // Never store raw card data
    const token = crypto.randomBytes(32).toString('hex');
    
    // Store tokenized data
    await TokenVault.create({
      token,
      lastFour: cardData.number.slice(-4),
      expiryMonth: cardData.expiryMonth,
      expiryYear: cardData.expiryYear,
      cardType: this.detectCardType(cardData.number),
      createdAt: new Date()
    });
    
    // Send to payment processor
    const processorToken = await paymentProcessor.tokenize(cardData);
    
    return {
      token,
      processorToken,
      lastFour: cardData.number.slice(-4)
    };
  }
  
  // PCI DSS logging
  logCardAccess(event) {
    // Log all card data access
    auditLogger.log({
      type: 'PCI_ACCESS',
      user: event.user,
      action: event.action,
      resource: 'card_data',
      timestamp: new Date(),
      ip: event.ip,
      result: event.result
    });
  }
  
  // Network segmentation check
  async verifyNetworkSegmentation() {
    const cardholderNetwork = '10.0.1.0/24';
    const currentNetwork = this.getCurrentNetwork();
    
    if (!this.isInNetwork(currentNetwork, cardholderNetwork)) {
      throw new Error('Access denied: Not in cardholder data environment');
    }
  }
}
```

### SOC 2 Compliance

```javascript
// soc2-compliance.js
class SOC2Compliance {
  // Access control monitoring
  async monitorAccessControl() {
    const report = {
      date: new Date(),
      controls: []
    };
    
    // CC6.1 - Logical and physical access controls
    report.controls.push({
      id: 'CC6.1',
      description: 'Logical access controls',
      status: await this.checkLogicalAccess(),
      evidence: await this.collectAccessEvidence()
    });
    
    // CC6.2 - New user access
    report.controls.push({
      id: 'CC6.2',
      description: 'Prior authorization for new access',
      status: await this.checkAccessApprovals(),
      evidence: await this.collectApprovalEvidence()
    });
    
    // CC6.3 - Access modifications
    report.controls.push({
      id: 'CC6.3',
      description: 'Access modification controls',
      status: await this.checkAccessModifications(),
      evidence: await this.collectModificationEvidence()
    });
    
    return report;
  }
  
  // Change management
  async logChange(change) {
    await ChangeLog.create({
      id: change.id,
      type: change.type,
      description: change.description,
      requestedBy: change.requestedBy,
      approvedBy: change.approvedBy,
      implementedBy: change.implementedBy,
      testResults: change.testResults,
      rollbackPlan: change.rollbackPlan,
      implementedAt: new Date()
    });
  }
}
```

## Incident Response

### Incident Response Plan

```yaml
# incident-response-plan.yaml
plan:
  phases:
    preparation:
      - maintain_incident_response_team
      - conduct_training
      - maintain_tools_and_resources
      - update_contact_lists
      
    identification:
      - monitor_security_events
      - analyze_alerts
      - determine_incident_scope
      - classify_severity
      
    containment:
      short_term:
        - isolate_affected_systems
        - preserve_evidence
        - prevent_spread
      long_term:
        - remove_threat
        - patch_vulnerabilities
        - strengthen_controls
        
    eradication:
      - remove_malware
      - close_vulnerabilities
      - improve_defenses
      
    recovery:
      - restore_systems
      - verify_functionality
      - monitor_for_reinfection
      
    lessons_learned:
      - conduct_postmortem
      - update_procedures
      - improve_controls
      - share_knowledge

severity_levels:
  critical:
    description: "Business critical impact"
    response_time: "15 minutes"
    escalation: "immediate"
    
  high:
    description: "Significant impact"
    response_time: "1 hour"
    escalation: "2 hours"
    
  medium:
    description: "Moderate impact"
    response_time: "4 hours"
    escalation: "8 hours"
    
  low:
    description: "Minimal impact"
    response_time: "24 hours"
    escalation: "48 hours"
```

### Incident Response Automation

```javascript
// incident-response.js
class IncidentResponseSystem {
  async handleIncident(incident) {
    // Create incident record
    const incidentRecord = await this.createIncident(incident);
    
    // Notify team
    await this.notifyResponseTeam(incidentRecord);
    
    // Execute automatic containment
    if (incident.severity === 'CRITICAL') {
      await this.executeContainment(incident);
    }
    
    // Collect evidence
    await this.collectEvidence(incident);
    
    // Create timeline
    await this.createTimeline(incident);
    
    return incidentRecord;
  }
  
  async executeContainment(incident) {
    const actions = [];
    
    switch (incident.type) {
      case 'BRUTE_FORCE':
        actions.push(
          this.blockIp(incident.sourceIp),
          this.disableAccount(incident.targetAccount),
          this.forceMfaReset(incident.targetAccount)
        );
        break;
        
      case 'DATA_BREACH':
        actions.push(
          this.isolateSystem(incident.affectedSystem),
          this.revokeApiKeys(incident.affectedServices),
          this.rotateCredentials(incident.affectedAccounts)
        );
        break;
        
      case 'MALWARE':
        actions.push(
          this.quarantineSystem(incident.infectedSystem),
          this.blockMaliciousDomains(incident.indicators),
          this.scanAllSystems(incident.malwareSignature)
        );
        break;
    }
    
    await Promise.all(actions);
  }
  
  async collectEvidence(incident) {
    const evidence = {
      logs: await this.collectLogs(incident.timeRange),
      network: await this.captureNetworkTraffic(incident.affectedSystems),
      memory: await this.dumpMemory(incident.affectedSystems),
      disk: await this.createDiskImage(incident.affectedSystems),
      metadata: {
        collectedAt: new Date(),
        collectedBy: 'automated-system',
        chainOfCustody: []
      }
    };
    
    // Store evidence securely
    await this.storeEvidence(incident.id, evidence);
    
    return evidence;
  }
}
```

## Security Best Practices

### Secure Coding Guidelines

```javascript
// secure-coding.js

// 1. Input Validation
const validateInput = (input, schema) => {
  const { error, value } = schema.validate(input, {
    abortEarly: false,
    stripUnknown: true
  });
  
  if (error) {
    throw new ValidationError(error.details);
  }
  
  return value;
};

// 2. SQL Injection Prevention
const safeQuery = async (query, params) => {
  // Always use parameterized queries
  const result = await db.query(query, params);
  return result;
};

// Bad
const unsafe = `SELECT * FROM users WHERE id = ${userId}`;

// Good
const safe = await safeQuery(
  'SELECT * FROM users WHERE id = $1',
  [userId]
);

// 3. XSS Prevention
const sanitizeHtml = (input) => {
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a'],
    ALLOWED_ATTR: ['href']
  });
};

// 4. Secure Random Generation
const generateSecureToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// 5. Timing Attack Prevention
const secureCompare = (a, b) => {
  if (a.length !== b.length) return false;
  
  return crypto.timingSafeEqual(
    Buffer.from(a),
    Buffer.from(b)
  );
};

// 6. Secure Headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'nonce-${nonce}'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));
```

### Security Checklist

```yaml
# security-checklist.yaml
deployment:
  - disable_debug_mode
  - remove_default_credentials
  - enable_security_headers
  - configure_tls
  - enable_firewall
  - configure_intrusion_detection
  - enable_audit_logging
  - configure_backup_encryption
  - test_incident_response
  - verify_access_controls

code_review:
  - check_input_validation
  - verify_authentication
  - review_authorization
  - check_encryption
  - verify_secure_communication
  - review_error_handling
  - check_logging_practices
  - verify_third_party_libraries

operations:
  - regular_security_updates
  - vulnerability_scanning
  - penetration_testing
  - security_monitoring
  - incident_response_drills
  - access_reviews
  - security_training
  - compliance_audits
```

## Next Steps

- [Operations Manual](OPERATIONS_MANUAL.md) - Security operations
- [API Reference](API_REFERENCE.md) - API security
- [Production Deployment](PRODUCTION_DEPLOYMENT.md) - Secure deployment

## Security Resources

- **OWASP Top 10**: [owasp.org/top10](https://owasp.org/top10)
- **CIS Benchmarks**: [cisecurity.org](https://cisecurity.org)
- **NIST Cybersecurity Framework**: [nist.gov/cyberframework](https://nist.gov/cyberframework)

## Support

- **Security Team**: security@mcp-platform.io
- **Security Hotline**: +1-xxx-xxx-xxxx
- **Bug Bounty**: [bugbounty.mcp-platform.io](https://bugbounty.mcp-platform.io)