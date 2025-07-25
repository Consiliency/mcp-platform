/**
 * MCP CLI Plugin Template
 * 
 * This is a template for creating MCP CLI plugins.
 * Copy this file and modify it to create your own plugin.
 */

const { CLIPluginInterface } = require('../../interfaces/phase5/cli-plugin.interface');

class MyPlugin extends CLIPluginInterface {
  /**
   * Return plugin metadata
   */
  getMetadata() {
    return {
      name: 'my-plugin',
      version: '1.0.0',
      description: 'A sample MCP CLI plugin',
      author: 'Your Name',
      commands: ['hello', 'goodbye'] // List of commands this plugin provides
    };
  }

  /**
   * Initialize the plugin
   * @param {Object} context - Plugin context
   * @param {Object} context.config - Configuration object
   * @param {Object} context.logger - Logger instance
   * @param {Object} context.api - CLI API for interacting with MCP
   * @param {Object} context.sdk - SDK instance (if available)
   */
  async initialize(context) {
    await super.initialize(context);
    
    // Perform any initialization tasks here
    this.context.logger.debug('MyPlugin initialized');
  }

  /**
   * Shutdown the plugin
   */
  async shutdown() {
    // Perform any cleanup tasks here
    this.context.logger.debug('MyPlugin shutting down');
    
    await super.shutdown();
  }

  /**
   * Register commands that this plugin provides
   */
  registerCommands() {
    return [
      {
        name: 'hello',
        description: 'Say hello from the plugin',
        options: [
          { flags: '-n, --name <name>', description: 'Name to greet', defaultValue: 'World' }
        ],
        execute: async (args, context) => {
          const name = args.options.name;
          console.log(`Hello, ${name}! This is MyPlugin speaking.`);
          return { success: true, message: `Greeted ${name}` };
        }
      },
      {
        name: 'goodbye',
        description: 'Say goodbye from the plugin',
        arguments: [
          { name: 'name', description: 'Name to say goodbye to', required: false }
        ],
        execute: async (args, context) => {
          const name = args.arguments[0] || 'World';
          console.log(`Goodbye, ${name}! See you later.`);
          return { success: true, message: `Said goodbye to ${name}` };
        }
      }
    ];
  }

  /**
   * Hook called before any command execution
   * @param {string} command - Command being executed
   * @param {Object} args - Command arguments
   * @returns {Object} - { proceed: boolean, modifiedArgs?: object }
   */
  async beforeCommand(command, args) {
    // Example: Log all commands
    this.context.logger.debug(`Command '${command}' is about to execute with args:`, args);
    
    // Example: Modify arguments for specific commands
    if (command === 'install' && args.options && args.options.force) {
      this.context.logger.warn('Force install detected - be careful!');
    }
    
    // Return proceed: true to allow command execution
    // Return proceed: false to cancel command execution
    return { proceed: true };
  }

  /**
   * Hook called after command execution
   * @param {string} command - Command that was executed
   * @param {*} result - Result from command execution
   */
  async afterCommand(command, result) {
    // Example: Log command results
    this.context.logger.debug(`Command '${command}' completed with result:`, result);
    
    // Example: Send telemetry, update state, etc.
    if (command === 'install' && result && result.success) {
      this.context.logger.info('Installation successful!');
    }
  }
}

module.exports = MyPlugin;