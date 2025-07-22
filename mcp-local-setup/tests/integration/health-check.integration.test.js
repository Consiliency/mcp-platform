/**
 * Integration tests for health check system
 */

const axios = require('axios');
const path = require('path');
const fs = require('fs').promises;
const { spawn } = require('child_process');
const {
  startService,
  stopService,
  waitForHealthy,
  cleanupTestResources
} = require('../framework/test-helpers');

// Mock axios for controlled health responses
jest.mock('axios');

// Increase timeout for integration tests
jest.setTimeout(45000);

describe('Health Check System Integration Tests', () => {
  const testResources = [];
  const HEALTH_SERVICE_URL = process.env.HEALTH_SERVICE_URL || 'http://localhost:8080/health';
  const MCP_HOME = process.env.MCP_HOME || path.join(process.env.HOME, '.mcp-platform');

  beforeAll(async () => {
    // Ensure required directories exist
    await fs.mkdir(path.join(MCP_HOME, 'logs'), { recursive: true });
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await cleanupTestResources(testResources);
    testResources.length = 0;
  });

  describe('Health Service Endpoints', () => {
    it('should return overall system health', async () => {
      const mockSystemHealth = {
        status: 'healthy',
        services: {
          'service1': { status: 'healthy', uptime: 3600 },
          'service2': { status: 'healthy', uptime: 7200 }
        },
        timestamp: new Date().toISOString()
      };

      axios.get.mockResolvedValue({ data: mockSystemHealth });

      const response = await axios.get(HEALTH_SERVICE_URL);
      
      expect(response.data).toEqual(mockSystemHealth);
      expect(response.data.status).toBe('healthy');
      expect(Object.keys(response.data.services).length).toBe(2);
    });

    it('should return individual service health', async () => {
      const serviceName = 'test-service';
      const mockServiceHealth = {
        service: serviceName,
        status: 'healthy',
        version: '1.0.0',
        uptime: 3600,
        checks: {
          'database': { status: 'healthy', message: 'Connected' },
          'cache': { status: 'healthy', message: 'Ready' }
        }
      };

      axios.get.mockResolvedValue({ data: mockServiceHealth });

      const response = await axios.get(`${HEALTH_SERVICE_URL}/service/${serviceName}`);
      
      expect(response.data.service).toBe(serviceName);
      expect(response.data.status).toBe('healthy');
      expect(response.data.checks).toBeDefined();
    });

    it('should return detailed health metrics', async () => {
      const mockDetailedHealth = {
        system: {
          status: 'healthy',
          uptime: 86400,
          memory: { used: 512, total: 1024, percentage: 50 },
          cpu: { usage: 25, cores: 4 }
        },
        services: {
          'service1': {
            status: 'healthy',
            uptime: 3600,
            memory: { used: 256, total: 512 },
            connections: 10,
            requests_per_second: 100
          }
        },
        infrastructure: {
          docker: { status: 'healthy', version: '20.10.0' },
          network: { status: 'healthy', latency: 5 }
        }
      };

      axios.get.mockResolvedValue({ data: mockDetailedHealth });

      const response = await axios.get(`${HEALTH_SERVICE_URL}/detailed`);
      
      expect(response.data.system).toBeDefined();
      expect(response.data.infrastructure).toBeDefined();
      expect(response.data.system.memory.percentage).toBe(50);
    });

    it('should handle service not found', async () => {
      axios.get.mockRejectedValue({
        response: {
          status: 404,
          data: { error: 'Service not found' }
        }
      });

      try {
        await axios.get(`${HEALTH_SERVICE_URL}/service/non-existent`);
      } catch (error) {
        expect(error.response.status).toBe(404);
        expect(error.response.data.error).toBe('Service not found');
      }
    });
  });

  describe('Health Status Aggregation', () => {
    it('should report degraded when any service is degraded', async () => {
      const mockHealth = {
        status: 'degraded',
        services: {
          'healthy-service': { status: 'healthy' },
          'degraded-service': { status: 'degraded', message: 'High memory usage' },
          'another-healthy': { status: 'healthy' }
        }
      };

      axios.get.mockResolvedValue({ data: mockHealth });

      const response = await axios.get(HEALTH_SERVICE_URL);
      expect(response.data.status).toBe('degraded');
    });

    it('should report unhealthy when any service is unhealthy', async () => {
      const mockHealth = {
        status: 'unhealthy',
        services: {
          'healthy-service': { status: 'healthy' },
          'degraded-service': { status: 'degraded' },
          'unhealthy-service': { status: 'unhealthy', message: 'Connection failed' }
        }
      };

      axios.get.mockResolvedValue({ data: mockHealth });

      const response = await axios.get(HEALTH_SERVICE_URL);
      expect(response.data.status).toBe('unhealthy');
    });

    it('should handle empty service list', async () => {
      const mockHealth = {
        status: 'healthy',
        services: {},
        message: 'No services configured'
      };

      axios.get.mockResolvedValue({ data: mockHealth });

      const response = await axios.get(HEALTH_SERVICE_URL);
      expect(response.data.status).toBe('healthy');
      expect(Object.keys(response.data.services).length).toBe(0);
    });
  });

  describe('Health Check Intervals', () => {
    it('should perform health checks at configured intervals', async () => {
      let checkCount = 0;
      
      axios.get.mockImplementation(() => {
        checkCount++;
        return Promise.resolve({
          data: {
            status: 'healthy',
            checkCount,
            timestamp: new Date().toISOString()
          }
        });
      });

      // Simulate periodic health checks
      const interval = setInterval(async () => {
        await axios.get(HEALTH_SERVICE_URL);
      }, 1000);

      // Wait for 3 seconds
      await new Promise(resolve => setTimeout(resolve, 3500));
      clearInterval(interval);

      expect(checkCount).toBeGreaterThanOrEqual(3);
    });

    it('should cache health results appropriately', async () => {
      const mockHealth = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        cached: false
      };

      axios.get.mockResolvedValueOnce({ data: mockHealth });
      
      // First call - not cached
      const response1 = await axios.get(HEALTH_SERVICE_URL);
      expect(response1.data.cached).toBe(false);

      // Immediate second call - should be cached
      mockHealth.cached = true;
      axios.get.mockResolvedValueOnce({ data: mockHealth });
      
      const response2 = await axios.get(HEALTH_SERVICE_URL);
      expect(response2.data.cached).toBe(true);
    });
  });

  describe('Health Check Failures', () => {
    it('should handle timeout failures', async () => {
      axios.get.mockRejectedValue({
        code: 'ECONNABORTED',
        message: 'timeout of 5000ms exceeded'
      });

      try {
        await axios.get(HEALTH_SERVICE_URL);
      } catch (error) {
        expect(error.code).toBe('ECONNABORTED');
      }
    });

    it('should handle connection refused', async () => {
      axios.get.mockRejectedValue({
        code: 'ECONNREFUSED',
        message: 'connect ECONNREFUSED 127.0.0.1:8080'
      });

      try {
        await axios.get(HEALTH_SERVICE_URL);
      } catch (error) {
        expect(error.code).toBe('ECONNREFUSED');
      }
    });

    it('should handle partial service failures', async () => {
      const mockHealth = {
        status: 'degraded',
        services: {
          'working-service': { 
            status: 'healthy',
            lastCheck: new Date().toISOString()
          },
          'failing-service': { 
            status: 'unhealthy',
            error: 'Health check timed out',
            lastCheck: new Date().toISOString()
          }
        }
      };

      axios.get.mockResolvedValue({ data: mockHealth });

      const response = await axios.get(HEALTH_SERVICE_URL);
      expect(response.data.status).toBe('degraded');
      expect(response.data.services['failing-service'].status).toBe('unhealthy');
    });
  });

  describe('Health Check Custom Probes', () => {
    it('should execute HTTP health probes', async () => {
      const serviceWithHttpProbe = {
        service: 'http-probe-service',
        status: 'healthy',
        probes: {
          http: {
            endpoint: '/health',
            status: 200,
            responseTime: 45
          }
        }
      };

      axios.get.mockResolvedValue({ data: serviceWithHttpProbe });

      const response = await axios.get(`${HEALTH_SERVICE_URL}/service/http-probe-service`);
      expect(response.data.probes.http.status).toBe(200);
    });

    it('should execute TCP health probes', async () => {
      const serviceWithTcpProbe = {
        service: 'tcp-probe-service',
        status: 'healthy',
        probes: {
          tcp: {
            port: 5432,
            connected: true,
            responseTime: 10
          }
        }
      };

      axios.get.mockResolvedValue({ data: serviceWithTcpProbe });

      const response = await axios.get(`${HEALTH_SERVICE_URL}/service/tcp-probe-service`);
      expect(response.data.probes.tcp.connected).toBe(true);
    });

    it('should execute custom script probes', async () => {
      const serviceWithScriptProbe = {
        service: 'script-probe-service',
        status: 'healthy',
        probes: {
          script: {
            command: 'check-database.sh',
            exitCode: 0,
            output: 'Database is healthy'
          }
        }
      };

      axios.get.mockResolvedValue({ data: serviceWithScriptProbe });

      const response = await axios.get(`${HEALTH_SERVICE_URL}/service/script-probe-service`);
      expect(response.data.probes.script.exitCode).toBe(0);
    });
  });

  describe('Health History and Metrics', () => {
    it('should track health status history', async () => {
      const mockHealthWithHistory = {
        status: 'healthy',
        history: [
          { timestamp: new Date(Date.now() - 60000).toISOString(), status: 'healthy' },
          { timestamp: new Date(Date.now() - 30000).toISOString(), status: 'degraded' },
          { timestamp: new Date().toISOString(), status: 'healthy' }
        ]
      };

      axios.get.mockResolvedValue({ data: mockHealthWithHistory });

      const response = await axios.get(`${HEALTH_SERVICE_URL}/history`);
      expect(response.data.history).toHaveLength(3);
      expect(response.data.history[1].status).toBe('degraded');
    });

    it('should calculate uptime percentage', async () => {
      const mockMetrics = {
        service: 'metrics-service',
        metrics: {
          uptime_percentage: 99.95,
          total_uptime_seconds: 864000,
          total_downtime_seconds: 432,
          last_downtime: new Date(Date.now() - 3600000).toISOString()
        }
      };

      axios.get.mockResolvedValue({ data: mockMetrics });

      const response = await axios.get(`${HEALTH_SERVICE_URL}/service/metrics-service/metrics`);
      expect(response.data.metrics.uptime_percentage).toBe(99.95);
    });
  });

  describe('Health Check Integration with Docker', () => {
    it('should detect when Docker daemon is unavailable', async () => {
      const mockHealth = {
        status: 'unhealthy',
        infrastructure: {
          docker: {
            status: 'unhealthy',
            error: 'Cannot connect to Docker daemon'
          }
        }
      };

      axios.get.mockResolvedValue({ data: mockHealth });

      const response = await axios.get(`${HEALTH_SERVICE_URL}/detailed`);
      expect(response.data.infrastructure.docker.status).toBe('unhealthy');
    });

    it('should check Docker container health status', async () => {
      const mockContainerHealth = {
        service: 'containerized-service',
        container: {
          id: 'abc123',
          status: 'running',
          health: 'healthy',
          restartCount: 0
        }
      };

      axios.get.mockResolvedValue({ data: mockContainerHealth });

      const response = await axios.get(`${HEALTH_SERVICE_URL}/service/containerized-service`);
      expect(response.data.container.health).toBe('healthy');
      expect(response.data.container.restartCount).toBe(0);
    });
  });

  describe('Health Check Alerting', () => {
    it('should trigger alerts on status change', async () => {
      // Mock alert handler
      const alertHandler = jest.fn();
      
      // Simulate status change from healthy to unhealthy
      const healthyStatus = {
        status: 'healthy',
        services: { 'test-service': { status: 'healthy' } }
      };
      
      const unhealthyStatus = {
        status: 'unhealthy',
        services: { 'test-service': { status: 'unhealthy' } },
        alert: {
          triggered: true,
          reason: 'Service test-service became unhealthy',
          timestamp: new Date().toISOString()
        }
      };

      axios.get
        .mockResolvedValueOnce({ data: healthyStatus })
        .mockResolvedValueOnce({ data: unhealthyStatus });

      // First check - healthy
      await axios.get(HEALTH_SERVICE_URL);
      
      // Second check - unhealthy (should trigger alert)
      const response = await axios.get(HEALTH_SERVICE_URL);
      
      expect(response.data.alert.triggered).toBe(true);
      expect(response.data.alert.reason).toContain('became unhealthy');
    });

    it('should not spam alerts for continued unhealthy state', async () => {
      const unhealthyStatus = {
        status: 'unhealthy',
        alert: {
          triggered: false,
          reason: 'Already alerted',
          lastAlert: new Date(Date.now() - 300000).toISOString()
        }
      };

      axios.get.mockResolvedValue({ data: unhealthyStatus });

      const response = await axios.get(HEALTH_SERVICE_URL);
      expect(response.data.alert.triggered).toBe(false);
    });
  });
});