# Dynamic Tool Updates in MCP Gateway

## Overview

The MCP Gateway supports dynamic tool discovery through the `listChanged` capability. This document explains how it works and current limitations.

## How It Works

### 1. Capability Advertisement
During initialization, the gateway advertises support for dynamic tool updates:
```json
{
  "capabilities": {
    "tools": {
      "listChanged": true
    }
  }
}
```

### 2. Tool Discovery
When new MCP servers come online or go offline:
- Gateway discovers/removes tools automatically
- Internal tool registry is updated
- `tools:updated` event is emitted internally
- Gateway attempts to notify clients via `notifications/tools/list_changed`

### 3. Client Behavior
When clients that support `listChanged` receive the notification:
- They should call `tools/list` again to get the updated tool list
- New tools become available immediately
- Removed tools are no longer accessible

## Current Limitations

### HTTP Transport Limitation
**Important**: The standard HTTP transport used by Claude Code is **request-response only**. This means:
- The gateway cannot push notifications to the client
- The client must poll or manually refresh to see new tools
- The `listChanged` capability is advertised but notifications cannot be delivered

### Workarounds

1. **Manual Refresh**: Users can restart Claude Code or reconnect to see new tools

2. **SSE Transport**: Future enhancement could add Server-Sent Events support for real-time updates

3. **Polling**: Clients could periodically call `tools/list` to check for updates

## Technical Details

### Internal Flow
```
New Server Starts → discoverServerTools() → tools added → notifyToolsChanged()
                                                              ↓
Server Stops → removeServerTools() → tools removed → (notification attempted)
```

### Testing Dynamic Updates

1. Start the gateway with some servers:
   ```bash
   docker-compose up gateway filesystem github
   ```

2. Connect Claude Code to the gateway

3. Start a new server:
   ```bash
   docker-compose up memory
   ```

4. The gateway will discover the new tools, but Claude Code won't see them until:
   - You restart Claude Code
   - You reconnect to the gateway
   - You manually trigger a tools refresh (if supported by client)

## Future Enhancements

### SSE Transport for Notifications
Implement a hybrid approach:
- Use HTTP for request-response (tools/call, etc.)
- Use SSE for server-to-client notifications
- Maintain compatibility with standard MCP protocol

### WebSocket Transport
Full duplex communication would enable:
- Real-time tool updates
- Server-initiated prompts
- Progress notifications
- Better error handling

## Summary

While the gateway fully supports dynamic tool discovery internally and advertises the capability, the HTTP transport limitation means clients like Claude Code cannot receive real-time notifications. The infrastructure is in place for when transport layers that support server-initiated messages are implemented.