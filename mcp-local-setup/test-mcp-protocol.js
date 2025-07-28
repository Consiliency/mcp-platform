#!/usr/bin/env node
/**
 * Test script to verify MCP Gateway follows the protocol correctly
 */

const http = require('http');

const API_KEY = process.env.MCP_GATEWAY_API_KEY || 'mcp-gateway-default-key';
const GATEWAY_URL = 'http://localhost:8090/mcp';

// Helper to make JSON-RPC requests
async function makeRequest(method, params = {}, id = 1) {
  const url = new URL(GATEWAY_URL);
  
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id,
    method,
    params
  });

  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'X-API-Key': API_KEY
      }
    }, (res) => {
      let data = '';
      
      res.on('data', chunk => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve(response);
        } catch (e) {
          reject(new Error(`Failed to parse response: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function testMcpProtocol() {
  console.log('Testing MCP Gateway Protocol Compliance...\n');

  try {
    // Step 1: Initialize
    console.log('1. Testing initialize...');
    const initResponse = await makeRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {}
      },
      clientInfo: {
        name: 'test-client',
        version: '1.0.0'
      }
    });
    
    console.log('Initialize response:', JSON.stringify(initResponse, null, 2));
    
    if (!initResponse.result?.protocolVersion) {
      throw new Error('Invalid initialize response');
    }
    console.log('✓ Initialize successful\n');

    // Step 2: Send initialized notification (no response expected)
    console.log('2. Sending initialized notification...');
    // For notifications, we don't expect a response
    const notificationBody = JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized'
    });
    
    // Send notification without waiting for response
    const url = new URL(GATEWAY_URL);
    const notificationReq = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(notificationBody),
        'X-API-Key': API_KEY
      }
    });
    notificationReq.write(notificationBody);
    notificationReq.end();
    
    // Wait a bit for notification to be processed
    await new Promise(resolve => setTimeout(resolve, 100));
    console.log('✓ Initialized notification sent\n');

    // Step 3: List tools
    console.log('3. Testing tools/list...');
    const toolsResponse = await makeRequest('tools/list', {}, 2);
    
    console.log('Tools response:', JSON.stringify(toolsResponse, null, 2));
    
    if (!toolsResponse.result?.tools) {
      throw new Error('Invalid tools/list response');
    }
    
    const toolCount = toolsResponse.result.tools.length;
    console.log(`✓ Found ${toolCount} tools`);
    
    // Display first few tools
    if (toolCount > 0) {
      console.log('\nFirst few tools:');
      toolsResponse.result.tools.slice(0, 3).forEach(tool => {
        console.log(`  - ${tool.name}: ${tool.description}`);
      });
      if (toolCount > 3) {
        console.log(`  ... and ${toolCount - 3} more tools`);
      }
    }
    
    console.log('\n✅ All tests passed! Gateway follows MCP protocol correctly.');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run the test
testMcpProtocol();