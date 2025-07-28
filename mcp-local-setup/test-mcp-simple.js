#!/usr/bin/env node
const axios = require('axios');

async function testGateway() {
  const gatewayUrl = 'http://localhost:8090';
  const apiKey = 'mcp-gateway-default-key';
  console.log('Testing MCP Gateway at', gatewayUrl);
  console.log('='.repeat(50));
  
  try {
    // 1. Check if gateway is running
    console.log('\n1. Checking gateway health...');
    const statusResponse = await axios.get(`${gatewayUrl}/health`);
    console.log('✓ Gateway is running');
    console.log('Status:', statusResponse.data.status);
    
    // 2. Send initialize request
    console.log('\n2. Sending initialize request...');
    const initResponse = await axios.post(`${gatewayUrl}/mcp`, {
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        protocolVersion: '0.1.0',
        capabilities: {
          tools: {}
        },
        clientInfo: {
          name: 'Test Client',
          version: '1.0.0'
        }
      },
      id: 1
    }, {
      headers: {
        'X-API-Key': apiKey
      }
    });
    
    console.log('✓ Initialize response received');
    console.log('Server:', initResponse.data.result?.serverInfo?.name);
    console.log('Version:', initResponse.data.result?.serverInfo?.version);
    
    // 3. Request tools list
    console.log('\n3. Requesting tools list...');
    const toolsResponse = await axios.post(`${gatewayUrl}/mcp`, {
      jsonrpc: '2.0',
      method: 'tools/list',
      params: {},
      id: 2
    }, {
      headers: {
        'X-API-Key': apiKey
      }
    });
    
    const tools = toolsResponse.data.result?.tools || [];
    console.log(`✓ Received ${tools.length} tools`);
    
    // Group tools by server
    const toolsByServer = {};
    tools.forEach(tool => {
      const parts = tool.name.split('__');
      const server = parts.length >= 2 ? parts[1] : 'unknown';
      if (!toolsByServer[server]) {
        toolsByServer[server] = [];
      }
      toolsByServer[server].push(tool.name);
    });
    
    console.log('\nTools by server:');
    Object.entries(toolsByServer).forEach(([server, serverTools]) => {
      console.log(`\n  ${server} (${serverTools.length} tools):`);
      serverTools.forEach(tool => {
        console.log(`    - ${tool}`);
      });
    });
    
    // 4. Check manifest
    console.log('\n4. Checking manifest...');
    const manifestResponse = await axios.get(`${gatewayUrl}/.well-known/mcp-manifest.json`);
    console.log('✓ Manifest accessible');
    console.log('Capabilities:', Object.keys(manifestResponse.data.capabilities || {}).join(', '));
    
  } catch (error) {
    console.error('\n✗ Error:', error.message);
    if (error.response?.data) {
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testGateway();