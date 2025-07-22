# MCP Configuration Management Guide

## Overview

The MCP Configuration Management system provides a robust, secure, and flexible way to manage configurations across different environments. It includes support for:

- Environment-specific configurations
- Encrypted secret management
- Configuration validation
- Version migrations
- Import/Export capabilities

## Architecture

### Core Components

1. **ConfigurationManager** (`configuration-manager.js`)
   - Main interface implementation
   - Handles all configuration operations
   - Manages environments, secrets, and migrations

2. **ConfigValidator** (`config-validator.js`)
   - Advanced validation utilities
   - Environment-specific constraints
   - Security validation
   - Service dependency checking

3. **SecretManager** (`secret-manager.js`)
   - Encryption/decryption of sensitive data
   - Key management and rotation
   - Password generation
   - Audit logging

4. **MigrationRunner** (`scripts/migration/migration-runner.js`)
   - Executes configuration migrations
   - Finds migration paths between versions
   - Creates migration templates

## Directory Structure

```
config/advanced/
├── environments/       # Environment-specific configurations
│   ├── development.json
│   ├── staging.json
│   └── production.json
├── schemas/           # Configuration schemas
│   ├── schema.json    # Current schema
│   └── schema-v*.json # Version-specific schemas
└── secrets/           # Encrypted secrets by environment
    ├── development/
    ├── staging/
    └── production/
```

## Getting Started

### 1. Initialize the System

```bash
# Set encryption key (required for secrets)
export MCP_CONFIG_ENCRYPTION_KEY=$(openssl rand -hex 32)

# Initialize directory structure
./config/advanced/config-cli.js init
```

### 2. Create an Environment

```bash
# Interactive environment creation
./config/advanced/config-cli.js create development

# Or programmatically
const ConfigurationManager = require('./config/advanced/configuration-manager');
const config = new ConfigurationManager();

await config.createEnvironment('development', {
    server: { host: 'localhost', port: 3000 },
    database: { host: 'localhost', port: 5432 }
});
```

### 3. Manage Secrets

```bash
# Set a secret
./config/advanced/config-cli.js secret set development DB_PASSWORD

# List secrets
./config/advanced/config-cli.js secret list development

# Generate secure password
./config/advanced/config-cli.js secret generate 32
```

## Configuration Schema

The default schema (`schemas/schema.json`) defines the structure and validation rules:

```json
{
  "version": "1.0.0",
  "properties": {
    "environment": { "type": "string" },
    "version": { "type": "string" },
    "server": {
      "type": "object",
      "properties": {
        "host": { "type": "string" },
        "port": { "type": "number" },
        "protocol": { "type": "string" }
      }
    },
    "database": {
      "type": "object",
      "properties": {
        "host": { "type": "string" },
        "password": { "type": "string" }
      }
    }
  },
  "required": ["environment", "version"]
}
```

## Using Secrets in Configuration

Reference secrets using placeholders:

```json
{
  "database": {
    "host": "prod-db.example.com",
    "password": "${DB_PASSWORD}"
  },
  "services": {
    "weather": {
      "apiKey": "${WEATHER_API_KEY}"
    }
  }
}
```

## Configuration Validation

### Basic Validation

```javascript
const result = await config.validateConfig(myConfig);
if (!result.valid) {
    console.error('Validation errors:', result.errors);
}
```

### Environment-Specific Validation

```javascript
const validator = new ConfigValidator();
const result = validator.validateEnvironmentConstraints(config, 'production');

// Production constraints:
// - strictValidation must be true
// - debugMode must be false
// - HTTPS protocol recommended
```

### Security Validation

```javascript
const result = validator.validateSecurity(config);
// Detects plain text secrets
// Validates auth configuration
// Checks rate limiting settings
```

## Configuration Migration

### Creating Migrations

```bash
# Create migration template
./scripts/migration/migration-runner.js create 1.0.0 1.1.0
```

### Running Migrations

```bash
# Migrate configuration
./config/advanced/config-cli.js migrate production 1.1.0

# Or programmatically
const result = await config.migrateConfig(oldConfig, '1.0.0', '1.1.0');
```

### Migration Example

