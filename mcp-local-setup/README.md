# MCP Platform

A comprehensive platform for running Model Context Protocol (MCP) servers locally with Docker, supporting multiple AI coding assistants through a unified gateway.

## 🌟 New: Unified MCP Gateway

The MCP Platform now includes a **Unified Gateway** that provides a single entry point for all your MCP servers:

- **Zero Configuration**: Gateway starts automatically with `mcp start`
- **Single Entry Point**: Configure once in your AI assistant, access all MCP servers
- **Automatic Tool Namespacing**: No more conflicts between servers with similar tools  
- **Centralized API Key Management**: Manage all service credentials in `.env` file
- **Multi-Client Support**: Works with Claude Code, Cursor, VS Code, Claude Desktop, and ChatGPT
- **Real-time Updates**: Tools appear/disappear dynamically as servers start/stop

[Learn more about the Gateway →](#-unified-mcp-gateway)

## 🚀 Quick Start

### Installation

**Linux/WSL:**
```bash
curl -fsSL https://raw.githubusercontent.com/Consiliency/mcp-platform/main/mcp-local-setup/install.sh | bash
```

**Windows PowerShell:**
```powershell
iwr -useb https://raw.githubusercontent.com/Consiliency/mcp-platform/main/mcp-local-setup/install.ps1 | iex
```

### Launching MCP Platform

After installation, you can launch the platform using any of these methods:

**Option 1: Universal Launch Script**
```bash
# Linux/macOS
./launch.sh

# WSL (Windows Subsystem for Linux)
./launch-wsl.sh  # Optimized for WSL - handles Docker quirks

# Windows PowerShell
.\launch.ps1

# Cross-platform (Node.js)
node launch.js
```

**Option 2: NPM Scripts**
```bash
npm start     # Start all services
npm stop      # Stop all services
npm restart   # Restart services
npm run logs  # View logs
```

**Option 3: Quick Launchers**
- **Windows**: Double-click `launch.bat`
- **macOS**: Double-click `launch.command`
- **Linux**: Use `mcp-platform.desktop` (copy to ~/.local/share/applications/)

**Option 4: MCP CLI**
```bash
mcp launch    # Launch all services with dashboard
```

## 📋 Basic Usage

```bash
mcp start          # Start all services
mcp dashboard      # Open web dashboard
mcp list           # See available services
mcp health         # Check service health
mcp install <name> # Install a new MCP server

# Gateway Commands
mcp gateway start  # Start the unified gateway
mcp gateway status # Check gateway status
mcp config generate --client claude-code  # Generate client config
```

## 🎯 Server Catalog Dashboard

The platform now includes a powerful web-based Server Catalog Dashboard for easy MCP server management:

- **Browse Popular Servers**: Pre-configured catalog with popular MCP servers like Snap Happy, GitHub MCP, Docker MCP, and more
- **One-Click Install**: Install any MCP server directly from the dashboard
- **Multi-Package Manager Support**: Add servers from various package managers:
  - **GitHub**: Paste repository URLs for automatic analysis and installation
    - Supports personal repos - no need to publish to a package manager!
    - Auto-detects programming language (Node.js, Python, Go, Rust, Ruby, PHP)
    - Uses repo's Dockerfile if available, otherwise builds automatically
  - **NPM**: Add Node.js packages from npm registry
  - **PyPI**: Install Python packages (fastmcp, mcp-atlassian, etc.)
  - **Cargo**: Add Rust crates (rust-mcp-sdk, json-mcp-server, etc.)
  - **Go Modules**: Install Go packages (github.com/mark3labs/mcp-go, etc.)
  - **RubyGems**: Add Ruby gems (rails-mcp-server, fast-mcp, etc.)
  - **Packagist**: Install PHP packages (php-mcp/server, etc.)
- **Real-time Status**: View running/stopped status for all installed servers
- **Easy Management**: Start, stop, and configure servers from the UI

Access the catalog at: `http://localhost:8080/catalog.html`

## 📚 Documentation

For detailed documentation, see:
- **[README-ENHANCED.md](README-ENHANCED.md)** - Complete feature guide and usage instructions
- **[ROADMAP.md](../specs/ROADMAP.md)** - Development roadmap and progress tracking
- **[CONTRIBUTING.md](../CONTRIBUTING.md)** - Contribution guidelines
- **[CLAUDE.md](CLAUDE.md)** - AI assistant guidelines

## 🆕 Latest Features

- **🌟 Unified MCP Gateway** - Single entry point for all MCP servers with automatic tool namespacing
- **Server Catalog Dashboard** - Web UI for discovering and installing MCP servers
- **Multi-Package Manager Support** - Install from NPM, PyPI, Cargo, Go, RubyGems, and Packagist
- **Personal GitHub Repo Support** - Use unpublished repos with automatic language detection and building
- **Smart Installation Priority** - Prefers official packages, falls back to source building when needed
- **GitHub Integration** - Auto-detect and add MCP servers from any GitHub repository
- **Popular Servers Pre-loaded** - Snap Happy, GitHub MCP, Docker MCP, Stripe MCP, and more
- **Universal Transport Support** - stdio, HTTP, WebSocket, and SSE transports
- **Gateway Dashboard** - Real-time monitoring of all connected servers and available tools
- Health monitoring system with dashboard
- Example MCP services (echo, todo, weather)
- Comprehensive test suite (unit, integration, E2E)
- Enhanced service management and registry
- Profile-based service configuration

## 🔌 Unified MCP Gateway

The MCP Gateway provides a single endpoint for all your MCP servers, eliminating the need to configure each server individually in your AI assistant.

### Zero-Configuration Setup

The gateway starts automatically when you run `mcp start`. No manual configuration needed!

1. **Start the Platform** (gateway included):
   ```bash
   mcp start
   ```

2. **Configure Your AI Assistant Once**:
   
   **Claude Code (Two Methods):**
   
   Method 1 - CLI Command (Recommended):
   ```bash
   # Add the gateway using Claude's CLI
   claude mcp add --transport http mcp-gateway http://localhost:8090/mcp --header "X-API-Key: mcp-gateway-default-key"
   
   # Verify connection
   claude mcp list
   ```
   
   Method 2 - Settings File:
   ```json
   // Add to .claude/settings.json in your project
   {
     "mcpServers": {
       "mcp-gateway": {
         "transport": "http",
         "url": "http://localhost:8090/mcp",
         "headers": {
           "X-API-Key": "mcp-gateway-default-key"
         }
       }
     }
   }
   ```

3. **Access All Tools**: All your MCP servers' tools are now available through one connection!

### Features

- **Zero Configuration**: Gateway automatically discovers all running MCP servers
- **Automatic Tool Namespacing**: Tools are prefixed with server names (e.g., `github:create_issue`)
- **API Key Management**: Set service credentials in `.env` file, gateway handles injection
- **Real-time Discovery**: Tools appear/disappear dynamically as servers start/stop
- **Multi-Client Support**: Works with all major MCP clients
- **Gateway Dashboard**: Monitor at `http://localhost:8080/gateway`
- **Built-in with Platform**: No separate installation or setup required

### Supported Clients

Generate configuration for your preferred client:

```bash
mcp config generate --client claude-code    # Claude Code
mcp config generate --client cursor         # Cursor
mcp config generate --client claude-desktop # Claude Desktop
mcp config generate --client vscode         # VS Code
mcp config generate --client chatgpt        # ChatGPT
mcp config generate                        # All clients
```

[Full Gateway Documentation →](client-configs/README.md)

## 🔗 Resources

- [GitHub Repository](https://github.com/Consiliency/mcp-platform)
- [MCP Specification](https://modelcontextprotocol.io)
- [Report Issues](https://github.com/Consiliency/mcp-platform/issues)