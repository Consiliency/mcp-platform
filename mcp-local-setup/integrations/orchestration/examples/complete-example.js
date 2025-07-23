// Complete Orchestration Example
// Demonstrates all features of the MCP Orchestration system

const OrchestrationCore = require('../core/orchestration-interface');
const StackBuilder = require('../utils/stack-builder');
const ServiceDiscovery = require('../utils/service-discovery');
const HelmManager = require('../helm/helm-manager');
const MCPServiceOperator = require('../operators/mcp-service-operator');

async function main() {
  console.log('MCP Orchestration System - Complete Example\n');

  // 1. Basic Kubernetes Deployment
  console.log('1. Deploying to Kubernetes...');
  await deployToKubernetes();

  // 2. Docker Swarm Deployment
  console.log('\n2. Deploying to Docker Swarm...');
  await deployToSwarm();

  // 3. Nomad Deployment
  console.log('\n3. Deploying to Nomad...');
  await deployToNomad();

  // 4. Advanced Patterns
  console.log('\n4. Demonstrating advanced patterns...');
  await demonstrateAdvancedPatterns();

  // 5. Service Discovery
  console.log('\n5. Service Discovery example...');
  await demonstrateServiceDiscovery();

  // 6. Kubernetes Operator
  console.log('\n6. Kubernetes Operator example...');
  await demonstrateOperator();
}

async function deployToKubernetes() {
  const orchestrator = new OrchestrationCore('kubernetes');
  
  // Build a microservices application stack
  const stackBuilder = new StackBuilder();
  const stack = stackBuilder
    .withName('mcp-microservices')
    // Frontend service
    .addService({
      name: 'frontend',
      image: 'mcp/frontend:v1.0.0',
      replicas: 3,
      ports: [{ containerPort: 3000 }],
      env: {
        API_URL: 'http://api-gateway:8080',
        REACT_APP_ENV: 'production'
      },
      labels: {
        tier: 'frontend',
        'app.kubernetes.io/component': 'ui'
      }
    })
    // API Gateway
    .addService({
      name: 'api-gateway',
      image: 'mcp/api-gateway:v1.0.0',
      replicas: 3,
      ports: [{ containerPort: 8080 }],
      env: {
        SERVICE_DISCOVERY_URL: 'http://service-registry:8500',
        RATE_LIMIT: '1000',
        ENABLE_CORS: 'true'
      },
      healthCheck: {
        path: '/health',
        interval: 30,
        timeout: 5
      }
    })
    // User Service
    .addService({
      name: 'user-service',
      image: 'mcp/user-service:v1.0.0',
      replicas: 2,
      ports: [{ containerPort: 9001 }],
      env: {
        DB_HOST: 'user-db',
        DB_PORT: '5432',
        DB_NAME: 'users'
      },
      dependencies: ['user-db']
    })
    // User Database
    .addService({
      name: 'user-db',
      image: 'postgres:14-alpine',
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
      }],
      resources: {
        limits: { cpu: '2', memory: '2Gi' },
        requests: { cpu: '500m', memory: '1Gi' }
      }
    })
    // Order Service
    .addService({
      name: 'order-service',
      image: 'mcp/order-service:v1.0.0',
      replicas: 2,
      ports: [{ containerPort: 9002 }],
      env: {
        DB_HOST: 'order-db',
        USER_SERVICE_URL: 'http://user-service:9001'
      }
    })
    // Order Database
    .addService({
      name: 'order-db',
      image: 'mongo:5',
      replicas: 1,
      ports: [{ containerPort: 27017 }],
      volumes: [{
        name: 'order-data',
        mountPath: '/data/db'
      }]
    })
    // Message Queue
    .addService({
      name: 'message-queue',
      image: 'rabbitmq:3-management',
      replicas: 1,
      ports: [
        { containerPort: 5672 },
        { containerPort: 15672 } // Management UI
      ],
      env: {
        RABBITMQ_DEFAULT_USER: 'admin',
        RABBITMQ_DEFAULT_PASS: 'secret'
      }
    })
    // Networks
    .addNetwork({
      name: 'frontend-network',
      type: 'ClusterIP'
    })
    .addNetwork({
      name: 'backend-network',
      type: 'ClusterIP'
    })
    // Volumes
    .addVolume({
      name: 'user-data',
      driver: 'local'
    })
    .addVolume({
      name: 'order-data',
      driver: 'local'
    })
    .build();

  // Deploy the stack
  const deployment = await orchestrator.deployStack(stack);
  console.log(`✓ Deployed stack: ${deployment.deploymentId}`);

  // Configure auto-scaling for frontend and API gateway
  await orchestrator.enableAutoScaling(
    deployment.deploymentId,
    'frontend',
    { min: 2, max: 10, targetCPU: 70 }
  );
  await orchestrator.enableAutoScaling(
    deployment.deploymentId,
    'api-gateway',
    { min: 2, max: 8, targetCPU: 60 }
  );
  console.log('✓ Configured auto-scaling');

  // Create ConfigMaps
  await orchestrator.createConfigMap(
    deployment.deploymentId,
    'app-config',
    {
      'feature-flags.json': JSON.stringify({
        newUI: true,
        betaFeatures: false,
        maintenanceMode: false
      }),
      'rate-limits.yaml': `
default:
  requests_per_minute: 60
  burst: 100
premium:
  requests_per_minute: 600
  burst: 1000`
    }
  );
  console.log('✓ Created ConfigMaps');

  // Create Secrets
  await orchestrator.createSecret(
    deployment.deploymentId,
    'app-secrets',
    {
      'jwt-secret': 'super-secret-jwt-key',
      'db-password': 'secure-database-password',
      'api-keys': JSON.stringify({
        stripe: 'sk_test_123',
        sendgrid: 'SG.123'
      })
    }
  );
  console.log('✓ Created Secrets');

  // Get service endpoints
  const frontendEndpoint = await orchestrator.getServiceEndpoint(
    deployment.deploymentId,
    'frontend'
  );
  const apiEndpoint = await orchestrator.getServiceEndpoint(
    deployment.deploymentId,
    'api-gateway'
  );
  console.log(`✓ Frontend: ${frontendEndpoint.internal}`);
  console.log(`✓ API Gateway: ${apiEndpoint.internal}`);

  // Get deployment status
  const status = await orchestrator.getDeploymentStatus(deployment.deploymentId);
  console.log(`✓ Deployment status: ${status.status}`);
  console.log(`✓ Services running: ${status.services.length}`);

  return deployment;
}

