# MCP SDK Core

The official SDK for Model Context Protocol (MCP) services. This SDK provides a unified interface for interacting with MCP services across multiple programming languages.

## Features

- **Authentication**: Support for API key and username/password authentication
- **Service Discovery**: Browse and search available MCP services
- **Service Management**: Install, uninstall, and manage service lifecycle
- **Service Interaction**: Call service methods with type-safe interfaces
- **Event System**: Subscribe to SDK and service events
- **Health Monitoring**: Monitor platform and service health
- **Multi-language Support**: JavaScript/TypeScript, Python, and Go SDKs

## Installation

### JavaScript/TypeScript
```bash
npm install @mcp/sdk
```

### Python
```bash
pip install mcp-sdk
```

### Go
```bash
go get github.com/modelcontextprotocol/go-sdk
```

## Quick Start

### JavaScript Example
```javascript
const MCPClient = require('@mcp/sdk');

async function main() {
  // Create client
  const client = new MCPClient({
    apiKey: 'your-api-key'
  });
  
  // Authenticate
  await client.connect('your-api-key');
  
  // List available services
  const services = await client.listServices({
    category: 'database'
  });
  
  // Install and connect to a service
  const db = await client.connectService('postgres-mcp');
  
  // Call service methods
  const result = await db.call('query', {
    sql: 'SELECT * FROM users'
  });
}
```

### Python Example
```python
import asyncio
from mcp_sdk import MCPClient

async def main():
    async with MCPClient({'api_key': 'your-api-key'}) as client:
        await client.connect('your-api-key')
        
        # List services
        services = await client.list_services({'category': 'database'})
        
        # Connect to service
        db = await client.connect_service('postgres-mcp')
        
        # Query database
        result = await db.query({'sql': 'SELECT * FROM users'})

asyncio.run(main())
```

### Go Example
```go
package main

import (
    "context"
    "log"
    mcp "github.com/modelcontextprotocol/go-sdk"
)

func main() {
    // Create client
    client := mcp.NewClient(mcp.Config{
        APIKey: "your-api-key",
    })
    
    ctx := context.Background()
    
    // Authenticate
    _, err := client.Connect(ctx, "your-api-key")
    if err != nil {
        log.Fatal(err)
    }
    
    // List services
    services, err := client.ListServices(ctx, map[string]interface{}{
        "category": "database",
    })
    
    // Connect to service
    db, err := client.ConnectService(ctx, "postgres-mcp")
    
    // Query database
    result, err := db.Call(ctx, "query", map[string]interface{}{
        "sql": "SELECT * FROM users",
    })
}
```

## SDK Architecture

The SDK is built with a layered architecture:

1. **Core SDK**: Low-level interface implementing the MCP protocol
2. **Language SDKs**: High-level, idiomatic APIs for each language
3. **Service Proxies**: Type-safe wrappers for individual services
4. **Event System**: Real-time notifications and monitoring

## Integration with IDE and CLI

The SDK is designed to integrate seamlessly with:

- **IDE Extensions**: VS Code, IntelliJ, and other editors
- **CLI Plugins**: Extend the MCP CLI with custom commands
- **CI/CD Pipelines**: Automate service deployment and testing
- **Monitoring Tools**: Track service health and performance

## Development

### Running Tests
```bash
npm test
```

### Building Documentation
```bash
npm run docs
```

## License

MIT License - see LICENSE file for details