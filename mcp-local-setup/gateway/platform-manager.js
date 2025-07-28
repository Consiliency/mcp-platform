const os = require('os');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * PlatformManager handles platform-specific logic and detection
 */
class PlatformManager {
  constructor() {
    this.platform = this.detectPlatform();
    this.capabilities = this.detectCapabilities();
  }

  /**
   * Detect the current platform and environment
   */
  detectPlatform() {
    const platform = {
      os: process.platform, // 'win32', 'darwin', 'linux'
      arch: process.arch,
      isWSL: false,
      isDocker: false,
      isNative: true,
      version: os.release()
    };

    // Detect WSL
    if (process.platform === 'linux') {
      try {
        const release = os.release().toLowerCase();
        const version = fs.readFileSync('/proc/version', 'utf8').toLowerCase();
        platform.isWSL = release.includes('microsoft') || 
                        release.includes('wsl') || 
                        version.includes('microsoft') ||
                        version.includes('wsl');
      } catch (e) {
        // Not WSL
      }
    }

    // Detect Docker
    platform.isDocker = fs.existsSync('/.dockerenv') || 
                       fs.existsSync('/run/.containerenv');

    // Set native flag
    platform.isNative = !platform.isDocker;

    return platform;
  }

  /**
   * Detect platform capabilities
   */
  detectCapabilities() {
    const caps = {
      hasDisplay: false,
      hasDocker: false,
      hasWindowsInterop: false,
      hasPowerShell: false,
      hasX11: false,
      hasWayland: false
    };

    // Display detection
    if (process.platform === 'win32' || process.platform === 'darwin') {
      caps.hasDisplay = true;
    } else if (process.env.DISPLAY || process.env.WAYLAND_DISPLAY) {
      caps.hasDisplay = true;
      caps.hasX11 = !!process.env.DISPLAY;
      caps.hasWayland = !!process.env.WAYLAND_DISPLAY;
    }

    // Docker detection
    try {
      execSync('docker --version', { stdio: 'ignore' });
      caps.hasDocker = true;
    } catch (e) {
      // Docker not available
    }

    // Windows interop detection (WSL)
    if (this.platform.isWSL) {
      try {
        execSync('powershell.exe -Command "echo test"', { stdio: 'ignore' });
        caps.hasWindowsInterop = true;
        caps.hasPowerShell = true;
      } catch (e) {
        // Interop not available
      }
    }

    // PowerShell on Windows
    if (process.platform === 'win32') {
      caps.hasPowerShell = true;
    }

    return caps;
  }

  /**
   * Get the home directory for the current platform
   */
  getHomeDirectory() {
    if (process.platform === 'win32') {
      return process.env.USERPROFILE || process.env.HOME;
    }
    return process.env.HOME;
  }

  /**
   * Get platform-specific paths
   */
  getPaths() {
    const paths = {
      home: this.getHomeDirectory(),
      temp: os.tmpdir(),
      separator: path.sep
    };

    if (this.platform.isWSL) {
      // Add Windows paths
      const winUser = process.env.USER || process.env.USERNAME;
      paths.windowsHome = `/mnt/c/Users/${winUser}`;
      paths.windowsSystem = '/mnt/c/Windows';
      paths.wslHome = paths.home;
    }

    return paths;
  }

  /**
   * Translate paths between platforms
   */
  translatePath(inputPath, from = 'native', to = 'native') {
    // Handle WSL path translation
    if (this.platform.isWSL) {
      // Windows to WSL
      if (from === 'windows' && to === 'wsl') {
        // C:\Users\... -> /mnt/c/Users/...
        return inputPath.replace(/^([A-Z]):\\/i, (match, drive) => {
          return `/mnt/${drive.toLowerCase()}/`;
        }).replace(/\\/g, '/');
      }
      
      // WSL to Windows
      if (from === 'wsl' && to === 'windows') {
        // /mnt/c/Users/... -> C:\Users\...
        return inputPath.replace(/^\/mnt\/([a-z])\//i, (match, drive) => {
          return `${drive.toUpperCase()}:\\`;
        }).replace(/\//g, '\\');
      }

      // Auto-detect and translate
      if (from === 'native') {
        if (inputPath.match(/^[A-Z]:\\/i)) {
          return this.translatePath(inputPath, 'windows', 'wsl');
        }
      }
    }

    return inputPath;
  }

  /**
   * Get the appropriate command for running Windows executables
   */
  getWindowsCommand(exe) {
    if (this.platform.isWSL && this.capabilities.hasWindowsInterop) {
      // In WSL, we can run .exe directly
      return exe;
    } else if (process.platform === 'win32') {
      // On Windows, run directly
      return exe;
    } else {
      // Not supported on other platforms
      throw new Error(`Cannot run Windows executable ${exe} on ${process.platform}`);
    }
  }


