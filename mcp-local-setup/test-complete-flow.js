const axios = require('axios');

async function testCompleteFlow() {
  console.log('Testing complete dual-gateway flow...\n');
  
  // Test 1: Check WSL gateway
  console.log('1. Testing WSL gateway at localhost:8090...');
  try {
    const response = await axios.post('http://localhost:8090/mcp', {
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
    
    const snapTools = response.data.result.tools
      .filter(t => t.name && t.name.includes('snap'))
      .map(t => t.name);
    console.log('✓ WSL gateway is running');
    console.log('  Snap-happy tools:', snapTools);
  } catch (error) {
    console.log('✗ WSL gateway error:', error.message);
  }
  
  // Test 2: Check Windows connectivity
  console.log('\n2. Testing Windows host connectivity...');
  const windowsHost = '172.22.176.1';
  try {
    // Test with a simple HTTP request to see if port is open
    const response = await axios.get(`http://${windowsHost}:8091/`, {
      timeout: 2000,
      validateStatus: () => true // Accept any status
    });
    console.log('✓ Can reach Windows host on port 8091');
    console.log('  Status:', response.status);
  } catch (error) {
    console.log('✗ Cannot reach Windows gateway:', error.message);
    console.log('  This might be due to:');
    console.log('  - Windows Firewall blocking port 8091');
    console.log('  - Gateway not binding to all interfaces');
    console.log('  - Windows gateway not running');
  }
  
  // Test 3: Alternative approach - direct PowerShell execution
  console.log('\n3. Testing direct PowerShell screenshot...');
  const { exec } = require('child_process');
  const util = require('util');
  const execPromise = util.promisify(exec);
  
  try {
    const { stdout } = await execPromise('powershell.exe -NoProfile -ExecutionPolicy Bypass -File gateway/screenshot-wrapper.ps1 -Format Base64');
    const result = JSON.parse(stdout);
    if (result.success) {
      console.log('✓ PowerShell screenshot works directly');
      console.log('  Screenshot saved to:', result.path);
      console.log('  Base64 data length:', result.data.length);
    } else {
      console.log('✗ PowerShell screenshot failed');
    }
  } catch (error) {
    console.log('✗ PowerShell execution error:', error.message);
  }
}

testCompleteFlow();