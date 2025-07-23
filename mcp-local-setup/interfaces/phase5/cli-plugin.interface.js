// Contract: CLI Plugin System
// Purpose: Define the plugin interface for CLI extensions
// Team responsible: CLI Team

class CLIPluginInterface {
  // Plugin metadata
  getMetadata() {
    // returns: { name: string, version: string, description: string, commands: Command[] }
    throw new Error('Not implemented - CLI team will implement');
  }

  // Plugin lifecycle
  async initialize(context) {
    // context: { config: object, logger: Logger, api: CLIAPI }
    // returns: void
    throw new Error('Not implemented - CLI team will implement');
  }

  async shutdown() {
    // returns: void
    throw new Error('Not implemented - CLI team will implement');
  }

  // Command registration
  registerCommands() {
    // returns: Command[]
    throw new Error('Not implemented - CLI team will implement');
  }

  // Hook system
  async beforeCommand(command, args) {
    // command: string, args: object
    // returns: { proceed: boolean, modifiedArgs?: object }
    throw new Error('Not implemented - CLI team will implement');
  }

  async afterCommand(command, result) {
    // command: string, result: any
    // returns: void
    throw new Error('Not implemented - CLI team will implement');
  }
}

class CLIPluginLoader {
  async loadPlugin(pluginPath) {
    // pluginPath: string
    // returns: CLIPluginInterface instance
    throw new Error('Not implemented - CLI team will implement');
  }

  async unloadPlugin(pluginName) {
    // pluginName: string
    // returns: void
    throw new Error('Not implemented - CLI team will implement');
  }

  async listPlugins() {
    // returns: PluginInfo[]
    throw new Error('Not implemented - CLI team will implement');
  }

  async installPlugin(packageName) {
    // packageName: string (npm package or local path)
    // returns: { success: boolean, message: string }
    throw new Error('Not implemented - CLI team will implement');
  }

  async updatePlugin(pluginName) {
    // pluginName: string
    // returns: { success: boolean, message: string }
    throw new Error('Not implemented - CLI team will implement');
  }
}

module.exports = { CLIPluginInterface, CLIPluginLoader };