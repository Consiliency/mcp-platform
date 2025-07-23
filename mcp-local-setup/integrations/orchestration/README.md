# MCP Container Orchestration System

A unified orchestration interface for deploying and managing containerized applications across Kubernetes, Docker Swarm, and HashiCorp Nomad.

## Features

- **Multi-Platform Support**: Deploy to Kubernetes, Docker Swarm, or Nomad with the same API
- **Platform-Agnostic Stack Builder**: Build once, deploy anywhere
- **Helm Integration**: Full support for Helm charts on Kubernetes
- **Auto-Scaling**: Configure horizontal pod autoscaling with simple policies
- **Service Discovery**: Built-in service discovery and DNS management
- **Configuration Management**: ConfigMaps and Secrets across platforms
- **Advanced Deployment Patterns**: Blue-green, canary, and rolling deployments
- **Kubernetes Operators**: Example operator for managing MCP services
- **Resource Monitoring**: Track CPU, memory, and storage usage

## Quick Start

```javascript
const { createOrchestrator } = require('./integrations/orchestration');

// Create an orchestrator for your platform
const orchestrator = createOrchestrator('kubernetes'); // or 'swarm', 'nomad'

// Deploy a stack
const deployment = await orchestrator.deployStack({
  name: 'my-app',
  services: [{
    name: 'web',
    image: 'nginx:latest',
    replicas: 3,
    ports: [{ containerPort: 80 }]
  }]
});

console.log('Deployed:', deployment.deploymentId);
```

## Architecture

```
integrations/orchestration/
├── core/
│   ├── base-interface.js       # Abstract base class
│   └── orchestration-interface.js # Main implementation
├── adapters/
│   ├── kubernetes-adapter.js   # Kubernetes-specific logic
│   ├── swarm-adapter.js        # Docker Swarm adapter
│   └── nomad-adapter.js        # Nomad adapter
├── utils/
│   ├── stack-builder.js        # Fluent API for building stacks
│   └── service-discovery.js    # Service discovery utilities
├── helm/
│   └── helm-manager.js         # Helm chart management
├── operators/
│   └── mcp-service-operator.js # Example K8s operator
├── examples/
│   ├── stack-example.js        # Basic examples
│   └── complete-example.js     # Comprehensive demo
└── index.js                    # Main entry point
```

## Usage Examples

### Using the Stack Builder

```javascript
const { StackBuilder } = require('./integrations/orchestration');

const stack = new StackBuilder()
  .withName('microservices')
  .addService({
    name: 'api',
    image: 'api:v1.0.0',
    replicas: 3,
    ports: [{ containerPort: 8080 }],
    env: { NODE_ENV: 'production' }
  })
  .addService({
    name: 'database',
    image: 'postgres:14',
    volumes: [{ name: 'db-data', mountPath: '/var/lib/postgresql/data' }]
  })
  .addNetwork({ name: 'app-network' })
  .addVolume({ name: 'db-data' })
  .build();

// Deploy to any platform
const deployment = await orchestrator.deployStack(stack);
```

### Auto-Scaling

```javascript
await orchestrator.enableAutoScaling(deploymentId, 'api', {
  min: 2,
  max: 10,
  targetCPU: 70
});
```

### Configuration Management

```javascript
// Create ConfigMap
await orchestrator.createConfigMap(deploymentId, 'app-config', {
  'config.yaml': 'key: value',
  'features.json': '{"newUI": true}'
});

// Create Secret
await orchestrator.createSecret(deploymentId, 'app-secrets', {
  'api-key': 'secret-value',
  'db-password': 'secure-password'
});
```

### Service Discovery

```javascript
const endpoint = await orchestrator.getServiceEndpoint(deploymentId, 'api');
console.log('Internal:', endpoint.internal);  // api.default.svc.cluster.local
console.log('External:', endpoint.external);  // api.example.com (if exposed)

// Register DNS
await orchestrator.registerServiceDNS(deploymentId, 'api', 'api.mycompany.com');
```

### Helm Charts

```javascript
// Install a Helm chart
const release = await orchestrator.installHelmChart(
  'nginx',
  'my-nginx',
  {
    namespace: 'production',
    replicaCount: 5,
    service: { type: 'LoadBalancer' }
  }
);

// Upgrade a release
await orchestrator.upgradeHelmRelease('my-nginx', 'nginx', {
  image: { tag: '1.21.0' }
});
```

## Platform-Specific Features

### Kubernetes
- Full Helm support
- Horizontal Pod Autoscaling
- ConfigMaps and Secrets
- Ingress management
- Custom Resource Definitions

### Docker Swarm
- Stack deployments
- Service scaling
- Overlay networks
- Config and Secret management

### Nomad
- Job specifications
- Task groups
- Consul integration
- Variable management

## Testing

Run the test suite:

```bash
# All orchestration tests
npm test -- tests/integration/phase5/orchestration

# Specific test files
npm test -- tests/integration/phase5/orchestration-only.test.js
npm test -- tests/integration/phase5/orchestration-cicd-only.test.js
```

## Best Practices

1. **Resource Limits**: Always specify resource limits for production
2. **Health Checks**: Configure liveness and readiness probes
3. **Labels**: Use consistent labeling for organization
4. **Secrets**: Never commit secrets to version control
5. **Scaling**: Start with conservative auto-scaling policies
6. **Monitoring**: Enable metrics collection for all services

## Integration with Other MCP Components

The orchestration system integrates with:
- **CI/CD**: Automated deployments from build pipelines
- **Service Mesh**: Traffic management and observability
- **SDK**: Service communication and discovery
- **Monitoring**: Metrics and logging collection

## Troubleshooting

Common issues and solutions:

1. **Deployment Fails**
   - Check image availability
   - Verify resource quotas
   - Review service dependencies

2. **Service Not Accessible**
   - Verify port configurations
   - Check network policies
   - Ensure DNS registration

3. **Auto-scaling Not Working**
   - Verify metrics server is running
   - Check resource requests are set
   - Review scaling policies

## Contributing

When adding new features:
1. Implement in the appropriate adapter
2. Update the base interface if needed
3. Add tests for new functionality
4. Update documentation and examples

## License

Part of the MCP Local Setup project.