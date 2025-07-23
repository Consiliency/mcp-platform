# CI/CD Integration

This module provides a unified interface for integrating with multiple CI/CD platforms including GitHub Actions, GitLab CI, and Jenkins.

## Features

- **Multi-Platform Support**: Seamless integration with GitHub Actions, GitLab CI, and Jenkins
- **Pipeline Generation**: Automatic generation of pipeline configurations
- **Container Building**: Docker image building and registry management
- **Test Integration**: Support for unit, integration, and E2E testing
- **Deployment Automation**: Deploy to Kubernetes, Docker Swarm, and other orchestrators
- **Rollback Support**: Easy rollback to previous deployments
- **Webhook Integration**: Register webhooks for automated workflows
- **Metrics Tracking**: Pipeline performance and deployment metrics

## Usage

### Basic Setup

```javascript
const CICDIntegration = require('./CICDIntegration');

// Initialize with your preferred platform
const cicd = new CICDIntegration('github'); // or 'gitlab', 'jenkins'
```

### Generate Pipeline Configuration

```javascript
const pipelineConfig = await cicd.generatePipelineConfig({
  services: ['frontend', 'backend', 'database'],
  deployTarget: 'kubernetes',
  tests: true
});

console.log(pipelineConfig); // Returns YAML/Jenkinsfile content
```

### Build and Deploy Services

```javascript
// Build a service
const buildResult = await cicd.buildService('api-service', {
  dockerfile: './Dockerfile',
  context: '.',
  tags: ['v1.0.0', 'latest']
});

// Deploy the service
const deployment = await cicd.deployService('api-service', 'production', {
  orchestrator: 'kubernetes',
  deploymentId: 'k8s-deployment-123',
  version: 'v1.0.0'
});
```

### Run Tests

```javascript
const testResults = await cicd.runTests('api-service', 'integration');

if (testResults.passed) {
  console.log('All tests passed!');
} else {
  console.error('Test failures:', testResults.results);
}
```

### Rollback Deployments

```javascript
const rollbackResult = await cicd.rollbackDeployment(deployment.deploymentId);

if (rollbackResult.success) {
  console.log('Rollback successful:', rollbackResult.message);
}
```

### Register Webhooks

```javascript
const webhook = await cicd.registerWebhook('build.success', 'https://myapp.com/webhook');
console.log('Webhook registered:', webhook.webhookId);
```

## Platform-Specific Features

### GitHub Actions

- Workflow generation with matrix builds
- GitHub Container Registry integration
- Automatic PR checks
- Environment protection rules

### GitLab CI

- Multi-stage pipeline generation
- GitLab Container Registry support
- Review apps configuration
- Built-in security scanning

### Jenkins

- Jenkinsfile generation
- Shared library support
- Blue Ocean compatible
- Pipeline as code

## Templates

Pre-built templates are available in the `templates/` directory:

- `github/microservice-pipeline.yml` - Complete GitHub Actions workflow
- `gitlab/microservice-pipeline.yml` - GitLab CI configuration
- `jenkins/Jenkinsfile` - Jenkins pipeline definition

## Best Practices

1. **Version Control**: Always version your pipeline configurations
2. **Secret Management**: Use platform-specific secret management
3. **Testing**: Run tests before deployment
4. **Monitoring**: Track deployment metrics and pipeline performance
5. **Rollback Strategy**: Always have a rollback plan

## Environment Variables

- `DOCKER_REGISTRY`: Default Docker registry (default: 'registry.local')
- `CI_TIMEOUT`: Maximum pipeline execution time
- `DEPLOY_APPROVAL`: Require manual approval for production

## Integration with Orchestration Platforms

The CI/CD integration works seamlessly with container orchestration platforms:

```javascript
// Deploy to Kubernetes
const k8sDeployment = await cicd.deployService('my-service', 'production', {
  orchestrator: 'kubernetes',
  namespace: 'production',
  replicas: 3
});

// Deploy to Docker Swarm
const swarmDeployment = await cicd.deployService('my-service', 'staging', {
  orchestrator: 'swarm',
  network: 'my-network',
  replicas: 2
});
```

## Error Handling

```javascript
try {
  await cicd.deployService('my-service', 'production', config);
} catch (error) {
  console.error('Deployment failed:', error.message);
  
  // Attempt rollback
  await cicd.rollbackDeployment(lastKnownGoodDeployment);
}
```

## Metrics and Monitoring

```javascript
// Get pipeline metrics
const metrics = await cicd.getPipelineMetrics('pipeline-my-service');
console.log(`Success rate: ${metrics.successRate}%`);
console.log(`Average duration: ${metrics.avgDuration}ms`);

// Get deployment status
const status = await cicd.getDeploymentStatus(deploymentId);
console.log('Deployment status:', status);
```