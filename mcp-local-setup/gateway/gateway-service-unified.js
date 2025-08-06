const { EventEmitter } = require('events');
const axios = require('axios');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');

// Import bridge components
const BridgeService = require('./bridge/core/bridge-service');
const StdioTransport = require('./bridge/transports/stdio');
const HttpProxyTransport = require('./bridge/transports/http-proxy');
const SSETransport = require('./bridge/transports/sse-transport');
const DockerDiscovery = require('./docker-discovery');
const PlatformManager = require('./platform-manager');
const PathTranslator = require('./path-translator');
const EnvironmentManager = require('./environment-manager');

// Import Phase 8 enhancements
const ToolInventoryCache = require('./tool-inventory');
const LifecycleManager = require('./lifecycle-manager');
const SmartToolDiscovery = require('./smart-discovery');
const ApiKeyValidator = require('./api-key-validator');
const CompatibilityChecker = require('./compatibility-checker');

/**
 * Unified Gateway Service that handles both HTTP and stdio servers
 */
class UnifiedGatewayService extends EventEmitter {
  constructor() {
    super();
    
    // Enable debug mode from environment
    this.debug = process.env.GATEWAY_DEBUG === 'true';
    
    // Platform detection
    this.platformManager = new PlatformManager();
    console.log('Platform detected:', this.platformManager.getSummary());
    
    // Path translation
    this.pathTranslator = new PathTranslator(this.platformManager);
    
    // API key management
    this.environmentManager = new EnvironmentManager();
    
    // Phase 8 enhancements
    this.toolInventoryCache = new ToolInventoryCache();
    this.lifecycleManager = new LifecycleManager();
    this.apiKeyValidator = new ApiKeyValidator(this.environmentManager);
    this.compatibilityChecker = new CompatibilityChecker();
    this.smartDiscovery = new SmartToolDiscovery(this, this.environmentManager, this.toolInventoryCache);
    
    // Core services
    this.discovery = new DockerDiscovery();
    this.bridge = new BridgeService();
    
    // Server management
    this.servers = new Map();
    this.tools = new Map();
    this.toolRouting = new Map();
    
    // Transport clients
    this.httpClients = new Map();
    
    // Configuration - prefer environment variable, then WSL config if in WSL, then local config, then home directory
    const localConfig = path.join(__dirname, 'gateway-config.json');
    const wslConfig = path.join(__dirname, 'gateway-config-wsl.json');
    const homeConfig = path.join(process.env.HOME || process.env.USERPROFILE || '/home/user', '.mcp-platform', 'gateway-config.json');
    
    // Check for environment variable first
    if (process.env.GATEWAY_CONFIG_FILE) {
      this.configPath = path.join(__dirname, process.env.GATEWAY_CONFIG_FILE);
    } else if (process.env.CONFIG_PATH) {
      this.configPath = process.env.CONFIG_PATH;
    } else if (this.platformManager.platform.isWSL && fsSync.existsSync(wslConfig)) {
      // Use WSL-specific config if we're in WSL
      this.configPath = wslConfig;
    } else {
      this.configPath = localConfig;
    }
    this.config = null;
    
    // Health monitoring
    this.healthData = new Map();
    this.healthCheckInterval = null;
    this.healthCheckIntervalMs = 30000; // 30 seconds
    
    // Register transports with bridge
    this.bridge.registerTransport('stdio', new StdioTransport({}));
    this.bridge.registerTransport('http-proxy', new HttpProxyTransport({}));
    // SSE transport will be registered when server.js provides the Express app
    
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
    await this.environmentManager.initialize();
    
    // Start lifecycle manager
    this.lifecycleManager.start();
    
    // Start bridge service
    await this.bridge.start();
    
    // Start Docker discovery for HTTP servers
    await this.discovery.start();
    
    // Load and start stdio servers from configuration
    await this.loadStdioServers();
    
    // Wait for initial tool discovery to complete for all servers
    await this.waitForInitialDiscovery();
    
    // Start health monitoring
    this.startHealthMonitoring();
    
    console.log('Unified Gateway Service initialized');
  }
  
