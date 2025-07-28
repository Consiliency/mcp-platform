#!/usr/bin/env node
const { spawn } = require('child_process');

console.log('Testing snap-happy directly...');

// Test 1: Run snap-happy with a simple screenshot command
const ps = spawn('powershell.exe', [
  '-NoProfile',
  '-Command',
  `$env:PATH = 'C:\\Program Files\\nodejs' + ';' + $env:PATH; Set-Location $env:TEMP; echo "Current dir: $(Get-Location)"; echo "Node path: $(where.exe node)"; npx -y @mariozechner/snap-happy`
]);

let output = '';
let errorOutput = '';

ps.stdout.on('data', (data) => {
  output += data.toString();
  console.log('STDOUT:', data.toString());
});

ps.stderr.on('data', (data) => {
  errorOutput += data.toString();
  console.log('STDERR:', data.toString());
});

ps.on('close', (code) => {
  console.log(`Process exited with code ${code}`);
  
  // Try sending a screenshot command
  if (code === 0 || output.includes('MCP server running')) {
    console.log('\nSnap-happy started, sending screenshot command...');
    
    const request = {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'TakeScreenshot',
        arguments: {}
      },
      id: 1
    };
    
    ps.stdin.write(JSON.stringify(request) + '\n');
    
    setTimeout(() => {
      console.log('\nFinal output:', output);
      console.log('\nFinal errors:', errorOutput);
      ps.kill();
    }, 3000);
  }
});

// Handle errors
ps.on('error', (err) => {
  console.error('Failed to start process:', err);
});