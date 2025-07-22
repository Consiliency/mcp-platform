# Update Mechanism Implementation

This directory contains update packages and metadata for the MCP Platform.

## Directory Structure

```
updates/
├── metadata.json          # Current version and available updates
├── history.json          # Update history log
├── config.json           # Auto-update configuration
├── mcp-update-*.tar.gz   # Downloaded platform update packages
├── backups/              # Platform version backups
│   └── backup-*.tar.gz
├── services/             # Service-specific updates
│   ├── backups/         # Service backup files
│   └── migrations/      # Service migration scripts
└── temp/                # Temporary extraction directory
```

## File Descriptions

### metadata.json
Stores current platform version and available updates information:
```json
{
  "currentVersion": "1.0.0",
  "lastCheck": "2024-01-15T10:30:00Z",
  "availableUpdates": [...]
}
```

### history.json
Maintains a log of all update operations:
```json
[
  {
    "version": "1.1.0",
    "installedAt": "2024-01-15T11:00:00Z",
    "installedBy": "system",
    "previousVersion": "1.0.0",
    "success": true
  }
]
```

### config.json
Auto-update configuration:
```json
{
  "enabled": true,
  "channel": "stable",
  "schedule": "0 3 * * 0",
  "downloadOnly": false
}
```

## Scripts

- `/scripts/update-manager.js` - Platform self-update system
  - Version checking and downloads
  - Update application and rollback
  - Auto-update scheduling
  
- `/scripts/service-updater.js` - Individual service updates
  - Service version management
  - Dependency resolution
  - Breaking change detection

## Update Channels

- **stable** - Production-ready releases
- **beta** - Preview releases for testing
- **nightly** - Daily development builds

## Interface

This implementation follows the UpdateInterface defined in `/interfaces/update.interface.js`.