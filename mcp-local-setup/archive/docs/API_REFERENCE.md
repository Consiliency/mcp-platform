# MCP Platform API Reference

Comprehensive API documentation for the MCP Platform REST and WebSocket APIs.

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Core API Endpoints](#core-api-endpoints)
4. [Service Management](#service-management)
5. [Configuration API](#configuration-api)
6. [Health & Monitoring](#health--monitoring)
7. [Backup & Recovery](#backup--recovery)
8. [User Management](#user-management)
9. [WebSocket API](#websocket-api)
10. [Rate Limiting](#rate-limiting)
11. [Error Handling](#error-handling)
12. [SDK Reference](#sdk-reference)

## Overview

### Base URLs

| Environment | URL |
|-------------|-----|
| Local Development | `http://localhost:8080/api/v1` |
| Staging | `https://staging-api.mcp-platform.io/api/v1` |
| Production | `https://api.mcp-platform.io/api/v1` |

### API Versioning

The API uses URL-based versioning. Current version: `v1`

```
https://api.mcp-platform.io/api/v1/services
```

### Request Headers

| Header | Required | Description |
|--------|----------|-------------|
| `Content-Type` | Yes* | `application/json` for request bodies |
| `Accept` | No | `application/json` (default) |
| `Authorization` | Yes | `Bearer <token>` or API key |
| `X-API-Key` | Yes** | Alternative to Authorization header |
| `X-Request-ID` | No | Client-generated request ID for tracking |
| `X-API-Version` | No | Override API version (not recommended) |

*Required for POST/PUT/PATCH requests
**Use either Authorization or X-API-Key, not both

### Response Format

All responses follow a consistent JSON structure:

```json
{
  "data": { ... },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2025-07-24T12:00:00Z",
    "version": "v1"
  }
}
```

## Authentication

### JWT Authentication

#### Login

```http
POST /api/v1/auth/login
```

**Request:**
```json
{
  "username": "admin@example.com",
  "password": "secure-password",
  "mfaCode": "123456"  // Optional, if MFA enabled
}
```

**Response:**
```json
{
  "data": {
    "accessToken": "eyJhbGciOiJSUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJSUzI1NiIs...",
    "tokenType": "Bearer",
    "expiresIn": 900,
    "user": {
      "id": "user_123",
      "email": "admin@example.com",
      "roles": ["admin"],
      "permissions": ["*"]
    }
  }
}
```

#### Refresh Token

```http
POST /api/v1/auth/refresh
```

**Request:**
```json
{
  "refreshToken": "eyJhbGciOiJSUzI1NiIs..."
}
```

**Response:**
```json
{
  "data": {
    "accessToken": "eyJhbGciOiJSUzI1NiIs...",
    "expiresIn": 900
  }
}
```

#### Logout

```http
POST /api/v1/auth/logout
Authorization: Bearer <token>
```

**Response:**
```json
{
  "data": {
    "message": "Successfully logged out"
  }
}
```

### OAuth2 Authentication

#### Initiate OAuth Flow

```http
GET /api/v1/auth/oauth/{provider}
```

Providers: `google`, `github`, `microsoft`

**Response:** 302 Redirect to provider

#### OAuth Callback

```http
GET /api/v1/auth/oauth/{provider}/callback?code={code}&state={state}
```

**Response:** 302 Redirect with tokens in query params

### API Key Authentication

#### Generate API Key

```http
POST /api/v1/auth/api-keys
Authorization: Bearer <token>
```

**Request:**
```json
{
  "name": "Production API Key",
  "permissions": ["services:read", "services:write"],
  "expiresIn": 2592000  // 30 days in seconds
}
```

**Response:**
```json
{
  "data": {
    "id": "key_abc123",
    "key": "mcp_1234567890abcdef_secretkey",  // Only shown once
    "name": "Production API Key",
    "permissions": ["services:read", "services:write"],
    "createdAt": "2025-07-24T12:00:00Z",
    "expiresAt": "2025-08-23T12:00:00Z"
  }
}
```

#### List API Keys

```http
GET /api/v1/auth/api-keys
Authorization: Bearer <token>
```

**Response:**
```json
{
  "data": [
    {
      "id": "key_abc123",
      "name": "Production API Key",
      "lastUsed": "2025-07-24T10:00:00Z",
      "createdAt": "2025-07-23T12:00:00Z",
      "expiresAt": "2025-08-23T12:00:00Z"
    }
  ]
}
```

#### Revoke API Key

```http
DELETE /api/v1/auth/api-keys/{keyId}
Authorization: Bearer <token>
```

## Core API Endpoints

### Platform Information

```http
GET /api/v1/info
```

**Response:**
```json
{
  "data": {
    "version": "5.0.0",
    "build": "2025.07.24.001",
    "environment": "production",
    "features": {
      "auth": ["jwt", "oauth2", "apiKey"],
      "services": ["docker", "kubernetes"],
      "monitoring": ["prometheus", "grafana"]
    }
  }
}
```

### Platform Statistics

```http
GET /api/v1/stats
Authorization: Bearer <token>
```

**Response:**
```json
{
  "data": {
    "services": {
      "total": 15,
      "running": 13,
      "stopped": 2
    },
    "resources": {
      "cpu": {
        "usage": 45.2,
        "limit": 100,
        "unit": "percent"
      },
      "memory": {
        "usage": 8192,
        "limit": 16384,
        "unit": "MB"
      }
    },
    "requests": {
      "total": 1234567,
      "rate": 123.4,
      "errors": 0.01
    }
  }
}
```

## Service Management

### List Services

```http
GET /api/v1/services
Authorization: Bearer <token>
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | Filter by status: `running`, `stopped`, `error` |
| `category` | string | Filter by category |
| `search` | string | Search in name/description |
| `page` | integer | Page number (default: 1) |
| `limit` | integer | Items per page (default: 20, max: 100) |
| `sort` | string | Sort field: `name`, `created`, `updated` |
| `order` | string | Sort order: `asc`, `desc` |

**Response:**
```json
{
  "data": [
    {
      "id": "filesystem-mcp",
      "name": "Filesystem MCP",
      "description": "File system operations service",
      "category": "storage",
      "status": "running",
      "version": "1.2.0",
      "image": "mcp-platform/filesystem:1.2.0",
      "port": 3001,
      "health": {
        "status": "healthy",
        "lastCheck": "2025-07-24T12:00:00Z"
      },
      "resources": {
        "cpu": {
          "usage": 10.5,
          "limit": 100
        },
        "memory": {
          "usage": 256,
          "limit": 1024
        }
      },
      "createdAt": "2025-07-01T12:00:00Z",
      "updatedAt": "2025-07-24T10:00:00Z"
    }
  ],
  "meta": {
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 15,
      "pages": 1
    }
  }
}
```

### Get Service Details

```http
GET /api/v1/services/{serviceId}
Authorization: Bearer <token>
```

**Response:**
```json
{
  "data": {
    "id": "filesystem-mcp",
    "name": "Filesystem MCP",
    "description": "File system operations service",
    "category": "storage",
    "status": "running",
    "version": "1.2.0",
    "image": "mcp-platform/filesystem:1.2.0",
    "port": 3001,
    "environment": {
      "NODE_ENV": "production",
      "LOG_LEVEL": "info"
    },
    "labels": {
      "app": "mcp-platform",
      "component": "filesystem"
    },
    "volumes": [
      {
        "source": "/data",
        "target": "/app/data",
        "readOnly": false
      }
    ],
    "networks": ["mcp-network"],
    "dependencies": ["redis", "postgres"],
    "health": {
      "status": "healthy",
      "checks": {
        "readiness": "passing",
        "liveness": "passing"
      },
      "lastCheck": "2025-07-24T12:00:00Z"
    },
    "metrics": {
      "requests": {
        "total": 123456,
        "rate": 12.3,
        "errors": 0.01
      },
      "latency": {
        "p50": 10,
        "p95": 50,
        "p99": 100
      }
    }
  }
}
```

### Create Service

```http
POST /api/v1/services
Authorization: Bearer <token>
```

**Request:**
```json
{
  "id": "custom-mcp",
  "name": "Custom MCP Service",
  "description": "Custom service for specific functionality",
  "category": "custom",
  "image": "myregistry/custom-mcp:latest",
  "port": 3010,
  "environment": {
    "NODE_ENV": "production",
    "API_KEY": "secret-key"
  },
  "labels": {
    "team": "platform",
    "owner": "john@example.com"
  },
  "resources": {
    "cpu": {
      "limit": 1000,
      "request": 500
    },
    "memory": {
      "limit": 1024,
      "request": 512
    }
  },
  "healthCheck": {
    "endpoint": "/health",
    "interval": 30,
    "timeout": 10,
    "retries": 3
  }
}
```

### Update Service

```http
PUT /api/v1/services/{serviceId}
Authorization: Bearer <token>
```

**Request:**
```json
{
  "image": "myregistry/custom-mcp:1.2.0",
  "environment": {
    "LOG_LEVEL": "debug"
  },
  "resources": {
    "memory": {
      "limit": 2048
    }
  }
}
```

### Delete Service

```http
DELETE /api/v1/services/{serviceId}
Authorization: Bearer <token>
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `force` | boolean | Force delete without graceful shutdown |
| `cleanup` | boolean | Remove all associated data |

### Service Actions

#### Start Service

```http
POST /api/v1/services/{serviceId}/start
Authorization: Bearer <token>
```

#### Stop Service

```http
POST /api/v1/services/{serviceId}/stop
Authorization: Bearer <token>
```

**Request:**
```json
{
  "graceful": true,
  "timeout": 30
}
```

#### Restart Service

```http
POST /api/v1/services/{serviceId}/restart
Authorization: Bearer <token>
```

#### Scale Service

```http
POST /api/v1/services/{serviceId}/scale
Authorization: Bearer <token>
```

**Request:**
```json
{
  "replicas": 3
}
```

### Service Logs

```http
GET /api/v1/services/{serviceId}/logs
Authorization: Bearer <token>
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `lines` | integer | Number of lines to return (default: 100) |
| `since` | string | Show logs since timestamp |
| `until` | string | Show logs until timestamp |
| `follow` | boolean | Stream logs in real-time |
| `timestamps` | boolean | Include timestamps |

**Response:**
```json
{
  "data": {
    "logs": [
      {
        "timestamp": "2025-07-24T12:00:00Z",
        "level": "info",
        "message": "Service started successfully",
        "metadata": {
          "service": "filesystem-mcp",
          "version": "1.2.0"
        }
      }
    ]
  }
}
```

### Service Exec

```http
POST /api/v1/services/{serviceId}/exec
Authorization: Bearer <token>
```

**Request:**
```json
{
  "command": ["node", "--version"],
  "workdir": "/app",
  "env": {
    "DEBUG": "true"
  }
}
```

**Response:**
```json
{
  "data": {
    "exitCode": 0,
    "stdout": "v18.17.0\n",
    "stderr": ""
  }
}
```

## Configuration API

### Get All Configurations

```http
GET /api/v1/config
Authorization: Bearer <token>
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `scope` | string | Filter by scope: `global`, `service` |
| `service` | string | Filter by service ID |
| `search` | string | Search in keys/values |

### Get Configuration

```http
GET /api/v1/config/{key}
Authorization: Bearer <token>
```

**Response:**
```json
{
  "data": {
    "key": "jwt.secret",
    "value": "encrypted:AES256:...",
    "encrypted": true,
    "scope": "global",
    "createdAt": "2025-07-01T12:00:00Z",
    "updatedAt": "2025-07-20T10:00:00Z",
    "updatedBy": "admin@example.com"
  }
}
```

### Set Configuration

```http
PUT /api/v1/config/{key}
Authorization: Bearer <token>
```

**Request:**
```json
{
  "value": "new-value",
  "encrypted": true,
  "scope": "service",
  "serviceId": "filesystem-mcp"
}
```

### Delete Configuration

```http
DELETE /api/v1/config/{key}
Authorization: Bearer <token>
```

### Bulk Configuration Update

```http
POST /api/v1/config/bulk
Authorization: Bearer <token>
```

**Request:**
```json
{
  "configs": [
    {
      "key": "log.level",
      "value": "debug"
    },
    {
      "key": "cache.ttl",
      "value": "3600"
    }
  ]
}
```

## Health & Monitoring

### Platform Health

```http
GET /api/v1/health
```

**Response:**
```json
{
  "data": {
    "status": "healthy",
    "timestamp": "2025-07-24T12:00:00Z",
    "version": "5.0.0",
    "checks": {
      "database": {
        "status": "healthy",
        "latency": 5,
        "details": {
          "connections": 10,
          "maxConnections": 100
        }
      },
      "redis": {
        "status": "healthy",
        "latency": 2,
        "details": {
          "memory": "256MB",
          "uptime": "7d"
        }
      },
      "filesystem": {
        "status": "healthy",
        "details": {
          "diskUsage": "45%",
          "inodes": "12%"
        }
      }
    }
  }
}
```

### Service Health

```http
GET /api/v1/services/{serviceId}/health
Authorization: Bearer <token>
```

**Response:**
```json
{
  "data": {
    "status": "healthy",
    "timestamp": "2025-07-24T12:00:00Z",
    "checks": {
      "readiness": {
        "status": "passing",
        "output": "Service is ready",
        "lastCheck": "2025-07-24T12:00:00Z"
      },
      "liveness": {
        "status": "passing",
        "output": "Service is alive",
        "lastCheck": "2025-07-24T12:00:00Z"
      },
      "startup": {
        "status": "passing",
        "output": "Service started successfully",
        "lastCheck": "2025-07-24T11:50:00Z"
      }
    },
    "dependencies": {
      "database": "healthy",
      "cache": "healthy"
    }
  }
}
```

### Metrics

```http
GET /api/v1/metrics
Authorization: Bearer <token>
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `service` | string | Filter by service ID |
| `metric` | string | Specific metric name |
| `start` | string | Start time (ISO 8601) |
| `end` | string | End time (ISO 8601) |
| `step` | string | Time step (e.g., "5m", "1h") |

**Response:**
```json
{
  "data": {
    "metrics": [
      {
        "name": "http_requests_total",
        "labels": {
          "service": "filesystem-mcp",
          "method": "GET",
          "status": "200"
        },
        "values": [
          {
            "timestamp": "2025-07-24T12:00:00Z",
            "value": 1234
          }
        ]
      }
    ]
  }
}
```

### Prometheus Metrics

```http
GET /api/v1/metrics/prometheus
Authorization: Bearer <token>
```

**Response:** Prometheus text format
```
# HELP http_requests_total Total HTTP requests
# TYPE http_requests_total counter
http_requests_total{service="filesystem-mcp",method="GET",status="200"} 1234
```

## Backup & Recovery

### Create Backup

```http
POST /api/v1/backups
Authorization: Bearer <token>
```

**Request:**
```json
{
  "name": "manual-backup-2025-07-24",
  "description": "Pre-upgrade backup",
  "type": "full",
  "includeData": true,
  "includeConfig": true,
  "includeLogs": false,
  "compress": true,
  "encrypt": true,
  "services": ["filesystem-mcp", "postgres"]
}
```

**Response:**
```json
{
  "data": {
    "id": "backup_abc123",
    "name": "manual-backup-2025-07-24",
    "status": "in_progress",
    "type": "full",
    "createdAt": "2025-07-24T12:00:00Z",
    "estimatedSize": "2.5GB",
    "estimatedTime": "10m"
  }
}
```

### List Backups

```http
GET /api/v1/backups
Authorization: Bearer <token>
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string | Filter by type: `full`, `incremental` |
| `status` | string | Filter by status |
| `startDate` | string | Filter by date range |
| `endDate` | string | Filter by date range |

**Response:**
```json
{
  "data": [
    {
      "id": "backup_abc123",
      "name": "manual-backup-2025-07-24",
      "type": "full",
      "status": "completed",
      "size": "2.3GB",
      "duration": "8m32s",
      "services": ["filesystem-mcp", "postgres"],
      "createdAt": "2025-07-24T12:00:00Z",
      "expiresAt": "2025-08-24T12:00:00Z"
    }
  ]
}
```

### Get Backup Details

```http
GET /api/v1/backups/{backupId}
Authorization: Bearer <token>
```

### Download Backup

```http
GET /api/v1/backups/{backupId}/download
Authorization: Bearer <token>
```

**Response:** Binary stream of backup archive

### Restore Backup

```http
POST /api/v1/backups/{backupId}/restore
Authorization: Bearer <token>
```

**Request:**
```json
{
  "services": ["filesystem-mcp"],
  "stopServices": true,
  "overwrite": true,
  "dryRun": false
}
```

### Delete Backup

```http
DELETE /api/v1/backups/{backupId}
Authorization: Bearer <token>
```

### Backup Schedules

#### Create Schedule

```http
POST /api/v1/backups/schedules
Authorization: Bearer <token>
```

**Request:**
```json
{
  "name": "daily-backup",
  "cronExpression": "0 2 * * *",
  "type": "incremental",
  "retention": "7d",
  "options": {
    "includeData": true,
    "includeConfig": true,
    "compress": true
  }
}
```

#### List Schedules

```http
GET /api/v1/backups/schedules
Authorization: Bearer <token>
```

## User Management

### List Users

```http
GET /api/v1/users
Authorization: Bearer <token>
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `role` | string | Filter by role |
| `status` | string | Filter by status: `active`, `inactive` |
| `search` | string | Search in name/email |

**Response:**
```json
{
  "data": [
    {
      "id": "user_123",
      "email": "john@example.com",
      "name": "John Doe",
      "roles": ["developer"],
      "status": "active",
      "lastLogin": "2025-07-24T10:00:00Z",
      "createdAt": "2025-01-01T12:00:00Z"
    }
  ]
}
```

### Get User

```http
GET /api/v1/users/{userId}
Authorization: Bearer <token>
```

### Create User

```http
POST /api/v1/users
Authorization: Bearer <token>
```

**Request:**
```json
{
  "email": "newuser@example.com",
  "name": "New User",
  "password": "secure-password",
  "roles": ["developer"],
  "sendWelcomeEmail": true
}
```

### Update User

```http
PUT /api/v1/users/{userId}
Authorization: Bearer <token>
```

### Delete User

```http
DELETE /api/v1/users/{userId}
Authorization: Bearer <token>
```

### User Roles

#### Assign Role

```http
POST /api/v1/users/{userId}/roles
Authorization: Bearer <token>
```

**Request:**
```json
{
  "role": "admin"
}
```

#### Remove Role

```http
DELETE /api/v1/users/{userId}/roles/{role}
Authorization: Bearer <token>
```

### User Sessions

#### Get Sessions

```http
GET /api/v1/users/{userId}/sessions
Authorization: Bearer <token>
```

#### Revoke Session

```http
DELETE /api/v1/users/{userId}/sessions/{sessionId}
Authorization: Bearer <token>
```

## WebSocket API

### Connection

```javascript
const ws = new WebSocket('wss://api.mcp-platform.io/ws');

ws.onopen = () => {
  // Authenticate
  ws.send(JSON.stringify({
    type: 'auth',
    token: 'your-jwt-token'
  }));
};
```

### Subscribe to Events

```javascript
// Subscribe to service events
ws.send(JSON.stringify({
  type: 'subscribe',
  channel: 'services',
  filters: {
    serviceId: 'filesystem-mcp'
  }
}));

// Subscribe to logs
ws.send(JSON.stringify({
  type: 'subscribe',
  channel: 'logs',
  filters: {
    serviceId: 'filesystem-mcp',
    level: 'error'
  }
}));
```

### Event Types

#### Service Events
```json
{
  "type": "event",
  "channel": "services",
  "event": "service.started",
  "data": {
    "serviceId": "filesystem-mcp",
    "timestamp": "2025-07-24T12:00:00Z"
  }
}
```

#### Log Events
```json
{
  "type": "event",
  "channel": "logs",
  "event": "log.entry",
  "data": {
    "serviceId": "filesystem-mcp",
    "level": "error",
    "message": "Connection failed",
    "timestamp": "2025-07-24T12:00:00Z"
  }
}
```

#### Metric Events
```json
{
  "type": "event",
  "channel": "metrics",
  "event": "metric.update",
  "data": {
    "serviceId": "filesystem-mcp",
    "metric": "cpu_usage",
    "value": 75.5,
    "timestamp": "2025-07-24T12:00:00Z"
  }
}
```

### Unsubscribe

```javascript
ws.send(JSON.stringify({
  type: 'unsubscribe',
  channel: 'services'
}));
```

## Rate Limiting

### Rate Limit Headers

All responses include rate limit information:

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 995
X-RateLimit-Reset: 1627058400
X-RateLimit-Reset-After: 3600
X-RateLimit-Bucket: user_123
```

### Rate Limit Tiers

| Tier | Requests/Hour | Burst | Cost |
|------|---------------|-------|------|
| Free | 100 | 10 | $0 |
| Basic | 1,000 | 100 | $10/mo |
| Pro | 10,000 | 1,000 | $50/mo |
| Enterprise | Unlimited | Custom | Custom |

### Rate Limit Response

When rate limited:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 3600
```

```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded",
    "details": {
      "limit": 1000,
      "remaining": 0,
      "resetAt": "2025-07-24T13:00:00Z",
      "retryAfter": 3600
    }
  }
}
```

## Error Handling

### Error Response Format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": {
      "fields": {
        "email": "Invalid email format",
        "password": "Password must be at least 8 characters"
      }
    },
    "requestId": "req_abc123",
    "timestamp": "2025-07-24T12:00:00Z"
  }
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Authentication required |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Invalid request data |
| `CONFLICT` | 409 | Resource conflict |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |
| `SERVICE_UNAVAILABLE` | 503 | Service temporarily unavailable |

### Common Error Scenarios

#### Invalid Authentication
```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or expired token",
    "details": {
      "tokenExpired": true,
      "expiresAt": "2025-07-24T11:00:00Z"
    }
  }
}
```

#### Resource Not Found
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Service not found",
    "details": {
      "serviceId": "unknown-service",
      "availableServices": ["filesystem-mcp", "git-mcp"]
    }
  }
}
```

#### Validation Error
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request data",
    "details": {
      "fields": {
        "port": "Port must be between 1 and 65535",
        "image": "Invalid Docker image format"
      }
    }
  }
}
```

## SDK Reference

### JavaScript/TypeScript SDK

#### Installation
```bash
npm install @mcp-platform/sdk
```

#### Basic Usage
```javascript
import { MCPClient } from '@mcp-platform/sdk';

const client = new MCPClient({
  baseURL: 'https://api.mcp-platform.io',
  apiKey: process.env.MCP_API_KEY,
  // or
  auth: {
    username: 'admin@example.com',
    password: 'secure-password'
  }
});

// Service operations
const services = await client.services.list();
const service = await client.services.get('filesystem-mcp');
await client.services.start('filesystem-mcp');
await client.services.stop('filesystem-mcp');

// Configuration
const config = await client.config.get('log.level');
await client.config.set('log.level', 'debug');

// Health monitoring
const health = await client.health.platform();
const serviceHealth = await client.health.service('filesystem-mcp');

// Backups
const backup = await client.backups.create({
  name: 'manual-backup',
  type: 'full'
});
await client.backups.restore(backup.id);

// WebSocket events
client.on('service.started', (event) => {
  console.log('Service started:', event.serviceId);
});

client.on('log.error', (event) => {
  console.error('Error log:', event.message);
});
```

#### Advanced Features
```javascript
// Request interceptors
client.interceptors.request.use((config) => {
  config.headers['X-Request-ID'] = generateRequestId();
  return config;
});

// Response interceptors
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Handle token refresh
      return client.auth.refresh().then(() => {
        return client.request(error.config);
      });
    }
    return Promise.reject(error);
  }
);

