#!/usr/bin/env node

const EventSource = require('eventsource').EventSource || require('eventsource');
const axios = require('axios');

console.log('=== Testing Claude Code Protocol Flow ===\n');

const baseUrl = 'http://127.0.0.1:8090/mcp';
let sseConnection = null;
let endpointUrl = null;
let sessionId = null;

// Step 1: Connect to SSE endpoint
console.log('1. Connecting to SSE endpoint...');
const es = new EventSource(baseUrl);

// Track all events
es.addEventListener('endpoint', (event) => {
  endpointUrl = event.data;
  console.log(`✓ Received endpoint event: ${endpointUrl}`);
});

es.addEventListener('session', (event) => {
  sessionId = event.data;
  console.log(`✓ Received session event: ${sessionId}`);
  
  // Claude Code expects both events before initializing
  if (endpointUrl) {
    sendInitialize();
  }
});

es.onmessage = (event) => {
  console.log('\nReceived SSE data event:');
  try {
    const data = JSON.parse(event.data);
    console.log(JSON.stringify(data, null, 2));
  } catch (e) {
    console.log('Raw data:', event.data);
  }
};

es.onerror = (error) => {
  console.error('SSE error:', error);
  es.close();
  process.exit(1);
};

async function sendInitialize() {
  console.log('\n2. Sending initialize (Claude Code style)...');
  try {
    const response = await axios.post(endpointUrl, {
      jsonrpc: '2.0',
      id: 0,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {
          roots: {}
        },
        clientInfo: {
          name: 'claude-code',
          version: '1.0.69'
        }
      }
    }, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'claude-code/1.0.69',
        'Accept': 'text/event-stream',
        'Accept-Language': '*'
      }
    });
    
    console.log('Initialize response:', response.status);
    if (response.data) {
      console.log('Response body:', JSON.stringify(response.data, null, 2));
      
      // Send tools/list
      setTimeout(() => sendToolsList(), 100);
    }
  } catch (error) {
    console.error('Error sending initialize:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

async function sendToolsList() {
  console.log('\n3. Sending tools/list...');
  try {
    const response = await axios.post(endpointUrl, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {}
    }, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'claude-code/1.0.69',
        'Accept': 'text/event-stream',
        'Accept-Language': '*'
      }
    });
    
    console.log('Tools/list response:', response.status);
    if (response.data) {
      console.log(`Found ${response.data.result?.tools?.length || 0} tools`);
      
      // Wait a bit to see if connection stays alive
      console.log('\n4. Monitoring connection for 5 seconds...');
      setTimeout(() => {
        console.log('Test completed successfully!');
        es.close();
        process.exit(0);
      }, 5000);
    }
  } catch (error) {
    console.error('Error sending tools/list:', error.message);
  }
}

// Timeout
setTimeout(() => {
  console.error('\n✗ Test timed out after 30 seconds');
  es.close();
  process.exit(1);
}, 30000);