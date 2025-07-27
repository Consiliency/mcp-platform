const { EventEmitter } = require('events');
const axios = require('axios');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');

// Import bridge components
const BridgeService = require('./bridge/core/bridge-service');
const StdioTransport = require('./bridge/transports/stdio');
const DockerDiscovery = require('./docker-discovery');
const PlatformManager = require('./platform-manager');
const PathTranslator = require('./path-translator');
const ApiKeyManager = require('./api-key-manager');

// Import Phase 8 enhancements
const ToolInventoryCache = require('./tool-inventory');
const LifecycleManager = require('./lifecycle-manager');
const SmartToolDiscovery = require('./smart-discovery');
const ApiKeyValidator = require('./api-key-validator');

/**
 * Unified Gateway Service that handles both HTTP and stdio servers
 */
class UnifiedGatewayService extends EventEmitter {
  constructor() {
    super();
    
    // Platform detection
    this.platformManager = new PlatformManager();
    console.log('Platform detected:', this.platformManager.getSummary());
    
    // Path translation
    this.pathTranslator = new PathTranslator(this.platformManager);
    
    // API key management
    this.apiKeyManager = new ApiKeyManager();
    
    // Phase 8 enhancements
    this.toolInventoryCache = new ToolInventoryCache();
    this.lifecycleManager = new LifecycleManager();
    this.apiKeyValidator = new ApiKeyValidator(this.apiKeyManager);
    this.smartDiscovery = new SmartToolDiscovery(this, this.apiKeyManager, this.toolInventoryCache);
    
    // Core services
    this.discovery = new DockerDiscovery();
    this.bridge = new BridgeService();
    
    // Server management
    this.servers = new Map();
    this.tools = new Map();
    this.toolRouting = new Map();
    
    // Transport clients
    this.httpClients = new Map();
    
    // Configuration - prefer local config, then environment, then home directory
    const localConfig = path.join(__dirname, 'gateway-config.json');
    const homeConfig = path.join(process.env.HOME || '/home/user', '.mcp-platform', 'gateway-config.json');
    this.configPath = process.env.CONFIG_PATH || localConfig;
    this.config = null;
    
    // Health monitoring
    this.healthData = new Map();
    this.healthCheckInterval = null;
    this.healthCheckIntervalMs = 30000; // 30 seconds
    
    // Register transports with bridge
    this.bridge.registerTransport('stdio', new StdioTransport({}));
    
    // Setup listeners
    this.setupDiscoveryListeners();
    this.setupBridgeListeners();
    this.setupLifecycleListeners();
    this.setupSmartDiscoveryListeners();
  }
  
  /**
   * Determine the transport type for a server
   */
  determineServerType(serverConfig) {
    // Check explicit transport field
    if (serverConfig.transport) {
      return serverConfig.transport;
    }
    
    // Check MCP_MODE environment variable
    if (serverConfig.environment?.MCP_MODE) {
      return serverConfig.environment.MCP_MODE;
    }
    
    // Check if server has HTTP configuration
    if (serverConfig.url || (serverConfig.port && serverConfig.port > 0)) {
      return 'http';
    }
    
    // Check if server has stdio configuration
    if (serverConfig.command || serverConfig.package) {
      return 'stdio';
    }
    
    // Default to stdio for safety
    return 'stdio';
  }
  
  async initialize() {
    console.log('Initializing Unified Gateway Service...');
    
    // Load configuration
    await this.loadConfiguration();
    
    // Initialize API key manager
    await this.apiKeyManager.initialize();
    
    // Start lifecycle manager
    this.lifecycleManager.start();
    
    // Start bridge service
    await this.bridge.start();
    
    // Start Docker discovery for HTTP servers
    await this.discovery.start();
    
    // Load and start stdio servers from configuration
    await this.loadStdioServers();
    
    // Start health monitoring
    this.startHealthMonitoring();
    
    console.log('Unified Gateway Service initialized');
  }
  
  async shutdown() {
    console.log('Shutting down Unified Gateway Service...');
    
    // Stop all stdio servers
    for (const [serverId, server] of this.servers) {
      if (server.type === 'stdio' && server.connectionId) {
        await this.bridge.stopServer(serverId);
      }
    }
    
    // Stop services
    this.discovery.stop();
    await this.bridge.stop();
    
    // Stop lifecycle manager
    this.lifecycleManager.stop();
    
    // Clean up API key validator
    this.apiKeyValidator.destroy();
    
    // Stop health monitoring
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }
  