async function deployToSwarm() {
  const orchestrator = new OrchestrationCore('swarm');
  
  const stack = {
    name: 'swarm-stack',
    services: [
      {
        name: 'web',
        image: 'nginx:alpine',
        replicas: 3,
        ports: [{ containerPort: 80 }],
        labels: {
          'com.docker.stack.service': 'web'
        }
      },
      {
        name: 'api',
        image: 'node:16-alpine',
        replicas: 2,
        ports: [{ containerPort: 3000 }],
        command: 'node',
        args: ['server.js']
      },
      {
        name: 'redis',
        image: 'redis:7-alpine',
        replicas: 1,
        ports: [{ containerPort: 6379 }]
      }
    ],
    networks: [
      {
        name: 'overlay-net',
        driver: 'overlay',
        attachable: true
      }
    ]
  };

  const deployment = await orchestrator.deployStack(stack);
  console.log(`✓ Deployed Swarm stack: ${deployment.deploymentId}`);

  // Scale the web service
  await orchestrator.scaleService(deployment.deploymentId, 'web', 5);
  console.log('✓ Scaled web service to 5 replicas');

  // Update the stack
  await orchestrator.updateStack(deployment.deploymentId, {
    services: [{
      name: 'api',
      image: 'node:18-alpine',
      replicas: 3
    }]
  });
  console.log('✓ Updated API service');

  return deployment;
}

