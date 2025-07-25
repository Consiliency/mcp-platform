/**
 * Transport configuration validator for MCP services
 */

const Ajv = require('ajv');
const ajv = new Ajv({ allErrors: true });

// Transport-specific schemas
const transportSchemas = {
  stdio: {
    type: 'object',
    required: ['command'],
    properties: {
      command: {
        type: 'string',
        minLength: 1,
        description: 'Command to execute'
      },
      args: {
        type: 'array',
        items: { type: 'string' },
        description: 'Command arguments'
      },
      env: {
        type: 'object',
        additionalProperties: { type: 'string' },
        description: 'Environment variables'
      }
    },
    additionalProperties: false
  },
  http: {
    type: 'object',
    required: ['url'],
    properties: {
      url: {
        type: 'string',
        pattern: '^https?://',
        description: 'HTTP endpoint URL'
      },
      headers: {
        type: 'object',
        additionalProperties: { type: 'string' },
        description: 'HTTP headers'
      },
      timeout: {
        type: 'integer',
        minimum: 1000,
        maximum: 300000,
        description: 'Request timeout in milliseconds'
      }
    },
    additionalProperties: false
  },
  websocket: {
    type: 'object',
    required: ['url'],
    properties: {
      url: {
        type: 'string',
        pattern: '^wss?://',
        description: 'WebSocket endpoint URL'
      },
      reconnect: {
        type: 'boolean',
        description: 'Enable automatic reconnection'
      },
      pingInterval: {
        type: 'integer',
        minimum: 1000,
        maximum: 300000,
        description: 'Ping interval in milliseconds'
      },
      maxReconnectAttempts: {
        type: 'integer',
        minimum: 0,
        maximum: 100,
        description: 'Maximum reconnection attempts'
      }
    },
    additionalProperties: false
  },
  sse: {
    type: 'object',
    required: ['url'],
    properties: {
      url: {
        type: 'string',
        pattern: '^https?://',
        description: 'SSE endpoint URL'
      },
      reconnectInterval: {
        type: 'integer',
        minimum: 1000,
        maximum: 60000,
        description: 'Reconnection interval in milliseconds'
      },
      lastEventId: {
        type: 'string',
        description: 'Last event ID for resuming'
      }
    },
    additionalProperties: false
  }
};

class TransportValidator {
  constructor() {
    // Compile validators for each transport type
    this.validators = {};
    for (const [type, schema] of Object.entries(transportSchemas)) {
      this.validators[type] = ajv.compile(schema);
    }
  }

  /**
   * Validate transport configuration
   * @param {Object} transport - Transport configuration
   * @returns {Object} Validation result
   */
  validate(transport) {
    const result = {
      valid: true,
      errors: [],
      warnings: []
    };

    if (!transport) {
      result.valid = false;
      result.errors.push({
        path: 'transport',
        message: 'Transport configuration is required'
      });
      return result;
    }

    if (!transport.type) {
      result.valid = false;
      result.errors.push({
        path: 'transport.type',
        message: 'Transport type is required'
      });
      return result;
    }

    const supportedTypes = ['stdio', 'http', 'websocket', 'sse'];
    if (!supportedTypes.includes(transport.type)) {
      result.valid = false;
      result.errors.push({
        path: 'transport.type',
        message: `Transport type must be one of: ${supportedTypes.join(', ')}`
      });
      return result;
    }

    // Validate type-specific configuration
    const typeConfig = transport[transport.type];
    if (!typeConfig) {
      result.warnings.push({
        path: `transport.${transport.type}`,
        message: `No configuration provided for ${transport.type} transport`
      });
    } else {
      const validator = this.validators[transport.type];
      if (!validator(typeConfig)) {
        result.valid = false;
        validator.errors.forEach(error => {
          result.errors.push({
            path: `transport.${transport.type}${error.instancePath}`,
            message: error.message
          });
        });
      }
    }

    // Additional validation rules
    this.validateCrossTransportRules(transport, result);

    return result;
  }