```javascript
// migrate-1.0.0-to-1.1.0.js
module.exports = {
    migrate: async (config) => {
        const result = {
            success: true,
            config: { ...config },
            changes: [],
            warnings: []
        };
        
        // Add new fields
        if (!result.config.monitoring) {
            result.config.monitoring = {
                enabled: true,
                interval: 60000
            };
            result.changes.push('Added monitoring configuration');
        }
        
        result.config.version = '1.1.0';
        return result;
    }
};
```

## Import/Export

### Export Configuration

```bash
# Export as JSON
./config/advanced/config-cli.js export production > prod-config.json

# Export as environment variables
./config/advanced/config-cli.js export production env > prod.env
```

### Import Configuration

```bash
# Import from file
./config/advanced/config-cli.js import staging config.json

# Merge with existing
const config = new ConfigurationManager();
await config.importConfig(data, 'staging', { merge: true });
```

## API Reference

### ConfigurationManager

```javascript
// Load configuration
const config = await configManager.loadConfig('production', {
    includeSecrets: true,
    validate: true,
    overrides: { debug: false }
});

// Save configuration
await configManager.saveConfig(config, 'production', {
    backup: true,
    validate: true
});

// List environments
const environments = await configManager.listEnvironments();

// Manage secrets
await configManager.setSecrets({ API_KEY: 'secret' }, { environment: 'prod' });
const secrets = await configManager.getSecrets(['API_KEY'], { environment: 'prod' });
```

## Best Practices

1. **Environment Separation**
   - Keep development, staging, and production configs separate
   - Use appropriate validation for each environment
   - Never commit secrets to version control

2. **Secret Management**
   - Always use environment variables for the master encryption key
   - Rotate secrets regularly
   - Use placeholders (${SECRET_NAME}) in configurations
   - Audit secret access

3. **Validation**
   - Validate configurations before deployment
   - Use environment-specific validation rules
   - Check for security issues (plain text secrets)
   - Validate service dependencies

4. **Migrations**
   - Always backup before migrations
   - Test migrations in development first
   - Document changes in migration files
   - Handle backward compatibility

5. **Version Control**
   - Commit configuration files (without secrets)
   - Commit schemas and migrations
   - Use .gitignore for secrets directory
   - Document configuration changes

## Security Considerations

1. **Encryption**
   - Uses AES-256-GCM for secret encryption
   - Master key should be stored securely
   - Support for key rotation

2. **Access Control**
   - Limit access to production configurations
   - Use environment variables for sensitive settings
   - Audit configuration changes

3. **Validation**
   - Prevents plain text secrets
   - Enforces security constraints
   - Validates authentication settings

## Troubleshooting

### Common Issues

1. **"Encryption key not configured"**
   ```bash
   export MCP_CONFIG_ENCRYPTION_KEY=$(openssl rand -hex 32)
   ```

2. **"Configuration for environment not found"**
   ```bash
   ./config/advanced/config-cli.js create <environment>
   ```

3. **"No migration path found"**
   - Check available migrations
   - Create intermediate migrations if needed

### Debug Mode

Enable debug logging:
```javascript
const config = new ConfigurationManager({ debug: true });
```

## Examples

### Complete Example

```javascript
const ConfigurationManager = require('./config/advanced/configuration-manager');
const ConfigValidator = require('./config/advanced/config-validator');

async function setupProduction() {
    // Initialize
    const config = new ConfigurationManager({
        encryptionKey: process.env.MCP_CONFIG_ENCRYPTION_KEY
    });
    
    // Create production environment
    await config.createEnvironment('production', {
        server: { host: '0.0.0.0', port: 443, protocol: 'https' },
        database: { host: 'prod-db', password: '${DB_PASSWORD}' },
        features: { strictValidation: true, debugMode: false }
    });
    
    // Set secrets
    await config.setSecrets({
        DB_PASSWORD: 'super-secret-password',
        API_KEY: 'production-api-key'
    }, { environment: 'production' });
    
    // Validate
    const validator = new ConfigValidator();
    const prodConfig = await config.loadConfig('production', { includeSecrets: true });
    const validation = validator.validateEnvironmentConstraints(prodConfig, 'production');
    
    if (!validation.valid) {
        throw new Error('Production config invalid');
    }
    
    return prodConfig;
}
```

This configuration system provides a complete solution for managing MCP platform configurations with security, validation, and migration capabilities built-in.