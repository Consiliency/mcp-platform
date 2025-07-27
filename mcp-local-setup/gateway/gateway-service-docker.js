const { EventEmitter } = require('events');
const axios = require('axios');
const DockerDiscovery = require('./docker-discovery');

class GatewayService extends EventEmitter {
  constructor() {
    super();
    
    this.discovery = new DockerDiscovery();
    this.servers = new Map();
    this.tools = new Map();
    this.toolRouting = new Map(); // Maps namespaced tool -> serverId
    this.httpClients = new Map(); // HTTP clients for each server
    
    // Listen to discovery events
    this.setupDiscoveryListeners();
  }
  
  async initialize() {
    console.log('Initializing Gateway Service with Docker discovery...');
    
    // Start discovery
    await this.discovery.start();
    
    console.log('Gateway Service initialized');
  }
  
  async shutdown() {
    console.log('Shutting down Gateway Service...');
    this.discovery.stop();
  }
  
  setupDiscoveryListeners() {
    this.discovery.on('server:discovered', async (serverInfo) => {
      console.log(`Registering discovered server: ${serverInfo.id}`);
      this.servers.set(serverInfo.id, serverInfo);
      
      // Create HTTP client for this server
      this.httpClients.set(serverInfo.id, axios.create({
        baseURL: serverInfo.url,
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json'
        }
      }));
      
      // Discover tools from the server
      await this.discoverServerTools(serverInfo.id);
    });
    
    this.discovery.on('server:removed', (serverInfo) => {
      console.log(`Server removed: ${serverInfo.id}`);
      this.removeServerTools(serverInfo.id);
      this.servers.delete(serverInfo.id);
      this.httpClients.delete(serverInfo.id);
    });
  }
  
  async discoverServerTools(serverId) {
    try {
      const server = this.servers.get(serverId);
      if (!server) return;
      
      const client = this.httpClients.get(serverId);
      if (!client) return;
      
      // Send tools/list request to server
      const response = await client.post('', {
        jsonrpc: '2.0',
        id: `discover_${Date.now()}`,
        method: 'tools/list',
        params: {}
      });
      
      if (response.data.result && Array.isArray(response.data.result.tools)) {
        const serverTools = response.data.result.tools;
        
        // Clear existing tools for this server
        for (const [toolKey, tool] of this.tools) {
          if (tool.serverId === serverId) {
            this.tools.delete(toolKey);
            this.toolRouting.delete(tool.namespacedName);
          }
        }
        
        // Add new tools with namespacing
        for (const tool of serverTools) {
          const namespacedName = `${serverId}:${tool.name}`;
          const toolInfo = {
            ...tool,
            serverId,
            namespacedName,
            originalName: tool.name
          };
          
          const toolKey = `${serverId}:${tool.name}`;
          this.tools.set(toolKey, toolInfo);
          this.toolRouting.set(namespacedName, serverId);
        }
        
        console.log(`Discovered ${serverTools.length} tools from ${serverId}`);
        this.emit('tools:updated', this.getAllToolsSync());
      }
    } catch (error) {
      console.error(`Failed to discover tools for ${serverId}:`, error.message);
    }
  }
  
  removeServerTools(serverId) {
    let removed = 0;
    
    for (const [toolKey, tool] of this.tools) {
      if (tool.serverId === serverId) {
        this.tools.delete(toolKey);
        this.toolRouting.delete(tool.namespacedName);
        removed++;
      }
    }
    
    if (removed > 0) {
      console.log(`Removed ${removed} tools from ${serverId}`);
      this.emit('tools:updated', this.getAllToolsSync());
    }
  }
  
  async handleMessage(message) {
    // Handle different message types
    switch (message.method) {
      case 'initialize':
        return this.handleInitialize(message);
        
      case 'tools/list':
        return this.handleToolsList(message);
        
      case 'tools/call':
        return this.handleToolCall(message);
        
      default:
        // Check if it's a namespaced tool call
        if (message.method?.includes(':')) {
          return this.handleNamespacedToolCall(message);
        }
        
        return {
          jsonrpc: '2.0',
          id: message.id,
          error: {
            code: -32601,
            message: `Method not found: ${message.method}`
          }
        };
    }
  }
  
  async handleInitialize(message) {
    return {
      jsonrpc: '2.0',
      id: message.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
          prompts: {},
          resources: {}
        },
        serverInfo: {
          name: 'MCP Gateway',
          version: '1.0.0'
        }
      }
    };
  }
  
  async handleToolsList(message) {
    const tools = this.getAllToolsSync();
    
    return {
      jsonrpc: '2.0',
      id: message.id,
      result: {
        tools: tools.map(tool => ({
          name: tool.namespacedName,
          description: tool.description,
          inputSchema: tool.inputSchema
        }))
      }
    };
  }
  
  async handleToolCall(message) {
    const { name, arguments: args } = message.params;
    
    // Check if it's a namespaced tool
    if (!name.includes(':')) {
      return {
        jsonrpc: '2.0',
        id: message.id,
        error: {
          code: -32602,
          message: 'Tool name must be namespaced (format: serverId:toolName)'
        }
      };
    }
    
    return this.handleNamespacedToolCall(message);
  }
  
  async handleNamespacedToolCall(message) {
    let toolName = message.method;
    let args = message.params;
    
    // Handle tools/call format
    if (message.method === 'tools/call') {
      toolName = message.params.name;
      args = message.params.arguments;
    }
    
    // Extract serverId from namespaced tool name
    const serverId = this.toolRouting.get(toolName);
    
    if (!serverId) {
      return {
        jsonrpc: '2.0',
        id: message.id,
        error: {
          code: -32602,
          message: `Unknown tool: ${toolName}`
        }
      };
    }
    
    // Get original tool name
    const tool = this.tools.get(toolName);
    if (!tool) {
      return {
        jsonrpc: '2.0',
        id: message.id,
        error: {
          code: -32602,
          message: `Tool not found: ${toolName}`
        }
      };
    }
    
    try {
      const client = this.httpClients.get(serverId);
      if (!client) {
        throw new Error(`No HTTP client for server: ${serverId}`);
      }
      
      // Forward to the appropriate server with original tool name
      const serverMessage = {
        jsonrpc: '2.0',
        id: message.id,
        method: 'tools/call',
        params: {
          name: tool.originalName,
          arguments: args || {}
        }
      };
      
      const response = await client.post('', serverMessage);
      return response.data;
      
    } catch (error) {
      return {
        jsonrpc: '2.0',
        id: message.id,
        error: {
          code: -32603,
          message: `Server error: ${error.message}`
        }
      };
    }
  }
  
  getAllToolsSync() {
    return Array.from(this.tools.values());
  }
  
  async getAllTools() {
    return this.getAllToolsSync();
  }
  
  async getServerStatus() {
    const statuses = [];
    
    for (const [serverId, serverInfo] of this.servers) {
      // Count tools for this server
      let toolCount = 0;
      for (const tool of this.tools.values()) {
        if (tool.serverId === serverId) {
          toolCount++;
        }
      }
      
      statuses.push({
        id: serverId,
        name: serverInfo.name,
        status: 'running',
        transport: serverInfo.mode || 'http',
        url: serverInfo.url,
        toolCount
      });
    }
    
    return statuses;
  }
}

module.exports = GatewayService;