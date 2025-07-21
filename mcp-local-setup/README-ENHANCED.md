# MCP Platform - Enhanced Local Development Environment

A comprehensive, easy-to-install platform for running Model Context Protocol (MCP) servers locally with support for multiple AI coding assistants and cross-platform compatibility.

## 🚀 Quick Start

### One-Line Installation

**Linux/WSL:**
```bash
curl -fsSL https://your-domain/install.sh | bash
```

**Windows PowerShell:**
```powershell
iwr -useb https://your-domain/install.ps1 | iex
```

### Start Using MCP
```bash
mcp start          # Start all services
mcp dashboard      # Open web dashboard
mcp list           # See available services
```

## 🎯 Key Features

### 1. **Multi-Client Support**
- **Claude Code** - Native MCP integration
- **VS Code** - Extension support
- **Cursor** - Built-in MCP support
- **ChatGPT Desktop** - Via browser extension
- **Gemini** - Community integrations
- **Any MCP-compatible tool**

### 2. **Profile-Based Service Management**
Switch between different sets of services based on your workflow:

```bash
mcp profile list                    # See available profiles
mcp profile switch development      # Switch to development profile
mcp profile create my-workflow      # Create custom profile
```

**Built-in Profiles:**
- `default` - Essential services (filesystem, git)
- `development` - Full dev stack (git, github, playwright, postgres)
- `ai-ml` - AI/ML tools (memory, data access)
- `minimal` - Lightweight setup

### 3. **Service Registry & Catalog**
Dynamic service discovery and installation:

```bash
mcp list                           # Browse available services
mcp install google-drive           # Install new service
mcp info playwright               # Get service details
```

### 4. **Cross-Platform Architecture**
- **Windows** native support
- **WSL2** full integration with mirrored networking
- **Linux** native support
- **macOS** compatible (Docker Desktop required)

### 5. **Easy Service Access**
All services accessible via unified endpoints:
- HTTP: `http://localhost:8080/mcp/{service-name}`
- WebSocket: `ws://localhost:8081/mcp/{service-name}`
- Dashboard: `http://localhost:8080/dashboard`

## 📋 System Requirements

- **Docker** (Docker Desktop on Windows/Mac)
- **Node.js** 14+ (optional, for advanced CLI features)
- **WSL2** (recommended for Windows users)
- 4GB RAM minimum
- 10GB disk space

## 🏗️ Architecture

```
mcp-platform/
├── cli/                    # Advanced CLI tool
├── profiles/              # Service profiles
│   ├── default.yml
│   ├── development.yml
│   └── ai-ml.yml
├── registry/              # Service catalog
│   └── mcp-catalog.json
├── scripts/               # Management scripts
├── templates/             # Docker templates
├── traefik/              # Reverse proxy config
└── docker-compose.yml    # Generated dynamically
```

## 🔧 Configuration

### Environment Variables
Create `.env` file for service credentials:
```env
GITHUB_TOKEN=your_github_token
POSTGRES_URL=postgresql://user:pass@host/db
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
```

### Client Configuration

**Claude Code:**
Automatically configured at `~/.config/claude/mcp-servers.json`

**VS Code/Cursor:**
Add to `settings.json`:
```json
{
  "mcp.servers": {
    "filesystem": {
      "url": "http://localhost:8080/mcp/filesystem"
    }
  }
}
```

## 📚 Available Services

### Development Tools
- `filesystem` - Local file access
- `git` - Repository operations
- `github` - GitHub API integration
- `playwright` - Browser automation

### Data Access
- `postgres` - PostgreSQL databases
- `google-drive` - Google Drive files
- `slack` - Slack messaging
- `memory` - Knowledge graph storage

### Custom Services
Add your own MCP servers easily:
```bash
mcp create my-service --template python
mcp dev my-service     # Development mode
mcp package my-service # Package for distribution
```

## 🛠️ CLI Commands

### Basic Operations
```bash
mcp start              # Start services
mcp stop               # Stop services
mcp restart            # Restart services
mcp status             # Show service status
mcp logs [service]     # View logs
```

### Service Management
```bash
mcp list               # List available services
mcp install <service>  # Install service
mcp remove <service>   # Remove service
mcp info <service>     # Service details
```

### Profile Management
```bash
mcp profile list       # List profiles
mcp profile switch     # Change profile
mcp profile create     # New profile
mcp profile edit       # Edit profile
```

### Advanced Features
```bash
mcp config             # Show configuration
mcp config --generate  # Generate client configs
mcp interactive        # Interactive mode
```

## 🔍 Troubleshooting

### Common Issues

**Docker not found:**
```bash
# Install Docker
curl -fsSL https://get.docker.com | bash
```

**WSL2 networking issues:**
Enable mirrored networking in `.wslconfig`:
```ini
[wsl2]
networkingMode=mirrored
localhostForwarding=true
```

**Port conflicts:**
Check for conflicting services:
```bash
netstat -an | grep 8080
```

### Debug Commands
```bash
mcp logs -f            # Follow all logs
mcp logs playwright    # Service-specific logs
docker compose ps      # Direct Docker status
```

## 🤝 Contributing

### Adding a New MCP Server

1. Add to `registry/mcp-catalog.json`:
```json
{
  "id": "my-service",
  "name": "My Service",
  "category": "custom",
  "source": {
    "type": "npm",
    "package": "@myorg/mcp-my-service"
  }
}
```

2. Create Docker template if needed
3. Submit pull request

## 📄 License

MIT License - See LICENSE file

## 🔗 Resources

- [MCP Specification](https://modelcontextprotocol.io)
- [Docker Documentation](https://docs.docker.com)
- [Report Issues](https://github.com/your-repo/mcp-platform/issues)

---

Built with ❤️ for the AI development community