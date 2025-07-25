# Transport Adapter Implementation

## Overview

This implementation provides universal transport support for Phase 7 of the MCP project. The transport layer enables communication between clients and servers using multiple protocols: stdio, HTTP, WebSocket, and Server-Sent Events (SSE).

## Architecture

### Components

1. **Transport Interface** (`bridge/core/transport.interface.js`)
   - Base class defining the contract for all transport adapters
   - Provides common utilities like connection ID generation and JSON-RPC validation

2. **Transport Implementations**
   - **stdio** (`bridge/transports/stdio/stdio-transport.js`): Process-based communication
   - **HTTP** (`bridge/transports/http/http-transport.js`): Request/response with optional SSE
   - **WebSocket** (`bridge/transports/websocket/websocket-transport.js`): Bidirectional with auto-reconnect

3. **Transport Factory** (`bridge/transports/transport-factory.js`)
   - Automatically detects transport type from configuration
   - Manages transport instances
   - Routes connections to appropriate transport

4. **Python Adapter** (`bridge/transports/transport_adapter.py`)
   - Implements the Python TransportContract
   - Delegates to JavaScript implementations via Node.js runner
   - Handles cross-language communication

5. **Transport Runner** (`bridge/transports/transport-runner.js`)
   - Node.js process that executes transport operations
   - Communicates with Python via stdin/stdout JSON messages

## Features

### stdio Transport
- Spawns child processes for server communication
- Manages process lifecycle (start, stop, monitor)
- Handles stdin/stdout message passing
- Tracks process status and metrics
- Graceful shutdown with SIGTERM/SIGKILL

### HTTP Transport  
- Standard HTTP POST for JSON-RPC messages
- Optional SSE endpoint for server-initiated messages
- Configurable headers and timeouts
- Connection pooling per server

### WebSocket Transport
- Full-duplex communication
- Automatic reconnection with exponential backoff
- Connection state management
- Message queueing during reconnection
- Ping/pong keep-alive support

### Transport Factory
- Automatic transport detection based on config:
  - `command` field → stdio transport
  - `ws://` or `wss://` URL → WebSocket transport
  - `transport: 'sse'` → SSE-enabled HTTP transport
  - Default URL → standard HTTP transport

## Testing

### Unit Tests
- Comprehensive tests for each transport type
- Mock external dependencies
- Test error conditions and edge cases
- Located in `tests/unit/transports/`

### Integration Tests
- End-to-end testing with real transport instances
- Contract compliance verification
- Multi-transport scenarios
- Located in `tests/test_real_transport_integration.py`

### Phase 7 Integration
- All Phase 7 integration tests pass
- Can be used as drop-in replacement for TransportStub
- See `tests/test_phase7_with_real_transport.py`

## Usage Example

```python
from bridge.transports.transport_adapter import TransportAdapter

# Initialize transport
transport = TransportAdapter()
transport.initialize()

# Create stdio connection
config = {
    'serverId': 'my-server',
    'command': 'node',
    'args': ['server.js'],
    'env': {'NODE_ENV': 'production'}
}
connection_id = transport.create_connection(config)

# Send message
message = {
    "jsonrpc": "2.0",
    "method": "screenshot",
    "params": {"url": "https://example.com"},
    "id": 1
}
response = transport.send_message(connection_id, message)

# Check status
status = transport.get_status(connection_id)
print(f"Connection status: {status['status']}")
print(f"Uptime: {status['uptime']} seconds")

# Close connection
transport.close_connection(connection_id)
```

## Configuration

### stdio Configuration
```json
{
    "serverId": "server-id",
    "command": "executable",
    "args": ["arg1", "arg2"],
    "env": {"KEY": "value"}
}
```

### HTTP Configuration
```json
{
    "serverId": "server-id",
    "url": "http://localhost:3000/rpc",
    "headers": {"Authorization": "Bearer token"},
    "sseEndpoint": "/events"  // Optional
}
```

### WebSocket Configuration
```json
{
    "serverId": "server-id",
    "url": "ws://localhost:3001/ws",
    "headers": {"X-API-Key": "key"},
    "maxReconnectAttempts": 3,
    "reconnectDelay": 1000
}
```

## Error Handling

- Connection failures return descriptive errors
- Graceful degradation on transport errors
- Automatic cleanup of failed connections
- Timeout handling for all operations
- Process cleanup on stdio transport errors

## Performance Considerations

- Connection pooling reduces overhead
- Efficient message buffering
- Minimal cross-language serialization
- Process reuse where applicable
- Configurable timeouts and retries