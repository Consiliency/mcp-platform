/**
 * CLI Plugin Manager
 * Manages plugin lifecycle, command registration, and hooks
 */

const { CLIPluginLoader } = require('../../../interfaces/phase5/cli-plugin.interface');
const path = require('path');
const fs = require('fs').promises;
const { Command } = require('commander');

class PluginManager {
  constructor() {
    this.loader = new CLIPluginLoader();
    this.hooks = {
      beforeCommand: [],
      afterCommand: []
    };
    this.pluginCommands = new Map();
    this.context = null;
  }

  /**
   * Initialize the plugin manager with context
   */
  async initialize(context) {
    this.context = context;
    
    // Load built-in plugins
    await this.loadBuiltinPlugins();
    
    // Load installed plugins
    await this.loadInstalledPlugins();
    
    // Load plugins from config
    await this.loadConfiguredPlugins();
  }

  /**
   * Load all built-in plugins
   */
  async loadBuiltinPlugins() {
    // Built-in plugins will be in the core directory
    // For now, we'll skip this as we don't have built-in plugins yet
  }

  /**
   * Load all installed plugins from node_modules
   */
  async loadInstalledPlugins() {
    const installedDir = path.join(__dirname, '../installed');
    
    try {
      await fs.access(installedDir);
      const nodeModulesDir = path.join(installedDir, 'node_modules');
      
      try {
        const modules = await fs.readdir(nodeModulesDir);
        
        for (const moduleName of modules) {
          if (moduleName.startsWith('@')) {
            // Handle scoped packages
            const scopedModules = await fs.readdir(path.join(nodeModulesDir, moduleName));
            for (const scopedModule of scopedModules) {
              const pluginPath = path.join(nodeModulesDir, moduleName, scopedModule);
              await this.tryLoadPlugin(pluginPath);
            }
          } else {
            const pluginPath = path.join(nodeModulesDir, moduleName);
            await this.tryLoadPlugin(pluginPath);
          }
        }
      } catch (error) {
        // No node_modules directory yet
      }
    } catch (error) {
      // No installed directory yet
    }
  }

  /**
   * Load plugins from configuration file
   */
  async loadConfiguredPlugins() {
    const configPath = path.join(process.env.MCP_HOME || path.join(process.env.HOME, '.mcp-platform'), 'plugins.json');
    
    try {
      const configContent = await fs.readFile(configPath, 'utf8');
      const config = JSON.parse(configContent);
      
      if (config.plugins && Array.isArray(config.plugins)) {
        for (const pluginConfig of config.plugins) {
          if (pluginConfig.enabled !== false) {
            await this.tryLoadPlugin(pluginConfig.path);
          }
        }
      }
    } catch (error) {
      // No config file or invalid config - that's ok
    }
  }

  /**
   * Try to load a plugin, handling errors gracefully
   */
  async tryLoadPlugin(pluginPath) {
    try {
      // Check if this is a valid plugin by looking for package.json
      const packageJsonPath = path.join(pluginPath, 'package.json');
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
      
      // Check if it's an MCP CLI plugin
      if (packageJson.keywords && packageJson.keywords.includes('mcp-cli-plugin')) {
        const mainFile = path.join(pluginPath, packageJson.main || 'index.js');
        await this.loadPlugin(mainFile);
      }
    } catch (error) {
      // Not a valid plugin or error loading - skip it
      if (this.context && this.context.logger) {
        this.context.logger.debug(`Failed to load plugin from ${pluginPath}: ${error.message}`);
      }
    }
  }

  /**
   * Load a single plugin
   */
  async loadPlugin(pluginPath) {
    const plugin = await this.loader.loadPlugin(pluginPath);
    const metadata = plugin.getMetadata();
    
    // Initialize plugin with context
    await plugin.initialize(this.context);
    
    // Register commands
    const commands = plugin.registerCommands();
    if (commands && commands.length > 0) {
      this.pluginCommands.set(metadata.name, commands);
    }
    
    // Register hooks
    this.hooks.beforeCommand.push({
      plugin: metadata.name,
      handler: plugin.beforeCommand.bind(plugin)
    });
    
    this.hooks.afterCommand.push({
      plugin: metadata.name,
      handler: plugin.afterCommand.bind(plugin)
    });
    
    return plugin;
  }

