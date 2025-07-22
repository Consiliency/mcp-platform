#!/bin/bash

# Launch script for Phase 3 parallel Claude Code agents
# This script opens 4 terminal windows with Claude Code agents for parallel development

echo "Launching Phase 3 Parallel Development Agents..."
echo "================================================"

# Security Implementation Agent
echo "1. Launching Security Implementation Agent in /home/jenner/code/mcps-security"
gnome-terminal --title="Security Agent" --working-directory=/home/jenner/code/mcps-security -- bash -c '
claude "You are working on Phase 3 Security Implementation for the MCP Platform. Your worktree is at /home/jenner/code/mcps-security working on branch feature/security-implementation.

Focus on implementing:
1. security/auth/ directory (SECURITY-3.1):
   - API key generation and management
   - Service authentication middleware  
   - Token rotation system

2. security/network/ directory (SECURITY-3.2):
   - Service isolation configurations
   - CORS policy management
   - Rate limiting rules

3. security/tls/ directory (SECURITY-3.3):
   - Let'\''s Encrypt integration
   - Self-signed certificate generation
   - Certificate renewal automation

Use the SecurityInterface at interfaces/security.interface.js as your contract.
Create unit tests in tests/unit/security/
Update integration tests at tests/integration/security.integration.test.js

IMPORTANT: Only modify files in security/, tests/unit/security/, and tests/integration/security.integration.test.js. Do NOT modify any other files to avoid merge conflicts." --allow-file-create "security/**/*" --allow-file-create "tests/unit/security/**/*" --allow-file-edit "tests/integration/security.integration.test.js"
'

sleep 2

# Backup & Restore Agent
echo "2. Launching Backup & Restore Agent in /home/jenner/code/mcps-backup"
gnome-terminal --title="Backup Agent" --working-directory=/home/jenner/code/mcps-backup -- bash -c '
claude "You are working on Phase 3 Backup & Restore for the MCP Platform. Your worktree is at /home/jenner/code/mcps-backup working on branch feature/backup-restore.

Focus on implementing:
1. scripts/backup-manager.js (BACKUP-3.1):
   - mcp backup create implementation
   - mcp backup restore implementation
   - Backup scheduling system

2. scripts/data-manager.js (BACKUP-3.2):
   - Volume backup strategies
   - Service data export/import
   - Migration tooling

3. backup/ directory structure for storing backups

Use the BackupInterface at interfaces/backup.interface.js as your contract.
Create unit tests in tests/unit/backup/
Update integration tests at tests/integration/backup.integration.test.js

IMPORTANT: Only modify scripts/backup-manager.js, scripts/data-manager.js, backup/, tests/unit/backup/, and tests/integration/backup.integration.test.js. Do NOT modify any other files to avoid merge conflicts." --allow-file-create "scripts/backup-manager.js" --allow-file-create "scripts/data-manager.js" --allow-file-create "backup/**/*" --allow-file-create "tests/unit/backup/**/*" --allow-file-edit "tests/integration/backup.integration.test.js"
'

sleep 2

# Update Mechanism Agent
echo "3. Launching Update Mechanism Agent in /home/jenner/code/mcps-update"
gnome-terminal --title="Update Agent" --working-directory=/home/jenner/code/mcps-update -- bash -c '
claude "You are working on Phase 3 Update Mechanism for the MCP Platform. Your worktree is at /home/jenner/code/mcps-update working on branch feature/update-mechanism.

Focus on implementing:
1. scripts/update-manager.js (UPDATE-3.1):
   - Platform version checking
   - Automatic update downloads
   - Rollback capabilities

2. scripts/service-updater.js (UPDATE-3.2):
   - Individual service updates
   - Dependency resolution
   - Breaking change detection

3. updates/ directory for update metadata and packages

Use the UpdateInterface at interfaces/update.interface.js as your contract.
Create unit tests in tests/unit/update/
Update integration tests at tests/integration/update.integration.test.js

IMPORTANT: Only modify scripts/update-manager.js, scripts/service-updater.js, updates/, tests/unit/update/, and tests/integration/update.integration.test.js. Do NOT modify any other files to avoid merge conflicts." --allow-file-create "scripts/update-manager.js" --allow-file-create "scripts/service-updater.js" --allow-file-create "updates/**/*" --allow-file-create "tests/unit/update/**/*" --allow-file-edit "tests/integration/update.integration.test.js"
'

sleep 2

# Configuration Management Agent
echo "4. Launching Configuration Management Agent in /home/jenner/code/mcps-config"
gnome-terminal --title="Config Agent" --working-directory=/home/jenner/code/mcps-config -- bash -c '
claude "You are working on Phase 3 Configuration Management for the MCP Platform. Your worktree is at /home/jenner/code/mcps-config working on branch feature/config-management.

Focus on implementing:
1. config/advanced/ directory (CONFIG-3.1):
   - Environment-specific configs
   - Secret management
   - Configuration validation

2. scripts/migration/ directory (CONFIG-3.2):
   - Config format migrations
   - Data migrations
   - Version upgrade paths

Use the ConfigurationInterface at interfaces/configuration.interface.js as your contract.
Create unit tests in tests/unit/config/
Update integration tests at tests/integration/configuration.integration.test.js

IMPORTANT: Only modify config/advanced/, scripts/migration/, tests/unit/config/, and tests/integration/configuration.integration.test.js. Do NOT modify any other files to avoid merge conflicts." --allow-file-create "config/advanced/**/*" --allow-file-create "scripts/migration/**/*" --allow-file-create "tests/unit/config/**/*" --allow-file-edit "tests/integration/configuration.integration.test.js"
'

echo ""
echo "All agents launched!"
echo "==================="
echo ""
echo "Monitor progress with:"
echo "  cd /home/jenner/code/mcps-security && git status"
echo "  cd /home/jenner/code/mcps-backup && git status"
echo "  cd /home/jenner/code/mcps-update && git status"
echo "  cd /home/jenner/code/mcps-config && git status"
echo ""
echo "When agents complete their work, merge branches in this order:"
echo "  1. Security"
echo "  2. Configuration" 
echo "  3. Backup"
echo "  4. Update"