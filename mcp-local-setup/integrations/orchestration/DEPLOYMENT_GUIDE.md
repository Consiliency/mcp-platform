# MCP Orchestration Deployment Guide

This guide covers deployment patterns and best practices for using the MCP Orchestration system across different platforms.

## Overview

The MCP Orchestration system provides a unified interface for deploying applications to:
- Kubernetes
- Docker Swarm
- HashiCorp Nomad

## Quick Start

### 1. Basic Deployment

```javascript
const OrchestrationCore = require('./core/orchestration-interface');

// Initialize orchestrator for your platform
const orchestrator = new OrchestrationCore('kubernetes'); // or 'swarm', 'nomad'

// Define your stack
const stack = {
  name: 'my-app',
  services: [{
    name: 'web',
    image: 'nginx:latest',
    replicas: 3,
    ports: [{ containerPort: 80 }]
  }]
};

// Deploy
const deployment = await orchestrator.deployStack(stack);
console.log('Deployment ID:', deployment.deploymentId);
```

### 2. Using the Stack Builder

The Stack Builder provides a fluent API for creating platform-agnostic stacks:

```javascript
const StackBuilder = require('./utils/stack-builder');

const stack = new StackBuilder()
  .withName('my-app')
  .addService({
    name: 'api',
    image: 'api:v1.0.0',
    replicas: 2,
    ports: [{ containerPort: 8080 }],
    env: { NODE_ENV: 'production' }
  })
  .addNetwork({ name: 'app-network' })
  .build();
```

## Platform-Specific Features

### Kubernetes

#### Auto-scaling
```javascript
await orchestrator.enableAutoScaling(deploymentId, serviceId, {
  min: 2,
  max: 10,
  targetCPU: 70
});
```

#### Helm Integration
```javascript
const result = await orchestrator.installHelmChart(
  'nginx',
  'my-nginx',
  {
    namespace: 'default',
    replicaCount: 3
  }
);
```

#### ConfigMaps and Secrets
```javascript
// Create ConfigMap
await orchestrator.createConfigMap(deploymentId, 'app-config', {
  'config.yaml': 'key: value'
});

// Create Secret
await orchestrator.createSecret(deploymentId, 'app-secrets', {
  'api-key': 'secret-value'
});
```

### Docker Swarm

#### Stack Deployment
```javascript
const orchestrator = new OrchestrationCore('swarm');

const stack = {
  name: 'swarm-app',
  services: [{
    name: 'web',
    image: 'nginx',
    replicas: 3,
    ports: [{ containerPort: 80 }]
  }],
  networks: [{
    name: 'overlay-net',
    driver: 'overlay'
  }]
};

await orchestrator.deployStack(stack);
```

### Nomad

#### Job Deployment
```javascript
const orchestrator = new OrchestrationCore('nomad');

const stack = {
  name: 'nomad-job',
  services: [{
    name: 'worker',
    image: 'worker:latest',
    replicas: 5
  }]
};

await orchestrator.deployStack(stack);
```

## Advanced Patterns

### 1. Blue-Green Deployment

```javascript
// Deploy blue version
const blue = await orchestrator.deployStack({
  name: 'app-blue',
  services: [{ name: 'app', image: 'app:v1', labels: { version: 'blue' } }]
});

// Deploy green version
const green = await orchestrator.deployStack({
  name: 'app-green',
  services: [{ name: 'app', image: 'app:v2', labels: { version: 'green' } }]
});

// Switch traffic to green
await orchestrator.registerServiceDNS(green.deploymentId, 'app', 'app.example.com');
```

### 2. Canary Deployment

```javascript
// Scale down stable version
await orchestrator.scaleService(stableDeploymentId, 'app', 8);

// Deploy canary with fewer replicas
const canary = await orchestrator.deployStack({
  name: 'app-canary',
  services: [{ 
    name: 'app', 
    image: 'app:v2', 
    replicas: 2,
    labels: { version: 'canary' } 
  }]
});
```

### 3. Rolling Update

```javascript
await orchestrator.updateStack(deploymentId, {
  services: [{
    name: 'app',
    image: 'app:v2'
  }]
});
```

## Service Discovery

### Internal Service Discovery

