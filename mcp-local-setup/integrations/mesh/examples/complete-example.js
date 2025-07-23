// Complete Service Mesh Example
// Demonstrates all features of the service mesh integration

const { ServiceMeshInterface, MeshHelpers } = require('../index');

async function completeExample() {
  // Create service mesh instance (Istio in this example)
  const mesh = new ServiceMeshInterface('istio');

  console.log('=== Service Mesh Complete Example ===\n');

  try {
    // 1. Register services
    console.log('1. Registering services...');
    const frontendReg = await mesh.registerService({
      name: 'frontend',
      port: 3000,
      protocol: 'http',
      metadata: { version: 'v1', tier: 'frontend' }
    });
    console.log(`   ✓ Frontend registered: ${frontendReg.serviceId}`);

    const backendV1 = await mesh.registerService({
      name: 'backend',
      port: 8080,
      protocol: 'http',
      metadata: { version: 'v1', tier: 'backend' }
    });
    console.log(`   ✓ Backend v1 registered: ${backendV1.serviceId}`);

    const backendV2 = await mesh.registerService({
      name: 'backend',
      port: 8081,
      protocol: 'http',
      metadata: { version: 'v2', tier: 'backend' }
    });
    console.log(`   ✓ Backend v2 registered: ${backendV2.serviceId}\n`);

    // 2. Configure traffic management
    console.log('2. Configuring traffic management...');
    
    // Create virtual service for routing
    const vs = await mesh.createVirtualService({
      name: 'backend-routes',
      hosts: ['backend'],
      routes: [{
        match: [{ headers: { 'x-version': { exact: 'v2' } } }],
        route: [{ destination: { host: 'backend', subset: 'v2' } }]
      }, {
        route: [{ destination: { host: 'backend', subset: 'v1' } }]
      }]
    });
    console.log(`   ✓ Virtual service created: ${vs.virtualServiceId}`);

    // Create destination rule
    const dr = await mesh.createDestinationRule({
      name: 'backend-subsets',
      host: 'backend',
      subsets: [
        { name: 'v1', labels: { version: 'v1' } },
        { name: 'v2', labels: { version: 'v2' } }
      ]
    });
    console.log(`   ✓ Destination rule created: ${dr.destinationRuleId}`);

    // Set up canary deployment (90% v1, 10% v2)
    const canaryWeights = MeshHelpers.createCanaryDeployment('backend', 'v1', 'v2', 10);
    await mesh.setTrafficWeight('backend', canaryWeights);
    console.log('   ✓ Canary deployment configured (90% v1, 10% v2)\n');

    // 3. Configure resilience
    console.log('3. Configuring resilience patterns...');
    
    // Circuit breaker
    const cbConfig = MeshHelpers.createDefaultCircuitBreaker();
    await mesh.configureCircuitBreaker('backend', cbConfig);
    console.log('   ✓ Circuit breaker configured');

    // Retry policy
    const retryPolicy = MeshHelpers.createDefaultRetryPolicy();
    await mesh.setRetryPolicy('backend', retryPolicy);
    console.log('   ✓ Retry policy configured\n');

    // 4. Enable security
    console.log('4. Enabling security features...');
    
    // Enable mTLS
    const mtlsResult = await mesh.enableMTLS('default');
    console.log(`   ✓ mTLS enabled with issuer: ${mtlsResult.certInfo.issuer}`);

    // Create authorization policy
    const authPolicy = MeshHelpers.createStrictAuthorizationPolicy(['frontend']);
    const authResult = await mesh.createAuthorizationPolicy({
      ...authPolicy,
      name: 'backend-auth'
    });
    console.log(`   ✓ Authorization policy created: ${authResult.policyId}\n`);

    // 5. Get observability data
    console.log('5. Fetching observability data...');
    
    // Get metrics
    const metrics = await mesh.getServiceMetrics('backend', {
      start: new Date(Date.now() - 3600000), // Last hour
      end: new Date()
    });
    console.log('   Service Metrics:');
    console.log(`   - Request rate: ${metrics.requestRate} req/s`);
    console.log(`   - Error rate: ${(metrics.errorRate * 100).toFixed(2)}%`);
    console.log(`   - P99 latency: ${metrics.latency.p99}ms`);

    // Calculate SLI
    const sli = MeshHelpers.calculateSLI(metrics);
    console.log('\n   Service Level Indicators:');
    console.log(`   - Availability: ${sli.availability.toFixed(3)}%`);
    console.log(`   - Error budget remaining: ${sli.errorBudgetRemaining.toFixed(3)}%`);

    // Get traces
    const traces = await mesh.getServiceTraces('backend', 5);
    console.log(`\n   Recent traces: ${traces.length} traces found`);

    // Get service graph
    const graph = await mesh.getServiceGraph('default');
    console.log(`   Service graph: ${graph.nodes.length} nodes, ${graph.edges.length} edges\n`);

    // 6. Chaos engineering
    console.log('6. Injecting faults for testing...');
    
    // Inject 10% latency fault
    const latencyFault = MeshHelpers.createLatencyFault(10, 3000);
    const faultResult = await mesh.injectFault('backend', latencyFault);
    console.log(`   ✓ Latency fault injected: ${faultResult.faultId}`);

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Remove fault
    await mesh.removeFault(faultResult.faultId);
    console.log('   ✓ Fault removed\n');

    // 7. Progressive rollout
    console.log('7. Performing progressive rollout...');
    
    const rolloutSteps = [
      { v1: 90, v2: 10 },  // Start with 10%
      { v1: 75, v2: 25 },  // Increase to 25%
      { v1: 50, v2: 50 },  // 50/50 split
      { v1: 25, v2: 75 },  // Mostly v2
      { v1: 0, v2: 100 }   // Complete rollout
    ];

    for (const step of rolloutSteps) {
      const weights = [
        { version: 'v1', weight: step.v1 },
        { version: 'v2', weight: step.v2 }
      ];
      
      await mesh.setTrafficWeight('backend', weights);
      console.log(`   → Traffic split: v1=${step.v1}%, v2=${step.v2}%`);
      
      // In real scenario, you'd monitor metrics here
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    console.log('   ✓ Progressive rollout completed\n');

    // 8. Cleanup
    console.log('8. Cleaning up...');
    await mesh.unregisterService('frontend');
    await mesh.unregisterService('backend');
    console.log('   ✓ Services unregistered');

  } catch (error) {
    console.error('Error in example:', error.message);
  }

  // Listen to events
  mesh.on('service.registered', (event) => {
    console.log(`[Event] Service registered: ${event.serviceId}`);
  });

  mesh.on('traffic.weight.updated', (event) => {
    console.log(`[Event] Traffic weights updated for: ${event.serviceId}`);
  });

  console.log('\n=== Example completed ===');
}

// Run the example
if (require.main === module) {
  completeExample().catch(console.error);
}

module.exports = completeExample;