const fs = require('fs').promises;
const path = require('path');

/**
 * Tool Inventory Cache (GATEWAY-8.7)
 * Persistent cache for discovered tools from all servers
 */
class ToolInventoryCache {
  constructor() {
    this.inventoryPath = path.join(__dirname, 'tool-inventory.json');
    this.inventory = new Map();
    this.lastUpdated = new Map();
    this.cacheValidationInterval = 300000; // 5 minutes
    
    // Initialize by loading existing inventory
    this.loadInventory().catch(err => {
      console.warn('Failed to load tool inventory:', err.message);
    });
  }
  
  /**
   * Load tool inventory from disk
   */
  async loadInventory() {
    try {
      const data = await fs.readFile(this.inventoryPath, 'utf8');
      const parsed = JSON.parse(data);
      
      // Convert back to Maps
      this.inventory = new Map(Object.entries(parsed.inventory || {}));
      this.lastUpdated = new Map(
        Object.entries(parsed.lastUpdated || {}).map(([k, v]) => [k, new Date(v)])
      );
      
      console.log(`Loaded tool inventory: ${this.inventory.size} servers cached`);
    } catch (err) {
      if (err.code === 'ENOENT') {
        // File doesn't exist yet, that's okay
        console.log('No existing tool inventory found, starting fresh');
      } else {
        throw err;
      }
    }
  }
  
  /**
   * Save tool inventory to disk
   */
  async saveInventory() {
    const data = {
      inventory: Object.fromEntries(this.inventory),
      lastUpdated: Object.fromEntries(
        Array.from(this.lastUpdated.entries()).map(([k, v]) => [k, v.toISOString()])
      ),
      savedAt: new Date().toISOString()
    };
    
    await fs.writeFile(this.inventoryPath, JSON.stringify(data, null, 2));
    console.log(`Saved tool inventory: ${this.inventory.size} servers`);
  }
  
  /**
   * Get cached tools for a server
   */
  getServerTools(serverId) {
    if (!this.isCacheValid(serverId)) {
      return null;
    }
    
    return this.inventory.get(serverId) || null;
  }
  
  /**
   * Update tools for a server
   */
  async updateServerTools(serverId, tools) {
    this.inventory.set(serverId, tools);
    this.lastUpdated.set(serverId, new Date());
    
    // Persist to disk
    await this.saveInventory();
    
    console.log(`Updated tool cache for ${serverId}: ${tools.length} tools`);
  }
  
  /**
   * Validate cache freshness
   */
  isCacheValid(serverId) {
    const lastUpdate = this.lastUpdated.get(serverId);
    if (!lastUpdate) {
      return false;
    }
    
    const now = new Date();
    const age = now - lastUpdate;
    
    return age < this.cacheValidationInterval;
  }
  
  /**
   * Mark server tools as stale
   */
  async invalidateServer(serverId) {
    this.inventory.delete(serverId);
    this.lastUpdated.delete(serverId);
    
    // Persist changes
    await this.saveInventory();
    
    console.log(`Invalidated tool cache for ${serverId}`);
  }
  
  /**
   * Get all cached tools
   */
  getAllTools() {
    const allTools = [];
    
    for (const [serverId, tools] of this.inventory.entries()) {
      if (this.isCacheValid(serverId)) {
        allTools.push(...tools.map(tool => ({
          ...tool,
          serverId
        })));
      }
    }
    
    return allTools;
  }
  
  /**
   * Clear entire cache
   */
  async clearCache() {
    this.inventory.clear();
    this.lastUpdated.clear();
    
    // Remove the file
    try {
      await fs.unlink(this.inventoryPath);
      console.log('Tool inventory cache cleared');
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }
  }
}

module.exports = ToolInventoryCache;