  /**
   * Unload a plugin
   */
  async unloadPlugin(pluginName) {
    // Remove commands
    this.pluginCommands.delete(pluginName);
    
    // Remove hooks
    this.hooks.beforeCommand = this.hooks.beforeCommand.filter(h => h.plugin !== pluginName);
    this.hooks.afterCommand = this.hooks.afterCommand.filter(h => h.plugin !== pluginName);
    
    // Unload from loader
    await this.loader.unloadPlugin(pluginName);
  }

  /**
   * Get all plugin commands
   */
  getAllCommands() {
    const allCommands = [];
    
    for (const [pluginName, commands] of this.pluginCommands) {
      allCommands.push(...commands.map(cmd => ({
        ...cmd,
        plugin: pluginName
      })));
    }
    
    return allCommands;
  }

  /**
   * Register plugin commands with Commander program
   */
  registerCommands(program) {
    const allCommands = this.getAllCommands();
    
    for (const cmdConfig of allCommands) {
      const cmd = program
        .command(cmdConfig.name)
        .description(cmdConfig.description || `Command from ${cmdConfig.plugin} plugin`);
      
      // Add options if specified
      if (cmdConfig.options && Array.isArray(cmdConfig.options)) {
        for (const option of cmdConfig.options) {
          cmd.option(option.flags, option.description, option.defaultValue);
        }
      }
      
      // Add arguments if specified
      if (cmdConfig.arguments && Array.isArray(cmdConfig.arguments)) {
        for (const arg of cmdConfig.arguments) {
          if (arg.required) {
            cmd.argument(`<${arg.name}>`, arg.description);
          } else {
            cmd.argument(`[${arg.name}]`, arg.description);
          }
        }
      }
      
      // Set up action handler with hooks
      cmd.action(async (...args) => {
        // Extract options (last argument from commander)
        const options = args[args.length - 1];
        const commandArgs = args.slice(0, -1);
        
        // Prepare args object
        const argsObject = {
          options,
          arguments: commandArgs
        };
        
        // Run beforeCommand hooks
        let modifiedArgs = argsObject;
        for (const hook of this.hooks.beforeCommand) {
          const result = await hook.handler(cmdConfig.name, modifiedArgs);
          if (!result.proceed) {
            console.log(`Command execution cancelled by ${hook.plugin} plugin`);
            return;
          }
          if (result.modifiedArgs) {
            modifiedArgs = result.modifiedArgs;
          }
        }
        
        // Execute the command
        let result;
        try {
          if (typeof cmdConfig.execute === 'function') {
            result = await cmdConfig.execute(modifiedArgs, this.context);
          } else {
            console.error(`Command ${cmdConfig.name} does not have an execute function`);
            return;
          }
        } catch (error) {
          console.error(`Error executing command ${cmdConfig.name}:`, error.message);
          throw error;
        }
        
        // Run afterCommand hooks
        for (const hook of this.hooks.afterCommand) {
          await hook.handler(cmdConfig.name, result);
        }
      });
    }
  }

  /**
   * Run beforeCommand hooks for built-in commands
   */
  async runBeforeCommand(command, args) {
    let modifiedArgs = args;
    
    for (const hook of this.hooks.beforeCommand) {
      const result = await hook.handler(command, modifiedArgs);
      if (!result.proceed) {
        return { proceed: false };
      }
      if (result.modifiedArgs) {
        modifiedArgs = result.modifiedArgs;
      }
    }
    
    return { proceed: true, modifiedArgs };
  }

  /**
   * Run afterCommand hooks for built-in commands
   */
  async runAfterCommand(command, result) {
    for (const hook of this.hooks.afterCommand) {
      await hook.handler(command, result);
    }
  }

  /**
   * List all loaded plugins
   */
  async listPlugins() {
    return await this.loader.listPlugins();
  }

  /**
   * Install a new plugin
   */
  async installPlugin(packageName) {
    return await this.loader.installPlugin(packageName);
  }

  /**
   * Update an existing plugin
   */
  async updatePlugin(pluginName) {
    return await this.loader.updatePlugin(pluginName);
  }
}

module.exports = PluginManager;