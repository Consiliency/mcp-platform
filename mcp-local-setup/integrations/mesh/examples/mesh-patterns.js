// Service Mesh Patterns Example
// Demonstrates common patterns for production use

const { ServiceMeshInterface, MeshHelpers } = require('../index');

class ServiceMeshPatterns {
  constructor(meshType = 'istio') {
    this.mesh = new ServiceMeshInterface(meshType);
  }

  // Pattern 1: Safe Canary Deployment with Automatic Rollback
  async safeCanaryDeployment(serviceId, newVersion, options = {}) {
    const {
      initialPercentage = 5,
      incrementPercentage = 10,
      slo = { availability: 99.9, latencyP99: 200 },
      monitoringDuration = 300000, // 5 minutes
      maxRolloutDuration = 3600000  // 1 hour
    } = options;

    console.log(`Starting safe canary deployment for ${serviceId} to ${newVersion}`);
    
    const startTime = Date.now();
    let currentPercentage = initialPercentage;
    const stableVersion = 'v1'; // Assume current stable is v1

    try {
      while (currentPercentage <= 100) {
        // Update traffic weights
        const weights = MeshHelpers.createCanaryDeployment(
          serviceId, 
          stableVersion, 
          newVersion, 
          currentPercentage
        );
        await this.mesh.setTrafficWeight(serviceId, weights);
        console.log(`Traffic split: ${stableVersion}=${100-currentPercentage}%, ${newVersion}=${currentPercentage}%`);

        // Monitor for specified duration
        await this._monitorDeployment(serviceId, slo, monitoringDuration);

        // Check if we should continue
        if (currentPercentage === 100) break;
        
        // Check max duration
        if (Date.now() - startTime > maxRolloutDuration) {
          throw new Error('Rollout exceeded maximum duration');
        }

        // Increment traffic
        currentPercentage = Math.min(100, currentPercentage + incrementPercentage);
      }

      console.log('Canary deployment completed successfully!');
      return { success: true, finalVersion: newVersion };

    } catch (error) {
      console.error('Canary deployment failed:', error.message);
      console.log('Rolling back to stable version...');
      
      // Rollback to 100% stable
      await this.mesh.setTrafficWeight(serviceId, [
        { version: stableVersion, weight: 100 }
      ]);
      
      return { success: false, error: error.message, finalVersion: stableVersion };
    }
  }

  // Pattern 2: Zero-Downtime Blue-Green Deployment
  async blueGreenDeployment(serviceId, newVersion, options = {}) {
    const {
      warmupDuration = 60000, // 1 minute
      validationDuration = 300000, // 5 minutes
      slo = { availability: 99.9, latencyP99: 200 }
    } = options;

    console.log(`Starting blue-green deployment for ${serviceId} to ${newVersion}`);
    
    const currentVersion = 'blue';
    const targetVersion = 'green';

    try {
      // Step 1: Deploy green version (0% traffic)
      await this.mesh.registerService({
        name: `${serviceId}-${targetVersion}`,
        port: 8081,
        protocol: 'http',
        metadata: { version: newVersion, color: targetVersion }
      });

      // Step 2: Warm up green version with synthetic traffic
      console.log('Warming up green version...');
      await this._warmupService(`${serviceId}-${targetVersion}`, warmupDuration);

      // Step 3: Switch 100% traffic to green
      console.log('Switching traffic to green...');
      await this.mesh.setTrafficWeight(serviceId, [
        { version: targetVersion, weight: 100 }
      ]);

      // Step 4: Validate green version
      await this._monitorDeployment(serviceId, slo, validationDuration);

      // Step 5: Decommission blue version
      console.log('Decommissioning blue version...');
      await this.mesh.unregisterService(`${serviceId}-${currentVersion}`);

      console.log('Blue-green deployment completed successfully!');
      return { success: true, activeVersion: targetVersion };

    } catch (error) {
      console.error('Blue-green deployment failed:', error.message);
      
      // Rollback to blue
      await this.mesh.setTrafficWeight(serviceId, [
        { version: currentVersion, weight: 100 }
      ]);
      
      // Clean up green if it exists
      try {
        await this.mesh.unregisterService(`${serviceId}-${targetVersion}`);
      } catch (e) {
        // Ignore cleanup errors
      }
      
      return { success: false, error: error.message, activeVersion: currentVersion };
    }
  }

