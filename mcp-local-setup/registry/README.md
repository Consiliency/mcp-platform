# MCP Service Registry

The MCP Service Registry provides a centralized catalog of available Model Context Protocol (MCP) services with enhanced capabilities for dependency management, version compatibility, lifecycle configuration, and transport type metadata.

## Directory Structure

```
registry/
├── mcp-catalog.json           # Original v1.0 catalog (preserved for compatibility)
├── enhanced-catalog.json      # Enhanced v2.0 catalog with dependencies & lifecycle
├── transport-catalog.json     # Enhanced v3.0 catalog with transport metadata
├── schemas/
│   ├── enhanced-service.schema.json     # JSON Schema for v2.0 service definitions
│   └── transport-enhanced.schema.json   # JSON Schema for v3.0 with transport
├── validators/                # Validation tools
│   ├── schema-validator.js    # Validates against JSON schema
│   ├── dependency-validator.js # Checks for circular dependencies
│   ├── version-validator.js   # Validates version compatibility
│   ├── transport-validator.js # Validates transport configurations
│   ├── index.js              # Combined validator
│   └── package.json          # Validator dependencies
├── migrations/               # Migration scripts
│   ├── 001-add-dependencies.js  # v1.0 → v2.0 migration
│   ├── 002-add-transport.js     # v2.0 → v3.0 migration
│   └── README.md             # Migration documentation
├── transport-detector.js     # Auto-detects transport types
├── service-registry.interface.js  # Service registry interface with transport support
└── test-backward-compatibility.js # Backward compatibility tests

```

## Enhanced Catalog Features

The enhanced catalog (v3.0) adds transport type metadata on top of v2.0 features:

### 1. Service Dependencies
```json
{
  "id": "todo-mcp",
  "dependencies": ["postgres"],
  ...
}
```

### 2. Version Management
```json
{
  "version": "1.0.0",
  "versionCompatibility": {
    "1.0.0": {
      "minProtocolVersion": "1.0",
      "compatibleClients": {
        "claude-code": ">=1.0.0"
      }
    }
  }
}
```

### 3. Health Checks
```json
{
  "healthCheck": {
    "path": "/health",
    "interval": "30s",
    "timeout": "5s",
    "retries": 3,
    "startPeriod": "30s"
  }
}
```

### 4. Lifecycle Configuration
```json
{
  "lifecycle": {
    "startupTimeout": "60s",
    "shutdownGracePeriod": "30s",
    "restartPolicy": "unless-stopped"
  }
}
```

### 5. Transport Type Metadata (v3.0)
```json
{
  "transport": {
    "type": "http",
    "http": {
      "url": "http://localhost:${port}/mcp",
      "headers": { "Content-Type": "application/json" },
      "timeout": 30000
    },
    "autoDetect": false
  }
}
```

Supported transport types:
- **stdio**: Standard I/O for local process communication
- **http**: RESTful HTTP-based communication
- **websocket**: Bidirectional streaming via WebSocket
- **sse**: Server-Sent Events for server push

## Quick Start

### 1. Install Dependencies

```bash
cd validators
npm install
```

### 2. Migrate Existing Catalog

```bash
# Migrate v1.0 to v2.0 (add dependencies)
node migrations/001-add-dependencies.js mcp-catalog.json enhanced-catalog.json --validate

# Migrate v2.0 to v3.0 (add transport metadata)
node migrations/002-add-transport.js enhanced-catalog.json
```

### 3. Validate the Catalog

```bash
# Run all validators
cd validators
npm run validate:all

# Or run individual validators
node schema-validator.js ../transport-catalog.json
node dependency-validator.js ../transport-catalog.json
node version-validator.js ../transport-catalog.json
node transport-validator.js ../transport-catalog.json
```

## Service Examples

### Basic Service (Echo MCP)
```json
{
  "id": "echo-mcp",
  "name": "Echo MCP",
  "version": "0.1.0",
  "category": "custom",
  "dependencies": [],
  "healthCheck": {
    "path": "/health",
    "interval": "15s"
  }
}
```

