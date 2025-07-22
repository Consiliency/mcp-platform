# MCP Platform

A comprehensive platform for running Model Context Protocol (MCP) servers locally with Docker, supporting multiple AI coding assistants.

## 🚀 Quick Start

**Linux/WSL:**
```bash
curl -fsSL https://raw.githubusercontent.com/Consiliency/mcp-platform/main/mcp-local-setup/install.sh | bash
```

**Windows PowerShell:**
```powershell
iwr -useb https://raw.githubusercontent.com/Consiliency/mcp-platform/main/mcp-local-setup/install.ps1 | iex
```

## 📋 Basic Usage

```bash
mcp start          # Start all services
mcp dashboard      # Open web dashboard
mcp list           # See available services
mcp health         # Check service health
```

## 📚 Documentation

For detailed documentation, see:
- **[README-ENHANCED.md](README-ENHANCED.md)** - Complete feature guide and usage instructions
- **[ROADMAP.md](../specs/ROADMAP.md)** - Development roadmap and progress tracking
- **[CONTRIBUTING.md](../CONTRIBUTING.md)** - Contribution guidelines
- **[CLAUDE.md](CLAUDE.md)** - AI assistant guidelines

## 🆕 Version 1.0 Features

- Health monitoring system with dashboard
- Example MCP services (echo, todo, weather)
- Comprehensive test suite (unit, integration, E2E)
- Enhanced service management and registry
- Profile-based service configuration

## 🔗 Resources

- [GitHub Repository](https://github.com/Consiliency/mcp-platform)
- [MCP Specification](https://modelcontextprotocol.io)
- [Report Issues](https://github.com/Consiliency/mcp-platform/issues)