  // Pattern 3: Geographic Load Balancing
  async setupGeographicLoadBalancing(serviceId, regions) {
    console.log(`Setting up geographic load balancing for ${serviceId}`);
    
    const rules = [];
    
    for (const region of regions) {
      // Create destination rule for each region
      await this.mesh.createDestinationRule({
        name: `${serviceId}-${region.name}`,
        host: serviceId,
        subsets: [{
          name: region.name,
          labels: { region: region.name }
        }],
        trafficPolicy: {
          connectionPool: {
            tcp: { maxConnections: region.maxConnections || 1000 }
          }
        }
      });

      // Create routing rule based on client location
      rules.push({
        match: [{
          headers: {
            'x-client-region': { exact: region.name }
          }
        }],
        route: [{
          destination: {
            host: serviceId,
            subset: region.name
          },
          weight: 100
        }]
      });
    }

    // Add default route for unknown regions
    rules.push({
      route: regions.map(region => ({
        destination: {
          host: serviceId,
          subset: region.name
        },
        weight: region.defaultWeight || Math.floor(100 / regions.length)
      }))
    });

    // Create virtual service with geographic routing
    await this.mesh.createVirtualService({
      name: `${serviceId}-geographic`,
      hosts: [serviceId],
      routes: rules
    });

    console.log('Geographic load balancing configured');
    return { success: true, regions: regions.map(r => r.name) };
  }

  // Pattern 4: Adaptive Circuit Breaking
  async setupAdaptiveCircuitBreaker(serviceId, options = {}) {
    const {
      baselineMetricsDuration = 3600000, // 1 hour
      adjustmentInterval = 300000, // 5 minutes
      targetAvailability = 99.9
    } = options;

    console.log(`Setting up adaptive circuit breaker for ${serviceId}`);
    
    // Get baseline metrics
    const baselineMetrics = await this._getBaselineMetrics(serviceId, baselineMetricsDuration);
    
    // Initial circuit breaker based on baseline
    let circuitBreaker = {
      maxConnections: Math.ceil(baselineMetrics.avgConnections * 1.5),
      timeout: Math.ceil(baselineMetrics.p99Latency * 2),
      maxRetries: 3,
      consecutiveErrors: 5,
      interval: 30,
      baseEjectionTime: 30,
      maxEjectionPercent: 50
    };

    await this.mesh.configureCircuitBreaker(serviceId, circuitBreaker);

    // Set up periodic adjustment
    const adjustCircuitBreaker = setInterval(async () => {
      try {
        const currentMetrics = await this.mesh.getServiceMetrics(serviceId, {
          start: new Date(Date.now() - adjustmentInterval),
          end: new Date()
        });

        const availability = (1 - currentMetrics.errorRate) * 100;

        if (availability < targetAvailability) {
          // Tighten circuit breaker
          circuitBreaker.consecutiveErrors = Math.max(3, circuitBreaker.consecutiveErrors - 1);
          circuitBreaker.maxEjectionPercent = Math.min(100, circuitBreaker.maxEjectionPercent + 10);
        } else if (availability > targetAvailability + 0.5) {
          // Relax circuit breaker
          circuitBreaker.consecutiveErrors = Math.min(10, circuitBreaker.consecutiveErrors + 1);
          circuitBreaker.maxEjectionPercent = Math.max(30, circuitBreaker.maxEjectionPercent - 10);
        }

        await this.mesh.configureCircuitBreaker(serviceId, circuitBreaker);
        console.log(`Adjusted circuit breaker: consecutiveErrors=${circuitBreaker.consecutiveErrors}, maxEjection=${circuitBreaker.maxEjectionPercent}%`);

      } catch (error) {
        console.error('Failed to adjust circuit breaker:', error.message);
      }
    }, adjustmentInterval);

    return {
      success: true,
      initialConfig: circuitBreaker,
      stopAdjustment: () => clearInterval(adjustCircuitBreaker)
    };
  }

  // Pattern 5: Service Mesh Security Hardening
  async hardenSecurity(namespace, options = {}) {
    const {
      allowedServices = [],
      allowedNamespaces = [namespace],
      enforceEncryption = true,
      requireAuthentication = true
    } = options;

    console.log(`Hardening security for namespace: ${namespace}`);

    // Enable strict mTLS
    if (enforceEncryption) {
      await this.mesh.enableMTLS(namespace);
      console.log('✓ Strict mTLS enabled');
    }

    // Create namespace isolation policy
    if (allowedNamespaces.length > 0) {
      await this.mesh.createAuthorizationPolicy({
        name: 'namespace-isolation',
        namespace: namespace,
        action: 'DENY',
        rules: [{
          from: [{
            source: {
              notNamespaces: allowedNamespaces
            }
          }]
        }]
      });
      console.log('✓ Namespace isolation enabled');
    }

    // Create service-level authorization
    if (allowedServices.length > 0 && requireAuthentication) {
      await this.mesh.createAuthorizationPolicy({
        name: 'service-authorization',
        namespace: namespace,
        action: 'ALLOW',
        rules: allowedServices.map(service => ({
          from: [{
            source: {
              principals: [`cluster.local/ns/${namespace}/sa/${service}`]
            }
          }],
          to: [{
            operation: {
              methods: ['GET', 'POST', 'PUT', 'DELETE']
            }
          }]
        }))
      });
      console.log('✓ Service-level authorization configured');
    }

    // Default deny all
    await this.mesh.createAuthorizationPolicy({
      name: 'default-deny',
      namespace: namespace,
      action: 'DENY',
      rules: [{}] // Deny all by default
    });
    console.log('✓ Default deny policy enabled');

    return {
      success: true,
      policies: ['mTLS', 'namespace-isolation', 'service-authorization', 'default-deny']
    };
  }

