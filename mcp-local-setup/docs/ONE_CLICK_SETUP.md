# One-Click MCP Gateway Setup

The MCP Gateway now supports one-click startup across all platforms with a fully UI-based configuration experience.

## 🚀 Quick Start

### Windows
1. **First Time Setup**:
   ```powershell
   # Create desktop shortcut
   powershell -ExecutionPolicy Bypass -File create-shortcut.ps1
   ```

2. **Start Gateway**: Double-click "MCP Gateway" on your desktop

### macOS
1. **First Time Setup**:
   ```bash
   # Create app bundle
   ./create-app-macos.sh
   ```

2. **Start Gateway**: Double-click "MCP Gateway" app on your desktop

### Linux
1. **First Time Setup**:
   ```bash
   # Create desktop entry
   ./create-desktop-linux.sh
   ```

2. **Start Gateway**: Click "MCP Gateway" in your application menu or desktop

### WSL
```bash
# Just run the startup script
./start-mcp.sh
```

## 🎯 What Happens on Startup

1. **Automatic Platform Detection**: The launcher detects your OS and environment
2. **Service Startup**: Docker services start automatically (or native mode if Docker isn't available)
3. **Dashboard Opens**: Your browser opens to the configuration dashboard
4. **Ready to Use**: Gateway is immediately available at `http://localhost:8090`

## 🖥️ Configuration Dashboard

Once started, everything is configured through the web UI:

### Dashboard Features:
- **Servers Tab**: View and manage active MCP servers
- **Catalog Tab**: Browse and install new servers with one click
- **API Keys Tab**: Manage all API keys and credentials
- **Settings Tab**: Configure gateway settings

### No Manual Configuration Needed!
- ✅ Add new servers from the catalog
- ✅ Configure API keys through forms
- ✅ Start/stop servers with buttons
- ✅ View real-time server status

## 🔧 Platform-Specific Notes

### Windows
- Requires Python 3.7+ installed
- PowerShell execution policy may need to be set
- Docker Desktop recommended for best experience

### macOS
- Requires Python 3 (usually pre-installed)
- Docker Desktop recommended
- May need to allow app in Security preferences first time

### Linux
- Python 3 required
- Docker or Docker Desktop
- Desktop environment needed for shortcuts

### WSL
- Runs in WSL but opens Windows browser
- Full Windows integration when running natively
- Docker Desktop with WSL2 backend recommended

## 🚨 Troubleshooting

### Gateway won't start
1. Check if port 8090 is already in use
2. Ensure Docker is running (if using Docker mode)
3. Check Python is installed: `python3 --version`

### Can't access dashboard
1. Wait a few seconds after startup
2. Try manually opening: `http://localhost:8080/dashboard/config.html`
3. Check firewall settings

### Services not appearing
1. Refresh the dashboard page
2. Check gateway logs in terminal
3. Ensure Docker containers are running: `docker ps`

## 📦 What's Included

The one-click setup includes:
- Unified MCP Gateway with all servers
- Web-based configuration dashboard
- Platform-specific launchers
- Automatic service management
- Built-in server catalog

## 🔐 Default Settings

- **Gateway URL**: `http://localhost:8090`
- **API Key**: `mcp-gateway-default-key`
- **Dashboard**: `http://localhost:8080/dashboard/config.html`

## 🎉 Next Steps

1. **Configure AI Assistant**:
   ```json
   {
     "mcpServers": {
       "gateway": {
         "url": "http://localhost:8090/mcp",
         "apiKey": "mcp-gateway-default-key"
       }
     }
   }
   ```

2. **Add Servers**: Use the Catalog tab to install servers
3. **Set API Keys**: Configure any required API keys in the dashboard
4. **Start Building**: Your AI assistant now has access to all MCP tools!

## 🔄 Updating

To update the gateway:
```bash
git pull
docker compose build
# Then restart using your platform's method
```

That's it! The MCP Gateway is designed to be as simple as possible while providing powerful functionality.