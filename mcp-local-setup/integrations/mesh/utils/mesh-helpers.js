// Service Mesh Helper Utilities
// Common utilities for service mesh operations

class MeshHelpers {
  // Traffic management patterns
  static createCanaryDeployment(serviceId, stableVersion, canaryVersion, percentage) {
    return [
      { version: stableVersion, weight: 100 - percentage },
      { version: canaryVersion, weight: percentage }
    ];
  }

  static createBlueGreenDeployment(serviceId, currentVersion, newVersion, switchToNew = false) {
    return switchToNew ? 
      [{ version: newVersion, weight: 100 }] :
      [{ version: currentVersion, weight: 100 }];
  }

  static createABTestSplit(serviceId, versions, weights) {
    if (versions.length !== weights.length) {
      throw new Error('Versions and weights arrays must have the same length');
    }
    
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    if (Math.abs(totalWeight - 100) > 0.01) {
      throw new Error('Weights must sum to 100');
    }
    
    return versions.map((version, i) => ({
      version,
      weight: weights[i]
    }));
  }

  // Circuit breaker patterns
  static createDefaultCircuitBreaker() {
    return {
      maxConnections: 100,
      timeout: 5000,
      maxRetries: 3,
      consecutiveErrors: 5,
      interval: 30,
      baseEjectionTime: 30,
      maxEjectionPercent: 50
    };
  }

  static createAggressiveCircuitBreaker() {
    return {
      maxConnections: 50,
      timeout: 2000,
      maxRetries: 1,
      consecutiveErrors: 3,
      interval: 10,
      baseEjectionTime: 60,
      maxEjectionPercent: 100
    };
  }

  // Retry policy patterns
  static createDefaultRetryPolicy() {
    return {
      attempts: 3,
      perTryTimeout: 1000,
      retryOn: ['5xx', 'reset', 'connect-failure', 'refused-stream']
    };
  }

  static createIdempotentRetryPolicy() {
    return {
      attempts: 5,
      perTryTimeout: 2000,
      retryOn: ['5xx', 'reset', 'connect-failure', 'refused-stream', 'retriable-4xx']
    };
  }

  // Security patterns
  static createStrictAuthorizationPolicy(allowedServices) {
    return {
      name: 'strict-access',
      namespace: 'default',
      action: 'ALLOW',
      rules: allowedServices.map(service => ({
        from: [{
          source: {
            principals: [`cluster.local/ns/default/sa/${service}`]
          }
        }],
        to: [{
          operation: {
            methods: ['GET', 'POST', 'PUT', 'DELETE']
          }
        }]
      }))
    };
  }

  static createNamespaceIsolationPolicy(namespace) {
    return {
      name: 'namespace-isolation',
      namespace: namespace,
      action: 'DENY',
      rules: [{
        from: [{
          source: {
            notNamespaces: [namespace]
          }
        }]
      }]
    };
  }

  // Fault injection patterns
  static createLatencyFault(percentage, delayMs) {
    return {
      type: 'delay',
      percentage,
      value: delayMs
    };
  }

  static createErrorFault(percentage, httpStatus = 503) {
    return {
      type: 'abort',
      percentage,
      value: httpStatus
    };
  }

  // Observability helpers
  static calculateSLI(metrics) {
    const { requestRate, errorRate, latency } = metrics;
    
    return {
      availability: (1 - errorRate) * 100,
      latencyP99: latency.p99,
      throughput: requestRate,
      errorBudgetRemaining: Math.max(0, (0.999 - errorRate) * 100)
    };
  }

  static isWithinSLO(metrics, slo) {
    const sli = this.calculateSLI(metrics);
    
    return {
      availability: sli.availability >= slo.availability,
      latency: sli.latencyP99 <= slo.latencyP99,
      overall: sli.availability >= slo.availability && sli.latencyP99 <= slo.latencyP99,
      sli
    };
  }

  // Service graph analysis
  static findCriticalPath(serviceGraph) {
    const { nodes, edges } = serviceGraph;
    const criticalPath = [];
    
    // Simple implementation - find path with most traffic
    const edgesBySource = {};
    edges.forEach(edge => {
      if (!edgesBySource[edge.source]) {
        edgesBySource[edge.source] = [];
      }
      edgesBySource[edge.source].push(edge);
    });
    
    // Start from nodes with no incoming edges (entry points)
    const entryNodes = nodes.filter(node => 
      !edges.some(edge => edge.target === node.id)
    );
    
    entryNodes.forEach(entry => {
      const path = this._traversePath(entry.id, edgesBySource, []);
      if (path.length > criticalPath.length) {
        criticalPath.splice(0, criticalPath.length, ...path);
      }
    });
    
    return criticalPath;
  }

  static _traversePath(nodeId, edgesBySource, currentPath) {
    currentPath.push(nodeId);
    
    const outgoingEdges = edgesBySource[nodeId] || [];
    if (outgoingEdges.length === 0) {
      return currentPath;
    }
    
    // Follow edge with most traffic
    const maxEdge = outgoingEdges.reduce((max, edge) => 
      edge.requests > (max?.requests || 0) ? edge : max
    );
    
    return this._traversePath(maxEdge.target, edgesBySource, currentPath);
  }

  static detectAnomalies(currentMetrics, historicalMetrics) {
    const anomalies = [];
    
    // Simple threshold-based anomaly detection
    const avgRequestRate = historicalMetrics.reduce((sum, m) => sum + m.requestRate, 0) / historicalMetrics.length;
    const avgErrorRate = historicalMetrics.reduce((sum, m) => sum + m.errorRate, 0) / historicalMetrics.length;
    const avgLatency = historicalMetrics.reduce((sum, m) => sum + m.latency.p99, 0) / historicalMetrics.length;
    
    // Check for significant deviations (> 50%)
    if (Math.abs(currentMetrics.requestRate - avgRequestRate) / avgRequestRate > 0.5) {
      anomalies.push({
        type: 'traffic',
        severity: 'warning',
        message: `Traffic deviation: ${currentMetrics.requestRate} vs avg ${avgRequestRate}`
      });
    }
    
    if (currentMetrics.errorRate > avgErrorRate * 2) {
      anomalies.push({
        type: 'errors',
        severity: 'critical',
        message: `Error rate spike: ${currentMetrics.errorRate} vs avg ${avgErrorRate}`
      });
    }
    
    if (currentMetrics.latency.p99 > avgLatency * 1.5) {
      anomalies.push({
        type: 'latency',
        severity: 'warning',
        message: `Latency increase: ${currentMetrics.latency.p99}ms vs avg ${avgLatency}ms`
      });
    }
    
    return anomalies;
  }

  // Configuration validators
  static validateTrafficSplit(weights) {
    const total = weights.reduce((sum, w) => sum + w.weight, 0);
    return Math.abs(total - 100) < 0.01;
  }

  static validateRetryPolicy(policy) {
    return policy.attempts > 0 && 
           policy.attempts <= 10 && 
           policy.perTryTimeout > 0 &&
           policy.perTryTimeout <= 60000; // Max 60 seconds
  }

  static validateCircuitBreaker(config) {
    return config.maxConnections > 0 &&
           config.timeout > 0 &&
           config.consecutiveErrors > 0 &&
           config.maxEjectionPercent >= 0 &&
           config.maxEjectionPercent <= 100;
  }
}

module.exports = MeshHelpers;