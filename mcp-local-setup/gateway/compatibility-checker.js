const fs = require('fs').promises;
const path = require('path');
const PlatformManager = require('./platform-manager');
const RuntimeCapabilityDetector = require('./runtime-capability-detector');

/**
 * MCP Compatibility Checker
 * Manages platform compatibility for MCP servers and their tools
 */
class CompatibilityChecker {
  constructor() {
    this.platformManager = new PlatformManager();
    this.runtimeDetector = new RuntimeCapabilityDetector();
    this.compatibilityData = new Map();
    this.compatibilityDir = path.join(__dirname, '..', 'compatibility', 'servers');
    this.currentPlatform = this.detectCurrentPlatform();
    
    // Load compatibility data on initialization
    this.loadCompatibilityData().catch(err => {
      console.warn('Failed to load compatibility data:', err.message);
    });
  }
  
  /**
   * Detect the current platform
   */
  detectCurrentPlatform() {
    const platform = this.platformManager.platform;
    
    // Map to our compatibility platform keys
    if (platform.isWSL) {
      return 'wsl';
    } else if (process.platform === 'darwin') {
      return 'darwin';
    } else if (process.platform === 'win32') {
      return 'win32';
    } else {
      return 'linux';
    }
  }
  
  /**
   * Load all compatibility data files
   */
  async loadCompatibilityData() {
    try {
      const files = await fs.readdir(this.compatibilityDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));
      
      for (const file of jsonFiles) {
        try {
          const data = await fs.readFile(path.join(this.compatibilityDir, file), 'utf8');
          const compatibility = JSON.parse(data);
          this.compatibilityData.set(compatibility.id, compatibility);
        } catch (err) {
          console.warn(`Failed to load compatibility data from ${file}:`, err.message);
        }
      }
      
      console.log(`Loaded compatibility data for ${this.compatibilityData.size} servers`);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
      // Directory doesn't exist yet
      console.log('No compatibility data directory found');
    }
  }
  
  /**
   * Get compatibility info for a server
   */
  getServerCompatibility(serverId) {
    return this.compatibilityData.get(serverId);
  }
  
  /**
   * Check if a server is supported on the current platform
   */
  isServerSupported(serverId) {
    const compat = this.getServerCompatibility(serverId);
    if (!compat) {
      // No compatibility data means we assume it works
      return { supported: true, level: 'unknown' };
    }
    
    const platformSupport = compat.compatibility.platforms[this.currentPlatform];
    if (!platformSupport) {
      return { supported: false, level: 'unsupported' };
    }
    
    if (typeof platformSupport.supported === 'boolean') {
      return { 
        supported: platformSupport.supported, 
        level: platformSupport.supported ? 'full' : 'unsupported' 
      };
    }
    
    return {
      supported: platformSupport.supported !== 'unsupported',
      level: platformSupport.supported,
      tested: platformSupport.tested || false,
      limitations: platformSupport.limitations || []
    };
  }
  
  /**
   * Filter tools based on platform compatibility
   */
  filterToolsByPlatform(serverId, tools) {
    const compat = this.getServerCompatibility(serverId);
    if (!compat) {
      // No compatibility data, return all tools
      return tools;
    }
    
    const platformSupport = compat.compatibility.platforms[this.currentPlatform];
    if (!platformSupport || platformSupport.supported === 'unsupported') {
      // Server not supported on this platform
      return [];
    }
    
    // Filter tools based on compatibility data
    return tools.filter(tool => {
      // Remove namespace prefix if present (e.g., "snap-happy:ListWindows" -> "ListWindows")
      const toolName = tool.name.includes(':') ? tool.name.split(':')[1] : tool.name;
      const toolCompat = compat.compatibility.tools[toolName];
      
      if (!toolCompat) {
        // No specific tool compatibility data, include it
        return true;
      }
      
      // Check if tool is available on current platform
      if (toolCompat.platforms && !toolCompat.platforms.includes(this.currentPlatform)) {
        console.log(`Filtering out ${tool.name} - not supported on ${this.currentPlatform}`);
        return false;
      }
      
      return true;
    });
  }
  
  /**
   * Enhance tool descriptions with platform-specific information
   */
  enhanceToolDescriptions(serverId, tools) {
    const compat = this.getServerCompatibility(serverId);
    if (!compat) {
      return tools;
    }
    
    return tools.map(tool => {
      // Remove namespace prefix if present (e.g., "snap-happy:ListWindows" -> "ListWindows")
      const toolName = tool.name.includes(':') ? tool.name.split(':')[1] : tool.name;
      const toolCompat = compat.compatibility.tools[toolName];
      
      if (!toolCompat) {
        return tool;
      }
      
      const enhanced = { ...tool };
      
      // Add platform limitations to description
      if (toolCompat.platforms && !toolCompat.platforms.includes('all')) {
        const supportedPlatforms = toolCompat.platforms.map(p => {
          switch(p) {
            case 'darwin': return 'macOS';
            case 'win32': return 'Windows';
            case 'linux': return 'Linux';
            case 'wsl': return 'WSL';
            default: return p;
          }
        }).join(', ');
        
        enhanced.description = `${tool.description} (Available on: ${supportedPlatforms})`;
      }
      
      // Add parameter restrictions
      if (toolCompat.parameters && tool.inputSchema?.properties) {
        for (const [param, paramCompat] of Object.entries(toolCompat.parameters)) {
          if (paramCompat.platforms && !paramCompat.platforms.includes(this.currentPlatform)) {
            // Remove unsupported parameters
            delete enhanced.inputSchema.properties[param];
            // Remove from required if present
            if (enhanced.inputSchema.required) {
              enhanced.inputSchema.required = enhanced.inputSchema.required.filter(r => r !== param);
            }
          }
        }
      }
      
      // Add deprecation notice if applicable
      if (toolCompat.deprecationNotice) {
        enhanced.description = `[DEPRECATED] ${enhanced.description} - ${toolCompat.deprecationNotice}`;
      }
      
      return enhanced;
    });
  }
  
  /**
   * Get platform-specific issues for a server
   */
  getKnownIssues(serverId) {
    const compat = this.getServerCompatibility(serverId);
    if (!compat || !compat.knownIssues) {
      return [];
    }
    
    // Filter issues for current platform
    return compat.knownIssues.filter(issue => 
      !issue.platforms || issue.platforms.includes(this.currentPlatform)
    );
  }
  
  /**
   * Get platform requirements for a server
   */
  getPlatformRequirements(serverId) {
    const compat = this.getServerCompatibility(serverId);
    if (!compat) {
      return {};
    }
    
    const platformSupport = compat.compatibility.platforms[this.currentPlatform];
    if (!platformSupport) {
      return {};
    }
    
    return {
      ...compat.compatibility.requirements,
      ...platformSupport.requirements
    };
  }
  
  /**
   * Generate compatibility report for a server
   */
  generateCompatibilityReport(serverId) {
    const support = this.isServerSupported(serverId);
    const issues = this.getKnownIssues(serverId);
    const requirements = this.getPlatformRequirements(serverId);
    const compat = this.getServerCompatibility(serverId);
    
    const report = {
      serverId,
      platform: this.currentPlatform,
      supported: support.supported,
      level: support.level,
      tested: support.tested || false,
      limitations: support.limitations || [],
      knownIssues: issues,
      requirements
    };
    
    if (compat) {
      report.name = compat.name;
      report.lastUpdated = compat.lastUpdated;
      
      const platformData = compat.compatibility.platforms[this.currentPlatform];
      if (platformData) {
        report.features = platformData.features || [];
      }
    }
    
    return report;
  }
  
  /**
   * Update compatibility data for a server
   */
  async updateCompatibilityData(serverId, updates) {
    let compat = this.getServerCompatibility(serverId);
    
    if (!compat) {
      // Create new compatibility entry
      compat = {
        id: serverId,
        name: serverId,
        version: '1.0.0',
        lastUpdated: new Date().toISOString(),
        compatibility: {
          platforms: {},
          tools: {}
        }
      };
    }
    
    // Merge updates
    compat = {
      ...compat,
      ...updates,
      lastUpdated: new Date().toISOString()
    };
    
    // Save to file
    await fs.mkdir(this.compatibilityDir, { recursive: true });
    await fs.writeFile(
      path.join(this.compatibilityDir, `${serverId}.json`),
      JSON.stringify(compat, null, 2)
    );
    
    // Update cache
    this.compatibilityData.set(serverId, compat);
    
    return compat;
  }
  
  /**
   * Check runtime capabilities for a server
   */
  async checkRuntimeCapabilities(serverId) {
    const requirements = this.getPlatformRequirements(serverId);
    const report = await this.runtimeDetector.getServerCapabilityReport(serverId, requirements);
    
    // Add platform compatibility info
    const platformSupport = this.isServerSupported(serverId);
    report.platformSupport = platformSupport;
    
    // Combine static and runtime checks
    report.overallSupport = platformSupport.supported && report.canRun;
    
    return report;
  }
  
  /**
   * Get all runtime capabilities
   */
  async getAllRuntimeCapabilities() {
    return this.runtimeDetector.detectAll();
  }
  
  /**
   * Enhanced compatibility report with runtime detection
   */
  async generateEnhancedCompatibilityReport(serverId) {
    const staticReport = this.generateCompatibilityReport(serverId);
    const runtimeReport = await this.checkRuntimeCapabilities(serverId);
    
    return {
      ...staticReport,
      runtime: runtimeReport,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = CompatibilityChecker;