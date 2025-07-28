# MCP Gateway Protocol Compliance

## Overview

The MCP Gateway acts as a standard MCP server that aggregates tools from multiple backend MCP servers. From Claude Code's perspective, it's just another MCP server that happens to have many tools.

## How It Works

### 1. Connection
Claude Code connects to the gateway using HTTP transport:
```bash
claude mcp add --transport http mcp-gateway http://localhost:8090/mcp \
  --header "X-API-Key: mcp-gateway-default-key"
```

### 2. Protocol Flow

The gateway follows the standard MCP protocol:

1. **Initialize**: Claude Code sends `initialize` request
2. **Capabilities**: Gateway responds with its capabilities (tools, resources, prompts)
3. **Notification**: Claude Code sends `notifications/initialized` 
4. **Tool Discovery**: Claude Code requests `tools/list`
5. **Tool List**: Gateway returns ALL tools from ALL connected servers
6. **Tool Execution**: Claude Code calls tools using `tools/call`

### 3. Tool Namespacing

Tools are automatically namespaced to prevent conflicts:
- `github:create_issue` - GitHub server's create issue tool
- `filesystem:read_file` - Filesystem server's read file tool
- `snap-happy:TakeScreenshot` - Snap Happy server's screenshot tool
- `memory:create_entities` - Memory server's entity creation tool

### 4. Transparent Aggregation

The gateway:
- Connects to multiple backend MCP servers (stdio and HTTP)
- Discovers tools from each server
- Aggregates them with namespacing
- Routes tool calls to the appropriate backend server
- Returns responses to Claude Code

### 5. Testing

Run the test script to verify protocol compliance:
```bash
node test-mcp-protocol.js
```

This will:
1. Send initialize request
2. Send initialized notification
3. Request tools list
4. Display discovered tools

## Key Points

- **Single Connection**: Claude Code only needs one connection to access all servers
- **Standard Protocol**: Gateway follows MCP protocol specification exactly
- **No Special Handling**: Claude Code doesn't know it's talking to a gateway
- **Automatic Discovery**: Tools appear automatically as backend servers come online
- **Error Handling**: Timeouts and errors are properly returned as JSON-RPC errors

## Configuration

The gateway uses standard MCP configuration in Claude Code settings. No special transport or protocol handling is required - it's just another MCP server from the client's perspective.