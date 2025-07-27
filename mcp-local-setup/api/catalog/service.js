/**
 * Catalog Service for MCP Server Management
 * Handles adding, removing, and managing MCP servers in the catalog
 */

const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const { spawn } = require('child_process');
const GitHubParser = require('../github/parser');

class CatalogService {
  constructor(options = {}) {
    this.catalogPath = options.catalogPath || path.join(__dirname, '../../registry/mcp-catalog.json');
    this.registryManager = path.join(__dirname, '../../scripts/registry-manager.js');
    this.profileManager = path.join(__dirname, '../../scripts/profile-manager.sh');
    this.githubParser = new GitHubParser(options);
  }

  /**
   * Load the current catalog
   */
  async loadCatalog() {
    try {
      const data = await fs.readFile(this.catalogPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      throw new Error(`Failed to load catalog: ${error.message}`);
    }
  }

  /**
   * Save the catalog
   */
  async saveCatalog(catalog) {
    try {
      await fs.writeFile(this.catalogPath, JSON.stringify(catalog, null, 2));
      // Regenerate docker-compose after catalog update
      await this.regenerateDockerCompose();
    } catch (error) {
      throw new Error(`Failed to save catalog: ${error.message}`);
    }
  }

  /**
   * Add server from GitHub repository
   */
  async addFromGitHub(githubUrl) {
    try {
      // Use the enhanced GitHub parser
      const serverInfo = await this.githubParser.parseRepository(githubUrl);
      
      // Add to catalog
      await this.addToCatalog(serverInfo);
      
      return serverInfo;
    } catch (error) {
      throw new Error(`Failed to add from GitHub: ${error.message}`);
    }
  }

  /**
   * Add server from npm package
   */
  async addFromNpm(packageName) {
    try {
      // Validate npm package exists
      const npmInfo = await this.fetchNpmPackageInfo(packageName);
      
      // Create server info
      const serverInfo = {
        id: packageName.replace(/[@\/]/g, '-'),
        name: npmInfo.name,
        description: npmInfo.description || 'MCP server from npm',
        category: 'custom',
        source: {
          type: 'npm',
          package: packageName,
          version: 'latest'
        },
        docker: {
          build: {
            dockerfile: 'templates/npm.Dockerfile',
            args: {
              PACKAGE: packageName
            }
          }
        },
        config: {
          port: this.getNextAvailablePort(),
          environment: {
            MCP_MODE: 'stdio'
          }
        },
        transport: this.detectTransportFromPackage(npmInfo),
        clients: ['claude-code', 'vs-code', 'cursor']
      };
      
      // Add to catalog
      await this.addToCatalog(serverInfo);
      
      return serverInfo;
    } catch (error) {
      throw new Error(`Failed to add from npm: ${error.message}`);
    }
  }

  /**
   * Add server from Python pip package
   */
  async addFromPip(packageName) {
    try {
      // Validate pip package exists
      const pipInfo = await this.fetchPipPackageInfo(packageName);
      
      // Create server info
      const serverInfo = {
        id: packageName.replace(/[_\.]/g, '-').toLowerCase(),
        name: pipInfo.info.name,
        description: pipInfo.info.summary || 'MCP server from PyPI',
        category: 'custom',
        source: {
          type: 'pip',
          package: packageName,
          version: 'latest'
        },
        docker: {
          build: {
            dockerfile: 'templates/pip.Dockerfile',
            args: {
              PACKAGE: packageName
            }
          }
        },
        config: {
          port: this.getNextAvailablePort(),
          environment: {
            MCP_MODE: 'stdio'
          },
          // Detect command from package metadata
          command: this.detectPipCommand(packageName, pipInfo)
        },
        transport: this.detectTransportFromPipPackage(pipInfo),
        clients: ['claude-code', 'vs-code', 'cursor']
      };
      
      // Add to catalog
      await this.addToCatalog(serverInfo);
      
      return serverInfo;
    } catch (error) {
      throw new Error(`Failed to add from pip: ${error.message}`);
    }
  }

  /**
   * Add server from Rust Cargo crate
   */
  async addFromCargo(crateName) {
    try {
      // Validate cargo crate exists
      const crateInfo = await this.fetchCargoPackageInfo(crateName);
      
      // Create server info
      const serverInfo = {
        id: crateName.replace(/[_]/g, '-').toLowerCase(),
        name: crateInfo.crate.name,
        description: crateInfo.crate.description || 'MCP server from crates.io',
        category: 'custom',
        source: {
          type: 'cargo',
          package: crateName,
          version: 'latest'
        },
        docker: {
          build: {
            dockerfile: 'templates/cargo.Dockerfile',
            args: {
              PACKAGE: crateName
            }
          }
        },
        config: {
          port: this.getNextAvailablePort(),
          environment: {
            MCP_MODE: 'stdio'
          }
        },
        transport: 'stdio', // Most Rust MCP servers use stdio
        clients: ['claude-code', 'vs-code', 'cursor']
      };
      
      // Add to catalog
      await this.addToCatalog(serverInfo);
      
      return serverInfo;
    } catch (error) {
      throw new Error(`Failed to add from cargo: ${error.message}`);
    }
  }

  /**
   * Add server from Go module
   */
  async addFromGo(modulePath) {
    try {
      // Basic validation (Go modules don't have a central API like npm/pip)
      const moduleInfo = this.parseGoModule(modulePath);
      
      // Create server info
      const serverInfo = {
        id: moduleInfo.name.replace(/[\/]/g, '-').toLowerCase(),
        name: moduleInfo.name,
        description: `MCP server from Go module ${modulePath}`,
        category: 'custom',
        source: {
          type: 'go',
          package: modulePath,
          version: 'latest'
        },
        docker: {
          build: {
            dockerfile: 'templates/go.Dockerfile',
            args: {
              PACKAGE: modulePath
            }
          }
        },
        config: {
          port: this.getNextAvailablePort(),
          environment: {
            MCP_MODE: 'stdio'
          }
        },
        transport: 'stdio',
        clients: ['claude-code', 'vs-code', 'cursor']
      };
      
      // Add to catalog
      await this.addToCatalog(serverInfo);
      
      return serverInfo;
    } catch (error) {
      throw new Error(`Failed to add from go: ${error.message}`);
    }
  }

  /**
   * Add server from Ruby gem
   */
  async addFromGem(gemName) {
    try {
      // Validate Ruby gem exists
      const gemInfo = await this.fetchGemPackageInfo(gemName);
      
      // Create server info
      const serverInfo = {
        id: gemName.replace(/[_]/g, '-').toLowerCase(),
        name: gemInfo.name,
        description: gemInfo.info || 'MCP server from RubyGems',
        category: 'custom',
        source: {
          type: 'gem',
          package: gemName,
          version: 'latest'
        },
        docker: {
          build: {
            dockerfile: 'templates/gem.Dockerfile',
            args: {
              PACKAGE: gemName
            }
          }
        },
        config: {
          port: this.getNextAvailablePort(),
          environment: {
            MCP_MODE: 'stdio'
          },
          command: this.detectGemCommand(gemName, gemInfo)
        },
        transport: 'stdio',
        clients: ['claude-code', 'vs-code', 'cursor']
      };
      
      // Add to catalog
      await this.addToCatalog(serverInfo);
      
      return serverInfo;
    } catch (error) {
      throw new Error(`Failed to add from gem: ${error.message}`);
    }
  }

  /**
   * Add server from PHP Composer package
   */
  async addFromComposer(packageName) {
    try {
      // Validate Composer package exists
      const composerInfo = await this.fetchComposerPackageInfo(packageName);
      
      // Create server info
      const serverInfo = {
        id: packageName.replace(/[\/]/g, '-').toLowerCase(),
        name: composerInfo.name,
        description: composerInfo.description || 'MCP server from Packagist',
        category: 'custom',
        source: {
          type: 'composer',
          package: packageName,
          version: 'latest'
        },
        docker: {
          build: {
            dockerfile: 'templates/composer.Dockerfile',
            args: {
              PACKAGE: packageName
            }
          }
        },
        config: {
          port: this.getNextAvailablePort(),
          environment: {
            MCP_MODE: 'stdio'
          },
          command: this.detectComposerCommand(packageName, composerInfo)
        },
        transport: 'stdio',
        clients: ['claude-code', 'vs-code', 'cursor']
      };
      
      // Add to catalog
      await this.addToCatalog(serverInfo);
      
      return serverInfo;
    } catch (error) {
      throw new Error(`Failed to add from composer: ${error.message}`);
    }
  }

  /**
   * Get list of popular MCP servers
   */
  async getPopularServers() {
    return [
      {
        id: 'snap-happy',
        name: 'Snap Happy',
        description: 'Cross-platform screenshot utility',
        npm: '@mariozechner/snap-happy',
        github: 'https://github.com/badlogic/lemmy/tree/main/apps/snap-happy',
        category: 'utility'
      },
      {
        id: 'github-mcp',
        name: 'GitHub MCP',
        description: 'GitHub API integration for repositories, issues, and PRs',
        npm: '@github/github-mcp-server',
        github: 'https://github.com/github/github-mcp-server',
        category: 'development'
      },
      {
        id: 'notion-mcp',
        name: 'Notion MCP',
        description: 'Official Notion integration for workspace access',
        npm: '@makenotion/notion-mcp-server',
        github: 'https://github.com/makenotion/notion-mcp-server',
        category: 'productivity'
      },
      {
        id: 'stripe-mcp',
        name: 'Stripe MCP',
        description: 'Stripe API integration for payments',
        npm: '@stripe/agent-toolkit',
        github: 'https://github.com/stripe/agent-toolkit',
        category: 'finance'
      },
      {
        id: 'supabase-mcp',
        name: 'Supabase MCP',
        description: 'Database, auth, and edge functions',
        npm: '@supabase/mcp-server',
        github: 'https://github.com/supabase-community/supabase-mcp',
        category: 'database'
      },
      {
        id: 'docker-mcp',
        name: 'Docker MCP',
        description: 'Docker container management',
        npm: '@docker/mcp-server',
        github: 'https://github.com/docker/mcp-servers',
        category: 'devops'
      },
      {
        id: 'fetch-mcp',
        name: 'Fetch MCP',
        description: 'Web content fetching optimized for LLMs',
        npm: '@modelcontextprotocol/server-fetch',
        github: 'https://github.com/modelcontextprotocol/servers',
        category: 'utility'
      },
      {
        id: 'memory-mcp',
        name: 'Memory MCP',
        description: 'Simple knowledge graph for persistent memory',
        npm: '@modelcontextprotocol/server-memory',
        github: 'https://github.com/modelcontextprotocol/servers',
        category: 'ai-ml'
      }
    ];
  }

  /**
   * Install a server (add to current profile)
   */
  async installServer(serverId) {
    try {
      const catalog = await this.loadCatalog();
      const server = catalog.servers.find(s => s.id === serverId);
      
      if (!server) {
        throw new Error(`Server ${serverId} not found in catalog`);
      }
      
      // Add to current profile
      const currentProfile = await this.getCurrentProfile();
      await this.addToProfile(currentProfile, serverId);
      
      // Regenerate docker-compose
      await this.regenerateDockerCompose();
      
      return { success: true, message: `Server ${serverId} installed successfully` };
    } catch (error) {
      throw new Error(`Failed to install server: ${error.message}`);
    }
  }

  /**
   * Get list of installed servers
   */
  async getInstalledServers() {
    try {
      const currentProfile = await this.getCurrentProfile();
      const profileData = await this.loadProfile(currentProfile);
      const catalog = await this.loadCatalog();
      
      return profileData.services.map(serviceId => {
        const server = catalog.servers.find(s => s.id === serviceId);
        return {
          ...server,
          installed: true,
          profile: currentProfile
        };
      });
    } catch (error) {
      throw new Error(`Failed to get installed servers: ${error.message}`);
    }
  }

  // Helper methods

  async fetchNpmPackageInfo(packageName) {
    try {
      const response = await axios.get(`https://registry.npmjs.org/${packageName}`);
      return response.data;
    } catch (error) {
      throw new Error(`Package ${packageName} not found on npm`);
    }
  }

  async fetchPipPackageInfo(packageName) {
    try {
      const response = await axios.get(`https://pypi.org/pypi/${packageName}/json`);
      return response.data;
    } catch (error) {
      throw new Error(`Package ${packageName} not found on PyPI`);
    }
  }

  detectTransportFromPackage(npmInfo) {
    // Simple heuristics to detect transport type
    const keywords = npmInfo.keywords || [];
    const description = (npmInfo.description || '').toLowerCase();
    
    if (keywords.includes('http') || description.includes('http')) {
      return 'http';
    } else if (keywords.includes('websocket') || description.includes('websocket')) {
      return 'websocket';
    }
    
    return 'stdio'; // Default
  }

  detectTransportFromPipPackage(pipInfo) {
    // Simple heuristics to detect transport type from pip package
    const keywords = pipInfo.info.keywords ? pipInfo.info.keywords.split(',').map(k => k.trim()) : [];
    const description = (pipInfo.info.description || pipInfo.info.summary || '').toLowerCase();
    const classifiers = pipInfo.info.classifiers || [];
    
    if (keywords.includes('http') || description.includes('http') || classifiers.some(c => c.includes('HTTP'))) {
      return 'http';
    } else if (keywords.includes('websocket') || description.includes('websocket')) {
      return 'websocket';
    } else if (keywords.includes('sse') || description.includes('server-sent')) {
      return 'sse';
    }
    
    return 'stdio'; // Default
  }

  detectPipCommand(packageName, pipInfo) {
    // Try to detect the command to run the MCP server
    // Check if package has console_scripts entry points
    const projectUrls = pipInfo.info.project_urls || {};
    
    // Common patterns for MCP servers
    if (packageName === 'fastmcp') {
      return ['python', '-m', 'fastmcp'];
    } else if (packageName === 'mcp') {
      return ['python', '-m', 'mcp'];
    } else if (packageName.includes('-mcp-server')) {
      // Try the package name as a module
      const moduleName = packageName.replace(/-/g, '_');
      return ['python', '-m', moduleName];
    } else if (packageName.includes('mcp-')) {
      // Try removing mcp- prefix
      const moduleName = packageName.replace('mcp-', '').replace(/-/g, '_');
      return ['python', '-m', moduleName];
    }
    
    // Default: try package name as module
    return ['python', '-m', packageName.replace(/-/g, '_')];
  }

  async fetchCargoPackageInfo(crateName) {
    try {
      const response = await axios.get(`https://crates.io/api/v1/crates/${crateName}`);
      return response.data;
    } catch (error) {
      throw new Error(`Crate ${crateName} not found on crates.io`);
    }
  }

  parseGoModule(modulePath) {
    // Extract module name from path (e.g., github.com/user/repo -> repo)
    const parts = modulePath.split('/');
    return {
      name: parts[parts.length - 1],
      fullPath: modulePath
    };
  }

  async fetchGemPackageInfo(gemName) {
    try {
      const response = await axios.get(`https://rubygems.org/api/v1/gems/${gemName}.json`);
      return response.data;
    } catch (error) {
      throw new Error(`Gem ${gemName} not found on RubyGems`);
    }
  }

  async fetchComposerPackageInfo(packageName) {
    try {
      // Packagist expects vendor/package format
      const response = await axios.get(`https://packagist.org/packages/${packageName}.json`);
      return response.data.package;
    } catch (error) {
      throw new Error(`Package ${packageName} not found on Packagist`);
    }
  }

  detectGemCommand(gemName, gemInfo) {
    // Common patterns for Ruby MCP servers
    if (gemName === 'rails-mcp-server') {
      return ['rails-mcp-server'];
    } else if (gemName === 'fast-mcp') {
      return ['fast-mcp', 'serve'];
    } else if (gemName.includes('-mcp')) {
      return [gemName];
    }
    
    // Default: try gem name as command
    return [gemName];
  }

  detectComposerCommand(packageName, composerInfo) {
    // Common patterns for PHP MCP servers
    const binaries = composerInfo.bin || [];
    
    if (binaries.length > 0) {
      // Use the first binary provided by the package
      return ['php', `vendor/bin/${binaries[0]}`];
    } else if (packageName.includes('mcp-server')) {
      return ['php', 'vendor/bin/mcp-server'];
    } else if (packageName.includes('/mcp')) {
      const parts = packageName.split('/');
      return ['php', `vendor/bin/${parts[1]}`];
    }
    
    // Default
    return ['php', 'vendor/bin/mcp'];
  }

  async addToCatalog(serverInfo) {
    const catalog = await this.loadCatalog();
    
    // Check if server already exists
    const existingIndex = catalog.servers.findIndex(s => s.id === serverInfo.id);
    if (existingIndex >= 0) {
      catalog.servers[existingIndex] = serverInfo;
    } else {
      catalog.servers.push(serverInfo);
    }
    
    await this.saveCatalog(catalog);
  }

  getNextAvailablePort() {
    // This should check existing services and find next available port
    // For now, return a random port in the 3000-4000 range
    return 3000 + Math.floor(Math.random() * 1000);
  }

  async getCurrentProfile() {
    try {
      const profilePath = path.join(__dirname, '../../.current-profile');
      const profile = await fs.readFile(profilePath, 'utf-8');
      return profile.trim();
    } catch (error) {
      return 'default';
    }
  }

  async loadProfile(profileName) {
    const profilePath = path.join(__dirname, '../../profiles', `${profileName}.yml`);
    const yaml = require('js-yaml');
    const content = await fs.readFile(profilePath, 'utf-8');
    return yaml.load(content);
  }

  async addToProfile(profileName, serverId) {
    const yaml = require('js-yaml');
    const profilePath = path.join(__dirname, '../../profiles', `${profileName}.yml`);
    const profile = await this.loadProfile(profileName);
    
    if (!profile.services.includes(serverId)) {
      profile.services.push(serverId);
      await fs.writeFile(profilePath, yaml.dump(profile));
    }
  }

  async regenerateDockerCompose() {
    return new Promise((resolve, reject) => {
      const proc = spawn('node', [this.registryManager, 'generate'], {
        cwd: path.join(__dirname, '../..')
      });
      
      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error('Failed to regenerate docker-compose'));
        }
      });
    });
  }
}

module.exports = CatalogService;