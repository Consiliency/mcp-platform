# MCP Platform Quick Start Guide

Get up and running with the MCP Platform in under 5 minutes!

## 🚀 One-Line Installation

### Linux/WSL
```bash
curl -fsSL https://github.com/your-org/mcp-platform/raw/main/mcp-local-setup/install.sh | bash
```

### Windows PowerShell (Run as Administrator)
```powershell
iwr -useb https://github.com/your-org/mcp-platform/raw/main/mcp-local-setup/install.ps1 | iex
```

### macOS
```bash
curl -fsSL https://github.com/your-org/mcp-platform/raw/main/mcp-local-setup/install.sh | bash
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

### Check Status
```bash
mcp status
```

### View Available Services
```bash
mcp list
```

### Open Dashboard
```bash
mcp dashboard
# Opens http://localhost:8080/dashboard in your browser
```

### Stop Services
```bash
mcp stop
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

#### For Claude Code
Add to your Claude configuration:
```json
{
  "mcpServers": {
    "filesystem": {
      "url": "http://localhost:8080/mcp/filesystem"
    }
  }
}
```

#### For VS Code/Cursor
Add to your `settings.json`:
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

## 💡 Quick Tips

1. **Auto-start on boot**: Run `mcp enable` to start services on system boot
2. **Update platform**: Run `mcp update` to get the latest version
3. **Backup config**: Run `mcp backup create` before major changes
4. **Get help**: Run `mcp help` or `mcp <command> --help`

## 🆘 Getting Help

- **Documentation**: [Full Documentation](INDEX.md)
- **Issues**: [GitHub Issues](https://github.com/your-org/mcp-platform/issues)
- **Community**: [Discord Server](https://discord.gg/mcp-platform)

---

Ready to explore more? Check out the [User Guide](USER_GUIDE.md) for advanced features!