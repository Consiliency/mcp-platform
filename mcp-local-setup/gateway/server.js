const express = require('express');
const cors = require('cors');
const { EventEmitter } = require('events');
const path = require('path');
const fs = require('fs');

// Use unified gateway service that handles both HTTP and stdio servers
const GatewayService = require('./gateway-service-unified');
const ManifestGenerator = require('./manifest-generator');

const app = express();
const PORT = process.env.GATEWAY_PORT || 8090;

// SSE clients tracking
const sseClients = new Map();
const eventEmitter = new EventEmitter();

// Initialize services
const gatewayService = new GatewayService();
const manifestGenerator = new ManifestGenerator(gatewayService);

// Middleware
app.use(cors());
app.use(express.json());

// Serve dashboard static files
const dashboardPath = process.env.GATEWAY_MODE === 'hybrid' || !process.env.DOCKER_CONTAINER
  ? path.join(__dirname, '..', 'dashboard')  // Native mode: ../dashboard
  : '/app/dashboard';                         // Docker mode: /app/dashboard

if (fs.existsSync(dashboardPath)) {
  app.use('/dashboard', express.static(dashboardPath));
  // Redirect root to dashboard
  app.get('/', (req, res) => {
    res.redirect('/dashboard/');
  });
  console.log('Dashboard served from:', dashboardPath);
} else {
  console.log('Dashboard path not found:', dashboardPath);
}

// API key validation middleware
const validateApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  const expectedApiKey = process.env.GATEWAY_API_KEY || 'mcp-gateway-default-key';
  
  if (apiKey !== expectedApiKey) {
    return res.status(401).json({
      error: {
        code: -32001,
        message: 'Invalid or missing API key'
      }
    });
  }
  
  next();
};

// Main MCP endpoint with SSE support
app.get('/mcp', validateApiKey, (req, res) => {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  
  // Generate client ID
  const clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Create SSE client
  const client = {
    id: clientId,
    res,
    lastActivity: Date.now()
  };
  
  sseClients.set(clientId, client);
  console.log(`SSE client connected: ${clientId}`);
  
  // Send initial connection event
  res.write(`event: connected\ndata: ${JSON.stringify({ clientId })}\n\n`);
  
  // Send current tools manifest
  const manifest = manifestGenerator.generateManifest();
  res.write(`event: tools\ndata: ${JSON.stringify(manifest)}\n\n`);
  
  // Handle client disconnect
  req.on('close', () => {
    sseClients.delete(clientId);
    console.log(`SSE client disconnected: ${clientId}`);
  });
  
  // Keep connection alive
  const keepAlive = setInterval(() => {
    res.write(':keepalive\n\n');
  }, 30000);
  
  req.on('close', () => {
    clearInterval(keepAlive);
  });
});

// JSON-RPC endpoint for MCP messages
app.post('/mcp', validateApiKey, async (req, res) => {
  const message = req.body;
  
  try {
    // Validate JSON-RPC message
    if (!message.jsonrpc || message.jsonrpc !== '2.0') {
      return res.status(400).json({
        jsonrpc: '2.0',
        id: message.id || null,
        error: {
          code: -32600,
          message: 'Invalid Request: Missing or invalid jsonrpc version'
        }
      });
    }
    
    // Process the message through gateway
    const response = await gatewayService.handleMessage(message);
    
    res.json(response);
    
  } catch (error) {
    console.error('Gateway error:', error);
    res.status(500).json({
      jsonrpc: '2.0',
      id: message.id || null,
      error: {
        code: -32603,
        message: `Internal error: ${error.message}`
      }
    });
  }
});

