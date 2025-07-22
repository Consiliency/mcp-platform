/**
 * Unit tests for cli/commands/health.js
 */

const axios = require('axios');
const chalk = require('chalk');
const ora = require('ora');

// Mock dependencies
jest.mock('axios');
jest.mock('chalk', () => ({
  green: jest.fn(text => `[GREEN]${text}[/GREEN]`),
  yellow: jest.fn(text => `[YELLOW]${text}[/YELLOW]`),
  red: jest.fn(text => `[RED]${text}[/RED]`),
  gray: jest.fn(text => `[GRAY]${text}[/GRAY]`),
  bold: jest.fn(text => `[BOLD]${text}[/BOLD]`),
  cyan: jest.fn(text => `[CYAN]${text}[/CYAN]`)
}));
jest.mock('ora', () => {
  const mockOra = {
    start: jest.fn().mockReturnThis(),
    succeed: jest.fn().mockReturnThis(),
    fail: jest.fn().mockReturnThis(),
    stop: jest.fn().mockReturnThis()
  };
  return jest.fn(() => mockOra);
});
jest.mock('cli-table3');

const {
  getStatusColor,
  formatUptime,
  showSystemHealth,
  showServiceHealth,
  showDetailedHealth,
  addHealthCommand
} = require('../../cli/commands/health');

