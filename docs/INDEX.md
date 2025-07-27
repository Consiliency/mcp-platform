# MCP Platform Documentation

Welcome to the MCP Platform documentation! This guide will help you navigate through all available documentation based on your role and needs.

## 🚀 Getting Started

### New Users
1. **[Quick Start Guide](QUICK_START.md)** - Get up and running in 5 minutes
2. **[Installation Guide](INSTALLATION_GUIDE.md)** - Detailed installation instructions
3. **[User Guide](USER_GUIDE.md)** - Learn all platform features
4. **[Gateway Setup](../mcp-local-setup/client-configs/README.md)** - Configure the unified MCP Gateway

### Developers
1. **[API Reference](API_REFERENCE.md)** - Complete API documentation
2. **[SDK Usage Guide](SDK_USAGE.md)** - Using the MCP SDK
3. **[Configuration Reference](CONFIGURATION_REFERENCE.md)** - All configuration options
4. **[Gateway Integration](../mcp-local-setup/gateway/README.md)** - Integrate with the unified gateway

### Operations Teams
1. **[Production Deployment](PRODUCTION_DEPLOYMENT.md)** - Deploy to production
2. **[Operations Manual](OPERATIONS_MANUAL.md)** - Day-to-day operations
3. **[Security Guide](SECURITY_GUIDE.md)** - Security best practices

## 📚 Documentation by Category

### Installation & Setup
- **[Installation Guide](INSTALLATION_GUIDE.md)** - Platform installation for all operating systems
- **[Quick Start Guide](QUICK_START.md)** - Fast track to getting started
- **[Configuration Reference](CONFIGURATION_REFERENCE.md)** - Configuration options and examples

### Usage & Features
- **[User Guide](USER_GUIDE.md)** - Comprehensive guide to platform features
- **[API Reference](API_REFERENCE.md)** - REST API and WebSocket endpoints
- **[SDK Usage Guide](SDK_USAGE.md)** - SDK for multiple programming languages

### Deployment & Operations
- **[Production Deployment](PRODUCTION_DEPLOYMENT.md)** - Production deployment strategies
- **[Operations Manual](OPERATIONS_MANUAL.md)** - Operational procedures and monitoring
- **[Migration Guide](MIGRATION_GUIDE.md)** - Upgrading and migration procedures

### Security & Compliance
- **[Security Guide](SECURITY_GUIDE.md)** - Security architecture and best practices

### Development & Integration
- **[Contributing Guide](../CONTRIBUTING.md)** - How to contribute to the project

## 🎯 Quick Links by Task

### "I want to..."

#### Install the Platform
- Local development → [Quick Start](QUICK_START.md)
- Production server → [Production Deployment](PRODUCTION_DEPLOYMENT.md)
- Specific OS → [Installation Guide](INSTALLATION_GUIDE.md)

#### Use the Unified Gateway
- Set up gateway → [Gateway Setup Guide](../mcp-local-setup/client-configs/README.md)
- Configure Claude Code → `mcp config generate --client claude-code`
- Configure other clients → [Client Configurations](../mcp-local-setup/client-configs/)
- View all tools → `http://localhost:8080/gateway.html`

#### Configure Services
- Basic configuration → [User Guide](USER_GUIDE.md#client-configuration)
- Advanced settings → [Configuration Reference](CONFIGURATION_REFERENCE.md)
- Security settings → [Security Guide](SECURITY_GUIDE.md)
- Gateway API keys → [Gateway Config](../mcp-local-setup/client-configs/README.md#setting-up-api-keys)

#### Deploy to Production
- Docker Compose → [Production Deployment](PRODUCTION_DEPLOYMENT.md#docker-compose-production)
- Kubernetes → [Production Deployment](PRODUCTION_DEPLOYMENT.md#kubernetes-deployment)
- Cloud providers → [Production Deployment](PRODUCTION_DEPLOYMENT.md#cloud-provider-deployments)

#### Manage Operations
- Monitor services → [Operations Manual](OPERATIONS_MANUAL.md#monitoring)
- Backup data → [Operations Manual](OPERATIONS_MANUAL.md#backup-procedures)
- Troubleshoot issues → [Operations Manual](OPERATIONS_MANUAL.md#troubleshooting)

#### Secure the Platform
- Authentication setup → [Security Guide](SECURITY_GUIDE.md#authentication)
- Network security → [Security Guide](SECURITY_GUIDE.md#network-security)
- Compliance → [Security Guide](SECURITY_GUIDE.md#compliance)

## 🏗️ Platform Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ AI Clients  │     │ AI Clients  │     │ AI Clients  │
│(Claude/VS)  │     │(Cursor/etc) │     │(Custom/SDK) │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       └───────────────────┴───────────────────┘
                           │
                    ┌──────▼──────┐
                    │ MCP Gateway │ ← Single entry point
                    │  Port 8090  │   for all servers
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │   Traefik   │
                    │   Gateway   │
                    └──────┬──────┘
                           │
       ┌───────────────────┼───────────────────┐
       │                   │                   │
┌──────▼──────┐     ┌──────▼──────┐     ┌──────▼──────┐
│ Filesystem  │     │     Git     │     │  Database   │
│   Service   │     │   Service   │     │  Services   │
└─────────────┘     └─────────────┘     └─────────────┘
```

## 📖 Documentation Versions

- **Current Version**: v6.0 (Phase 7 - Universal Transport Support)
- **[Release Notes](../PHASE7_RELEASE_NOTES.md)** - Latest changes
- **[Roadmap](../specs/ROADMAP.md)** - Future development plans

## 🔍 Search Documentation

Looking for something specific? Use these keywords:

- **Installation**: install, setup, requirements, docker, kubernetes
- **Configuration**: config, settings, environment, variables
- **Security**: auth, jwt, oauth, ssl, tls, certificates
- **Monitoring**: metrics, logs, health, prometheus, grafana
- **Troubleshooting**: error, issue, problem, debug, fix

## 💬 Getting Help

### Documentation Issues
- Found an error? [Report Documentation Issue](https://github.com/Consiliency/mcp-platform/issues/new?labels=documentation)
- Need clarification? [Ask in Discussions](https://github.com/Consiliency/mcp-platform/discussions)

### Support Channels
- **Community Forum**: [community.mcp-platform.io](https://community.mcp-platform.io)
- **Discord Server**: [discord.gg/mcp-platform](https://discord.gg/mcp-platform)
- **Stack Overflow**: Tag with `mcp-platform`

### Professional Support
- **Enterprise Support**: [enterprise@mcp-platform.io](mailto:enterprise@mcp-platform.io)
- **Training**: [training.mcp-platform.io](https://training.mcp-platform.io)
- **Consulting**: [consulting@mcp-platform.io](mailto:consulting@mcp-platform.io)

## 🤝 Contributing

Want to improve the documentation?

1. Read the [Contributing Guide](../CONTRIBUTING.md)
2. Check [Documentation Standards](../CONTRIBUTING.md#documentation)
3. Submit a pull request

## 📱 Mobile Documentation

Access documentation on mobile devices:
- **iOS/Android**: [docs.mcp-platform.io](https://docs.mcp-platform.io)
- **PDF Version**: [Download PDF](https://docs.mcp-platform.io/pdf/complete-guide.pdf)
- **Offline Docs**: `mcp docs --offline`

---

**Documentation Version**: 6.0 | **Last Updated**: July 2025 | **Platform Version**: Phase 7