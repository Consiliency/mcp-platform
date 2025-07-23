/**
 * Production Feature Flags Configuration
 * Controls feature availability in production environment
 */

// Feature flag validation helper
function validateFeatureFlag(flag) {
  if (typeof flag !== 'object' || flag === null) {
    return false;
  }
  
  const requiredFields = ['enabled', 'description'];
  const validFields = ['enabled', 'description', 'rolloutPercentage', 'allowedUsers', 
                       'allowedGroups', 'blockedUsers', 'conditions', 'metadata'];
  
  // Check required fields
  for (const field of requiredFields) {
    if (!(field in flag)) {
      return false;
    }
  }
  
  // Check for unknown fields
  for (const field in flag) {
    if (!validFields.includes(field)) {
      console.warn(`Unknown feature flag field: ${field}`);
    }
  }
  
  // Validate field types
  if (typeof flag.enabled !== 'boolean') return false;
  if (typeof flag.description !== 'string') return false;
  if ('rolloutPercentage' in flag && (typeof flag.rolloutPercentage !== 'number' || 
      flag.rolloutPercentage < 0 || flag.rolloutPercentage > 100)) return false;
  
  return true;
}

// Helper to check if feature is enabled for a user
function isFeatureEnabledForUser(flag, userId, userGroups = []) {
  if (!flag.enabled) return false;
  
  // Check if user is blocked
  if (flag.blockedUsers && flag.blockedUsers.includes(userId)) {
    return false;
  }
  
  // Check if user is explicitly allowed
  if (flag.allowedUsers && flag.allowedUsers.includes(userId)) {
    return true;
  }
  
  // Check if user's group is allowed
  if (flag.allowedGroups && userGroups.some(group => flag.allowedGroups.includes(group))) {
    return true;
  }
  
  // Check rollout percentage
  if (flag.rolloutPercentage !== undefined && flag.rolloutPercentage < 100) {
    // Simple hash-based rollout (deterministic per user)
    const hash = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return (hash % 100) < flag.rolloutPercentage;
  }
  
  // If no specific rules, follow the enabled flag
  return flag.enabled && (!flag.allowedUsers && !flag.allowedGroups);
}

