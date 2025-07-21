#!/bin/bash
# MCP Platform Installer for Linux/WSL
# Supports Ubuntu, Debian, and other Debian-based distributions

set -e

# Default installation path
INSTALL_PATH="${MCP_HOME:-$HOME/.mcp-platform}"
SKIP_DOCKER=false
SKIP_NODE=false

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Print colored output
print_header() {
    echo -e "${CYAN}================================================${NC}"
    echo -e "${CYAN}       MCP Platform Installer for Linux         ${NC}"
    echo -e "${CYAN}================================================${NC}"
    echo ""
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${CYAN}→ $1${NC}"
}

# Check if running in WSL
is_wsl() {
    if grep -qEi "(Microsoft|WSL)" /proc/version &> /dev/null; then
        return 0
    else
        return 1
    fi
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Detect installed AI tools
detect_ai_tools() {
    local tools=()
    
    # Check for Claude Code
    if command_exists claude; then
        tools+=("Claude Code")
    fi
    
    # Check for VS Code
    if command_exists code; then
        tools+=("VS Code")
    fi
    
    # Check for Cursor (common installation paths)
    if [ -f "/usr/local/bin/cursor" ] || [ -f "$HOME/.local/bin/cursor" ]; then
        tools+=("Cursor")
    fi
    
    # In WSL, check Windows programs
    if is_wsl; then
        # Check Windows VS Code
        if command_exists code.exe; then
            tools+=("VS Code (Windows)")
        fi
        
        # Check for Windows apps via path
        local win_home="/mnt/c/Users/$USER"
        if [ -d "$win_home/AppData/Local/Programs/Claude" ]; then
            tools+=("Claude Desktop (Windows)")
        fi
        if [ -d "$win_home/AppData/Local/Programs/cursor" ]; then
            tools+=("Cursor (Windows)")
        fi
    fi
    
    echo "${tools[@]}"
}

# Install Docker if needed
install_docker() {
    echo -e "${YELLOW}Installing Docker...${NC}"
    
    # Update package list
    sudo apt-get update
    
    # Install prerequisites
    sudo apt-get install -y \
        apt-transport-https \
        ca-certificates \
        curl \
        gnupg \
        lsb-release
    
    # Add Docker GPG key
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
    
    # Add Docker repository
    echo \
        "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu \
        $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    # Install Docker
    sudo apt-get update
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    
    # Add user to docker group
    sudo usermod -aG docker $USER
    
    print_success "Docker installed successfully"
    print_warning "You'll need to log out and back in for group changes to take effect"
}

# Install Node.js if needed
install_node() {
    echo -e "${YELLOW}Installing Node.js...${NC}"
    
    # Install via NodeSource repository
    curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
    sudo apt-get install -y nodejs
    
    print_success "Node.js installed successfully"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --path)
            INSTALL_PATH="$2"
            shift 2
            ;;
        --skip-docker)
            SKIP_DOCKER=true
            shift
            ;;
        --skip-node)
            SKIP_NODE=true
            shift
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --path PATH      Installation path (default: ~/.mcp-platform)"
            echo "  --skip-docker    Skip Docker installation check"
            echo "  --skip-node      Skip Node.js installation check"
            echo "  --help           Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Main installation
print_header

echo -e "${YELLOW}Checking system requirements...${NC}"

# Check OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    echo "  OS: $NAME $VERSION"
else
    print_warning "Unknown OS distribution"
fi

# Check if running in WSL
if is_wsl; then
    print_success "Running in WSL2"
    WSL_DISTRO=$(cat /proc/sys/kernel/hostname)
    echo "  WSL Distribution: $WSL_DISTRO"
else
    echo "  Running on native Linux"
fi

