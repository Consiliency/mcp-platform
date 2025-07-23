// Mock Service Mesh for testing orchestration
class MockServiceMesh {
  constructor(meshType) {
    this.meshType = meshType;
    this.services = new Map();
    this.virtualServices = new Map();
    this.policies = new Map();
    this.faults = new Map();
  }

  async registerService(config) {
    const serviceId = `svc-${Date.now()}`;
    this.services.set(serviceId, config);
    return {
      serviceId,
      proxyPort: 15001
    };
  }

  async createVirtualService(config) {
    const virtualServiceId = `vs-${Date.now()}`;
    this.virtualServices.set(virtualServiceId, config);
    return { virtualServiceId };
  }

  async enableMTLS(namespace) {
    return {
      success: true,
      certInfo: {
        issuer: 'mesh-ca',
        validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        certificates: {
          'cert.pem': 'mock-cert',
          'key.pem': 'mock-key'
        }
      }
    };
  }

  async configureCircuitBreaker(serviceName, config) {
    this.policies.set(`cb-${serviceName}`, config);
    return { success: true };
  }

  async getServiceMetrics(serviceName, timeRange) {
    return {
      requestRate: 100,
      errorRate: 0.005,
      latency: {
        p50: 10,
        p90: 50,
        p99: 100
      }
    };
  }

  async setTrafficWeight(serviceName, weights) {
    return { success: true };
  }

  async injectFault(serviceName, fault) {
    const faultId = `fault-${Date.now()}`;
    this.faults.set(faultId, { serviceName, ...fault });
    return { faultId };
  }

  async removeFault(faultId) {
    this.faults.delete(faultId);
    return { success: true };
  }
}

module.exports = MockServiceMesh;