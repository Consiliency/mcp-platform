# Service Mesh Integration

This module provides a unified interface for integrating with popular service mesh platforms including Istio, Linkerd, and Consul Connect.

## Features

- **Multi-Mesh Support**: Single API works with Istio, Linkerd, and Consul
- **Traffic Management**: Canary deployments, A/B testing, blue-green deployments
- **Resilience**: Circuit breakers, retry policies, timeouts
- **Security**: mTLS, authorization policies, zero-trust networking
- **Observability**: Metrics, distributed tracing, service topology
- **Chaos Engineering**: Fault injection for testing

## Installation

```bash
npm install @mcp/service-mesh
```

## Quick Start

```javascript
const { ServiceMeshInterface, MeshHelpers } = require('@mcp/service-mesh');

// Create mesh instance
const mesh = new ServiceMeshInterface('istio'); // or 'linkerd', 'consul'

// Register a service
const registration = await mesh.registerService({
  name: 'my-service',
  port: 8080,
  protocol: 'http',
  metadata: { version: 'v1' }
});

// Configure traffic management
await mesh.setTrafficWeight('my-service', [
  { version: 'v1', weight: 90 },
  { version: 'v2', weight: 10 }
]);

// Enable security
await mesh.enableMTLS('default');

// Get metrics
const metrics = await mesh.getServiceMetrics('my-service', {
  start: new Date(Date.now() - 3600000),
  end: new Date()
});
```

## API Reference

### ServiceMeshInterface

#### Constructor
```javascript
new ServiceMeshInterface(meshType)
```
- `meshType`: 'istio' | 'linkerd' | 'consul'

#### Methods

##### Service Registration
- `registerService(serviceDefinition)`: Register a service with the mesh
- `unregisterService(serviceId)`: Remove a service from the mesh

##### Traffic Management
- `createVirtualService(config)`: Create routing rules
- `createDestinationRule(config)`: Define destination policies
- `setTrafficWeight(serviceId, weights)`: Configure traffic splitting

##### Resilience
- `configureCircuitBreaker(serviceId, config)`: Set up circuit breaking
- `setRetryPolicy(serviceId, policy)`: Configure retry behavior

##### Security
- `enableMTLS(namespace)`: Enable mutual TLS
- `createAuthorizationPolicy(config)`: Define access control rules

##### Observability
- `getServiceMetrics(serviceId, timeRange)`: Fetch service metrics
- `getServiceTraces(serviceId, limit)`: Get distributed traces
- `getServiceGraph(namespace)`: Retrieve service topology

##### Chaos Engineering
- `injectFault(serviceId, faultConfig)`: Inject delays or errors
- `removeFault(faultId)`: Remove injected faults

### MeshHelpers

Utility functions for common patterns:

#### Traffic Patterns
- `createCanaryDeployment(serviceId, stableVersion, canaryVersion, percentage)`
- `createBlueGreenDeployment(serviceId, currentVersion, newVersion, switchToNew)`
- `createABTestSplit(serviceId, versions, weights)`

#### Resilience Patterns
- `createDefaultCircuitBreaker()`: Standard circuit breaker config
- `createAggressiveCircuitBreaker()`: Strict circuit breaker
- `createDefaultRetryPolicy()`: Standard retry configuration
- `createIdempotentRetryPolicy()`: Retry for idempotent operations

#### Security Patterns
- `createStrictAuthorizationPolicy(allowedServices)`
- `createNamespaceIsolationPolicy(namespace)`

#### Observability
- `calculateSLI(metrics)`: Calculate service level indicators
- `isWithinSLO(metrics, slo)`: Check SLO compliance
- `detectAnomalies(currentMetrics, historicalMetrics)`

## Examples

### Canary Deployment

```javascript
// Deploy v2 as canary with 10% traffic
const weights = MeshHelpers.createCanaryDeployment('api', 'v1', 'v2', 10);
await mesh.setTrafficWeight('api', weights);

// Monitor metrics
const metrics = await mesh.getServiceMetrics('api', {
  start: new Date(Date.now() - 300000), // Last 5 minutes
  end: new Date()
});

// Check if canary is healthy
const slo = { availability: 99.9, latencyP99: 200 };
const sloCheck = MeshHelpers.isWithinSLO(metrics, slo);

if (sloCheck.overall) {
  // Increase canary traffic
  const newWeights = MeshHelpers.createCanaryDeployment('api', 'v1', 'v2', 25);
  await mesh.setTrafficWeight('api', newWeights);
}
```

### Circuit Breaker

```javascript
// Configure circuit breaker
const circuitBreaker = {
  maxConnections: 100,
  timeout: 5000,
  maxRetries: 3,
  consecutiveErrors: 5,
  interval: 30,
  baseEjectionTime: 30,
  maxEjectionPercent: 50
};

await mesh.configureCircuitBreaker('backend', circuitBreaker);
```

### mTLS and Authorization

```javascript
// Enable mTLS for namespace
const mtlsInfo = await mesh.enableMTLS('production');

// Create strict authorization
await mesh.createAuthorizationPolicy({
  name: 'api-auth',
  namespace: 'production',
  action: 'ALLOW',
  rules: [{
    from: [{
      source: {
        principals: ['cluster.local/ns/production/sa/frontend']
      }
    }],
    to: [{
      operation: {
        methods: ['GET', 'POST']
      }
    }]
  }]
});
```

### Fault Injection

```javascript
// Inject 10% latency of 3 seconds
const latencyFault = MeshHelpers.createLatencyFault(10, 3000);
const fault = await mesh.injectFault('backend', latencyFault);

// Run tests...

// Remove fault
await mesh.removeFault(fault.faultId);
```

## Mesh-Specific Features

### Istio
- Full VirtualService and DestinationRule support
- Advanced traffic management with subset routing
- Comprehensive security policies
- Integration with Kiali for visualization

### Linkerd
- Automatic mTLS with zero configuration
- TrafficSplit for canary deployments
- ServiceProfile for per-route configuration
- Built-in observability with Linkerd Viz

### Consul Connect
- Service segmentation with intentions
- Native health checking
- Multi-datacenter support
- Integration with Consul KV for configuration

## Events

The ServiceMeshInterface extends EventEmitter and emits various events:

```javascript
mesh.on('service.registered', ({ serviceId, definition }) => {
  console.log(`Service ${serviceId} registered`);
});

mesh.on('traffic.weight.updated', ({ serviceId, weights }) => {
  console.log(`Traffic weights updated for ${serviceId}`);
});

mesh.on('fault.injected', ({ faultId, serviceId }) => {
  console.log(`Fault ${faultId} injected into ${serviceId}`);
});
```

## Best Practices

1. **Progressive Rollouts**: Always use gradual traffic shifting for new versions
2. **Circuit Breakers**: Configure appropriate thresholds based on service SLOs
3. **Observability**: Monitor metrics during any traffic changes
4. **Security**: Enable mTLS by default and use strict authorization policies
5. **Testing**: Use fault injection to validate resilience

## Troubleshooting

### Common Issues

1. **Service Not Found**: Ensure service is registered before configuring policies
2. **Traffic Not Routing**: Check virtual service and destination rule configurations
3. **mTLS Errors**: Verify all services in the communication path have mTLS enabled
4. **High Latency**: Check circuit breaker configuration and retry policies

### Debug Mode

Enable debug logging:

```javascript
process.env.NODE_ENV = 'development';
const mesh = new ServiceMeshInterface('istio');
```

## Contributing

See the main project contributing guide for details on submitting patches and the contribution workflow.

## License

This module is part of the MCP platform and follows the same license terms.