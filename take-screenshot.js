const { spawn } = require('child_process');
const fs = require('fs');

console.log('Taking screenshot of catalog page...');

// Use snap-happy directly via npx
const snap = spawn('npx', [
  '-y', 
  '@mariozechner/snap-happy', 
  'screenshot',
  '--url', 'http://localhost:8090/dashboard/catalog.html',
  '--output', '/home/jenner/code/mcps/catalog-screenshot.png'
], {
  stdio: 'pipe'
});

let output = '';
let error = '';

snap.stdout.on('data', (data) => {
  output += data.toString();
});

snap.stderr.on('data', (data) => {
  error += data.toString();
});

snap.on('close', (code) => {
  if (code === 0) {
    console.log('Screenshot saved successfully!');
    // Check if file exists and size
    try {
      const stats = fs.statSync('/home/jenner/code/mcps/catalog-screenshot.png');
      console.log(`File size: ${stats.size} bytes`);
    } catch (e) {
      console.log('Could not stat file:', e.message);
    }
  } else {
    console.log('Screenshot failed with code:', code);
    console.log('Output:', output);
    console.log('Error:', error);
  }
});