### Service with Dependencies (Todo MCP)
```json
{
  "id": "todo-mcp",
  "name": "Todo MCP",
  "version": "0.1.0",
  "dependencies": ["postgres"],
  "config": {
    "env_required": ["TODO_DATABASE_URL"]
  }
}
```

## Validation

The registry includes four types of validation:

### Schema Validation
- Ensures all services conform to the enhanced-service.schema.json
- Checks required fields and data types
- Validates enum values and patterns

### Dependency Validation
- Detects circular dependencies
- Identifies missing dependencies
- Generates startup order
- Warns about high dependency counts

### Version Validation
- Validates semantic versioning
- Checks version compatibility
- Warns about version mismatches
- Generates compatibility matrix

### Transport Validation
- Validates transport type configuration
- Checks transport-specific requirements
- Detects security concerns (e.g., unencrypted WebSocket)
- Auto-detects transport types when not specified
- Validates transport compatibility between services

## Adding New Services

1. Add service definition to `transport-catalog.json`
2. Ensure it follows the transport-enhanced schema
3. Include transport configuration or let it auto-detect:
   ```json
   {
     "transport": {
       "type": "http",
       "http": { "url": "http://localhost:${port}/mcp" }
     }
   }
   ```
4. Run validators to check:
   ```bash
   cd validators
   npm run validate:all
   ```

## Migration Path

For existing installations:

1. **Backup** your current catalog
2. **Migrate** using the provided script
3. **Validate** the migrated catalog
4. **Test** with a subset of services
5. **Deploy** the enhanced catalog

## API Usage

```javascript
const catalog = require('./transport-catalog.json');
const ServiceRegistryInterface = require('./service-registry.interface');
const TransportDetector = require('./transport-detector');
const { SchemaValidator, DependencyValidator, TransportValidator } = require('./validators');

// Initialize registry
const registry = new ServiceRegistryInterface('./');

// Register a service with auto-detected transport
await registry.registerService({
  id: 'my-service',
  name: 'My Service',
  version: '1.0.0',
  config: { port: 8080 }
  // Transport will be auto-detected as HTTP
});

// Get service transport info
const transport = await registry.getServiceTransport('my-service');
console.log(`Transport type: ${transport.type}`);

// Get services by transport type
const httpServices = await registry.getServicesByTransport('http');

// Validate transport compatibility
const compat = await registry.validateTransportCompatibility('client-id', 'server-id');

// Manual transport detection
const detection = TransportDetector.detect(myService);
console.log(`Detected: ${detection.type} (${detection.confidence}% confidence)`);
```

## Best Practices

1. **Version your services** using semantic versioning
2. **Declare all dependencies** explicitly
3. **Configure health checks** appropriate to your service
4. **Set realistic timeouts** based on service complexity
5. **Use tags** for better discoverability
6. **Validate changes** before deployment
7. **Specify transport type** explicitly for production services
8. **Use secure transports** (HTTPS/WSS) in production
9. **Test transport compatibility** between dependent services

## Troubleshooting

### Validation Errors

```bash
# Check specific validation error
node validators/schema-validator.js enhanced-catalog.json

# Common issues:
# - Missing required fields (version, category)
# - Invalid version format (use X.Y.Z)
# - Unknown service in dependencies
```

### Circular Dependencies

```bash
# Detect circular dependencies
node validators/dependency-validator.js enhanced-catalog.json

# The validator will show the cycle:
# service-a → service-b → service-c → service-a
```

### Version Conflicts

```bash
# Check version compatibility
node validators/version-validator.js transport-catalog.json

# Warnings for:
# - Missing versions
# - Major version mismatches
# - Services depending on newer versions
```

### Transport Issues

```bash
# Validate transport configuration
node validators/transport-validator.js transport-catalog.json

# Common issues:
# - Missing required URL for HTTP/WebSocket
# - Using ws:// instead of wss:// in production
# - Mismatched MCP_MODE environment variable

# Test transport detection
node transport-detector.js my-service.json

# Shows:
# - Detected transport type
# - Confidence level
# - Reasoning for detection
```

## Contributing

When adding new features to the registry:

1. Update the schema if needed
2. Add migration scripts for schema changes
3. Update validators to handle new fields
4. Add tests for edge cases
5. Document changes in this README