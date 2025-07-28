const axios = require('axios');

async function checkGatewayStatus() {
  try {
    // Get gateway status
    const statusResponse = await axios.get('http://localhost:8090/api/gateway/status', {
      headers: { 'X-API-Key': 'mcp-gateway-default-key' }
    });
    
    console.log('Gateway Status:');
    console.log(JSON.stringify(statusResponse.data, null, 2));
    
    // Get servers list
    const serversResponse = await axios.get('http://localhost:8090/api/gateway/servers', {
      headers: { 'X-API-Key': 'mcp-gateway-default-key' }
    });
    
    console.log('\nServers:');
    serversResponse.data.forEach(server => {
      console.log(`- ${server.id}: ${server.status} (${server.type})`);
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkGatewayStatus();