const EventEmitter = require('events');

/**
 * Smart Tool Discovery (GATEWAY-8.9)
 * Lazy server startup and tool discovery based on availability
 */
class SmartToolDiscovery extends EventEmitter {
  constructor(gatewayService, apiKeyManager, toolInventoryCache) {
    super();
    this.gateway = gatewayService;
    this.apiKeyManager = apiKeyManager;
    this.toolCache = toolInventoryCache;
    this.pendingDiscoveries = new Map(); // serverId -> Promise
  }
  
  /**
   * Get available tools (filtered by API key availability)
   */
  async getAvailableTools() {
    const allTools = this.toolCache.getAllTools();
    const availableTools = [];
    
    for (const tool of allTools) {
      // Check if server has required API keys
      const serverConfig = this.gateway.servers.get(tool.serverId);
      if (!serverConfig) continue;
      
      const requiredKeys = serverConfig.requiredKeys || [];
      const hasAllKeys = requiredKeys.every(key => 
        this.apiKeyManager.hasKey(key)
      );
      
      if (hasAllKeys) {
        availableTools.push(tool);
      }
    }
    
    return availableTools;
  }
  
  /**
   * Lazy discover tools on first use
   */
  async lazyDiscoverTools(serverId) {
    // Check if discovery is already in progress
    if (this.pendingDiscoveries.has(serverId)) {
      return await this.pendingDiscoveries.get(serverId);
    }
    
    // Create discovery promise
    const discoveryPromise = this._performDiscovery(serverId);
    this.pendingDiscoveries.set(serverId, discoveryPromise);
    
    try {
      const tools = await discoveryPromise;
      return tools;
    } finally {
      // Clean up pending discovery
      this.pendingDiscoveries.delete(serverId);
    }
  }
  
  /**
   * Handle tool call with lazy startup
   */
  async handleLazyToolCall(toolName, args) {
    // Find which server has this tool
    let targetServer = null;
    
    // First check cache
    const cachedTools = this.toolCache.getAllTools();
    for (const tool of cachedTools) {
      if (tool.name === toolName) {
        targetServer = tool.serverId;
        break;
      }
    }
    
    if (!targetServer) {
      throw new Error(`Tool '${toolName}' not found in any server`);
    }
    
    // Check if server needs startup
    if (this.needsStartup(targetServer)) {
      console.log(`Starting server ${targetServer} for tool ${toolName}`);
      const tools = await this.lazyDiscoverTools(targetServer);
      
      // Verify tool is available after startup
      const hasToolt = tools.some(t => t.name === toolName);
      if (!hasToolt) {
        throw new Error(`Tool '${toolName}' not available after server startup`);
      }
    }
    
    // Server should be running now, call the tool
    return await this.gateway.callTool(toolName, args);
  }
  
  /**
   * Verify tool availability after server startup
   */
  async verifyToolsOnStartup(serverId) {
    // Get cached tools
    const cachedTools = this.toolCache.getServerTools(serverId) || [];
    
    // Discover actual tools
    const actualTools = await this.gateway.listTools(serverId);
    
    // Compare
    const cachedToolNames = new Set(cachedTools.map(t => t.name));
    const actualToolNames = new Set(actualTools.map(t => t.name));
    
    const added = actualTools.filter(t => !cachedToolNames.has(t.name));
    const removed = cachedTools.filter(t => !actualToolNames.has(t.name));
    
    if (added.length > 0 || removed.length > 0) {
      this.handleToolChanges(serverId, cachedTools, actualTools);
    }
    
    return {
      verified: true,
      added,
      removed,
      total: actualTools.length
    };
  }
  
  /**
   * Handle tool changes (additions/removals)
   */
  handleToolChanges(serverId, oldTools, newTools) {
    const oldToolNames = new Set(oldTools.map(t => t.name));
    const newToolNames = new Set(newTools.map(t => t.name));
    
    const added = newTools.filter(t => !oldToolNames.has(t.name));
    const removed = oldTools.filter(t => !newToolNames.has(t.name));
    
    if (added.length > 0) {
      console.log(`Server ${serverId} added tools:`, added.map(t => t.name));
      this.emit('tools-added', { serverId, tools: added });
    }
    
    if (removed.length > 0) {
      console.log(`Server ${serverId} removed tools:`, removed.map(t => t.name));
      this.emit('tools-removed', { serverId, tools: removed });
    }
    
    // Update cache with new tools
    this.toolCache.updateServerTools(serverId, newTools);
  }
  
  /**
   * Include discovery notifications in responses
   */
  enrichResponseWithDiscovery(response, discoveredTools) {
    if (!response || !discoveredTools) {
      return response;
    }
    
    // Add discovery metadata
    const enriched = {
      ...response,
      _discovery: {
        newToolsDiscovered: discoveredTools.length,
        tools: discoveredTools.map(t => ({
          name: t.name,
          description: t.description
        })),
        timestamp: new Date().toISOString()
      }
    };
    
    return enriched;
  }
  
  /**
   * Check if server needs startup
   */
  needsStartup(serverId) {
    // Check if server is registered
    if (!this.gateway.servers.has(serverId)) {
      return true;
    }
    
    // Check if we have cached tools (indicates server has been started)
    const cachedTools = this.toolCache.getServerTools(serverId);
    if (!cachedTools) {
      return true;
    }
    
    // Check if server connection is still active
    const serverInfo = this.gateway.servers.get(serverId);
    return !serverInfo || !serverInfo.connected;
  }
  
  /**
   * Wait for pending discovery
   */
  async waitForDiscovery(serverId) {
    const pending = this.pendingDiscoveries.get(serverId);
    if (pending) {
      return await pending;
    }
    
    // No pending discovery, return cached tools or empty array
    return this.toolCache.getServerTools(serverId) || [];
  }
  
  /**
   * Perform actual discovery (private)
   * @private
   */
  async _performDiscovery(serverId) {
    try {
      // Ensure server is started
      await this.gateway.ensureServerStarted(serverId);
      
      // Discover tools
      const tools = await this.gateway.listTools(serverId);
      
      // Update cache
      await this.toolCache.updateServerTools(serverId, tools);
      
      // Emit discovery event
      this.emit('tools-discovered', {
        serverId,
        toolCount: tools.length,
        tools: tools.map(t => ({ name: t.name, description: t.description }))
      });
      
      return tools;
    } catch (error) {
      console.error(`Failed to discover tools for ${serverId}:`, error);
      throw error;
    }
  }
}

module.exports = SmartToolDiscovery;