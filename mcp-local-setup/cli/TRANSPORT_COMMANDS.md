# MCP Transport CLI Commands

This document describes the new transport-aware CLI commands added in Phase 7.

## Overview

The MCP CLI has been enhanced with comprehensive transport management capabilities, allowing users to:
- Manage servers across different transport types (stdio, HTTP, WebSocket, gRPC, Docker, SSH)
- Monitor transport connections and performance
- Convert servers between transport types
- Configure transport-specific settings

## Transport Commands

### mcp transport list
List all available transport types with their capabilities.

```bash
mcp transport list
mcp transport list --json  # JSON output for scripting
```

**Output includes:**
- Transport ID and type
- Description
- Current status
- Supported features (bidirectional, streaming, multiplexing)

### mcp transport status
Show real-time transport connection status for all active servers.

```bash
mcp transport status
mcp transport status --json
```

**Output includes:**
- Server connections by transport type
- Connection status and uptime
- Message counts and error rates
- Summary statistics

### mcp transport test <transport-type>
Test connectivity for a specific transport type.

```bash
mcp transport test stdio
mcp transport test http
mcp transport test ws
```

**Tests include:**
- Connection establishment
- Round-trip time measurement
- Feature availability check
- Diagnostic information on failure

### mcp transport metrics
Display transport performance metrics.

```bash
mcp transport metrics
mcp transport metrics -t http              # Filter by transport type
mcp transport metrics -s github-server     # Filter by server
mcp transport metrics -p 24h              # Time period (1h, 24h, 7d)
mcp transport metrics --json
```

**Metrics include:**
- Message throughput
- Average and P95 latency
- Error rates
- Per-transport breakdown

### mcp transport config <transport-type>
Configure transport-specific settings interactively.

```bash
mcp transport config http
mcp transport config ws
mcp transport config stdio
```

**Configurable settings:**
- HTTP: port, timeout, CORS
- WebSocket: port, ping interval, compression
- STDIO: encoding, buffering

## Enhanced Server Commands

### mcp server start <server-id> --transport <type>
Start a server with a specific transport type.

```bash
mcp server start filesystem-server --transport stdio
mcp server start github-server --transport http --port 3000
mcp server start slack-server --transport ws -d  # Detached mode
mcp server start my-server --transport docker -e API_KEY=secret
```

**Options:**
- `-t, --transport <type>`: Transport type (default: stdio)
- `-d, --detach`: Run in detached mode
- `-p, --port <port>`: Port for HTTP/WebSocket transports
- `-e, --env <KEY=value>`: Environment variables

### mcp server convert <server-id> <new-transport>
Convert a running server to use a different transport type.

```bash
mcp server convert filesystem-server http
mcp server convert github-server ws
```

**Features:**
- Interactive confirmation
- Connection preservation (where possible)
- Automatic client notification
- New connection configuration display

### mcp server list
Enhanced server listing with transport information.

```bash
mcp server list
mcp server list --json
```

**Output includes:**
- Server ID and name
- Current transport type
- Connection status
- Active connection count

### mcp server info <server-id>
Detailed server information including transport configuration.

```bash
mcp server info filesystem-server
mcp server info github-server --json
```

**Information includes:**
- Transport type and configuration
- Connection details
- Performance statistics
- Supported capabilities

## Integration with Existing Commands

### Enhanced mcp start
The global start command now supports transport specification:

```bash
mcp start -t http  # Set default transport for new servers
```

### Transport-aware profiles
Profiles can now include transport preferences:

```yaml
# profiles/development.yml
name: development
services:
  - filesystem-server
  - github-server
transport:
  default: stdio
  overrides:
    github-server: http
```

## Examples

### Scenario 1: Debugging Connection Issues
```bash
# Check overall transport status
mcp transport status

# Test specific transport
mcp transport test ws

# View detailed metrics
mcp transport metrics -t ws -p 1h

# Check server logs
mcp server logs slack-server -f
```

### Scenario 2: Migrating from STDIO to HTTP
```bash
# Check current server status
mcp server info filesystem-server

# Convert to HTTP transport
mcp server convert filesystem-server http

# Verify new configuration
mcp server info filesystem-server

# Monitor performance
mcp transport metrics -s filesystem-server
```

### Scenario 3: Performance Optimization
```bash
# View current metrics
mcp transport metrics

# Configure transport settings
mcp transport config http

# Restart affected servers
mcp server restart github-server

# Monitor improvements
mcp transport metrics -t http -p 1h
```

## Error Handling

All commands provide clear error messages and suggestions:

- Connection failures include diagnostic information
- Invalid transport types list available options
- Configuration errors show current settings
- Conversion failures preserve original state

## JSON Output Support

All commands support `--json` flag for scripting:

```bash
# Get all transport metrics as JSON
mcp transport metrics --json | jq '.byTransport.http'

# Filter active servers
mcp server list --json | jq '.servers[] | select(.status == "running")'
```

## Testing

Use the included test script to verify commands without a backend:

```bash
node test-transport-commands.js

# In another terminal:
mcp transport list
mcp transport status
mcp server list
```