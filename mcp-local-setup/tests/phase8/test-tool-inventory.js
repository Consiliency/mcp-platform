const TestUtils = require('./test-utils');
const ToolInventoryCache = require('../../gateway/tool-inventory');
const path = require('path');
const fs = require('fs').promises;

/**
 * Test Tool Inventory Cache functionality
 * Tests caching, persistence, expiry, and performance improvements
 */
async function testToolInventory() {
  console.log('=== Testing Tool Inventory Cache ===\n');
  
  const utils = new TestUtils();
  const cache = new ToolInventoryCache();
  
  // Override cache path for testing
  cache.inventoryPath = path.join(__dirname, 'test-inventory.json');
  
  try {
    // Test 1: Cache population and retrieval
    console.log('Test 1: Cache population and retrieval');
    
    // Start multiple servers with different tools
    const servers = [
      { id: 'server1', tools: ['read_file', 'write_file', 'list_dir'] },
      { id: 'server2', tools: ['database_query', 'database_insert'] },
      { id: 'server3', tools: ['http_request', 'parse_json', 'validate_schema'] }
    ];
    
    // Populate cache
    for (const server of servers) {
      await cache.updateServerTools(server.id, server.tools);
      console.log(`  ✓ Cached tools for ${server.id}: ${server.tools.join(', ')}`);
    }
    
    // Verify retrieval
    for (const server of servers) {
      const cachedTools = cache.getServerTools(server.id);
      if (JSON.stringify(cachedTools) !== JSON.stringify(server.tools)) {
        throw new Error(`Cache mismatch for ${server.id}`);
      }
      console.log(`  ✓ Retrieved correct tools for ${server.id}`);
    }
    
    // Test 2: Cache persistence
    console.log('\nTest 2: Cache persistence');
    
    await cache.saveInventory();
    console.log('  ✓ Saved inventory to disk');
    
    // Create new cache instance
    const cache2 = new ToolInventoryCache();
    cache2.inventoryPath = cache.inventoryPath;
    await cache2.loadInventory();
    
    // Verify persisted data
    for (const server of servers) {
      const cachedTools = cache2.getServerTools(server.id);
      if (JSON.stringify(cachedTools) !== JSON.stringify(server.tools)) {
        throw new Error(`Persistence failed for ${server.id}`);
      }
    }
    console.log('  ✓ Successfully loaded persisted inventory');
    
    // Test 3: Cache expiry
    console.log('\nTest 3: Cache expiry');
    
    // Override cache validation interval for testing
    cache.cacheValidationInterval = 100; // 100ms for testing
    
    await cache.updateServerTools('expiry-test', ['tool1', 'tool2']);
    console.log('  ✓ Added tools with short expiry');
    
    // Wait for expiry
    await utils.sleep(150);
    
    if (cache.isCacheValid('expiry-test')) {
      throw new Error('Cache should have expired');
    }
    console.log('  ✓ Cache correctly expired after timeout');
    
    // Test 4: Performance comparison
    console.log('\nTest 4: Performance comparison');
    
    // Simulate discovery function
    const mockDiscovery = async (serverId) => {
      await utils.sleep(50); // Simulate network latency
      return servers.find(s => s.id === serverId)?.tools || [];
    };
    
    // Measure uncached performance
    console.log('  Testing uncached discovery...');
    const uncachedPerf = await utils.measurePerformance(async () => {
      for (const server of servers) {
        await mockDiscovery(server.id);
      }
    }, 20);
    
    console.log(`  Uncached avg: ${uncachedPerf.avg.toFixed(2)}ms`);
    
    // Populate cache
    for (const server of servers) {
      const tools = await mockDiscovery(server.id);
      await cache.updateServerTools(server.id, tools);
    }
    
    // Measure cached performance
    console.log('  Testing cached discovery...');
    const cachedPerf = await utils.measurePerformance(async () => {
      for (const server of servers) {
        const cached = cache.getServerTools(server.id);
        if (!cached) {
          await mockDiscovery(server.id);
        }
      }
    }, 20);
    
    console.log(`  Cached avg: ${cachedPerf.avg.toFixed(2)}ms`);
    console.log(`  Performance improvement: ${((uncachedPerf.avg - cachedPerf.avg) / uncachedPerf.avg * 100).toFixed(1)}%`);
    
    // Test 5: Cache invalidation
    console.log('\nTest 5: Cache invalidation');
    
    await cache.invalidateServer('server2');
    console.log('  ✓ Invalidated server2 cache');
    
    if (cache.getServerTools('server2') !== null) {
      throw new Error('Cache should be invalidated');
    }
    console.log('  ✓ Confirmed cache invalidation');
    
    // Test 6: Get all tools
    console.log('\nTest 6: Get all tools aggregation');
    
    const allTools = cache.getAllTools();
    console.log(`  ✓ Retrieved ${allTools.length} total tools`);
    
    // Verify tool namespacing
    const toolsByServer = {};
    allTools.forEach(tool => {
      if (!toolsByServer[tool.serverId]) {
        toolsByServer[tool.serverId] = [];
      }
      toolsByServer[tool.serverId].push(tool.name);
    });
    
    console.log('  Tool distribution:');
    Object.entries(toolsByServer).forEach(([server, tools]) => {
      console.log(`    ${server}: ${tools.length} tools`);
    });
    
    // Test 7: Clear cache
    console.log('\nTest 7: Clear cache');
    
    await cache.clearCache();
    console.log('  ✓ Cleared all cache data');
    
    // Verify file is removed
    try {
      await fs.access(cache.inventoryPath);
      throw new Error('Cache file should be deleted');
    } catch (err) {
      if (err.code === 'ENOENT') {
        console.log('  ✓ Cache file successfully removed');
      } else {
        throw err;
      }
    }
    
    console.log('\n✅ All Tool Inventory Cache tests passed!\n');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    throw error;
  } finally {
    // Cleanup
    await utils.cleanup();
    try {
      await fs.unlink(path.join(__dirname, 'test-inventory.json'));
    } catch (err) {
      // Ignore if already deleted
    }
  }
}

// Run test if executed directly
if (require.main === module) {
  testToolInventory().catch(console.error);
}

module.exports = testToolInventory;