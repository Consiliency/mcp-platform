// Contract: CLI Plugin System
// Purpose: Define the plugin interface for CLI extensions
// Team responsible: CLI Team

class CLIPluginInterface {
  // Plugin metadata
  getMetadata() {
    // returns: { name: string, version: string, description: string, commands: Command[] }
    throw new Error('Plugin must implement getMetadata() method');
  }

  // Plugin lifecycle
  async initialize(context) {
    // context: { config: object, logger: Logger, api: CLIAPI, sdk?: SDKCoreInterface }
    // returns: void
    // Default implementation - can be overridden
    this.context = context;
  }

  async shutdown() {
    // returns: void
    // Default implementation - can be overridden
    this.context = null;
  }

  // Command registration
  registerCommands() {
    // returns: Command[]
    // Default implementation - return empty array if no commands
    return [];
  }

  // Hook system
  async beforeCommand(command, args) {
    // command: string, args: object
    // returns: { proceed: boolean, modifiedArgs?: object }
    // Default implementation - always proceed
    return { proceed: true };
  }

  async afterCommand(command, result) {
    // command: string, result: any
    // returns: void
    // Default implementation - do nothing
  }
}

class CLIPluginLoader {
  constructor() {
    this.plugins = new Map();
    this.pluginInstances = new Map();
  }

  async loadPlugin(pluginPath) {
    // pluginPath: string
    // returns: CLIPluginInterface instance
    try {
      // Clear module cache to allow reloading
      delete require.cache[require.resolve(pluginPath)];
      
      const PluginClass = require(pluginPath);
      let plugin;
      
      // Handle different export formats
      if (PluginClass.default) {
        plugin = new PluginClass.default();
      } else if (typeof PluginClass === 'function') {
        plugin = new PluginClass();
      } else if (PluginClass.Plugin) {
        plugin = new PluginClass.Plugin();
      } else {
        throw new Error('Plugin must export a class');
      }
      
      // Validate plugin interface
      this._validatePlugin(plugin);
      
      const metadata = plugin.getMetadata();
      this.plugins.set(metadata.name, {
        path: pluginPath,
        metadata,
        instance: plugin
      });
      this.pluginInstances.set(metadata.name, plugin);
      
      return plugin;
    } catch (error) {
      throw new Error(`Failed to load plugin from ${pluginPath}: ${error.message}`);
    }
  }

  async unloadPlugin(pluginName) {
    // pluginName: string
    // returns: void
    const pluginInfo = this.plugins.get(pluginName);
    if (!pluginInfo) {
      throw new Error(`Plugin '${pluginName}' not found`);
    }
    
    // Call shutdown if available
    if (pluginInfo.instance && typeof pluginInfo.instance.shutdown === 'function') {
      await pluginInfo.instance.shutdown();
    }
    
    // Remove from maps
    this.plugins.delete(pluginName);
    this.pluginInstances.delete(pluginName);
    
    // Clear from require cache
    if (pluginInfo.path) {
      delete require.cache[require.resolve(pluginInfo.path)];
    }
  }

  async listPlugins() {
    // returns: PluginInfo[]
    return Array.from(this.plugins.values()).map(p => p.metadata);
  }

  async installPlugin(packageName) {
    // packageName: string (npm package or local path)
    // returns: { success: boolean, message: string }
    const { spawn } = require('child_process');
    const path = require('path');
    const fs = require('fs').promises;
    
    try {
      // Check if it's a local path
      const isLocalPath = packageName.startsWith('.') || packageName.startsWith('/') || packageName.startsWith('~');
      
      if (isLocalPath) {
        // Validate local plugin
        const pluginPath = path.resolve(packageName);
        await fs.access(pluginPath);
        
        // Try to load it to validate
        const plugin = await this.loadPlugin(pluginPath);
        const metadata = plugin.getMetadata();
        
        return {
          success: true,
          message: `Successfully loaded local plugin '${metadata.name}' from ${pluginPath}`
        };
      } else {
        // Install from npm
        const pluginsDir = path.join(__dirname, '../../cli/plugins/installed');
        await fs.mkdir(pluginsDir, { recursive: true });
        
        return new Promise((resolve) => {
          const npm = spawn('npm', ['install', packageName], {
            cwd: pluginsDir,
            stdio: 'pipe'
          });
          
          let output = '';
          npm.stdout.on('data', (data) => { output += data.toString(); });
          npm.stderr.on('data', (data) => { output += data.toString(); });
          
          npm.on('close', (code) => {
            if (code === 0) {
              resolve({
                success: true,
                message: `Successfully installed plugin '${packageName}'`
              });
            } else {
              resolve({
                success: false,
                message: `Failed to install plugin: ${output}`
              });
            }
          });
        });
      }
    } catch (error) {
      return {
        success: false,
        message: `Failed to install plugin: ${error.message}`
      };
    }
  }

  async updatePlugin(pluginName) {
    // pluginName: string
    // returns: { success: boolean, message: string }
    const { spawn } = require('child_process');
    const path = require('path');
    
    try {
      const pluginInfo = this.plugins.get(pluginName);
      if (!pluginInfo) {
        return {
          success: false,
          message: `Plugin '${pluginName}' not found`
        };
      }
      
      // Only update npm packages, not local plugins
      if (pluginInfo.path && (pluginInfo.path.startsWith('.') || pluginInfo.path.startsWith('/'))) {
        return {
          success: false,
          message: `Cannot update local plugin '${pluginName}'`
        };
      }
      
      const pluginsDir = path.join(__dirname, '../../cli/plugins/installed');
      
      return new Promise((resolve) => {
        const npm = spawn('npm', ['update', pluginName], {
          cwd: pluginsDir,
          stdio: 'pipe'
        });
        
        let output = '';
        npm.stdout.on('data', (data) => { output += data.toString(); });
        npm.stderr.on('data', (data) => { output += data.toString(); });
        
        npm.on('close', async (code) => {
          if (code === 0) {
            // Reload the plugin
            await this.unloadPlugin(pluginName);
            await this.loadPlugin(pluginInfo.path);
            
            resolve({
              success: true,
              message: `Successfully updated plugin '${pluginName}'`
            });
          } else {
            resolve({
              success: false,
              message: `Failed to update plugin: ${output}`
            });
          }
        });
      });
    } catch (error) {
      return {
        success: false,
        message: `Failed to update plugin: ${error.message}`
      };
    }
  }
  
  _validatePlugin(plugin) {
    const requiredMethods = ['getMetadata', 'initialize', 'shutdown', 'registerCommands', 'beforeCommand', 'afterCommand'];
    const missingMethods = [];
    
    for (const method of requiredMethods) {
      if (typeof plugin[method] !== 'function') {
        missingMethods.push(method);
      }
    }
    
    if (missingMethods.length > 0) {
      throw new Error(`Plugin must implement required methods: ${missingMethods.join(', ')}`);
    }
    
    // Validate metadata
    const metadata = plugin.getMetadata();
    if (!metadata || typeof metadata !== 'object') {
      throw new Error('Plugin getMetadata() must return an object');
    }
    
    if (!metadata.name || typeof metadata.name !== 'string') {
      throw new Error('Plugin metadata must include a name');
    }
    
    if (!metadata.version || typeof metadata.version !== 'string') {
      throw new Error('Plugin metadata must include a version');
    }
    
    if (!metadata.description || typeof metadata.description !== 'string') {
      throw new Error('Plugin metadata must include a description');
    }
  }
}

module.exports = { CLIPluginInterface, CLIPluginLoader };