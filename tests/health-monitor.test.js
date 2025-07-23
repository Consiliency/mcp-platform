const HealthMonitorInterface = require('../docker/health/health-monitor');
const express = require('express');
const request = require('supertest');

describe('HealthMonitorInterface Implementation', () => {
  let healthMonitor;

  beforeEach(() => {
    healthMonitor = new HealthMonitorInterface({
      services: ['api', 'database', 'cache'],
      checkInterval: 5000,
      timeout: 1000
    });
  });

  describe('Basic Health Checks', () => {
    test('checkHealth returns overall system health', async () => {
      const health = await healthMonitor.checkHealth();
      
      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('details');
      expect(health).toHaveProperty('timestamp');
      expect(health.details).toHaveProperty('services');
      expect(['healthy', 'unhealthy', 'degraded']).toContain(health.status);
    });

    test('checkHealth for specific service', async () => {
      const health = await healthMonitor.checkHealth('api');
      
      expect(health).toHaveProperty('service', 'api');
      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('details');
      expect(health).toHaveProperty('timestamp');
    });

    test('registerHealthCheck adds custom check', async () => {
      const checkFn = jest.fn().mockResolvedValue({
        healthy: true,
        message: 'Custom check passed'
      });

      const result = await healthMonitor.registerHealthCheck('custom-service', checkFn);
      
      expect(result).toEqual({ registered: true });
      expect(checkFn).toHaveBeenCalled();
      
      // Verify the service was added
      const health = await healthMonitor.checkHealth('custom-service');
      expect(health.status).toBe('healthy');
    });

    test('health check timeout handling', async () => {
      const slowCheck = () => new Promise(resolve => 
        setTimeout(() => resolve({ healthy: true }), 2000)
      );

      await healthMonitor.registerHealthCheck('slow-service', slowCheck);
      const health = await healthMonitor.checkHealth('slow-service');
      
      expect(health.status).toBe('unhealthy');
      expect(health.details.error).toContain('timeout');
    });
  });

  describe('Probe Endpoints', () => {
    test('livenessProbe always returns alive', async () => {
      const probe = await healthMonitor.livenessProbe();
      
      expect(probe.alive).toBe(true);
      expect(probe.timestamp).toBeDefined();
    });

    test('readinessProbe reflects service health', async () => {
      // Register a failing service
      await healthMonitor.registerHealthCheck('failing-service', async () => ({
        healthy: false,
        message: 'Service down'
      }));

      const probe = await healthMonitor.readinessProbe();
      
      expect(probe.ready).toBe(false);
      expect(probe.services).toBeDefined();
      expect(probe.timestamp).toBeDefined();
    });

    test('startupProbe tracks initialization', async () => {
      const probe1 = await healthMonitor.startupProbe();
      expect(probe1.started).toBe(false);
      expect(probe1.pending).toHaveLength(3);

      // Mark services as initialized
      healthMonitor.markInitialized('api');
      healthMonitor.markInitialized('database');
      healthMonitor.markInitialized('cache');

      const probe2 = await healthMonitor.startupProbe();
      expect(probe2.started).toBe(true);
      expect(probe2.initialized).toHaveLength(3);
      expect(probe2.pending).toHaveLength(0);
    });
  });

  describe('HTTP Endpoints', () => {
    let app;

    beforeEach(() => {
      app = express();
    });

    test('createHealthEndpoint returns router with health endpoints', async () => {
      const router = healthMonitor.createHealthEndpoint({
        path: '/health',
        detailed: true
      });
      
      app.use(router);
      
      // Test main health endpoint
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status');
      expect(res.body).toHaveProperty('details');

      // Test liveness endpoint
      const liveRes = await request(app).get('/health/live');
      expect(liveRes.status).toBe(200);
      expect(liveRes.body.alive).toBe(true);

      // Test readiness endpoint
      const readyRes = await request(app).get('/health/ready');
      expect([200, 503]).toContain(readyRes.status);
      expect(readyRes.body).toHaveProperty('ready');

      // Test startup endpoint
      const startupRes = await request(app).get('/health/startup');
      expect([200, 503]).toContain(startupRes.status);
      expect(startupRes.body).toHaveProperty('started');
    });

    test('createMetricsEndpoint returns metrics in JSON format', async () => {
      const router = healthMonitor.createMetricsEndpoint({
        path: '/metrics',
        format: 'json'
      });
      
      app.use(router);
      
      const res = await request(app).get('/metrics');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('uptime');
      expect(res.body).toHaveProperty('services');
      expect(res.body).toHaveProperty('healthy');
      expect(res.body).toHaveProperty('unhealthy');
    });

    test('createMetricsEndpoint returns metrics in Prometheus format', async () => {
      const router = healthMonitor.createMetricsEndpoint({
        path: '/metrics',
        format: 'prometheus'
      });
      
      app.use(router);
      
      const res = await request(app).get('/metrics');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/plain');
      expect(res.text).toContain('# HELP');
      expect(res.text).toContain('# TYPE');
      expect(res.text).toContain('health_uptime_seconds');
    });
  });

  describe('Dependency Checking', () => {
    test('checkDependencies includes required services', async () => {
      const deps = await healthMonitor.checkDependencies();
      
      expect(deps).toHaveProperty('satisfied');
      expect(deps).toHaveProperty('missing');
      expect(deps).toHaveProperty('details');
      expect(deps.details).toHaveProperty('security-api');
      expect(deps.details).toHaveProperty('rate-limiter');
      expect(deps.details).toHaveProperty('api');
      expect(deps.details).toHaveProperty('database');
      expect(deps.details).toHaveProperty('cache');
    });

    test('checkDependencies reports missing services', async () => {
      // All services should be unhealthy by default
      const deps = await healthMonitor.checkDependencies();
      
      expect(deps.satisfied).toBe(false);
      expect(deps.missing.length).toBeGreaterThan(0);
    });
  });

  describe('Service Status Management', () => {
    test('services maintain individual status', async () => {
      // Register different health states
      await healthMonitor.registerHealthCheck('healthy-service', async () => ({
        healthy: true,
        message: 'All good'
      }));

      await healthMonitor.registerHealthCheck('unhealthy-service', async () => ({
        healthy: false,
        message: 'Service down'
      }));

      const healthyCheck = await healthMonitor.checkHealth('healthy-service');
      const unhealthyCheck = await healthMonitor.checkHealth('unhealthy-service');

      expect(healthyCheck.status).toBe('healthy');
      expect(unhealthyCheck.status).toBe('unhealthy');

      // Overall health should be unhealthy
      const overall = await healthMonitor.checkHealth();
      expect(overall.status).toBe('unhealthy');
    });
  });
});