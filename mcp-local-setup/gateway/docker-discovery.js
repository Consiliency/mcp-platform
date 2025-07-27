const http = require('http');
const { EventEmitter } = require('events');

class DockerDiscovery extends EventEmitter {
  constructor() {
    super();
    this.servers = new Map();
    this.pollingInterval = 10000; // 10 seconds
    this.dockerHost = process.env.DOCKER_HOST || '/var/run/docker.sock';
  }

  async start() {
    console.log('Starting Docker service discovery...');
    
    // Initial discovery
    await this.discoverServices();
    
    // Set up polling
    this.pollInterval = setInterval(() => {
      this.discoverServices().catch(console.error);
    }, this.pollingInterval);
  }

  stop() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
  }

  async discoverServices() {
    try {
      // In Docker environment, we can use environment variables
      // Docker Compose sets these automatically
      const discoveredServers = new Map();
      
      // Get all environment variables that indicate MCP servers
      // Docker Compose creates environment variables for linked services
      // We'll look for patterns that indicate MCP services
      
      // First, check for explicit MCP server list
      if (process.env.MCP_SERVERS) {
        const serverList = process.env.MCP_SERVERS.split(',');
        for (const serverId of serverList) {
          const id = serverId.trim();
          if (!id || id === 'gateway' || id === 'traefik' || id === 'dashboard') continue;
          
          // Build server info from environment
          const serverInfo = {
            id: id,
            name: id,
            host: id, // Docker Compose uses service name as hostname
            port: parseInt(process.env[`MCP_${id.toUpperCase()}_PORT`] || '3000'),
            mode: 'http',
            url: `http://${id}:${parseInt(process.env[`MCP_${id.toUpperCase()}_PORT`] || '3000')}`,
            environment: {}
          };
          
          discoveredServers.set(id, serverInfo);
        }
      }
      
      // Also check for individual server environment variables
      for (const [key, value] of Object.entries(process.env)) {
        // Pattern: MCP_<SERVICE>_ENABLED=true
        const match = key.match(/^MCP_(.+)_ENABLED$/);
        if (match && value === 'true') {
          const serviceName = match[1].toLowerCase();
          
          // Skip non-MCP services
          if (serviceName === 'traefik' || serviceName === 'gateway' || serviceName === 'dashboard') continue;
          
          if (!discoveredServers.has(serviceName)) {
            const serverInfo = {
              id: serviceName,
              name: serviceName,
              host: serviceName,
              port: parseInt(process.env[`MCP_${match[1]}_PORT`] || '3000'),
              mode: 'http',
              url: `http://${serviceName}:${parseInt(process.env[`MCP_${match[1]}_PORT`] || '3000')}`,
              environment: {}
            };
            
            discoveredServers.set(serviceName, serverInfo);
          }
        }
      }
      
      // Check for servers defined in GATEWAY_SERVERS environment variable
      if (process.env.GATEWAY_SERVERS) {
        const servers = process.env.GATEWAY_SERVERS.split(',');
        for (const server of servers) {
          const [name, url] = server.trim().split('=');
          if (name && url) {
            discoveredServers.set(name, {
              id: name,
              name: name,
              url: url,
              mode: 'http',
              environment: {}
            });
          }
        }
      }
      
      // Emit events for new/removed servers
      for (const [id, info] of discoveredServers) {
        if (!this.servers.has(id)) {
          console.log(`Discovered new MCP server: ${id}`);
          this.emit('server:discovered', info);
        }
      }
      
      for (const [id, info] of this.servers) {
        if (!discoveredServers.has(id)) {
          console.log(`MCP server removed: ${id}`);
          this.emit('server:removed', info);
        }
      }
      
      this.servers = discoveredServers;
      
    } catch (error) {
      console.error('Error discovering services:', error);
    }
  }
  
  getServers() {
    return Array.from(this.servers.values());
  }
}

module.exports = DockerDiscovery;