  /**
   * Start health monitoring
   */
  startHealthMonitoring() {
    console.log('Starting health monitoring...');
    
    // Perform initial health check after a short delay to ensure servers are registered
    setTimeout(() => {
      console.log('Performing initial health check...');
      this.performHealthChecks();
    }, 2000);
    
    // Set up periodic health checks
    this.healthCheckInterval = setInterval(() => {
      console.log('Performing periodic health check...');
      this.performHealthChecks();
    }, this.healthCheckIntervalMs);
  }
  
  /**
   * Perform health checks on all servers
   */
  async performHealthChecks() {
    const promises = [];
    
    console.log(`Checking health for ${this.servers.size} servers`);
    console.log('Servers Map contents:', Array.from(this.servers.entries()).map(([id, s]) => ({id, connectionId: s.connectionId})));
    for (const [serverId, server] of this.servers) {
      console.log(`Scheduling health check for server: ${serverId}, type: ${server.type}, connectionId: ${server.connectionId}`);
      promises.push(this.checkServerHealth(serverId, server));
    }
    
    await Promise.allSettled(promises);
    console.log('Health checks completed');
  }
  
  /**
   * Check health of a single server
   */
  async checkServerHealth(serverId, server) {
    console.log(`Starting health check for ${serverId}`);
    const startTime = Date.now();
    let status = 'unhealthy';
    let responseTime = null;
    let message = '';
    let details = { checks: {} };
    
    try {
      if ((server.type === 'stdio' || server.transport === 'stdio') && server.connectionId) {
        // For stdio servers, check if the process is still running
        const connection = this.bridge.getConnection(server.connectionId);
        console.log(`Health check for ${serverId}: connectionId=${server.connectionId}, connection=`, connection);
        if (connection && connection.process && !connection.process.killed) {
          status = 'healthy';
          responseTime = Date.now() - startTime;
          details.checks.connectivity = 'healthy';
          details.checks.process = 'healthy';
        } else {
          status = 'unhealthy';
          message = 'Process not running';
          details.checks.connectivity = 'unhealthy';
          details.checks.process = 'unhealthy';
        }
      } else if (server.type === 'http' || server.transport === 'http') {
        // For HTTP servers, try to make a health request
        try {
          const healthUrl = server.url + '/health';
          const response = await axios.get(healthUrl, { timeout: 5000 });
          responseTime = Date.now() - startTime;
          
          if (response.status === 200) {
            status = responseTime > 1000 ? 'degraded' : 'healthy';
            details.checks.connectivity = 'healthy';
            details.checks.response = status;
          }
        } catch (error) {
          status = 'unhealthy';
          message = error.message;
          details.checks.connectivity = 'unhealthy';
        }
      }
      
      // Check response time thresholds
      if (responseTime !== null) {
        if (responseTime > 2000) {
          status = 'unhealthy';
          message = 'Response time too high';
        } else if (responseTime > 1000) {
          status = 'degraded';
          message = 'High response time';
        }
      }
    } catch (error) {
      status = 'unhealthy';
      message = error.message;
      console.error(`Health check failed for ${serverId}:`, error);
    }
    
    // Store health data
    this.healthData.set(serverId, {
      status,
      responseTime,
      lastCheck: new Date().toISOString(),
      message,
      details
    });
  }
  
