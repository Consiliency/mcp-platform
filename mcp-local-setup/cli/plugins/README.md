# MCP CLI Plugin Development Guide

## Overview

The MCP CLI plugin system allows developers to extend the functionality of the MCP CLI with custom commands, hooks, and integrations. Plugins can interact with the MCP SDK, add new commands, and hook into existing command execution.

## Creating a Plugin

### 1. Plugin Structure

A minimal plugin consists of:
- A JavaScript file that exports a class extending `CLIPluginInterface`
- A `package.json` file with the `mcp-cli-plugin` keyword

### 2. Basic Plugin Template

```javascript
const { CLIPluginInterface } = require('path/to/cli-plugin.interface');

class MyPlugin extends CLIPluginInterface {
  getMetadata() {
    return {
      name: 'my-plugin',
      version: '1.0.0',
      description: 'My awesome MCP CLI plugin',
      commands: ['my-command']
    };
  }

  async initialize(context) {
    await super.initialize(context);
    // Initialize your plugin
  }

  registerCommands() {
    return [
      {
        name: 'my-command',
        description: 'Does something awesome',
        execute: async (args, context) => {
          console.log('Hello from my plugin!');
          return { success: true };
        }
      }
    ];
  }
}

module.exports = MyPlugin;
```

### 3. Plugin Context

Plugins receive a context object during initialization with:
- `config`: Configuration object
- `logger`: Logger instance
- `api`: CLI API for MCP operations
- `sdk`: MCP SDK instance (when available)

### 4. Command Registration

Commands can include:
- `name`: Command name
- `description`: Command description
- `options`: Array of option configurations
- `arguments`: Array of argument configurations
- `execute`: Async function to execute the command

### 5. Hooks

Plugins can implement hooks to intercept command execution:

```javascript
async beforeCommand(command, args) {
  // Called before any command executes
  // Return { proceed: false } to cancel execution
  // Return { proceed: true, modifiedArgs: {...} } to modify args
  return { proceed: true };
}

async afterCommand(command, result) {
  // Called after command execution
  // Can be used for logging, cleanup, etc.
}
```

## Installing Plugins

### From npm:
```bash
mcp plugin install <package-name>
```

### From local directory:
```bash
mcp plugin install ./path/to/plugin
```

## Plugin Examples

See the `examples/` directory for complete plugin examples:
- `git-plugin`: Git integration for tracking MCP configuration
- `docker-plugin`: Enhanced Docker management commands

## Plugin Best Practices

1. **Error Handling**: Always handle errors gracefully
2. **Logging**: Use the provided logger for consistent output
3. **Async Operations**: All plugin methods should be async
4. **Resource Cleanup**: Implement proper cleanup in `shutdown()`
5. **Documentation**: Document all commands and options clearly

## Publishing Plugins

1. Add `mcp-cli-plugin` to your package.json keywords
2. Publish to npm: `npm publish`
3. Users can install with: `mcp plugin install your-plugin-name`

## Plugin API Reference

### CLIPluginInterface Methods

- `getMetadata()`: Return plugin metadata
- `initialize(context)`: Initialize the plugin
- `shutdown()`: Clean up resources
- `registerCommands()`: Return array of command configurations
- `beforeCommand(command, args)`: Pre-execution hook
- `afterCommand(command, result)`: Post-execution hook

### Command Configuration

```javascript
{
  name: 'command-name',
  description: 'Command description',
  options: [
    {
      flags: '-f, --flag <value>',
      description: 'Option description',
      defaultValue: 'default'
    }
  ],
  arguments: [
    {
      name: 'arg-name',
      description: 'Argument description',
      required: true
    }
  ],
  execute: async (args, context) => {
    // args.options - parsed options
    // args.arguments - positional arguments
    // context - plugin context
    return { success: true, data: {} };
  }
}
```

## Troubleshooting

- Ensure your plugin exports a class, not an instance
- Check that all required methods are implemented
- Verify package.json includes the `mcp-cli-plugin` keyword
- Use `mcp plugin list` to see loaded plugins
- Check CLI logs for plugin loading errors