async function deployToNomad() {
  const orchestrator = new OrchestrationCore('nomad');
  
  const stack = {
    name: 'nomad-job',
    services: [
      {
        name: 'batch-processor',
        image: 'mcp/batch-processor:v1.0.0',
        replicas: 5,
        env: {
          QUEUE_URL: 'amqp://localhost:5672',
          BATCH_SIZE: '100'
        }
      },
      {
        name: 'scheduler',
        image: 'mcp/scheduler:v1.0.0',
        replicas: 1,
        env: {
          CRON_EXPRESSION: '*/5 * * * *'
        }
      }
    ]
  };

  const deployment = await orchestrator.deployStack(stack);
  console.log(`✓ Deployed Nomad job: ${deployment.deploymentId}`);

  // Get resource usage
  const usage = await orchestrator.getResourceUsage(deployment.deploymentId);
  console.log(`✓ Resource usage - CPU: ${usage.cpu}, Memory: ${usage.memory}MB`);

  return deployment;
}

async function demonstrateAdvancedPatterns() {
  const orchestrator = new OrchestrationCore('kubernetes');

  // 1. Blue-Green Deployment
  console.log('\nBlue-Green Deployment:');
  
  // Deploy blue version
  const blueStack = {
    name: 'app-blue',
    services: [{
      name: 'app',
      image: 'myapp:v1.0.0',
      replicas: 5,
      labels: { version: 'blue', active: 'true' },
      ports: [{ containerPort: 8080 }]
    }]
  };
  const blueDeployment = await orchestrator.deployStack(blueStack);
  console.log('✓ Blue version deployed');

  // Deploy green version
  const greenStack = {
    name: 'app-green',
    services: [{
      name: 'app',
      image: 'myapp:v2.0.0',
      replicas: 5,
      labels: { version: 'green', active: 'false' },
      ports: [{ containerPort: 8080 }]
    }]
  };
  const greenDeployment = await orchestrator.deployStack(greenStack);
  console.log('✓ Green version deployed');

  // Switch traffic to green
  await orchestrator.registerServiceDNS(
    greenDeployment.deploymentId,
    'app',
    'app.example.com'
  );
  console.log('✓ Traffic switched to green version');

  // 2. Canary Deployment
  console.log('\nCanary Deployment:');
  
  const stableStack = {
    name: 'app-stable',
    services: [{
      name: 'app',
      image: 'myapp:v1.0.0',
      replicas: 9,
      labels: { version: 'stable' }
    }]
  };
  await orchestrator.deployStack(stableStack);
  
  const canaryStack = {
    name: 'app-canary',
    services: [{
      name: 'app',
      image: 'myapp:v1.1.0-rc',
      replicas: 1,
      labels: { version: 'canary' }
    }]
  };
  await orchestrator.deployStack(canaryStack);
  console.log('✓ Canary deployment created (10% traffic)');

  // 3. Multi-Region Deployment
  console.log('\nMulti-Region Deployment:');
  
  const regions = ['us-east', 'us-west', 'eu-central'];
  for (const region of regions) {
    const regionalStack = {
      name: `app-${region}`,
      services: [{
        name: 'app',
        image: 'myapp:v1.0.0',
        replicas: 3,
        env: {
          REGION: region,
          DB_ENDPOINT: `db.${region}.example.com`
        },
        labels: {
          region: region,
          'topology.kubernetes.io/region': region
        }
      }]
    };
    await orchestrator.deployStack(regionalStack);
    console.log(`✓ Deployed to ${region}`);
  }
}

async function demonstrateServiceDiscovery() {
  // Create service discovery for different platforms
  const k8sDiscovery = new ServiceDiscovery('kubernetes');
  const swarmDiscovery = new ServiceDiscovery('swarm');
  const nomadDiscovery = new ServiceDiscovery('nomad');

  // Register services
  const k8sService = k8sDiscovery.registerService('api-service', {
    name: 'api',
    namespace: 'production',
    port: 8080,
    metadata: {
      version: 'v1.0.0',
      dependencies: ['database', 'cache']
    }
  });
  console.log('✓ Registered Kubernetes service');

  // Register DNS
  await k8sDiscovery.registerDNS('api-service', 'api.mycompany.com', {
    type: 'A',
    ttl: 300
  });
  console.log('✓ Registered DNS for api.mycompany.com');

  // Discover service
  const discovered = await k8sDiscovery.discoverService('api-service');
  console.log(`✓ Discovered ${discovered.endpoints.length} endpoints`);

  // Get service topology
  const topology = await k8sDiscovery.getServiceTopology();
  console.log(`✓ Service topology: ${topology.services.length} services`);
}

