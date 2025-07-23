// MCP Orchestration System
// Main entry point for all orchestration features

// Core
const OrchestrationCore = require('./core/orchestration-interface');
const BaseOrchestrationInterface = require('./core/base-interface');

// Adapters
const KubernetesAdapter = require('./adapters/kubernetes-adapter');
const SwarmAdapter = require('./adapters/swarm-adapter');
const NomadAdapter = require('./adapters/nomad-adapter');

// Utilities
const StackBuilder = require('./utils/stack-builder');
const ServiceDiscovery = require('./utils/service-discovery');

// Helm
const HelmManager = require('./helm/helm-manager');

// Operators
const MCPServiceOperator = require('./operators/mcp-service-operator');

// Factory function for creating orchestrator instances
function createOrchestrator(platform = 'kubernetes', options = {}) {
  return new OrchestrationCore(platform, options);
}

// Export all components
module.exports = {
  // Factory
  createOrchestrator,
  
  // Core classes
  OrchestrationCore,
  BaseOrchestrationInterface,
  
  // Adapters
  KubernetesAdapter,
  SwarmAdapter,
  NomadAdapter,
  
  // Utilities
  StackBuilder,
  ServiceDiscovery,
  
  // Helm
  HelmManager,
  
  // Operators
  MCPServiceOperator,
  
  // Quick access methods
  kubernetes: (options) => createOrchestrator('kubernetes', options),
  swarm: (options) => createOrchestrator('swarm', options),
  nomad: (options) => createOrchestrator('nomad', options)
};