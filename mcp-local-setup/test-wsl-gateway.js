const axios = require('axios');

async function testWSLGateway() {
  try {
    console.log('Testing WSL gateway at http://localhost:8090...');
    
    // Test tools list
    const toolsResponse = await axios.post('http://localhost:8090/mcp', {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {}
    }, {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'mcp-gateway-default-key'
      }
    });
    
    if (toolsResponse.data.result && toolsResponse.data.result.tools) {
      const snapTools = toolsResponse.data.result.tools
        .filter(t => t.name && t.name.includes('snap'))
        .map(t => ({ name: t.name, description: t.description }));
      console.log('Snap-happy tools found:', snapTools);
    } else {
      console.log('Tools response:', JSON.stringify(toolsResponse.data, null, 2));
    }
    
    // Test snap-happy screenshot
    const screenshotResponse = await axios.post('http://localhost:8090/mcp', {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'mcp__snap_happy__TakeScreenshot',
        arguments: {}
      }
    }, {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'mcp-gateway-default-key'
      }
    });
    
    console.log('Screenshot response:', JSON.stringify(screenshotResponse.data, null, 2));
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testWSLGateway();