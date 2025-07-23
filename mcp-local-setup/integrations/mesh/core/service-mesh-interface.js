// Service Mesh Interface Implementation
// Implements the contract from interfaces/phase5/service-mesh.interface.js

const EventEmitter = require('events');
const BaseInterface = require('./base-interface');

class ServiceMeshInterface extends EventEmitter {
  constructor(meshType) {
    super();
    this.meshType = meshType;
    this.registeredServices = new Map();
    this.virtualServices = new Map();
    this.destinationRules = new Map();
    this.authPolicies = new Map();
    this.circuitBreakers = new Map();
    this.retryPolicies = new Map();
    this.faultInjections = new Map();
    this.meshAdapter = this._createAdapter(meshType);
  }

  _createAdapter(meshType) {
    switch (meshType) {
      case 'istio':
        const IstioAdapter = require('../adapters/istio-adapter');
        return new IstioAdapter();
      case 'linkerd':
        const LinkerdAdapter = require('../adapters/linkerd-adapter');
        return new LinkerdAdapter();
      case 'consul':
        const ConsulAdapter = require('../adapters/consul-adapter');
        return new ConsulAdapter();
      default:
        throw new Error(`Unsupported mesh type: ${meshType}`);
    }
  }

  // Service Registration
  async registerService(serviceDefinition) {
    try {
      this._validateServiceDefinition(serviceDefinition);
      
      const serviceId = serviceDefinition.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
      const registration = {
        ...serviceDefinition,
        serviceId,
        registeredAt: new Date(),
        proxyPort: this._calculateProxyPort(serviceDefinition.port),
        status: 'registered'
      };

      // Register with mesh adapter
      await this.meshAdapter.registerService(registration);
      
      this.registeredServices.set(serviceId, registration);
      this.emit('service.registered', { serviceId, definition: serviceDefinition });
      
      return {
        serviceId,
        proxyPort: registration.proxyPort
      };
    } catch (error) {
      this.emit('service.registration.failed', { error: error.message });
      throw error;
    }
  }

  async unregisterService(serviceId) {
    if (!this.registeredServices.has(serviceId)) {
      throw new Error(`Service ${serviceId} not found`);
    }

    try {
      await this.meshAdapter.unregisterService(serviceId);
      this.registeredServices.delete(serviceId);
      
      // Clean up related configurations
      this._cleanupServiceConfigs(serviceId);
      
      this.emit('service.unregistered', { serviceId });
      return { success: true };
    } catch (error) {
      this.emit('service.unregistration.failed', { serviceId, error: error.message });
      throw error;
    }
  }

  // Traffic Management
  async createVirtualService(config) {
    try {
      this._validateVirtualServiceConfig(config);
      
      const vsId = this._generateId('vs', config.name);
      const virtualService = {
        ...config,
        id: vsId,
        createdAt: new Date()
      };

      await this.meshAdapter.createVirtualService(virtualService);
      this.virtualServices.set(vsId, virtualService);
      
      this.emit('virtualservice.created', { virtualServiceId: vsId });
      return { virtualServiceId: vsId };
    } catch (error) {
      this.emit('virtualservice.creation.failed', { error: error.message });
      throw error;
    }
  }

  async createDestinationRule(config) {
    try {
      this._validateDestinationRuleConfig(config);
      
      const drId = this._generateId('dr', config.name);
      const destinationRule = {
        ...config,
        id: drId,
        createdAt: new Date()
      };

      await this.meshAdapter.createDestinationRule(destinationRule);
      this.destinationRules.set(drId, destinationRule);
      
      this.emit('destinationrule.created', { destinationRuleId: drId });
      return { destinationRuleId: drId };
    } catch (error) {
      this.emit('destinationrule.creation.failed', { error: error.message });
      throw error;
    }
  }

  async setTrafficWeight(serviceId, weights) {
    if (!this.registeredServices.has(serviceId)) {
      throw new Error(`Service ${serviceId} not found`);
    }

    try {
      this._validateTrafficWeights(weights);
      
      await this.meshAdapter.setTrafficWeight(serviceId, weights);
      
      this.emit('traffic.weight.updated', { serviceId, weights });
      return { success: true };
    } catch (error) {
      this.emit('traffic.weight.update.failed', { serviceId, error: error.message });
      throw error;
    }
  }

  // Circuit Breaking
  async configureCircuitBreaker(serviceId, config) {
    if (!this.registeredServices.has(serviceId)) {
      throw new Error(`Service ${serviceId} not found`);
    }

    try {
      this._validateCircuitBreakerConfig(config);
      
      await this.meshAdapter.configureCircuitBreaker(serviceId, config);
      this.circuitBreakers.set(serviceId, config);
      
      this.emit('circuitbreaker.configured', { serviceId, config });
      return { success: true };
    } catch (error) {
      this.emit('circuitbreaker.configuration.failed', { serviceId, error: error.message });
      throw error;
    }
  }

  // Retry Policies
  async setRetryPolicy(serviceId, policy) {
    if (!this.registeredServices.has(serviceId)) {
      throw new Error(`Service ${serviceId} not found`);
    }

    try {
      this._validateRetryPolicy(policy);
      
      await this.meshAdapter.setRetryPolicy(serviceId, policy);
      this.retryPolicies.set(serviceId, policy);
      
      this.emit('retry.policy.set', { serviceId, policy });
      return { success: true };
    } catch (error) {
      this.emit('retry.policy.failed', { serviceId, error: error.message });
      throw error;
    }
  }