  // Helper: Monitor deployment health
  async _monitorDeployment(serviceId, slo, duration) {
    const startTime = Date.now();
    const checkInterval = 30000; // Check every 30 seconds

    while (Date.now() - startTime < duration) {
      const metrics = await this.mesh.getServiceMetrics(serviceId, {
        start: new Date(Date.now() - checkInterval),
        end: new Date()
      });

      const sloCheck = MeshHelpers.isWithinSLO(metrics, slo);
      
      if (!sloCheck.overall) {
        throw new Error(`SLO violation: availability=${sloCheck.sli.availability.toFixed(2)}%, latency=${sloCheck.sli.latencyP99}ms`);
      }

      console.log(`Health check passed: availability=${sloCheck.sli.availability.toFixed(2)}%, p99=${sloCheck.sli.latencyP99}ms`);
      
      // Wait before next check
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
  }

  // Helper: Warm up service
  async _warmupService(serviceId, duration) {
    // In real implementation, this would send synthetic traffic
    console.log(`Warming up ${serviceId} for ${duration}ms`);
    await new Promise(resolve => setTimeout(resolve, duration));
  }

  // Helper: Get baseline metrics
  async _getBaselineMetrics(serviceId, duration) {
    const metrics = await this.mesh.getServiceMetrics(serviceId, {
      start: new Date(Date.now() - duration),
      end: new Date()
    });

    return {
      avgConnections: 100, // Would calculate from actual metrics
      p99Latency: metrics.latency.p99,
      errorRate: metrics.errorRate
    };
  }
}

// Example usage
async function demonstratePatterns() {
  const patterns = new ServiceMeshPatterns('istio');

  // Example 1: Safe canary deployment
  console.log('=== Pattern 1: Safe Canary Deployment ===');
  const canaryResult = await patterns.safeCanaryDeployment('api-service', 'v2', {
    initialPercentage: 10,
    incrementPercentage: 20,
    slo: { availability: 99.95, latencyP99: 150 }
  });
  console.log('Result:', canaryResult);
  console.log();

  // Example 2: Blue-green deployment
  console.log('=== Pattern 2: Blue-Green Deployment ===');
  const blueGreenResult = await patterns.blueGreenDeployment('web-service', 'v2', {
    warmupDuration: 30000,
    validationDuration: 60000
  });
  console.log('Result:', blueGreenResult);
  console.log();

  // Example 3: Geographic load balancing
  console.log('=== Pattern 3: Geographic Load Balancing ===');
  const geoResult = await patterns.setupGeographicLoadBalancing('global-service', [
    { name: 'us-east', maxConnections: 2000, defaultWeight: 40 },
    { name: 'us-west', maxConnections: 1500, defaultWeight: 30 },
    { name: 'eu-west', maxConnections: 1500, defaultWeight: 30 }
  ]);
  console.log('Result:', geoResult);
  console.log();

  // Example 4: Adaptive circuit breaker
  console.log('=== Pattern 4: Adaptive Circuit Breaker ===');
  const cbResult = await patterns.setupAdaptiveCircuitBreaker('backend-service', {
    targetAvailability: 99.9,
    adjustmentInterval: 60000
  });
  console.log('Result:', cbResult);
  // Remember to call cbResult.stopAdjustment() when done
  console.log();

  // Example 5: Security hardening
  console.log('=== Pattern 5: Security Hardening ===');
  const securityResult = await patterns.hardenSecurity('production', {
    allowedServices: ['frontend', 'api-gateway'],
    allowedNamespaces: ['production', 'monitoring'],
    enforceEncryption: true,
    requireAuthentication: true
  });
  console.log('Result:', securityResult);
}

// Export for use in other modules
module.exports = ServiceMeshPatterns;

// Run examples if called directly
if (require.main === module) {
  demonstratePatterns().catch(console.error);
}