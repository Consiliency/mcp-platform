const EventEmitter = require('events');

/**
 * Enhanced API Key Management (GATEWAY-8.10)
 * Runtime validation and tool filtering by API key availability
 */
class ApiKeyValidator extends EventEmitter {
  constructor(apiKeyManager) {
    super();
    this.apiKeyManager = apiKeyManager;
    this.toolRequirements = new Map(); // toolName -> required keys
    this.validationCache = new Map(); // serverId -> { result, timestamp }
    this.cacheTimeout = 60000; // 1 minute cache
    
    // Start cache cleanup interval
    this.cacheCleanupInterval = setInterval(() => {
      this._cleanupCache();
    }, this.cacheTimeout);
  }
  
  /**
   * Check API key availability at runtime
   */
  async validateServerKeys(serverId) {
    // Check cache first
    const cached = this.validationCache.get(serverId);
    if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
      return cached.result;
    }
    
    // Get server configuration
    const serverConfig = this.apiKeyManager.getServerConfig(serverId);
    if (!serverConfig) {
      return {
        valid: false,
        missingKeys: [],
        error: 'Server configuration not found'
      };
    }
    
    // Check required keys
    const requiredKeys = serverConfig.requiredKeys || [];
    const missingKeys = [];
    
    for (const key of requiredKeys) {
      if (!this.apiKeyManager.hasKey(key)) {
        missingKeys.push(key);
      }
    }
    
    const result = {
      valid: missingKeys.length === 0,
      missingKeys,
      requiredKeys,
      timestamp: new Date().toISOString()
    };
    
    // Cache result
    this.validationCache.set(serverId, {
      result,
      timestamp: Date.now()
    });
    
    return result;
  }
  
  /**
   * Filter tools by API key availability
   */
  filterToolsByAvailability(tools) {
    const availableTools = [];
    
    for (const tool of tools) {
      const requiredKeys = this.toolRequirements.get(tool.name) || [];
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
   * Register tool API key requirements
   */
  registerToolRequirements(toolName, requiredKeys) {
    if (!Array.isArray(requiredKeys)) {
      requiredKeys = [requiredKeys];
    }
    
    this.toolRequirements.set(toolName, requiredKeys);
    
    console.log(`Registered API key requirements for ${toolName}:`, requiredKeys);
    
    // Emit event for tracking
    this.emit('requirements-registered', {
      toolName,
      requiredKeys
    });
  }
  
  /**
   * Generate clear error for missing keys
   */
  generateMissingKeyError(toolName, missingKeys) {
    if (!missingKeys || missingKeys.length === 0) {
      return null;
    }
    
    const keyList = missingKeys.map(k => `'${k}'`).join(', ');
    const keyPlural = missingKeys.length > 1 ? 'keys' : 'key';
    
    const errorMessage = `Cannot call tool '${toolName}': Missing required API ${keyPlural}: ${keyList}\n\n` +
      `To fix this:\n` +
      missingKeys.map(key => {
        const envVar = this._getEnvVarName(key);
        return `  - Set the ${envVar} environment variable`;
      }).join('\n') +
      `\n\nOr configure the keys in your gateway configuration file.`;
    
    return {
      error: 'MISSING_API_KEYS',
      message: errorMessage,
      toolName,
      missingKeys,
      helpUrl: 'https://docs.mcp-platform.com/api-keys'
    };
  }
  
  /**
   * Handle runtime key updates
   */
  async handleKeyUpdate(keyName, keyValue) {
    // Update key in manager
    await this.apiKeyManager.updateKey(keyName, keyValue);
    
    // Find affected servers and tools
    const affectedServers = new Set();
    const affectedTools = [];
    
    // Check which servers use this key
    for (const [serverId, cached] of this.validationCache.entries()) {
      if (cached.result.requiredKeys && cached.result.requiredKeys.includes(keyName)) {
        affectedServers.add(serverId);
      }
    }
    
    // Check which tools use this key
    for (const [toolName, requiredKeys] of this.toolRequirements.entries()) {
      if (requiredKeys.includes(keyName)) {
        affectedTools.push(toolName);
      }
    }
    
    // Clear cache for affected servers
    for (const serverId of affectedServers) {
      this.validationCache.delete(serverId);
    }
    
    // Emit update event
    this.emit('key-updated', {
      keyName,
      affectedServers: Array.from(affectedServers),
      affectedTools,
      timestamp: new Date().toISOString()
    });
    
    console.log(`API key '${keyName}' updated, affected: ${affectedServers.size} servers, ${affectedTools.length} tools`);
  }
  
  /**
   * Check if tool can be called
   */
  canCallTool(toolName) {
    const requiredKeys = this.toolRequirements.get(toolName);
    
    if (!requiredKeys || requiredKeys.length === 0) {
      return { canCall: true };
    }
    
    const missingKeys = requiredKeys.filter(key => 
      !this.apiKeyManager.hasKey(key)
    );
    
    if (missingKeys.length === 0) {
      return { canCall: true };
    }
    
    return {
      canCall: false,
      missingKeys,
      error: this.generateMissingKeyError(toolName, missingKeys)
    };
  }
  
  /**
   * Get missing keys for a server
   */
  async getMissingKeys(serverId) {
    const validation = await this.validateServerKeys(serverId);
    return validation.missingKeys || [];
  }
  
  /**
   * Clear validation cache
   */
  clearCache(serverId = null) {
    if (serverId) {
      this.validationCache.delete(serverId);
      console.log(`Cleared validation cache for server: ${serverId}`);
    } else {
      this.validationCache.clear();
      console.log('Cleared all validation cache');
    }
  }
  
  /**
   * Clean up expired cache entries
   * @private
   */
  _cleanupCache() {
    const now = Date.now();
    const expired = [];
    
    for (const [serverId, cached] of this.validationCache.entries()) {
      if (now - cached.timestamp > this.cacheTimeout) {
        expired.push(serverId);
      }
    }
    
    for (const serverId of expired) {
      this.validationCache.delete(serverId);
    }
    
    if (expired.length > 0) {
      console.log(`Cleaned up ${expired.length} expired validation cache entries`);
    }
  }
  
  /**
   * Get environment variable name for a key
   * @private
   */
  _getEnvVarName(keyName) {
    // Convert to uppercase and replace non-alphanumeric with underscores
    return keyName.toUpperCase().replace(/[^A-Z0-9]/g, '_') + '_API_KEY';
  }
  
  /**
   * Cleanup resources
   */
  destroy() {
    if (this.cacheCleanupInterval) {
      clearInterval(this.cacheCleanupInterval);
      this.cacheCleanupInterval = null;
    }
    this.validationCache.clear();
    this.toolRequirements.clear();
  }
}

module.exports = ApiKeyValidator;