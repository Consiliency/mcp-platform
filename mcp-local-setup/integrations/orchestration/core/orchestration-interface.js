// Core implementation of OrchestrationInterface
// Provides platform-agnostic orchestration capabilities

const BaseOrchestrationInterface = require('./base-interface');
const KubernetesAdapter = require('../adapters/kubernetes-adapter');
const SwarmAdapter = require('../adapters/swarm-adapter');
const NomadAdapter = require('../adapters/nomad-adapter');

class OrchestrationCore extends BaseOrchestrationInterface {
  constructor(platform = 'kubernetes') {
    super();
    this.platform = platform;
    this.adapter = this._createAdapter(platform);
    this.deployments = new Map();
    this.configMaps = new Map();
    this.secrets = new Map();
  }

  _createAdapter(platform) {
    switch (platform) {
      case 'kubernetes':
        return new KubernetesAdapter();
      case 'swarm':
        return new SwarmAdapter();
      case 'nomad':
        return new NomadAdapter();
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  // Deployment management
  async deployStack(stackDefinition) {
    try {
      // Validate stack definition
      this._validateStackDefinition(stackDefinition);

      // Generate deployment ID
      const deploymentId = `deploy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Deploy through adapter
      const result = await this.adapter.deployStack(deploymentId, stackDefinition);
      
      // Store deployment metadata
      this.deployments.set(deploymentId, {
        ...stackDefinition,
        deploymentId,
        namespace: result.namespace || 'default',
        platform: this.platform,
        createdAt: new Date(),
        status: 'deployed'
      });

      return {
        deploymentId,
        namespace: result.namespace || 'default'
      };
    } catch (error) {
      throw new Error(`Failed to deploy stack: ${error.message}`);
    }
  }

  async updateStack(deploymentId, updates) {
    try {
      const deployment = this.deployments.get(deploymentId);
      if (!deployment) {
        throw new Error(`Deployment ${deploymentId} not found`);
      }

      const result = await this.adapter.updateStack(deploymentId, updates);
      
      // Update stored metadata
      this.deployments.set(deploymentId, {
        ...deployment,
        ...updates,
        updatedAt: new Date()
      });

      return {
        success: true,
        message: `Stack ${deploymentId} updated successfully`
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }

  async deleteStack(deploymentId) {
    try {
      const deployment = this.deployments.get(deploymentId);
      if (!deployment) {
        throw new Error(`Deployment ${deploymentId} not found`);
      }

      await this.adapter.deleteStack(deploymentId);
      
      // Remove from internal storage
      this.deployments.delete(deploymentId);

      return {
        success: true,
        message: `Stack ${deploymentId} deleted successfully`
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }

  // Scaling
  async scaleService(deploymentId, serviceId, replicas) {
    try {
      const deployment = this.deployments.get(deploymentId);
      if (!deployment) {
        throw new Error(`Deployment ${deploymentId} not found`);
      }

      const result = await this.adapter.scaleService(deploymentId, serviceId, replicas);
      
      // Update service replica count in metadata
      const service = deployment.services.find(s => s.name === serviceId);
      if (service) {
        service.replicas = replicas;
        this.deployments.set(deploymentId, deployment);
      }

      return {
        success: true,
        currentReplicas: replicas
      };
    } catch (error) {
      return {
        success: false,
        currentReplicas: 0
      };
    }
  }

  async enableAutoScaling(deploymentId, serviceId, policy) {
    try {
      const deployment = this.deployments.get(deploymentId);
      if (!deployment) {
        throw new Error(`Deployment ${deploymentId} not found`);
      }

      this._validateAutoScalingPolicy(policy);

      const policyId = await this.adapter.enableAutoScaling(deploymentId, serviceId, policy);
      
      // Store autoscaling policy
      const service = deployment.services.find(s => s.name === serviceId);
      if (service) {
        service.autoScaling = {
          enabled: true,
          policy,
          policyId
        };
        this.deployments.set(deploymentId, deployment);
      }

      return {
        success: true,
        policyId
      };
    } catch (error) {
      return {
        success: false,
        policyId: null
      };
    }
  }

  // Service discovery
  async getServiceEndpoint(deploymentId, serviceId) {
    try {
      const deployment = this.deployments.get(deploymentId);
      if (!deployment) {
        throw new Error(`Deployment ${deploymentId} not found`);
      }

      return await this.adapter.getServiceEndpoint(deploymentId, serviceId, deployment.namespace);
    } catch (error) {
      throw new Error(`Failed to get service endpoint: ${error.message}`);
    }
  }

  async registerServiceDNS(deploymentId, serviceId, hostname) {
    try {
      const deployment = this.deployments.get(deploymentId);
      if (!deployment) {
        throw new Error(`Deployment ${deploymentId} not found`);
      }

      const dnsRecord = await this.adapter.registerServiceDNS(
        deploymentId, 
        serviceId, 
        hostname,
        deployment.namespace
      );

      return {
        success: true,
        dnsRecord
      };
    } catch (error) {
      return {
        success: false,
        dnsRecord: null
      };
    }
  }

  // Configuration
  async createConfigMap(deploymentId, name, data) {
    try {
      const deployment = this.deployments.get(deploymentId);
      if (!deployment) {
        throw new Error(`Deployment ${deploymentId} not found`);
      }

      const configMapId = await this.adapter.createConfigMap(
        deployment.namespace,
        name,
        data
      );

      // Store config map reference
      this.configMaps.set(configMapId, {
        deploymentId,
        name,
        data,
        createdAt: new Date()
      });

      return { configMapId };
    } catch (error) {
      throw new Error(`Failed to create ConfigMap: ${error.message}`);
    }
  }

  async createSecret(deploymentId, name, data) {
    try {
      const deployment = this.deployments.get(deploymentId);
      if (!deployment) {
        throw new Error(`Deployment ${deploymentId} not found`);
      }

      const secretId = await this.adapter.createSecret(
        deployment.namespace,
        name,
        data
      );

      // Store secret reference (not the data!)
      this.secrets.set(secretId, {
        deploymentId,
        name,
        createdAt: new Date()
      });

      return { secretId };
    } catch (error) {
      throw new Error(`Failed to create Secret: ${error.message}`);
    }
  }

  // Monitoring
  async getDeploymentStatus(deploymentId) {
    try {
      const deployment = this.deployments.get(deploymentId);
      if (!deployment) {
        throw new Error(`Deployment ${deploymentId} not found`);
      }

      const status = await this.adapter.getDeploymentStatus(deploymentId, deployment.namespace);
      
      return {
        status: status.status || deployment.status,
        services: status.services || []
      };
    } catch (error) {
      throw new Error(`Failed to get deployment status: ${error.message}`);
    }
  }

  async getResourceUsage(deploymentId) {
    try {
      const deployment = this.deployments.get(deploymentId);
      if (!deployment) {
        throw new Error(`Deployment ${deploymentId} not found`);
      }

      return await this.adapter.getResourceUsage(deploymentId, deployment.namespace);
    } catch (error) {
      throw new Error(`Failed to get resource usage: ${error.message}`);
    }
  }

  // Helm specific
  async installHelmChart(chartName, releaseName, values = {}) {
    try {
      if (this.platform !== 'kubernetes') {
        throw new Error('Helm is only supported on Kubernetes');
      }

      const result = await this.adapter.installHelmChart(chartName, releaseName, values);
      
      return {
        success: true,
        releaseInfo: result
      };
    } catch (error) {
      return {
        success: false,
        releaseInfo: { error: error.message }
      };
    }
  }

  async upgradeHelmRelease(releaseName, chartName, values = {}) {
    try {
      if (this.platform !== 'kubernetes') {
        throw new Error('Helm is only supported on Kubernetes');
      }

      const result = await this.adapter.upgradeHelmRelease(releaseName, chartName, values);
      
      return {
        success: true,
        releaseInfo: result
      };
    } catch (error) {
      return {
        success: false,
        releaseInfo: { error: error.message }
      };
    }
  }

  // Validation helpers
  _validateStackDefinition(stackDef) {
    if (!stackDef.name) {
      throw new Error('Stack name is required');
    }
    if (!stackDef.services || !Array.isArray(stackDef.services)) {
      throw new Error('Services array is required');
    }
    if (stackDef.services.length === 0) {
      throw new Error('At least one service is required');
    }
    
    stackDef.services.forEach(service => {
      if (!service.name) {
        throw new Error('Service name is required');
      }
      if (!service.image) {
        throw new Error(`Image is required for service ${service.name}`);
      }
    });
  }

  _validateAutoScalingPolicy(policy) {
    if (typeof policy.min !== 'number' || policy.min < 1) {
      throw new Error('Minimum replicas must be at least 1');
    }
    if (typeof policy.max !== 'number' || policy.max <= policy.min) {
      throw new Error('Maximum replicas must be greater than minimum');
    }
    if (typeof policy.targetCPU !== 'number' || policy.targetCPU <= 0 || policy.targetCPU > 100) {
      throw new Error('Target CPU must be between 1 and 100');
    }
  }
}

module.exports = OrchestrationCore;