  /**
   * Get platform-specific server configuration
   */
  getServerConfig(serverConfig) {
    // Check if this server requires Windows-side execution
    if (this.platform.isWSL && this.requiresWindowsSide(serverConfig)) {
      // If no explicit WSL platform config, auto-generate one
      if (!serverConfig.platforms || !serverConfig.platforms.wsl) {
        console.log(`Auto-configuring Windows PowerShell for ${serverConfig.package || 'server'}`);
        
        // Use the PowerShell command builder with environment variables
        const psCommand = this.buildWindowsPowerShellCommand(
          serverConfig.package || serverConfig.command,
          serverConfig.args ? serverConfig.args.filter(arg => arg !== '-y' && arg !== serverConfig.package) : [],
          serverConfig.environment || {}
        );
        
        return {
          ...serverConfig,
          ...psCommand,
          requiresWindowsSide: true,
          platforms: undefined
        };
      }
    }

    // If no platform-specific config, return base config
    if (!serverConfig.platforms) {
      return serverConfig;
    }

    // Determine which platform config to use
    let platformKey = process.platform;
    if (this.platform.isWSL) {
      platformKey = 'wsl';
    }

    // Get platform-specific overrides
    const platformConfig = serverConfig.platforms[platformKey] || 
                          serverConfig.platforms[process.platform] ||
                          {};

    // Merge with base config
    return {
      ...serverConfig,
      ...platformConfig,
      platforms: undefined // Remove platforms object from result
    };
  }

  /**
   * Get volume mounts for the current platform
   */
  getVolumeMounts(mountConfig = {}) {
    const mounts = [];
    
    // Get platform-specific mounts
    let platformKey = process.platform;
    if (this.platform.isWSL) {
      platformKey = 'wsl';
    }

    const platformMounts = mountConfig[platformKey] || {};
    
    // Process mounts
    for (const [containerPath, hostPath] of Object.entries(platformMounts)) {
      // Expand environment variables
      const expandedPath = hostPath.replace(/\$\{(\w+)\}/g, (match, envVar) => {
        return process.env[envVar] || match;
      });
      
      mounts.push({
        container: containerPath,
        host: expandedPath,
        mode: 'rw' // Default to read-write
      });
    }

    // Add display mounts if needed
    if (this.capabilities.hasX11 && !this.platform.isDocker) {
      mounts.push({
        container: '/tmp/.X11-unix',
        host: '/tmp/.X11-unix',
        mode: 'rw'
      });
    }

    return mounts;
  }

