// Base Interface for Service Mesh
// Common functionality shared by all mesh implementations

class BaseInterface {
  constructor() {
    this.isTestMode = process.env.NODE_ENV === 'test';
  }

  // Common validation methods
  validateServiceName(name) {
    if (!name || typeof name !== 'string') {
      throw new Error('Service name must be a non-empty string');
    }
    if (!/^[a-z0-9-]+$/.test(name)) {
      throw new Error('Service name must contain only lowercase letters, numbers, and hyphens');
    }
  }

  validateNamespace(namespace) {
    if (namespace && typeof namespace !== 'string') {
      throw new Error('Namespace must be a string');
    }
  }

  validatePort(port) {
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('Port must be an integer between 1 and 65535');
    }
  }

  validatePercentage(percentage) {
    if (typeof percentage !== 'number' || percentage < 0 || percentage > 100) {
      throw new Error('Percentage must be a number between 0 and 100');
    }
  }

  validateTimeRange(timeRange) {
    if (!timeRange || !timeRange.start || !timeRange.end) {
      throw new Error('Time range must include start and end dates');
    }
    if (!(timeRange.start instanceof Date) || !(timeRange.end instanceof Date)) {
      throw new Error('Time range start and end must be Date objects');
    }
    if (timeRange.start >= timeRange.end) {
      throw new Error('Time range start must be before end');
    }
  }

  // Common utility methods
  generateServiceId(name) {
    return name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  }

  generateTimestamp() {
    return new Date().toISOString();
  }

  // Mock data for testing
  getMockMetrics() {
    return {
      requestRate: Math.random() * 1000,
      errorRate: Math.random() * 0.05,
      latency: {
        p50: Math.random() * 50,
        p95: Math.random() * 200,
        p99: Math.random() * 500
      }
    };
  }

  getMockTraces(limit) {
    const traces = [];
    for (let i = 0; i < limit; i++) {
      traces.push({
        traceId: `trace-${Date.now()}-${i}`,
        spans: Math.floor(Math.random() * 10) + 1,
        duration: Math.random() * 1000,
        timestamp: new Date(Date.now() - Math.random() * 3600000)
      });
    }
    return traces;
  }

  getMockServiceGraph() {
    return {
      nodes: [
        { id: 'frontend', type: 'service' },
        { id: 'backend', type: 'service' },
        { id: 'database', type: 'service' }
      ],
      edges: [
        { source: 'frontend', target: 'backend', requests: 1000 },
        { source: 'backend', target: 'database', requests: 500 }
      ]
    };
  }

  getMockCertInfo() {
    return {
      issuer: 'istio-ca',
      validFrom: new Date(),
      validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      algorithm: 'RSA-2048',
      fingerprint: 'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99'
    };
  }

  // Error handling
  wrapError(error, context) {
    const wrappedError = new Error(`${context}: ${error.message}`);
    wrappedError.originalError = error;
    wrappedError.context = context;
    return wrappedError;
  }

  // Logging helper
  log(level, message, data = {}) {
    if (this.isTestMode) return;
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...data
    };
    
    console.log(JSON.stringify(logEntry));
  }
}

module.exports = BaseInterface;