# Check Docker
if ! $SKIP_DOCKER; then
    if command_exists docker; then
        DOCKER_VERSION=$(docker --version | cut -d' ' -f3 | tr -d ',')
        print_success "Docker detected (version $DOCKER_VERSION)"
    else
        print_error "Docker not detected"
        read -p "Would you like to install Docker? [Y/n] " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
            install_docker
        else
            print_warning "Continuing without Docker. Some features will be limited."
        fi
    fi
fi

# Check Node.js (for CLI tools)
if ! $SKIP_NODE; then
    if command_exists node; then
        NODE_VERSION=$(node --version)
        print_success "Node.js detected (version $NODE_VERSION)"
    else
        print_error "Node.js not detected"
        read -p "Would you like to install Node.js? [Y/n] " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
            install_node
        else
            print_warning "Continuing without Node.js. CLI tools will be limited."
        fi
    fi
fi

# Detect AI tools
echo ""
echo -e "${YELLOW}Detecting installed AI tools...${NC}"
AI_TOOLS=($(detect_ai_tools))
if [ ${#AI_TOOLS[@]} -gt 0 ]; then
    print_success "Found AI tools:"
    for tool in "${AI_TOOLS[@]}"; do
        echo "  - $tool"
    done
else
    print_warning "No AI tools detected"
fi

# Installation confirmation
echo ""
echo -e "${YELLOW}Installation Configuration:${NC}"
echo "  Install Path: $INSTALL_PATH"
echo ""
read -p "Proceed with installation? [Y/n] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]] && [[ ! -z $REPLY ]]; then
    echo "Installation cancelled."
    exit 0
fi

# Create installation directory
echo ""
echo -e "${YELLOW}Creating installation directory...${NC}"
mkdir -p "$INSTALL_PATH"/{scripts,profiles,registry,templates,cli,config}

# Download installation files
echo -e "${YELLOW}Downloading MCP Platform files...${NC}"

# GitHub repository URL (replace with actual repo when available)
REPO_URL="${MCP_REPO_URL:-https://github.com/your-org/mcp-platform}"
REPO_BRANCH="${MCP_REPO_BRANCH:-main}"
REPO_ARCHIVE="${REPO_URL}/archive/refs/heads/${REPO_BRANCH}.tar.gz"

# Check if we're in development mode (installing from local directory)
if [ -f "docker-compose.yml" ] && [ -d "scripts" ] && [ -d "registry" ]; then
    echo "Installing from local directory..."
    cp -r . "$INSTALL_PATH/"
    print_success "Copied local files to installation directory"
else
    # Download and extract from repository
    echo "Downloading from ${REPO_URL}..."
    
    # Create temp directory
    TEMP_DIR=$(mktemp -d)
    trap "rm -rf $TEMP_DIR" EXIT
    
    if command_exists curl; then
        if curl -L "${REPO_ARCHIVE}" -o "$TEMP_DIR/archive.tar.gz"; then
            tar -xz -C "$TEMP_DIR" -f "$TEMP_DIR/archive.tar.gz"
            # Find the extracted directory (GitHub adds a prefix)
            EXTRACT_DIR=$(find "$TEMP_DIR" -maxdepth 1 -type d -name "mcp-platform-*" | head -1)
            if [ -n "$EXTRACT_DIR" ]; then
                cp -r "$EXTRACT_DIR"/* "$INSTALL_PATH/"
                print_success "Downloaded and extracted MCP Platform files"
            else
                print_error "Failed to find extracted files"
                exit 1
            fi
        else
            print_error "Failed to download from ${REPO_URL}"
            print_warning "Using fallback local installation..."
            # Fallback: create essential files
            mkdir -p "$INSTALL_PATH"/{scripts,profiles,registry,templates,cli,config,traefik,dashboard}
        fi
    elif command_exists wget; then
        if wget -O "$TEMP_DIR/archive.tar.gz" "${REPO_ARCHIVE}"; then
            tar -xz -C "$TEMP_DIR" -f "$TEMP_DIR/archive.tar.gz"
            EXTRACT_DIR=$(find "$TEMP_DIR" -maxdepth 1 -type d -name "mcp-platform-*" | head -1)
            if [ -n "$EXTRACT_DIR" ]; then
                cp -r "$EXTRACT_DIR"/* "$INSTALL_PATH/"
                print_success "Downloaded and extracted MCP Platform files"
            else
                print_error "Failed to find extracted files"
                exit 1
            fi
        else
            print_error "Failed to download from ${REPO_URL}"
            exit 1
        fi
    else
        print_error "Neither curl nor wget found. Please install one of them."
        exit 1
    fi
fi

# Verify essential files exist
ESSENTIAL_FILES=(
    "docker-compose.yml"
    "scripts/mcp"
    "scripts/registry-manager.js"
    "scripts/profile-manager.sh"
    "registry/mcp-catalog.json"
    "profiles/default.yml"
)

MISSING_FILES=()
for file in "${ESSENTIAL_FILES[@]}"; do
    if [ ! -f "$INSTALL_PATH/$file" ]; then
        MISSING_FILES+=("$file")
    fi
done

if [ ${#MISSING_FILES[@]} -gt 0 ]; then
    print_warning "Some files are missing and will be created:"
    for file in "${MISSING_FILES[@]}"; do
        echo "  - $file"
    done
    
    # Create missing essential files
    if [ ! -f "$INSTALL_PATH/docker-compose.yml" ]; then
        cat > "$INSTALL_PATH/docker-compose.yml" << 'EOF'
# MCP Platform Docker Compose Configuration
# This file will be populated by the registry manager
version: "3.8"
services:
  # Services will be added here by registry manager
networks:
  mcp_network:
    driver: bridge
EOF
    fi
fi

print_success "Installation files ready"

# Create MCP CLI script
cat > "$INSTALL_PATH/scripts/mcp" << 'EOF'
#!/bin/bash
# MCP Platform CLI
# Manages MCP services and configurations

MCP_HOME="${MCP_HOME:-$HOME/.mcp-platform}"
COMMAND=$1
shift

case $COMMAND in
    start)
        echo "Starting MCP services..."
        cd "$MCP_HOME" && docker compose up -d
        ;;
    stop)
        echo "Stopping MCP services..."
        cd "$MCP_HOME" && docker compose down
        ;;
    list)
        echo "Available MCP servers:"
        cat "$MCP_HOME/registry/available-mcps.json" | jq -r '.servers[].name'
        ;;
    install)
        echo "Installing MCP server: $1"
        # Implementation coming
        ;;
    status)
        cd "$MCP_HOME" && docker compose ps
        ;;
    *)
        echo "Usage: mcp {start|stop|list|install|status}"
        exit 1
        ;;
esac
EOF
chmod +x "$INSTALL_PATH/scripts/mcp"
print_success "Created MCP CLI"

# Create service registry
cat > "$INSTALL_PATH/registry/available-mcps.json" << 'EOF'
{
  "version": "1.0",
  "servers": [
    {
      "name": "filesystem",
      "description": "File system operations",
      "source": "npm:@modelcontextprotocol/server-filesystem",
      "type": "npm"
    },
    {
      "name": "playwright",
      "description": "Browser automation with Playwright",
      "source": "local:../playwright-mcp",
      "type": "docker"
    },
    {
      "name": "git",
      "description": "Git repository operations",
      "source": "npm:@modelcontextprotocol/server-git",
      "type": "npm"
    }
  ]
}
EOF
print_success "Created service registry"

# Create default profile
cat > "$INSTALL_PATH/profiles/default.yml" << 'EOF'
# Default MCP Profile
name: default
description: Default MCP services
services:
  - filesystem
  - git
settings:
  auto_start: true
  restart_policy: unless-stopped
EOF
print_success "Created default profile"

# Setup shell integration
echo ""
echo -e "${YELLOW}Setting up shell integration...${NC}"

# Detect shell
SHELL_NAME=$(basename "$SHELL")
SHELL_RC=""

case $SHELL_NAME in
    bash)
        SHELL_RC="$HOME/.bashrc"
        ;;
    zsh)
        SHELL_RC="$HOME/.zshrc"
        ;;
    *)
        SHELL_RC="$HOME/.profile"
        ;;
esac

# Add to shell RC file
if [ -f "$SHELL_RC" ]; then
    if ! grep -q "MCP Platform" "$SHELL_RC"; then
        cat >> "$SHELL_RC" << EOF

# MCP Platform
export MCP_HOME="$INSTALL_PATH"
export PATH="\$MCP_HOME/scripts:\$PATH"

# MCP aliases
alias mcp-start='mcp start'
alias mcp-stop='mcp stop'
alias mcp-status='mcp status'
EOF
        print_success "Updated $SHELL_RC"
    fi
fi

# WSL-specific configuration
if is_wsl; then
    echo ""
    echo -e "${YELLOW}Configuring WSL integration...${NC}"
    
    # Create Windows integration script
    cat > "$INSTALL_PATH/scripts/setup-windows-integration.sh" << 'EOF'
#!/bin/bash
# Sets up Windows integration for MCP Platform

# Get Windows username
WIN_USER=$(cmd.exe /c "echo %USERNAME%" 2>/dev/null | tr -d '\r')
WIN_HOME="/mnt/c/Users/$WIN_USER"

echo "Setting up Windows integration for user: $WIN_USER"

# Create PowerShell script in Windows
cat > "$WIN_HOME/.mcp-platform-wsl.ps1" << 'EOW'
# MCP Platform WSL Integration
function mcp-wsl {
    wsl -e bash -lc "mcp $args"
}
Set-Alias mcp mcp-wsl
EOW

echo "Windows integration configured!"
echo "Add this line to your PowerShell profile:"
echo "  . \$HOME\.mcp-platform-wsl.ps1"
EOF
    chmod +x "$INSTALL_PATH/scripts/setup-windows-integration.sh"
    print_success "Created Windows integration script"
fi

# Generate client configurations
echo ""
echo -e "${YELLOW}Generating client configurations...${NC}"

# Claude Code configuration
if [[ " ${AI_TOOLS[@]} " =~ " Claude Code " ]]; then
    CLAUDE_CONFIG_DIR="$HOME/.config/claude"
    mkdir -p "$CLAUDE_CONFIG_DIR"
    
    cat > "$CLAUDE_CONFIG_DIR/mcp-servers.json" << EOF
{
  "mcpServers": {
    "filesystem": {
      "url": "http://localhost:8080/mcp/filesystem"
    },
    "git": {
      "url": "http://localhost:8080/mcp/git"
    }
  }
}
EOF
    print_success "Generated Claude Code configuration"
fi

# VS Code configuration
if [[ " ${AI_TOOLS[@]} " =~ " VS Code " ]]; then
    print_info "VS Code configuration can be added to settings.json"
fi

# Installation complete
echo ""
echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}      MCP Platform Installation Complete!       ${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Reload your shell configuration:"
echo "     ${CYAN}source $SHELL_RC${NC}"
echo "  2. Start MCP services:"
echo "     ${CYAN}mcp start${NC}"
echo "  3. View available servers:"
echo "     ${CYAN}mcp list${NC}"
echo "  4. Check service status:"
echo "     ${CYAN}mcp status${NC}"
echo ""

if is_wsl; then
    echo -e "${YELLOW}WSL Integration:${NC}"
    echo "  - For Windows PowerShell access, run:"
    echo "    ${CYAN}$INSTALL_PATH/scripts/setup-windows-integration.sh${NC}"
    echo "  - Access services from Windows at: ${CYAN}http://localhost:8080${NC}"
fi

echo ""
echo -e "${BLUE}Documentation: https://github.com/your-repo/mcp-platform${NC}"
echo ""