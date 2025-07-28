#!/usr/bin/env node
const { spawn } = require('child_process');
const readline = require('readline');

console.log('Testing snap-happy with MCP protocol...');

const ps = spawn('powershell.exe', [
  '-NoProfile',
  '-Command',
  `$env:PATH = 'C:\\Program Files\\nodejs' + ';' + $env:PATH; Set-Location $env:TEMP; npx -y @mariozechner/snap-happy`
]);

const rl = readline.createInterface({
  input: ps.stdout,
  crlfDelay: Infinity
});

let initialized = false;

rl.on('line', (line) => {
  console.log('Response:', line);
  
  try {
    const msg = JSON.parse(line);
    
    // Handle initialize response
    if (msg.id === 'init-1' && msg.result) {
      console.log('\nInitialized! Now calling TakeScreenshot...');
      
      const toolCall = {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'TakeScreenshot',
          arguments: {}
        },
        id: 'screenshot-1'
      };
      
      ps.stdin.write(JSON.stringify(toolCall) + '\n');
    }
    
    // Handle screenshot response
    if (msg.id === 'screenshot-1') {
      console.log('\nScreenshot response:', JSON.stringify(msg, null, 2));
      setTimeout(() => {
        ps.kill();
        process.exit(0);
      }, 1000);
    }
  } catch (e) {
    // Not JSON, ignore
  }
});

ps.stderr.on('data', (data) => {
  const output = data.toString();
  console.log('STDERR:', output);
  
  // When server is ready, send initialize
  if (output.includes('MCP server running') && !initialized) {
    initialized = true;
    console.log('\nServer ready, sending initialize...');
    
    const initMsg = {
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
      id: 'init-1'
    };
    
    ps.stdin.write(JSON.stringify(initMsg) + '\n');
  }
});

ps.on('error', (err) => {
  console.error('Failed to start process:', err);
});

ps.on('close', (code) => {
  console.log(`\nProcess exited with code ${code}`);
});

// Safety timeout
setTimeout(() => {
  console.log('\nTimeout reached, killing process...');
  ps.kill();
  process.exit(1);
}, 30000);