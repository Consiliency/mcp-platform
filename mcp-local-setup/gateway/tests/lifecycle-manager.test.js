const LifecycleManager = require('../lifecycle-manager');

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

describe('LifecycleManager', () => {
  let manager;
  
  beforeEach(() => {
    jest.clearAllTimers();
    manager = new LifecycleManager();
  });
  
  afterEach(() => {
    manager.stop();
  });
  
  describe('constructor', () => {
    it('should initialize with correct properties', () => {
      expect(manager.idleTimeout).toBe(2 * 60 * 60 * 1000);
      expect(manager.servers).toBeInstanceOf(Map);
      expect(manager.cleanupIntervalMs).toBe(5 * 60 * 1000);
    });
  });
  
  describe('start/stop', () => {
    it('should start cleanup interval', () => {
      manager.start();
      
      expect(manager.cleanupInterval).toBeTruthy();
      
      // Advance timer and check if checkIdleServers is called
      const spy = jest.spyOn(manager, 'checkIdleServers');
      jest.advanceTimersByTime(manager.cleanupIntervalMs);
      
      expect(spy).toHaveBeenCalled();
    });
    
    it('should not start if already started', () => {
      manager.start();
      const interval = manager.cleanupInterval;
      
      manager.start();
      expect(manager.cleanupInterval).toBe(interval);
    });
    
    it('should stop cleanup interval and clear timeouts', () => {
      manager.start();
      
      // Add a server with timeout
      manager.servers.set('server1', {
        lastUsed: new Date(),
        clients: new Set(),
        timeout: setTimeout(() => {}, 1000)
      });
      
      manager.stop();
      
      expect(manager.cleanupInterval).toBeNull();
      expect(manager.servers.size).toBe(0);
    });
  });
  
  describe('registerActivity', () => {
    it('should create new server entry', () => {
      manager.registerActivity('server1', 'client1');
      
      const serverData = manager.servers.get('server1');
      expect(serverData).toBeDefined();
      expect(serverData.clients.has('client1')).toBe(true);
      expect(serverData.lastUsed).toBeInstanceOf(Date);
    });
    
    it('should update existing server', () => {
      manager.registerActivity('server1', 'client1');
      const firstTime = manager.servers.get('server1').lastUsed;
      
      // Wait a bit and register again
      jest.advanceTimersByTime(1000);
      manager.registerActivity('server1', 'client2');
      
      const serverData = manager.servers.get('server1');
      expect(serverData.clients.size).toBe(2);
      expect(serverData.lastUsed.getTime()).toBeGreaterThan(firstTime.getTime());
    });
    
    it('should cancel pending cleanup', () => {
      const timeout = setTimeout(() => {}, 1000);
      const serverData = {
        lastUsed: new Date(),
        clients: new Set(),
        timeout: timeout
      };
      manager.servers.set('server1', serverData);
      
      const clearSpy = jest.spyOn(global, 'clearTimeout');
      manager.registerActivity('server1', 'client1');
      
      expect(clearSpy).toHaveBeenCalled();
      expect(manager.servers.get('server1').timeout).toBeNull();
    });
  });
  
  describe('unregisterClient', () => {
    it('should remove client from all servers', () => {
      manager.registerActivity('server1', 'client1');
      manager.registerActivity('server2', 'client1');
      manager.registerActivity('server2', 'client2');
      
      const affected = manager.unregisterClient('client1');
      
      expect(affected).toEqual(['server1', 'server2']);
      expect(manager.servers.get('server1').clients.size).toBe(0);
      expect(manager.servers.get('server2').clients.size).toBe(1);
    });
    
    it('should schedule cleanup for servers with no clients', () => {
      manager.registerActivity('server1', 'client1');
      const spy = jest.spyOn(manager, 'scheduleCleanup');
      
      manager.unregisterClient('client1');
      
      expect(spy).toHaveBeenCalledWith('server1');
    });
  });
  
  describe('shouldKeepAlive', () => {
    it('should keep alive server with active clients', () => {
      manager.registerActivity('server1', 'client1');
      
      expect(manager.shouldKeepAlive('server1')).toBe(true);
    });
    
    it('should keep alive recently used server', () => {
      manager.servers.set('server1', {
        lastUsed: new Date(),
        clients: new Set(),
        timeout: null
      });
      
      expect(manager.shouldKeepAlive('server1')).toBe(true);
    });
    
    it('should not keep alive idle server', () => {
      manager.servers.set('server1', {
        lastUsed: new Date(Date.now() - 3 * 60 * 60 * 1000), // 3 hours ago
        clients: new Set(),
        timeout: null
      });
      
      expect(manager.shouldKeepAlive('server1')).toBe(false);
    });
    
    it('should return false for unknown server', () => {
      expect(manager.shouldKeepAlive('unknown')).toBe(false);
    });
  });
  
  describe('scheduleCleanup', () => {
    it('should schedule cleanup timeout', () => {
      manager.servers.set('server1', {
        lastUsed: new Date(),
        clients: new Set(),
        timeout: null
      });
      
      const setSpy = jest.spyOn(global, 'setTimeout');
      manager.scheduleCleanup('server1');
      
      expect(setSpy).toHaveBeenCalledWith(expect.any(Function), manager.idleTimeout);
      expect(manager.servers.get('server1').timeout).toBeTruthy();
    });
    
    it('should not schedule if already scheduled', () => {
      const timeout = setTimeout(() => {}, 1000);
      manager.servers.set('server1', {
        lastUsed: new Date(),
        clients: new Set(),
        timeout
      });
      
      manager.scheduleCleanup('server1');
      
      expect(manager.servers.get('server1').timeout).toBe(timeout);
    });
    
    it('should emit cleanup event after timeout', () => {
      manager.servers.set('server1', {
        lastUsed: new Date(Date.now() - 3 * 60 * 60 * 1000),
        clients: new Set(),
        timeout: null
      });
      
      const emitSpy = jest.spyOn(manager, 'emit');
      manager.scheduleCleanup('server1');
      
      jest.runAllTimers();
      
      expect(emitSpy).toHaveBeenCalledWith('cleanup', 'server1');
      expect(manager.servers.has('server1')).toBe(false);
    });
  });
  
  describe('cancelCleanup', () => {
    it('should cancel scheduled cleanup', () => {
      const timeout = setTimeout(() => {}, 1000);
      manager.servers.set('server1', {
        lastUsed: new Date(),
        clients: new Set(),
        timeout
      });
      
      const clearSpy = jest.spyOn(global, 'clearTimeout');
      manager.cancelCleanup('server1');
      
      expect(clearSpy).toHaveBeenCalledWith(timeout);
      expect(manager.servers.get('server1').timeout).toBeNull();
    });
  });
  
  describe('getUsageStats', () => {
    it('should return usage statistics', () => {
      const now = new Date();
      manager.servers.set('server1', {
        lastUsed: new Date(now - 30 * 60 * 1000), // 30 minutes ago
        clients: new Set(['client1']),
        timeout: null
      });
      
      const stats = manager.getUsageStats();
      
      expect(stats.server1).toBeDefined();
      expect(stats.server1.activeClients).toBe(1);
      expect(stats.server1.idleTimeReadable).toMatch(/30m/);
      expect(stats.server1.willBeCleanedUp).toBe(false);
    });
  });
  
  describe('forceCleanup', () => {
    it('should cleanup all idle servers', () => {
      manager.servers.set('server1', {
        lastUsed: new Date(Date.now() - 3 * 60 * 60 * 1000),
        clients: new Set(),
        timeout: setTimeout(() => {}, 1000)
      });
      manager.servers.set('server2', {
        lastUsed: new Date(),
        clients: new Set(['client1']),
        timeout: null
      });
      
      const emitSpy = jest.spyOn(manager, 'emit');
      const cleaned = manager.forceCleanup();
      
      expect(cleaned).toEqual(['server1']);
      expect(manager.servers.has('server1')).toBe(false);
      expect(manager.servers.has('server2')).toBe(true);
      expect(emitSpy).toHaveBeenCalledWith('cleanup', 'server1');
    });
  });
  
  describe('checkIdleServers', () => {
    it('should cleanup immediately idle servers', () => {
      manager.start();
      
      manager.servers.set('server1', {
        lastUsed: new Date(Date.now() - 3 * 60 * 60 * 1000),
        clients: new Set(),
        timeout: null
      });
      
      const emitSpy = jest.spyOn(manager, 'emit');
      manager.checkIdleServers();
      
      expect(emitSpy).toHaveBeenCalledWith('cleanup', 'server1');
      expect(manager.servers.has('server1')).toBe(false);
    });
  });
  
  describe('formatDuration', () => {
    it('should format duration correctly', () => {
      expect(manager.formatDuration(5000)).toBe('5s');
      expect(manager.formatDuration(65000)).toBe('1m 5s');
      expect(manager.formatDuration(3665000)).toBe('1h 1m');
    });
  });
});