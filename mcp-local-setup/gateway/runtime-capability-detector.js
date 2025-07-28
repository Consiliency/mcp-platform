const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');

const execAsync = promisify(exec);

/**
 * Runtime Capability Detector
 * Dynamically detects system capabilities at runtime
 */
class RuntimeCapabilityDetector {
  constructor() {
    this.detectedCapabilities = new Map();
    this.detectionInProgress = new Map();
  }

  /**
   * Get cached capability or detect it
   */
  async getCapability(capability) {
    // Return cached result if available
    if (this.detectedCapabilities.has(capability)) {
      return this.detectedCapabilities.get(capability);
    }

    // Wait if detection is already in progress
    if (this.detectionInProgress.has(capability)) {
      return this.detectionInProgress.get(capability);
    }

    // Start new detection
    const detectionPromise = this.detectCapability(capability);
    this.detectionInProgress.set(capability, detectionPromise);

    try {
      const result = await detectionPromise;
      this.detectedCapabilities.set(capability, result);
      this.detectionInProgress.delete(capability);
      return result;
    } catch (error) {
      this.detectionInProgress.delete(capability);
      throw error;
    }
  }

  /**
   * Detect a specific capability
   */
  async detectCapability(capability) {
    switch (capability) {
      case 'screenshot':
        return this.detectScreenshotCapability();
      case 'clipboard':
        return this.detectClipboardCapability();
      case 'notification':
        return this.detectNotificationCapability();
      case 'file-association':
        return this.detectFileAssociationCapability();
      case 'gpu':
        return this.detectGPUCapability();
      case 'docker':
        return this.detectDockerCapability();
      case 'python':
        return this.detectPythonCapability();
      case 'node-version':
        return this.detectNodeVersion();
      case 'display':
        return this.detectDisplayCapability();
      default:
        return { supported: false, reason: 'Unknown capability' };
    }
  }

  /**
   * Detect screenshot capability
   */
  async detectScreenshotCapability() {
    const platform = process.platform;
    
    try {
      if (platform === 'darwin') {
        // Check for screencapture command
        await execAsync('which screencapture');
        return { 
          supported: true, 
          method: 'screencapture',
          features: ['fullscreen', 'window', 'area']
        };
      } else if (platform === 'linux' || process.env.WSL_DISTRO_NAME) {
        // Check for various screenshot tools
        const tools = ['gnome-screenshot', 'scrot', 'import', 'spectacle'];
        for (const tool of tools) {
          try {
            await execAsync(`which ${tool}`);
            return { 
              supported: true, 
              method: tool,
              features: ['fullscreen']
            };
          } catch (e) {
            // Tool not found, try next
          }
        }
        
        // Check if we're in WSL with Windows interop
        if (process.env.WSL_DISTRO_NAME) {
          try {
            await execAsync('which powershell.exe');
            return {
              supported: true,
              method: 'powershell',
              features: ['fullscreen'],
              limitations: ['Requires Windows-side execution']
            };
          } catch (e) {
            // PowerShell not available
          }
        }
      } else if (platform === 'win32') {
        return {
          supported: true,
          method: 'powershell',
          features: ['fullscreen']
        };
      }
    } catch (error) {
      // Error checking capability
    }

    return { supported: false, reason: 'No screenshot tool found' };
  }

  /**
   * Detect clipboard capability
   */
  async detectClipboardCapability() {
    const platform = process.platform;
    
    try {
      if (platform === 'darwin') {
        await execAsync('which pbcopy');
        return { supported: true, method: 'pbcopy/pbpaste' };
      } else if (platform === 'linux' || process.env.WSL_DISTRO_NAME) {
        // Check for X11 clipboard tools
        try {
          await execAsync('which xclip');
          return { supported: true, method: 'xclip' };
        } catch (e) {
          try {
            await execAsync('which xsel');
            return { supported: true, method: 'xsel' };
          } catch (e2) {
            // Check for Wayland
            if (process.env.WAYLAND_DISPLAY) {
              try {
                await execAsync('which wl-copy');
                return { supported: true, method: 'wl-clipboard' };
              } catch (e3) {
                // wl-clipboard not found
              }
            }
          }
        }
        
        // WSL clipboard through clip.exe
        if (process.env.WSL_DISTRO_NAME) {
          try {
            await execAsync('which clip.exe');
            return { 
              supported: true, 
              method: 'clip.exe',
              limitations: ['Write-only through Windows']
            };
          } catch (e) {
            // clip.exe not available
          }
        }
      } else if (platform === 'win32') {
        return { supported: true, method: 'clipboard' };
      }
    } catch (error) {
      // Error checking capability
    }

    return { supported: false, reason: 'No clipboard tool found' };
  }

