// Shared state for orchestration instances during testing
// This allows different instances to share deployment state

const sharedState = {
  kubernetes: {
    deployments: new Map(),
    scalingEvents: new Map()
  },
  swarm: {
    deployments: new Map(),
    scalingEvents: new Map()
  },
  nomad: {
    deployments: new Map(),
    scalingEvents: new Map()
  }
};

module.exports = sharedState;