  /**
   * Get overall system health
   */
  getSystemHealth() {
    const services = {
      total: this.servers.size,
      healthy: 0,
      degraded: 0,
      unhealthy: 0
    };
    
    let overallStatus = 'healthy';
    
    for (const [serverId, health] of this.healthData) {
      if (this.servers.has(serverId)) {
        services[health.status]++;
      }
    }
    
    // Determine overall status
    if (services.unhealthy > 0) {
      overallStatus = 'unhealthy';
    } else if (services.degraded > 0) {
      overallStatus = 'degraded';
    }
    
    return {
      status: overallStatus,
      services,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * Get all services health data
   */
  getServicesHealth() {
    const result = {};
    
    // Include all servers, even if no health data yet
    for (const [serverId, server] of this.servers) {
      if (this.healthData.has(serverId)) {
        result[serverId] = this.healthData.get(serverId);
      } else {
        // Default health data for servers without checks yet
        result[serverId] = {
          status: 'unknown',
          responseTime: null,
          lastCheck: 'never',
          message: 'No health check performed yet',
          details: { checks: {} }
        };
      }
    }
    
    return result;
  }
  
  /**
   * Load gateway configuration
   */
  async loadConfiguration() {
    try {
      console.log('Attempting to load configuration from:', this.configPath);
      const configData = await fs.readFile(this.configPath, 'utf8');
      this.config = JSON.parse(configData);
      console.log('Loaded gateway configuration from', this.configPath);
      console.log('Configuration:', JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.log('Error loading configuration:', error.message);
      console.log('Using default configuration');
      this.config = {
        gateway: {
          apiKey: process.env.GATEWAY_API_KEY || 'mcp-gateway-default-key',
          autoStartServers: []
        },
        servers: {}
      };
    }
  }
  
  /**
   * Load and start stdio servers from configuration
   */
  async loadStdioServers() {
    if (!this.config.servers) return;
    
    for (const [serverId, serverConfig] of Object.entries(this.config.servers)) {
      const serverType = this.determineServerType(serverConfig);
      
      if (serverType === 'stdio') {
        // Register stdio server
        const server = {
          id: serverId,
          name: serverId,
          type: 'stdio',
          transport: 'stdio',
          config: serverConfig,
          source: 'config'
        };
        
        this.servers.set(serverId, server);
        
        // Start all stdio servers (not just auto-start ones)
        // The auto-start configuration is used for restart behavior
        await this.startStdioServer(server);
      }
    }
  }
  
  /**
   * Start a stdio server using the bridge
   */
  async startStdioServer(server) {
    try {
      console.log(`Starting stdio server: ${server.id}`);
      
      // Get platform-specific configuration
      const config = this.platformManager.getServerConfig(server.config);
      
      // Check if this server needs Windows-side execution in WSL
      if (this.platformManager.platform.isWSL && 
          this.platformManager.requiresWindowsSide(server.config)) {
        console.log(`Server ${server.id} requires Windows-side execution`);
        
        // Only use Windows interop if we're not in Docker and have interop available
        if (this.platformManager.platform.isDocker) {
          console.log(`Warning: ${server.id} requires Windows display access which is not available in Docker`);
          // Revert to base config since we can't use Windows interop
          const baseConfig = server.config;
          config.command = baseConfig.command || 'npx';
          config.args = baseConfig.args || ['-y', baseConfig.package];
        }
      }
      
      // Get API keys for this server (only if it has requirements)
      let apiKeyStatus = { hasRequirements: false };
      let apiKeys = {};
      
      try {
        apiKeyStatus = this.apiKeyManager.getServerKeyStatus(server.id);
        if (apiKeyStatus.hasRequirements) {
          apiKeys = this.apiKeyManager.getServerEnvironment(server.id);
          // Log warning if keys are missing but don't prevent startup
          if (apiKeyStatus.missingKeys && apiKeyStatus.missingKeys.length > 0) {
            console.log(`Warning: Server ${server.id} is missing API keys: ${apiKeyStatus.missingKeys.join(', ')}`);
          }
        }
      } catch (error) {
        console.log(`Warning: Could not check API keys for ${server.id}:`, error.message);
        // Continue without API keys rather than failing
      }
      
      // Build environment with platform-specific additions and API keys
      // Order matters: process.env -> config.environment -> apiKeys -> display env
      const env = {
        ...process.env,
        ...config.environment,
        ...apiKeys,
        ...this.platformManager.getDisplayEnvironment()
      };
      
      // Get volume mounts if configured
      const mounts = server.config.mounts ? 
        this.platformManager.getVolumeMounts(server.config.mounts) : [];
      
      const transportConfig = {
        type: 'stdio',
        command: config.command || 'npx',
        args: config.args || ['-y', config.package],
        env: env,
        mounts: mounts,
        workingDir: config.workingDir || process.cwd()
      };
      
      // Log platform-specific configuration
      console.log(`Platform config for ${server.id}:`, {
        platform: this.platformManager.platform.os,
        isWSL: this.platformManager.platform.isWSL,
        command: transportConfig.command,
        args: transportConfig.args,
        hasApiKeys: apiKeyStatus.hasRequirements,
        apiKeysConfigured: apiKeyStatus.hasRequirements ? apiKeyStatus.configured : 'N/A',
        missingKeys: apiKeyStatus.missingKeys || []
      });
      
      // Register server with bridge
      await this.bridge.registerServer({
        id: server.id,
        name: server.name,
        transport: transportConfig
      });
      
      // Start the server
      const connectionId = await this.bridge.startServer(server.id);
      server.connectionId = connectionId;
      server.status = 'running';
      
      // Update the server in the Map to include the connectionId
      this.servers.set(server.id, server);
      
      console.log(`Started stdio server: ${server.id} with connectionId: ${connectionId}`);
      
      // Discover tools
      await this.discoverServerTools(server.id);
      
    } catch (error) {
      console.error(`Failed to start stdio server ${server.id}:`, error);
      server.status = 'error';
      server.error = error.message;
    }
  }
  
  /**
   * Setup discovery listeners for HTTP servers
   */
  setupDiscoveryListeners() {
    this.discovery.on('server:discovered', async (serverInfo) => {
      console.log(`Discovered HTTP server: ${serverInfo.id}`);
      
      // Create server entry
      const server = {
        ...serverInfo,
        type: 'http',
        transport: 'http',
        source: 'docker'
      };
      
      this.servers.set(serverInfo.id, server);
      
      // Create HTTP client
      this.httpClients.set(serverInfo.id, axios.create({
        baseURL: serverInfo.url,
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json'
        }
      }));
      
      // Discover tools
      await this.discoverServerTools(serverInfo.id);
    });
    
    this.discovery.on('server:removed', (serverInfo) => {
      console.log(`HTTP server removed: ${serverInfo.id}`);
      this.removeServerTools(serverInfo.id);
      this.servers.delete(serverInfo.id);
      this.httpClients.delete(serverInfo.id);
    });
  }
  
  /**
   * Setup bridge listeners for stdio servers
   */
  setupBridgeListeners() {
    this.bridge.on('server:started', ({ serverId }) => {
      console.log(`Bridge: stdio server started: ${serverId}`);
      const server = this.servers.get(serverId);
      if (server) {
        server.status = 'running';
      }
    });
    
    this.bridge.on('server:stopped', ({ serverId }) => {
      console.log(`Bridge: stdio server stopped: ${serverId}`);
      const server = this.servers.get(serverId);
      if (server) {
        server.status = 'stopped';
        this.removeServerTools(serverId);
      }
    });
    
    this.bridge.on('server:error', ({ serverId, error }) => {
      console.error(`Bridge: stdio server error ${serverId}:`, error);
      const server = this.servers.get(serverId);
      if (server) {
        server.status = 'error';
        server.error = error.message;
      }
    });
  }
  
  /**
   * Setup lifecycle manager listeners
   */
  setupLifecycleListeners() {
    this.lifecycleManager.on('cleanup', async (serverId) => {
      console.log(`Lifecycle: Cleaning up idle server ${serverId}`);
      
      const server = this.servers.get(serverId);
      if (!server) return;
      
      if (server.type === 'stdio' && server.connectionId) {
        await this.bridge.stopServer(serverId);
      } else if (server.type === 'http') {
        // For HTTP servers, just remove from tracking
        this.removeServerTools(serverId);
        this.servers.delete(serverId);
        this.httpClients.delete(serverId);
      }
      
      // Invalidate tool cache
      await this.toolInventoryCache.invalidateServer(serverId);
    });
  }
  
  /**
   * Setup smart discovery listeners
   */
  setupSmartDiscoveryListeners() {
    this.smartDiscovery.on('tools-discovered', ({ serverId, toolCount, tools }) => {
      console.log(`Smart Discovery: Discovered ${toolCount} tools for ${serverId}`);
      
      // Register tool requirements with validator
      for (const tool of tools) {
        const serverConfig = this.servers.get(serverId)?.config;
        if (serverConfig?.requiredKeys) {
          this.apiKeyValidator.registerToolRequirements(tool.name, serverConfig.requiredKeys);
        }
      }
    });
    
    this.smartDiscovery.on('tools-added', ({ serverId, tools }) => {
      console.log(`Smart Discovery: Tools added for ${serverId}:`, tools.map(t => t.name));
      this.emit('tools:updated', this.getAllToolsSync());
    });
    
    this.smartDiscovery.on('tools-removed', ({ serverId, tools }) => {
      console.log(`Smart Discovery: Tools removed for ${serverId}:`, tools.map(t => t.name));
      this.emit('tools:updated', this.getAllToolsSync());
    });
  }
  
  /**
   * Discover tools from a server (works for both HTTP and stdio)
   */
  async discoverServerTools(serverId) {
    try {
      const server = this.servers.get(serverId);
      if (!server) return;
      
      console.log(`Discovering tools for ${serverId} (${server.type})`);
      
      // Check cache first
      const cachedTools = this.toolInventoryCache.getServerTools(serverId);
      if (cachedTools) {
        console.log(`Using cached tools for ${serverId}: ${cachedTools.length} tools`);
        
        // Apply cached tools to internal state
        this.applyServerTools(serverId, cachedTools);
        return;
      }
      
      // Register activity with lifecycle manager
      const clientId = 'gateway-discovery';
      this.lifecycleManager.registerActivity(serverId, clientId);
      
      let response;
      
      if (server.type === 'http') {
        // HTTP server - direct request
        const client = this.httpClients.get(serverId);
        if (!client) return;
        
        response = await client.post('', {
          jsonrpc: '2.0',
          id: `discover_${Date.now()}`,
          method: 'tools/list',
          params: {}
        });
        response = response.data;
        
      } else if (server.type === 'stdio') {
        // stdio server - through bridge
        response = await this.bridge.sendToServer(serverId, {
          jsonrpc: '2.0',
          id: `discover_${Date.now()}`,
          method: 'tools/list',
          params: {}
        });
      }
      
      if (response?.result?.tools) {
        const serverTools = response.result.tools;
        
        // Update cache
        await this.toolInventoryCache.updateServerTools(serverId, serverTools);
        
        // Apply tools to internal state
        this.applyServerTools(serverId, serverTools);
        
        // Verify tools match expectations
        await this.smartDiscovery.verifyToolsOnStartup(serverId);
      }
    } catch (error) {
      console.error(`Failed to discover tools for ${serverId}:`, error.message);
    }
  }
  
  /**
   * Apply server tools to internal state
   * @private
   */
  applyServerTools(serverId, serverTools) {
    // Clear existing tools
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
        originalName: tool.name,
        serverType: this.servers.get(serverId)?.type
      };
      
      const toolKey = `${serverId}:${tool.name}`;
      this.tools.set(toolKey, toolInfo);
      this.toolRouting.set(namespacedName, serverId);
    }
    
    console.log(`Applied ${serverTools.length} tools from ${serverId}`);
    this.emit('tools:updated', this.getAllToolsSync());
  }
  