// Production feature flags configuration
const features = {
  // API Features
  api: {
    v2Endpoints: {
      enabled: process.env.FEATURE_API_V2 === 'true' || false,
      description: 'Enable v2 API endpoints',
      rolloutPercentage: 0, // Gradual rollout
    },
    
    graphqlEndpoint: {
      enabled: process.env.FEATURE_GRAPHQL === 'true' || false,
      description: 'Enable GraphQL API endpoint',
      allowedGroups: ['beta_testers'],
    },
    
    webhooks: {
      enabled: process.env.FEATURE_WEBHOOKS === 'true' || true,
      description: 'Enable webhook functionality',
    },
    
    batchOperations: {
      enabled: process.env.FEATURE_BATCH_OPS === 'true' || true,
      description: 'Enable batch API operations',
    },
  },
  
  // Security Features
  security: {
    oauth2: {
      enabled: process.env.FEATURE_OAUTH2 === 'true' || true,
      description: 'Enable OAuth2 authentication',
    },
    
    mfa: {
      enabled: process.env.FEATURE_MFA === 'true' || true,
      description: 'Enable multi-factor authentication',
      rolloutPercentage: 100,
    },
    
    apiKeyRotation: {
      enabled: process.env.FEATURE_API_KEY_ROTATION === 'true' || true,
      description: 'Enable automatic API key rotation',
    },
    
    advancedRateLimiting: {
      enabled: process.env.FEATURE_ADV_RATE_LIMIT === 'true' || true,
      description: 'Enable advanced rate limiting with sliding windows',
    },
  },
  
  // Platform Features
  platform: {
    autoScaling: {
      enabled: process.env.FEATURE_AUTO_SCALING === 'true' || true,
      description: 'Enable automatic service scaling',
    },
    
    serviceMesh: {
      enabled: process.env.FEATURE_SERVICE_MESH === 'true' || true,
      description: 'Enable service mesh integration',
    },
    
    distributedTracing: {
      enabled: process.env.FEATURE_DIST_TRACING === 'true' || true,
      description: 'Enable distributed tracing',
    },
    
    blueGreenDeployment: {
      enabled: process.env.FEATURE_BLUE_GREEN === 'true' || false,
      description: 'Enable blue-green deployment strategy',
      allowedGroups: ['devops'],
    },
  },
  
  // User Experience Features
  ux: {
    newDashboard: {
      enabled: process.env.FEATURE_NEW_DASHBOARD === 'true' || false,
      description: 'Enable new dashboard UI',
      rolloutPercentage: 25,
    },
    
    darkMode: {
      enabled: process.env.FEATURE_DARK_MODE === 'true' || true,
      description: 'Enable dark mode theme',
    },
    
    realtimeNotifications: {
      enabled: process.env.FEATURE_REALTIME_NOTIF === 'true' || true,
      description: 'Enable real-time notifications',
    },
    
    advancedSearch: {
      enabled: process.env.FEATURE_ADV_SEARCH === 'true' || true,
      description: 'Enable advanced search capabilities',
    },
  },
  
  // Integration Features
  integrations: {
    slackIntegration: {
      enabled: process.env.FEATURE_SLACK === 'true' || true,
      description: 'Enable Slack integration',
    },
    
    githubActions: {
      enabled: process.env.FEATURE_GITHUB_ACTIONS === 'true' || true,
      description: 'Enable GitHub Actions integration',
    },
    
    terraformProvider: {
      enabled: process.env.FEATURE_TERRAFORM === 'true' || false,
      description: 'Enable Terraform provider',
      allowedGroups: ['infrastructure'],
    },
    
    prometheusExporter: {
      enabled: process.env.FEATURE_PROMETHEUS === 'true' || true,
      description: 'Enable Prometheus metrics exporter',
    },
  },
  
  // Performance Features
  performance: {
    caching: {
      enabled: process.env.FEATURE_CACHING === 'true' || true,
      description: 'Enable response caching',
    },
    
    compression: {
      enabled: process.env.FEATURE_COMPRESSION === 'true' || true,
      description: 'Enable response compression',
    },
    
    lazyLoading: {
      enabled: process.env.FEATURE_LAZY_LOADING === 'true' || true,
      description: 'Enable lazy loading of resources',
    },
    
    connectionPooling: {
      enabled: process.env.FEATURE_CONN_POOLING === 'true' || true,
      description: 'Enable database connection pooling',
    },
  },
  
  // Experimental Features
  experimental: {
    aiAssistant: {
      enabled: process.env.FEATURE_AI_ASSISTANT === 'true' || false,
      description: 'Enable AI-powered assistant',
      allowedUsers: process.env.AI_BETA_USERS ? process.env.AI_BETA_USERS.split(',') : [],
    },
    
    quantumEncryption: {
      enabled: false,
      description: 'Enable quantum-resistant encryption (experimental)',
      allowedGroups: ['security_team'],
    },
    
    edgeComputing: {
      enabled: process.env.FEATURE_EDGE_COMPUTE === 'true' || false,
      description: 'Enable edge computing capabilities',
      rolloutPercentage: 5,
    },
  },
};

// Feature flag utilities
const featureFlagUtils = {
  // Check if a feature is enabled
  isEnabled(featurePath, userId = null, userGroups = []) {
    const pathParts = featurePath.split('.');
    let feature = features;
    
    for (const part of pathParts) {
      feature = feature[part];
      if (!feature) return false;
    }
    
    if (typeof feature.enabled === 'boolean') {
      if (userId) {
        return isFeatureEnabledForUser(feature, userId, userGroups);
      }
      return feature.enabled;
    }
    
    return false;
  },
  
  // Get all features for a user
  getFeaturesForUser(userId, userGroups = []) {
    const userFeatures = {};
    
    const processFeatures = (obj, prefix = '') => {
      for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        
        if (value.enabled !== undefined) {
          userFeatures[fullKey] = isFeatureEnabledForUser(value, userId, userGroups);
        } else if (typeof value === 'object') {
          processFeatures(value, fullKey);
        }
      }
    };
    
    processFeatures(features);
    return userFeatures;
  },
  
  // Validate all feature flags
  validateAll() {
    const errors = [];
    
    const validateRecursive = (obj, path = '') => {
      for (const [key, value] of Object.entries(obj)) {
        const fullPath = path ? `${path}.${key}` : key;
        
        if (value.enabled !== undefined) {
          if (!validateFeatureFlag(value)) {
            errors.push(`Invalid feature flag at ${fullPath}`);
          }
        } else if (typeof value === 'object') {
          validateRecursive(value, fullPath);
        }
      }
    };
    
    validateRecursive(features);
    
    if (errors.length > 0) {
      throw new Error(`Feature flag validation failed:\n${errors.join('\n')}`);
    }
    
    return true;
  },
};

// Validate on load
try {
  featureFlagUtils.validateAll();
} catch (error) {
  console.error('Feature flag validation failed:', error.message);
  process.exit(1);
}

module.exports = {
  features,
  featureFlagUtils,
  isEnabled: featureFlagUtils.isEnabled,
  getFeaturesForUser: featureFlagUtils.getFeaturesForUser,
};