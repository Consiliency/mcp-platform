const SmartToolDiscovery = require('../smart-discovery');
const EventEmitter = require('events');

// Suppress console logs in tests
const originalLog = console.log;
beforeAll(() => {
  console.log = jest.fn();
});
afterAll(() => {
  console.log = originalLog;
});

// Mock dependencies
const mockGatewayService = {
  servers: new Map(),
  listTools: jest.fn(),
  ensureServerStarted: jest.fn(),
  callTool: jest.fn()
};

const mockApiKeyManager = {
  hasKey: jest.fn()
};

const mockToolCache = {
  getAllTools: jest.fn(),
  getServerTools: jest.fn(),
  updateServerTools: jest.fn()
};

describe('SmartToolDiscovery', () => {
  let discovery;
  
  beforeEach(() => {
    jest.clearAllMocks();
    discovery = new SmartToolDiscovery(mockGatewayService, mockApiKeyManager, mockToolCache);
  });
  
  describe('constructor', () => {
    it('should initialize with correct properties', () => {
      expect(discovery.gateway).toBe(mockGatewayService);
      expect(discovery.apiKeyManager).toBe(mockApiKeyManager);
      expect(discovery.toolCache).toBe(mockToolCache);
      expect(discovery.pendingDiscoveries).toBeInstanceOf(Map);
    });
  });
  
  describe('getAvailableTools', () => {
    it('should filter tools by API key availability', async () => {
      const mockTools = [
        { name: 'tool1', serverId: 'server1' },
        { name: 'tool2', serverId: 'server2' }
      ];
      
      mockToolCache.getAllTools.mockReturnValue(mockTools);
      mockGatewayService.servers.set('server1', { requiredKeys: ['key1'] });
      mockGatewayService.servers.set('server2', { requiredKeys: ['key2'] });
      mockApiKeyManager.hasKey.mockImplementation(key => key === 'key1');
      
      const available = await discovery.getAvailableTools();
      
      expect(available).toHaveLength(1);
      expect(available[0].name).toBe('tool1');
    });
    
    it('should handle servers without required keys', async () => {
      const mockTools = [
        { name: 'tool1', serverId: 'server1' }
      ];
      
      mockToolCache.getAllTools.mockReturnValue(mockTools);
      mockGatewayService.servers.set('server1', {});
      
      const available = await discovery.getAvailableTools();
      
      expect(available).toHaveLength(1);
    });
  });
  
  describe('lazyDiscoverTools', () => {
    it('should perform discovery and cache result', async () => {
      const mockTools = [{ name: 'tool1' }];
      mockGatewayService.ensureServerStarted.mockResolvedValue(true);
      mockGatewayService.listTools.mockResolvedValue(mockTools);
      
      const tools = await discovery.lazyDiscoverTools('server1');
      
      expect(mockGatewayService.ensureServerStarted).toHaveBeenCalledWith('server1');
      expect(mockGatewayService.listTools).toHaveBeenCalledWith('server1');
      expect(mockToolCache.updateServerTools).toHaveBeenCalledWith('server1', mockTools);
      expect(tools).toEqual(mockTools);
    });
    
    it('should handle concurrent discoveries', async () => {
      const mockTools = [{ name: 'tool1' }];
      mockGatewayService.ensureServerStarted.mockResolvedValue(true);
      mockGatewayService.listTools.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(mockTools), 100))
      );
      
      // Start two discoveries at the same time
      const promise1 = discovery.lazyDiscoverTools('server1');
      const promise2 = discovery.lazyDiscoverTools('server1');
      
      const [tools1, tools2] = await Promise.all([promise1, promise2]);
      
      // Should only call once due to deduplication
      expect(mockGatewayService.listTools).toHaveBeenCalledTimes(1);
      expect(tools1).toEqual(tools2);
    });
    
    it('should emit discovery event', async () => {
      const mockTools = [{ name: 'tool1', description: 'Test tool' }];
      mockGatewayService.ensureServerStarted.mockResolvedValue(true);
      mockGatewayService.listTools.mockResolvedValue(mockTools);
      
      const emitSpy = jest.spyOn(discovery, 'emit');
      await discovery.lazyDiscoverTools('server1');
      
      expect(emitSpy).toHaveBeenCalledWith('tools-discovered', {
        serverId: 'server1',
        toolCount: 1,
        tools: [{ name: 'tool1', description: 'Test tool' }]
      });
    });
  });
  
  describe('handleLazyToolCall', () => {
    it('should find and call tool', async () => {
      const mockTools = [{ name: 'tool1', serverId: 'server1' }];
      mockToolCache.getAllTools.mockReturnValue(mockTools);
      discovery.needsStartup = jest.fn().mockReturnValue(false);
      mockGatewayService.callTool.mockResolvedValue({ result: 'success' });
      
      const result = await discovery.handleLazyToolCall('tool1', { arg: 'value' });
      
      expect(mockGatewayService.callTool).toHaveBeenCalledWith('tool1', { arg: 'value' });
      expect(result).toEqual({ result: 'success' });
    });
    
    it('should start server if needed', async () => {
      const mockTools = [{ name: 'tool1', serverId: 'server1' }];
      mockToolCache.getAllTools.mockReturnValue(mockTools);
      discovery.needsStartup = jest.fn().mockReturnValue(true);
      discovery.lazyDiscoverTools = jest.fn().mockResolvedValue([{ name: 'tool1' }]);
      mockGatewayService.callTool.mockResolvedValue({ result: 'success' });
      
      await discovery.handleLazyToolCall('tool1', {});
      
      expect(discovery.lazyDiscoverTools).toHaveBeenCalledWith('server1');
    });
    
    it('should throw if tool not found', async () => {
      mockToolCache.getAllTools.mockReturnValue([]);
      
      await expect(discovery.handleLazyToolCall('unknown', {}))
        .rejects.toThrow("Tool 'unknown' not found in any server");
    });
  });
  
  describe('verifyToolsOnStartup', () => {
    it('should compare cached and actual tools', async () => {
      const cachedTools = [{ name: 'tool1' }, { name: 'tool2' }];
      const actualTools = [{ name: 'tool2' }, { name: 'tool3' }];
      
      mockToolCache.getServerTools.mockReturnValue(cachedTools);
      mockGatewayService.listTools.mockResolvedValue(actualTools);
      
      const result = await discovery.verifyToolsOnStartup('server1');
      
      expect(result.verified).toBe(true);
      expect(result.added).toHaveLength(1);
      expect(result.removed).toHaveLength(1);
      expect(result.total).toBe(2);
    });
    
    it('should handle no cached tools', async () => {
      const actualTools = [{ name: 'tool1' }];
      
      mockToolCache.getServerTools.mockReturnValue(null);
      mockGatewayService.listTools.mockResolvedValue(actualTools);
      
      const result = await discovery.verifyToolsOnStartup('server1');
      
      expect(result.added).toHaveLength(1);
      expect(result.removed).toHaveLength(0);
    });
  });
  
  describe('handleToolChanges', () => {
    it('should emit events for tool changes', () => {
      const oldTools = [{ name: 'tool1' }, { name: 'tool2' }];
      const newTools = [{ name: 'tool2' }, { name: 'tool3' }];
      
      const emitSpy = jest.spyOn(discovery, 'emit');
      discovery.handleToolChanges('server1', oldTools, newTools);
      
      expect(emitSpy).toHaveBeenCalledWith('tools-added', {
        serverId: 'server1',
        tools: [{ name: 'tool3' }]
      });
      expect(emitSpy).toHaveBeenCalledWith('tools-removed', {
        serverId: 'server1',
        tools: [{ name: 'tool1' }]
      });
      expect(mockToolCache.updateServerTools).toHaveBeenCalledWith('server1', newTools);
    });
  });
  
  describe('enrichResponseWithDiscovery', () => {
    it('should add discovery metadata to response', () => {
      const response = { result: 'data' };
      const discoveredTools = [{ name: 'tool1', description: 'Test' }];
      
      const enriched = discovery.enrichResponseWithDiscovery(response, discoveredTools);
      
      expect(enriched.result).toBe('data');
      expect(enriched._discovery).toBeDefined();
      expect(enriched._discovery.newToolsDiscovered).toBe(1);
      expect(enriched._discovery.tools).toHaveLength(1);
    });
    
    it('should handle null inputs', () => {
      expect(discovery.enrichResponseWithDiscovery(null, [])).toBeNull();
      expect(discovery.enrichResponseWithDiscovery({}, null)).toEqual({});
    });
  });
  
  describe('needsStartup', () => {
    it('should return true if server not registered', () => {
      expect(discovery.needsStartup('unknown')).toBe(true);
    });
    
    it('should return true if no cached tools', () => {
      mockGatewayService.servers.set('server1', {});
      mockToolCache.getServerTools.mockReturnValue(null);
      
      expect(discovery.needsStartup('server1')).toBe(true);
    });
    
    it('should return true if server not connected', () => {
      mockGatewayService.servers.set('server1', { connected: false });
      mockToolCache.getServerTools.mockReturnValue([{ name: 'tool1' }]);
      
      expect(discovery.needsStartup('server1')).toBe(true);
    });
    
    it('should return false if server is ready', () => {
      mockGatewayService.servers.set('server1', { connected: true });
      mockToolCache.getServerTools.mockReturnValue([{ name: 'tool1' }]);
      
      expect(discovery.needsStartup('server1')).toBe(false);
    });
  });
  
  describe('waitForDiscovery', () => {
    it('should wait for pending discovery', async () => {
      const mockPromise = Promise.resolve([{ name: 'tool1' }]);
      discovery.pendingDiscoveries.set('server1', mockPromise);
      
      const result = await discovery.waitForDiscovery('server1');
      
      expect(result).toEqual([{ name: 'tool1' }]);
    });
    
    it('should return cached tools if no pending discovery', async () => {
      const cachedTools = [{ name: 'tool1' }];
      mockToolCache.getServerTools.mockReturnValue(cachedTools);
      
      const result = await discovery.waitForDiscovery('server1');
      
      expect(result).toEqual(cachedTools);
    });
  });
});