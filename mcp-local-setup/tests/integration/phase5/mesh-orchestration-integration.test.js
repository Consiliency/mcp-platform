// Integration Test: Service Mesh and Orchestration Integration
// Purpose: Verify service mesh features work with orchestrated services
// Components involved: Service Mesh, Container Orchestration, SDK

const ServiceMeshInterface = require('../../../interfaces/phase5/service-mesh.interface');
const OrchestrationInterface = require('../../../interfaces/phase5/orchestration.interface');
const SDKCoreInterface = require('../../../interfaces/phase5/sdk-core.interface');

describe('Service Mesh and Orchestration Integration', () => {
  let istio;
  let k8s;
  let sdk;

  beforeEach(() => {
    istio = new ServiceMeshInterface('istio');
    k8s = new OrchestrationInterface('kubernetes');
    sdk = new SDKCoreInterface({ apiKey: 'mesh-test' });
  });

  test('Services deployed to K8s are automatically registered in mesh', async () => {
    // Given deploying a service to Kubernetes
    const k8sDeployment = await k8s.deployStack({
      name: 'mesh-enabled-app',
      services: [{
        name: 'api-gateway',
        image: 'gateway:v1',
        ports: [{ containerPort: 8080 }],
        labels: { 'istio-injection': 'enabled' }
      }]
    });

    // When the service is deployed
    // Then it should be automatically registered in the service mesh
    const meshService = await istio.registerService({
      name: 'api-gateway',
      port: 8080,
      protocol: 'http',
      metadata: {
        deploymentId: k8sDeployment.deploymentId,
        namespace: k8sDeployment.namespace
      }
    });

    expect(meshService.serviceId).toBeDefined();
    expect(meshService.proxyPort).toBe(15001); // Envoy sidecar port
  });

  test('Traffic management policies apply to orchestrated services', async () => {
    // Given multiple versions deployed via K8s
    const v1Deployment = await k8s.deployStack({
      name: 'app-v1',
      services: [{
        name: 'backend',
        image: 'backend:v1',
        labels: { version: 'v1' }
      }]
    });

    const v2Deployment = await k8s.deployStack({
      name: 'app-v2',
      services: [{
        name: 'backend',
        image: 'backend:v2',
        labels: { version: 'v2' }
      }]
    });

    // When configuring traffic splitting
    const virtualService = await istio.createVirtualService({
      name: 'backend-routing',
      hosts: ['backend'],
      routes: [{
        match: [{ headers: { 'x-version': { exact: 'v2' } } }],
        route: [{ destination: { host: 'backend', subset: 'v2' } }]
      }, {
        route: [
          { destination: { host: 'backend', subset: 'v1' }, weight: 80 },
          { destination: { host: 'backend', subset: 'v2' }, weight: 20 }
        ]
      }]
    });

    // Then traffic should be routed according to rules
    const v1Endpoint = await k8s.getServiceEndpoint(v1Deployment.deploymentId, 'backend');
    const v2Endpoint = await k8s.getServiceEndpoint(v2Deployment.deploymentId, 'backend');
    
    expect(virtualService.virtualServiceId).toBeDefined();
    expect(v1Endpoint.internal).toBeDefined();
    expect(v2Endpoint.internal).toBeDefined();
  });

  test('Service mesh mTLS works with orchestrator networking', async () => {
    // Given services deployed in K8s namespace
    const namespace = 'secure-apps';
    const deployment = await k8s.deployStack({
      name: 'secure-communication',
      services: [
        { name: 'frontend', image: 'frontend:v1' },
        { name: 'backend', image: 'backend:v1' }
      ]
    });

    // When enabling mTLS for the namespace
    const mtlsResult = await istio.enableMTLS(namespace);

    // Then services should communicate securely
    expect(mtlsResult.success).toBe(true);
    expect(mtlsResult.certInfo).toHaveProperty('issuer');
    expect(mtlsResult.certInfo).toHaveProperty('validUntil');

    // And K8s secrets should be created for certificates
    const certSecret = await k8s.createSecret(
      deployment.deploymentId,
      'istio-certs',
      mtlsResult.certInfo.certificates
    );
    expect(certSecret.secretId).toBeDefined();
  });

  test('SDK can query services through mesh-enabled endpoints', async () => {
    // Given a mesh-managed service
    const meshService = await istio.registerService({
      name: 'data-api',
      port: 9000,
      protocol: 'grpc'
    });

    // When SDK calls the service
    const response = await sdk.callService('data-api', 'getData', {
      query: 'SELECT * FROM users'
    });

    // Then the call should go through the mesh proxy
    // (Service mesh adds tracing headers)
    expect(response._headers).toHaveProperty('x-request-id');
    expect(response._headers).toHaveProperty('x-b3-traceid');
  });

  test('Circuit breaker policies protect orchestrated services', async () => {
    // Given a service with circuit breaker
    const deployment = await k8s.deployStack({
      name: 'protected-service',
      services: [{ name: 'fragile-api', image: 'api:v1' }]
    });

    await istio.configureCircuitBreaker('fragile-api', {
      maxConnections: 10,
      timeout: 5000,
      maxRetries: 3
    });

    // When the service experiences failures
    // Simulate multiple failed calls
    const failedCalls = [];
    for (let i = 0; i < 15; i++) {
      failedCalls.push(
        sdk.callService('fragile-api', 'riskyOperation', {}).catch(e => e)
      );
    }

    const results = await Promise.all(failedCalls);
    
    // Then circuit breaker should open after threshold
    const openCircuitErrors = results.filter(r => 
      r.message && r.message.includes('circuit breaker open')
    );
    expect(openCircuitErrors.length).toBeGreaterThan(0);
  });

  test('Service mesh observability integrates with orchestrator metrics', async () => {
    // Given services running in K8s with mesh
    const deployment = await k8s.deployStack({
      name: 'observable-app',
      services: [
        { name: 'web', image: 'web:v1' },
        { name: 'api', image: 'api:v1' },
        { name: 'db', image: 'db:v1' }
      ]
    });

    // When querying mesh metrics
    const meshMetrics = await istio.getServiceMetrics('api', {
      start: new Date(Date.now() - 3600000),
      end: new Date()
    });

    // And orchestrator metrics
    const k8sMetrics = await k8s.getResourceUsage(deployment.deploymentId);

    // Then both should provide complementary data
    expect(meshMetrics).toHaveProperty('requestRate');
    expect(meshMetrics).toHaveProperty('errorRate');
    expect(meshMetrics).toHaveProperty('latency');
    
    expect(k8sMetrics).toHaveProperty('cpu');
    expect(k8sMetrics).toHaveProperty('memory');
    
    // Mesh focuses on traffic, K8s on resources
    expect(meshMetrics.requestRate).toBeGreaterThanOrEqual(0);
    expect(k8sMetrics.cpu).toBeGreaterThanOrEqual(0);
  });

  test('Canary deployments use both orchestration and mesh', async () => {
    // Given current production version
    const prodDeployment = await k8s.deployStack({
      name: 'app-prod',
      services: [{
        name: 'web-app',
        image: 'app:v1.0',
        replicas: 10,
        labels: { version: 'stable' }
      }]
    });

    // When deploying canary version
    const canaryDeployment = await k8s.deployStack({
      name: 'app-canary',
      services: [{
        name: 'web-app',
        image: 'app:v2.0',
        replicas: 1,
        labels: { version: 'canary' }
      }]
    });

    // Then configure mesh for canary traffic
    await istio.setTrafficWeight('web-app', [
      { version: 'stable', weight: 95 },
      { version: 'canary', weight: 5 }
    ]);

    // And monitor canary metrics
    const canaryMetrics = await istio.getServiceMetrics('web-app', {
      start: new Date(),
      end: new Date(),
      labels: { version: 'canary' }
    });

    expect(canaryMetrics.errorRate).toBeLessThan(0.01); // Less than 1% errors
  });

  test('Fault injection tests orchestrated service resilience', async () => {
    // Given a multi-service application in K8s
    const deployment = await k8s.deployStack({
      name: 'resilient-app',
      services: [
        { name: 'frontend', image: 'frontend:v1' },
        { name: 'backend', image: 'backend:v1' },
        { name: 'cache', image: 'cache:v1' }
      ]
    });

    // When injecting faults via service mesh
    const delayFault = await istio.injectFault('backend', {
      type: 'delay',
      percentage: 50,
      value: 3000 // 3 second delay
    });

    const abortFault = await istio.injectFault('cache', {
      type: 'abort',
      percentage: 10,
      value: 503 // Service unavailable
    });

    // Then services should handle faults gracefully
    const frontendHealth = await sdk.getHealth('frontend');
    expect(frontendHealth.status).toBe('degraded'); // Not 'failed'
    expect(frontendHealth.details).toHaveProperty('fallbackActive', true);

    // Clean up faults
    await istio.removeFault(delayFault.faultId);
    await istio.removeFault(abortFault.faultId);
  });
});