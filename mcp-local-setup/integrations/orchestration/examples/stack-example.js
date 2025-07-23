// Example Stack Deployment
// Shows how to use the orchestration system

const OrchestrationCore = require('../core/orchestration-interface');
const StackBuilder = require('../utils/stack-builder');
const HelmManager = require('../helm/helm-manager');

// Example 1: Deploy a multi-service application to Kubernetes
async function deployToKubernetes() {
  const orchestrator = new OrchestrationCore('kubernetes');
  
  // Build a stack using the StackBuilder
  const stackBuilder = new StackBuilder();
  const stack = stackBuilder
    .withName('mcp-application')
    .addService({
      name: 'api-gateway',
      image: 'mcp/api-gateway:v1.0.0',
      replicas: 3,
      ports: [{ containerPort: 8080 }],
      env: {
        SERVICE_NAME: 'api-gateway',
        LOG_LEVEL: 'info',
        ENABLE_METRICS: 'true'
      },
      labels: {
        'app.kubernetes.io/component': 'gateway',
        'app.kubernetes.io/part-of': 'mcp'
      }
    })
    .addService({
      name: 'user-service',
      image: 'mcp/user-service:v1.0.0',
      replicas: 2,
      ports: [{ containerPort: 9000 }],
      env: {
        SERVICE_NAME: 'user-service',
        DATABASE_URL: 'postgres://user-db:5432'
      },
      dependencies: ['user-db']
    })
    .addService({
      name: 'user-db',
      image: 'postgres:14',
      replicas: 1,
      ports: [{ containerPort: 5432 }],
      env: {
        POSTGRES_DB: 'users',
        POSTGRES_USER: 'admin',
        POSTGRES_PASSWORD: 'secret'
      },
      volumes: [{
        name: 'user-data',
        mountPath: '/var/lib/postgresql/data'
      }]
    })
    .addNetwork({
      name: 'mcp-network',
      driver: 'bridge'
    })
    .addVolume({
      name: 'user-data',
      driver: 'local'
    })
    .build();

  // Deploy the stack
  const deployment = await orchestrator.deployStack(stack);
  console.log('Deployed to Kubernetes:', deployment);

  // Enable auto-scaling for API gateway
  await orchestrator.enableAutoScaling(
    deployment.deploymentId,
    'api-gateway',
    { min: 2, max: 10, targetCPU: 70 }
  );

  // Create ConfigMap for application settings
  await orchestrator.createConfigMap(
    deployment.deploymentId,
    'app-config',
    {
      'app.properties': `
        feature.flags.new-ui=true
        feature.flags.beta-api=false
        rate.limit.requests=1000
        rate.limit.window=60
      `,
      'logging.yaml': `
        level: info
        format: json
        outputs:
          - console
          - file
      `
    }
  );

  // Create secrets
  await orchestrator.createSecret(
    deployment.deploymentId,
    'api-keys',
    {
      'jwt-secret': 'super-secret-key',
      'api-key': 'external-api-key-123'
    }
  );

  return deployment;
}

// Example 2: Deploy to Docker Swarm
async function deployToSwarm() {
  const orchestrator = new OrchestrationCore('swarm');
  
  const stack = {
    name: 'mcp-swarm-app',
    services: [{
      name: 'web',
      image: 'nginx:alpine',
      replicas: 3,
      ports: [{ containerPort: 80 }],
      serviceType: 'LoadBalancer'
    }, {
      name: 'redis',
      image: 'redis:7-alpine',
      replicas: 1,
      ports: [{ containerPort: 6379 }]
    }],
    networks: [{
      name: 'overlay-net',
      driver: 'overlay'
    }]
  };

  const deployment = await orchestrator.deployStack(stack);
  console.log('Deployed to Swarm:', deployment);

  // Scale the web service
  await orchestrator.scaleService(deployment.deploymentId, 'web', 5);

  return deployment;
}

// Example 3: Deploy using Helm
async function deployWithHelm() {
  const orchestrator = new OrchestrationCore('kubernetes');
  const helmManager = new HelmManager();

  // Generate a Helm chart for our application
  const chartPath = await helmManager.generateChart({
    name: 'mcp-helm-app',
    description: 'MCP Application deployed with Helm',
    version: '1.0.0',
    image: 'mcp/app',
    tag: 'v1.0.0',
    replicas: 3,
    port: 8080,
    serviceType: 'ClusterIP',
    ingressEnabled: true,
    hosts: [{
      host: 'mcp.example.com',
      paths: [{ path: '/', pathType: 'Prefix' }]
    }],
    autoscaling: true,
    minReplicas: 2,
    maxReplicas: 10,
    targetCPU: 80
  });

  // Install the Helm release
  const release = await orchestrator.installHelmChart(
    chartPath,
    'mcp-release',
    {
      namespace: 'production',
      replicaCount: 5,
      image: {
        tag: 'v1.1.0'
      }
    }
  );

  console.log('Deployed with Helm:', release);
  return release;
}

// Example 4: Cross-platform deployment
async function crossPlatformDeploy() {
  const stackBuilder = new StackBuilder();
  
  // Build a platform-agnostic stack
  const stack = stackBuilder
    .withName('cross-platform-app')
    .addService({
      name: 'app',
      image: 'myapp:latest',
      replicas: 2,
      ports: [{ containerPort: 3000 }],
      env: { NODE_ENV: 'production' }
    })
    .build();

  // Convert to different formats
  const k8sManifests = stackBuilder.toKubernetes();
  const swarmCompose = stackBuilder.toSwarm();
  const nomadJob = stackBuilder.toNomad();

  console.log('Kubernetes manifests:', k8sManifests);
  console.log('Swarm compose:', swarmCompose);
  console.log('Nomad job:', nomadJob);

  // Deploy to selected platform
  const platform = process.env.ORCHESTRATOR || 'kubernetes';
  const orchestrator = new OrchestrationCore(platform);
  const deployment = await orchestrator.deployStack(stack);

  return deployment;
}

// Example 5: Advanced orchestration patterns
async function advancedPatterns() {
  const orchestrator = new OrchestrationCore('kubernetes');

  // Blue-Green Deployment
  const blueStack = {
    name: 'app-blue',
    services: [{
      name: 'app-v1',
      image: 'app:v1.0.0',
      replicas: 5,
      labels: { version: 'blue' }
    }]
  };

  const greenStack = {
    name: 'app-green',
    services: [{
      name: 'app-v2',
      image: 'app:v2.0.0',
      replicas: 5,
      labels: { version: 'green' }
    }]
  };

  // Deploy blue version
  const blueDeployment = await orchestrator.deployStack(blueStack);
  
  // Deploy green version
  const greenDeployment = await orchestrator.deployStack(greenStack);

  // Get service endpoints
  const blueEndpoint = await orchestrator.getServiceEndpoint(
    blueDeployment.deploymentId,
    'app-v1'
  );
  
  const greenEndpoint = await orchestrator.getServiceEndpoint(
    greenDeployment.deploymentId,
    'app-v2'
  );

  console.log('Blue endpoint:', blueEndpoint);
  console.log('Green endpoint:', greenEndpoint);

  // Register DNS for traffic switching
  await orchestrator.registerServiceDNS(
    greenDeployment.deploymentId,
    'app-v2',
    'app.example.com'
  );

  return { blueDeployment, greenDeployment };
}

// Export examples
module.exports = {
  deployToKubernetes,
  deployToSwarm,
  deployWithHelm,
  crossPlatformDeploy,
  advancedPatterns
};