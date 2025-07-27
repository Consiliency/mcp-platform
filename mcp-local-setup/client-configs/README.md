# MCP Gateway Client Configuration Guide

This directory contains configuration templates and instructions for connecting various MCP clients to the unified MCP Gateway.

## Overview

The MCP Gateway provides a single entry point for all your MCP servers. Instead of configuring each server individually in your client, you only need to configure one connection to the gateway.

## Gateway Endpoint

- **URL**: `http://localhost:8090/mcp`
- **Protocol**: SSE (Server-Sent Events) or HTTP
- **Authentication**: API Key via `X-API-Key` header

## Client Configuration Instructions

### Claude Code

Claude Code supports MCP servers through its CLI. There are two methods to configure the gateway:

#### Method 1: CLI Command (Recommended)

```bash
# Add the gateway as an HTTP server (recommended for gateway)
claude mcp add --transport http mcp-gateway http://localhost:8090/mcp --header "X-API-Key: mcp-gateway-default-key"

# Or as SSE if your gateway supports it
claude mcp add --transport sse mcp-gateway http://localhost:8090/mcp --header "X-API-Key: mcp-gateway-default-key"

# Verify the connection
claude mcp list

# Check available tools (use /mcp command in Claude Code)
/mcp
```

#### Method 2: Direct Configuration File

Add to your project's `.claude/settings.json`:
```json
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

**Note**: The default API key is `mcp-gateway-default-key`. Change this in your `.env` file for production use.

### Cursor

For Cursor, create or modify `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "unified-gateway": {
      "type": "sse",
      "url": "http://localhost:8090/mcp",
      "headers": {
        "X-API-Key": "your-gateway-api-key"
      }
    }
  }
}
```

**Note**: Cursor has a 60-character limit for combined server and tool names. The gateway uses the format `serverId:toolName` for namespacing.

### Claude Desktop

For Claude Desktop, modify your `claude_desktop_config.json`:

**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "unified-gateway": {
      "type": "sse",
      "url": "http://localhost:8090/mcp",
      "headers": {
        "X-API-Key": "your-gateway-api-key"
      }
    }
  }
}
```

### VS Code

For VS Code with GitHub Copilot, create `.vscode/mcp.json` in your workspace:

```json
{
  "mcp": {
    "servers": {
      "unified-gateway": {
        "type": "sse",
        "url": "http://localhost:8090/mcp",
        "headers": {
          "X-API-Key": "your-gateway-api-key"
        }
      }
    }
  }
}
```

**Note**: You must have GitHub Copilot enabled to use MCP in VS Code.

### ChatGPT

ChatGPT requires custom connector setup:

1. Go to Settings > Connectors > Custom Connectors
2. Add a new custom connector with:
   - **URL**: `http://localhost:8090/mcp`
   - **Authentication**: Custom header `X-API-Key`
   - **Required tools**: Ensure `search` and `fetch` tools are available

**Note**: ChatGPT MCP integration is currently limited and may have long response times.

## Tool Namespacing

The gateway automatically namespaces tools to prevent conflicts. Tools are accessed using the format:

```
serverId:toolName
```

For example:
- `github:create_issue` - Create issue tool from GitHub server
- `linear:create_issue` - Create issue tool from Linear server
- `filesystem:read_file` - Read file tool from filesystem server

## Setting Up API Keys

### Gateway API Key

Set the gateway API key in your environment:

```bash
export MCP_GATEWAY_API_KEY="your-secure-gateway-api-key"
```

Or in the gateway configuration file (`~/.mcp-platform/gateway-config.json`):

```json
{
  "gateway": {
    "apiKey": "your-secure-gateway-api-key"
  }
}
```

### Service-Specific API Keys

Configure API keys for individual services:

**Environment variables**:
```bash
# GitHub
export MCP_GITHUB_TOKEN="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# OpenAI
export MCP_OPENAI_API_KEY="sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# Anthropic
export MCP_ANTHROPIC_API_KEY="sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# Google
export MCP_GOOGLE_API_KEY="AIzaxxxxxxxxxxxxxxxxxxxxxxxxxx"
export MCP_GOOGLE_CLIENT_ID="xxxxx.apps.googleusercontent.com"
export MCP_GOOGLE_CLIENT_SECRET="xxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# Slack
export MCP_SLACK_BOT_TOKEN="xoxb-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
export MCP_SLACK_APP_TOKEN="xapp-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

**Configuration file** (`~/.mcp-platform/gateway-config.json`):
```json
{
  "servers": {
    "github": {
      "environment": {
        "GITHUB_TOKEN": "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
      }
    },
    "openai": {
      "apiKey": "sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
    }
  }
}
```

## Testing Your Connection

### 1. Check Gateway Health

```bash
curl http://localhost:8090/health
```

### 2. View Available Tools

```bash
curl -H "X-API-Key: your-gateway-api-key" http://localhost:8090/api/gateway/tools
```

### 3. View Server Status

```bash
curl -H "X-API-Key: your-gateway-api-key" http://localhost:8090/api/gateway/servers
```

### 4. View MCP Manifest

```bash
curl http://localhost:8090/.well-known/mcp-manifest.json
```

## Troubleshooting

### Connection Issues

1. **Verify gateway is running**:
   ```bash
   docker ps | grep gateway
   # or
   ps aux | grep "gateway/server.js"
   ```

2. **Check gateway logs**:
   ```bash
   docker logs mcp-gateway
   # or check console output
   ```

3. **Test API key**:
   ```bash
   curl -I -H "X-API-Key: your-key" http://localhost:8090/api/gateway/tools
   ```

### Tool Discovery Issues

1. **Ensure servers are running**:
   ```bash
   curl -H "X-API-Key: your-key" http://localhost:8090/api/gateway/servers
   ```

2. **Check individual server status**:
   - Servers must be running to have their tools discovered
   - stdio servers need to be properly configured with command/args

### Client-Specific Issues

- **Cursor**: Check 60-character limit for tool names
- **ChatGPT**: Ensure required tools (`search`, `fetch`) are available
- **VS Code**: Verify GitHub Copilot is enabled
- **Claude Desktop**: Restart after configuration changes

## Advanced Configuration

### Custom Auto-Start Servers

Configure which servers start automatically with the gateway:

```json
{
  "gateway": {
    "autoStartServers": ["github", "filesystem", "postgres"]
  }
}
```

### Transport-Specific Settings

For non-stdio transports (future support):

```json
{
  "servers": {
    "http-server": {
      "transport": "http",
      "url": "http://localhost:3000/mcp",
      "timeout": 30000
    }
  }
}
```

## Security Considerations

1. **Keep your API keys secure** - Never commit them to version control
2. **Use strong gateway API keys** - Generate with `openssl rand -hex 32`
3. **Limit network exposure** - By default, gateway only listens on localhost
4. **Review server permissions** - Only enable servers you trust

## Need Help?

- Check gateway logs for detailed error messages
- View the dashboard at `http://localhost:8080/gateway.html` (if enabled)
- Report issues at the project repository