describe('Health Command Functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getStatusColor', () => {
    it('should return green for healthy status', () => {
      const result = getStatusColor('healthy');
      expect(chalk.green).toHaveBeenCalledWith('● healthy');
      expect(result).toBe('[GREEN]● healthy[/GREEN]');
    });

    it('should return yellow for degraded status', () => {
      const result = getStatusColor('degraded');
      expect(chalk.yellow).toHaveBeenCalledWith('● degraded');
      expect(result).toBe('[YELLOW]● degraded[/YELLOW]');
    });

    it('should return red for unhealthy status', () => {
      const result = getStatusColor('unhealthy');
      expect(chalk.red).toHaveBeenCalledWith('● unhealthy');
      expect(result).toBe('[RED]● unhealthy[/RED]');
    });

    it('should return gray for unknown status', () => {
      const result = getStatusColor('unknown');
      expect(chalk.gray).toHaveBeenCalledWith('● unknown');
      expect(result).toBe('[GRAY]● unknown[/GRAY]');
    });
  });

  describe('formatUptime', () => {
    it('should format seconds into readable uptime', () => {
      expect(formatUptime(90061)).toBe('1d 1h 1m');
      expect(formatUptime(3661)).toBe('1h 1m');
      expect(formatUptime(61)).toBe('1m');
      expect(formatUptime(30)).toBe('< 1m');
      expect(formatUptime(0)).toBe('< 1m');
    });

    it('should handle null or undefined uptime', () => {
      expect(formatUptime(null)).toBe('N/A');
      expect(formatUptime(undefined)).toBe('N/A');
    });

    it('should handle large uptimes correctly', () => {
      expect(formatUptime(864000)).toBe('10d'); // 10 days
      expect(formatUptime(172800)).toBe('2d'); // 2 days
    });
  });

  describe('showSystemHealth', () => {
    it('should display system health successfully', async () => {
      const mockHealthData = {
        status: 'healthy',
        services: {
          'service1': { status: 'healthy', uptime: 3600 },
          'service2': { status: 'degraded', uptime: 7200 }
        },
        timestamp: new Date().toISOString()
      };

      axios.get.mockResolvedValue({ data: mockHealthData });

      await showSystemHealth();

      expect(axios.get).toHaveBeenCalledWith('http://localhost:8080/health');
      expect(ora().succeed).toHaveBeenCalled();
    });

    it('should handle API errors gracefully', async () => {
      axios.get.mockRejectedValue(new Error('Connection refused'));

      await showSystemHealth();

      expect(ora().fail).toHaveBeenCalledWith('Failed to check system health');
    });

    it('should handle empty service list', async () => {
      const mockHealthData = {
        status: 'healthy',
        services: {},
        timestamp: new Date().toISOString()
      };

      axios.get.mockResolvedValue({ data: mockHealthData });

      await showSystemHealth();

      expect(ora().succeed).toHaveBeenCalled();
    });
  });

  describe('showServiceHealth', () => {
    it('should display individual service health', async () => {
      const mockServiceHealth = {
        service: 'test-service',
        status: 'healthy',
        version: '1.0.0',
        uptime: 3600,
        checks: {
          'database': { status: 'healthy', message: 'Connected' },
          'cache': { status: 'healthy', message: 'Ready' }
        }
      };

      axios.get.mockResolvedValue({ data: mockServiceHealth });

      await showServiceHealth('test-service');

      expect(axios.get).toHaveBeenCalledWith('http://localhost:8080/health/service/test-service');
      expect(ora().succeed).toHaveBeenCalled();
    });

    it('should handle service not found', async () => {
      axios.get.mockRejectedValue({
        response: {
          status: 404,
          data: { error: 'Service not found' }
        }
      });

      await showServiceHealth('non-existent');

      expect(ora().fail).toHaveBeenCalledWith('Service non-existent not found');
    });

    it('should display health checks if available', async () => {
      const mockServiceHealth = {
        service: 'test-service',
        status: 'degraded',
        checks: {
          'api': { status: 'healthy', message: 'OK' },
          'database': { status: 'unhealthy', message: 'Connection timeout' }
        }
      };

      axios.get.mockResolvedValue({ data: mockServiceHealth });

      await showServiceHealth('test-service');

      expect(ora().succeed).toHaveBeenCalled();
    });
  });

  describe('showDetailedHealth', () => {
    it('should display detailed health information', async () => {
      const mockDetailedHealth = {
        system: {
          status: 'healthy',
          uptime: 86400,
          memory: { used: 512, total: 1024 },
          cpu: { usage: 25 }
        },
        services: {
          'service1': {
            status: 'healthy',
            uptime: 3600,
            memory: { used: 256, total: 512 },
            connections: 10
          }
        },
        infrastructure: {
          docker: { status: 'healthy', version: '20.10.0' },
          network: { status: 'healthy', latency: 5 }
        }
      };

      axios.get.mockResolvedValue({ data: mockDetailedHealth });

      await showDetailedHealth();

      expect(axios.get).toHaveBeenCalledWith('http://localhost:8080/health/detailed');
      expect(ora().succeed).toHaveBeenCalled();
    });

    it('should handle missing infrastructure data', async () => {
      const mockDetailedHealth = {
        system: { status: 'healthy' },
        services: {},
        infrastructure: {}
      };

      axios.get.mockResolvedValue({ data: mockDetailedHealth });

      await showDetailedHealth();

      expect(ora().succeed).toHaveBeenCalled();
    });
  });

  describe('addHealthCommand', () => {
    it('should add health command to program', () => {
      const mockProgram = {
        command: jest.fn().mockReturnThis(),
        description: jest.fn().mockReturnThis(),
        option: jest.fn().mockReturnThis(),
        action: jest.fn().mockReturnThis()
      };

      addHealthCommand(mockProgram);

      expect(mockProgram.command).toHaveBeenCalledWith('health');
      expect(mockProgram.description).toHaveBeenCalledWith('Check health status of MCP services');
      expect(mockProgram.option).toHaveBeenCalledWith('-s, --service <name>', 'Check specific service health');
      expect(mockProgram.option).toHaveBeenCalledWith('-d, --detailed', 'Show detailed health information');
    });

    it('should handle health command with service option', async () => {
      const mockProgram = {
        command: jest.fn().mockReturnThis(),
        description: jest.fn().mockReturnThis(),
        option: jest.fn().mockReturnThis(),
        action: jest.fn((callback) => {
          // Simulate calling the action with service option
          callback({ service: 'test-service' });
          return mockProgram;
        })
      };

      const mockServiceHealth = {
        service: 'test-service',
        status: 'healthy'
      };

      axios.get.mockResolvedValue({ data: mockServiceHealth });

      addHealthCommand(mockProgram);

      expect(axios.get).toHaveBeenCalledWith('http://localhost:8080/health/service/test-service');
    });

    it('should handle health command with detailed option', async () => {
      const mockProgram = {
        command: jest.fn().mockReturnThis(),
        description: jest.fn().mockReturnThis(),
        option: jest.fn().mockReturnThis(),
        action: jest.fn((callback) => {
          // Simulate calling the action with detailed option
          callback({ detailed: true });
          return mockProgram;
        })
      };

      const mockDetailedHealth = {
        system: { status: 'healthy' },
        services: {}
      };

      axios.get.mockResolvedValue({ data: mockDetailedHealth });

      addHealthCommand(mockProgram);

      expect(axios.get).toHaveBeenCalledWith('http://localhost:8080/health/detailed');
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors', async () => {
      axios.get.mockRejectedValue({
        code: 'ECONNREFUSED',
        message: 'connect ECONNREFUSED 127.0.0.1:8080'
      });

      await showSystemHealth();

      expect(ora().fail).toHaveBeenCalledWith('Failed to check system health');
    });

    it('should handle malformed response data', async () => {
      axios.get.mockResolvedValue({ data: null });

      await showSystemHealth();

      expect(ora().fail).toHaveBeenCalled();
    });

    it('should handle timeout errors', async () => {
      axios.get.mockRejectedValue({
        code: 'ECONNABORTED',
        message: 'timeout of 5000ms exceeded'
      });

      await showServiceHealth('slow-service');

      expect(ora().fail).toHaveBeenCalled();
    });
  });
});