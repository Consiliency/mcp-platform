# Archive Directory

This directory contains files that are no longer actively used in the current version of the MCP Platform but are kept for historical reference.

## Directory Structure

### `/planning/`
Contains planning documents and scripts from earlier development phases:
- **NEXT-STEPS-PLAN.md** - Original Phase 2-5 planning document (completed Phase 2)
- **PHASE-1-IMPLEMENTATION.md** - Phase 1 implementation guide (completed)
- **SECURITY-IMPLEMENTATION-SUMMARY.md** - Phase 3 security implementation summary (completed)
- **launch-phase3-agents.sh** - Script used to launch parallel development agents for Phase 3

### `/phase-implementations/`
Implementation guides and summaries from completed phases:
- **PHASE6_IMPLEMENTATION.md** - Phase 6 implementation guide with team boundaries
- **PHASE6_BOUNDARIES.md** - Phase 6 team boundary definitions
- **DOCKER_PRODUCTION_SUMMARY.md** - Docker production setup summary
- **IMPLEMENTATION_SUMMARY.md** - General implementation summary
- **DASHBOARD_IMPLEMENTATION.md** - Dashboard implementation details from Phase 7
- **TRANSPORT_IMPLEMENTATION.md** - Transport implementation details from Phase 7

### `/legacy/`
Older components and configurations that have been replaced:
- **MIGRATION-GUIDE.md** - Old migration guide for early versions
- **PLAYWRIGHT-MCP-README.md** - Documentation for the Playwright MCP service
- **nginx.conf** - Nginx configuration (replaced by Traefik)
- **playwright-mcp/** - Complete Playwright MCP service (example implementation)

### `/legacy-docs/`
Superseded documentation files:
- **API.md** - Original API documentation (replaced by API_REFERENCE.md)
- **DEPLOYMENT.md** - Original deployment guide (replaced by PRODUCTION_DEPLOYMENT.md)

### `/release-notes/`
Historical release notes from completed phases:
- **PHASE6_RELEASE_NOTES.md** - Phase 6 release notes
- **PHASE7_RELEASE_NOTES.md** - Phase 7 release notes

### `/test/`
Old testing scripts and files:
- **test-phase1.sh** - Phase 1 testing script (superseded by Jest tests)
- **backups/** - Test backup files generated during integration testing
  - Various .tar.gz backup files
  - Test metadata.json and schedules.json

### `/development/`
Development utilities and scripts:
- **test-validators.sh** - Development script for testing registry validators

## Note
These files are archived to keep the main directory clean and focused on the current implementation. They may contain valuable historical context or be referenced in future development.

## Organization Guidelines
- Planning documents go in `/planning/`
- Phase-specific implementation docs go in `/phase-implementations/`
- Replaced system components go in `/legacy/`
- Old documentation versions go in `/legacy-docs/`
- Historical release notes go in `/release-notes/`
- Test scripts and data go in `/test/`
- Development utilities go in `/development/`