  /**
   * Validate cross-transport rules and best practices
   */
  validateCrossTransportRules(transport, result) {
    const { type } = transport;
    const config = transport[type];

    if (!config) return;

    // Check for localhost URLs in production
    if ((type === 'http' || type === 'websocket' || type === 'sse') && config.url) {
      if (config.url.includes('localhost') || config.url.includes('127.0.0.1')) {
        result.warnings.push({
          path: `transport.${type}.url`,
          message: 'Using localhost URL - ensure this is replaced in production'
        });
      }
    }

    // Check for missing security in WebSocket
    if (type === 'websocket' && config.url && config.url.startsWith('ws://')) {
      result.warnings.push({
        path: `transport.${type}.url`,
        message: 'Using unencrypted WebSocket - consider using wss:// for production'
      });
    }

    // Check for missing timeout in HTTP
    if (type === 'http' && !config.timeout) {
      result.warnings.push({
        path: `transport.${type}.timeout`,
        message: 'No timeout specified - using default 30000ms'
      });
    }

    // Check for excessive reconnection settings
    if (type === 'websocket' && config.maxReconnectAttempts > 50) {
      result.warnings.push({
        path: `transport.${type}.maxReconnectAttempts`,
        message: 'High reconnection attempts may cause issues'
      });
    }

    // Validate environment variables in stdio
    if (type === 'stdio' && config.env) {
      const reservedEnvVars = ['PATH', 'HOME', 'USER', 'SHELL'];
      Object.keys(config.env).forEach(key => {
        if (reservedEnvVars.includes(key)) {
          result.warnings.push({
            path: `transport.${type}.env.${key}`,
            message: `Overriding system environment variable: ${key}`
          });
        }
      });
    }
  }

  /**
   * Validate transport configuration for a specific service
   */
  validateService(service) {
    const result = {
      valid: true,
      errors: [],
      warnings: []
    };

    // Basic transport validation
    const transportResult = this.validate(service.transport);
    result.valid = result.valid && transportResult.valid;
    result.errors.push(...transportResult.errors);
    result.warnings.push(...transportResult.warnings);

    // Service-specific validation
    if (service.transport) {
      this.validateServiceTransportCompatibility(service, result);
    }

    return result;
  }

  /**
   * Validate transport compatibility with service configuration
   */
  validateServiceTransportCompatibility(service, result) {
    const { transport, config } = service;

    // Check port configuration for network transports
    if (['http', 'websocket', 'sse'].includes(transport.type)) {
      if (!config || !config.port) {
        result.errors.push({
          path: 'config.port',
          message: `Port is required for ${transport.type} transport`
        });
        result.valid = false;
      }
    }

    // Check for stdio transport with Docker
    if (transport.type === 'stdio' && service.docker) {
      result.warnings.push({
        path: 'transport.type',
        message: 'stdio transport may have limitations in Docker containers'
      });
    }

    // Check for health check with non-HTTP transports
    if (service.healthCheck && transport.type !== 'http') {
      result.warnings.push({
        path: 'healthCheck',
        message: `Health check may not work properly with ${transport.type} transport`
      });
    }

    // Validate environment variable consistency
    if (config && config.environment && config.environment.MCP_MODE) {
      if (config.environment.MCP_MODE !== transport.type) {
        result.warnings.push({
          path: 'config.environment.MCP_MODE',
          message: `MCP_MODE (${config.environment.MCP_MODE}) doesn't match transport type (${transport.type})`
        });
      }
    }
  }

  /**
   * Suggest fixes for common validation errors
   */
  suggestFixes(validationResult) {
    const suggestions = [];

    validationResult.errors.forEach(error => {
      if (error.path.includes('.url') && error.message.includes('pattern')) {
        suggestions.push({
          error: error.path,
          suggestion: 'Ensure URL starts with correct protocol (http://, https://, ws://, or wss://)'
        });
      }

      if (error.path.includes('.command') && error.message.includes('required')) {
        suggestions.push({
          error: error.path,
          suggestion: 'Add command property with executable name (e.g., "node", "python")'
        });
      }
    });

    validationResult.warnings.forEach(warning => {
      if (warning.message.includes('localhost')) {
        suggestions.push({
          warning: warning.path,
          suggestion: 'Use environment variables for URLs: ${SERVICE_URL}'
        });
      }
    });

    return suggestions;
  }
}

module.exports = TransportValidator;