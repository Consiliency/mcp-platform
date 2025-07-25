# MCP Platform

A comprehensive platform for running Model Context Protocol (MCP) services with universal transport support. The platform provides a unified interface for multiple AI coding assistants through a robust infrastructure supporting stdio, HTTP, WebSocket, and SSE transports.

## Features

### Core Platform
- **Universal Transport Support**: stdio, HTTP, WebSocket, and SSE transports
- **Service Discovery**: Browse and search available MCP services
- **Service Management**: Install, uninstall, and manage service lifecycle
- **Process Management**: Advanced process lifecycle with auto-restart and resource monitoring
- **API Gateway**: Unified API for all transport types with automatic routing

### Security & Authentication
- **Authentication**: API key, JWT, and OAuth2 support
- **Rate Limiting**: Redis-based rate limiting with multiple strategies
- **Network Security**: Service isolation, CORS management, and TLS support
- **Security Middleware**: Helmet.js integration, XSS protection

### Monitoring & Observability
- **Health Monitoring**: Real-time service health checks and status tracking
- **Metrics Collection**: Prometheus integration with custom exporters
- **Structured Logging**: Winston-based logging with rotation
- **Error Tracking**: Sentry integration with alert routing
- **Transport Dashboard**: Real-time visualization of transport connections

### Developer Experience
- **Multi-language SDKs**: JavaScript/TypeScript, Python, and Go
- **CLI Tools**: Comprehensive command-line interface with transport commands
- **IDE Extensions**: VS Code, IntelliJ, and Vim/Neovim plugins
- **Event System**: Subscribe to platform and service events
- **Hot Reload**: Development mode with automatic service restarts

## Installation

### Platform Installation
```bash
# Linux/macOS/WSL
curl -fsSL https://raw.githubusercontent.com/modelcontextprotocol/mcp-platform/main/install.sh | bash

# Windows PowerShell
iex ((New-Object System.Net.WebClient).DownloadString('https://raw.githubusercontent.com/modelcontextprotocol/mcp-platform/main/install.ps1'))
```

### SDK Installation

#### JavaScript/TypeScript
```bash
npm install @mcp/sdk
```

#### Python
```bash
pip install mcp-sdk
```

#### Go
```bash
go get github.com/modelcontextprotocol/go-sdk
```

## Quick Start

### Platform Commands
```bash
# Start all services
mcp start

# Check service status
mcp status

# View transport connections
mcp transport status

# Install a new service
mcp install postgres-mcp

# Start service with specific transport
mcp server start filesystem --transport http

# View real-time metrics
mcp transport metrics

# Access dashboard
open http://localhost:8080/dashboard
```

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

## Architecture

### Platform Architecture
The MCP Platform uses a microservices architecture with:

1. **Transport Layer**: Universal transport support (stdio, HTTP, WebSocket, SSE)
2. **API Gateway**: Unified API routing requests to appropriate transports
3. **Process Manager**: Lifecycle management with resource monitoring
4. **Service Registry**: Enhanced with transport metadata and auto-detection
5. **Monitoring Stack**: Prometheus, Grafana, and custom dashboards

### SDK Architecture
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

## Transport Support

### Supported Transports
- **stdio**: Process-based communication for local executables
- **HTTP**: RESTful API with optional SSE for server-sent events
- **WebSocket**: Bidirectional real-time communication
- **SSE**: Server-sent events for streaming updates

### Transport Selection
The platform automatically detects the appropriate transport based on:
- Service configuration in the registry
- Environment variables
- Service naming patterns
- Explicit transport specification

## Development

### Running Tests
```bash
# Run all tests
npm test

# Run transport-specific tests
npm test tests/unit/transports/

# Run integration tests
python3 tests/test_phase7_integration.py
```

### Building Documentation
```bash
npm run docs
```

### Contributing
See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

## Version History
- v6.0: Phase 7 - Universal Transport Support
- v5.0: Phase 6 - Production Ready with full observability
- v4.0: Phase 5 - Ecosystem Growth with SDKs and IDE extensions
- v3.0: Phase 4 - Enterprise Features
- v2.0: Phase 3 - Production Readiness
- v1.0: Phase 2 - Developer Experience
- v1.0-beta: Phase 1 - Core Functionality

## License

MIT License - see LICENSE file for details