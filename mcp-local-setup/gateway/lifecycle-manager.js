const EventEmitter = require('events');

/**
 * Server Lifecycle Manager (GATEWAY-8.8)
 * Manages server lifetimes with 2-hour idle timeout
 */
class LifecycleManager extends EventEmitter {
  constructor() {
    super();
    this.idleTimeout = 2 * 60 * 60 * 1000; // 2 hours in milliseconds
    this.servers = new Map(); // serverId -> { lastUsed, clients, timeout }
    this.cleanupInterval = null;
    this.cleanupIntervalMs = 5 * 60 * 1000; // Check every 5 minutes
  }
  
  /**
   * Start lifecycle management
   */
  start() {
    if (this.cleanupInterval) {
      return; // Already started
    }
    
    // Start periodic cleanup check
    this.cleanupInterval = setInterval(() => {
      this.checkIdleServers();
    }, this.cleanupIntervalMs);
    
    console.log('Lifecycle manager started');
  }
  
  /**
   * Stop lifecycle management
   */
  stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    // Clear all pending timeouts
    for (const [serverId, data] of this.servers.entries()) {
      if (data.timeout) {
        clearTimeout(data.timeout);
      }
    }
    
    this.servers.clear();
    console.log('Lifecycle manager stopped');
  }
  
  /**
   * Register server activity
   */
  registerActivity(serverId, clientId) {
    let serverData = this.servers.get(serverId);
    
    if (!serverData) {
      serverData = {
        lastUsed: new Date(),
        clients: new Set(),
        timeout: null
      };
      this.servers.set(serverId, serverData);
    }
    
    // Update activity
    serverData.lastUsed = new Date();
    serverData.clients.add(clientId);
    
    // Cancel any pending cleanup
    if (serverData.timeout) {
      clearTimeout(serverData.timeout);
      serverData.timeout = null;
    }
    
    console.log(`Activity registered: server=${serverId}, client=${clientId}, active clients=${serverData.clients.size}`);
  }
  
  /**
   * Register client disconnection
   */
  unregisterClient(clientId) {
    const affectedServers = [];
    
    // Remove client from all servers
    for (const [serverId, data] of this.servers.entries()) {
      if (data.clients.has(clientId)) {
        data.clients.delete(clientId);
        affectedServers.push(serverId);
        
        console.log(`Client disconnected: client=${clientId}, server=${serverId}, remaining clients=${data.clients.size}`);
        
        // If no more clients, schedule cleanup
        if (data.clients.size === 0) {
          this.scheduleCleanup(serverId);
        }
      }
    }
    
    return affectedServers;
  }
  
  /**
   * Check if server should be kept alive
   */
  shouldKeepAlive(serverId) {
    const serverData = this.servers.get(serverId);
    
    if (!serverData) {
      return false;
    }
    
    // Keep alive if has active clients
    if (serverData.clients.size > 0) {
      return true;
    }
    
    // Check if recently used
    const now = new Date();
    const idleTime = now - serverData.lastUsed;
    
    return idleTime < this.idleTimeout;
  }
  
  /**
   * Schedule server for cleanup
   */
  scheduleCleanup(serverId) {
    const serverData = this.servers.get(serverId);
    
    if (!serverData || serverData.timeout) {
      return; // Already scheduled or doesn't exist
    }
    
    // Schedule cleanup after idle timeout
    serverData.timeout = setTimeout(() => {
      if (!this.shouldKeepAlive(serverId)) {
        this.emit('cleanup', serverId);
        this.servers.delete(serverId);
        console.log(`Server scheduled for cleanup: ${serverId}`);
      } else {
        // Server became active again, clear timeout
        serverData.timeout = null;
      }
    }, this.idleTimeout);
    
    console.log(`Cleanup scheduled for ${serverId} in ${this.idleTimeout}ms`);
  }
  
  /**
   * Cancel scheduled cleanup
   */
  cancelCleanup(serverId) {
    const serverData = this.servers.get(serverId);
    
    if (serverData && serverData.timeout) {
      clearTimeout(serverData.timeout);
      serverData.timeout = null;
      console.log(`Cleanup cancelled for ${serverId}`);
    }
  }
  
  /**
   * Get server usage statistics
   */
  getUsageStats() {
    const stats = {};
    const now = new Date();
    
    for (const [serverId, data] of this.servers.entries()) {
      const idleTime = now - data.lastUsed;
      
      stats[serverId] = {
        activeClients: data.clients.size,
        lastUsed: data.lastUsed.toISOString(),
        idleTimeMs: idleTime,
        idleTimeReadable: this.formatDuration(idleTime),
        hasScheduledCleanup: !!data.timeout,
        willBeCleanedUp: !this.shouldKeepAlive(serverId)
      };
    }
    
    return stats;
  }
  
  /**
   * Force cleanup of idle servers
   */
  forceCleanup() {
    const cleaned = [];
    
    for (const [serverId, data] of this.servers.entries()) {
      if (!this.shouldKeepAlive(serverId)) {
        // Cancel any pending timeout
        if (data.timeout) {
          clearTimeout(data.timeout);
        }
        
        // Emit cleanup event
        this.emit('cleanup', serverId);
        this.servers.delete(serverId);
        cleaned.push(serverId);
      }
    }
    
    console.log(`Force cleanup completed: ${cleaned.length} servers removed`);
    return cleaned;
  }
  
  /**
   * Check all servers for idle status
   * @private
   */
  checkIdleServers() {
    const now = new Date();
    
    for (const [serverId, data] of this.servers.entries()) {
      if (data.clients.size === 0 && !data.timeout) {
        const idleTime = now - data.lastUsed;
        
        if (idleTime >= this.idleTimeout) {
          // Already idle, cleanup immediately
          this.emit('cleanup', serverId);
          this.servers.delete(serverId);
          console.log(`Idle server cleaned up: ${serverId}`);
        }
      }
    }
  }
  
  /**
   * Format duration in human-readable format
   * @private
   */
  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
}

module.exports = LifecycleManager;