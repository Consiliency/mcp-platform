// Diagnostic script to paste in browser console

console.log('=== Catalog Page Diagnostics ===');

// Check if catalogManager exists
console.log('1. catalogManager exists:', typeof window.catalogManager !== 'undefined');

if (window.catalogManager) {
  console.log('2. catalogManager properties:');
  console.log('   - installedServers:', catalogManager.installedServers);
  console.log('   - catalogServers:', catalogManager.catalogServers);
  console.log('   - popularServers:', catalogManager.popularServers);
}

// Check DOM elements
console.log('\n3. DOM Elements:');
console.log('   - installed-servers div:', document.getElementById('installed-servers'));
console.log('   - Current content:', document.getElementById('installed-servers')?.innerHTML);

// Check for toggle elements
console.log('\n4. Toggle elements in DOM:');
console.log('   - Count:', document.querySelectorAll('.auto-start-toggle').length);

// Try to manually call loadInstalledServers
console.log('\n5. Trying to manually load servers...');
if (window.catalogManager && window.catalogManager.loadInstalledServers) {
  window.catalogManager.loadInstalledServers().then(() => {
    console.log('   - loadInstalledServers completed');
    console.log('   - installedServers after load:', catalogManager.installedServers);
    console.log('   - DOM after load:', document.getElementById('installed-servers')?.innerHTML?.substring(0, 200) + '...');
  }).catch(err => {
    console.error('   - Error loading servers:', err);
  });
}

// Check for any pending promises or async issues
console.log('\n6. Checking fetch...');
fetch('/api/gateway/servers', {
  headers: { 'x-api-key': 'mcp-gateway-default-key' }
})
.then(res => res.json())
.then(data => {
  console.log('   - API response:', data);
  console.log('   - Server count:', data.servers?.length);
})
.catch(err => {
  console.error('   - Fetch error:', err);
});