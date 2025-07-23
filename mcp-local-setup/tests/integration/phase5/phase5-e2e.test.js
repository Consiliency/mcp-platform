// End-to-End Integration Test: Phase 5 Complete Workflow
// Purpose: Verify all Phase 5 components work together in realistic scenarios
// Components involved: All Phase 5 interfaces

const SDKCoreInterface = require('../../../interfaces/phase5/sdk-core.interface');
const { CLIPluginInterface, CLIPluginLoader } = require('../../../interfaces/phase5/cli-plugin.interface');
const IDEExtensionInterface = require('../../../interfaces/phase5/ide-extension.interface');
const CICDIntegrationInterface = require('../../../interfaces/phase5/cicd-integration.interface');
const OrchestrationInterface = require('../../../interfaces/phase5/orchestration.interface');
const ServiceMeshInterface = require('../../../interfaces/phase5/service-mesh.interface');

describe('Phase 5 End-to-End Integration', () => {
  let sdk;
  let cliPlugin;
  let ideExtension;
  let cicd;
  let k8s;
  let istio;

  beforeEach(() => {
    sdk = new SDKCoreInterface({ apiKey: 'e2e-test' });
    ideExtension = new IDEExtensionInterface(sdk);
    cicd = new CICDIntegrationInterface('github');
    k8s = new OrchestrationInterface('kubernetes');
    istio = new ServiceMeshInterface('istio');
  });

  test('Complete developer workflow from IDE to production', async () => {
    // 1. Developer writes code in IDE with MCP service references
    const codeDocument = {
      uri: 'file:///project/src/app.js',
      content: `
        const mcp = require('@mcp/sdk');
        const db = mcp.connect('postgres-mcp');
        const cache = mcp.connect('redis-mcp');
      `
    };

    // 2. IDE provides intelligent assistance
    const completions = await ideExtension.getCompletions(codeDocument, {
      line: 2, character: 30
    });
    expect(completions).toContainEqual(
      expect.objectContaining({ label: 'postgres-mcp' })
    );

    // 3. IDE detects missing services
    const diagnostics = await ideExtension.getDiagnostics(codeDocument);
    const missingServices = diagnostics.filter(d => d.message.includes('not installed'));
    expect(missingServices).toHaveLength(2);

    // 4. Developer uses CLI plugin to install services
    const installPlugin = {
      async executeCommand(cmd, args) {
        if (cmd === 'install') {
          return await sdk.installService(args.service, args.config);
        }
      }
    };

    const pgInstall = await installPlugin.executeCommand('install', {
      service: 'postgres-mcp',
      config: { version: '14' }
    });
    expect(pgInstall.success).toBe(true);

    // 5. Developer commits code, triggering CI/CD
    const pipelineConfig = await cicd.generatePipelineConfig({
      services: ['app-service'],
      deployTarget: 'kubernetes',
      tests: true
    });
    expect(pipelineConfig).toContain('test');
    expect(pipelineConfig).toContain('build');
    expect(pipelineConfig).toContain('deploy');

    // 6. CI/CD builds the application
    const buildResult = await cicd.buildService('app-service', {
      dockerfile: './Dockerfile',
      buildArgs: { NODE_ENV: 'production' }
    });
    expect(buildResult.artifactId).toBeDefined();

    // 7. CI/CD runs tests
    const testResults = await cicd.runTests('app-service', 'integration');
    expect(testResults.passed).toBe(true);

    // 8. Deploy to Kubernetes via CI/CD
    const k8sDeployment = await k8s.deployStack({
      name: 'app-service',
      services: [{
        name: 'app',
        image: buildResult.location,
        replicas: 3,
        ports: [{ containerPort: 3000 }]
      }]
    });

    // 9. Service mesh automatically manages the deployment
    const meshRegistration = await istio.registerService({
      name: 'app',
      port: 3000,
      protocol: 'http',
      metadata: { deploymentId: k8sDeployment.deploymentId }
    });

    // 10. Configure production traffic management
    await istio.createVirtualService({
      name: 'app-routing',
      hosts: ['app.example.com'],
      routes: [{
        route: [{ destination: { host: 'app' } }]
      }]
    });

    // 11. Enable security policies
    await istio.enableMTLS(k8sDeployment.namespace);
    await istio.createAuthorizationPolicy({
      name: 'app-authz',
      namespace: k8sDeployment.namespace,
      rules: [{
        from: [{ source: { principals: ['cluster.local/ns/default/sa/frontend'] } }],
        to: [{ operation: { methods: ['GET', 'POST'] } }]
      }]
    });

    // 12. Monitor production health via SDK
    const health = await sdk.getHealth('app-service');
    expect(health.status).toBe('healthy');

    // 13. View metrics in IDE
    await ideExtension.showServiceDetails('app-service');
    
    // 14. Setup continuous monitoring
    const metrics = await istio.getServiceMetrics('app', {
      start: new Date(Date.now() - 300000),
      end: new Date()
    });
    expect(metrics.requestRate).toBeGreaterThan(0);
    expect(metrics.errorRate).toBeLessThan(0.01);
  });

  test('Collaborative development with multiple tools', async () => {
    // Developer A uses VS Code extension
    const vscodeExt = new IDEExtensionInterface(sdk);
    await vscodeExt.startLanguageServer();

    // Developer B uses IntelliJ extension  
    const intellijExt = new IDEExtensionInterface(sdk);
    await intellijExt.startLanguageServer();

    // Developer C uses CLI plugins
    const cliLoader = new CLIPluginLoader();
    const gitPlugin = await cliLoader.installPlugin('@mcp/cli-plugin-git');
    const dockerPlugin = await cliLoader.installPlugin('@mcp/cli-plugin-docker');

    // All developers work on the same service
    const serviceId = 'shared-service';

    // They all see the same service status
    const healthFromVSCode = await sdk.getHealth(serviceId);
    const healthFromIntelliJ = await sdk.getHealth(serviceId);
    const healthFromCLI = await sdk.getHealth(serviceId);

    expect(healthFromVSCode).toEqual(healthFromIntelliJ);
    expect(healthFromIntelliJ).toEqual(healthFromCLI);
  });

  test('Progressive rollout with monitoring', async () => {
    // 1. Current version in production
    const v1Deployment = await k8s.deployStack({
      name: 'app-v1',
      services: [{
        name: 'api',
        image: 'api:v1.0',
        replicas: 10,
        labels: { version: 'v1' }
      }]
    });

    // 2. Build new version
    const v2Build = await cicd.buildService('api', {
      version: 'v2.0',
      gitRef: 'feature/new-algorithm'
    });

    // 3. Deploy canary
    const v2Deployment = await k8s.deployStack({
      name: 'app-v2',
      services: [{
        name: 'api',
        image: v2Build.location,
        replicas: 1,
        labels: { version: 'v2' }
      }]
    });

    // 4. Configure progressive rollout
    const trafficSteps = [
      { v1: 95, v2: 5 },   // 5% to canary
      { v1: 80, v2: 20 },  // 20% if successful
      { v1: 50, v2: 50 },  // 50/50 split
      { v1: 20, v2: 80 },  // Mostly v2
      { v1: 0, v2: 100 }   // Full rollout
    ];

    for (const step of trafficSteps) {
      // Update traffic split
      await istio.setTrafficWeight('api', [
        { version: 'v1', weight: step.v1 },
        { version: 'v2', weight: step.v2 }
      ]);

      // Monitor for 5 minutes (simulated)
      const metrics = await istio.getServiceMetrics('api', {
        start: new Date(Date.now() - 300000),
        end: new Date(),
        labels: { version: 'v2' }
      });

      // Check error rate
      if (metrics.errorRate > 0.02) {
        // Rollback if errors exceed 2%
        await cicd.rollbackDeployment(v2Deployment.deploymentId);
        await istio.setTrafficWeight('api', [
          { version: 'v1', weight: 100 },
          { version: 'v2', weight: 0 }
        ]);
        throw new Error('Rollout failed due to high error rate');
      }

      // Continue if healthy
      expect(metrics.errorRate).toBeLessThan(0.02);
    }

    // 5. Update Kubernetes to scale v2 and remove v1
    await k8s.scaleService(v2Deployment.deploymentId, 'api', 10);
    await k8s.deleteStack(v1Deployment.deploymentId);
  });

  test('Multi-cloud deployment with unified management', async () => {
    // Initialize orchestrators for different clouds
    const awsK8s = new OrchestrationInterface('kubernetes');
    const gcpK8s = new OrchestrationInterface('kubernetes'); 
    const azureK8s = new OrchestrationInterface('kubernetes');

    // Deploy to multiple clouds
    const deployments = await Promise.all([
      awsK8s.deployStack({
        name: 'app-aws',
        services: [{ name: 'api', image: 'api:latest' }]
      }),
      gcpK8s.deployStack({
        name: 'app-gcp',
        services: [{ name: 'api', image: 'api:latest' }]
      }),
      azureK8s.deployStack({
        name: 'app-azure',
        services: [{ name: 'api', image: 'api:latest' }]
      })
    ]);

    // Configure global load balancing via service mesh
    await istio.createVirtualService({
      name: 'global-api',
      hosts: ['api.global.example.com'],
      routes: [{
        route: [
          { destination: { host: 'api.aws' }, weight: 33 },
          { destination: { host: 'api.gcp' }, weight: 33 },
          { destination: { host: 'api.azure' }, weight: 34 }
        ]
      }]
    });

    // Monitor all regions via SDK
    const globalHealth = await sdk.getHealth('api');
    expect(globalHealth.status).toBe('healthy');
    expect(globalHealth.details.regions).toHaveLength(3);
  });

  test('Debugging production issues with integrated tools', async () => {
    // 1. Alert triggered in production
    const alert = {
      service: 'payment-api',
      error: 'High latency detected',
      p99Latency: 5000 // 5 seconds
    };

    // 2. Developer opens IDE and connects to production
    const debugSession = await ideExtension.startDebugging({
      serviceId: alert.service,
      environment: 'production',
      breakpoints: []
    });

    // 3. Get distributed traces from service mesh
    const traces = await istio.getServiceTraces(alert.service, 10);
    const slowTrace = traces.find(t => t.duration > 4000);
    expect(slowTrace).toBeDefined();

    // 4. Identify slow downstream service
    const serviceGraph = await istio.getServiceGraph();
    const dependencies = serviceGraph.edges.filter(e => e.source === alert.service);
    
    // 5. Check downstream service health
    for (const dep of dependencies) {
      const downstreamHealth = await sdk.getHealth(dep.target);
      if (downstreamHealth.status !== 'healthy') {
        // Found the issue
        expect(dep.target).toBe('legacy-database');
        
        // 6. Apply temporary fix via service mesh
        await istio.configureCircuitBreaker(dep.target, {
          maxConnections: 5,
          timeout: 1000,
          maxRetries: 1
        });
        
        // 7. Configure retry policy
        await istio.setRetryPolicy(alert.service, {
          attempts: 3,
          perTryTimeout: 1000,
          retryOn: ['5xx', 'reset', 'connect-failure']
        });
      }
    }

    // 8. Verify fix
    const metricsAfter = await istio.getServiceMetrics(alert.service, {
      start: new Date(),
      end: new Date()
    });
    expect(metricsAfter.latency.p99).toBeLessThan(2000);

    // 9. Stop debug session
    await ideExtension.stopDebugging(debugSession.sessionId);
  });
});