  /**
   * Check if a server requires Windows-side execution
   */
  requiresWindowsSide(serverConfig) {
    // Check explicit flag
    if (serverConfig.requiresWindowsSide) {
      return true;
    }

    // Check capabilities
    if (serverConfig.capabilities) {
      const needs = new Set(serverConfig.capabilities);
      
      // On WSL, these need Windows side
      if (this.platform.isWSL) {
        // Extended list of capabilities that require Windows-side execution
        const windowsRequiredCapabilities = [
          'screenshot',     // Screen capture
          'gui',           // GUI interaction
          'windows-api',   // Windows API access
          'browser',       // Browser automation (Chrome, Edge, etc.)
          'automation',    // UI automation tools
          'display',       // Display/monitor access
          'desktop',       // Desktop interaction
          'clipboard',     // Clipboard access
          'notification',  // System notifications
          'audio',         // Audio playback/recording
          'webcam'         // Camera access
        ];
        
        for (const capability of windowsRequiredCapabilities) {
          if (needs.has(capability)) {
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * Get display environment variables
   */
  getDisplayEnvironment() {
    const env = {};

    if (process.platform === 'linux' || this.platform.isWSL) {
      if (process.env.DISPLAY) {
        env.DISPLAY = process.env.DISPLAY;
      }
      if (process.env.WAYLAND_DISPLAY) {
        env.WAYLAND_DISPLAY = process.env.WAYLAND_DISPLAY;
      }
      if (process.env.XAUTHORITY) {
        env.XAUTHORITY = process.env.XAUTHORITY;
      }
    }

    return env;
  }


  /**
   * Build a PowerShell command for Windows-required MCPs when running in WSL
   * This ensures proper PATH setup for npm/npx/node executables
   */
  buildWindowsPowerShellCommand(npmPackage, args = [], additionalEnv = {}) {
    if (!this.platform.isWSL || !this.capabilities.hasWindowsInterop) {
      throw new Error('PowerShell command builder is only for WSL with Windows interop');
    }

    // Get Windows username (may differ from WSL username)
    const windowsUsername = this.getWindowsUsername();
    
    // Common Windows paths for Node.js installations
    const nodePaths = [
      'C:\\Program Files\\nodejs',
      'C:\\Program Files (x86)\\nodejs',
      `C:\\Users\\${windowsUsername}\\AppData\\Roaming\\npm`,
      `C:\\Users\\${windowsUsername}\\AppData\\Local\\Programs\\node`
    ];

    // Build PowerShell command that sets PATH, working directory, and runs npx
    const pathSetup = `$env:PATH = '${nodePaths.join(';')}' + ';' + $env:PATH`;
    
    // Set working directory to Windows temp to avoid UNC path issues
    const workingDirSetup = `Set-Location $env:TEMP`;
    
    // Build environment variable setup commands
    let envSetup = '';
    if (additionalEnv && Object.keys(additionalEnv).length > 0) {
      const envCommands = Object.entries(additionalEnv)
        .filter(([key, value]) => value !== undefined && value !== null)
        .map(([key, value]) => {
          // Check if value looks like a path that needs translation
          let translatedValue = value;
          if (typeof value === 'string') {
            // If it's already a Windows path, keep it as is
            if (value.match(/^[A-Z]:\\/i)) {
              translatedValue = value;
            }
            // If it's a WSL path, translate to Windows
            else if (value.startsWith('/mnt/')) {
              translatedValue = this.translatePath(value, 'wsl', 'windows');
            }
            // If it's a relative path or doesn't look like a path, keep as is
          }
          return `$env:${key} = '${translatedValue}'`;
        });
      if (envCommands.length > 0) {
        envSetup = envCommands.join('; ') + '; ';
      }
    }
    
    const npxCommand = args.length > 0 
      ? `npx -y ${npmPackage} ${args.join(' ')}`
      : `npx -y ${npmPackage}`;

    return {
      command: 'powershell.exe',
      args: [
        '-NoProfile',
        '-Command',
        `${pathSetup}; ${workingDirSetup}; ${envSetup}${npxCommand}`
      ],
      environment: {
        // Pass through display environment for screenshot tools
        ...this.getDisplayEnvironment(),
        // Ensure temp directory is accessible
        TEMP: `C:\\Users\\${windowsUsername}\\AppData\\Local\\Temp`,
        TMP: `C:\\Users\\${windowsUsername}\\AppData\\Local\\Temp`,
        // Also include the additional environment variables here for consistency
        // But translate any WSL paths to Windows paths
        ...Object.entries(additionalEnv).reduce((acc, [key, value]) => {
          let translatedValue = value;
          if (typeof value === 'string') {
            if (value.match(/^[A-Z]:\\/i)) {
              translatedValue = value;
            } else if (value.startsWith('/mnt/')) {
              translatedValue = this.translatePath(value, 'wsl', 'windows');
            }
          }
          acc[key] = translatedValue;
          return acc;
        }, {})
      }
    };
  }

  /**
   * Get Windows username from WSL environment
   * Handles cases where WSL username differs from Windows username
   */
  getWindowsUsername() {
    if (!this.platform.isWSL) {
      return process.env.USERNAME || process.env.USER;
    }
    
    // Try to detect Windows username from the Windows home path
    try {
      const fs = require('fs');
      const users = fs.readdirSync('/mnt/c/Users');
      
      // Filter out system directories
      const systemDirs = ['All Users', 'Default', 'Default User', 'Public', 'desktop.ini'];
      const userDirs = users.filter(u => !systemDirs.includes(u));
      
      // If we have exactly one user directory, use it
      if (userDirs.length === 1) {
        return userDirs[0];
      }
      
      // Try to match WSL username to Windows username
      const wslUser = process.env.USER;
      if (wslUser) {
        // Look for exact match
        if (userDirs.includes(wslUser)) {
          return wslUser;
        }
        
        // Look for partial match (e.g., "jenner" -> "jenne")
        const partialMatch = userDirs.find(u => 
          u.toLowerCase().startsWith(wslUser.toLowerCase().substring(0, 4))
        );
        if (partialMatch) {
          return partialMatch;
        }
      }
    } catch (e) {
      // Fallback to environment variable
    }
    
    // Default fallback
    return process.env.USERNAME || process.env.USER || 'User';
  }

  /**
   * Get a summary of the platform
   */
  getSummary() {
    return {
      platform: this.platform,
      capabilities: this.capabilities,
      paths: this.getPaths(),
      display: this.getDisplayEnvironment()
    };
  }
}

module.exports = PlatformManager;