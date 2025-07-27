const fs = require('fs').promises;
const path = require('path');
const ToolInventoryCache = require('../tool-inventory');

// Mock fs module
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    unlink: jest.fn()
  }
}));

// Suppress console warnings in tests
const originalWarn = console.warn;
beforeAll(() => {
  console.warn = jest.fn();
});
afterAll(() => {
  console.warn = originalWarn;
});

describe('ToolInventoryCache', () => {
  let cache;
  
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock fs.readFile to reject by default to avoid constructor warning
    fs.readFile.mockRejectedValue({ code: 'ENOENT' });
    cache = new ToolInventoryCache();
  });
  
  describe('constructor', () => {
    it('should initialize with correct properties', () => {
      expect(cache.inventoryPath).toBe(path.join(__dirname, '..', 'tool-inventory.json'));
      expect(cache.inventory).toBeInstanceOf(Map);
      expect(cache.lastUpdated).toBeInstanceOf(Map);
      expect(cache.cacheValidationInterval).toBe(300000);
    });
  });
  
  describe('loadInventory', () => {
    it('should load inventory from disk', async () => {
      const mockData = {
        inventory: {
          'server1': [{ name: 'tool1', description: 'Test tool' }]
        },
        lastUpdated: {
          'server1': '2024-01-01T00:00:00.000Z'
        }
      };
      
      fs.readFile.mockResolvedValue(JSON.stringify(mockData));
      
      await cache.loadInventory();
      
      expect(cache.inventory.get('server1')).toEqual(mockData.inventory.server1);
      expect(cache.lastUpdated.get('server1')).toBeInstanceOf(Date);
    });
    
    it('should handle missing file gracefully', async () => {
      fs.readFile.mockRejectedValue({ code: 'ENOENT' });
      
      await expect(cache.loadInventory()).resolves.not.toThrow();
      expect(cache.inventory.size).toBe(0);
    });
    
    it('should throw on other errors', async () => {
      const error = new Error('Read error');
      fs.readFile.mockRejectedValue(error);
      
      await expect(cache.loadInventory()).rejects.toThrow(error);
    });
  });
  
  describe('saveInventory', () => {
    it('should save inventory to disk', async () => {
      cache.inventory.set('server1', [{ name: 'tool1' }]);
      cache.lastUpdated.set('server1', new Date('2024-01-01'));
      
      await cache.saveInventory();
      
      expect(fs.writeFile).toHaveBeenCalledWith(
        cache.inventoryPath,
        expect.stringContaining('"server1"')
      );
    });
  });
  
  describe('getServerTools', () => {
    it('should return tools if cache is valid', () => {
      const tools = [{ name: 'tool1' }];
      cache.inventory.set('server1', tools);
      cache.lastUpdated.set('server1', new Date());
      
      expect(cache.getServerTools('server1')).toEqual(tools);
    });
    
    it('should return null if cache is invalid', () => {
      const tools = [{ name: 'tool1' }];
      cache.inventory.set('server1', tools);
      cache.lastUpdated.set('server1', new Date(Date.now() - 400000)); // 6+ minutes ago
      
      expect(cache.getServerTools('server1')).toBeNull();
    });
    
    it('should return null if server not in cache', () => {
      expect(cache.getServerTools('unknown')).toBeNull();
    });
  });
  
  describe('updateServerTools', () => {
    it('should update tools and timestamp', async () => {
      const tools = [{ name: 'tool1' }];
      
      await cache.updateServerTools('server1', tools);
      
      expect(cache.inventory.get('server1')).toEqual(tools);
      expect(cache.lastUpdated.get('server1')).toBeInstanceOf(Date);
      expect(fs.writeFile).toHaveBeenCalled();
    });
  });
  
  describe('isCacheValid', () => {
    it('should return true for recent cache', () => {
      cache.lastUpdated.set('server1', new Date());
      
      expect(cache.isCacheValid('server1')).toBe(true);
    });
    
    it('should return false for old cache', () => {
      cache.lastUpdated.set('server1', new Date(Date.now() - 400000));
      
      expect(cache.isCacheValid('server1')).toBe(false);
    });
    
    it('should return false for unknown server', () => {
      expect(cache.isCacheValid('unknown')).toBe(false);
    });
  });
  
  describe('invalidateServer', () => {
    it('should remove server from cache', async () => {
      cache.inventory.set('server1', [{ name: 'tool1' }]);
      cache.lastUpdated.set('server1', new Date());
      
      await cache.invalidateServer('server1');
      
      expect(cache.inventory.has('server1')).toBe(false);
      expect(cache.lastUpdated.has('server1')).toBe(false);
      expect(fs.writeFile).toHaveBeenCalled();
    });
  });
  
  describe('getAllTools', () => {
    it('should return all valid tools with server info', () => {
      cache.inventory.set('server1', [{ name: 'tool1' }]);
      cache.inventory.set('server2', [{ name: 'tool2' }]);
      cache.lastUpdated.set('server1', new Date());
      cache.lastUpdated.set('server2', new Date(Date.now() - 400000)); // Invalid
      
      const allTools = cache.getAllTools();
      
      expect(allTools).toHaveLength(1);
      expect(allTools[0]).toEqual({
        name: 'tool1',
        serverId: 'server1'
      });
    });
  });
  
  describe('clearCache', () => {
    it('should clear all data and remove file', async () => {
      cache.inventory.set('server1', [{ name: 'tool1' }]);
      cache.lastUpdated.set('server1', new Date());
      
      await cache.clearCache();
      
      expect(cache.inventory.size).toBe(0);
      expect(cache.lastUpdated.size).toBe(0);
      expect(fs.unlink).toHaveBeenCalledWith(cache.inventoryPath);
    });
    
    it('should handle missing file during clear', async () => {
      fs.unlink.mockRejectedValue({ code: 'ENOENT' });
      
      await expect(cache.clearCache()).resolves.not.toThrow();
    });
  });
});