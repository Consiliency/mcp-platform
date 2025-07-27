const ApiKeyValidator = require('../api-key-validator');

// Mock API key manager
const mockApiKeyManager = {
  hasKey: jest.fn(),
  getServerConfig: jest.fn(),
  updateKey: jest.fn()
};

// Mock timers
jest.useFakeTimers();

// Suppress console logs in tests
const originalLog = console.log;
beforeAll(() => {
  console.log = jest.fn();
});
afterAll(() => {
  console.log = originalLog;
});

describe('ApiKeyValidator', () => {
  let validator;
  
  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    validator = new ApiKeyValidator(mockApiKeyManager);
  });
  
  afterEach(() => {
    validator.destroy();
  });
  
  describe('constructor', () => {
    it('should initialize with correct properties', () => {
      expect(validator.apiKeyManager).toBe(mockApiKeyManager);
      expect(validator.toolRequirements).toBeInstanceOf(Map);
      expect(validator.validationCache).toBeInstanceOf(Map);
      expect(validator.cacheTimeout).toBe(60000);
      expect(validator.cacheCleanupInterval).toBeTruthy();
    });
  });
  
  describe('validateServerKeys', () => {
    it('should validate server with all required keys', async () => {
      mockApiKeyManager.getServerConfig.mockReturnValue({
        requiredKeys: ['key1', 'key2']
      });
      mockApiKeyManager.hasKey.mockReturnValue(true);
      
      const result = await validator.validateServerKeys('server1');
      
      expect(result.valid).toBe(true);
      expect(result.missingKeys).toEqual([]);
      expect(result.requiredKeys).toEqual(['key1', 'key2']);
    });
    
    it('should detect missing keys', async () => {
      mockApiKeyManager.getServerConfig.mockReturnValue({
        requiredKeys: ['key1', 'key2']
      });
      mockApiKeyManager.hasKey.mockImplementation(key => key === 'key1');
      
      const result = await validator.validateServerKeys('server1');
      
      expect(result.valid).toBe(false);
      expect(result.missingKeys).toEqual(['key2']);
    });
    
    it('should use cached result within timeout', async () => {
      mockApiKeyManager.getServerConfig.mockReturnValue({
        requiredKeys: ['key1']
      });
      mockApiKeyManager.hasKey.mockReturnValue(true);
      
      // First call
      await validator.validateServerKeys('server1');
      mockApiKeyManager.getServerConfig.mockClear();
      
      // Second call - should use cache
      await validator.validateServerKeys('server1');
      
      expect(mockApiKeyManager.getServerConfig).not.toHaveBeenCalled();
    });
    
    it('should refresh cache after timeout', async () => {
      mockApiKeyManager.getServerConfig.mockReturnValue({
        requiredKeys: ['key1']
      });
      mockApiKeyManager.hasKey.mockReturnValue(true);
      
      // First call
      await validator.validateServerKeys('server1');
      
      // Advance time past cache timeout
      jest.advanceTimersByTime(61000);
      
      // Second call - should refresh
      await validator.validateServerKeys('server1');
      
      expect(mockApiKeyManager.getServerConfig).toHaveBeenCalledTimes(2);
    });
    
    it('should handle missing server config', async () => {
      mockApiKeyManager.getServerConfig.mockReturnValue(null);
      
      const result = await validator.validateServerKeys('server1');
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Server configuration not found');
    });
  });
  
  describe('filterToolsByAvailability', () => {
    it('should filter tools with available keys', () => {
      const tools = [
        { name: 'tool1' },
        { name: 'tool2' }
      ];
      
      validator.registerToolRequirements('tool1', ['key1']);
      validator.registerToolRequirements('tool2', ['key2']);
      mockApiKeyManager.hasKey.mockImplementation(key => key === 'key1');
      
      const available = validator.filterToolsByAvailability(tools);
      
      expect(available).toHaveLength(1);
      expect(available[0].name).toBe('tool1');
    });
    
    it('should include tools without requirements', () => {
      const tools = [{ name: 'tool1' }];
      
      const available = validator.filterToolsByAvailability(tools);
      
      expect(available).toHaveLength(1);
    });
  });
  
  describe('registerToolRequirements', () => {
    it('should register tool requirements', () => {
      validator.registerToolRequirements('tool1', ['key1', 'key2']);
      
      expect(validator.toolRequirements.get('tool1')).toEqual(['key1', 'key2']);
    });
    
    it('should handle single key as array', () => {
      validator.registerToolRequirements('tool1', 'key1');
      
      expect(validator.toolRequirements.get('tool1')).toEqual(['key1']);
    });
    
    it('should emit requirements-registered event', () => {
      const emitSpy = jest.spyOn(validator, 'emit');
      
      validator.registerToolRequirements('tool1', ['key1']);
      
      expect(emitSpy).toHaveBeenCalledWith('requirements-registered', {
        toolName: 'tool1',
        requiredKeys: ['key1']
      });
    });
  });
  
  describe('generateMissingKeyError', () => {
    it('should generate helpful error message', () => {
      const error = validator.generateMissingKeyError('tool1', ['key1', 'key2']);
      
      expect(error.error).toBe('MISSING_API_KEYS');
      expect(error.message).toContain("Cannot call tool 'tool1'");
      expect(error.message).toContain('key1');
      expect(error.message).toContain('key2');
      expect(error.message).toContain('KEY1_API_KEY');
      expect(error.message).toContain('KEY2_API_KEY');
      expect(error.missingKeys).toEqual(['key1', 'key2']);
    });
    
    it('should handle empty missing keys', () => {
      const error = validator.generateMissingKeyError('tool1', []);
      
      expect(error).toBeNull();
    });
  });
  
  describe('handleKeyUpdate', () => {
    it('should update key and clear affected caches', async () => {
      // Set up some cached validations
      validator.validationCache.set('server1', {
        result: { requiredKeys: ['key1'] },
        timestamp: Date.now()
      });
      validator.validationCache.set('server2', {
        result: { requiredKeys: ['key2'] },
        timestamp: Date.now()
      });
      
      // Register tool requirements
      validator.registerToolRequirements('tool1', ['key1']);
      validator.registerToolRequirements('tool2', ['key1']);
      
      const emitSpy = jest.spyOn(validator, 'emit');
      
      await validator.handleKeyUpdate('key1', 'new-value');
      
      expect(mockApiKeyManager.updateKey).toHaveBeenCalledWith('key1', 'new-value');
      expect(validator.validationCache.has('server1')).toBe(false);
      expect(validator.validationCache.has('server2')).toBe(true);
      expect(emitSpy).toHaveBeenCalledWith('key-updated', {
        keyName: 'key1',
        affectedServers: ['server1'],
        affectedTools: ['tool1', 'tool2'],
        timestamp: expect.any(String)
      });
    });
  });
  
  describe('canCallTool', () => {
    it('should allow tool with all required keys', () => {
      validator.registerToolRequirements('tool1', ['key1']);
      mockApiKeyManager.hasKey.mockReturnValue(true);
      
      const result = validator.canCallTool('tool1');
      
      expect(result.canCall).toBe(true);
    });
    
    it('should block tool with missing keys', () => {
      validator.registerToolRequirements('tool1', ['key1', 'key2']);
      mockApiKeyManager.hasKey.mockImplementation(key => key === 'key1');
      
      const result = validator.canCallTool('tool1');
      
      expect(result.canCall).toBe(false);
      expect(result.missingKeys).toEqual(['key2']);
      expect(result.error).toBeDefined();
    });
    
    it('should allow tool without requirements', () => {
      const result = validator.canCallTool('tool1');
      
      expect(result.canCall).toBe(true);
    });
  });
  
  describe('getMissingKeys', () => {
    it('should return missing keys for server', async () => {
      mockApiKeyManager.getServerConfig.mockReturnValue({
        requiredKeys: ['key1', 'key2']
      });
      mockApiKeyManager.hasKey.mockImplementation(key => key === 'key1');
      
      const missing = await validator.getMissingKeys('server1');
      
      expect(missing).toEqual(['key2']);
    });
  });
  
  describe('clearCache', () => {
    it('should clear cache for specific server', () => {
      validator.validationCache.set('server1', { result: {}, timestamp: Date.now() });
      validator.validationCache.set('server2', { result: {}, timestamp: Date.now() });
      
      validator.clearCache('server1');
      
      expect(validator.validationCache.has('server1')).toBe(false);
      expect(validator.validationCache.has('server2')).toBe(true);
    });
    
    it('should clear all cache if no server specified', () => {
      validator.validationCache.set('server1', { result: {}, timestamp: Date.now() });
      validator.validationCache.set('server2', { result: {}, timestamp: Date.now() });
      
      validator.clearCache();
      
      expect(validator.validationCache.size).toBe(0);
    });
  });
  
  describe('_cleanupCache', () => {
    it('should remove expired cache entries', () => {
      const now = Date.now();
      validator.validationCache.set('server1', {
        result: {},
        timestamp: now - 70000 // Expired
      });
      validator.validationCache.set('server2', {
        result: {},
        timestamp: now - 30000 // Still valid
      });
      
      validator._cleanupCache();
      
      expect(validator.validationCache.has('server1')).toBe(false);
      expect(validator.validationCache.has('server2')).toBe(true);
    });
  });
  
  describe('_getEnvVarName', () => {
    it('should convert key name to env var format', () => {
      expect(validator._getEnvVarName('openai')).toBe('OPENAI_API_KEY');
      expect(validator._getEnvVarName('claude-ai')).toBe('CLAUDE_AI_API_KEY');
      expect(validator._getEnvVarName('test.key')).toBe('TEST_KEY_API_KEY');
    });
  });
  
  describe('destroy', () => {
    it('should cleanup resources', () => {
      validator.validationCache.set('server1', { result: {}, timestamp: Date.now() });
      validator.toolRequirements.set('tool1', ['key1']);
      
      const clearSpy = jest.spyOn(global, 'clearInterval');
      validator.destroy();
      
      expect(clearSpy).toHaveBeenCalled();
      expect(validator.cacheCleanupInterval).toBeNull();
      expect(validator.validationCache.size).toBe(0);
      expect(validator.toolRequirements.size).toBe(0);
    });
  });
});