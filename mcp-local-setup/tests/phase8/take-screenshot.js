const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

/**
 * Take a screenshot using Snap Happy through the MCP Gateway
 */
async function takeScreenshot() {
  const gatewayUrl = 'http://localhost:8090';
  const apiKey = 'mcp-gateway-default-key';
  
  try {
    console.log('Taking screenshot via Snap Happy...\n');
    
    // Call the screenshot tool using JSON-RPC
    const response = await axios.post(
      `${gatewayUrl}/mcp`,
      {
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'snap-happy:TakeScreenshot',
        params: {
          fullScreen: true
        }
      },
      {
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('Response:', JSON.stringify(response.data, null, 2));
    
    if (response.data.result) {
      const result = response.data.result;
      console.log('\nScreenshot taken successfully!');
      console.log(`Data length: ${result.data ? result.data.length : 'No data'}`);
      console.log(`Type: ${typeof result}`);
      
      if (result.data) {
        // Save the screenshot
        const screenshotDir = path.join(__dirname, 'screenshots');
        await fs.mkdir(screenshotDir, { recursive: true });
        
        const filename = `phase8-test-${Date.now()}.png`;
        const filepath = path.join(screenshotDir, filename);
        
        // Decode base64 and save
        const buffer = Buffer.from(result.data, 'base64');
        await fs.writeFile(filepath, buffer);
        
        console.log(`\nScreenshot saved to: ${filepath}`);
        console.log(`File size: ${(buffer.length / 1024).toFixed(2)} KB`);
      }
    } else if (response.data.result?.isError) {
      console.error('Screenshot error:', response.data.result.content[0].text);
    }
    
  } catch (error) {
    console.error('Error taking screenshot:', error.message);
  }
  
  // Try alternative approach - list windows first
  console.log('\nTrying to list windows instead...');
  try {
      const windowsResponse = await axios.post(
        `${gatewayUrl}/mcp`,
        {
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'snap-happy:ListWindows',
          params: {}
        },
        {
          headers: {
            'X-API-Key': apiKey,
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log('Windows response:', JSON.stringify(windowsResponse.data, null, 2));
      
      if (windowsResponse.data.result && windowsResponse.data.result.content) {
        const content = windowsResponse.data.result.content[0];
        if (content.type === 'text') {
          const windows = JSON.parse(content.text);
          console.log(`\nFound ${windows.length} windows:`);
          windows.slice(0, 5).forEach((win, idx) => {
            console.log(`  ${idx + 1}. ${win.title || 'Untitled'} (${win.width}x${win.height})`);
          });
        }
      }
    } catch (err) {
      console.error('Failed to list windows:', err.message);
    }
}

// Run if executed directly
if (require.main === module) {
  takeScreenshot().catch(console.error);
}

module.exports = takeScreenshot;