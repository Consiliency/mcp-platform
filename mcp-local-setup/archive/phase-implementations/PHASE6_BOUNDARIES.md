# Phase 6 Development Boundaries

## Quick Reference for Parallel Teams

### NEW Files Created (Stubs with TODOs)

#### Security API Team
- `/security/api-auth/oauth.js` - OAuth2 implementation
- `/security/middleware/cors.js` - CORS middleware
- `/security/validation/input-validator.js` - Input validation
- `/config/production/api.config.js` - API configuration

#### Docker Production Team  
- `/docker/production/docker-compose.prod.yml` - Production orchestration
- `/docker/production/go.Dockerfile` - Go service container

#### CI/CD Team
- `/.github/workflows/ci.yml` - CI pipeline
- `/.github/workflows/cd.yml` - CD pipeline
- `/.github/workflows/release.yml` - Release automation
- `/scripts/build/build.js` - Build orchestrator
- `/scripts/build/package.js` - Package builder
- `/scripts/build/test-runner.js` - Test runner
- `/config/production/deployment.config.js` - Deployment configuration

#### Observability Team
- `/config/production/monitoring.config.js` - Monitoring configuration

#### All Teams
- `/docs/PHASE6_IMPLEMENTATION.md` - Implementation guide
- `/mcp-local-setup/config/production/env.template` - Environment template

### EXISTING Files/Directories (Do NOT recreate)

#### Security API Team
- `/security/api-auth/api-key.js` - Existing API key implementation
- `/security/api-auth/jwt-auth.js` - Existing JWT implementation
- `/security/middleware/security.js` - Existing security middleware
- `/security/rate-limiting/rate-limiter.js` - Existing rate limiter

#### Docker Production Team
- `/docker/health/` - Existing health monitoring
- `/docker/production/node.Dockerfile` - Existing Node.js Dockerfile
- `/docker/production/python.Dockerfile` - Existing Python Dockerfile
- `/docker/production/nginx.conf` - Existing nginx configuration
- `/docker/production/graceful-shutdown.js` - Existing shutdown handler

#### Observability Team
- `/monitoring/logging/logger.js` - Existing logger
- `/monitoring/metrics/metrics.js` - Existing metrics collector
- `/monitoring/errors/error-tracker.js` - Existing error tracker
- `/monitoring/dashboards/` - Existing dashboard definitions

### Interface Files (Must be implemented)

All teams must implement the interfaces defined in:
- `/interfaces/phase6/` - Phase 6 specific interfaces
- `/interfaces/phase5/` - Existing Phase 5 interfaces (where applicable)

### Integration Test Locations

- `/tests/integration/phase6/` - Phase 6 integration tests
- `/tests/unit/` - Unit tests for your components

## Important Notes

1. **DO NOT** modify existing implementations without coordination
2. **DO** extend existing functionality where it makes sense
3. **DO** follow the TODO markers in stub files
4. **DO** communicate with other teams on shared boundaries
5. **DO** write tests for all new functionality

## Communication Channels

Use the TODO markers in files to communicate progress:
- `TODO: [In Progress] <description>` - Currently working on
- `TODO: [Blocked] <description>` - Blocked by dependency
- `TODO: [Done] <description>` - Completed, ready for review
- `TODO: [Team X Input Needed] <description>` - Need input from another team