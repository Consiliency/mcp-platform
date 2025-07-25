# MCP Platform Configuration Reference

Complete reference for all configuration options in the MCP Platform.

## Table of Contents

1. [Configuration Overview](#configuration-overview)
2. [Environment Variables](#environment-variables)
3. [Configuration Files](#configuration-files)
4. [Service Configuration](#service-configuration)
5. [Security Configuration](#security-configuration)
6. [Database Configuration](#database-configuration)
7. [Monitoring Configuration](#monitoring-configuration)
8. [Network Configuration](#network-configuration)
9. [Feature Flags](#feature-flags)
10. [Advanced Configuration](#advanced-configuration)

## Configuration Overview

The MCP Platform uses a hierarchical configuration system:

1. **Default Values** - Built-in defaults
2. **Configuration Files** - JSON/YAML configuration
3. **Environment Variables** - Override file settings
4. **Runtime Configuration** - Dynamic updates via API

### Configuration Precedence

```
Runtime Config > Environment Variables > Config Files > Defaults
```

### Configuration Locations

| Type | Location | Purpose |
|------|----------|---------|
| Global | `/etc/mcp/config.json` | System-wide settings |
| User | `~/.mcp/config.json` | User-specific settings |
| Project | `./mcp.config.json` | Project-specific settings |
| Environment | `.env` | Environment variables |

## Environment Variables

### Core Settings

```bash
# Platform Settings
MCP_ENV=production              # Environment: development, staging, production
MCP_HOME=/opt/mcp-platform      # Installation directory
MCP_DATA_DIR=/var/lib/mcp       # Data directory
MCP_LOG_DIR=/var/log/mcp        # Log directory
MCP_CONFIG_DIR=/etc/mcp         # Configuration directory

# API Settings
MCP_API_HOST=0.0.0.0           # API bind address
MCP_API_PORT=8080              # API port
MCP_API_BASE_PATH=/api/v1      # API base path
MCP_API_TIMEOUT=30s            # API request timeout

# Service Discovery
MCP_REGISTRY_URL=http://localhost:8500  # Service registry URL
MCP_DISCOVERY_INTERVAL=30s              # Service discovery interval
```

### Authentication

```bash
# JWT Configuration
JWT_SECRET=your-secret-key              # JWT signing secret
JWT_PUBLIC_KEY_PATH=/etc/mcp/jwt.pub   # RSA public key path
JWT_PRIVATE_KEY_PATH=/etc/mcp/jwt.pem  # RSA private key path
JWT_ALGORITHM=RS256                     # JWT algorithm
JWT_ACCESS_TOKEN_EXPIRY=15m            # Access token expiry
JWT_REFRESH_TOKEN_EXPIRY=7d            # Refresh token expiry

# OAuth2 Providers
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=https://api.example.com/auth/google/callback

GITHUB_CLIENT_ID=your-client-id
GITHUB_CLIENT_SECRET=your-client-secret
GITHUB_REDIRECT_URI=https://api.example.com/auth/github/callback

# API Keys
API_KEY_SALT=your-salt-value           # Salt for API key hashing
API_KEY_LENGTH=32                      # API key length
API_KEY_PREFIX=mcp_                    # API key prefix
```

### Database

```bash
# PostgreSQL
DATABASE_URL=postgresql://user:pass@localhost:5432/mcp
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=20
DATABASE_POOL_IDLE_TIMEOUT=30s
DATABASE_STATEMENT_TIMEOUT=30s
DATABASE_SSL_MODE=require              # disable, require, verify-ca, verify-full

# MongoDB
MONGODB_URL=mongodb://localhost:27017/mcp
MONGODB_POOL_SIZE=10
MONGODB_CONNECT_TIMEOUT=10s
MONGODB_SERVER_SELECTION_TIMEOUT=30s

# Redis
REDIS_URL=redis://localhost:6379/0
REDIS_PASSWORD=your-redis-password
REDIS_POOL_SIZE=10
REDIS_CONNECT_TIMEOUT=5s
REDIS_READ_TIMEOUT=3s
REDIS_WRITE_TIMEOUT=3s
```

### Security

```bash
# TLS/SSL
TLS_ENABLED=true
TLS_CERT_PATH=/etc/mcp/tls/cert.pem
TLS_KEY_PATH=/etc/mcp/tls/key.pem
TLS_CA_PATH=/etc/mcp/tls/ca.pem
TLS_MIN_VERSION=1.2
TLS_CIPHERS=TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256,TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384

# CORS
CORS_ENABLED=true
CORS_ALLOWED_ORIGINS=https://app.example.com,https://dashboard.example.com
CORS_ALLOWED_METHODS=GET,POST,PUT,DELETE,OPTIONS
CORS_ALLOWED_HEADERS=Content-Type,Authorization,X-API-Key
CORS_MAX_AGE=86400

# Rate Limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_WINDOW=60s
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_REDIS_URL=redis://localhost:6379/1
```

### Monitoring

```bash
# Logging
LOG_LEVEL=info                         # debug, info, warn, error
LOG_FORMAT=json                        # json, text, logfmt
LOG_OUTPUT=stdout                      # stdout, file, syslog
LOG_FILE_PATH=/var/log/mcp/app.log
LOG_FILE_MAX_SIZE=100M
LOG_FILE_MAX_AGE=30d
LOG_FILE_MAX_BACKUPS=10

# Metrics
METRICS_ENABLED=true
METRICS_PORT=9090
METRICS_PATH=/metrics
PROMETHEUS_PUSHGATEWAY=http://pushgateway:9091

# Tracing
TRACING_ENABLED=true
TRACING_PROVIDER=jaeger               # jaeger, zipkin, datadog
JAEGER_AGENT_HOST=localhost
JAEGER_AGENT_PORT=6831
TRACING_SAMPLE_RATE=0.1

# Error Tracking
SENTRY_ENABLED=true
SENTRY_DSN=https://key@sentry.io/project
SENTRY_ENVIRONMENT=production
SENTRY_SAMPLE_RATE=1.0
SENTRY_TRACES_SAMPLE_RATE=0.1
```

### Service-Specific

```bash
# Filesystem Service
FILESYSTEM_ROOT=/data
FILESYSTEM_MAX_FILE_SIZE=100M
FILESYSTEM_ALLOWED_EXTENSIONS=.txt,.json,.yml,.yaml
FILESYSTEM_BLOCKED_PATHS=/etc,/root,/sys,/proc

# Git Service
GIT_REPOS_PATH=/var/lib/mcp/git
GIT_MAX_REPO_SIZE=1G
GIT_ALLOW_FORCE_PUSH=false
GIT_DEFAULT_BRANCH=main

# Browser Service
BROWSER_HEADLESS=true
BROWSER_TIMEOUT=30s
BROWSER_MAX_PAGES=10
BROWSER_USER_AGENT=Mozilla/5.0 MCP/1.0
```

## Configuration Files

### Main Configuration (mcp.config.json)

```json
{
  "version": "1.0",
  "platform": {
    "name": "MCP Platform",
    "environment": "production",
    "timezone": "UTC",
    "locale": "en-US"
  },
  "api": {
    "host": "0.0.0.0",
    "port": 8080,
    "basePath": "/api/v1",
    "timeout": "30s",
    "maxRequestSize": "10MB",
    "compression": {
      "enabled": true,
      "level": 6
    }
  },
  "auth": {
    "providers": ["local", "oauth2", "apikey"],
    "jwt": {
      "algorithm": "RS256",
      "accessTokenExpiry": "15m",
      "refreshTokenExpiry": "7d",
      "issuer": "mcp-platform",
      "audience": "mcp-api"
    },
    "session": {
      "secret": "session-secret",
      "maxAge": "24h",
      "httpOnly": true,
      "secure": true,
      "sameSite": "strict"
    },
    "passwordPolicy": {
      "minLength": 8,
      "requireUppercase": true,
      "requireLowercase": true,
      "requireNumbers": true,
      "requireSpecialChars": true
    }
  },
  "database": {
    "postgres": {
      "host": "localhost",
      "port": 5432,
      "database": "mcp",
      "username": "mcp",
      "password": "${DATABASE_PASSWORD}",
      "pool": {
        "min": 2,
        "max": 20,
        "idleTimeout": "30s"
      },
      "ssl": {
        "enabled": true,
        "mode": "require"
      }
    },
    "redis": {
      "host": "localhost",
      "port": 6379,
      "database": 0,
      "password": "${REDIS_PASSWORD}",
      "pool": {
        "size": 10,
        "minIdle": 2
      }
    }
  },
  "services": {
    "defaults": {
      "healthCheck": {
        "enabled": true,
        "interval": "30s",
        "timeout": "10s",
        "retries": 3
      },
      "resources": {
        "cpu": {
          "request": "100m",
          "limit": "1000m"
        },
        "memory": {
          "request": "128Mi",
          "limit": "1Gi"
        }
      }
    },
    "registry": {
      "url": "http://localhost:8500",
      "datacenter": "dc1",
      "token": "${CONSUL_TOKEN}"
    }
  },
  "security": {
    "tls": {
      "enabled": true,
      "certPath": "/etc/mcp/tls/cert.pem",
      "keyPath": "/etc/mcp/tls/key.pem",
      "caPath": "/etc/mcp/tls/ca.pem",
      "minVersion": "1.2",
      "cipherSuites": [
        "TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256",
        "TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384"
      ]
    },
    "cors": {
      "enabled": true,
      "allowedOrigins": ["https://app.example.com"],
      "allowedMethods": ["GET", "POST", "PUT", "DELETE"],
      "allowedHeaders": ["Content-Type", "Authorization"],
      "exposedHeaders": ["X-RateLimit-Limit", "X-RateLimit-Remaining"],
      "maxAge": 86400,
      "credentials": true
    },
    "headers": {
      "X-Frame-Options": "DENY",
      "X-Content-Type-Options": "nosniff",
      "X-XSS-Protection": "1; mode=block",
      "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
      "Content-Security-Policy": "default-src 'self'"
    }
  },
  "monitoring": {
    "logging": {
      "level": "info",
      "format": "json",
      "outputs": [
        {
          "type": "console",
          "format": "text"
        },
        {
          "type": "file",
          "path": "/var/log/mcp/app.log",
          "maxSize": "100MB",
          "maxAge": "30d",
          "maxBackups": 10
        }
      ]
    },
    "metrics": {
      "enabled": true,
      "port": 9090,
      "path": "/metrics",
      "collectors": ["process", "golang", "custom"]
    },
    "tracing": {
      "enabled": true,
      "provider": "jaeger",
      "endpoint": "http://jaeger:14268/api/traces",
      "sampleRate": 0.1
    }
  },
  "features": {
    "flags": {
      "newUI": {
        "enabled": false,
        "rollout": 0
      },
      "advancedMetrics": {
        "enabled": true,
        "rollout": 100
      }
    }
  }
}
```

### Service Profiles (profiles/production.yml)

```yaml
name: production
description: Production service configuration
version: 1.0

services:
  - id: filesystem-mcp
    enabled: true
    replicas: 3
    image: mcp-platform/filesystem:latest
    environment:
      NODE_ENV: production
      LOG_LEVEL: info
    resources:
      cpu:
        request: 500m
        limit: 2000m
      memory:
        request: 512Mi
        limit: 2Gi
    healthCheck:
      liveness:
        httpGet:
          path: /health/live
          port: 3000
        initialDelaySeconds: 30
        periodSeconds: 10
      readiness:
        httpGet:
          path: /health/ready
          port: 3000
        initialDelaySeconds: 5
        periodSeconds: 5
    autoscaling:
      enabled: true
      minReplicas: 3
      maxReplicas: 10
      targetCPU: 70
      targetMemory: 80

  - id: postgres-mcp
    enabled: true
    replicas: 1
    image: mcp-platform/postgres:latest
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    resources:
      cpu:
        request: 1000m
        limit: 4000m
      memory:
        request: 2Gi
        limit: 8Gi
    persistence:
      enabled: true
      size: 100Gi
      storageClass: ssd-retain

settings:
  restartPolicy: unless-stopped
  networkMode: bridge
  logging:
    driver: json-file
    options:
      max-size: "100m"
      max-file: "10"
```

### Docker Compose Override (docker-compose.override.yml)

```yaml
version: '3.8'

x-logging: &default-logging
  driver: "json-file"
  options:
    max-size: "100m"
    max-file: "10"

services:
  traefik:
    image: traefik:2.10
    command:
      - "--api.dashboard=true"
      - "--providers.docker=true"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
      - "--certificatesresolvers.letsencrypt.acme.tlschallenge=true"
      - "--certificatesresolvers.letsencrypt.acme.email=${ACME_EMAIL}"
      - "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"
    ports:
      - "80:80"
      - "443:443"
      - "8080:8080"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./letsencrypt:/letsencrypt
    logging: *default-logging
    restart: unless-stopped

  filesystem-mcp:
    environment:
      - NODE_ENV=${MCP_ENV:-production}
      - LOG_LEVEL=${LOG_LEVEL:-info}
      - JWT_SECRET=${JWT_SECRET}
    volumes:
      - ./data:/data
    deploy:
      replicas: ${FILESYSTEM_REPLICAS:-3}
      update_config:
        parallelism: 1
        delay: 10s
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
    logging: *default-logging
```

## Service Configuration

### Service Definition Schema

```yaml
# Service configuration schema
service:
  id: string                    # Unique service identifier
  name: string                  # Display name
  description: string           # Service description
  version: string              # Service version
  enabled: boolean             # Enable/disable service
  
  # Container configuration
  image: string                # Docker image
  command: [string]            # Override command
  entrypoint: [string]        # Override entrypoint
  workingDir: string          # Working directory
  
  # Environment
  environment:                 # Environment variables
    KEY: value
    
  # Resources
  resources:
    cpu:
      request: string          # CPU request (e.g., "100m")
      limit: string            # CPU limit (e.g., "1000m")
    memory:
      request: string          # Memory request (e.g., "128Mi")
      limit: string            # Memory limit (e.g., "1Gi")
      
  # Networking
  ports:
    - containerPort: number    # Container port
      hostPort: number         # Host port
      protocol: string         # TCP/UDP
      
  # Health checks
  healthCheck:
    endpoint: string           # Health endpoint
    interval: string           # Check interval
    timeout: string            # Check timeout
    retries: number            # Retry count
    
  # Dependencies
  dependencies: [string]       # Service dependencies
  
  # Volumes
  volumes:
    - source: string           # Volume source
      target: string           # Mount target
      readOnly: boolean        # Read-only mount
```

### Service-Specific Configurations

#### Filesystem Service

```json
{
  "filesystem": {
    "rootPath": "/data",
    "maxFileSize": "100MB",
    "maxUploadSize": "10MB",
    "allowedOperations": ["read", "write", "delete", "list"],
    "blockedPaths": ["/etc", "/root", "/sys", "/proc"],
    "allowedExtensions": [".txt", ".json", ".yml", ".yaml", ".md"],
    "permissions": {
      "defaultFileMode": "0644",
      "defaultDirMode": "0755"
    },
    "quotas": {
      "maxFiles": 10000,
      "maxTotalSize": "10GB"
    }
  }
}
```

#### Git Service

```json
{
  "git": {
    "reposPath": "/var/lib/mcp/git",
    "maxRepoSize": "1GB",
    "defaultBranch": "main",
    "allowedOperations": ["clone", "pull", "push", "commit"],
    "hooks": {
      "preReceive": "/etc/mcp/hooks/pre-receive",
      "postReceive": "/etc/mcp/hooks/post-receive"
    },
    "limits": {
      "maxFileSize": "100MB",
      "maxCommitSize": "500MB",
      "maxBranches": 100,
      "maxTags": 1000
    }
  }
}
```

#### Database Services

```json
{
  "postgres": {
    "version": "14",
    "dataDir": "/var/lib/postgresql/data",
    "config": {
      "max_connections": 200,
      "shared_buffers": "256MB",
      "effective_cache_size": "1GB",
      "maintenance_work_mem": "64MB",
      "checkpoint_completion_target": 0.9,
      "wal_buffers": "16MB",
      "default_statistics_target": 100,
      "random_page_cost": 1.1,
      "effective_io_concurrency": 200
    },
    "backup": {
      "enabled": true,
      "schedule": "0 2 * * *",
      "retention": "7d"
    }
  }
}
```

## Security Configuration

### Authentication Configuration

```yaml
auth:
  # Local authentication
  local:
    enabled: true
    passwordPolicy:
      minLength: 8
      maxLength: 128
      requireUppercase: true
      requireLowercase: true
      requireNumbers: true
      requireSpecialChars: true
      prohibitedPasswords:
        - password
        - 12345678
        - qwerty
    lockout:
      enabled: true
      maxAttempts: 5
      duration: 15m
      
  # JWT configuration
  jwt:
    algorithm: RS256
    publicKey: |
      -----BEGIN PUBLIC KEY-----
      MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...
      -----END PUBLIC KEY-----
    privateKey: ${JWT_PRIVATE_KEY}
    issuer: mcp-platform
    audience: mcp-api
    accessTokenExpiry: 15m
    refreshTokenExpiry: 7d
    
  # OAuth2 providers
  oauth2:
    google:
      enabled: true
      clientId: ${GOOGLE_CLIENT_ID}
      clientSecret: ${GOOGLE_CLIENT_SECRET}
      redirectUri: https://api.example.com/auth/google/callback
      scope:
        - openid
        - email
        - profile
    github:
      enabled: true
      clientId: ${GITHUB_CLIENT_ID}
      clientSecret: ${GITHUB_CLIENT_SECRET}
      redirectUri: https://api.example.com/auth/github/callback
      scope:
        - user
        - user:email
```

### Authorization Configuration

```yaml
authorization:
  # RBAC configuration
  rbac:
    enabled: true
    roles:
      admin:
        description: Full system access
        permissions:
          - "*"
      developer:
        description: Development access
        permissions:
          - services:*
          - logs:read
          - metrics:read
      operator:
        description: Operations access
        permissions:
          - services:read
          - services:restart
          - logs:*
          - metrics:*
          - backups:*
      viewer:
        description: Read-only access
        permissions:
          - services:read
          - logs:read
          - metrics:read
          
  # ABAC policies
  abac:
    enabled: true
    policies:
      - name: service-owner-policy
        effect: allow
        actions:
          - services:*
        resources:
          - services/${resource.owner}
        conditions:
          - type: StringEquals
            key: user.id
            value: ${resource.owner}
```

### Network Security

```yaml
network:
  # Firewall rules
  firewall:
    enabled: true
    defaultPolicy: deny
    rules:
      - name: allow-http
        protocol: tcp
        port: 80
        source: 0.0.0.0/0
        action: allow
        
      - name: allow-https
        protocol: tcp
        port: 443
        source: 0.0.0.0/0
        action: allow
        
      - name: allow-internal
        protocol: all
        source: 10.0.0.0/8
        action: allow
        
  # Rate limiting
  rateLimiting:
    enabled: true
    default:
      windowMs: 60000
      max: 100
    endpoints:
      /api/v1/auth/login:
        windowMs: 300000
        max: 5
      /api/v1/services:
        windowMs: 60000
        max: 1000
    bypass:
      - 10.0.0.0/8
      - 192.168.0.0/16
```

## Database Configuration

### PostgreSQL Configuration

```yaml
postgres:
  connection:
    host: ${DATABASE_HOST:-localhost}
    port: ${DATABASE_PORT:-5432}
    database: ${DATABASE_NAME:-mcp}
    username: ${DATABASE_USER:-mcp}
    password: ${DATABASE_PASSWORD}
    sslMode: ${DATABASE_SSL_MODE:-require}
    
  pool:
    min: 2
    max: 20
    idleTimeout: 30s
    connectionTimeout: 10s
    statementTimeout: 30s
    
  migrations:
    enabled: true
    directory: /etc/mcp/migrations
    table: schema_migrations
    
  backup:
    enabled: true
    schedule: "0 2 * * *"
    retention: 7
    s3:
      bucket: mcp-backups
      prefix: postgres/
```

### Redis Configuration

```yaml
redis:
  connection:
    host: ${REDIS_HOST:-localhost}
    port: ${REDIS_PORT:-6379}
    password: ${REDIS_PASSWORD}
    database: ${REDIS_DATABASE:-0}
    tls:
      enabled: false
      cert: /etc/mcp/redis/cert.pem
      key: /etc/mcp/redis/key.pem
      ca: /etc/mcp/redis/ca.pem
      
  pool:
    size: 10
    minIdle: 2
    maxRetries: 3
    
  cluster:
    enabled: false
    nodes:
      - redis-1:6379
      - redis-2:6379
      - redis-3:6379
```

### MongoDB Configuration

```yaml
mongodb:
  connection:
    uri: ${MONGODB_URI:-mongodb://localhost:27017/mcp}
    options:
      authSource: admin
      replicaSet: rs0
      ssl: true
      sslValidate: true
      
  pool:
    size: 10
    minSize: 2
    maxIdleTime: 60s
    
  indexes:
    - collection: services
      keys:
        id: 1
      options:
        unique: true
    - collection: users
      keys:
        email: 1
      options:
        unique: true
```

## Monitoring Configuration

### Logging Configuration

```yaml
logging:
  level: ${LOG_LEVEL:-info}
  format: ${LOG_FORMAT:-json}
  
  outputs:
    - type: console
      format: text
      level: info
      
    - type: file
      path: /var/log/mcp/app.log
      format: json
      level: debug
      rotation:
        maxSize: 100MB
        maxAge: 30d
        maxBackups: 10
        compress: true
        
    - type: elasticsearch
      url: http://elasticsearch:9200
      index: mcp-logs-%{+yyyy.MM.dd}
      level: info
      
  filters:
    - type: sanitize
      fields:
        - password
        - token
        - secret
        - key
```

### Metrics Configuration

```yaml
metrics:
  enabled: true
  port: 9090
  path: /metrics
  
  collectors:
    - name: process
      enabled: true
      
    - name: golang
      enabled: true
      
    - name: http
      enabled: true
      buckets: [0.1, 0.3, 1.2, 5.0]
      
    - name: database
      enabled: true
      
  exporters:
    prometheus:
      enabled: true
      pushgateway:
        url: http://pushgateway:9091
        interval: 10s
        
    datadog:
      enabled: false
      apiKey: ${DATADOG_API_KEY}
      site: datadoghq.com
```

### Tracing Configuration

```yaml
tracing:
  enabled: true
  provider: jaeger
  serviceName: mcp-platform
  
  sampling:
    type: probabilistic
    param: 0.1
    
  jaeger:
    agentHost: ${JAEGER_AGENT_HOST:-localhost}
    agentPort: ${JAEGER_AGENT_PORT:-6831}
    collectorEndpoint: http://jaeger:14268/api/traces
    
  propagation:
    format: jaeger
    baggage:
      enabled: true
      prefix: mcp-
```

## Network Configuration

### Load Balancer Configuration

```yaml
loadBalancer:
  type: traefik
  
  entryPoints:
    web:
      address: :80
      http:
        redirections:
          entryPoint:
            to: websecure
            scheme: https
            
    websecure:
      address: :443
      http:
        tls:
          certResolver: letsencrypt
          
  providers:
    docker:
      endpoint: unix:///var/run/docker.sock
      exposedByDefault: false
      
  certificatesResolvers:
    letsencrypt:
      acme:
        email: ${ACME_EMAIL}
        storage: /letsencrypt/acme.json
        httpChallenge:
          entryPoint: web
```

### Service Mesh Configuration

```yaml
serviceMesh:
  enabled: false
  provider: istio
  
  istio:
    namespace: istio-system
    meshConfig:
      defaultConfig:
        proxyStatsMatcher:
          inclusionRegexps:
            - ".*outlier_detection.*"
            - ".*circuit_breakers.*"
      accessLogFile: /dev/stdout
      
  trafficManagement:
    timeout: 30s
    retries:
      attempts: 3
      perTryTimeout: 10s
      retryOn: 5xx,reset,connect-failure,refused-stream
```

## Feature Flags

### Feature Flag Configuration

```json
{
  "features": {
    "provider": "local",
    "refreshInterval": "5m",
    
    "flags": {
      "newUI": {
        "enabled": false,
        "description": "New dashboard UI",
        "rolloutPercentage": 0,
        "enabledFor": ["beta-users"],
        "metadata": {
          "owner": "frontend-team",
          "jiraTicket": "MCP-1234"
        }
      },
      
      "advancedMetrics": {
        "enabled": true,
        "description": "Advanced metrics collection",
        "rolloutPercentage": 100,
        "enabledFor": [],
        "conditions": {
          "environment": ["production", "staging"]
        }
      },
      
      "experimentalAPI": {
        "enabled": false,
        "description": "Experimental API endpoints",
        "rolloutPercentage": 10,
        "enabledFor": ["developers"],
        "conditions": {
          "header": {
            "X-Beta-Features": "true"
          }
        }
      }
    }
  }
}
```

### Remote Feature Flag Provider

```yaml
features:
  provider: launchdarkly
  
  launchdarkly:
    sdkKey: ${LAUNCHDARKLY_SDK_KEY}
    environment: production
    
  fallback:
    enabled: true
    flags:
      criticalFeature:
        enabled: true
```

## Advanced Configuration

### Performance Tuning

```yaml
performance:
  # Connection pooling
  connectionPool:
    http:
      maxIdleConns: 100
      maxIdleConnsPerHost: 10
      idleConnTimeout: 90s
      
  # Caching
  cache:
    provider: redis
    ttl: 1h
    maxSize: 1000
    evictionPolicy: lru
    
  # Request handling
  requests:
    maxConcurrent: 1000
    timeout: 30s
    maxBodySize: 10MB
    
  # Worker pools
  workers:
    background:
      size: 10
      queueSize: 1000
    async:
      size: 20
      queueSize: 5000
```

### Cluster Configuration

```yaml
cluster:
  enabled: true
  mode: active-active
  
  nodes:
    - id: node-1
      address: 10.0.1.10:7946
      role: leader
    - id: node-2
      address: 10.0.1.11:7946
      role: follower
    - id: node-3
      address: 10.0.1.12:7946
      role: follower
      
  consensus:
    algorithm: raft
    electionTimeout: 150ms
    heartbeatInterval: 50ms
    
  replication:
    mode: async
    maxLag: 1s
```

### Plugin Configuration

```yaml
plugins:
  enabled: true
  directory: /etc/mcp/plugins
  
  registry:
    - name: custom-auth
      version: 1.0.0
      enabled: true
      config:
        endpoint: https://auth.example.com
        
    - name: audit-logger
      version: 2.1.0
      enabled: true
      config:
        output: syslog
        level: info
```

## Configuration Validation

### Schema Validation

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["version", "platform", "api"],
  "properties": {
    "version": {
      "type": "string",
      "pattern": "^\\d+\\.\\d+$"
    },
    "platform": {
      "type": "object",
      "required": ["name", "environment"],
      "properties": {
        "name": {"type": "string"},
        "environment": {
          "type": "string",
          "enum": ["development", "staging", "production"]
        }
      }
    }
  }
}
```

### Validation Rules

```yaml
validation:
  rules:
    - field: api.port
      type: number
      min: 1
      max: 65535
      
    - field: auth.jwt.accessTokenExpiry
      type: duration
      min: 1m
      max: 24h
      
    - field: database.pool.max
      type: number
      min: 1
      max: 1000
      
    - field: security.tls.minVersion
      type: string
      enum: ["1.0", "1.1", "1.2", "1.3"]
```

## Configuration Management

### Dynamic Configuration Updates

```bash
# Update configuration via API
curl -X PUT http://localhost:8080/api/v1/config/log.level \
  -H "Authorization: Bearer <token>" \
  -d '{"value": "debug"}'

# Reload configuration
mcp config reload

# Validate configuration
mcp config validate --file mcp.config.json
```

### Configuration Backup

```bash
# Backup current configuration
mcp config backup --name "config-$(date +%Y%m%d)"

# List configuration backups
mcp config backup list

# Restore configuration
mcp config restore --backup config-20250724
```

## Best Practices

1. **Use Environment Variables for Secrets**
   - Never hardcode passwords or API keys
   - Use secret management systems

2. **Version Control Configuration**
   - Track configuration changes in Git
   - Use separate files for different environments

3. **Validate Before Deploying**
   - Always validate configuration changes
   - Test in staging before production

4. **Monitor Configuration Changes**
   - Audit all configuration updates
   - Set up alerts for critical changes

5. **Document Custom Settings**
   - Document all non-default values
   - Explain the reasoning for custom settings

## Next Steps

- [User Guide](USER_GUIDE.md) - Using configuration
- [Operations Manual](OPERATIONS_MANUAL.md) - Managing configuration
- [Security Guide](SECURITY_GUIDE.md) - Secure configuration

---

*Last updated: July 2025 | Version: 5.0*