// Retry configuration
const client = new MCPClient({
  retry: {
    retries: 3,
    retryDelay: (retryCount) => retryCount * 1000,
    retryCondition: (error) => {
      return error.response?.status >= 500;
    }
  }
});

// Timeout configuration
const client = new MCPClient({
  timeout: 30000, // 30 seconds
  timeouts: {
    default: 30000,
    upload: 300000, // 5 minutes for uploads
  }
});
```

### Python SDK

#### Installation
```bash
pip install mcp-platform-sdk
```

#### Basic Usage
```python
from mcp_platform import MCPClient

# Initialize client
client = MCPClient(
    base_url='https://api.mcp-platform.io',
    api_key=os.environ['MCP_API_KEY']
)

# Service operations
services = await client.services.list()
service = await client.services.get('filesystem-mcp')
await client.services.start('filesystem-mcp')

# Configuration
config = await client.config.get('log.level')
await client.config.set('log.level', 'debug')

# Health monitoring
health = await client.health.platform()

# Backups
backup = await client.backups.create(
    name='manual-backup',
    backup_type='full'
)

# Async context manager
async with MCPClient(api_key=api_key) as client:
    services = await client.services.list()
```

### Go SDK

#### Installation
```bash
go get github.com/mcp-platform/go-sdk
```

#### Basic Usage
```go
package main

