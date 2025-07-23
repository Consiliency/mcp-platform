// Mock SDK Core for testing orchestration
class MockSDKCore {
  constructor(config) {
    this.config = config;
    this.services = new Map();
  }

  async callService(serviceName, method, params) {
    return {
      result: `Called ${serviceName}.${method}`,
      params,
      _headers: {
        'x-request-id': `req-${Date.now()}`,
        'x-b3-traceid': `trace-${Date.now()}`
      }
    };
  }

  async getHealth(serviceName) {
    return {
      status: 'degraded',
      details: {
        fallbackActive: true,
        lastCheck: new Date()
      }
    };
  }
}

module.exports = MockSDKCore;