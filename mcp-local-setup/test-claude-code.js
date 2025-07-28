#!/usr/bin/env node
const axios = require('axios');

/**
 * Test what Claude Code sees when it connects to the gateway
 */
async function testClaudeCodeConnection() {
  const gatewayUrl = 'http://127.0.0.1:8090'; // Using exact URL from Claude Code config
  const apiKey = 'mcp-gateway-default-key';
  
  console.log('Testing Claude Code connection to MCP Gateway');
  console.log('='.repeat(50));
  console.log('Using URL from Claude Code config:', gatewayUrl + '/mcp');
  
  try {
    // Test 1: Check SSE endpoint (what Claude Code uses)
    console.log('\n1. Testing SSE endpoint...');
    const sseTest = await axios.get(`${gatewayUrl}/mcp`, {
      headers: {
        'Accept': 'text/event-stream',
        'X-API-Key': apiKey
      },
      timeout: 2000,
      validateStatus: () => true // Accept any status
    });
    
    console.log('SSE endpoint status:', sseTest.status);
    console.log('SSE headers:', sseTest.headers);
    
    // Test 2: Get available tools via API
    console.log('\n2. Getting tools via API...');
    const toolsApiResponse = await axios.get(`${gatewayUrl}/api/gateway/tools`, {
      headers: {
        'X-API-Key': apiKey
      }
    });
    
    console.log(`Total tools available: ${toolsApiResponse.data.tools?.length || 0}`);
    
    // Test 3: Check manifest
    console.log('\n3. Checking manifest...');
    const manifestResponse = await axios.get(`${gatewayUrl}/.well-known/mcp-manifest.json`);
    console.log('Manifest capabilities:', manifestResponse.data.capabilities);
    
    // Test 4: Check servers status
    console.log('\n4. Getting servers status...');
    const serversResponse = await axios.get(`${gatewayUrl}/api/gateway/servers`, {
      headers: {
        'X-API-Key': apiKey
      }
    });
    
    console.log('\nConnected servers:');
    serversResponse.data.servers.forEach(server => {
      console.log(`  - ${server.id}: ${server.status} (${server.transport})`);
    });
    
  } catch (error) {
    console.error('\nError:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

testClaudeCodeConnection();