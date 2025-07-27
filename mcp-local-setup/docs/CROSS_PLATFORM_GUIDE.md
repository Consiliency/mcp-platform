# Cross-Platform MCP Gateway Setup Guide

This guide explains how to set up and use the MCP Gateway across different platforms (Windows, WSL, macOS, and Linux).

## Platform Detection

The gateway automatically detects your platform and adjusts its behavior accordingly. It detects:
- Operating System (Windows, macOS, Linux)
- WSL (Windows Subsystem for Linux)
- Docker environment
- Available capabilities (display, Windows interop, etc.)

## Setup by Platform

### Windows (Native)

1. **Install Prerequisites**:
   ```powershell
   # Install Docker Desktop
   # Install Node.js (for npx)
   ```

2. **Run Gateway**:
   ```powershell
   # Option 1: Docker mode (recommended)
   docker compose up -d
   
   # Option 2: Native mode
   node gateway/server.js
   ```

3. **Full Capabilities**:
   - ✅ Screenshots work natively
   - ✅ GUI automation available
   - ✅ All file paths accessible

### WSL (Windows Subsystem for Linux)

1. **Install in WSL**:
   ```bash
   cd ~/code/mcp-local-setup
   ./install.sh
   ```

2. **Two Modes Available**:

   **Docker Mode** (current setup):
   - Gateway runs in Docker
   - Limited Windows integration
   - Good for file/code tools
   ```bash
   docker compose up -d
   ```

   **Native Mode** (recommended for full features):
   - Gateway runs directly in WSL
   - Full Windows interop support
   - Screenshots via Windows
   ```bash
   # Stop Docker version
   docker compose down
   
   # Run native
   cd gateway
   npm install
   node server.js
   ```

3. **Windows Tool Support**:
   - In native mode, tools like snap-happy automatically use Windows
   - Path translation handles `/mnt/c/` ↔ `C:\` conversion
   - Display tools work via Windows interop

### macOS

1. **Install Prerequisites**:
   ```bash
   # Install Docker Desktop
   # Install Homebrew
   brew install node
   ```

2. **Run Gateway**:
   ```bash
   docker compose up -d
   ```

3. **Full Capabilities**:
   - ✅ Screenshots work natively
   - ✅ GUI automation available
   - ✅ Unix-style paths

### Linux

1. **Install Prerequisites**:
   ```bash
   # Install Docker
   # Install Node.js
   # For display access:
   sudo apt install x11-xserver-utils  # For X11
   ```

2. **Run Gateway**:
   ```bash
   docker compose up -d
   ```

3. **Display Setup** (for screenshots):
   ```bash
   # Allow Docker to access X11
   xhost +local:docker
   
   # Set in docker-compose.yml:
   environment:
     - DISPLAY=${DISPLAY}
   volumes:
     - /tmp/.X11-unix:/tmp/.X11-unix
   ```

## Configuration

### Platform-Specific Server Config

The gateway supports platform-specific configurations:

```json
{
  "servers": {
    "snap-happy": {
      "transport": "stdio",
      "package": "@mariozechner/snap-happy",
      "capabilities": ["screenshot", "gui"],
      "platforms": {
        "wsl": {
          "requiresWindowsSide": true,
          "command": "powershell.exe",
          "args": ["-Command", "npx -y @mariozechner/snap-happy"]
        },
        "win32": {
          "command": "npx",
          "args": ["-y", "@mariozechner/snap-happy"]
        }
      }
    }
  }
}
```

### Volume Mounts

Configure platform-specific mounts:

```json
{
  "filesystem": {
    "mounts": {
      "win32": {
        "/workspace": "${USERPROFILE}\\Documents"
      },
      "wsl": {
        "/workspace": "${HOME}/code",
        "/windows": "/mnt/c/Users"
      },
      "darwin": {
        "/workspace": "${HOME}/Documents"  
      },
      "linux": {
        "/workspace": "${HOME}/code"
      }
    }
  }
}
```

## Path Translation

The gateway automatically translates paths between platforms:

- **Windows → WSL**: `C:\Users\name\file.txt` → `/mnt/c/Users/name/file.txt`
- **WSL → Windows**: `/mnt/c/Users/name/file.txt` → `C:\Users\name\file.txt`
- **Container → Host**: `/workspace/file.txt` → Actual host path

## Troubleshooting

### WSL Issues

**Problem**: Screenshots don't work in Docker mode
**Solution**: Run gateway in native WSL mode for Windows interop

**Problem**: Can't access Windows files
**Solution**: Use `/mnt/c/` paths or configure mounts

### Display Issues (Linux)

**Problem**: "Cannot open display"
**Solution**: 
```bash
export DISPLAY=:0
xhost +local:docker
```

### Path Issues

**Problem**: File not found errors
**Solution**: Check path translation in logs, ensure mounts are configured

## Best Practices

1. **WSL Users**: Use native mode for tools requiring Windows access
2. **Production**: Use Docker mode for better isolation
3. **Development**: Use native mode for easier debugging
4. **Cross-Platform Tools**: Always use forward slashes in paths

## Feature Matrix

| Feature | Windows | WSL+Docker | WSL+Native | macOS | Linux |
|---------|---------|------------|------------|--------|--------|
| File Access | ✅ | ✅ | ✅ | ✅ | ✅ |
| Screenshots | ✅ | ❌ | ✅* | ✅ | ✅** |
| GUI Automation | ✅ | ❌ | ✅* | ✅ | ✅** |
| Docker Access | ✅ | ✅ | ✅ | ✅ | ✅ |
| Performance | ✅ | ✅ | ✅✅ | ✅ | ✅✅ |

\* Via Windows interop
\** Requires X11/Wayland setup