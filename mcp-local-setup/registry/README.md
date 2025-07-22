# MCP Service Registry

The MCP Service Registry provides a centralized catalog of available Model Context Protocol (MCP) services with enhanced capabilities for dependency management, version compatibility, and lifecycle configuration.

## Directory Structure

```
registry/
├── mcp-catalog.json           # Original v1.0 catalog (preserved for compatibility)
├── enhanced-catalog.json      # Enhanced v2.0 catalog with dependencies & lifecycle
├── schemas/
│   └── enhanced-service.schema.json  # JSON Schema for service definitions
├── validators/                # Validation tools
│   ├── schema-validator.js    # Validates against JSON schema
│   ├── dependency-validator.js # Checks for circular dependencies
│   ├── version-validator.js   # Validates version compatibility
│   ├── index.js              # Combined validator
│   └── package.json          # Validator dependencies
├── migrations/               # Migration scripts
│   ├── 001-add-dependencies.js  # v1.0 → v2.0 migration
│   └── README.md             # Migration documentation
└── service-registry.interface.js  # Service registry interface

```

## Enhanced Catalog Features

The enhanced catalog (v2.0) adds:

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

## Quick Start

### 1. Install Dependencies

```bash
cd validators
npm install
```

### 2. Migrate Existing Catalog

```bash
# Create enhanced catalog from existing
node migrations/001-add-dependencies.js mcp-catalog.json enhanced-catalog.json --validate
```

### 3. Validate the Catalog

```bash
# Run all validators
cd validators
npm run validate:all

# Or run individual validators
node schema-validator.js ../enhanced-catalog.json
node dependency-validator.js ../enhanced-catalog.json
node version-validator.js ../enhanced-catalog.json
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

The registry includes three types of validation:

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

## Adding New Services

1. Add service definition to `enhanced-catalog.json`
2. Ensure it follows the schema
3. Run validators to check:
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
const catalog = require('./enhanced-catalog.json');
const { SchemaValidator, DependencyValidator } = require('./validators');

// Validate a service
const validator = new SchemaValidator();
const result = validator.validateService(myService);

// Get startup order
const depValidator = new DependencyValidator();
depValidator.loadCatalog(catalog);
const startupOrder = depValidator.getStartupOrder();
```

## Best Practices

1. **Version your services** using semantic versioning
2. **Declare all dependencies** explicitly
3. **Configure health checks** appropriate to your service
4. **Set realistic timeouts** based on service complexity
5. **Use tags** for better discoverability
6. **Validate changes** before deployment

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
node validators/version-validator.js enhanced-catalog.json

# Warnings for:
# - Missing versions
# - Major version mismatches
# - Services depending on newer versions
```

## Contributing

When adding new features to the registry:

1. Update the schema if needed
2. Add migration scripts for schema changes
3. Update validators to handle new fields
4. Add tests for edge cases
5. Document changes in this README