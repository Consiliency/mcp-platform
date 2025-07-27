# MCP Platform Current API Reference

This document describes the currently implemented API endpoints in the MCP Platform. For planned features, see [FEATURES.md](../FEATURES.md).

## Base URL

```
http://localhost:8080/api
```

## Catalog API

The catalog API provides endpoints for managing MCP servers in the platform.

### Get Popular Servers

Returns a curated list of popular MCP servers.

```http
GET /api/catalog/popular
```

**Response:**
```json
{
  "success": true,
  "servers": [
    {
      "id": "snap-happy",
      "name": "Snap Happy",
      "description": "Screenshot utility MCP server",
      "category": "utilities",
      "source": {
        "type": "github",
        "repo": "badlogic/lemmy",
        "path": "apps/snap-happy"
      },
      "transport": "stdio",
      "installed": false,
      "popular": true
    }
  ]
}
```

### Get Installed Servers

Returns all currently installed MCP servers.

```http
GET /api/catalog/installed
```

**Response:**
```json
{
  "success": true,
  "servers": [
    {
      "id": "filesystem-mcp",
      "name": "Filesystem MCP",
      "transport": "stdio",
      "status": "running",
      "port": 3001
    }
  ]
}
```

### Get All Catalog Servers

Returns the complete server catalog.

```http
GET /api/catalog/servers
```

**Response:**
```json
{
  "success": true,
  "servers": [
    {
      "id": "filesystem-mcp",
      "name": "Filesystem MCP",
      "description": "File system operations for MCP",
      "category": "storage",
      "source": {
        "type": "npm",
        "package": "@modelcontextprotocol/server-filesystem"
      }
    }
  ]
}
```

### Add Server from GitHub

Adds a new server from a GitHub repository URL.

```http
POST /api/catalog/add-github
```

**Request Body:**
```json
{
  "url": "https://github.com/owner/repo"
}
```

**Response:**
```json
{
  "success": true,
  "server": {
    "id": "repo-name",
    "name": "Repository Name",
    "source": {
      "type": "github",
      "owner": "owner",
      "repo": "repo"
    }
  }
}
```

### Add Server from Package Manager

Adds a server from various package managers.

```http
POST /api/catalog/add-package
```

**Request Body:**
```json
{
  "packageType": "npm",  // npm, pip, cargo, go, gem, composer
  "packageName": "@modelcontextprotocol/server-filesystem"
}
```

**Response:**
```json
{
  "success": true,
  "server": {
    "id": "package-name",
    "name": "Package Name",
    "source": {
      "type": "npm",
      "package": "@modelcontextprotocol/server-filesystem"
    }
  }
}
```

### Install Server

Installs a server from the catalog.

```http
POST /api/catalog/install
```

**Request Body:**
```json
{
  "serverId": "filesystem-mcp"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Server installed successfully"
}
```

### Start/Stop Server

Control server lifecycle.

```http
POST /api/catalog/servers/:serverId/start
POST /api/catalog/servers/:serverId/stop
```

**Response:**
```json
{
  "success": true,
  "message": "Server started successfully"
}
```

### Get Server Status

Get the current status of a server.

```http
GET /api/catalog/servers/:serverId/status
```

**Response:**
```json
{
  "success": true,
  "status": "running",
  "transport": "stdio",
  "port": 3001,
  "health": "healthy"
}
```

## Transport API

### Get Transport Status

Returns the status of all transport connections.

```http
GET /api/transport/status
```

**Response:**
```json
{
  "transports": {
    "stdio": {
      "status": "active",
      "connections": 2
    },
    "http": {
      "status": "active",
      "connections": 1
    },
    "websocket": {
      "status": "active",
      "connections": 0
    }
  }
}
```

## Health Check

### Platform Health

Basic health check endpoint.

```http
GET /api/health
```

**Response:**
```json
{
  "status": "healthy",
  "version": "6.0.0",
  "uptime": 3600
}
```

## Error Responses

All endpoints may return error responses in the following format:

```json
{
  "success": false,
  "error": "Error message description"
}
```

Common HTTP status codes:
- `200 OK` - Successful request
- `400 Bad Request` - Invalid request parameters
- `404 Not Found` - Resource not found
- `500 Internal Server Error` - Server error

## Authentication

Currently, the API does not require authentication for local development. Authentication headers are accepted but not validated:

```http
Authorization: Bearer <token>
```

## CORS

The API supports CORS for local development. All origins are currently allowed.

## WebSocket Support

WebSocket connections are available for real-time updates:

```javascript
const ws = new WebSocket('ws://localhost:8080/api/ws');

ws.on('message', (data) => {
  const event = JSON.parse(data);
  console.log('Event:', event);
});
```

## Examples

### Using cURL

```bash
# Get popular servers
curl http://localhost:8080/api/catalog/popular

# Install a server
curl -X POST http://localhost:8080/api/catalog/install \
  -H "Content-Type: application/json" \
  -d '{"serverId": "filesystem-mcp"}'

# Add from GitHub
curl -X POST http://localhost:8080/api/catalog/add-github \
  -H "Content-Type: application/json" \
  -d '{"url": "https://github.com/owner/repo"}'
```

### Using JavaScript

```javascript
// Get popular servers
const response = await fetch('http://localhost:8080/api/catalog/popular');
const data = await response.json();

// Install a server
const install = await fetch('http://localhost:8080/api/catalog/install', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ serverId: 'filesystem-mcp' })
});
```

## Future API Development

For planned API features including user management, full REST API, and enterprise features, see:
- [FEATURES.md](../FEATURES.md) - Current vs planned features
- [ROADMAP.md](../specs/ROADMAP.md) - Phase 9 API development plans

---

*Last Updated: July 2025*