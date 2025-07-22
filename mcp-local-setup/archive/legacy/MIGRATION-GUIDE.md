# Migration Guide: Basic Setup to Enhanced MCP Platform

This guide helps you migrate from the basic MCP setup to the enhanced platform with profiles, service registry, and advanced features.

## 📋 Pre-Migration Checklist

- [ ] Backup your current `.env` file if you have one
- [ ] Note which MCP services you're currently using
- [ ] Stop all running MCP services: `docker-compose down`
- [ ] Ensure Docker is up to date

## 🔄 Migration Steps

### Step 1: Install the Enhanced Platform

**Option A: Fresh Installation (Recommended)**
```bash
# Backup current setup
mv mcp-local-setup mcp-local-setup-backup

# Install enhanced platform
curl -fsSL https://your-domain/install.sh | bash
```

**Option B: In-Place Upgrade**
```bash
cd mcp-local-setup
git pull origin enhanced-platform
./install.sh --upgrade
```

### Step 2: Migrate Configuration

1. **Copy environment variables:**
```bash
cp mcp-local-setup-backup/.env ~/.mcp-platform/.env
```

2. **Create a profile matching your current setup:**
```bash
mcp profile create current-setup
# Follow prompts to add your services
```

### Step 3: Verify Services

```bash
# Check available services
mcp list

# Start with your profile
mcp profile switch current-setup
mcp start

# Verify services are running
mcp status
```

## 🔧 Configuration Mapping

### Old Structure → New Structure

| Old Location | New Location | Purpose |
|--------------|--------------|---------|
| `docker-compose.yml` | Auto-generated | Now created from profiles |
| `.env` | `~/.mcp-platform/.env` | Environment variables |
| `dashboard/` | `~/.mcp-platform/dashboard/` | Web interface |
| Manual service config | `registry/mcp-catalog.json` | Service definitions |

### Docker Compose Changes

**Old (Static):**
```yaml
services:
  playwright_mcp:
    build: ../playwright-mcp
    # ... manual configuration
```

**New (Dynamic):**
Services defined in catalog and enabled via profiles:
```bash
mcp install playwright
mcp profile edit development  # Add playwright to profile
```

## 🔌 Client Configuration Updates

### Claude Code
**Old:** Manual configuration
**New:** Auto-generated at `~/.config/claude/mcp-servers.json`

### VS Code/Cursor
**Old:** Add each service manually
**New:** Run `mcp config --generate`

## 🚀 New Features to Explore

### 1. Profile Switching
```bash
# Development work
mcp profile switch development

# AI/ML tasks
mcp profile switch ai-ml

# Minimal resources
mcp profile switch minimal
```

### 2. Service Discovery
```bash
# Find new services
mcp list

# Get details before installing
mcp info postgres

# One-command installation
mcp install postgres
```

### 3. Enhanced CLI
```bash
# Interactive mode for beginners
mcp interactive

# Real-time log following
mcp logs -f

# Service-specific logs
mcp logs playwright --tail 100
```

## ⚠️ Breaking Changes

1. **Service Names**: Some services may have standardized names
   - `playwright_mcp` → `playwright`
   - `code_indexer` → `code-indexer`

2. **Port Assignments**: Now managed automatically
   - Manual port configs are replaced by registry definitions

3. **Traefik Configuration**: Enhanced with WebSocket support
   - Old routes still work
   - New routes follow `/mcp/{service}` pattern

## 🔍 Troubleshooting Migration

### Issue: Services not starting
```bash
# Check for port conflicts
docker ps -a
netstat -an | grep 8080

# Reset and regenerate
mcp profile switch default
mcp stop
mcp start
```

### Issue: Client can't connect
```bash
# Regenerate client configs
mcp config --generate

# Check service endpoints
curl http://localhost:8080/mcp/filesystem
```

### Issue: Missing services
```bash
# List what's installed
mcp list --installed

# Re-install missing services
mcp install <service-name>
```

## 📝 Post-Migration

1. **Remove old setup** (after verification):
```bash
rm -rf mcp-local-setup-backup
```

2. **Update your workflows:**
- Use `mcp` command instead of `docker-compose`
- Switch profiles based on tasks
- Explore new services in the catalog

3. **Share with team:**
```bash
# Export your profile
mcp profile export development > team-dev-profile.yml

# Team members import
mcp profile import team-dev-profile.yml
```

## 🆘 Getting Help

- Check logs: `mcp logs`
- Interactive troubleshooting: `mcp interactive`
- Community: [GitHub Discussions](https://github.com/your-repo/discussions)
- Issues: [GitHub Issues](https://github.com/your-repo/issues)

---

Welcome to the enhanced MCP Platform! 🎉