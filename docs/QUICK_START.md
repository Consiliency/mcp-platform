# MCP Platform Quick Start Guide

Get up and running with the MCP Platform in under 5 minutes!

## 🚀 One-Line Installation

### Linux/WSL
```bash
curl -fsSL https://raw.githubusercontent.com/Consiliency/mcp-platform/main/mcp-local-setup/install.sh | bash
```

### Windows PowerShell (Run as Administrator)
```powershell
iwr -useb https://raw.githubusercontent.com/Consiliency/mcp-platform/main/mcp-local-setup/install.ps1 | iex
```

### macOS
```bash
curl -fsSL https://raw.githubusercontent.com/Consiliency/mcp-platform/main/mcp-local-setup/install.sh | bash
```

## 📋 Prerequisites

- **Docker**: Docker Desktop (Windows/Mac) or Docker Engine (Linux)
- **Memory**: Minimum 4GB RAM available
- **Storage**: 10GB free disk space
- **Network**: Internet connection for downloading images

## 🎯 Basic Commands

### Start the Platform
```bash
mcp start
```

### Start the Gateway (Recommended)
```bash
mcp gateway start
```

### Check Status
```bash
mcp status
mcp gateway status
```

### View Available Services
```bash
mcp list
```

### Open Dashboards
```bash
mcp dashboard
# Opens http://localhost:8080/dashboard in your browser

# Gateway dashboard
open http://localhost:8080/gateway.html
```

### Stop Services
```bash
mcp stop
mcp gateway stop
```

## 🔧 First Service Deployment

### 1. Check Available Services
```bash
mcp list
```

### 2. Install a Service
```bash
# Install the filesystem MCP service
mcp install filesystem
```

### 3. Configure Your AI Client

#### Option A: Use the Unified Gateway (Recommended)

Configure once, access all servers:

```bash
# For Claude Code
claude mcp add unified-gateway --transport sse http://localhost:8090/mcp \
  --header "X-API-Key: your-gateway-api-key"

# For other clients
mcp config generate --client cursor
mcp config generate --client vscode
```

#### Option B: Configure Individual Servers

For Claude Code:
```json
{
  "mcpServers": {
    "filesystem": {
      "url": "http://localhost:8080/mcp/filesystem"
    }
  }
}
```

For VS Code/Cursor:
```json
{
  "mcp.servers": {
    "filesystem": {
      "url": "http://localhost:8080/mcp/filesystem"
    }
  }
}
```

### 4. Verify Connection
```bash
# Check service health
mcp health filesystem

# If using gateway, check gateway status
mcp gateway status

# View service logs
mcp logs filesystem
```

## 🔍 Common Operations

### Switch Profiles
```bash
# List available profiles
mcp profile list

# Switch to development profile
mcp profile switch development
```

### Manage Services
```bash
# Install multiple services
mcp install git postgres playwright

# Remove a service
mcp uninstall postgres

# Restart a specific service
mcp restart filesystem
```

### View Logs
```bash
# All services
mcp logs

# Specific service
mcp logs filesystem

# Follow logs
mcp logs -f filesystem
```

## 🚨 Troubleshooting

### Services Not Starting

1. **Check Docker**
   ```bash
   docker --version
   docker ps
   ```

2. **Check Port Conflicts**
   ```bash
   # Linux/Mac
   sudo lsof -i :8080
   
   # Windows
   netstat -ano | findstr :8080
   ```

3. **Reset Platform**
   ```bash
   mcp stop
   mcp clean
   mcp start
   ```

### Connection Issues

1. **Verify Service is Running**
   ```bash
   mcp status
   curl http://localhost:8080/api/v1/health
   ```

2. **Check Network**
   ```bash
   # Test specific service
   curl http://localhost:8080/mcp/filesystem
   ```

3. **Restart with Debug**
   ```bash
   MCP_DEBUG=true mcp start
   ```

### WSL-Specific Issues

1. **Enable WSL Integration in Docker Desktop**
   - Open Docker Desktop Settings
   - Go to Resources → WSL Integration
   - Enable integration with your distro

2. **Network Issues**
   ```bash
   # In WSL, check if localhost works
   curl http://localhost:8080
   
   # If not, try Windows host IP
   curl http://$(cat /etc/resolv.conf | grep nameserver | awk '{print $2}'):8080
   ```

## 📚 Next Steps

- **[User Guide](USER_GUIDE.md)** - Complete platform features
- **[Installation Guide](INSTALLATION_GUIDE.md)** - Detailed setup instructions
- **[Production Deployment](PRODUCTION_DEPLOYMENT.md)** - Deploy to production
- **[API Reference](API_REFERENCE.md)** - API documentation

## 🌟 Gateway Quick Start

The MCP Gateway provides a single entry point for all your MCP servers:

### 1. Start Gateway
```bash
mcp gateway start
```

### 2. Configure Once
```bash
# Claude Code
claude mcp add unified-gateway --transport sse http://localhost:8090/mcp \
  --header "X-API-Key: mcp-gateway-default-key"
```

### 3. Access All Tools
All tools from all running MCP servers are now available with automatic namespacing:
- `github:create_issue`
- `filesystem:read_file`
- `postgres:query`

### 4. Monitor
```bash
# View dashboard
open http://localhost:8080/gateway.html

# Check status
mcp gateway status
```

## 💡 Quick Tips

1. **Auto-start on boot**: Run `mcp enable` to start services on system boot
2. **Update platform**: Run `mcp update` to get the latest version
3. **Backup config**: Run `mcp backup create` before major changes
4. **Get help**: Run `mcp help` or `mcp <command> --help`
5. **Use the gateway**: Single configuration for all MCP servers!

## 🆘 Getting Help

- **Documentation**: [Full Documentation](INDEX.md)
- **Issues**: [GitHub Issues](https://github.com/Consiliency/mcp-platform/issues)
- **Community**: [Discord Server](https://discord.gg/mcp-platform)

---

Ready to explore more? Check out the [User Guide](USER_GUIDE.md) for advanced features!