async function demonstrateOperator() {
  const operator = new MCPServiceOperator();

  // Get CRD
  const crd = operator.getCustomResourceDefinition();
  console.log('✓ Generated MCPService CRD');

  // Watch for resources
  const watchId = await operator.watchResources('default');
  console.log(`✓ Watching for MCPService resources: ${watchId}`);

  // Simulate MCPService resource
  const mcpService = {
    apiVersion: 'mcp.io/v1',
    kind: 'MCPService',
    metadata: {
      name: 'example-service',
      namespace: 'default',
      uid: 'uid-123'
    },
    spec: {
      serviceName: 'example',
      image: 'mcp/example:v1.0.0',
      replicas: 3,
      mcpConfig: {
        enableMonitoring: true,
        enableServiceMesh: true,
        enableAutoScaling: true,
        sdkVersion: 'v1.5.0'
      }
    }
  };

  // Reconcile the resource
  await operator.reconcile(mcpService);
  console.log('✓ Reconciled MCPService resource');
}

// Helm example
async function demonstrateHelm() {
  console.log('\n7. Helm Chart Management...');
  
  const helmManager = new HelmManager();
  const orchestrator = new OrchestrationCore('kubernetes');

  // Generate a Helm chart
  const chartPath = await helmManager.generateChart({
    name: 'mcp-app',
    description: 'MCP Application Helm Chart',
    version: '1.0.0',
    image: 'mcp/app',
    tag: 'v1.0.0',
    replicas: 3,
    port: 8080,
    serviceType: 'LoadBalancer',
    ingressEnabled: true,
    hosts: [{
      host: 'app.example.com',
      paths: [{ path: '/', pathType: 'Prefix' }]
    }],
    autoscaling: true,
    minReplicas: 2,
    maxReplicas: 10,
    targetCPU: 75,
    resources: {
      limits: { cpu: '1000m', memory: '1Gi' },
      requests: { cpu: '500m', memory: '512Mi' }
    }
  });
  console.log(`✓ Generated Helm chart: ${chartPath}`);

  // Package the chart
  const packageInfo = await helmManager.packageChart(chartPath);
  console.log(`✓ Packaged chart: ${packageInfo.name} (${packageInfo.size} bytes)`);

  // Install the chart
  const release = await orchestrator.installHelmChart(
    chartPath,
    'mcp-app-release',
    {
      namespace: 'production',
      replicaCount: 5,
      image: {
        tag: 'v1.1.0'
      },
      ingress: {
        enabled: true,
        hosts: [{
          host: 'app.production.example.com',
          paths: [{ path: '/', pathType: 'Prefix' }]
        }]
      }
    }
  );
  console.log(`✓ Installed Helm release: ${release.releaseInfo.name}`);

  // Upgrade the release
  const upgrade = await orchestrator.upgradeHelmRelease(
    'mcp-app-release',
    chartPath,
    {
      image: {
        tag: 'v1.2.0'
      },
      replicaCount: 7
    }
  );
  console.log(`✓ Upgraded release to v1.2.0`);
}

// Run all examples
if (require.main === module) {
  main()
    .then(() => {
      console.log('\n✅ All examples completed successfully!');
      demonstrateHelm();
    })
    .catch(error => {
      console.error('❌ Error:', error);
      process.exit(1);
    });
}

module.exports = {
  deployToKubernetes,
  deployToSwarm,
  deployToNomad,
  demonstrateAdvancedPatterns,
  demonstrateServiceDiscovery,
  demonstrateOperator,
  demonstrateHelm
};