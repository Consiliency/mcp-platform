// Service Mesh Integration - Main Entry Point

const ServiceMeshInterface = require('./core/service-mesh-interface');
const MeshHelpers = require('./utils/mesh-helpers');

// Export adapters
const IstioAdapter = require('./adapters/istio-adapter');
const LinkerdAdapter = require('./adapters/linkerd-adapter');
const ConsulAdapter = require('./adapters/consul-adapter');

// Re-export the interface contract
const ServiceMeshInterfaceContract = require('../../interfaces/phase5/service-mesh.interface');

module.exports = {
  // Main interface
  ServiceMeshInterface,
  
  // Adapters
  IstioAdapter,
  LinkerdAdapter,
  ConsulAdapter,
  
  // Utilities
  MeshHelpers,
  
  // Contract for reference
  ServiceMeshInterfaceContract,
  
  // Factory method for convenience
  createServiceMesh(meshType) {
    return new ServiceMeshInterface(meshType);
  }
};