  // Security
  async enableMTLS(namespace) {
    try {
      const certInfo = await this.meshAdapter.enableMTLS(namespace);
      
      this.emit('mtls.enabled', { namespace, certInfo });
      return {
        success: true,
        certInfo
      };
    } catch (error) {
      this.emit('mtls.enable.failed', { namespace, error: error.message });
      throw error;
    }
  }

  async createAuthorizationPolicy(config) {
    try {
      this._validateAuthorizationPolicy(config);
      
      const policyId = this._generateId('authz', config.name);
      const policy = {
        ...config,
        id: policyId,
        createdAt: new Date()
      };

      await this.meshAdapter.createAuthorizationPolicy(policy);
      this.authPolicies.set(policyId, policy);
      
      this.emit('authorization.policy.created', { policyId });
      return { policyId };
    } catch (error) {
      this.emit('authorization.policy.failed', { error: error.message });
      throw error;
    }
  }

  // Observability
  async getServiceMetrics(serviceId, timeRange) {
    if (!this.registeredServices.has(serviceId)) {
      throw new Error(`Service ${serviceId} not found`);
    }

    try {
      const metrics = await this.meshAdapter.getServiceMetrics(serviceId, timeRange);
      
      return {
        requestRate: metrics.requestRate || 0,
        errorRate: metrics.errorRate || 0,
        latency: metrics.latency || {
          p50: 0,
          p95: 0,
          p99: 0
        }
      };
    } catch (error) {
      this.emit('metrics.fetch.failed', { serviceId, error: error.message });
      throw error;
    }
  }

  async getServiceTraces(serviceId, limit = 10) {
    if (!this.registeredServices.has(serviceId)) {
      throw new Error(`Service ${serviceId} not found`);
    }

    try {
      const traces = await this.meshAdapter.getServiceTraces(serviceId, limit);
      return traces;
    } catch (error) {
      this.emit('traces.fetch.failed', { serviceId, error: error.message });
      throw error;
    }
  }

  async getServiceGraph(namespace) {
    try {
      const graph = await this.meshAdapter.getServiceGraph(namespace);
      return graph;
    } catch (error) {
      this.emit('graph.fetch.failed', { namespace, error: error.message });
      throw error;
    }
  }

  // Fault Injection
  async injectFault(serviceId, faultConfig) {
    if (!this.registeredServices.has(serviceId)) {
      throw new Error(`Service ${serviceId} not found`);
    }

    try {
      this._validateFaultConfig(faultConfig);
      
      const faultId = this._generateId('fault', serviceId);
      const fault = {
        ...faultConfig,
        id: faultId,
        serviceId,
        createdAt: new Date()
      };

      await this.meshAdapter.injectFault(serviceId, fault);
      this.faultInjections.set(faultId, fault);
      
      this.emit('fault.injected', { faultId, serviceId });
      return { faultId };
    } catch (error) {
      this.emit('fault.injection.failed', { serviceId, error: error.message });
      throw error;
    }
  }

  async removeFault(faultId) {
    if (!this.faultInjections.has(faultId)) {
      throw new Error(`Fault ${faultId} not found`);
    }

    try {
      const fault = this.faultInjections.get(faultId);
      await this.meshAdapter.removeFault(fault.serviceId, faultId);
      
      this.faultInjections.delete(faultId);
      this.emit('fault.removed', { faultId });
      
      return { success: true };
    } catch (error) {
      this.emit('fault.removal.failed', { faultId, error: error.message });
      throw error;
    }
  }

  // Helper methods
  _validateServiceDefinition(def) {
    if (!def.name || !def.port || !def.protocol) {
      throw new Error('Service definition must include name, port, and protocol');
    }
  }

  _validateVirtualServiceConfig(config) {
    if (!config.name || !config.hosts || !config.routes) {
      throw new Error('Virtual service config must include name, hosts, and routes');
    }
  }

  _validateDestinationRuleConfig(config) {
    if (!config.name || !config.host) {
      throw new Error('Destination rule config must include name and host');
    }
  }

  _validateTrafficWeights(weights) {
    const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);
    if (Math.abs(totalWeight - 100) > 0.01) {
      throw new Error('Traffic weights must sum to 100');
    }
  }

  _validateCircuitBreakerConfig(config) {
    if (!config.maxConnections || !config.timeout) {
      throw new Error('Circuit breaker config must include maxConnections and timeout');
    }
  }

  _validateRetryPolicy(policy) {
    if (!policy.attempts || !policy.perTryTimeout) {
      throw new Error('Retry policy must include attempts and perTryTimeout');
    }
  }

  _validateAuthorizationPolicy(config) {
    if (!config.name || !config.namespace) {
      throw new Error('Authorization policy must include name and namespace');
    }
  }

  _validateFaultConfig(config) {
    if (!config.type || !config.percentage) {
      throw new Error('Fault config must include type and percentage');
    }
    if (config.type !== 'delay' && config.type !== 'abort') {
      throw new Error('Fault type must be either "delay" or "abort"');
    }
  }

  _calculateProxyPort(servicePort) {
    // Envoy sidecar typically uses 15001 for inbound
    return 15001;
  }

  _generateId(prefix, name) {
    return `${prefix}-${name}-${Date.now()}`;
  }

  _cleanupServiceConfigs(serviceId) {
    // Remove virtual services referencing this service
    for (const [id, vs] of this.virtualServices) {
      if (vs.hosts.includes(serviceId)) {
        this.virtualServices.delete(id);
      }
    }
    
    // Remove other configurations
    this.circuitBreakers.delete(serviceId);
    this.retryPolicies.delete(serviceId);
  }
}

module.exports = ServiceMeshInterface;