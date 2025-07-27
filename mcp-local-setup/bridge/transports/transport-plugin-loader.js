const path = require('path');
const fs = require('fs').promises;
const { EventEmitter } = require('events');

/**
 * Transport Plugin System (FEATURE-8.1)
 * Dynamic loading and management of custom transport plugins
 */
class TransportPluginLoader extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      pluginDir: config.pluginDir || path.join(__dirname, 'plugins'),
      enabledPlugins: config.enabledPlugins || [],
      autoLoad: config.autoLoad !== false,
      validateOnLoad: config.validateOnLoad !== false,
      pluginTimeout: config.pluginTimeout || 5000
    };
    
    this.plugins = new Map();
    this.transportFactory = null;
    this.initialized = false;
  }
  
  /**
   * Initialize plugin loader
   */
  async initialize(transportFactory) {
    if (this.initialized) {
      return;
    }
    
    this.transportFactory = transportFactory;
    
    // Create plugin directory if it doesn't exist
    try {
      await fs.mkdir(this.config.pluginDir, { recursive: true });
    } catch (error) {
      this.emit('error', new Error(`Failed to create plugin directory: ${error.message}`));
    }
    
    // Auto-load plugins if enabled
    if (this.config.autoLoad) {
      await this.loadPlugins();
    }
    
    this.initialized = true;
    this.emit('initialized');
  }
  
  /**
   * Load transport plugins from directory
   */
  async loadPlugins() {
    try {
      const files = await fs.readdir(this.config.pluginDir);
      const pluginFiles = files.filter(file => 
        file.endsWith('.js') || file.endsWith('.json')
      );
      
      for (const file of pluginFiles) {
        const pluginPath = path.join(this.config.pluginDir, file);
        const pluginName = path.basename(file, path.extname(file));
        
        // Check if plugin is enabled
        if (this.config.enabledPlugins.length > 0 && 
            !this.config.enabledPlugins.includes(pluginName)) {
          continue;
        }
        
        try {
          await this._loadPlugin(pluginPath, pluginName);
        } catch (error) {
          this.emit('error', new Error(`Failed to load plugin ${pluginName}: ${error.message}`));
        }
      }
      
      this.emit('plugins-loaded', Array.from(this.plugins.keys()));
    } catch (error) {
      this.emit('error', new Error(`Failed to scan plugin directory: ${error.message}`));
    }
  }
  
  /**
   * Load individual plugin
   */
  async _loadPlugin(pluginPath, pluginName) {
    const ext = path.extname(pluginPath);
    
    if (ext === '.json') {
      // Load plugin descriptor
      const descriptor = JSON.parse(await fs.readFile(pluginPath, 'utf8'));
      await this._loadPluginFromDescriptor(descriptor, pluginName);
    } else {
      // Load JavaScript plugin
      const plugin = require(pluginPath);
      await this._registerPlugin(pluginName, plugin);
    }
  }
  
  /**
   * Load plugin from descriptor
   */
  async _loadPluginFromDescriptor(descriptor, pluginName) {
    if (!descriptor.transport || !descriptor.transport.path) {
      throw new Error('Invalid plugin descriptor: missing transport.path');
    }
    
    const transportPath = path.resolve(
      path.dirname(descriptor.path || this.config.pluginDir),
      descriptor.transport.path
    );
    
    const TransportClass = require(transportPath);
    
    await this._registerPlugin(pluginName, {
      Transport: TransportClass,
      metadata: descriptor.metadata || {},
      config: descriptor.config || {}
    });
  }
  
  /**
   * Register plugin with validation
   */
  async _registerPlugin(name, plugin) {
    const TransportClass = plugin.Transport || plugin;
    
    // Validate transport class
    if (this.config.validateOnLoad) {
      this._validateTransportClass(TransportClass, name);
    }
    
    // Store plugin info
    this.plugins.set(name, {
      name,
      Transport: TransportClass,
      metadata: plugin.metadata || {},
      config: plugin.config || {},
      loadedAt: new Date()
    });
    
    // Register with transport factory if available
    if (this.transportFactory) {
      this.registerTransport(name, TransportClass);
    }
    
    this.emit('plugin-loaded', name);
  }
  
  /**
   * Register custom transport with factory
   */
  registerTransport(name, TransportClass) {
    if (!this.transportFactory) {
      throw new Error('Transport factory not initialized');
    }
    
    // Validate transport class
    this._validateTransportClass(TransportClass, name);
    
    // Create factory function
    const factory = (config) => new TransportClass(config);
    
    // Register with transport factory
    if (typeof this.transportFactory.registerTransport === 'function') {
      this.transportFactory.registerTransport(name, factory);
    } else {
      // Fallback: directly add to factory
      this.transportFactory[name] = factory;
    }
    
    this.emit('transport-registered', name);
  }
  
  /**
   * Validate transport class interface
   */
  _validateTransportClass(TransportClass, name) {
    // Check if it's a constructor
    if (typeof TransportClass !== 'function') {
      throw new Error(`Transport ${name} must be a constructor function`);
    }
    
    // Check required methods
    const requiredMethods = ['connect', 'send', 'close'];
    const prototype = TransportClass.prototype;
    
    for (const method of requiredMethods) {
      if (typeof prototype[method] !== 'function') {
        throw new Error(`Transport ${name} must implement ${method}() method`);
      }
    }
    
    // Check if it extends EventEmitter
    if (!prototype.emit || !prototype.on) {
      console.warn(`Transport ${name} should extend EventEmitter for proper event handling`);
    }
  }
  
  /**
   * Get available transports
   */
  getAvailableTransports() {
    const transports = {};
    
    for (const [name, plugin] of this.plugins) {
      transports[name] = {
        name: plugin.name,
        metadata: plugin.metadata,
        config: plugin.config,
        loadedAt: plugin.loadedAt
      };
    }
    
    return transports;
  }
  
  /**
   * Get plugin by name
   */
  getPlugin(name) {
    return this.plugins.get(name);
  }
  
  /**
   * Unload plugin
   */
  async unloadPlugin(name) {
    if (!this.plugins.has(name)) {
      throw new Error(`Plugin ${name} not found`);
    }
    
    // Remove from factory
    if (this.transportFactory) {
      delete this.transportFactory[name];
    }
    
    // Clear from cache
    const plugin = this.plugins.get(name);
    if (plugin.Transport.__pluginPath) {
      delete require.cache[plugin.Transport.__pluginPath];
    }
    
    this.plugins.delete(name);
    this.emit('plugin-unloaded', name);
  }
  
  /**
   * Reload plugin
   */
  async reloadPlugin(name) {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      throw new Error(`Plugin ${name} not found`);
    }
    
    await this.unloadPlugin(name);
    
    // Reload from original path
    if (plugin.Transport.__pluginPath) {
      await this._loadPlugin(plugin.Transport.__pluginPath, name);
    }
  }
  
  /**
   * Create plugin descriptor template
   */
  static createPluginDescriptor(options) {
    return {
      name: options.name,
      version: options.version || '1.0.0',
      description: options.description || '',
      transport: {
        path: options.transportPath,
        type: options.type || 'custom'
      },
      metadata: options.metadata || {},
      config: options.config || {},
      dependencies: options.dependencies || []
    };
  }
}

module.exports = TransportPluginLoader;