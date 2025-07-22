# MCP Health Check Protocol

## Overview

The MCP Health Check Protocol defines how services report their health status to the centralized health monitoring system.

## Health Check Endpoint

All MCP services MUST expose a health check endpoint at:
```
GET /health
```

## Response Format

### Successful Response (200 OK)
```json
{
  "status": "healthy",
  "service": "service-name",
  "version": "1.0.0",
  "uptime": 12345,
  "timestamp": "2024-01-01T00:00:00Z",
  "checks": {
    "database": "healthy",
    "cache": "healthy",
    "dependencies": "healthy"
  }
}
```

### Degraded Response (200 OK)
```json
{
  "status": "degraded",
  "service": "service-name",
  "version": "1.0.0",
  "uptime": 12345,
  "timestamp": "2024-01-01T00:00:00Z",
  "checks": {
    "database": "healthy",
    "cache": "unhealthy",
    "dependencies": "healthy"
  },
  "issues": [
    "Cache connection failed"
  ]
}
```

### Unhealthy Response (503 Service Unavailable)
```json
{
  "status": "unhealthy",
  "service": "service-name",
  "version": "1.0.0",
  "uptime": 12345,
  "timestamp": "2024-01-01T00:00:00Z",
  "checks": {
    "database": "unhealthy",
    "cache": "unhealthy",
    "dependencies": "healthy"
  },
  "issues": [
    "Database connection failed",
    "Cache connection failed"
  ]
}
```

## Status Codes

- `200 OK`: Service is healthy or degraded but operational
- `503 Service Unavailable`: Service is unhealthy
- `500 Internal Server Error`: Health check failed

## Required Fields

- `status`: One of "healthy", "degraded", "unhealthy"
- `service`: Service identifier
- `timestamp`: ISO 8601 timestamp

## Optional Fields

- `version`: Service version
- `uptime`: Uptime in seconds
- `checks`: Individual component health
- `issues`: Array of issue descriptions
- `metrics`: Performance metrics

## Implementation Example

### Node.js
```javascript
app.get('/health', (req, res) => {
  const health = {
    status: 'healthy',
    service: 'my-mcp-service',
    version: process.env.SERVICE_VERSION || '1.0.0',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    checks: {
      memory: process.memoryUsage().heapUsed < 500000000 ? 'healthy' : 'degraded'
    }
  };
  
  const statusCode = health.status === 'unhealthy' ? 503 : 200;
  res.status(statusCode).json(health);
});
```

### Python
```python
from flask import Flask, jsonify
import time

app = Flask(__name__)
start_time = time.time()

@app.route('/health')
def health():
    health_data = {
        'status': 'healthy',
        'service': 'my-mcp-service',
        'version': '1.0.0',
        'uptime': int(time.time() - start_time),
        'timestamp': datetime.utcnow().isoformat() + 'Z'
    }
    
    status_code = 503 if health_data['status'] == 'unhealthy' else 200
    return jsonify(health_data), status_code
```

## Docker Integration

Add health check to your Dockerfile:
```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1
```

## Service Labels

Add these labels to your service in docker-compose.yml:
```yaml
labels:
  - "mcp.health.enable=true"
  - "mcp.health.path=/health"
  - "mcp.health.interval=30s"
```