const TestUtils = require('./test-utils');
const LifecycleManager = require('../../gateway/lifecycle-manager');

/**
 * Test Server Lifecycle Management functionality
 * Tests idle timeout, client tracking, and automatic cleanup
 */
async function testLifecycleManager() {
  console.log('=== Testing Server Lifecycle Management ===\n');
  
  const utils = new TestUtils();
  const manager = new LifecycleManager();
  
  // Override timeout for faster testing
  manager.idleTimeout = 2000; // 2 seconds for testing
  manager.cleanupIntervalMs = 500; // Check every 500ms
  
  try {
    // Test 1: Basic lifecycle management
    console.log('Test 1: Basic lifecycle management');
    
    manager.start();
    console.log('  ✓ Lifecycle manager started');
    
    // Register server activity
    manager.registerActivity('test-server-1', 'client-1');
    console.log('  ✓ Registered activity for test-server-1');
    
    // Verify server is tracked
    const stats = manager.getUsageStats();
    const serverCount = Object.keys(stats).length;
    if (serverCount !== 1) {
      throw new Error(`Expected 1 active server, got ${serverCount}`);
    }
    console.log('  ✓ Server is being tracked');
    
    // Test 2: Client tracking
    console.log('\nTest 2: Client tracking');
    
    // Add more clients
    manager.registerActivity('test-server-1', 'client-2');
    manager.registerActivity('test-server-1', 'client-3');
    
    const serverData = manager.servers.get('test-server-1');
    if (serverData.clients.size !== 3) {
      throw new Error(`Expected 3 clients, got ${serverData.clients.size}`);
    }
    console.log(`  ✓ Tracking ${serverData.clients.size} clients correctly`);
    
    // Remove a client
    manager.unregisterClient('client-2');
    if (serverData.clients.size !== 2) {
      throw new Error(`Expected 2 clients after unregister, got ${serverData.clients.size}`);
    }
    console.log('  ✓ Client unregistration working');
    
    // Test 3: Keep-alive checks
    console.log('\nTest 3: Keep-alive checks');
    
    // Server with clients should stay alive
    if (!manager.shouldKeepAlive('test-server-1')) {
      throw new Error('Server with active clients should be kept alive');
    }
    console.log('  ✓ Server with clients kept alive');
    
    // Remove all clients
    manager.unregisterClient('client-1');
    manager.unregisterClient('client-3');
    console.log('  ✓ All clients removed');
    
    // Should schedule cleanup
    if (!serverData.timeout) {
      throw new Error('Cleanup should be scheduled after all clients disconnect');
    }
    console.log('  ✓ Cleanup scheduled for idle server');
    
    // Test 4: Idle timeout
    console.log('\nTest 4: Idle timeout behavior');
    
    let cleanupEmitted = false;
    manager.once('cleanup', (serverId) => {
      cleanupEmitted = true;
      console.log(`  ✓ Cleanup event emitted for ${serverId}`);
    });
    
    // Wait for idle timeout
    console.log('  Waiting for idle timeout (2s)...');
    await utils.sleep(2500);
    
    if (!cleanupEmitted) {
      throw new Error('Cleanup event should have been emitted');
    }
    
    // Server should be removed
    if (manager.servers.has('test-server-1')) {
      throw new Error('Server should be cleaned up after idle timeout');
    }
    console.log('  ✓ Server cleaned up after idle timeout');
    
    // Test 5: Activity prevents cleanup
    console.log('\nTest 5: Activity prevents cleanup');
    
    // Register new server
    manager.registerActivity('test-server-2', 'client-4');
    const server2Data = manager.servers.get('test-server-2');
    
    // Remove client to schedule cleanup
    manager.unregisterClient('client-4');
    console.log('  ✓ Cleanup scheduled');
    
    // Register activity before cleanup
    await utils.sleep(1000);
    manager.registerActivity('test-server-2', 'client-5');
    
    if (server2Data.timeout) {
      throw new Error('Cleanup should be cancelled on new activity');
    }
    console.log('  ✓ Cleanup cancelled due to new activity');
    
    // Test 6: Multiple servers
    console.log('\nTest 6: Multiple server management');
    
    // Register multiple servers
    const servers = ['server-a', 'server-b', 'server-c', 'server-d'];
    servers.forEach((serverId, index) => {
      manager.registerActivity(serverId, `client-${serverId}`);
    });
    
    const multiStats = manager.getUsageStats();
    const activeCount = Object.keys(multiStats).length;
    console.log(`  ✓ Managing ${activeCount} servers`);
    
    // Make some servers idle
    manager.unregisterClient('client-server-a');
    manager.unregisterClient('client-server-b');
    
    // Wait for cleanup cycle
    await utils.sleep(600);
    
    const idleCount = Array.from(manager.servers.values())
      .filter(s => s.clients.size === 0).length;
    console.log(`  ✓ ${idleCount} servers marked as idle`);
    
    // Test 7: Force cleanup
    console.log('\nTest 7: Force cleanup');
    
    const beforeForce = manager.servers.size;
    const cleaned = manager.forceCleanup();
    const afterForce = manager.servers.size;
    
    console.log(`  ✓ Force cleaned ${cleaned} idle servers`);
    console.log(`  ✓ Active servers: ${beforeForce} → ${afterForce}`);
    
    // Test 8: Usage statistics
    console.log('\nTest 8: Usage statistics');
    
    const finalStats = manager.getUsageStats();
    const serverEntries = Object.entries(finalStats);
    const totalClients = serverEntries.reduce((sum, [_, stats]) => sum + stats.activeClients, 0);
    const serversWithClients = serverEntries.filter(([_, stats]) => stats.activeClients > 0).length;
    const idleServers = serverEntries.filter(([_, stats]) => stats.activeClients === 0).length;
    
    console.log('  Usage stats:');
    console.log(`    Active servers: ${serverEntries.length}`);
    console.log(`    Total clients: ${totalClients}`);
    console.log(`    Servers with clients: ${serversWithClients}`);
    console.log(`    Idle servers: ${idleServers}`);
    console.log(`    Average clients per server: ${(totalClients / serverEntries.length || 0).toFixed(1)}`);
    
    // Test 9: Stop manager
    console.log('\nTest 9: Stop lifecycle manager');
    
    manager.stop();
    console.log('  ✓ Manager stopped');
    
    // Verify cleanup
    if (manager.cleanupInterval) {
      throw new Error('Cleanup interval should be cleared');
    }
    if (manager.servers.size !== 0) {
      throw new Error('All servers should be cleared on stop');
    }
    console.log('  ✓ All resources cleaned up');
    
    console.log('\n✅ All Lifecycle Manager tests passed!\n');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    throw error;
  } finally {
    manager.stop();
    await utils.cleanup();
  }
}

// Run test if executed directly
if (require.main === module) {
  testLifecycleManager().catch(console.error);
}

module.exports = testLifecycleManager;