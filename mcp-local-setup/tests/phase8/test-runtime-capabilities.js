const axios = require('axios');

const GATEWAY_URL = 'http://localhost:8091';
const API_KEY = process.env.GATEWAY_API_KEY || 'mcp-gateway-default-key';

// Change to the correct directory
process.chdir('/home/jenner/code/mcps/mcp-local-setup');

async function testRuntimeCapabilities() {
  console.log('Testing Runtime Capability Detection...\n');
  
  try {
    // 1. Get all runtime capabilities
    console.log('1. Detecting all runtime capabilities:');
    const capabilitiesResponse = await axios.get(`${GATEWAY_URL}/api/gateway/capabilities`, {
      headers: { 'x-api-key': API_KEY }
    });
    
    const capabilities = capabilitiesResponse.data.capabilities;
    console.log(`   Platform: ${capabilitiesResponse.data.platform}\n`);
    
    // Display each capability
    for (const [name, info] of Object.entries(capabilities)) {
      console.log(`   ${name}:`);
      console.log(`     Supported: ${info.supported}`);
      
      if (info.supported) {
        if (info.method) console.log(`     Method: ${info.method}`);
        if (info.version) console.log(`     Version: ${info.version}`);
        if (info.features) console.log(`     Features: ${info.features.join(', ')}`);
        if (info.limitations) console.log(`     Limitations: ${info.limitations.join(', ')}`);
        if (info.devices && info.devices.length > 0) {
          console.log(`     Devices: ${info.devices.map(d => d.name).join(', ')}`);
        }
      } else if (info.reason) {
        console.log(`     Reason: ${info.reason}`);
      }
      console.log();
    }
    
    // 2. Test enhanced compatibility report for snap-happy
    console.log('2. Getting enhanced compatibility report for snap-happy:');
    const enhancedResponse = await axios.get(`${GATEWAY_URL}/api/gateway/compatibility/snap-happy?enhanced=true`, {
      headers: { 'x-api-key': API_KEY }
    });
    
    const enhanced = enhancedResponse.data.compatibility;
    console.log(`   Static platform support: ${enhanced.supported} (${enhanced.level})`);
    
    if (enhanced.runtime) {
      console.log(`   Runtime capabilities checked:`);
      for (const [cap, info] of Object.entries(enhanced.runtime.capabilities)) {
        console.log(`     - ${cap}: ${info.supported ? 'Available' : 'Not available'}`);
      }
      
      if (enhanced.runtime.missingRequirements.length > 0) {
        console.log(`   Missing requirements: ${enhanced.runtime.missingRequirements.join(', ')}`);
      }
      
      console.log(`   Can run: ${enhanced.runtime.canRun}`);
      console.log(`   Overall support: ${enhanced.runtime.overallSupport}`);
    }
    
    // 3. Check specific capabilities important for MCPs
    console.log('\n3. Key capabilities for MCP servers:');
    
    // Screenshot capability
    if (capabilities.screenshot?.supported) {
      console.log(`   ✓ Screenshot capability available (${capabilities.screenshot.method})`);
      if (capabilitiesResponse.data.platform === 'wsl' && capabilities.screenshot.limitations) {
        console.log(`     Note: ${capabilities.screenshot.limitations.join(', ')}`);
      }
    } else {
      console.log('   ✗ Screenshot capability not available');
    }
    
    // Display capability
    if (capabilities.display?.supported) {
      console.log(`   ✓ Display available (${capabilities.display.type})`);
    } else {
      console.log('   ✗ No display detected (headless environment)');
    }
    
    // Docker capability
    if (capabilities.docker?.supported) {
      console.log(`   ✓ Docker available (v${capabilities.docker.version})`);
    } else {
      console.log('   ✗ Docker not available');
    }
    
    // Python capability
    if (capabilities.python?.supported) {
      const versions = capabilities.python.versions.map(v => v.version).join(', ');
      console.log(`   ✓ Python available (${versions})`);
    } else {
      console.log('   ✗ Python not available');
    }
    
    // Node.js version
    if (capabilities['node-version']?.supported) {
      console.log(`   ✓ Node.js v${capabilities['node-version'].version} (npm v${capabilities['node-version'].npm})`);
    }
    
    // Summary
    console.log('\n=== Summary ===');
    const supportedCount = Object.values(capabilities).filter(c => c.supported).length;
    console.log(`Platform: ${capabilitiesResponse.data.platform}`);
    console.log(`Capabilities detected: ${supportedCount}/${Object.keys(capabilities).length}`);
    console.log('\nRuntime capability detection allows the gateway to:');
    console.log('- Check if required tools are installed');
    console.log('- Verify display availability for GUI tools');
    console.log('- Detect GPU support for ML workloads');
    console.log('- Ensure version requirements are met');
    
  } catch (error) {
    console.error('Test failed:', error.response?.data || error.message);
    process.exit(1);
  }
}

// Run the test
testRuntimeCapabilities();