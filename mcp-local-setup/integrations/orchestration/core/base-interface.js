// Base OrchestrationInterface
// Defines the contract for orchestration implementations

class BaseOrchestrationInterface {
  constructor(platform) {
    // platform: 'kubernetes' | 'swarm' | 'nomad'
    if (new.target === BaseOrchestrationInterface) {
      throw new Error('BaseOrchestrationInterface is abstract and cannot be instantiated directly');
    }
  }

  // Deployment management
  async deployStack(stackDefinition) {
    throw new Error('deployStack must be implemented by subclass');
  }

  async updateStack(deploymentId, updates) {
    throw new Error('updateStack must be implemented by subclass');
  }

  async deleteStack(deploymentId) {
    throw new Error('deleteStack must be implemented by subclass');
  }

  // Scaling
  async scaleService(deploymentId, serviceId, replicas) {
    throw new Error('scaleService must be implemented by subclass');
  }

  async enableAutoScaling(deploymentId, serviceId, policy) {
    throw new Error('enableAutoScaling must be implemented by subclass');
  }

  // Service discovery
  async getServiceEndpoint(deploymentId, serviceId) {
    throw new Error('getServiceEndpoint must be implemented by subclass');
  }

  async registerServiceDNS(deploymentId, serviceId, hostname) {
    throw new Error('registerServiceDNS must be implemented by subclass');
  }

  // Configuration
  async createConfigMap(deploymentId, name, data) {
    throw new Error('createConfigMap must be implemented by subclass');
  }

  async createSecret(deploymentId, name, data) {
    throw new Error('createSecret must be implemented by subclass');
  }

  // Monitoring
  async getDeploymentStatus(deploymentId) {
    throw new Error('getDeploymentStatus must be implemented by subclass');
  }

  async getResourceUsage(deploymentId) {
    throw new Error('getResourceUsage must be implemented by subclass');
  }

  // Helm specific
  async installHelmChart(chartName, releaseName, values) {
    throw new Error('installHelmChart must be implemented by subclass');
  }

  async upgradeHelmRelease(releaseName, chartName, values) {
    throw new Error('upgradeHelmRelease must be implemented by subclass');
  }
}

module.exports = BaseOrchestrationInterface;