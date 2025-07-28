const axios = require('axios');

async function testWindowsGateway() {
  try {
    console.log('Testing Windows gateway at http://localhost:8091...');
    
    // Test health endpoint
    try {
      const health = await axios.get('http://localhost:8091/api/health', {
        headers: { 'X-API-Key': 'mcp-gateway-windows-key' }
      });
      console.log('Health check:', health.data);
    } catch (error) {
      console.log('Health check failed:', error.message);
    }
    
    // Test snap-happy tools list
    const response = await axios.post('http://localhost:8091/mcp/snap-happy', {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {}
    }, {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'mcp-gateway-windows-key'
      }
    });
    
    console.log('Snap-happy tools:', JSON.stringify(response.data, null, 2));
    
    // Test screenshot
    const screenshotResponse = await axios.post('http://localhost:8091/mcp/snap-happy', {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'TakeScreenshot',
        arguments: {}
      }
    }, {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'mcp-gateway-windows-key'
      }
    });
    
    console.log('Screenshot response:', JSON.stringify(screenshotResponse.data, null, 2));
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

testWindowsGateway();