  /**
   * Remove tools when a server stops
   */
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
  
  /**
   * Handle MCP messages (same interface as before)
   */
  async handleMessage(message) {
    switch (message.method) {
      case 'initialize':
        return this.handleInitialize(message);
      case 'tools/list':
        return this.handleToolsList(message);
      case 'tools/call':
        return this.handleToolCall(message);
      default:
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
          name: 'MCP Unified Gateway',
          version: '2.0.0'
        }
      }
    };
  }
  
  async handleToolsList(message) {
    // Get all tools
    const allTools = this.getAllToolsSync();
    
    // Filter by API key availability
    const availableTools = this.apiKeyValidator.filterToolsByAvailability(allTools);
    
    // Check if using smart discovery for lazy loading
    const smartTools = await this.smartDiscovery.getAvailableTools();
    
    // Merge and deduplicate
    const mergedTools = [...availableTools];
    for (const smartTool of smartTools) {
      if (!mergedTools.find(t => t.namespacedName === smartTool.namespacedName)) {
        mergedTools.push(smartTool);
      }
    }
    
    return {
      jsonrpc: '2.0',
      id: message.id,
      result: {
        tools: mergedTools.map(tool => ({
          name: tool.namespacedName,
          description: tool.description,
          inputSchema: tool.inputSchema
        }))
      }
    };
  }
  
  async handleToolCall(message) {
    const { name, arguments: args } = message.params;
    
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
    
    // Get server info
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
    
    const server = this.servers.get(serverId);
    const tool = this.tools.get(toolName);
    
    if (!server || !tool) {
      return {
        jsonrpc: '2.0',
        id: message.id,
        error: {
          code: -32602,
          message: `Tool not found: ${toolName}`
        }
      };
    }
    
    // Check API key availability
    const canCall = this.apiKeyValidator.canCallTool(tool.originalName);
    if (!canCall.canCall) {
      return {
        jsonrpc: '2.0',
        id: message.id,
        error: {
          code: -32603,
          message: canCall.error.message,
          data: canCall.error
        }
      };
    }
    
    // Register activity with lifecycle manager
    const clientId = message.clientId || 'gateway-tool-call';
    this.lifecycleManager.registerActivity(serverId, clientId);
    
    try {
      // Check if server needs lazy startup
      if (this.smartDiscovery.needsStartup(serverId)) {
        console.log(`Lazy starting server ${serverId} for tool ${toolName}`);
        await this.smartDiscovery.lazyDiscoverTools(serverId);
      }
      // Translate paths in arguments if needed
      const translatedArgs = this.pathTranslator.translateToolArguments(
        tool.originalName, 
        args || {}
      );
      
      const serverMessage = {
        jsonrpc: '2.0',
        id: message.id,
        method: 'tools/call',
        params: {
          name: tool.originalName,
          arguments: translatedArgs
        }
      };
      
      let response;
      
      if (server.type === 'http') {
        // HTTP server - direct request
        const client = this.httpClients.get(serverId);
        if (!client) {
          throw new Error(`No HTTP client for server: ${serverId}`);
        }
        response = await client.post('', serverMessage);
        response = response.data;
        
      } else if (server.type === 'stdio') {
        // stdio server - through bridge
        response = await this.bridge.sendToServer(serverId, serverMessage);
      }
      
      // Translate paths in response
      if (response && response.result) {
        response.result = this.pathTranslator.translateToolResponse(
          tool.originalName,
          response.result
        );
      }
      
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
    
    // Get all configured servers from config
    const configuredServers = new Set();
    if (this.config.servers) {
      for (const [serverId, serverConfig] of Object.entries(this.config.servers)) {
        configuredServers.add(serverId);
        
        // Check if server is running
        const runningServer = this.servers.get(serverId);
        
        // Count tools for running servers
        let toolCount = 0;
        if (runningServer) {
          for (const tool of this.tools.values()) {
            if (tool.serverId === serverId) {
              toolCount++;
            }
          }
        }
        
        // Check if server is in auto-start list
        const isAutoStart = this.config.gateway?.autoStartServers?.includes(serverId) || false;
        
        statuses.push({
          id: serverId,
          name: serverConfig.name || runningServer?.name || serverId,
          type: serverConfig.transport || runningServer?.type || 'stdio',
          transport: serverConfig.transport || runningServer?.transport || 'stdio',
          status: runningServer ? 'running' : 'stopped',
          source: 'config',
          url: runningServer?.url,
          error: runningServer?.error,
          toolCount,
          autostart: isAutoStart
        });
      }
    }
    
    // Add any running servers not in config
    for (const [serverId, server] of this.servers) {
      if (!configuredServers.has(serverId)) {
        let toolCount = 0;
        for (const tool of this.tools.values()) {
          if (tool.serverId === serverId) {
            toolCount++;
          }
        }
        
        statuses.push({
          id: serverId,
          name: server.name || serverId,
          type: server.type,
          transport: server.transport,
          status: 'running',
          source: 'dynamic',
          url: server.url,
          error: server.error,
          toolCount,
          autostart: false
        });
      }
    }
    
    return statuses;
  }
  
  async getConfiguration() {
    return this.config;
  }
  
  async updateConfiguration(newConfig) {
    try {
      // Merge with existing config
      this.config = { ...this.config, ...newConfig };
      
      // Save to file
      await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2));
      
      // Emit configuration change event
      this.emit('config:updated', this.config);
      
      return this.config;
    } catch (error) {
      console.error('Failed to update configuration:', error);
      throw error;
    }
  }
  
  async getServerCatalog() {
    try {
      // Try extended catalog first, then fall back to regular catalog
      const extendedPath = process.env.GATEWAY_MODE === 'hybrid' || !process.env.DOCKER_CONTAINER
        ? path.join(__dirname, '..', 'catalog', 'servers-extended.json')
        : '/app/catalog/servers-extended.json';
      
      const regularPath = process.env.GATEWAY_MODE === 'hybrid' || !process.env.DOCKER_CONTAINER
        ? path.join(__dirname, '..', 'catalog', 'servers.json')
        : '/app/catalog/servers.json';
      
      console.log('Catalog paths:', { extendedPath, regularPath, hybrid: process.env.GATEWAY_MODE, docker: process.env.DOCKER_CONTAINER });
      
      let catalogPath;
      try {
        await fs.access(extendedPath);
        catalogPath = extendedPath;
        console.log('Using extended catalog:', extendedPath);
      } catch {
        catalogPath = regularPath;
        console.log('Using regular catalog:', regularPath);
      }
      
      const catalogData = await fs.readFile(catalogPath, 'utf8');
      const catalog = JSON.parse(catalogData);
      console.log(`Loaded ${catalog.length} servers from catalog`);
      return catalog;
    } catch (error) {
      console.error('Failed to read server catalog:', error);
      // Return empty catalog if file doesn't exist
      return [];
    }
  }
  
  async addServer(serverId, serverConfig) {
    try {
      // Add to config
      if (!this.config.servers) {
        this.config.servers = {};
      }
      
      // Check if we have existing platform-specific configuration
      const existingConfig = this.config.servers[serverId];
      if (existingConfig && existingConfig.platforms) {
        // Merge with existing platform-specific configuration
        serverConfig = {
          ...serverConfig,
          platforms: existingConfig.platforms,
          capabilities: existingConfig.capabilities || serverConfig.capabilities
        };
        console.log(`Merged platform configuration for ${serverId}`);
      }
      
      this.config.servers[serverId] = serverConfig;
      
      // Save config
      await this.updateConfiguration(this.config);
      
      // Start the server if auto-start is enabled
      if (serverConfig.autoStart) {
        await this.startServer(serverId, serverConfig);
      }
      
      return { serverId, status: 'added' };
    } catch (error) {
      console.error(`Failed to add server ${serverId}:`, error);
      throw error;
    }
  }
  
  async stopServer(serverId) {
    try {
      const server = this.servers.get(serverId);
      if (!server) {
        console.log(`Server ${serverId} not found or not running`);
        return;
      }
      
      if (server.connectionId && server.type === 'stdio') {
        console.log(`Stopping stdio server ${serverId}`);
        await this.bridge.stopServer(serverId);
        // Update server status
        server.status = 'stopped';
        server.connectionId = null;
      }
      
      console.log(`Server ${serverId} stopped`);
    } catch (error) {
      console.error(`Failed to stop server ${serverId}:`, error);
      throw error;
    }
  }
  
  async removeServer(serverId) {
    try {
      // Stop server if running
      const server = this.servers.get(serverId);
      if (server) {
        await this.stopServer(serverId);
      }
      
      // Remove from config
      if (this.config.servers && this.config.servers[serverId]) {
        delete this.config.servers[serverId];
        await this.updateConfiguration(this.config);
      }
      
      return { serverId, status: 'removed' };
    } catch (error) {
      console.error(`Failed to remove server ${serverId}:`, error);
      throw error;
    }
  }
  
  async restart() {
    try {
      console.log('Restarting gateway service...');
      
      // Stop all servers
      for (const [serverId, server] of this.servers) {
        await this.stopServer(serverId);
      }
      
      // Clear state
      this.servers.clear();
      this.tools.clear();
      this.toolRouting.clear();
      
      // Reload configuration
      await this.loadConfiguration();
      
      // Restart auto-start servers
      await this.startConfiguredServers();
      
      console.log('Gateway service restarted successfully');
    } catch (error) {
      console.error('Failed to restart gateway:', error);
      throw error;
    }
  }
  
  async updateAutoStart(serverId, enabled) {
    try {
      // Load current configuration
      const configPath = path.join(__dirname, 'gateway-config.json');
      const configData = await fs.readFile(configPath, 'utf8');
      const config = JSON.parse(configData);
      
      // Initialize autoStartServers if it doesn't exist
      if (!config.gateway.autoStartServers) {
        config.gateway.autoStartServers = [];
      }
      
      const autoStartServers = config.gateway.autoStartServers;
      const serverIndex = autoStartServers.indexOf(serverId);
      
      if (enabled && serverIndex === -1) {
        // Add to auto-start list
        autoStartServers.push(serverId);
      } else if (!enabled && serverIndex !== -1) {
        // Remove from auto-start list
        autoStartServers.splice(serverIndex, 1);
      }
      
      // Save updated configuration
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));
      
      // Update in-memory configuration
      this.config.gateway.autoStartServers = autoStartServers;
      
      console.log(`Updated auto-start for ${serverId}: ${enabled}`);
      return true;
    } catch (error) {
      console.error('Failed to update auto-start configuration:', error);
      throw error;
    }
  }
  
  async addToCatalog(server) {
    try {
      const catalog = await this.getServerCatalog();
      
      // Check if server with same ID already exists
      const existingIndex = catalog.findIndex(s => s.id === server.id);
      if (existingIndex >= 0) {
        catalog[existingIndex] = server;
      } else {
        catalog.push(server);
      }
      
      // Save updated catalog
      const catalogPath = process.env.GATEWAY_MODE === 'hybrid' || !process.env.DOCKER_CONTAINER
        ? path.join(__dirname, '..', 'catalog', 'servers-extended.json')
        : '/app/catalog/servers-extended.json';
      await fs.writeFile(catalogPath, JSON.stringify(catalog, null, 2));
      
      return { id: server.id, status: 'added' };
    } catch (error) {
      console.error('Failed to add to catalog:', error);
      throw error;
    }
  }
  
  async updateCatalogEntry(id, server) {
    try {
      const catalog = await this.getServerCatalog();
      const index = catalog.findIndex(s => s.id === id);
      
      if (index < 0) {
        throw new Error(`Server ${id} not found in catalog`);
      }
      
      catalog[index] = { ...catalog[index], ...server, id };
      
      // Save updated catalog
      const catalogPath = process.env.GATEWAY_MODE === 'hybrid' || !process.env.DOCKER_CONTAINER
        ? path.join(__dirname, '..', 'catalog', 'servers-extended.json')
        : '/app/catalog/servers-extended.json';
      await fs.writeFile(catalogPath, JSON.stringify(catalog, null, 2));
      
      return { id, status: 'updated' };
    } catch (error) {
      console.error('Failed to update catalog entry:', error);
      throw error;
    }
  }
  
  async removeFromCatalog(id) {
    try {
      const catalog = await this.getServerCatalog();
      const filtered = catalog.filter(s => s.id !== id);
      
      if (filtered.length === catalog.length) {
        throw new Error(`Server ${id} not found in catalog`);
      }
      
      // Save updated catalog
      const catalogPath = process.env.GATEWAY_MODE === 'hybrid' || !process.env.DOCKER_CONTAINER
        ? path.join(__dirname, '..', 'catalog', 'servers-extended.json')
        : '/app/catalog/servers-extended.json';
      await fs.writeFile(catalogPath, JSON.stringify(filtered, null, 2));
      
      return { id, status: 'removed' };
    } catch (error) {
      console.error('Failed to remove from catalog:', error);
      throw error;
    }
  }
  
  async discoverServer(url) {
    try {
      // Determine if it's a GitHub URL or npm package
      const githubMatch = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      const npmMatch = url.match(/^(@?[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/i);
      
      if (githubMatch) {
        // GitHub repository
        const [, owner, repo] = githubMatch;
        const apiUrl = `https://api.github.com/repos/${owner}/${repo}`;
        
        const response = await axios.get(apiUrl);
        const repoData = response.data;
        
        // Try to fetch package.json
        try {
          const pkgResponse = await axios.get(`https://raw.githubusercontent.com/${owner}/${repo}/main/package.json`);
          const packageData = pkgResponse.data;
          
          return {
            id: repo.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
            name: packageData.name || repoData.name,
            description: packageData.description || repoData.description,
            package: packageData.name || `github:${owner}/${repo}`,
            transport: 'stdio',
            config: {
              command: 'npx',
              args: ['-y', packageData.name || `github:${owner}/${repo}`],
              environment: {}
            }
          };
        } catch (e) {
          // No package.json, use basic info
          return {
            id: repo.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
            name: repoData.name,
            description: repoData.description,
            package: `github:${owner}/${repo}`,
            transport: 'stdio',
            config: {
              command: 'npx',
              args: ['-y', `github:${owner}/${repo}`],
              environment: {}
            }
          };
        }
      } else if (npmMatch) {
        // npm package
        const npmUrl = `https://registry.npmjs.org/${url}`;
        const response = await axios.get(npmUrl);
        const packageData = response.data;
        
        const latestVersion = packageData['dist-tags'].latest;
        const versionData = packageData.versions[latestVersion];
        
        return {
          id: url.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^@/, ''),
          name: versionData.name,
          description: versionData.description || 'No description available',
          package: url,
          transport: 'stdio',
          config: {
            command: 'npx',
            args: ['-y', url],
            environment: {}
          }
        };
      } else {
        throw new Error('Invalid URL. Please provide a GitHub URL or npm package name.');
      }
    } catch (error) {
      console.error('Failed to discover server:', error);
      throw new Error(`Failed to discover server: ${error.message}`);
    }
  }
  
  /**
   * List tools for a specific server (used by SmartToolDiscovery)
   */
  async listTools(serverId) {
    const server = this.servers.get(serverId);
    if (!server) {
      throw new Error(`Server not found: ${serverId}`);
    }
    
    let response;
    
    if (server.type === 'http') {
      const client = this.httpClients.get(serverId);
      if (!client) {
        throw new Error(`No HTTP client for server: ${serverId}`);
      }
      
      response = await client.post('', {
        jsonrpc: '2.0',
        id: `list_tools_${Date.now()}`,
        method: 'tools/list',
        params: {}
      });
      response = response.data;
    } else if (server.type === 'stdio') {
      response = await this.bridge.sendToServer(serverId, {
        jsonrpc: '2.0',
        id: `list_tools_${Date.now()}`,
        method: 'tools/list',
        params: {}
      });
    }
    
    if (response?.result?.tools) {
      return response.result.tools;
    }
    
    return [];
  }
  
  /**
   * Ensure a server is started (used by SmartToolDiscovery)
   */
  async ensureServerStarted(serverId) {
    const server = this.servers.get(serverId);
    if (!server) {
      throw new Error(`Server not found: ${serverId}`);
    }
    
    // For HTTP servers, they're already running
    if (server.type === 'http') {
      return true;
    }
    
    // For stdio servers, check if running
    if (server.type === 'stdio') {
      if (server.status === 'running' && server.connectionId) {
        return true;
      }
      
      // Start the server
      await this.startStdioServer(server);
      return true;
    }
    
    throw new Error(`Unknown server type: ${server.type}`);
  }
  
  /**
   * Call a tool by name (used by SmartToolDiscovery)
   */
  async callTool(toolName, args) {
    const message = {
      jsonrpc: '2.0',
      id: `tool_call_${Date.now()}`,
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args
      }
    };
    
    return await this.handleToolCall(message);
  }
}

module.exports = UnifiedGatewayService;