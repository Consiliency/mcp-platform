# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MCP Platform is a Docker-based local development environment for running Model Context Protocol (MCP) servers. It provides a unified interface for multiple AI coding assistants through a Traefik reverse proxy with dynamic service management via profiles and a service registry.

## Key Commands

### Platform Management
```bash
# Installation (from project root)
./install.sh              # Linux/WSL installation
./install.ps1             # Windows PowerShell installation

# Service control (after installation)
mcp start                 # Start all services in current profile
mcp stop                  # Stop all services
mcp restart               # Restart services
mcp status                # Show service status
mcp logs [service]        # View logs (add -f to follow)

# Profile management
mcp profile list          # List available profiles
mcp profile switch dev    # Switch to development profile
mcp profile create custom # Create new profile interactively

# Service management
mcp list                  # List all available MCP servers
mcp install postgres      # Install a new service
mcp info filesystem       # Get detailed service information
```

### Development Commands
```bash
# Regenerate docker-compose.yml from current profile
node scripts/registry-manager.js generate [profile-name]

# Update .well-known/mcp-manifest.json
node scripts/registry-manager.js update-manifest

# Test service connectivity
curl http://localhost:8080/mcp/filesystem
curl http://localhost:8080/.well-known/mcp-manifest.json

# Access Traefik dashboard
open http://localhost:8080/dashboard
```

## Architecture

### Service Registry System
The platform uses a centralized registry (`registry/mcp-catalog.json`) that defines all available MCP servers. Each service entry contains:
- Source information (npm package or local path)
- Docker configuration (image or build instructions)
- Port assignments and environment variables
- Client compatibility information

The registry manager (`scripts/registry-manager.js`) dynamically generates `docker-compose.yml` based on the active profile and installed services.

### Profile System
Profiles (`profiles/*.yml`) define sets of services for different workflows. When switching profiles:
1. Profile manager updates `.current-profile` file
2. Registry manager regenerates docker-compose.yml
3. Services are restarted with new configuration

### Routing Architecture
Traefik acts as the central reverse proxy:
- HTTP traffic on port 8080 with path-based routing: `/mcp/{service-name}`
- WebSocket support on port 8081
- Dynamic service discovery via Docker labels
- Automatic SSL/TLS termination capabilities

### Service Templates
Docker templates in `templates/` provide standardized builds:
- `npm.Dockerfile`: For NPM-based MCP servers
- Services can override with custom Dockerfiles

## Adding New MCP Servers

### 1. Add to Service Registry
Edit `registry/mcp-catalog.json`:
```json
{
  "id": "my-service",
  "name": "My Service",
  "description": "Service description",
  "category": "development",
  "source": {
    "type": "npm",
    "package": "@org/mcp-my-service"
  },
  "docker": {
    "build": {
      "dockerfile": "templates/npm.Dockerfile",
      "args": {
        "PACKAGE": "@org/mcp-my-service"
      }
    }
  },
  "config": {
    "port": 3010,
    "environment": {
      "MCP_MODE": "http"
    }
  }
}
```

### 2. Add to Profile
Edit `profiles/development.yml`:
```yaml
services:
  - filesystem
  - git
  - my-service  # Add here
```

### 3. Regenerate and Restart
```bash
node scripts/registry-manager.js generate development
mcp restart
```

## Client Configuration

### Dynamic Generation
The platform can generate client configurations:
```bash
mcp config --generate  # Generates configs for all detected clients
```

### Manual Configuration
For VS Code/Cursor, add to settings.json:
```json
{
  "mcpServers": {
    "service-name": {
      "url": "http://localhost:8080/mcp/service-name"
    }
  }
}
```

## Environment Variables

Create `.env` file in project root for service credentials:
```env
GITHUB_TOKEN=ghp_xxxx
POSTGRES_URL=postgresql://user:pass@localhost/db
GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxx
SLACK_BOT_TOKEN=xoxb-xxxx
```

## Cross-Platform Considerations

### WSL2 Integration
- The platform auto-detects WSL2 and configures networking
- For Windows access to WSL services, ensure mirrored networking is enabled
- Use `wsl.exe` wrapper for Windows commands accessing Linux MCP servers

### Path Handling
- Use environment variables for paths: `${HOME}`, `${MCP_HOME}`
- Volume mounts are automatically adjusted for Windows/Linux compatibility

## Debugging

### Service Issues
```bash
# Check specific service logs
mcp logs playwright -f

# Direct Docker inspection
docker compose -f docker-compose.yml ps
docker compose -f docker-compose.yml logs service-name

# Test service endpoint
curl -v http://localhost:8080/mcp/service-name
```

### Profile Issues
```bash
# Check current profile
cat .current-profile

# Validate profile syntax
cat profiles/development.yml

# Force regenerate
rm docker-compose.yml
node scripts/registry-manager.js generate
```

### Network Issues
```bash
# Check Traefik routing
curl http://localhost:8080/api/http/routers

# Verify service registration
docker network ls
docker network inspect mcp-local-setup_mcp_network
```

## Project Structure Notes

- `docker-compose.yml` is auto-generated - never edit directly
- Service configurations live in the registry, not in docker-compose
- Profiles define service combinations, not service configurations
- The CLI tools wrap Docker Compose commands with profile awareness
- Traefik configuration supports both HTTP and WebSocket transports