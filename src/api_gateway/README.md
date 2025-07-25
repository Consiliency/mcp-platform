# API Gateway Implementation

The API Gateway provides a unified interface for managing MCP servers across all transport types (stdio, HTTP, WebSocket, SSE).

## Features

- **Unified Server Management**: Start, stop, and monitor servers regardless of transport type
- **Transport Auto-Detection**: Automatically determines the appropriate transport based on server configuration
- **Request Routing**: Routes JSON-RPC requests to the correct transport adapter
- **Metrics Tracking**: Monitors request counts, active connections, and transport usage
- **Process Integration**: Coordinates with Process Manager for stdio-based servers

## Architecture

```
┌──────────────────┐
│   API Gateway    │
├──────────────────┤
│ - start_server() │
│ - stop_server()  │
│ - send_request() │
│ - get_metrics()  │
└────────┬─────────┘
         │
    ┌────┴────┐
    │         │
┌───▼───┐ ┌──▼────────────┐
│Trans- │ │Process Manager│
│port   │ │               │
└───────┘ └───────────────┘
```

## Usage

```python
from api_gateway import APIGateway

# Initialize gateway
gateway = APIGateway()

# Start a server
result = gateway.start_server("snap-happy")
# Returns: {"success": True, "connectionId": "conn_123", "transport": "stdio", ...}

# Send a request
response = gateway.send_request("snap-happy", {
    "jsonrpc": "2.0",
    "method": "screenshot",
    "params": {"url": "https://example.com"},
    "id": 1
})

# Get metrics
metrics = gateway.get_metrics()
# Returns: {"requests_total": 1, "active_connections": 1, ...}

# Stop server
gateway.stop_server("snap-happy")
```

## Transport Detection

The gateway automatically detects transport types using these rules:

1. **Environment Variable**: Checks `MCP_MODE` in server config
2. **Package Name**: Detects patterns like "stdio", "websocket" in package names
3. **Server ID**: Uses naming conventions (e.g., "ws-*" for WebSocket)
4. **Default**: Falls back to HTTP if no other transport is detected

## Integration Points

- **Transport Contract**: Uses TransportContract interface for all transport operations
- **Process Manager Contract**: Uses ProcessManagerContract for stdio process lifecycle
- **Registry**: Loads server configurations from enhanced-catalog.json

## Testing

The implementation includes:
- Integration tests that verify multi-transport support
- Unit tests covering all public methods and edge cases
- Mock-free testing using stub implementations