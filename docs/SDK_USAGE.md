# MCP SDK Usage Guide

The MCP SDK provides a unified interface for interacting with Model Context Protocol services across multiple programming languages. The SDKs are currently available for local development and testing.

## Overview

The SDK consists of:
- **Core SDK**: Low-level interface that all language SDKs implement (located in `/sdk/core/`)
- **JavaScript/TypeScript SDK**: High-level JS/TS API (located in `/sdk/js/`)
- **Python SDK**: Async Python API (located in `/sdk/python/`)
- **Go SDK**: Go client library (located in `/sdk/go/`)

**Note**: The SDKs are not yet published to package managers. They are available for local development by referencing the source directories.

## Authentication

The SDK supports two authentication methods:

### API Key Authentication
```javascript
// JavaScript
const client = new MCPClient({ apiKey: 'your-api-key' });
await client.connect('your-api-key');

// Python
client = MCPClient({'api_key': 'your-api-key'})
await client.connect('your-api-key')

// Go
client := mcp.NewClient(mcp.Config{APIKey: "your-api-key"})
auth, err := client.Connect(ctx, "your-api-key")
```

### Username/Password Authentication
```javascript
// JavaScript
await client.connect({ username: 'user', password: 'pass' });

// Python
await client.connect({'username': 'user', 'password': 'pass'})

// Go
auth, err := client.Connect(ctx, map[string]string{
    "username": "user",
    "password": "pass",
})
```

## Service Discovery

List available services with optional filters:

```javascript
// JavaScript
const services = await client.listServices({
    category: 'database',
    tag: ['sql', 'postgres']
});

// Python
services = await client.list_services({
    'category': 'database',
    'tag': ['sql', 'postgres']
})

// Go
services, err := client.ListServices(ctx, map[string]interface{}{
    "category": "database",
    "tag": []string{"sql", "postgres"},
})
```

## Service Management

### Installing Services

```javascript
// JavaScript
const result = await client.installService('postgres-mcp', {
    version: '14',
    storage: '100GB'
});

// Python
result = await client.install_service('postgres-mcp', {
    'version': '14',
    'storage': '100GB'
})

// Go
result, err := client.InstallService(ctx, "postgres-mcp", map[string]interface{}{
    "version": "14",
    "storage": "100GB",
})
```

### Connecting to Services

```javascript
// JavaScript
const db = await client.connectService('postgres-mcp');

// Python
db = await client.connect_service('postgres-mcp')

// Go
db, err := client.ConnectService(ctx, "postgres-mcp")
```

### Calling Service Methods

```javascript
// JavaScript
const result = await db.call('query', {
    sql: 'SELECT * FROM users',
    limit: 10
});

// Python
result = await db.call('query', {
    'sql': 'SELECT * FROM users',
    'limit': 10
})

// Go
result, err := db.Call(ctx, "query", map[string]interface{}{
    "sql": "SELECT * FROM users",
    "limit": 10,
})
```

## Event Handling

Subscribe to SDK events:

```javascript
// JavaScript
client.on('service.installed', (event) => {
    console.log(`Service ${event.serviceId} installed`);
});

client.on('service.error', (event) => {
    console.error(`Error in ${event.serviceId}: ${event.error}`);
});
```

Available events:
- `authenticated`: User authenticated successfully
- `token.refreshed`: Auth token was refreshed
- `service.installed`: Service installed
- `service.uninstalled`: Service uninstalled
- `service.called`: Service method called
- `service.error`: Service error occurred

## Health Monitoring

Check platform or service health:

```javascript
// Platform health
const platformHealth = await client.getHealth();

// Service health
const serviceHealth = await client.getHealth('postgres-mcp');
```

## Advanced Usage

### Service Proxy Pattern (JavaScript)

```javascript
const db = await client.connectService('postgres-mcp');

// Create method proxies
const query = db.method('query');
const insert = db.method('insert');

// Use like functions
const users = await query({ sql: 'SELECT * FROM users' });
const newUser = await insert({ 
    table: 'users', 
    data: { name: 'John', email: 'john@example.com' }
});
```

### Async Context Manager (Python)

```python
async with MCPClient({'api_key': 'key'}) as client:
    await client.connect('key')
    services = await client.list_services()
    # Client automatically cleans up on exit
```

### Error Handling

```javascript
try {
    const result = await client.installService('unknown-service');
} catch (error) {
    if (error.message.includes('not found')) {
        console.error('Service does not exist');
    }
}
```

## Best Practices

1. **Authentication**: Always authenticate before making API calls
2. **Service Installation**: Check if a service is installed before connecting
3. **Error Handling**: Wrap SDK calls in try-catch blocks
4. **Event Monitoring**: Subscribe to error events for debugging
5. **Health Checks**: Periodically check service health in production
6. **Resource Cleanup**: Properly disconnect services when done

## Local Development Usage

### Using the JavaScript SDK Locally

```javascript
// Reference the local SDK
const MCPClient = require('../../sdk/js');

// Or in a project, add to package.json:
// "dependencies": {
//   "@mcp/sdk": "file:../path/to/mcp-platform/sdk/js"
// }
```

### Using the Python SDK Locally

```python
# Add the SDK path to Python path
import sys
sys.path.append('/path/to/mcp-platform/sdk/python')

from mcp_sdk import MCPClient
```

### Using the Go SDK Locally

```go
// Use go.mod replace directive
// replace github.com/modelcontextprotocol/go-sdk => ../path/to/mcp-platform/sdk/go
```

## Integration with IDE and CLI

The SDK integrates with the platform's IDE extensions and CLI tools:
- **IDE extensions**: Located in `/ide/` directory
- **CLI integration**: Through the `mcp` command-line tool
- **Local testing**: Use the platform's Docker-based environment

## Security Considerations

- Store API keys securely (environment variables, secret managers)
- Use short-lived tokens when possible
- Enable MFA for username/password authentication
- Audit service access through event monitoring
- Use service-specific credentials for sensitive operations