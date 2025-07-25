# MCP Platform User Guide

A comprehensive guide to using the Model Context Protocol (MCP) Platform for local development and production deployments.

## Table of Contents

1. [Platform Overview](#platform-overview)
2. [Architecture](#architecture)
3. [Service Management](#service-management)
4. [Profile System](#profile-system)
5. [Client Configuration](#client-configuration)
6. [Working with Services](#working-with-services)
7. [Advanced Features](#advanced-features)
8. [Best Practices](#best-practices)
9. [Troubleshooting](#troubleshooting)

## Platform Overview

The MCP Platform is a Docker-based environment that enables you to run Model Context Protocol servers locally with support for multiple AI coding assistants. It provides:

- **Unified Interface**: Single endpoint for all MCP services
- **Service Discovery**: Dynamic service registration and discovery
- **Health Monitoring**: Real-time service health checks
- **Profile Management**: Switch between different service configurations
- **Multi-Client Support**: Works with Claude, VS Code, Cursor, and more

### Key Components

1. **Traefik Gateway**: Reverse proxy handling all incoming requests
2. **Service Registry**: Catalog of available MCP services
3. **Profile Manager**: Configuration sets for different workflows
4. **Health Monitor**: Service health and status tracking
5. **CLI Tool**: Command-line interface for platform management

## Architecture

### System Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   AI Clients    │     │   AI Clients    │     │   AI Clients    │
│  (Claude Code)  │     │   (VS Code)     │     │   (Cursor)      │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         └───────────────────────┴───────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   Traefik Gateway       │
                    │   (localhost:8080)      │
                    └────────────┬────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
    ┌────▼─────┐          ┌─────▼─────┐          ┌─────▼─────┐
    │Filesystem│          │    Git    │          │ Postgres  │
    │   MCP    │          │    MCP    │          │    MCP    │
    └──────────┘          └───────────┘          └───────────┘
```

### Network Architecture

- **HTTP Traffic**: Port 8080 with path-based routing (`/mcp/{service}`)
- **WebSocket Support**: Port 8081 for real-time connections
- **Dashboard**: Port 8080/dashboard for web UI
- **Internal Network**: Docker bridge network for service communication

## Service Management

### Installing Services

```bash
# Install a single service
mcp install filesystem

# Install multiple services
mcp install git postgres playwright

# Install with specific version
mcp install filesystem@1.2.0
```

### Service Lifecycle

```bash
# Start services
mcp start                    # Start all services in profile
mcp start filesystem         # Start specific service

# Stop services  
mcp stop                     # Stop all services
mcp stop filesystem          # Stop specific service

# Restart services
mcp restart                  # Restart all services
mcp restart filesystem       # Restart specific service

# Remove services
mcp uninstall filesystem     # Remove service
```

### Service Information

```bash
# List all available services
mcp list

# Get detailed service info
mcp info filesystem

# Check service status
mcp status

# View service health
mcp health
mcp health filesystem
```

### Service Logs

```bash
# View logs for all services
mcp logs

# View logs for specific service
mcp logs filesystem

# Follow logs in real-time
mcp logs -f filesystem

# Show last 100 lines
mcp logs --tail 100 filesystem
```

## Profile System

Profiles allow you to define sets of services for different workflows.

### Built-in Profiles

1. **default**: Essential services (filesystem, git)
2. **development**: Full development stack
3. **ai-ml**: AI/ML focused services
4. **minimal**: Lightweight setup

### Managing Profiles

```bash
# List available profiles
mcp profile list

# Show current profile
mcp profile current

# Switch profiles
mcp profile switch development

# Create custom profile
mcp profile create my-workflow

# Edit profile
mcp profile edit my-workflow

# Delete profile
mcp profile delete my-workflow
```

### Profile Configuration

Profiles are stored in `profiles/` directory as YAML files:

```yaml
# profiles/my-workflow.yml
name: my-workflow
description: Custom workflow for my project
services:
  - filesystem
  - git
  - postgres
  - custom-service
settings:
  auto_start: true
  restart_policy: unless-stopped
environment:
  NODE_ENV: development
  LOG_LEVEL: debug
```

## Client Configuration

### Claude Code

1. **Automatic Configuration**
   ```bash
   mcp config --client claude
   ```

2. **Manual Configuration**
   
   Add to Claude's MCP configuration:
   ```json
   {
     "mcpServers": {
       "filesystem": {
         "url": "http://localhost:8080/mcp/filesystem"
       },
       "git": {
         "url": "http://localhost:8080/mcp/git"
       }
     }
   }
   ```

### VS Code / Cursor

1. **Using Extension**
   - Install MCP extension from marketplace
   - Extension auto-discovers local services

2. **Manual Configuration**
   
   Add to `settings.json`:
   ```json
   {
     "mcp.servers": {
       "filesystem": {
         "url": "http://localhost:8080/mcp/filesystem",
         "transport": "http"
       },
       "git": {
         "url": "http://localhost:8080/mcp/git",
         "transport": "http"
       }
     }
   }
   ```

### Environment Variables

Configure services using environment variables:

```bash
# Set for all services
export MCP_LOG_LEVEL=debug

# Set for specific service
export FILESYSTEM_MCP_ROOT=/custom/path

# Use .env file
cat > .env << EOF
DATABASE_URL=postgresql://user:pass@localhost/db
API_KEY=your-secret-key
EOF
```

## Working with Services

### Filesystem Service

Access and modify files:
```javascript
// Read file
const content = await mcp.filesystem.readFile('/path/to/file.txt');

// Write file
await mcp.filesystem.writeFile('/path/to/file.txt', 'content');

// List directory
const files = await mcp.filesystem.listDir('/path/to/dir');
```

### Git Service

Version control operations:
```javascript
// Get status
const status = await mcp.git.status();

// Create commit
await mcp.git.commit('feat: add new feature');

// Push changes
await mcp.git.push('origin', 'main');
```

### Database Services

Connect to databases:
```javascript
// PostgreSQL
const result = await mcp.postgres.query('SELECT * FROM users');

// MongoDB
const docs = await mcp.mongodb.find('users', { age: { $gt: 18 } });
```

### Custom Services

Deploy your own MCP service:

1. **Create Service Definition**
   ```javascript
   // my-service/server.js
   const { MCPServer } = require('@mcp/sdk');
   
   const server = new MCPServer({
     name: 'my-service',
     version: '1.0.0'
   });
   
   server.tool('hello', async (params) => {
     return `Hello, ${params.name}!`;
   });
   
   server.start();
   ```

2. **Add to Registry**
   ```json
   {
     "id": "my-service",
     "name": "My Custom Service",
     "source": {
       "type": "local",
       "path": "./my-service"
     }
   }
   ```

3. **Deploy Service**
   ```bash
   mcp install my-service
   ```

## Advanced Features

### Backup and Restore

```bash
# Create backup
mcp backup create --name "before-update"

# List backups
mcp backup list

# Restore backup
mcp backup restore --id backup-12345

# Schedule automatic backups
mcp backup schedule --cron "0 2 * * *"
```

### Health Monitoring

```bash
# Check platform health
mcp health

# Continuous health monitoring
mcp monitor

# Set up health alerts
mcp alert add --service filesystem --threshold 90
```

### Service Scaling

```bash
# Scale service replicas
mcp scale filesystem --replicas 3

# Auto-scaling configuration
mcp autoscale filesystem --min 1 --max 5 --cpu 80
```

### Network Configuration

```bash
# Expose service externally
mcp expose filesystem --port 3001

# Configure rate limiting
mcp ratelimit filesystem --max 100 --window 60s

# Set up SSL/TLS
mcp tls enable --domain mcp.example.com
```

### Plugin System

```bash
# Install plugin
mcp plugin install docker-compose-ui

# List plugins
mcp plugin list

# Create custom plugin
mcp plugin create my-plugin
```

## Best Practices

### 1. Service Organization

- Use profiles to organize services by workflow
- Keep development and production configs separate
- Document custom service dependencies

### 2. Resource Management

```yaml
# Set resource limits in docker-compose.yml
services:
  filesystem-mcp:
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M
```

### 3. Security

- Use environment variables for sensitive data
- Enable TLS for production deployments
- Implement rate limiting for public services
- Regular security updates: `mcp update --security`

### 4. Monitoring

- Enable health checks for all services
- Set up log aggregation
- Monitor resource usage
- Configure alerts for critical services

### 5. Backup Strategy

- Regular automated backups
- Test restore procedures
- Keep configuration backups
- Document recovery procedures

## Troubleshooting

### Common Issues

#### Services Not Starting

```bash
# Check Docker status
docker ps
systemctl status docker

# Check port conflicts
lsof -i :8080

# View detailed logs
mcp logs --debug
```

#### Connection Refused

```bash
# Verify service is running
mcp status

# Test direct connection
curl http://localhost:8080/mcp/filesystem

# Check firewall
sudo ufw status
```

#### Performance Issues

```bash
# Check resource usage
docker stats

# View service metrics
mcp metrics filesystem

# Optimize configuration
mcp optimize
```

### Debug Mode

Enable debug logging:
```bash
# Global debug
export MCP_DEBUG=true
mcp start

# Service-specific debug
mcp start filesystem --debug

# View debug logs
mcp logs --level debug
```

### Recovery Procedures

1. **Service Recovery**
   ```bash
   mcp restart filesystem
   mcp repair filesystem
   ```

2. **Platform Recovery**
   ```bash
   mcp stop
   mcp clean
   mcp start
   ```

3. **Full Reset**
   ```bash
   mcp reset --confirm
   ```

## Additional Resources

- [Installation Guide](INSTALLATION_GUIDE.md) - Detailed setup instructions
- [API Reference](API_REFERENCE.md) - Complete API documentation
- [Security Guide](SECURITY_GUIDE.md) - Security best practices
- [Operations Manual](OPERATIONS_MANUAL.md) - Production operations

## Getting Support

- **Documentation**: [Full Documentation](INDEX.md)
- **GitHub Issues**: [Report Issues](https://github.com/your-org/mcp-platform/issues)
- **Community Forum**: [MCP Community](https://community.mcp-platform.io)
- **Discord**: [Join Discord](https://discord.gg/mcp-platform)

---

For production deployments, see the [Production Deployment Guide](PRODUCTION_DEPLOYMENT.md).