  /**
   * Wait for initial tool discovery to complete
   */
  async waitForInitialDiscovery() {
    console.log('Waiting for initial tool discovery...');
    const discoveryPromises = [];
    
    for (const [serverId, server] of this.servers) {
      if (server.needsDiscovery || server.type === 'http-proxy' || server.type === 'sse') {
        console.log(`Discovering tools for ${serverId}...`);
        discoveryPromises.push(
          this.discoverServerTools(serverId).catch(err => {
            console.error(`Failed to discover tools for ${serverId}:`, err.message);
          })
        );
      }
    }
    
    if (discoveryPromises.length > 0) {
      await Promise.all(discoveryPromises);
      console.log(`Initial tool discovery complete for ${discoveryPromises.length} servers`);
    }
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
      } else if (server.type === 'http-proxy') {
        // For HTTP proxy servers, check connection to remote gateway
        try {
          const connection = server.connectionId ? 
            this.bridge.getConnection(server.connectionId) : null;
          
          if (connection && connection.isConnected) {
            status = 'healthy';
            details.checks.connectivity = 'healthy';
          } else {
            // Try to test the connection
            const testUrl = new URL(server.proxyUrl || server.config.url);
            const manifestUrl = `${testUrl.protocol}//${testUrl.host}/.well-known/mcp-manifest.json`;
            const response = await axios.get(manifestUrl, { 
              timeout: 5000,
              headers: server.proxyHeaders || server.config.headers || {}
            });
            responseTime = Date.now() - startTime;
            
            if (response.status === 200) {
              status = responseTime > 1000 ? 'degraded' : 'healthy';
              details.checks.connectivity = 'healthy';
              details.checks.response = status;
            }
          }
        } catch (error) {
          status = 'unhealthy';
          message = `Remote gateway unavailable: ${error.message}`;
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
      
      // Show raw config before substitution
      console.log('Raw configuration (before substitution):', JSON.stringify(this.config, null, 2));
      
      // Process environment variable substitutions
      this.config = this.substituteEnvironmentVariables(this.config);
      
      console.log('Loaded gateway configuration from', this.configPath);
      console.log('Configuration (after substitution):', JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.log('Error loading configuration:', error.message);
      console.log('Using default configuration');
      this.config = {
        gateway: {
          autoStartServers: []
        },
        servers: {}
      };
    }
  }
  
  /**
   * Recursively substitute environment variables in configuration
   */
  substituteEnvironmentVariables(obj) {
    if (typeof obj === 'string') {
      // Replace {{ENV_VAR}} patterns with actual environment variables
      return obj.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
        const value = process.env[varName];
        if (this.debug || !value) {
          console.log(`[ENV-SUBST] {{${varName}}} => ${value || 'NOT FOUND'}`);
        }
        return value || match;
      });
    } else if (Array.isArray(obj)) {
      return obj.map(item => this.substituteEnvironmentVariables(item));
    } else if (obj && typeof obj === 'object') {
      const result = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.substituteEnvironmentVariables(value);
      }
      return result;
    }
    return obj;
  }
  
  /**
   * Load and start stdio servers from configuration
   */
  async loadStdioServers() {
    if (!this.config.servers) return;
    
    for (const [serverId, serverConfig] of Object.entries(this.config.servers)) {
      const serverType = this.determineServerType(serverConfig);
      
      if (serverType === 'stdio' || serverType === 'http-proxy' || serverType === 'sse') {
        // Register server based on actual transport type
        const server = {
          id: serverId,
          name: serverId,
          type: serverType === 'http-proxy' ? 'http-proxy' : (serverType === 'sse' ? 'sse' : 'stdio'),
          transport: serverType,
          config: serverConfig,
          source: 'config'
        };
        
        this.servers.set(serverId, server);
        
        // Start servers based on transport type
        if (serverType === 'http-proxy') {
          // HTTP proxy servers don't need to be "started" - they connect on demand
          console.log(`Registered HTTP proxy server: ${serverId} -> ${serverConfig.url}`);
          // Store the proxy URL and headers for later use (use substituted config)
          server.proxyUrl = this.config.servers[serverId].url;
          server.proxyHeaders = this.config.servers[serverId].headers || {};
          // Mark that this server needs tool discovery
          server.needsDiscovery = true;
        } else if (serverType === 'sse') {
          // SSE servers can be remote gateways or Claude Code clients
          console.log(`Registered SSE server: ${serverId} -> ${serverConfig.url || 'waiting for connection'}`);
          
          if (this.debug) {
            console.log('[GATEWAY-DEBUG] Registering SSE server', {
              serverId,
              url: serverConfig.url,
              hasHeaders: !!serverConfig.headers,
              requiresWindowsSide: serverConfig.requiresWindowsSide,
              capabilities: serverConfig.capabilities
            });
          }
          
          if (serverConfig.url) {
            // Remote SSE gateway - connect via HTTP proxy with SSE support (use substituted config)
            server.proxyUrl = this.config.servers[serverId].url;
            server.proxyHeaders = this.config.servers[serverId].headers || {};
            server.useSSE = true;
            
            if (this.debug) {
              console.log('[GATEWAY-DEBUG] SSE server will use proxy connection', {
                serverId,
                proxyUrl: server.proxyUrl,
                useSSE: true
              });
            }
            
            setTimeout(() => {
              if (this.debug) {
                console.log('[GATEWAY-DEBUG] Starting tool discovery for SSE server', { serverId });
              }
              this.discoverServerTools(serverId);
            }, 1000);
          }
          // For local SSE clients (like Claude Code), they connect to us
        } else {
          // Start all stdio servers (not just auto-start ones)
          // The auto-start configuration is used for restart behavior
          await this.startStdioServer(server);
          // Mark stdio servers for discovery
          server.needsDiscovery = true;
        }
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
        apiKeyStatus = this.environmentManager.getServerStatus(server.id);
        if (apiKeyStatus.hasRequirements) {
          apiKeys = this.environmentManager.getServerEnvironment(server.id);
          // Log warning if keys are missing but don't prevent startup
          if (apiKeyStatus.missingKeys && apiKeyStatus.missingKeys.length > 0) {
            console.log(`Warning: Server ${server.id} is missing API keys: ${apiKeyStatus.missingKeys.join(', ')}`);
          }
        }
      } catch (error) {
        console.log(`Warning: Could not check API keys for ${server.id}:`, error.message);
        // Continue without API keys rather than failing
      }
      
      // If this server requires Windows-side execution and we need to rebuild the command with environment
      if (this.platformManager.platform.isWSL && 
          this.platformManager.requiresWindowsSide(server.config) &&
          config.command === 'powershell.exe') {
        // Rebuild the PowerShell command with the environment variables
        const allEnv = {
          ...config.environment,
          ...apiKeys
        };
        const psCommand = this.platformManager.buildWindowsPowerShellCommand(
          server.config.package || server.config.command,
          server.config.args ? server.config.args.filter(arg => arg !== '-y' && arg !== server.config.package) : [],
          allEnv
        );
        // Update the config with the new command
        config.command = psCommand.command;
        config.args = psCommand.args;
        config.environment = psCommand.environment;
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
      
      // Handle working directory for Windows
      let workingDir = config.workingDir || process.cwd();
      if (process.platform === 'win32' && workingDir.startsWith('\\\\')) {
        // UNC paths not supported by cmd.exe, use temp dir
        workingDir = process.env.TEMP || 'C:\\Windows\\Temp';
        console.log(`Using Windows temp directory: ${workingDir} (UNC paths not supported)`);
      }
      
      const transportConfig = {
        type: 'stdio',
        command: config.command || 'npx',
        args: config.args || ['-y', config.package],
        env: env,
        mounts: mounts,
        workingDir: workingDir
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
      
      // Store whether this server is running on Windows side
      server.requiresWindowsSide = this.platformManager.platform.isWSL && 
                                   this.platformManager.requiresWindowsSide(server.config);
      
      // Update the server in the Map to include the connectionId and flags
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
        
      } else if (server.type === 'http-proxy' || server.type === 'sse' || server.useSSE) {
        // HTTP proxy server or SSE server - create connection on demand
        if (this.debug) {
          console.log('[GATEWAY-DEBUG] Creating proxy connection for tool discovery', {
            serverId,
            serverType: server.type,
            useSSE: server.useSSE,
            proxyUrl: server.proxyUrl
          });
        }
        
        const connection = await this.bridge.createConnection('http-proxy', {
          id: `${serverId}_proxy`,
          url: server.proxyUrl,
          headers: server.proxyHeaders,
          useSSE: server.useSSE || server.type === 'sse'
        });
        
        if (this.debug) {
          console.log('[GATEWAY-DEBUG] Proxy connection created', {
            serverId,
            connectionId: connection.id,
            isConnected: connection.isConnected
          });
        }
        
        response = await this.bridge.sendMessage('http-proxy', connection.id, {
          jsonrpc: '2.0',
          id: `discover_${Date.now()}`,
          method: 'tools/list',
          params: {}
        });
        
        if (this.debug) {
          console.log('[GATEWAY-DEBUG] Tool discovery response received', {
            serverId,
            hasResult: !!response?.result,
            hasError: !!response?.error,
            toolCount: response?.result?.tools?.length || 0,
            error: response?.error
          });
        }
        
        // Store the connection for future use
        server.connectionId = connection.id;
        
      } else if (server.type === 'stdio') {
        // stdio server - through bridge
        response = await this.bridge.sendToServer(serverId, {
          jsonrpc: '2.0',
          id: `discover_${Date.now()}`,
          method: 'tools/list',
          params: {}
        });
      }
      
      console.log(`[GATEWAY-DISCOVER] Response from ${serverId}:`, {
        hasResponse: !!response,
        hasResult: !!response?.result,
        hasTools: !!response?.result?.tools,
        toolCount: response?.result?.tools?.length || 0,
        error: response?.error
      });
      
      if (response?.result?.tools) {
        const serverTools = response.result.tools;
        console.log(`[GATEWAY-DISCOVER] Found ${serverTools.length} tools for ${serverId}:`, serverTools.map(t => t.name));
        
        // Update cache
        await this.toolInventoryCache.updateServerTools(serverId, serverTools);
        
        // Apply tools to internal state
        this.applyServerTools(serverId, serverTools);
        
        // Skip verification for SSE/proxy servers - it can cause tools to be removed
        // due to timing issues with the proxy connection
        if (server.type !== 'sse' && server.type !== 'http-proxy') {
          // Verify tools match expectations
          await this.smartDiscovery.verifyToolsOnStartup(serverId);
        }
      } else {
        console.warn(`[GATEWAY-DISCOVER] No tools found in response from ${serverId}`);
      }
    } catch (error) {
      console.error(`Failed to discover tools for ${serverId}:`, error.message);
    }
  }
  
  /**
   * Detect and resolve tool name conflicts
   * @private
   */
  detectToolConflicts(newTools, serverId) {
    const existingToolNames = new Set();
    for (const [toolKey, tool] of this.tools) {
      if (tool.serverId !== serverId) {
        existingToolNames.add(tool.name);
      }
    }
    
    const conflicts = new Map();
    for (const tool of newTools) {
      if (existingToolNames.has(tool.name)) {
        conflicts.set(tool.name, tool);
      }
    }
    
    return conflicts;
  }

  /**
   * Generate a conflict-free name using descriptive suffix
   * @private
   */
  generateConflictFreeName(toolName, serverId) {
    // Use server-specific suffix for conflicts
    const serverSuffix = serverId.replace(/[^a-z0-9]/g, '_');
    return `${toolName}_${serverSuffix}`;
  }

  /**
   * Get all tool name conflicts
   * @public
   */
  getToolConflicts() {
    const toolNameMap = new Map();
    const conflicts = [];

    // Build map of tool names to servers
    for (const [toolKey, tool] of this.tools) {
      const originalName = tool.originalName || tool.name;
      
      if (!toolNameMap.has(originalName)) {
        toolNameMap.set(originalName, []);
      }
      
      toolNameMap.get(originalName).push({
        serverId: tool.serverId,
        finalName: tool.namespacedName,
        hasConflict: tool.hasConflict
      });
    }

    // Identify conflicts (tools with same name from different servers)
    for (const [toolName, servers] of toolNameMap) {
      if (servers.length > 1) {
        conflicts.push({
          toolName,
          servers: servers.map(s => ({
            serverId: s.serverId,
            resolvedName: s.finalName
          }))
        });
      }
    }

    return conflicts;
  }


  /**
   * Apply server tools to internal state
   * @private
   */
  applyServerTools(serverId, serverTools) {
    console.log(`[GATEWAY-APPLY] Applying ${serverTools.length} tools for ${serverId}`);
    
    // Clear existing tools
    let removedCount = 0;
    for (const [toolKey, tool] of this.tools) {
      if (tool.serverId === serverId) {
        this.tools.delete(toolKey);
        this.toolRouting.delete(tool.namespacedName);
        removedCount++;
      }
    }
    if (removedCount > 0) {
      console.log(`[GATEWAY-APPLY] Removed ${removedCount} existing tools for ${serverId}`);
    }
    
    // Filter tools based on platform compatibility
    let filteredTools = this.compatibilityChecker.filterToolsByPlatform(serverId, serverTools);
    
    // Enhance tool descriptions with platform information
    filteredTools = this.compatibilityChecker.enhanceToolDescriptions(serverId, filteredTools);
    
    // Check server compatibility
    const serverCompat = this.compatibilityChecker.isServerSupported(serverId);
    if (!serverCompat.supported) {
      console.warn(`Server ${serverId} is not supported on platform ${this.compatibilityChecker.currentPlatform}`);
      return;
    }
    
    if (serverCompat.level === 'experimental' || serverCompat.level === 'partial') {
      console.warn(`Server ${serverId} has ${serverCompat.level} support on ${this.compatibilityChecker.currentPlatform}`);
      if (serverCompat.limitations && serverCompat.limitations.length > 0) {
        console.warn(`  Limitations: ${serverCompat.limitations.join(', ')}`);
      }
    }
    
    // Detect conflicts before adding new tools
    const conflicts = this.detectToolConflicts(filteredTools, serverId);
    
    // Add new tools with conflict-aware namespacing
    for (const tool of filteredTools) {
      // Check if this tool name conflicts with existing tools
      const hasConflict = conflicts.has(tool.name);
      
      // Determine final tool name based on conflicts
      let finalName;
      if (hasConflict) {
        // Only namespace if there's a conflict - prepend server name
        const normalizedServerId = serverId.replace(/[^a-z0-9]/g, '_');
        finalName = `${normalizedServerId}__${tool.name}`;
      } else {
        // No conflict - use original tool name
        finalName = tool.name;
      }
      
      const toolInfo = {
        ...tool,
        serverId,
        namespacedName: finalName,
        originalName: tool.name, // Keep original name for server communication
        serverType: this.servers.get(serverId)?.type,
        platformCompatibility: serverCompat.level,
        hasConflict: hasConflict // Track if this tool was renamed due to conflict
      };
      
      const toolKey = `${serverId}:${tool.name}`;
      this.tools.set(toolKey, toolInfo);
      this.toolRouting.set(finalName, serverId);
      
      // Also route by original name for non-conflicting tools
      if (!hasConflict && tool.name !== finalName) {
        this.toolRouting.set(tool.name, serverId);
      }
      
      // Log naming decisions
      if (hasConflict) {
        console.log(`Tool name conflict resolved: ${tool.name} -> ${finalName} (from ${serverId})`);
      } else {
        console.log(`Using simple tool name: ${finalName} (from ${serverId})`);
      }
    }
    
    // Log summary
    if (conflicts.size > 0) {
      console.log(`Resolved ${conflicts.size} tool name conflicts for server ${serverId}`);
    } else {
      console.log(`No tool name conflicts detected for server ${serverId}`);
    }
    
    // Final verification
    let finalCount = 0;
    for (const [toolKey, tool] of this.tools) {
      if (tool.serverId === serverId) {
        finalCount++;
      }
    }
    console.log(`[GATEWAY-APPLY] Final tool count for ${serverId}: ${finalCount}`);
    console.log(`[GATEWAY-APPLY] Total tools in gateway: ${this.tools.size}`);
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
        // Handle both formats: serverId:toolName and mcp__servername__toolname
        if (message.method?.includes(':') || message.method?.startsWith('mcp__')) {
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
    // Get all available tools, prompts, and resources
    const allTools = this.getAllToolsSync();
    const availableTools = this.apiKeyValidator.filterToolsByAvailability(allTools);
    
    // Convert tools to MCP capabilities format
    const toolCapabilities = {};
    for (const tool of availableTools) {
      const toolName = tool.originalName || tool.name;
      toolCapabilities[toolName] = {
        description: tool.description,
        inputSchema: tool.inputSchema
      };
    }
    
    return {
      jsonrpc: '2.0',
      id: message.id,
      result: {
        protocolVersion: message.params?.protocolVersion || '2024-11-05',
        capabilities: {
          tools: toolCapabilities,
          prompts: {},
          resources: {}
        },
        serverInfo: {
          name: 'hub',
          version: '2.0.0'
        }
      }
    };
  }
  
  async handleToolsList(message) {
    if (this.debug) {
      console.log('[GATEWAY-DEBUG] Handling tools/list request', {
        messageId: message.id,
        timestamp: new Date().toISOString(),
        activeServers: this.servers.size,
        serverIds: Array.from(this.servers.keys())
      });
    }
    
    // Get all tools
    const allTools = this.getAllToolsSync();
    
    if (this.debug) {
      console.log('[GATEWAY-DEBUG] Got all tools', {
        totalTools: allTools.length,
        toolNames: allTools.map(t => t.name)
      });
    }
    
    // Filter by API key availability
    const availableTools = this.apiKeyValidator.filterToolsByAvailability(allTools);
    
    if (this.debug) {
      console.log('[GATEWAY-DEBUG] After API key filtering', {
        availableTools: availableTools.length,
        filteredOut: allTools.length - availableTools.length
      });
    }
    
    // Check if using smart discovery for lazy loading
    const smartTools = await this.smartDiscovery.getAvailableTools();
    
    if (this.debug) {
      console.log('[GATEWAY-DEBUG] Smart discovery tools', {
        smartToolsCount: smartTools.length
      });
    }
    
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
          name: tool.originalName || tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema
        }))
      }
    };
  }
  
  async handleToolCall(message) {
    const { name, arguments: args } = message.params;
    
    console.log(`[GATEWAY] Tool call received:`, {
      name,
      hasArgs: !!args,
      messageId: message.id,
      timestamp: new Date().toISOString()
    });
    
    // Check if it's a simple name that exists in our tool routing
    if (!name.includes(':') && !name.startsWith('mcp__')) {
      // Try to find the tool by simple name
      const serverId = this.toolRouting.get(name);
      if (serverId) {
        // Found it - treat it as a valid tool call
        return this.handleNamespacedToolCall(message);
      }
      
      // Not found - return error
      return {
        jsonrpc: '2.0',
        id: message.id,
        error: {
          code: -32602,
          message: `Unknown tool: ${name}`
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
    
    // Enhanced debug logging
    console.log(`[GATEWAY] Processing tool call:`, {
      toolName,
      method: message.method,
      hasArgs: !!args,
      routingMapSize: this.toolRouting.size,
      messageId: message.id
    });
    
    // Log available tools for debugging
    if (toolName.includes('screenshot') || toolName.includes('Screenshot')) {
      console.log(`[GATEWAY] Screenshot tool request - Available tools:`, 
        Array.from(this.toolRouting.keys()).filter(k => k.toLowerCase().includes('screenshot'))
      );
    }
    
    // Get server info - check both the final name and original names
    let serverId = this.toolRouting.get(toolName);
    console.log(`[Gateway] Direct lookup for '${toolName}' returned serverId: ${serverId}`);
    
    // If not found by final name, check if it's a conflict-resolved name
    if (!serverId) {
      console.log(`[Gateway] Checking tools map for matching namespacedName...`);
      // Look for tools that might have been renamed due to conflicts
      for (const [toolKey, tool] of this.tools) {
        if (tool.namespacedName === toolName) {
          serverId = tool.serverId;
          console.log(`[Gateway] Found serverId ${serverId} by matching namespacedName`);
          break;
        }
      }
    }
    
    if (!serverId) {
      console.log(`[Gateway] ERROR: No serverId found for tool: ${toolName}`);
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
    
    // Find the tool by looking for one with matching namespacedName or originalName
    let tool = null;
    for (const [key, t] of this.tools) {
      if ((t.namespacedName === toolName || t.originalName === toolName) && t.serverId === serverId) {
        tool = t;
        console.log(`[Gateway] Found tool with key ${key} matching name ${toolName}`);
        break;
      }
    }
    
    if (!server || !tool) {
      console.log(`[Gateway] ERROR: server=${!!server}, tool=${!!tool} for ${toolName}`);
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
        
      } else if (server.type === 'http-proxy' || server.transport === 'http-proxy') {
        // HTTP proxy - forward to remote gateway
        if (!server.connectionId) {
          // Create connection on demand
          const connection = await this.bridge.createConnection('http-proxy', {
            id: serverId,
            url: server.config.url,
            headers: server.config.headers || {}
          });
          server.connectionId = connection.id;
        }
        
        console.log(`[GATEWAY] Forwarding tool call to HTTP proxy:`, {
          serverId,
          connectionId: server.connectionId,
          tool: serverMessage.params.name,
          url: server.config?.url || 'unknown'
        });
        
        response = await this.bridge.sendMessage('http-proxy', server.connectionId, serverMessage);
        
        console.log(`[GATEWAY] HTTP proxy response:`, {
          hasResult: !!response?.result,
          hasError: !!response?.error,
          error: response?.error
        });
        
      } else if (server.type === 'stdio') {
        // stdio server - through bridge
        console.log(`[GATEWAY] Forwarding tool call to stdio server:`, {
          serverId,
          tool: serverMessage.params.name
        });
        
        response = await this.bridge.sendToServer(serverId, serverMessage);
        
        console.log(`[GATEWAY] Stdio server response:`, {
          hasResult: !!response?.result,
          hasError: !!response?.error
        });
        
      } else if (server.type === 'sse') {
        // SSE server - treat like http-proxy since it's a remote gateway
        if (!server.connectionId) {
          throw new Error(`No connection ID for SSE server: ${serverId}`);
        }
        
        console.log(`[GATEWAY] Forwarding tool call to SSE server:`, {
          serverId,
          connectionId: server.connectionId,
          tool: serverMessage.params.name,
          proxyUrl: server.proxyUrl || 'not set'
        });
        
        response = await this.bridge.sendMessage('http-proxy', server.connectionId, serverMessage);
        
        console.log(`[GATEWAY] SSE server response:`, {
          hasResult: !!response?.result,
          hasError: !!response?.error,
          error: response?.error
        });
      }
      
      // Translate paths in response
      if (response && response.result) {
        // Check if this server is running on Windows side
        const isWindowsSide = server.requiresWindowsSide || 
                            (server.platformConfig && server.platformConfig.requiresWindowsSide);
        
        response.result = this.pathTranslator.translateToolResponse(
          tool.originalName,
          response.result,
          isWindowsSide
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
      await this.loadStdioServers();
      
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
    } else if (server.type === 'http-proxy' || server.type === 'sse') {
      // HTTP proxy or SSE server - use existing connection
      if (!server.connectionId) {
        throw new Error(`No connection ID for server: ${serverId}`);
      }
      
      response = await this.bridge.sendMessage('http-proxy', server.connectionId, {
        jsonrpc: '2.0',
        id: `list_tools_${Date.now()}`,
        method: 'tools/list',
        params: {}
      });
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
    
    // For HTTP proxy servers, they're always ready
    if (server.type === 'http-proxy') {
      return true;
    }
    
    // For SSE servers (proxy to another gateway), they're always ready
    if (server.type === 'sse') {
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
  /**
   * Get the SSE transport instance
   * @returns {SSETransport} The SSE transport
   */
  getSSETransport() {
    return this.bridge.transports.get('sse');
  }

  /**
   * Set up SSE transport with Express app
   * @param {Express.Application} app - Express app instance
   */
  setupSSEWithApp(app) {
    // Register SSE transport with the provided Express app
    const sseTransport = new SSETransport({ 
      app: app,
      port: process.env.GATEWAY_PORT || 8090 
    });
    
    this.bridge.registerTransport('sse', sseTransport);
    
    // Set up message handler
    sseTransport.onMessage('default', async (message) => {
      return await this.handleMessage(message);
    });
    
    console.log('SSE transport registered with existing Express app');
    return sseTransport;
  }

  /**
   * Handle SSE message through bridge service
   * @param {Object} message - Incoming message
   * @returns {Promise<Object>} Response
   */
  async handleSSEMessage(message) {
    // Route through standard message handling
    return await this.handleMessage(message);
  }
}

module.exports = UnifiedGatewayService;