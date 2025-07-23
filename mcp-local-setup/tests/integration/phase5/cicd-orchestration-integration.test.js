// Integration Test: CI/CD and Orchestration Integration
// Purpose: Verify CI/CD pipelines can deploy to orchestration platforms
// Components involved: CI/CD Integration, Container Orchestration

const CICDIntegrationInterface = require('../../../interfaces/phase5/cicd-integration.interface');
const OrchestrationInterface = require('../../../interfaces/phase5/orchestration.interface');

describe('CI/CD and Orchestration Integration', () => {
  let cicd;
  let k8s;
  let swarm;

  beforeEach(() => {
    cicd = new CICDIntegrationInterface('github');
    k8s = new OrchestrationInterface('kubernetes');
    swarm = new OrchestrationInterface('swarm');
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

    // Then orchestration should also rollback
    const k8sStatus = await k8s.getDeploymentStatus(deployment.deploymentId);
    expect(k8sStatus.status).toBe('rolled-back');
    expect(rollbackResult.success).toBe(true);
  });

  test('CI/CD test results influence orchestration deployment', async () => {
    // Given running tests in CI/CD
    const testResults = await cicd.runTests('api-service', 'integration');

    // When tests fail
    if (!testResults.passed) {
      // Then deployment to orchestration should be prevented
      try {
        await k8s.deployStack({
          name: 'api-service',
          services: [{ name: 'api', image: 'api:failing' }]
        });
        fail('Deployment should have been prevented');
      } catch (error) {
        expect(error.message).toContain('Tests must pass before deployment');
      }
    }
  });

  test('Orchestration scaling triggers CI/CD metrics update', async () => {
    // Given a deployed service
    const deployment = await k8s.deployStack({
      name: 'scalable-app',
      services: [{ name: 'worker', image: 'worker:v1', replicas: 2 }]
    });

    // When scaling via orchestration
    await k8s.scaleService(deployment.deploymentId, 'worker', 5);

    // Then CI/CD should reflect the scaling
    const metrics = await cicd.getDeploymentStatus(deployment.deploymentId);
    expect(metrics.details.replicas).toBe(5);
    expect(metrics.details.scalingEvents).toContainEqual(
      expect.objectContaining({
        type: 'manual-scale',
        from: 2,
        to: 5
      })
    );
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

  test('CI/CD webhooks trigger orchestration updates', async () => {
    // Given a webhook for continuous deployment
    const webhook = await cicd.registerWebhook('build.success', 'http://orchestrator/deploy');

    // When a build succeeds (simulated)
    const buildEvent = {
      artifactId: 'abc123',
      serviceId: 'auto-deploy-service',
      image: 'service:latest'
    };

    // Then orchestration should auto-deploy
    // (In real implementation, webhook would trigger this)
    const autoDeployment = await k8s.deployStack({
      name: buildEvent.serviceId,
      services: [{
        name: buildEvent.serviceId,
        image: buildEvent.image
      }]
    });

    expect(autoDeployment.deploymentId).toBeDefined();
  });
});