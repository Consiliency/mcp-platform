# Archive Directory

This directory contains files that are no longer actively used in the current version of the MCP Platform but are kept for historical reference.

## Directory Structure

### `/planning/`
- **NEXT-STEPS-PLAN.md** - Original Phase 2-5 planning document (completed Phase 2)
- **PHASE-1-IMPLEMENTATION.md** - Phase 1 implementation guide (completed)
- **SECURITY-IMPLEMENTATION-SUMMARY.md** - Phase 3 security implementation summary (completed)
- **launch-phase3-agents.sh** - Script used to launch parallel development agents for Phase 3

### `/legacy/`
- **MIGRATION-GUIDE.md** - Old migration guide for early versions
- **PLAYWRIGHT-MCP-README.md** - Documentation for the Playwright MCP service
- **nginx.conf** - Nginx configuration (replaced by Traefik)
- **playwright-mcp/** - Complete Playwright MCP service (example implementation)

### `/test/`
- **test-phase1.sh** - Phase 1 testing script (superseded by Jest tests)
- **backups/** - Test backup files generated during integration testing
  - Various .tar.gz backup files
  - Test metadata.json and schedules.json

### `/development/`
- **test-validators.sh** - Development script for testing registry validators

## Note
These files are archived to keep the main directory clean and focused on the current implementation. They may contain valuable historical context or be referenced in future development.