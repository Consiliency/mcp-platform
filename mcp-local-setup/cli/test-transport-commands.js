#!/usr/bin/env node

/**
 * Test script for transport CLI commands
 * This creates mock API endpoints to test the CLI without a running backend
 */

const express = require('express');
const chalk = require('chalk');

const app = express();
app.use(express.json());

// Mock data
const mockTransports = {
  transports: [
    {
      id: 'stdio',
      type: 'stdio',
      description: 'Standard input/output transport',
      status: 'available',
      features: {
        bidirectional: true,
        streaming: true,
        multiplexing: false
      }
    },
    {
      id: 'http',
      type: 'http',
      description: 'HTTP/REST transport',
      status: 'available',
      features: {
        bidirectional: false,
        streaming: false,
        multiplexing: true
      }
    },
    {
      id: 'websocket',
      type: 'ws',
      description: 'WebSocket transport',
      status: 'available',
      features: {
        bidirectional: true,
        streaming: true,
        multiplexing: true
      }
    }
  ]
};

const mockServers = {
  servers: [
    {
      id: 'filesystem-server',
      name: 'Filesystem MCP Server',
      transport: 'stdio',
      status: 'running',
      uptime: '2h 15m',
      connections: 3
    },
    {
      id: 'github-server',
      name: 'GitHub MCP Server',
      transport: 'http',
      status: 'running',
      uptime: '1d 5h',
      connections: 12
    },
    {
      id: 'slack-server',
      name: 'Slack MCP Server',
      transport: 'ws',
      status: 'stopped',
      uptime: null,
      connections: 0
    }
  ],
  summary: {
    total: 3,
    running: 2,
    stopped: 1
  }
};

const mockTransportStatus = {
  connections: [
    {
      serverId: 'filesystem-server',
      transport: 'stdio',
      status: 'connected',
      connectedAt: new Date().toISOString(),
      stats: {
        messageCount: 1523,
        errorCount: 2
      }
    },
    {
      serverId: 'github-server',
      transport: 'http',
      status: 'connected',
      connectedAt: new Date(Date.now() - 3600000).toISOString(),
      stats: {
        messageCount: 8934,
        errorCount: 15
      }
    }
  ],
  summary: {
    total: 2,
    active: 2,
    inactive: 0
  }
};

// Registry endpoints
app.get('/api/transports', (req, res) => {
  res.json(mockTransports);
});

// API Gateway endpoints
app.get('/api/transports/status', (req, res) => {
  res.json(mockTransportStatus);
});

app.post('/api/transports/test', (req, res) => {
  const { transport } = req.body;
  res.json({
    success: true,
    connectionTime: Math.floor(Math.random() * 100) + 50,
    roundTripTime: Math.floor(Math.random() * 50) + 10,
    details: {
      protocol: transport,
      version: '1.0',
      capabilities: ['tools', 'prompts', 'resources']
    }
  });
});

app.get('/api/transports/metrics', (req, res) => {
  res.json({
    overall: {
      messagesSent: 12453,
      messagesReceived: 12398,
      avgLatency: 45,
      errorRate: 0.2
    },
    byTransport: {
      stdio: {
        messageCount: 1523,
        avgLatency: 12,
        p95Latency: 25,
        errorCount: 2
      },
      http: {
        messageCount: 8934,
        avgLatency: 67,
        p95Latency: 125,
        errorCount: 15
      },
      ws: {
        messageCount: 1996,
        avgLatency: 23,
        p95Latency: 45,
        errorCount: 5
      }
    }
  });
});

app.get('/api/servers', (req, res) => {
  res.json(mockServers);
});

app.get('/api/servers/:serverId', (req, res) => {
  const server = mockServers.servers.find(s => s.id === req.params.serverId);
  if (!server) {
    return res.status(404).json({ error: 'Server not found' });
  }
  
  res.json({
    ...server,
    version: '1.0.0',
    startedAt: new Date(Date.now() - 7200000).toISOString(),
    transportConfig: {
      type: server.transport,
      encoding: 'utf8',
      bufferSize: 65536
    },
    connectionInfo: {
      command: 'mcp-server',
      args: ['--mode', server.transport]
    },
    stats: {
      totalConnections: Math.floor(Math.random() * 100),
      activeConnections: server.connections,
      messagesProcessed: Math.floor(Math.random() * 10000),
      errors: Math.floor(Math.random() * 10)
    },
    capabilities: ['tools', 'prompts', 'resources', 'completion']
  });
});

app.post('/api/servers/start', (req, res) => {
  const { serverId, transport } = req.body;
  res.json({
    success: true,
    connectionInfo: {
      url: `http://localhost:3000/mcp/${serverId}`,
      wsUrl: `ws://localhost:3001/mcp/${serverId}`,
      command: `mcp-server-${serverId}`,
      args: ['--transport', transport]
    }
  });
});

app.post('/api/servers/:serverId/stop', (req, res) => {
  res.json({ success: true });
});

app.post('/api/servers/:serverId/start', (req, res) => {
  res.json({
    success: true,
    connectionInfo: {
      url: 'http://localhost:3000/mcp/server'
    }
  });
});

app.get('/api/servers/:serverId/logs', (req, res) => {
  const logs = [];
  for (let i = 0; i < 10; i++) {
    logs.push({
      timestamp: new Date(Date.now() - i * 1000).toISOString(),
      level: ['info', 'debug', 'warn', 'error'][Math.floor(Math.random() * 4)],
      message: `Sample log message ${i + 1}`
    });
  }
  res.json({ logs });
});

app.get('/api/transports/:transport/config', (req, res) => {
  const configs = {
    http: { port: 3000, timeout: 30000, enableCors: false },
    ws: { port: 3001, pingInterval: 30000, enableCompression: true },
    stdio: { encoding: 'utf8', enableBuffer: true }
  };
  res.json({ config: configs[req.params.transport] || {} });
});

app.put('/api/transports/:transport/config', (req, res) => {
  res.json({ success: true, restartRequired: true });
});

app.post('/api/servers/:serverId/convert-transport', (req, res) => {
  res.json({
    success: true,
    reconnectionRequired: true,
    newConfig: {
      transport: req.body.newTransport,
      url: `http://localhost:3000/mcp/${req.params.serverId}`
    }
  });
});

// Start mock servers
const apiPort = 8080;
const registryPort = 3002;

const apiServer = app.listen(apiPort, () => {
  console.log(chalk.green(`✓ Mock API Gateway running on port ${apiPort}`));
});

const registryServer = app.listen(registryPort, () => {
  console.log(chalk.green(`✓ Mock Registry running on port ${registryPort}`));
});

console.log(chalk.blue('\nTest the transport commands:'));
console.log('  mcp transport list');
console.log('  mcp transport status');
console.log('  mcp transport test stdio');
console.log('  mcp transport metrics');
console.log('  mcp server list');
console.log('  mcp server info filesystem-server');
console.log('  mcp server start test-server --transport http');
console.log('\nPress Ctrl+C to stop the mock servers');

// Graceful shutdown
process.on('SIGINT', () => {
  console.log(chalk.yellow('\nShutting down mock servers...'));
  apiServer.close();
  registryServer.close();
  process.exit(0);
});