# MCP Transport Bridge

The Transport Bridge enables the MCP Platform to support all types of MCP server transports (stdio, HTTP, WebSocket, SSE) through a unified interface.

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ AI Clients  │────▶│   Traefik   │────▶│   Bridge    │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                                │
                    ┌───────────────────────────┼───────────────────────┐
                    │                           │                       │
              ┌─────▼─────┐             ┌──────▼──────┐         ┌─────▼─────┐
              │   stdio   │             │    HTTP     │         │ WebSocket │
              │  Adapter  │             │   Adapter   │         │  Adapter  │
              └─────┬─────┘             └──────┬──────┘         └─────┬─────┘
                    │                          │                       │
              ┌─────▼─────┐             ┌──────▼──────┐         ┌─────▼─────┐
              │  Process  │             │    HTTP     │         │     WS    │
              │  Manager  │             │   Servers   │         │  Servers  │
              └───────────┘             └─────────────┘         └───────────┘
```

## Core Components

### 1. Bridge Service (`core/bridge-service.js`)
Central coordinator that manages all transport adapters and provides unified API.

**Key Features:**
- Transport registration and management
- Server lifecycle management
- Message routing between transports
- Health monitoring
- Metrics collection

### 2. Transport Interface (`core/transport.interface.js`)
Abstract base class that all transport adapters must implement.

**Required Methods:**
- `initialize()` - Initialize the transport
- `start()` - Start the transport service
- `stop()` - Stop the transport service
- `createConnection()` - Create new connection
- `closeConnection()` - Close existing connection
- `sendMessage()` - Send message through transport
- `onMessage()` - Register message handler
- `getHealth()` - Get transport health status
- `getMetrics()` - Get transport metrics

### 3. Message Router (`core/message-router.js`)
Routes messages between different transport types with format conversion.

**Features:**
- Route registration
- Message transformation
- Request/response correlation
- Message queuing
- Format conversion (JSON-RPC, REST, WebSocket)

### 4. Transport Detector (`core/transport-detector.js`)
Automatically detects transport type from server configuration.

**Detection Strategies:**
- HTTP: Check for HTTP(S) URLs or ports
- WebSocket: Check for WS(S) URLs
- stdio: Check for command/executable
- SSE: Check for event stream endpoints

## Transport Adapters

### stdio Transport (`transports/stdio/`)
Handles communication with stdio-based MCP servers like Snap Happy.

**Features:**
- Process spawning and management
- JSON-RPC over stdio
- Process health monitoring
- Resource cleanup
- Error handling

**Usage Example:**
```javascript
const stdioTransport = new StdioTransport({
    id: 'stdio-transport',
    type: 'stdio'
});

await stdioTransport.initialize();
await stdioTransport.start();

// Create connection for Snap Happy
const connectionId = await stdioTransport.createConnection({
    serverId: 'snap-happy',
    command: 'snap-happy',
    args: [],
    env: { NODE_ENV: 'production' }
});

// Send message
const response = await stdioTransport.sendMessage(connectionId, {
    jsonrpc: '2.0',
    method: 'screenshot',
    params: { url: 'https://example.com' },
    id: 1
});
```

### HTTP Transport (Coming Soon)
Handles traditional HTTP-based MCP servers.

### WebSocket Transport (Coming Soon)
Handles bidirectional WebSocket connections.

### SSE Transport (Coming Soon)
Handles Server-Sent Events for unidirectional streaming.

## Integration with Platform

### 1. Registry Enhancement
Servers in `mcp-catalog.json` can specify transport configuration:

```json
{
  "id": "snap-happy",
  "name": "Snap Happy",
  "transport": {
    "type": "stdio",
    "command": "snap-happy",
    "args": [],
    "env": {}
  },
  "bridge": {
    "enabled": true,
    "port": 3020,
    "healthCheck": {
      "type": "command",
      "command": "echo 'ping'",
      "interval": 30
    }
  }
}
```

### 2. Unified API
All servers are accessible through unified HTTP API regardless of transport:

```bash
# Start any server
POST /api/v1/servers/{serverId}/start

# Send message to any server
POST /api/v1/servers/{serverId}/message
{
  "method": "screenshot",
  "params": {"url": "https://example.com"}
}

# Get server status
GET /api/v1/servers/{serverId}
```

### 3. CLI Integration
New commands for transport management:

```bash
# Transport commands
mcp transport list              # List all transports
mcp transport test <server>     # Test server connectivity
mcp transport stats             # Show transport statistics

# Process commands (for stdio)
mcp process list               # List stdio processes
mcp process logs <server>      # View process output
mcp process restart <server>   # Restart process

# Bridge commands
mcp bridge status              # Show bridge health
mcp bridge metrics             # Performance metrics
```

## Development

### Adding New Transport

1. Create new transport adapter extending `TransportInterface`:
```javascript
class MyTransport extends TransportInterface {
    // Implement all required methods
}
```

2. Register with bridge service:
```javascript
const bridge = new BridgeService();
const myTransport = new MyTransport(config);
bridge.registerTransport('my-transport', myTransport);
```

3. Add detection strategy:
```javascript
detector.registerStrategy('my-transport', {
    priority: 5,
    detect: async (config) => {
        // Detection logic
        return confidence; // 0-1
    }
});
```

### Testing

Run transport tests:
```bash
npm test -- tests/transports/
```

Run integration tests:
```bash
npm test -- tests/integration/bridge.test.js
```

## Security Considerations

- stdio processes run with limited permissions
- Process isolation using containers when possible
- Input validation for all messages
- Resource limits (CPU, memory) for processes
- Secure credential handling through environment variables

## Performance

- Connection pooling for efficiency
- Message queuing for high throughput
- Async message handling
- Process reuse where applicable
- Metrics collection for monitoring