// Tool discovery endpoint
app.get('/api/gateway/tools', validateApiKey, async (req, res) => {
  try {
    const tools = await gatewayService.getAllTools();
    res.json({
      success: true,
      tools: tools.map(tool => ({
        name: tool.namespacedName, // Use namespacedName instead of name
        description: tool.description,
        inputSchema: tool.inputSchema
      })),
      count: tools.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Server status endpoint
app.get('/api/gateway/servers', validateApiKey, async (req, res) => {
  try {
    const servers = await gatewayService.getServerStatus();
    res.json({
      success: true,
      servers,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// MCP manifest endpoint
app.get('/.well-known/mcp-manifest.json', (req, res) => {
  const manifest = manifestGenerator.generateManifest();
  res.json(manifest);
});

// Health check - enhanced with service health
app.get('/health', (req, res) => {
  const health = gatewayService.getSystemHealth();
  res.json(health);
});

// Health check for individual services
app.get('/health/services', (req, res) => {
  const servicesHealth = gatewayService.getServicesHealth();
  res.json(servicesHealth);
});

// Configuration management endpoints
app.get('/api/gateway/config', validateApiKey, async (req, res) => {
  try {
    const config = await gatewayService.getConfiguration();
    res.json({
      success: true,
      config,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.put('/api/gateway/config', validateApiKey, async (req, res) => {
  try {
    const updatedConfig = await gatewayService.updateConfiguration(req.body);
    res.json({
      success: true,
      config: updatedConfig,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Catalog endpoint
app.get('/api/gateway/catalog', validateApiKey, async (req, res) => {
  try {
    const catalog = await gatewayService.getServerCatalog();
    res.json({
      success: true,
      catalog,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Add server endpoint
app.post('/api/gateway/servers', validateApiKey, async (req, res) => {
  try {
    const { serverId, config } = req.body;
    const result = await gatewayService.addServer(serverId, config);
    res.json({
      success: true,
      result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Remove server endpoint
app.delete('/api/gateway/servers/:serverId', validateApiKey, async (req, res) => {
  try {
    const { serverId } = req.params;
    const result = await gatewayService.removeServer(serverId);
    res.json({
      success: true,
      result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Start server endpoint
app.post('/api/gateway/servers/:serverId/start', validateApiKey, async (req, res) => {
  try {
    const { serverId } = req.params;
    
    // Get server config
    const serverConfig = gatewayService.config.servers[serverId];
    if (!serverConfig) {
      return res.status(404).json({
        success: false,
        error: `Server ${serverId} not found in configuration`
      });
    }
    
    // Create server object
    const server = {
      id: serverId,
      name: serverId,
      type: 'stdio',
      transport: serverConfig.transport || 'stdio',
      config: serverConfig,
      status: 'stopped',
      source: 'config'
    };
    
    // Start the server
    if (server.transport === 'stdio') {
      await gatewayService.startStdioServer(server);
    } else {
      return res.status(400).json({
        success: false,
        error: `Unsupported transport type: ${server.transport}`
      });
    }
    
    res.json({
      success: true,
      message: `Server ${serverId} started successfully`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Stop server endpoint
app.post('/api/gateway/servers/:serverId/stop', validateApiKey, async (req, res) => {
  try {
    const { serverId } = req.params;
    await gatewayService.stopServer(serverId);
    res.json({
      success: true,
      message: `Server ${serverId} stopped successfully`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Restart gateway endpoint
app.post('/api/gateway/restart', validateApiKey, async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'Gateway restart initiated',
      timestamp: new Date().toISOString()
    });
    
    // Restart after sending response
    setTimeout(async () => {
      await gatewayService.restart();
    }, 100);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Dynamic catalog management endpoints
app.post('/api/gateway/catalog', validateApiKey, async (req, res) => {
  try {
    const { server } = req.body;
    const result = await gatewayService.addToCatalog(server);
    res.json({
      success: true,
      result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.put('/api/gateway/catalog/:id', validateApiKey, async (req, res) => {
  try {
    const { id } = req.params;
    const { server } = req.body;
    const result = await gatewayService.updateCatalogEntry(id, server);
    res.json({
      success: true,
      result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.delete('/api/gateway/catalog/:id', validateApiKey, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await gatewayService.removeFromCatalog(id);
    res.json({
      success: true,
      result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Server discovery endpoint
app.post('/api/gateway/catalog/discover', validateApiKey, async (req, res) => {
  try {
    const { url } = req.body;
    const serverInfo = await gatewayService.discoverServer(url);
    res.json({
      success: true,
      server: serverInfo,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Compatibility endpoints
app.get('/api/gateway/compatibility/:serverId', validateApiKey, async (req, res) => {
  try {
    const { serverId } = req.params;
    const { enhanced } = req.query;
    
    let report;
    if (enhanced === 'true') {
      // Include runtime capability detection
      report = await gatewayService.compatibilityChecker.generateEnhancedCompatibilityReport(serverId);
    } else {
      // Static compatibility only
      report = gatewayService.compatibilityChecker.generateCompatibilityReport(serverId);
    }
    
    res.json({
      success: true,
      compatibility: report,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/gateway/compatibility', validateApiKey, async (req, res) => {
  try {
    const platform = gatewayService.compatibilityChecker.currentPlatform;
    const servers = [];
    
    // Get compatibility for all known servers
    for (const [serverId] of gatewayService.servers) {
      const report = gatewayService.compatibilityChecker.generateCompatibilityReport(serverId);
      servers.push(report);
    }
    
    res.json({
      success: true,
      platform,
      servers,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Runtime capabilities endpoint
app.get('/api/gateway/capabilities', validateApiKey, async (req, res) => {
  try {
    const capabilities = await gatewayService.compatibilityChecker.getAllRuntimeCapabilities();
    
    res.json({
      success: true,
      platform: gatewayService.compatibilityChecker.currentPlatform,
      capabilities,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// API Key management endpoints
app.get('/api/gateway/apikeys', validateApiKey, async (req, res) => {
  try {
    const environmentManager = gatewayService.environmentManager;
    const servers = environmentManager.getAllServersStatus();
    const stats = {
      totalServers: servers.length,
      configuredServers: servers.filter(s => s.status.missing.length === 0).length,
      totalVariables: servers.reduce((sum, s) => sum + Object.keys(s.status.requirements).length, 0),
      configuredVariables: servers.reduce((sum, s) => sum + s.status.configured.length, 0)
    };
    
    res.json({
      success: true,
      servers,
      stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get API key requirements for a specific server
app.get('/api/gateway/apikeys/:serverId', validateApiKey, async (req, res) => {
  try {
    const { serverId } = req.params;
    const environmentManager = gatewayService.environmentManager;
    const status = environmentManager.getServerStatus(serverId);
    
    res.json({
      success: true,
      serverId,
      status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Save API keys for a server
app.post('/api/gateway/apikeys/:serverId', validateApiKey, async (req, res) => {
  try {
    const { serverId } = req.params;
    const { keys } = req.body;
    
    if (!keys || typeof keys !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Invalid keys object'
      });
    }
    
    const environmentManager = gatewayService.environmentManager;
    const saved = await environmentManager.saveServerVariables(serverId, keys);
    
    res.json({
      success: saved,
      message: saved ? 'API keys saved successfully' : 'Failed to save API keys',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Check API key requirements for a new server config
app.post('/api/gateway/apikeys/check', validateApiKey, async (req, res) => {
  try {
    const { serverConfig } = req.body;
    
    if (!serverConfig) {
      return res.status(400).json({
        success: false,
        error: 'Server configuration required'
      });
    }
    
    const environmentManager = gatewayService.environmentManager;
    // Check if this server has environment requirements
    const requirements = {
      hasRequirements: false,
      requirements: {}
    };
    
    if (serverConfig.config && serverConfig.config.environment) {
      const envVars = serverConfig.config.environment;
      for (const [key, value] of Object.entries(envVars)) {
        if (value === '') {
          requirements.hasRequirements = true;
          requirements.requirements[key] = {
            type: environmentManager.getVariableType(key),
            required: true,
            description: environmentManager.getVariableDescription(serverConfig.id, key)
          };
        }
      }
    }
    
    res.json({
      success: true,
      requirements,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Update server auto-start configuration
app.put('/api/gateway/servers/:serverId/autostart', validateApiKey, async (req, res) => {
  try {
    const { serverId } = req.params;
    const { enabled } = req.body;
    
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'enabled parameter must be a boolean'
      });
    }
    
    const result = await gatewayService.updateAutoStart(serverId, enabled);
    
    res.json({
      success: true,
      serverId,
      autostart: enabled,
      message: enabled ? `${serverId} will start automatically` : `${serverId} removed from auto-start`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Gateway events to SSE clients
gatewayService.on('tools:updated', (tools) => {
  const manifest = manifestGenerator.generateManifest();
  broadcastToSSEClients('tools', manifest);
});

gatewayService.on('server:status', (status) => {
  broadcastToSSEClients('server-status', status);
});

// Broadcast to all SSE clients
function broadcastToSSEClients(event, data) {
  for (const [clientId, client] of sseClients) {
    try {
      client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch (error) {
      console.error(`Failed to send to client ${clientId}:`, error);
      sseClients.delete(clientId);
    }
  }
}

// Start server
async function start() {
  try {
    // Initialize gateway service
    await gatewayService.initialize();
    
    // Start Express server
    const HOST = process.env.GATEWAY_HOST || '0.0.0.0';  // Bind to all interfaces
    app.listen(PORT, HOST, () => {
      console.log(`MCP Gateway server running on ${HOST}:${PORT}`);
      console.log(`SSE endpoint: http://localhost:${PORT}/mcp`);
      console.log(`Tools API: http://localhost:${PORT}/api/gateway/tools`);
      console.log(`Manifest: http://localhost:${PORT}/.well-known/mcp-manifest.json`);
    });
    
  } catch (error) {
    console.error('Failed to start gateway server:', error);
    process.exit(1);
  }
}

// Handle shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down gateway server...');
  
  // Close all SSE connections
  for (const [clientId, client] of sseClients) {
    client.res.end();
  }
  sseClients.clear();
  
  // Shutdown gateway service
  await gatewayService.shutdown();
  
  process.exit(0);
});

// Start the server
start();