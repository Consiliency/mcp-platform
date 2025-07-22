# MCP Registry Migrations

This directory contains migration scripts for upgrading the MCP service catalog between different schema versions.

## Overview

Migrations are used to transform catalog data from one version to another, adding new fields and maintaining backward compatibility. Each migration is a standalone script that can be run independently.

## Migration Files

### 001-add-dependencies.js

**Version:** 1.0 → 2.0

This migration adds the following enhancements to the service catalog:

- **version**: Semantic version for each service
- **dependencies**: Array of service IDs that must be started first
- **healthCheck**: Configuration for health monitoring
- **lifecycle**: Startup and shutdown behavior settings
- **tags**: Searchable tags for categorization
- **versionCompatibility**: Matrix of version requirements

## Running Migrations

### Basic Usage

```bash
# Migrate a catalog file
node migrations/001-add-dependencies.js mcp-catalog.json enhanced-catalog.json

# Validate the migration
node migrations/001-add-dependencies.js mcp-catalog.json enhanced-catalog.json --validate

# Dry run (preview changes without writing)
node migrations/001-add-dependencies.js mcp-catalog.json enhanced-catalog.json --dry-run
```

### Validation

After migration, validate the new catalog:

```bash
# Validate schema compliance
node validators/schema-validator.js enhanced-catalog.json

# Check for dependency issues
node validators/dependency-validator.js enhanced-catalog.json

# Verify version compatibility
node validators/version-validator.js enhanced-catalog.json
```

## Migration Process

1. **Backup**: Always backup your original catalog before migrating
   ```bash
   cp mcp-catalog.json mcp-catalog.json.backup
   ```

2. **Migrate**: Run the migration script
   ```bash
   node migrations/001-add-dependencies.js mcp-catalog.json enhanced-catalog.json
   ```

3. **Validate**: Ensure the migrated catalog is valid
   ```bash
   node validators/schema-validator.js enhanced-catalog.json
   ```

4. **Test**: Test your services with the new catalog format

5. **Deploy**: Replace the old catalog with the enhanced version

## Writing New Migrations

Each migration should:

1. Extend a consistent interface with `up()` and `down()` methods
2. Include version checking to ensure correct source version
3. Preserve all existing data while adding new fields
4. Provide validation of the migration result
5. Support dry-run mode for testing

Example structure:

```javascript
class MigrationXXX {
  constructor() {
    this.name = 'xxx-description';
    this.fromVersion = 'X.X';
    this.toVersion = 'Y.Y';
  }

  up(catalog) {
    // Transform catalog from old to new format
  }

  down(catalog) {
    // Reverse the transformation
  }

  validate(original, migrated) {
    // Verify migration was successful
  }
}
```

## Default Values

The migration scripts use intelligent defaults:

### Health Check Defaults
- **interval**: 30s
- **timeout**: 5s (10s for cloud services)
- **retries**: 3
- **startPeriod**: 30s (longer for complex services)

### Lifecycle Defaults
- **startupTimeout**: 60s (90-120s for complex services)
- **shutdownGracePeriod**: 30s
- **restartPolicy**: unless-stopped

### Version Defaults
- NPM packages with "latest": 1.0.0
- Local packages: 0.1.0
- Others: 1.0.0

## Rollback

If you need to rollback a migration:

1. Keep the original catalog file as backup
2. Use the `down()` method if implemented
3. Or simply restore from backup:
   ```bash
   cp mcp-catalog.json.backup mcp-catalog.json
   ```

## Best Practices

1. **Test First**: Always run with `--dry-run` first
2. **Validate**: Use the validation tools after migration
3. **Incremental**: Apply migrations in order
4. **Document**: Update this README when adding new migrations
5. **Backward Compatible**: Ensure old clients can still read critical fields