  /**
   * Detect notification capability
   */
  async detectNotificationCapability() {
    const platform = process.platform;
    
    try {
      if (platform === 'darwin') {
        // macOS always has notification support
        return { supported: true, method: 'osascript' };
      } else if (platform === 'linux' || process.env.WSL_DISTRO_NAME) {
        // Check for notify-send
        try {
          await execAsync('which notify-send');
          return { supported: true, method: 'notify-send' };
        } catch (e) {
          // notify-send not found
        }
      } else if (platform === 'win32') {
        // Windows has built-in notification support
        return { supported: true, method: 'windows-toast' };
      }
    } catch (error) {
      // Error checking capability
    }

    return { supported: false, reason: 'No notification system found' };
  }

  /**
   * Detect file association capability
   */
  async detectFileAssociationCapability() {
    const platform = process.platform;
    
    try {
      if (platform === 'darwin') {
        await execAsync('which open');
        return { supported: true, method: 'open' };
      } else if (platform === 'linux' || process.env.WSL_DISTRO_NAME) {
        // Check for xdg-open
        try {
          await execAsync('which xdg-open');
          return { supported: true, method: 'xdg-open' };
        } catch (e) {
          // xdg-open not found
        }
        
        // WSL can use Windows explorer
        if (process.env.WSL_DISTRO_NAME) {
          try {
            await execAsync('which explorer.exe');
            return { 
              supported: true, 
              method: 'explorer.exe',
              limitations: ['Opens in Windows']
            };
          } catch (e) {
            // explorer.exe not available
          }
        }
      } else if (platform === 'win32') {
        return { supported: true, method: 'start' };
      }
    } catch (error) {
      // Error checking capability
    }

    return { supported: false, reason: 'No file association handler found' };
  }

  /**
   * Detect GPU capability
   */
  async detectGPUCapability() {
    const gpuInfo = {
      supported: false,
      devices: []
    };

    try {
      // Try nvidia-smi
      try {
        const { stdout } = await execAsync('nvidia-smi --query-gpu=name,memory.total --format=csv,noheader');
        const gpus = stdout.trim().split('\n').map(line => {
          const [name, memory] = line.split(', ');
          return { type: 'nvidia', name, memory };
        });
        gpuInfo.devices.push(...gpus);
        gpuInfo.supported = true;
        gpuInfo.cuda = true;
      } catch (e) {
        // NVIDIA not available
      }

      // Try AMD
      try {
        const { stdout } = await execAsync('rocm-smi --showproductname');
        gpuInfo.devices.push({ type: 'amd', name: 'AMD GPU detected' });
        gpuInfo.supported = true;
        gpuInfo.rocm = true;
      } catch (e) {
        // AMD not available
      }

      // Try Intel
      try {
        const { stdout } = await execAsync('clinfo -l');
        if (stdout.includes('Intel')) {
          gpuInfo.devices.push({ type: 'intel', name: 'Intel GPU detected' });
          gpuInfo.supported = true;
          gpuInfo.opencl = true;
        }
      } catch (e) {
        // Intel GPU not available
      }
    } catch (error) {
      // Error detecting GPU
    }

    return gpuInfo;
  }

  /**
   * Detect Docker capability
   */
  async detectDockerCapability() {
    try {
      const { stdout } = await execAsync('docker version --format json');
      const version = JSON.parse(stdout);
      return {
        supported: true,
        version: version.Client?.Version,
        serverVersion: version.Server?.Version,
        compose: await this.checkDockerCompose()
      };
    } catch (error) {
      return { supported: false, reason: 'Docker not installed or not running' };
    }
  }

  /**
   * Check Docker Compose
   */
  async checkDockerCompose() {
    try {
      await execAsync('docker compose version');
      return true;
    } catch (e) {
      try {
        await execAsync('docker-compose version');
        return true;
      } catch (e2) {
        return false;
      }
    }
  }

