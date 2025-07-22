# Backup Directory

This directory stores platform backups and related metadata.

## Directory Structure

```
backup/
├── archives/          # Compressed backup archives (.tar.gz files)
├── temp/             # Temporary directory for backup/restore operations
├── metadata.json     # Backup metadata index
└── schedules.json    # Scheduled backup configurations
```

## Backup Types

### Full Backup
- Complete snapshot of all services and data
- Includes configuration, volumes, and optionally logs
- Largest backup size but self-contained

### Incremental Backup
- Only changes since last backup
- Smaller size, faster to create
- Requires base backup for restoration

### Service Backup
- Selective backup of specific services
- Useful for partial migrations or updates
- Can include or exclude data volumes

## Usage

### Creating a Backup
```bash
mcp backup create --type full --description "Pre-upgrade backup"
mcp backup create --type service --services filesystem,git
```

### Listing Backups
```bash
mcp backup list
mcp backup list --type full --days 7
```

### Restoring from Backup
```bash
mcp backup restore <backup-id>
mcp backup restore <backup-id> --services filesystem --dry-run
```

### Scheduling Backups
```bash
mcp backup schedule "0 2 * * *" --type full --compress
mcp backup schedule list
mcp backup schedule delete <schedule-id>
```

## Storage Management

Backups are stored as compressed tar archives in the `archives/` subdirectory. 
Metadata is maintained in JSON format for quick access without extracting archives.

### Cleanup Policy
- Keep last 10 backups by default
- Remove backups older than 30 days
- Manual cleanup: `mcp backup cleanup --keep 5 --days 14`

## Security Considerations

- Backups may contain sensitive data
- Ensure proper file permissions (600) on backup files
- Consider encryption for external storage
- Verify backup integrity before restoration

## Implementation Details

### Scripts
- `/scripts/backup-manager.js` - Main backup management implementation
- `/scripts/data-manager.js` - Data persistence and migration

### Interface
This implementation follows the BackupInterface defined in `/interfaces/backup.interface.js`.