#!/usr/bin/env node
const axios = require('axios');

/**
 * Simple MCP Client Emulator for debugging handshake with gateway
 */
class MCPClientEmulator {
  constructor(gatewayUrl = 'http://localhost:8090') {
    this.gatewayUrl = gatewayUrl;
    this.sessionId = null;
    this.tools = [];
  }

  /**
   * Test SSE connection
   */
  async testSSE() {
    console.log('\n=== Testing SSE Transport ===');
    console.log(`Connecting to ${this.gatewayUrl}/mcp...`);
    
    try {
      // First make a GET request to establish SSE connection
      const response = await axios.get(`${this.gatewayUrl}/mcp`, {
        headers: {
          'Accept': 'text/event-stream'
        },
        responseType: 'stream',
        timeout: 5000
      });
      
      console.log('✓ SSE endpoint accessible');
      console.log('Note: Full SSE streaming test requires a proper EventSource client');
      
      // For now, let's just test the initialize flow via HTTP POST
      return await this.testHTTP();
    } catch (error) {
      console.error('\n✗ SSE connection failed:', error.message);
      throw error;
    }
  }

  /**
   * Send initialize request via HTTP POST
   */
  async sendInitialize() {
    try {
      const response = await axios.post(`${this.gatewayUrl}/mcp`, {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '0.1.0',
          capabilities: {
            tools: {}
          },
          clientInfo: {
            name: 'MCP Client Emulator',
            version: '1.0.0'
          }
        },
        id: 'init-1'
      }, {
        headers: {
          'Content-Type': 'application/json',
          'X-Session-ID': this.sessionId
        }
      });
      
      console.log('Initialize POST response:', response.status);
    } catch (error) {
      console.error('Error sending initialize:', error.message);
    }
  }

  /**
   * Send tools/list request via HTTP POST
   */
  async sendToolsList() {
    try {
      const response = await axios.post(`${this.gatewayUrl}/mcp`, {
        jsonrpc: '2.0',
        method: 'tools/list',
        params: {},
        id: 'tools-1'
      }, {
        headers: {
          'Content-Type': 'application/json',
          'X-Session-ID': this.sessionId
        }
      });
      
      console.log('Tools list POST response:', response.status);
    } catch (error) {
      console.error('Error sending tools/list:', error.message);
    }
  }

  /**
   * Test HTTP transport
   */
  async testHTTP() {
    console.log('\n=== Testing HTTP Transport ===');
    console.log(`Sending requests to ${this.gatewayUrl}/mcp...`);
    
    try {
      // Send initialize
      console.log('\nSending initialize request...');
      const initResponse = await axios.post(`${this.gatewayUrl}/mcp`, {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '0.1.0',
          capabilities: {
            tools: {}
          },
          clientInfo: {
            name: 'MCP Client Emulator (HTTP)',
            version: '1.0.0'
          }
        },
        id: 'init-http-1'
      }, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log('\n✓ Initialize response:');
      console.log(JSON.stringify(initResponse.data, null, 2));
      
      // Send tools/list
      console.log('\nSending tools/list request...');
      const toolsResponse = await axios.post(`${this.gatewayUrl}/mcp`, {
        jsonrpc: '2.0',
        method: 'tools/list',
        params: {},
        id: 'tools-http-1'
      }, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log('\n✓ Tools response:');
      console.log(`Total tools: ${toolsResponse.data.result.tools.length}`);
      
      // Show first 5 tools
      console.log('\nSample tools:');
      toolsResponse.data.result.tools.slice(0, 5).forEach(tool => {
        console.log(`  - ${tool.name}: ${tool.description}`);
      });
      
      if (toolsResponse.data.result.tools.length > 5) {
        console.log(`  ... and ${toolsResponse.data.result.tools.length - 5} more tools`);
      }
      
      // Group tools by server
      const toolsByServer = {};
      toolsResponse.data.result.tools.forEach(tool => {
        const server = tool.name.split('__')[0] || 'unknown';
        toolsByServer[server] = (toolsByServer[server] || 0) + 1;
      });
      
      console.log('\nTools by server:');
      Object.entries(toolsByServer).forEach(([server, count]) => {
        console.log(`  - ${server}: ${count} tools`);
      });
      
    } catch (error) {
      console.error('\n✗ HTTP error:', error.message);
      if (error.response) {
        console.error('Response data:', error.response.data);
      }
    }
  }

  /**
   * Check gateway status
   */
  async checkStatus() {
    console.log('\n=== Checking Gateway Status ===');
    
    try {
      const response = await axios.get(`${this.gatewayUrl}/status`);
      console.log('\n✓ Gateway is running');
      console.log('Status:', JSON.stringify(response.data, null, 2));
    } catch (error) {
      console.error('\n✗ Gateway not accessible:', error.message);
    }
  }

  /**
   * Check tool inventory
   */
  async checkToolInventory() {
    console.log('\n=== Checking Tool Inventory ===');
    
    try {
      const fs = require('fs').promises;
      const path = require('path');
      const inventoryPath = path.join(__dirname, 'gateway', 'tool-inventory.json');
      
      const inventory = JSON.parse(await fs.readFile(inventoryPath, 'utf8'));
      console.log(`\n✓ Tool inventory found`);
      console.log(`Last updated: ${new Date(inventory.lastUpdated).toLocaleString()}`);
      console.log(`Total servers: ${Object.keys(inventory.servers || {}).length}`);
      
      // Count total tools
      let totalTools = 0;
      Object.values(inventory.servers).forEach(server => {
        if (server.tools) {
          totalTools += server.tools.length;
        }
      });
      console.log(`Total tools in inventory: ${totalTools}`);
      
      // Show snap-happy specifically
      if (inventory.servers['snap-happy']) {
        console.log('\nsnap-happy server:');
        console.log(`  - Status: ${inventory.servers['snap-happy'].status}`);
        console.log(`  - Tools: ${inventory.servers['snap-happy'].tools.length}`);
        inventory.servers['snap-happy'].tools.forEach(tool => {
          console.log(`    • ${tool.name}`);
        });
      }
    } catch (error) {
      console.error('\n✗ Could not read tool inventory:', error.message);
    }
  }
}

// Run the emulator
async function main() {
  console.log('MCP Client Emulator - Testing Gateway Handshake');
  console.log('==============================================');
  
  const client = new MCPClientEmulator();
  
  // Check gateway status first
  await client.checkStatus();
  
  // Check tool inventory
  await client.checkToolInventory();
  
  // Test SSE transport (what Claude Code uses)
  try {
    await client.testSSE();
  } catch (error) {
    console.error('\nSSE test failed:', error.message);
  }
  
  // Test HTTP transport as comparison
  try {
    await client.testHTTP();
  } catch (error) {
    console.error('\nHTTP test failed:', error.message);
  }
  
  console.log('\n=== Test Complete ===');
}

main().catch(console.error);