```javascript
const endpoint = await orchestrator.getServiceEndpoint(deploymentId, serviceId);
console.log('Internal endpoint:', endpoint.internal);
// Kubernetes: service-name.namespace.svc.cluster.local
// Swarm: service-name
// Nomad: service-name.service.consul
```

### External Access

```javascript
// Register external DNS
await orchestrator.registerServiceDNS(
  deploymentId,
  serviceId,
  'api.mycompany.com'
);
```

## Monitoring and Management

### Get Deployment Status

```javascript
const status = await orchestrator.getDeploymentStatus(deploymentId);
console.log('Status:', status.status);
console.log('Services:', status.services);
```

### Resource Usage

```javascript
const usage = await orchestrator.getResourceUsage(deploymentId);
console.log('CPU:', usage.cpu);
console.log('Memory:', usage.memory);
console.log('Storage:', usage.storage);
```

## Best Practices

### 1. Resource Limits
Always specify resource limits for production deployments:

```javascript
{
  name: 'app',
  image: 'app:latest',
  resources: {
    limits: { cpu: '1', memory: '1Gi' },
    requests: { cpu: '100m', memory: '128Mi' }
  }
}
```

### 2. Health Checks
Configure health checks for all services:

```javascript
{
  name: 'app',
  image: 'app:latest',
  healthCheck: {
    path: '/health',
    interval: 30,
    timeout: 5
  }
}
```

### 3. Labels and Metadata
Use consistent labeling for resource organization:

```javascript
{
  name: 'app',
  image: 'app:latest',
  labels: {
    'app.kubernetes.io/name': 'app',
    'app.kubernetes.io/version': 'v1.0.0',
    'app.kubernetes.io/component': 'backend',
    'app.kubernetes.io/managed-by': 'mcp'
  }
}
```

### 4. Graceful Shutdown
Ensure services handle termination signals properly:

```javascript
{
  name: 'app',
  image: 'app:latest',
  env: {
    GRACEFUL_SHUTDOWN_TIMEOUT: '30'
  }
}
```

## Troubleshooting

### Common Issues

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

### Debug Commands

```javascript
// Get detailed deployment info
const status = await orchestrator.getDeploymentStatus(deploymentId);

// Check service endpoints
const endpoint = await orchestrator.getServiceEndpoint(deploymentId, serviceId);

// Review resource usage
const usage = await orchestrator.getResourceUsage(deploymentId);
```

## Migration Guide

### From Docker Compose to Orchestration

```javascript
// Docker Compose
version: '3'
services:
  web:
    image: nginx
    ports:
      - "80:80"

// MCP Orchestration
const stack = {
  name: 'my-app',
  services: [{
    name: 'web',
    image: 'nginx',
    ports: [{ containerPort: 80 }]
  }]
};
```

### From Kubernetes YAML to Orchestration

```javascript
// Instead of kubectl apply -f deployment.yaml
const deployment = await orchestrator.deployStack(stack);

// Instead of kubectl scale
await orchestrator.scaleService(deploymentId, serviceId, replicas);

// Instead of kubectl create configmap
await orchestrator.createConfigMap(deploymentId, name, data);
```

## Security Considerations

1. **Secrets Management**
   - Use platform-native secret storage
   - Rotate secrets regularly
   - Never commit secrets to version control

2. **Network Policies**
   - Implement least-privilege network access
   - Use service mesh for mTLS
   - Configure ingress rules carefully

3. **Image Security**
   - Scan images for vulnerabilities
   - Use specific tags, not 'latest'
   - Pull from trusted registries only

## Performance Optimization

1. **Resource Allocation**
   - Right-size your containers
   - Use horizontal scaling
   - Implement pod disruption budgets

2. **Caching Strategies**
   - Use Redis/Memcached for session storage
   - Implement CDN for static assets
   - Configure appropriate cache headers

3. **Load Balancing**
   - Use platform-native load balancers
   - Configure health checks properly
   - Implement circuit breakers

## Conclusion

The MCP Orchestration system provides a powerful, unified interface for deploying applications across multiple container orchestration platforms. By following these patterns and best practices, you can build robust, scalable applications that leverage the best features of each platform while maintaining portability and consistency.