// Contract: Container Orchestration
// Purpose: Define the interface for Kubernetes, Helm, and Swarm integration
// Team responsible: Orchestration Team

const OrchestrationCore = require('../../integrations/orchestration/core/orchestration-interface');

class OrchestrationInterface extends OrchestrationCore {
  constructor(platform) {
    // platform: 'kubernetes' | 'swarm' | 'nomad'
    super(platform);
  }

  // All methods are inherited from OrchestrationCore
  // No need to override - the parent class handles all implementations
}

module.exports = OrchestrationInterface;