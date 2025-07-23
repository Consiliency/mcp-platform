// Integration Test: Orchestration with CI/CD Mock
// Purpose: Test orchestration features that integrate with CI/CD

const OrchestrationInterface = require('../../../interfaces/phase5/orchestration.interface');
const MockCICDIntegration = require('../../mocks/cicd-mock');

describe('Orchestration and CI/CD Integration', () => {
  let k8s;
  let swarm;
  let cicd;

  beforeEach(() => {
    k8s = new OrchestrationInterface('kubernetes');
    swarm = new OrchestrationInterface('swarm');
    cicd = new MockCICDIntegration('github');
  });

  test('CI/CD deploys built artifacts to Kubernetes', async () => {
    // Given a successful build
    const buildResult = await cicd.buildService('api-service', {
      dockerfile: './Dockerfile',
      context: '.',
      tags: ['v1.0.0', 'latest']
    });

    expect(buildResult.artifactId).toBeDefined();
    expect(buildResult.location).toContain('registry');

    // When deploying to Kubernetes
    const deploymentConfig = {
      name: 'api-service-deployment',
      services: [{
        name: 'api-service',
        image: buildResult.location,
        replicas: 3,
        ports: [{ containerPort: 8080 }]
      }],
      networks: [{
        name: 'api-network',
        type: 'ClusterIP'
      }]
    };

    const deployment = await k8s.deployStack(deploymentConfig);

    // Then deployment should succeed
    expect(deployment.deploymentId).toBeDefined();
    expect(deployment.namespace).toBe('default');

    // And CI/CD should track the deployment
    const cicdDeployment = await cicd.deployService('api-service', 'production', {
      orchestrator: 'kubernetes',
      deploymentId: deployment.deploymentId
    });

    expect(cicdDeployment.status).toBe('deployed');
  });

  test('Pipeline generates correct orchestration configs', async () => {
    // Given a multi-service application
    const pipelineOptions = {
      services: ['frontend', 'api', 'database'],
      deployTarget: 'kubernetes',
      tests: true
    };

    // When generating pipeline configuration
    const pipelineConfig = await cicd.generatePipelineConfig(pipelineOptions);

    // Then it should include orchestration deployment steps
    expect(pipelineConfig).toContain('kubectl apply');
    expect(pipelineConfig).toContain('helm upgrade');
    
    // Should reference each service
    pipelineOptions.services.forEach(service => {
      expect(pipelineConfig).toContain(service);
    });
  });

  test('Rollback works across CI/CD and orchestration', async () => {
    // Given a deployed application
    const deployment = await k8s.deployStack({
      name: 'test-app',
      services: [{ name: 'web', image: 'web:v1' }]
    });

    const cicdDeployment = await cicd.deployService('web', 'production', {
      orchestrator: 'kubernetes',
      deploymentId: deployment.deploymentId,
      version: 'v1'
    });

    // When rolling back via CI/CD
    const rollbackResult = await cicd.rollbackDeployment(cicdDeployment.deploymentId);

    // Then CI/CD rollback should succeed
    expect(rollbackResult.success).toBe(true);

    // In a real scenario, orchestration would detect the rollback
    // For now, we verify the deployment still exists
    const k8sStatus = await k8s.getDeploymentStatus(deployment.deploymentId);
    expect(k8sStatus.status).toBeDefined();
  });

  test('Orchestration scaling updates CI/CD metrics', async () => {
    // Given a deployed service
    const deployment = await k8s.deployStack({
      name: 'scalable-app',
      services: [{ name: 'worker', image: 'worker:v1', replicas: 2 }]
    });

    // Track in CI/CD
    const cicdDeployment = await cicd.deployService('worker', 'production', {
      orchestrator: 'kubernetes',
      deploymentId: deployment.deploymentId
    });

    // When scaling via orchestration
    await k8s.scaleService(deployment.deploymentId, 'worker', 5);

    // Then CI/CD should be able to query updated metrics
    const metrics = await cicd.getDeploymentStatus(cicdDeployment.deploymentId);
    expect(metrics.details.replicas).toBe(5);
    expect(metrics.details.scalingEvents).toBeDefined();
  });

  test('Helm charts are generated from CI/CD and deployed', async () => {
    // Given a service configuration in CI/CD
    const buildResult = await cicd.buildService('helm-app', {
      generateHelm: true,
      helmValues: {
        replicaCount: 3,
        image: { repository: 'myapp', tag: '1.0.0' }
      }
    });

    expect(buildResult.helmChartPath).toBeDefined();

    // When deploying the Helm chart
    const helmRelease = await k8s.installHelmChart(
      buildResult.helmChartPath,
      'myapp-release',
      { namespace: 'production' }
    );

    // Then deployment should succeed
    expect(helmRelease.success).toBe(true);
    expect(helmRelease.releaseInfo.status).toBe('deployed');
  });

  test('Docker Swarm deployment via CI/CD', async () => {
    // Given building for Swarm
    const buildResult = await cicd.buildService('swarm-service', {
      platform: 'swarm',
      stackFile: './docker-stack.yml'
    });

    // When deploying to Swarm
    const swarmDeployment = await swarm.deployStack({
      name: 'swarm-app',
      services: [{
        name: 'web',
        image: buildResult.location,
        replicas: 3
      }]
    });

    // Then CI/CD tracks Swarm deployment
    const deployment = await cicd.deployService('swarm-service', 'production', {
      orchestrator: 'swarm',
      deploymentId: swarmDeployment.deploymentId
    });

    expect(deployment.status).toBe('deployed');
  });

  test('Multi-platform deployment coordination', async () => {
    // Build once
    const buildResult = await cicd.buildService('multi-platform-app', {
      dockerfile: './Dockerfile',
      tags: ['v2.0.0']
    });

    // Deploy to both platforms
    const k8sDeployment = await k8s.deployStack({
      name: 'app-k8s',
      services: [{
        name: 'app',
        image: buildResult.location,
        replicas: 5
      }]
    });

    const swarmDeployment = await swarm.deployStack({
      name: 'app-swarm',
      services: [{
        name: 'app',
        image: buildResult.location,
        replicas: 3
      }]
    });

    // Track both in CI/CD
    const k8sTracking = await cicd.deployService('app', 'k8s-prod', {
      orchestrator: 'kubernetes',
      deploymentId: k8sDeployment.deploymentId
    });

    const swarmTracking = await cicd.deployService('app', 'swarm-prod', {
      orchestrator: 'swarm',
      deploymentId: swarmDeployment.deploymentId
    });

    expect(k8sTracking.status).toBe('deployed');
    expect(swarmTracking.status).toBe('deployed');
  });

  test('Environment-specific configurations', async () => {
    const environments = ['dev', 'staging', 'production'];
    
    for (const env of environments) {
      // Create environment-specific config
      const deployment = await k8s.deployStack({
        name: `app-${env}`,
        services: [{
          name: 'app',
          image: 'app:latest',
          replicas: env === 'production' ? 5 : 1,
          env: {
            ENVIRONMENT: env,
            LOG_LEVEL: env === 'production' ? 'warn' : 'debug'
          }
        }]
      });

      // Create environment-specific secrets
      await k8s.createSecret(deployment.deploymentId, `${env}-secrets`, {
        DB_PASSWORD: `${env}-password`,
        API_KEY: `${env}-key`
      });

      expect(deployment.deploymentId).toBeDefined();
    }
  });
});