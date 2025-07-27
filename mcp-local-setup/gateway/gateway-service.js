const { EventEmitter } = require('events');
const path = require('path');

// Import the bridge service
const BridgeService = require('../bridge/core/bridge-service');
const StdioTransport = require('../bridge/transports/stdio');

class GatewayService extends EventEmitter {
  constructor(configManager) {
    super();
    
    this.configManager = configManager;
    this.bridge = new BridgeService();
    this.servers = new Map();
    this.tools = new Map();
    this.toolRouting = new Map(); // Maps namespaced tool -> serverId
    
    // Register transports
    this.bridge.registerTransport('stdio', new StdioTransport({}));
    
    // Listen to bridge events
    this.setupBridgeListeners();
  }
  
  async initialize() {
    console.log('Initializing Gateway Service...');
    
    // Load server configurations
    await this.loadServerConfigs();
    
    // Start the bridge
    await this.bridge.start();
    
    // Start configured servers
    await this.startConfiguredServers();
    
    console.log('Gateway Service initialized');
  }
  
  async shutdown() {
    console.log('Shutting down Gateway Service...');
    await this.bridge.stop();
  }
  
  setupBridgeListeners() {
    this.bridge.on('server:started', ({ serverId }) => {
      console.log(`Server started: ${serverId}`);
      this.discoverServerTools(serverId);
    });
    
    this.bridge.on('server:stopped', ({ serverId }) => {
      console.log(`Server stopped: ${serverId}`);
      this.removeServerTools(serverId);
    });
    
    this.bridge.on('server:message', ({ serverId, message }) => {
      // Handle notifications from servers
      if (message.method === 'tools/updated') {
        this.discoverServerTools(serverId);
      }
    });
  }
  
  async loadServerConfigs() {
    // Load from gateway configuration
    const serverConfigs = this.configManager.getAllServerConfigs();
    console.log('Server configs from gateway:', Object.keys(serverConfigs));
    
    try {
      for (const [serverId, serverConfig] of Object.entries(serverConfigs)) {
        console.log(`Processing server ${serverId}:`, serverConfig);
        if (serverConfig.transport === 'stdio') {
          const config = {
            id: serverId,
            name: serverId,
            transport: {
              type: 'stdio',
              command: serverConfig.command,
              args: serverConfig.args || [],
              env: {
                ...serverConfig.environment,
                ...this.configManager.getServerEnvironment(serverId)
              }
            }
          };
          
          this.servers.set(serverId, config);
          this.bridge.registerServer(config);
          console.log(`Registered server: ${serverId}`);
        }
      }
      
      console.log(`Loaded ${this.servers.size} server configurations from gateway config`);
    } catch (error) {
      console.error('Failed to load server configs:', error);
    }
  }
  
  detectTransportType(server) {
    // Check environment variable
    const env = server.config?.environment || {};
    if (env.MCP_MODE) {
      return env.MCP_MODE.toLowerCase();
    }
    
    // Check source type
    if (server.source?.type === 'npm') {
      return 'stdio';
    }
    
    return 'stdio'; // Default
  }
  
  getServerCommand(server) {
    if (server.source?.type === 'npm') {
      return 'npx';
    }
    return server.source?.command || 'node';
  }
  
  getServerArgs(server) {
    if (server.source?.type === 'npm') {
      return ['-y', server.source.package];
    }
    return server.source?.args || [];
  }
  
  async startConfiguredServers() {
    // Start servers that should auto-start
    const autoStartServers = this.configManager.getAutoStartServers();
    
    for (const serverId of autoStartServers) {
      if (this.servers.has(serverId)) {
        try {
          await this.bridge.startServer(serverId);
        } catch (error) {
          console.error(`Failed to start server ${serverId}:`, error);
        }
      }
    }
  }
  
  async discoverServerTools(serverId) {
    try {
      // Send tools/list request to server
      const response = await this.bridge.sendToServer(serverId, {
        jsonrpc: '2.0',
        id: `discover_${Date.now()}`,
        method: 'tools/list',
        params: {}
      });
      
      if (response.result && Array.isArray(response.result.tools)) {
        const serverTools = response.result.tools;
        
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
      console.error(`Failed to discover tools for ${serverId}:`, error);
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
      
      const response = await this.bridge.sendToServer(serverId, serverMessage);
      return response;
      
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
    
    for (const [serverId, config] of this.servers) {
      const status = this.bridge.getServerStatus(serverId) || {
        id: serverId,
        name: config.name,
        status: 'stopped',
        transport: config.transport.type
      };
      
      // Count tools for this server
      let toolCount = 0;
      for (const tool of this.tools.values()) {
        if (tool.serverId === serverId) {
          toolCount++;
        }
      }
      
      statuses.push({
        ...status,
        toolCount
      });
    }
    
    return statuses;
  }
}

module.exports = GatewayService;