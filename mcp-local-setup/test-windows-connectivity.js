const axios = require('axios');

async function testWindowsConnectivity() {
  const windowsHost = '172.22.176.1';
  
  console.log(`Testing connectivity to Windows gateway at ${windowsHost}:8091...`);
  
  try {
    // Test basic connectivity
    const response = await axios.get(`http://${windowsHost}:8091/`, {
      timeout: 5000
    });
    console.log('Connection successful!');
    console.log('Response status:', response.status);
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.log('Connection refused - Windows gateway may not be listening on all interfaces');
      console.log('It might be bound to localhost only');
    } else if (error.code === 'ETIMEDOUT') {
      console.log('Connection timeout - Windows firewall may be blocking the connection');
    } else {
      console.log('Connection error:', error.message);
    }
  }
  
  // Also test localhost from WSL
  try {
    console.log('\nTesting localhost:8091 from WSL...');
    const response = await axios.get('http://localhost:8091/', {
      timeout: 5000
    });
    console.log('Localhost connection successful!');
  } catch (error) {
    console.log('Localhost connection failed:', error.message);
  }
}

testWindowsConnectivity();