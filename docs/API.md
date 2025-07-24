# MCP Platform API Documentation

## Overview

The MCP Platform provides a comprehensive REST API for managing services, configurations, and deployments. All API endpoints are accessible through the platform's gateway.

## Base URL

```
http://localhost:8080/api/v1
```

## Authentication

All API requests require authentication using JWT tokens or API keys.

### Using JWT Tokens

```bash
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "password"}'
```

Response:
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": 3600
}
```

### Using API Keys

```bash
curl -X GET http://localhost:8080/api/v1/services \
  -H "X-API-Key: your-api-key-here"
```

## Core Endpoints

### Services Management

#### List All Services
```http
GET /api/v1/services
```

Response:
```json
{
  "services": [
    {
      "id": "filesystem-mcp",
      "name": "Filesystem MCP",
      "status": "running",
      "version": "1.0.0",
      "port": 3001
    }
  ]
}
```

#### Get Service Details
```http
GET /api/v1/services/{serviceId}
```

#### Start Service
```http
POST /api/v1/services/{serviceId}/start
```

#### Stop Service
```http
POST /api/v1/services/{serviceId}/stop
```

#### Deploy New Service
```http
POST /api/v1/services/deploy
```

Request:
```json
{
  "serviceId": "custom-mcp",
  "dockerImage": "custom-mcp:latest",
  "config": {
    "port": 3005,
    "environment": {
      "NODE_ENV": "production"
    }
  }
}
```

### Health Monitoring

#### Platform Health
```http
GET /api/v1/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2025-07-23T12:00:00Z",
  "checks": {
    "database": "healthy",
    "redis": "healthy",
    "traefik": "healthy"
  }
}
```

#### Service Health
```http
GET /api/v1/services/{serviceId}/health
```

### Configuration Management

#### Get Configuration
```http
GET /api/v1/config/{configKey}
```

#### Update Configuration
```http
PUT /api/v1/config/{configKey}
```

Request:
```json
{
  "value": "new-config-value",
  "encrypted": false
}
```

### Metrics

#### Get Service Metrics
```http
GET /api/v1/metrics/services/{serviceId}
```

Response:
```json
{
  "cpu": {
    "usage": 25.5,
    "limit": 100
  },
  "memory": {
    "usage": 512,
    "limit": 1024,
    "unit": "MB"
  },
  "requests": {
    "total": 15420,
    "rate": 10.5
  }
}
```

### Backup and Restore

#### Create Backup
```http
POST /api/v1/backup
```

Request:
```json
{
  "name": "manual-backup",
  "includeData": true,
  "includeConfigs": true
}
```

#### List Backups
```http
GET /api/v1/backup
```

#### Restore Backup
```http
POST /api/v1/backup/{backupId}/restore
```

## Error Responses

All error responses follow a consistent format:

```json
{
  "error": {
    "code": "SERVICE_NOT_FOUND",
    "message": "Service with ID 'unknown-mcp' not found",
    "details": {
      "serviceId": "unknown-mcp"
    }
  }
}
```

Common error codes:
- `UNAUTHORIZED` - Authentication required
- `FORBIDDEN` - Insufficient permissions
- `NOT_FOUND` - Resource not found
- `VALIDATION_ERROR` - Invalid request data
- `RATE_LIMIT_EXCEEDED` - Too many requests
- `INTERNAL_ERROR` - Server error

## Rate Limiting

API requests are rate limited based on authentication method:
- JWT authenticated: 1000 requests per hour
- API key authenticated: 500 requests per hour
- Unauthenticated: 100 requests per hour

Rate limit headers:
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 995
X-RateLimit-Reset: 1627058400
```

## Pagination

List endpoints support pagination:

```http
GET /api/v1/services?page=2&limit=10
```

Response includes pagination metadata:
```json
{
  "data": [],
  "pagination": {
    "page": 2,
    "limit": 10,
    "total": 50,
    "pages": 5
  }
}
```

## Webhooks

Configure webhooks for service events:

```http
POST /api/v1/webhooks
```

Request:
```json
{
  "url": "https://example.com/webhook",
  "events": ["service.started", "service.stopped", "service.error"],
  "secret": "webhook-secret"
}
```

## SDK Examples

### JavaScript
```javascript
const MCPClient = require('@mcp/sdk');

const client = new MCPClient({
  baseURL: 'http://localhost:8080',
  apiKey: 'your-api-key'
});

// Example usage in an async function
async function example() {
  // List services
  const services = await client.services.list();

  // Deploy a service
  await client.services.deploy({
    serviceId: 'custom-mcp',
    dockerImage: 'custom-mcp:latest'
  });
}

example().catch(console.error);
```

### Python
```python
from mcp_sdk import MCPClient

client = MCPClient(
  base_url='http://localhost:8080',
  api_key='your-api-key'
)

# List services
services = client.services.list()

# Get service health
health = client.services.health('filesystem-mcp')
```

## API Versioning

The API uses URL versioning. The current version is `v1`. When breaking changes are introduced, a new version will be created while maintaining backward compatibility.

## Support

For API support and questions:
- Check the API documentation
- Review the SDK examples
- Open an issue on GitHub
- Contact the maintainers

---

*Last updated: July 2025*