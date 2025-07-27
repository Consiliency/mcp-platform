# MCP Platform Launch Guide

This guide provides detailed instructions for launching the MCP Platform on different operating systems.

## 🚀 Launch Methods Overview

The MCP Platform provides multiple ways to launch services, catering to different preferences and platforms:

1. **Launch Scripts** - Platform-specific scripts for easy launching
2. **NPM Scripts** - Standard Node.js commands
3. **Quick Launchers** - Double-click launchers for desktop users
4. **MCP CLI** - Command-line interface

## 📋 Prerequisites

Before launching, ensure you have:
- Docker installed and running
- Node.js (v14+) and npm installed
- Sufficient disk space for Docker images
- Network connectivity for downloading packages

## 🖥️ Platform-Specific Instructions

### Linux

**Method 1: Shell Script**
```bash
# Make executable (first time only)
chmod +x launch.sh

# Launch the platform
./launch.sh

# Other commands
./launch.sh stop     # Stop services
./launch.sh restart  # Restart services
./launch.sh logs     # View logs
./launch.sh status   # Check status
```

**Method 2: Desktop Launcher**
1. Copy the desktop file:
   ```bash
   cp mcp-platform.desktop ~/.local/share/applications/
   chmod +x ~/.local/share/applications/mcp-platform.desktop
   ```
2. Find "MCP Platform" in your applications menu
3. Click to launch

### Windows

**Method 1: PowerShell Script**
```powershell
# Run from PowerShell
.\launch.ps1

# Other commands
.\launch.ps1 stop     # Stop services
.\launch.ps1 restart  # Restart services
.\launch.ps1 logs     # View logs
.\launch.ps1 status   # Check status
```

**Method 2: Batch File**
- Double-click `launch.bat` in File Explorer
- Services will start automatically

**Note for Windows Users:**
- Ensure Docker Desktop is running
- You may need to allow script execution: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

### macOS

**Method 1: Shell Script**
```bash
# Make executable (first time only)
chmod +x launch.sh

# Launch the platform
./launch.sh
```

**Method 2: Command File**
- Double-click `launch.command` in Finder
- Terminal will open and start services

### WSL (Windows Subsystem for Linux)

WSL users can use the Linux instructions above. The launch scripts automatically detect WSL and configure networking appropriately.

```bash
# From WSL terminal
./launch.sh

# Services are accessible from Windows at the same URLs
```

## 🌐 Cross-Platform Methods

### Node.js Script

Works on all platforms with Node.js installed:

```bash
# Start services
node launch.js

# With specific command
node launch.js start
node launch.js stop
node launch.js restart
node launch.js logs
node launch.js status
```

### NPM Scripts

Standard npm commands work everywhere:

```bash
npm start      # Start all services
npm stop       # Stop services
npm restart    # Restart services
npm run logs   # View logs
npm run status # Check status
```

### MCP CLI

If you've installed the MCP CLI:

```bash
mcp launch     # Launch all services
mcp stop       # Stop services
mcp status     # Check status
```

## 📊 Service URLs

Once launched, access the services at:

- **Dashboard**: http://localhost:3000/catalog.html
- **API Health**: http://localhost:3000/health
- **Traefik**: http://localhost:8080

## 🛠️ Troubleshooting

### Services Won't Start

1. **Check Docker**:
   ```bash
   docker --version
   docker ps
   ```

2. **Check Node.js**:
   ```bash
   node --version
   npm --version
   ```

3. **Check Ports**:
   - Ensure ports 3000 and 8080 are not in use
   - On Linux/macOS: `lsof -i :3000`
   - On Windows: `netstat -an | findstr :3000`

### Permission Errors

- **Linux/macOS**: Run `chmod +x launch.sh`
- **Windows**: Run PowerShell as Administrator

### Services Already Running

If you see "MCP services may already be running":
```bash
# Stop existing services
./launch.sh stop
# or
npm stop

# Then start again
./launch.sh start
```

### Can't Access Dashboard

1. Wait 10-15 seconds after launch for services to initialize
2. Check if API is running: `curl http://localhost:3000/health`
3. Check Docker logs: `docker compose logs`

## 🔄 Service Management

### Starting Services
All launch methods will:
1. Start Docker Compose services (Traefik)
2. Install API dependencies (if needed)
3. Start the API server
4. Display service URLs
5. Monitor for Ctrl+C to stop

### Stopping Services
- Press `Ctrl+C` in the terminal where services are running
- Or run `./launch.sh stop` or `npm stop`

### Viewing Logs
```bash
# All logs
./launch.sh logs

# API logs only
tail -f api-server.log

# Docker logs
docker compose logs -f
```

## 🎯 Next Steps

After launching:
1. Open the dashboard at http://localhost:3000/catalog.html
2. Browse available MCP servers
3. Install servers using the UI
4. Configure your AI assistant to use the MCP servers

## 📝 Notes

- The first launch may take longer as Docker images are downloaded
- Services persist data in Docker volumes
- Configuration is stored in `.env` files
- All methods achieve the same result - choose based on your preference

For more information, see the main README.md file.