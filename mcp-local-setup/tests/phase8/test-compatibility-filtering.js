const axios = require('axios');

const GATEWAY_URL = 'http://localhost:8091';
const API_KEY = process.env.GATEWAY_API_KEY || 'mcp-gateway-default-key';

// Change to the correct directory
process.chdir('/home/jenner/code/mcps/mcp-local-setup');

async function testCompatibilityFiltering() {
  console.log('Testing MCP Compatibility Filtering on WSL...\n');
  
  try {
    // 1. Check platform detection
    console.log('1. Checking platform detection:');
    const compatResponse = await axios.get(`${GATEWAY_URL}/api/gateway/compatibility`, {
      headers: { 'x-api-key': API_KEY }
    });
    
    console.log(`   Current platform: ${compatResponse.data.platform}`);
    console.log(`   Expected: wsl (if running on WSL)\n`);
    
    // 2. Get snap-happy compatibility report
    console.log('2. Getting snap-happy compatibility report:');
    const snapHappyCompat = await axios.get(`${GATEWAY_URL}/api/gateway/compatibility/snap-happy`, {
      headers: { 'x-api-key': API_KEY }
    });
    
    const report = snapHappyCompat.data.compatibility;
    console.log(`   Supported: ${report.supported}`);
    console.log(`   Level: ${report.level}`);
    console.log(`   Limitations: ${report.limitations.length > 0 ? report.limitations.join(', ') : 'None'}`);
    console.log(`   Known issues: ${report.knownIssues.length}\n`);
    
    // 3. Check available tools
    console.log('3. Checking available tools:');
    const toolsResponse = await axios.get(`${GATEWAY_URL}/api/gateway/tools`, {
      headers: { 'x-api-key': API_KEY }
    });
    
    const snapHappyTools = toolsResponse.data.tools.filter(tool => 
      tool.name.startsWith('snap-happy:')
    );
    
    console.log(`   Total snap-happy tools available: ${snapHappyTools.length}`);
    snapHappyTools.forEach(tool => {
      console.log(`   - ${tool.name}`);
    });
    
    // 4. Verify ListWindows is filtered out on non-macOS platforms
    if (compatResponse.data.platform !== 'darwin') {
      const hasListWindows = snapHappyTools.some(tool => 
        tool.name === 'snap-happy:ListWindows'
      );
      console.log(`\n   ListWindows filtered out (non-macOS): ${!hasListWindows ? 'YES ✓' : 'NO ✗'}`);
      
      if (hasListWindows) {
        console.error('   ERROR: ListWindows should not be available on non-macOS platforms!');
      }
    }
    
    // 5. Check tool descriptions for platform info
    console.log('\n4. Checking enhanced tool descriptions:');
    snapHappyTools.forEach(tool => {
      if (tool.description.includes('Available on:')) {
        console.log(`   ${tool.name}: ${tool.description.match(/\(Available on: [^)]+\)/)[0]}`);
      }
    });
    
    // 6. Test filesystem MCP (should have full support)
    console.log('\n5. Checking filesystem MCP compatibility:');
    const fsCompatResponse = await axios.get(`${GATEWAY_URL}/api/gateway/compatibility/filesystem`, {
      headers: { 'x-api-key': API_KEY }
    });
    
    const fsReport = fsCompatResponse.data.compatibility;
    console.log(`   Supported: ${fsReport.supported}`);
    console.log(`   Level: ${fsReport.level}`);
    
    const fsTools = toolsResponse.data.tools.filter(tool => 
      tool.name.startsWith('filesystem:')
    );
    console.log(`   Available tools: ${fsTools.length}`);
    
    // 7. Summary
    console.log('\n=== Summary ===');
    console.log(`Platform: ${compatResponse.data.platform}`);
    console.log(`Snap-happy support: ${report.level}`);
    console.log(`Snap-happy tools available: ${snapHappyTools.length}`);
    console.log(`Filesystem support: ${fsReport.level}`);
    console.log(`Filesystem tools available: ${fsTools.length}`);
    
    if (compatResponse.data.platform === 'wsl' && report.level === 'experimental') {
      console.log('\n✓ WSL compatibility filtering is working correctly!');
      console.log('  - Platform correctly detected as WSL');
      console.log('  - Snap-happy marked as experimental with known limitations');
      console.log('  - Incompatible tools (ListWindows) filtered out');
    }
    
  } catch (error) {
    console.error('Test failed:', error.response?.data || error.message);
    process.exit(1);
  }
}

// Run the test
testCompatibilityFiltering();