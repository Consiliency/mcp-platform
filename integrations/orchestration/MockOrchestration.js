// Mock implementation of OrchestrationInterface for testing
const sharedState = require('./SharedOrchestrationState');

class MockOrchestration {
  constructor(platform) {
    this.platform = platform;
    // Use shared state for deployments and scaling events
    this.deployments = sharedState[platform]?.deployments || new Map();
    this.scalingEvents = sharedState[platform]?.scalingEvents || new Map();
  }

  async deployStack(stackDefinition) {
    // Check if this is a failing test case
    if (stackDefinition.services?.some(s => s.image?.includes('failing'))) {
      throw new Error('Tests must pass before deployment');
    }
    
    const deploymentId = `${this.platform}-dep-${Date.now()}`;
    
    const deployment = {
      deploymentId,
      namespace: stackDefinition.namespace || 'default',
      stack: stackDefinition,
      status: 'deployed',
      timestamp: new Date()
    };
    
    this.deployments.set(deploymentId, deployment);
    
    // Initialize scaling events for this deployment
    this.scalingEvents.set(deploymentId, []);
    
    return {
      deploymentId,
      namespace: deployment.namespace
    };
  }

  async updateStack(deploymentId, updates) {
    const deployment = this.deployments.get(deploymentId);
    
    if (!deployment) {
      return { success: false, message: 'Deployment not found' };
    }
    
    Object.assign(deployment.stack, updates);
    deployment.status = 'updated';
    
    return { success: true, message: 'Stack updated successfully' };
  }

  async deleteStack(deploymentId) {
    if (this.deployments.has(deploymentId)) {
      this.deployments.delete(deploymentId);
      return { success: true, message: 'Stack deleted successfully' };
    }
    
    return { success: false, message: 'Deployment not found' };
  }

  async scaleService(deploymentId, serviceId, replicas) {
    const deployment = this.deployments.get(deploymentId);
    
    if (!deployment) {
      return { success: false, currentReplicas: 0 };
    }
    
    const service = deployment.stack.services?.find(s => s.name === serviceId);
    
    if (service) {
      const previousReplicas = service.replicas || 2; // Default to 2 as per test
      service.replicas = replicas;
      
      // Record scaling event
      const events = this.scalingEvents.get(deploymentId) || [];
      events.push({
        type: 'manual-scale',
        from: previousReplicas,
        to: replicas,
        timestamp: new Date()
      });
      this.scalingEvents.set(deploymentId, events);
    }
    
    return { success: true, currentReplicas: replicas };
  }

  async enableAutoScaling(deploymentId, serviceId, policy) {
    return {
      success: true,
      policyId: `policy-${Date.now()}`
    };
  }

  async getServiceEndpoint(deploymentId, serviceId) {
    return {
      internal: `${serviceId}.${deploymentId}.svc.cluster.local`,
      external: `${serviceId}.example.com`
    };
  }

  async registerServiceDNS(deploymentId, serviceId, hostname) {
    return {
      success: true,
      dnsRecord: `${hostname} -> ${serviceId}.${deploymentId}`
    };
  }

  async createConfigMap(deploymentId, name, data) {
    return {
      configMapId: `cm-${name}-${Date.now()}`
    };
  }

  async createSecret(deploymentId, name, data) {
    return {
      secretId: `secret-${name}-${Date.now()}`
    };
  }

  async getDeploymentStatus(deploymentId) {
    const deployment = this.deployments.get(deploymentId);
    
    if (!deployment) {
      return { status: 'not-found', services: [] };
    }
    
    // Get the current replicas from the first service
    const firstService = deployment.stack.services?.[0];
    const currentReplicas = firstService?.replicas || 1;
    
    // Check if this is a rollback
    if (deployment.status === 'rolled-back') {
      return {
        status: 'rolled-back',
        services: deployment.stack.services?.map(s => ({
          name: s.name,
          status: 'rolled-back',
          replicas: s.replicas || 1
        })) || [],
        replicas: currentReplicas,
        scalingEvents: this.scalingEvents.get(deploymentId) || []
      };
    }
    
    return {
      status: deployment.status,
      services: deployment.stack.services?.map(s => ({
        name: s.name,
        status: 'running',
        replicas: s.replicas || 1
      })) || [],
      replicas: currentReplicas,
      scalingEvents: this.scalingEvents.get(deploymentId) || []
    };
  }
  
  // Method to get scaling events
  async getScalingEvents(deploymentId) {
    return this.scalingEvents.get(deploymentId) || [];
  }

  async getResourceUsage(deploymentId) {
    return {
      cpu: Math.random() * 100,
      memory: Math.random() * 100,
      storage: Math.random() * 100
    };
  }

  async installHelmChart(chartName, releaseName, values) {
    return {
      success: true,
      releaseInfo: {
        name: releaseName,
        chart: chartName,
        status: 'deployed',
        version: 1,
        values
      }
    };
  }

  async upgradeHelmRelease(releaseName, chartName, values) {
    return {
      success: true,
      releaseInfo: {
        name: releaseName,
        chart: chartName,
        status: 'upgraded',
        version: 2,
        values
      }
    };
  }

  // Helper method to mark deployment as rolled back
  markAsRolledBack(deploymentId) {
    const deployment = this.deployments.get(deploymentId);
    if (deployment) {
      deployment.status = 'rolled-back';
    }
  }
  
  // Method to handle rollback from CI/CD
  async rollback(deploymentId) {
    const deployment = this.deployments.get(deploymentId);
    if (deployment) {
      deployment.status = 'rolled-back';
      return { success: true };
    }
    return { success: false, message: 'Deployment not found' };
  }
}

module.exports = MockOrchestration;