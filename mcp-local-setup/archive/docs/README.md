# Archived Documentation

This directory contains documentation files that have been archived because they reference features that are not yet implemented or are outdated.

## Archived Files

### API_REFERENCE.md  
- **Reason**: Contains extensive API documentation for features not yet implemented
- **Features Referenced**:
  - JWT/OAuth2 authentication endpoints
  - User management API
  - Backup/restore API
  - WebSocket API
  - Rate limiting
  - Many other enterprise features
- **Status**: Most of these APIs do not exist in the current implementation
- **Action**: Keep as a reference for future API development

### MIGRATION_GUIDE.md
- **Reason**: References version migrations between v4.x, v5.x, and v6.x
- **Status**: The platform is still in early development and hasn't had major version migrations
- **Action**: Keep for when version migration becomes necessary

## Active Documentation

The following documentation files remain active in `/docs/` as they accurately reflect the current state of the platform:

- **INDEX.md** - Documentation index (updated GitHub URLs)
- **QUICK_START.md** - Quick start guide (updated GitHub URLs)  
- **USER_GUIDE.md** - User guide for current features (updated GitHub URLs)
- **INSTALLATION_GUIDE.md** - Installation instructions (updated GitHub URLs)
- **CONFIGURATION_REFERENCE.md** - Configuration options
- **PRODUCTION_DEPLOYMENT.md** - Production deployment guide
- **OPERATIONS_MANUAL.md** - Operations manual
- **SECURITY_GUIDE.md** - Security best practices

## Recent Changes (July 26, 2025)

### Documentation Restructuring
- **SDK_USAGE.md**: Moved back to active docs after discovering SDKs ARE implemented (just not published to package managers)
- **API_CURRENT.md**: Created new file documenting the actual catalog API that exists
- **FEATURES.md**: Created comprehensive status document showing what's implemented vs planned
- **ROADMAP.md**: Added Phase 9 for completing documentation and missing features

### Updates Made

All active documentation files have been updated to:
1. Use the correct GitHub repository URL: `https://github.com/Consiliency/mcp-platform`
2. Reflect actual implementation status rather than aspirational features
3. Clarify that SDKs exist but aren't published to package managers
4. Document the actual API endpoints that are available

---

*Initial Archive: July 25, 2025*
*Updated: July 26, 2025*