import (
    "context"
    "fmt"
    mcp "github.com/mcp-platform/go-sdk"
)

func main() {
    // Initialize client
    client := mcp.NewClient(
        mcp.WithBaseURL("https://api.mcp-platform.io"),
        mcp.WithAPIKey(os.Getenv("MCP_API_KEY")),
    )
    
    ctx := context.Background()
    
    // Service operations
    services, err := client.Services.List(ctx, nil)
    if err != nil {
        log.Fatal(err)
    }
    
    // Start service
    err = client.Services.Start(ctx, "filesystem-mcp")
    if err != nil {
        log.Fatal(err)
    }
    
    // Configuration
    config, err := client.Config.Get(ctx, "log.level")
    if err != nil {
        log.Fatal(err)
    }
    
    // Health check
    health, err := client.Health.Platform(ctx)
    if err != nil {
        log.Fatal(err)
    }
}
```

## API Changelog

### Version 1.0.0 (2025-07-24)
- Initial API release
- Core service management endpoints
- Authentication with JWT and API keys
- Health monitoring
- Backup and restore functionality
- WebSocket support for real-time events

### Version 0.9.0 (2025-06-01)
- Beta release
- Basic CRUD operations
- Simple authentication

## Support

### API Status
- Status Page: [status.mcp-platform.io](https://status.mcp-platform.io)
- API Health: [api.mcp-platform.io/health](https://api.mcp-platform.io/health)

### Getting Help
- Documentation: [docs.mcp-platform.io](https://docs.mcp-platform.io)
- API Reference: [api.mcp-platform.io/docs](https://api.mcp-platform.io/docs)
- Support Email: api-support@mcp-platform.io
- Discord: [discord.gg/mcp-platform](https://discord.gg/mcp-platform)

### Reporting Issues
- GitHub Issues: [github.com/mcp-platform/api/issues](https://github.com/mcp-platform/api/issues)
- Security Issues: security@mcp-platform.io

---

*Last updated: July 2025 | API Version: v1*