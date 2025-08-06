#!/usr/bin/env node

const express = require('express');
const app = express();
app.use(express.json());

const PORT = 8092;
let sseClients = new Map();
let sessionCounter = 0;

// SSE endpoint
app.get('/mcp', (req, res) => {
  console.log('SSE connection request:', {
    headers: req.headers
  });
  
  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  
  const clientId = `sse_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const sessionId = `session_${++sessionCounter}`;
  
  // Send endpoint event
  const endpointUrl = `http://127.0.0.1:${PORT}/mcp`;
  res.write(`event: endpoint\ndata: ${endpointUrl}\n\n`);
  console.log(`Sent endpoint event: ${endpointUrl}`);
  
  // Send session event
  res.write(`event: session\ndata: ${sessionId}\n\n`);
  console.log(`Sent session event: ${sessionId}`);
  
  // Store client
  sseClients.set(clientId, {
    res,
    sessionId,
    initialized: false
  });
  
  console.log(`SSE client connected: ${clientId}`);
  
  // Handle disconnect
  req.on('close', () => {
    console.log(`SSE client disconnected: ${clientId}`);
    sseClients.delete(clientId);
  });
});

// POST endpoint for messages
app.post('/mcp', async (req, res) => {
  const message = req.body;
  console.log('Received POST message:', {
    method: message.method,
    id: message.id,
    headers: req.headers
  });
  
  // Find active SSE client
  let client = null;
  for (const [id, c] of sseClients.entries()) {
    if (!c.res.finished) {
      client = c;
      break;
    }
  }
  
  if (!client) {
    console.error('No active SSE client found');
    res.status(500).json({ error: 'No active SSE connection' });
    return;
  }
  
  // Handle different methods
  let response;
  
  if (message.method === 'initialize') {
    response = {
      jsonrpc: '2.0',
      id: message.id,
      result: {
        protocolVersion: message.params?.protocolVersion || '2024-11-05',
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name: 'test-sse-server',
          version: '1.0.0'
        }
      }
    };
    client.initialized = true;
  } else if (message.method === 'tools/list') {
    response = {
      jsonrpc: '2.0',
      id: message.id,
      result: {
        tools: [
          {
            name: 'test_tool',
            description: 'A test tool',
            inputSchema: {
              type: 'object',
              properties: {}
            }
          }
        ]
      }
    };
  } else {
    response = {
      jsonrpc: '2.0',
      id: message.id,
      error: {
        code: -32601,
        message: 'Method not found'
      }
    };
  }
  
  // Always send response via SSE when there's an active SSE client
  // This is what Claude Code expects
  console.log('Sending response via SSE (active client exists)');
  const responseStr = JSON.stringify(response);
  client.res.write(`data: ${responseStr}\n\n`);
  
  // Return 204 No Content for the POST request
  res.status(204).end();
});

// CORS
app.options('/mcp', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Accept');
  res.send();
});

app.listen(PORT, () => {
  console.log(`\nMinimal SSE test server running on http://127.0.0.1:${PORT}/mcp`);
  console.log('This server sends responses via SSE when Accept: text/event-stream is present');
});