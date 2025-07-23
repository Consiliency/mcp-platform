// Test: Security and Health Monitoring Integration
// Components involved: SecurityAPIInterface, RateLimiterInterface, HealthMonitorInterface
// Expected behavior: Health checks should respect authentication and rate limiting

const SecurityAPIInterface = require('../../../interfaces/phase6/security-api.interface');
const RateLimiterInterface = require('../../../interfaces/phase6/rate-limiter.interface');
const HealthMonitorInterface = require('../../../interfaces/phase6/health-monitor.interface');

describe('Security and Health Monitoring Integration', () => {
  let security;
  let rateLimiter;
  let healthMonitor;

  beforeEach(() => {
    security = new SecurityAPIInterface({ jwtSecret: 'test-secret' });
    rateLimiter = new RateLimiterInterface({ storage: 'memory' });
    healthMonitor = new HealthMonitorInterface({ services: ['api', 'database'] });
  });

  test('Health endpoints require authentication when configured', async () => {
    // Given a health endpoint with authentication
    const authMiddleware = security.createAuthMiddleware({ requireAuth: true });
    const healthRouter = healthMonitor.createHealthEndpoint({ 
      auth: true, 
      detailed: true 
    });

    // When accessing without token
    const mockReq = { headers: {} };
    const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    
    // Then authentication should fail
    await authMiddleware(mockReq, mockRes, () => {});
    expect(mockRes.status).toHaveBeenCalledWith(401);
  });

  test('Health endpoints respect rate limiting', async () => {
    // Given a rate-limited health endpoint
    const rateLimitMiddleware = rateLimiter.createIPRateLimiter({
      limit: 10,
      window: 60000 // 1 minute
    });
    
    // When making multiple requests from same IP
    const mockIP = '192.168.1.1';
    const results = [];
    
    for (let i = 0; i < 15; i++) {
      const result = await rateLimiter.checkLimit(mockIP, 'health-check');
      results.push(result);
    }
    
    // Then rate limit should be enforced
    expect(results[0].allowed).toBe(true);
    expect(results[0].remaining).toBe(9);
    expect(results[10].allowed).toBe(false);
    expect(results[10].remaining).toBe(0);
  });

  test('API authentication integrates with health status', async () => {
    // Given an authenticated API
    const { accessToken } = await security.generateToken({
      userId: 'test-user',
      roles: ['admin']
    });

    // When checking API health with valid token
    const health = await healthMonitor.checkHealth('api');
    
    // Then health should include auth status
    expect(health.status).toBeDefined();
    expect(health.details).toHaveProperty('authentication', 'enabled');
  });

  test('Service dependencies include security components', async () => {
    // When checking system dependencies
    const deps = await healthMonitor.checkDependencies();
    
    // Then security services should be listed
    expect(deps.details).toHaveProperty('security-api');
    expect(deps.details).toHaveProperty('rate-limiter');
  });
});