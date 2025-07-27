# MCP Platform Installation Guide

Comprehensive installation instructions for the MCP Platform across all supported operating systems and environments.

## Table of Contents

1. [System Requirements](#system-requirements)
2. [Pre-Installation Checklist](#pre-installation-checklist)
3. [Installation Methods](#installation-methods)
4. [Platform-Specific Instructions](#platform-specific-instructions)
   - [Linux Installation](#linux-installation)
   - [Windows Installation](#windows-installation)
   - [macOS Installation](#macos-installation)
   - [WSL2 Installation](#wsl2-installation)
5. [Post-Installation Setup](#post-installation-setup)
6. [Network Configuration](#network-configuration)
7. [Verification](#verification)
8. [Troubleshooting](#troubleshooting)
9. [Uninstallation](#uninstallation)

## System Requirements

### Minimum Requirements

- **CPU**: 2 cores (x86_64 or ARM64)
- **RAM**: 4GB (8GB recommended)
- **Storage**: 10GB free space (20GB recommended)
- **OS**: 
  - Linux: Ubuntu 20.04+, Debian 10+, RHEL 8+, Fedora 32+
  - Windows: Windows 10 Pro/Enterprise (Build 19041+) or Windows 11
  - macOS: macOS 11.0+ (Big Sur or later)

### Software Requirements

- **Docker**: 
  - Linux: Docker Engine 20.10+
  - Windows/Mac: Docker Desktop 4.0+
- **Node.js**: 16+ (optional, for CLI features)
- **Git**: 2.25+ (for version control)

### Network Requirements

- Internet connection for downloading images
- Ports 8080-8081 available
- Firewall allowing Docker traffic

## Pre-Installation Checklist

### 1. Check System Compatibility

```bash
# Check OS version
# Linux
lsb_release -a || cat /etc/os-release

# Windows (PowerShell)
Get-ComputerInfo | Select WindowsVersion, WindowsBuildLabEx

# macOS
sw_vers
```

### 2. Check Available Resources

```bash
# Check CPU
nproc || sysctl -n hw.ncpu

# Check RAM
free -h || vm_stat

# Check disk space
df -h
```

### 3. Check Existing Software

```bash
# Check Docker
docker --version

# Check Node.js (optional)
node --version

# Check Git
git --version
```

## Installation Methods

### Method 1: Automated Installation (Recommended)

The automated installer handles all dependencies and configuration.

#### Linux/macOS/WSL
```bash
curl -fsSL https://raw.githubusercontent.com/Consiliency/mcp-platform/main/mcp-local-setup/install.sh | bash
```

#### Windows PowerShell
```powershell
# Run as Administrator
iwr -useb https://raw.githubusercontent.com/Consiliency/mcp-platform/main/mcp-local-setup/install.ps1 | iex
```

### Method 2: Manual Installation

For users who prefer manual control over the installation process.

#### Step 1: Install Docker

**Linux:**
```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com | bash
sudo usermod -aG docker $USER

# RHEL/Fedora
sudo dnf install docker-ce docker-ce-cli containerd.io
sudo systemctl start docker
sudo systemctl enable docker
```

**Windows:**
1. Download [Docker Desktop](https://www.docker.com/products/docker-desktop/)
2. Run installer with WSL2 backend enabled
3. Restart computer when prompted

**macOS:**
1. Download [Docker Desktop for Mac](https://www.docker.com/products/docker-desktop/)
2. Install and start Docker Desktop
3. Allocate resources in Docker Desktop preferences

#### Step 2: Clone Repository

```bash
git clone https://github.com/Consiliency/mcp-platform.git
cd mcp-platform/mcp-local-setup
```

#### Step 3: Run Setup Script

```bash
# Linux/macOS/WSL
./scripts/setup.sh

# Windows PowerShell
.\scripts\setup.ps1
```

## Platform-Specific Instructions

### Linux Installation

#### Ubuntu/Debian

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install dependencies
sudo apt install -y curl wget git build-essential

# Run installer
curl -fsSL https://raw.githubusercontent.com/Consiliency/mcp-platform/main/mcp-local-setup/install.sh | bash

# Add to PATH
echo 'export PATH="$HOME/.mcp-platform/scripts:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

#### RHEL/Fedora/CentOS

```bash
# Install dependencies
sudo dnf install -y curl wget git gcc make

# Disable SELinux for Docker (optional)
sudo setenforce 0
sudo sed -i 's/^SELINUX=enforcing/SELINUX=permissive/' /etc/selinux/config

# Run installer
curl -fsSL https://raw.githubusercontent.com/Consiliency/mcp-platform/main/mcp-local-setup/install.sh | bash
```

#### Arch Linux

```bash
# Install dependencies
sudo pacman -S docker docker-compose git base-devel

# Start Docker
sudo systemctl start docker
sudo systemctl enable docker

# Run installer
curl -fsSL https://raw.githubusercontent.com/Consiliency/mcp-platform/main/mcp-local-setup/install.sh | bash
```

### Windows Installation

#### Prerequisites

1. **Enable WSL2** (Recommended)
   ```powershell
   # Run as Administrator
   wsl --install
   ```

2. **Enable Hyper-V** (Alternative)
   ```powershell
   Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V -All
   ```

#### Installation Steps

```powershell
# Run PowerShell as Administrator

# Set execution policy
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Install Chocolatey (if not installed)
Set-ExecutionPolicy Bypass -Scope Process -Force
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# Install Docker Desktop
choco install docker-desktop -y

# Restart computer
Restart-Computer

# After restart, run MCP installer
iwr -useb https://raw.githubusercontent.com/Consiliency/mcp-platform/main/mcp-local-setup/install.ps1 | iex
```

#### Windows-Specific Configuration

```powershell
# Add to Windows PATH
$mcpPath = "$env:USERPROFILE\.mcp-platform\scripts"
[Environment]::SetEnvironmentVariable("Path", $env:Path + ";$mcpPath", [EnvironmentVariableTarget]::User)

# Create Windows shortcuts
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut("$env:USERPROFILE\Desktop\MCP Platform.lnk")
$shortcut.TargetPath = "cmd.exe"
$shortcut.Arguments = "/k mcp start"
$shortcut.Save()
```

### macOS Installation

#### Intel Macs

```bash
# Install Homebrew (if not installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Docker Desktop
brew install --cask docker

# Start Docker Desktop
open /Applications/Docker.app

# Wait for Docker to start, then run installer
curl -fsSL https://github.com/your-org/mcp-platform/raw/main/mcp-local-setup/install.sh | bash
```

#### Apple Silicon (M1/M2/M3)

```bash
# Install Rosetta 2 (if needed)
softwareupdate --install-rosetta

# Install Docker Desktop for Apple Silicon
brew install --cask docker

# Configure Docker for ARM64
# In Docker Desktop: Settings > Features > Use Rosetta for x86/amd64 emulation

# Run installer
curl -fsSL https://raw.githubusercontent.com/Consiliency/mcp-platform/main/mcp-local-setup/install.sh | bash
```

### WSL2 Installation

#### Enable WSL2

```powershell
# In Windows PowerShell (Admin)
wsl --install
wsl --set-default-version 2

# Install Ubuntu
wsl --install -d Ubuntu-22.04
```

#### Configure WSL2

```bash
# In WSL2 terminal

# Update WSL2 distro
sudo apt update && sudo apt upgrade -y

# Install Docker in WSL2
curl -fsSL https://get.docker.com | bash
sudo usermod -aG docker $USER

# Enable systemd (for better Docker support)
cat << EOF | sudo tee /etc/wsl.conf
[boot]
systemd=true

[network]
generateResolvConf = false
EOF

# Restart WSL
exit
# In PowerShell: wsl --shutdown
# Then reopen WSL
```

#### Install MCP Platform in WSL2

```bash
# In WSL2 terminal
curl -fsSL https://github.com/your-org/mcp-platform/raw/main/mcp-local-setup/install.sh | bash

# Configure for Windows integration
~/.mcp-platform/scripts/setup-windows-integration.sh
```

## Post-Installation Setup

### 1. Configure Shell Environment

```bash
# Bash
echo 'source ~/.mcp-platform/scripts/mcp-completion.bash' >> ~/.bashrc

# Zsh
echo 'source ~/.mcp-platform/scripts/mcp-completion.zsh' >> ~/.zshrc

# Fish
echo 'source ~/.mcp-platform/scripts/mcp-completion.fish' >> ~/.config/fish/config.fish
```

### 2. Set Up Aliases

```bash
# Add helpful aliases
cat >> ~/.bashrc << 'EOF'
alias mcps='mcp start'
alias mcpst='mcp stop'
alias mcpl='mcp logs -f'
alias mcpd='mcp dashboard'
EOF
```

### 3. Configure Auto-Start

```bash
# Enable auto-start on boot
mcp enable

# Or manually add to startup
# Linux: Add to systemd
sudo cp ~/.mcp-platform/scripts/mcp.service /etc/systemd/system/
sudo systemctl enable mcp.service

# macOS: Add to launchd
cp ~/.mcp-platform/scripts/com.mcp.platform.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.mcp.platform.plist
```

## Network Configuration

### Port Configuration

Default ports used by MCP Platform:

| Service | Port | Protocol | Purpose |
|---------|------|----------|---------|
| Traefik | 8080 | HTTP | Main gateway |
| Traefik | 8081 | WebSocket | WS connections |
| Dashboard | 8080 | HTTP | Web UI |
| Metrics | 9090 | HTTP | Prometheus |

### Firewall Configuration

#### Linux (UFW)
```bash
sudo ufw allow 8080/tcp
sudo ufw allow 8081/tcp
sudo ufw reload
```

#### Linux (firewalld)
```bash
sudo firewall-cmd --permanent --add-port=8080/tcp
sudo firewall-cmd --permanent --add-port=8081/tcp
sudo firewall-cmd --reload
```

#### Windows Firewall
```powershell
New-NetFirewallRule -DisplayName "MCP Platform HTTP" -Direction Inbound -LocalPort 8080 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "MCP Platform WS" -Direction Inbound -LocalPort 8081 -Protocol TCP -Action Allow
```

#### macOS
```bash
# macOS firewall typically allows outbound connections
# For inbound, use System Preferences > Security & Privacy > Firewall
```

### Proxy Configuration

If behind a corporate proxy:

```bash
# Configure Docker proxy
sudo mkdir -p /etc/systemd/system/docker.service.d
cat << EOF | sudo tee /etc/systemd/system/docker.service.d/http-proxy.conf
[Service]
Environment="HTTP_PROXY=http://proxy.example.com:8080"
Environment="HTTPS_PROXY=http://proxy.example.com:8080"
Environment="NO_PROXY=localhost,127.0.0.1"
EOF

sudo systemctl daemon-reload
sudo systemctl restart docker
```

## Verification

### 1. Verify Installation

```bash
# Check MCP CLI
mcp --version

# Check Docker
docker --version
docker compose version

# Check services
mcp status
```

### 2. Test Basic Functionality

```bash
# Start platform
mcp start

# Wait for services to start
sleep 10

# Check health
mcp health

# Test endpoint
curl http://localhost:8080/api/v1/health
```

### 3. Verify Dashboard

```bash
# Open dashboard
mcp dashboard

# Or manually browse to
# http://localhost:8080/dashboard
```

## Troubleshooting

### Common Installation Issues

#### Docker Not Found

```bash
# Linux: Install Docker
curl -fsSL https://get.docker.com | bash

# Windows: Ensure Docker Desktop is running
# Check in system tray

# macOS: Start Docker Desktop
open /Applications/Docker.app
```

#### Permission Denied

```bash
# Linux: Add user to docker group
sudo usermod -aG docker $USER
newgrp docker

# Or run with sudo
sudo mcp start
```

#### Port Already in Use

```bash
# Find process using port
sudo lsof -i :8080
# or
sudo netstat -tulpn | grep 8080

# Kill process or change MCP port
export MCP_HTTP_PORT=8090
mcp start
```

#### WSL2 Network Issues

```powershell
# In PowerShell (Admin)
# Reset WSL network
wsl --shutdown
netsh winsock reset
netsh int ip reset
```

### Installation Logs

Check installation logs:
```bash
# View installation log
cat ~/.mcp-platform/install.log

# Enable debug mode
export MCP_DEBUG=true
./install.sh
```

## Uninstallation

### Complete Removal

```bash
# Stop all services
mcp stop

# Remove MCP Platform
mcp uninstall --all

# Or manually
docker compose down -v
rm -rf ~/.mcp-platform
```

### Keep Data

```bash
# Backup data first
mcp backup create --name pre-uninstall

# Uninstall but keep data
mcp uninstall --keep-data
```

### Remove Docker (Optional)

```bash
# Linux
sudo apt remove docker-ce docker-ce-cli containerd.io
sudo rm -rf /var/lib/docker

# Windows
# Uninstall Docker Desktop from Control Panel

# macOS
brew uninstall --cask docker
```

## Next Steps

- [Quick Start Guide](QUICK_START.md) - Get started quickly
- [User Guide](USER_GUIDE.md) - Learn platform features
- [Configuration Reference](CONFIGURATION_REFERENCE.md) - Configure services

## Getting Help

- **Installation Issues**: [GitHub Issues](https://github.com/Consiliency/mcp-platform/issues)
- **Community Support**: [Discord Server](https://discord.gg/mcp-platform)
- **Documentation**: [Full Documentation](INDEX.md)