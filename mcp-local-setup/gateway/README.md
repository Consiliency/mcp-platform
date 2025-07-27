# MCP Unified Gateway

The MCP Gateway provides a single entry point for all MCP servers, eliminating the need to configure each server individually in your AI assistant.

## Overview

The gateway acts as a unified interface that:
- Aggregates all MCP servers into one endpoint
- Automatically namespaces tools to prevent conflicts
- Manages API keys and credentials centrally
- Provides real-time tool discovery
- Supports all major MCP clients

## Architecture

```
AI Client (Claude/Cursor/etc)
           |
           v
    MCP Gateway (:8090)
           |
    Transport Bridge
    /      |      \
stdio    HTTP   WebSocket
  |        |        |
Servers  Servers  Servers
```

## Components

### Gateway Server (`server.js`)
- Express HTTP server with SSE support
- JSON-RPC message handling
- API key authentication
- Real-time event streaming

### Gateway Service (`gateway-service.js`)
- Connects to Transport Bridge
- Tool discovery and aggregation
- Request routing to appropriate servers
- Tool namespacing logic

### Configuration Manager (`config-manager.js`)
- API key management
- Service credential injection
- Environment variable handling
- Auto-start configuration

### Manifest Generator (`manifest-generator.js`)
- Dynamic MCP manifest generation
- Client-specific configurations
- Tool schema documentation

## Quick Start

### 1. Start the Gateway

```bash
# Using CLI
mcp gateway start

# Using Docker
docker-compose up gateway

# Direct Node.js
cd gateway && npm start
```

### 2. Configure Your Client

**Claude Code (Two Methods):**

Method 1 - CLI Command (Recommended):
```bash
# For HTTP transport (recommended for gateway)
claude mcp add --transport http mcp-gateway http://localhost:8090/mcp \
  --header "X-API-Key: mcp-gateway-default-key"

# Or for SSE transport
claude mcp add --transport sse mcp-gateway http://localhost:8090/mcp \
  --header "X-API-Key: mcp-gateway-default-key"
```

Method 2 - Settings File:
```json
// Add to .claude/settings.json
{
  "mcpServers": {
    "mcp-gateway": {
      "transport": "http",
      "url": "http://localhost:8090/mcp",
      "headers": {
        "X-API-Key": "mcp-gateway-default-key"
      }
    }
  }
}
```

**Other Clients:**
```bash
mcp config generate --client cursor
mcp config generate --client claude-desktop
mcp config generate --client vscode
```

### 3. Access Tools

All tools from all running MCP servers are now available through the single gateway connection!

## API Endpoints

### SSE Endpoint (Main MCP Interface)
```
GET /mcp
Headers: X-API-Key: your-key
```

### Tool Discovery
```
GET /api/gateway/tools
Headers: X-API-Key: your-key
```

### Server Status
```
GET /api/gateway/servers
Headers: X-API-Key: your-key
```

### Health Check
```
GET /health
```

### MCP Manifest
```
GET /.well-known/mcp-manifest.json
```

## Configuration

### Environment Variables

```bash
# Gateway settings
MCP_GATEWAY_API_KEY=your-secure-key
GATEWAY_PORT=8090

# Auto-start servers (comma-separated)
MCP_AUTO_START_SERVERS=github,filesystem,postgres

# Service API keys
MCP_GITHUB_TOKEN=ghp_xxxxx
MCP_OPENAI_API_KEY=sk-xxxxx
MCP_ANTHROPIC_API_KEY=sk-ant-xxxxx
```

### Configuration File

Create/edit `~/.mcp-platform/gateway-config.json`:

```json
{
  "gateway": {
    "apiKey": "your-secure-gateway-api-key",
    "autoStartServers": ["github", "filesystem"]
  },
  "servers": {
    "github": {
      "environment": {
        "GITHUB_TOKEN": "ghp_xxxxx"
      }
    },
    "openai": {
      "apiKey": "sk-xxxxx"
    }
  }
}
```

## Tool Namespacing

Tools are automatically namespaced to prevent conflicts:

- `github:create_issue` - GitHub server's create issue tool
- `linear:create_issue` - Linear server's create issue tool
- `filesystem:read_file` - Filesystem server's read file tool

## Dashboard

Access the gateway dashboard at: `http://localhost:8080/gateway.html`

Features:
- Real-time server status
- Tool explorer with search
- Client configuration helpers
- Connection testing

## Development

### Running Locally

```bash
cd gateway
npm install
npm start
```

### Running Tests

```bash
npm test
```

### Building Docker Image

```bash
docker build -t mcp-gateway -f Dockerfile ../
```

## Troubleshooting

### Gateway Not Starting

1. Check if port 8090 is available:
   ```bash
   lsof -i :8090
   ```

2. Check logs:
   ```bash
   mcp gateway logs
   # or
   docker logs mcp-gateway
   ```

### Tools Not Appearing

1. Ensure servers are running:
   ```bash
   mcp gateway status
   ```

2. Check server logs for errors
3. Verify server supports `tools/list` method

### Authentication Issues

1. Verify API key is set correctly
2. Check `X-API-Key` header in requests
3. Ensure gateway config has correct key

## Security

- Always use strong API keys
- Set service-specific credentials via environment
- Gateway runs on localhost by default
- Consider TLS termination for production

## Contributing

See main [CONTRIBUTING.md](../../CONTRIBUTING.md) for guidelines.