  /**
   * Detect Python capability
   */
  async detectPythonCapability() {
    const pythonInfo = {
      supported: false,
      versions: []
    };

    // Check various Python commands
    const commands = ['python3', 'python', 'python3.12', 'python3.11', 'python3.10', 'python3.9'];
    
    for (const cmd of commands) {
      try {
        const { stdout } = await execAsync(`${cmd} --version`);
        const version = stdout.trim().replace('Python ', '');
        pythonInfo.versions.push({ command: cmd, version });
        pythonInfo.supported = true;
      } catch (e) {
        // This Python command not available
      }
    }

    // Check for pip
    if (pythonInfo.supported) {
      try {
        await execAsync('pip3 --version');
        pythonInfo.pip = true;
      } catch (e) {
        try {
          await execAsync('pip --version');
          pythonInfo.pip = true;
        } catch (e2) {
          pythonInfo.pip = false;
        }
      }
    }

    return pythonInfo;
  }

  /**
   * Detect Node.js version
   */
  async detectNodeVersion() {
    try {
      const { stdout } = await execAsync('node --version');
      const version = stdout.trim().replace('v', '');
      const [major, minor, patch] = version.split('.').map(Number);
      
      return {
        supported: true,
        version,
        major,
        minor,
        patch,
        npm: await this.checkNpmVersion()
      };
    } catch (error) {
      return { supported: false, reason: 'Node.js not found' };
    }
  }

  /**
   * Check npm version
   */
  async checkNpmVersion() {
    try {
      const { stdout } = await execAsync('npm --version');
      return stdout.trim();
    } catch (e) {
      return null;
    }
  }

  /**
   * Detect display capability
   */
  async detectDisplayCapability() {
    const displayInfo = {
      supported: false,
      type: 'headless'
    };

    // Check for display environment variables
    if (process.env.DISPLAY) {
      displayInfo.supported = true;
      displayInfo.type = 'x11';
      displayInfo.display = process.env.DISPLAY;
    }

    if (process.env.WAYLAND_DISPLAY) {
      displayInfo.supported = true;
      displayInfo.type = 'wayland';
      displayInfo.display = process.env.WAYLAND_DISPLAY;
    }

    // macOS always has display
    if (process.platform === 'darwin') {
      displayInfo.supported = true;
      displayInfo.type = 'native';
    }

    // Windows always has display
    if (process.platform === 'win32') {
      displayInfo.supported = true;
      displayInfo.type = 'native';
    }

    // WSL with X410 or similar
    if (process.env.WSL_DISTRO_NAME && displayInfo.supported) {
      displayInfo.wslDisplay = true;
    }

    return displayInfo;
  }

  /**
   * Detect all capabilities
   */
  async detectAll() {
    const capabilities = [
      'screenshot',
      'clipboard', 
      'notification',
      'file-association',
      'gpu',
      'docker',
      'python',
      'node-version',
      'display'
    ];

    const results = {};
    
    for (const capability of capabilities) {
      try {
        results[capability] = await this.getCapability(capability);
      } catch (error) {
        results[capability] = { 
          supported: false, 
          error: error.message 
        };
      }
    }

    return results;
  }

  /**
   * Get capability report for a specific MCP server
   */
  async getServerCapabilityReport(serverId, requirements = {}) {
    const report = {
      serverId,
      timestamp: new Date().toISOString(),
      capabilities: {},
      missingRequirements: []
    };

    // Check required capabilities
    if (requirements.display) {
      report.capabilities.display = await this.getCapability('display');
      if (!report.capabilities.display.supported) {
        report.missingRequirements.push('display');
      }
    }

    if (requirements.screenshot) {
      report.capabilities.screenshot = await this.getCapability('screenshot');
      if (!report.capabilities.screenshot.supported) {
        report.missingRequirements.push('screenshot');
      }
    }

    if (requirements.docker) {
      report.capabilities.docker = await this.getCapability('docker');
      if (!report.capabilities.docker.supported) {
        report.missingRequirements.push('docker');
      }
    }

    if (requirements.python) {
      report.capabilities.python = await this.getCapability('python');
      if (!report.capabilities.python.supported) {
        report.missingRequirements.push('python');
      }
    }

    // Node version requirements
    if (requirements.node) {
      const nodeInfo = await this.getCapability('node-version');
      report.capabilities.node = nodeInfo;
      
      if (!nodeInfo.supported) {
        report.missingRequirements.push('node');
      } else {
        // Check version requirement
        const required = requirements.node.replace('>=', '').split('.').map(Number);
        const current = [nodeInfo.major, nodeInfo.minor, nodeInfo.patch];
        
        if (current[0] < required[0] || 
            (current[0] === required[0] && current[1] < required[1])) {
          report.missingRequirements.push(`node version ${requirements.node}`);
        }
      }
    }

    report.canRun = report.missingRequirements.length === 0;

    return report;
  }
}

module.exports = RuntimeCapabilityDetector;