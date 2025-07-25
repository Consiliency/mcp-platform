/**
 * Transport type detector for MCP services
 * Analyzes service metadata to determine the appropriate transport type
 */

const TRANSPORT_PATTERNS = {
  stdio: {
    // Patterns that indicate stdio transport
    sourcePatterns: [/^@modelcontextprotocol\/server-/],
    envPatterns: [/MCP_MODE.*stdio/i],
    commandPatterns: [/node|python|ruby|go|rust/i],
    filePatterns: [/\.js$|\.py$|\.rb$|\.go$|\.rs$/]
  },
  http: {
    // Patterns that indicate HTTP transport
    sourcePatterns: [/^@modelcontextprotocol\/server-/],
    envPatterns: [/MCP_MODE.*http/i],
    portRequired: true,
    healthCheckPath: true
  },
  websocket: {
    // Patterns that indicate WebSocket transport
    sourcePatterns: [/slack|discord|chat|stream/i],
    envPatterns: [/MCP_MODE.*websocket/i, /WS_/],
    realtime: true
  },
  sse: {
    // Patterns that indicate SSE transport
    sourcePatterns: [/weather|stock|feed|monitor/i],
    envPatterns: [/MCP_MODE.*sse/i, /SSE_/],
    streaming: true
  }
};

class TransportDetector {
  /**
   * Detect transport type based on service metadata
   * @param {Object} service - Service configuration object
   * @returns {Object} Transport detection result
   */
  static detect(service) {
    const result = {
      type: null,
      confidence: 0,
      reasoning: [],
      suggestedConfig: null
    };

    // Check if transport is already explicitly defined
    if (service.transport && service.transport.type) {
      result.type = service.transport.type;
      result.confidence = 100;
      result.reasoning.push('Transport type explicitly defined');
      return result;
    }

    // Analyze environment variables
    const envAnalysis = this.analyzeEnvironment(service);
    if (envAnalysis.type) {
      result.type = envAnalysis.type;
      result.confidence += envAnalysis.confidence;
      result.reasoning.push(...envAnalysis.reasoning);
    }

    // Analyze source type and package name
    const sourceAnalysis = this.analyzeSource(service);
    if (sourceAnalysis.type) {
      if (!result.type || sourceAnalysis.confidence > 30) {
        result.type = sourceAnalysis.type;
      }
      result.confidence += sourceAnalysis.confidence;
      result.reasoning.push(...sourceAnalysis.reasoning);
    }

    // Analyze service configuration
    const configAnalysis = this.analyzeConfig(service);
    if (configAnalysis.type) {
      if (!result.type || configAnalysis.confidence > 40) {
        result.type = configAnalysis.type;
      }
      result.confidence += configAnalysis.confidence;
      result.reasoning.push(...configAnalysis.reasoning);
    }

    // Default to HTTP if no clear indication
    if (!result.type) {
      result.type = 'http';
      result.confidence = 30;
      result.reasoning.push('Defaulting to HTTP transport');
    }

    // Normalize confidence to 0-100
    result.confidence = Math.min(100, result.confidence);

    // Generate suggested configuration
    result.suggestedConfig = this.generateSuggestedConfig(result.type, service);

    return result;
  }

  /**
   * Analyze environment variables for transport hints
   */
  static analyzeEnvironment(service) {
    const result = {
      type: null,
      confidence: 0,
      reasoning: []
    };

    const env = service.config?.environment || {};
    const envString = JSON.stringify(env).toLowerCase();

    for (const [transport, patterns] of Object.entries(TRANSPORT_PATTERNS)) {
      for (const pattern of (patterns.envPatterns || [])) {
        if (pattern.test(envString)) {
          result.type = transport;
          result.confidence += 50;
          result.reasoning.push(`Environment suggests ${transport} transport`);
          return result;
        }
      }
    }

    return result;
  }

  /**
   * Analyze source information for transport hints
   */
  static analyzeSource(service) {
    const result = {
      type: null,
      confidence: 0,
      reasoning: []
    };

    const source = service.source;
    if (!source) return result;

    const sourceString = JSON.stringify(source).toLowerCase();

    // Check for local/custom sources (often stdio)
    if (source.type === 'local') {
      result.type = 'stdio';
      result.confidence += 20;
      result.reasoning.push('Local sources often use stdio transport');
    }

    // Check package patterns
    for (const [transport, patterns] of Object.entries(TRANSPORT_PATTERNS)) {
      for (const pattern of (patterns.sourcePatterns || [])) {
        if (pattern.test(sourceString)) {
          result.type = transport;
          result.confidence += 30;
          result.reasoning.push(`Source pattern matches ${transport} transport`);
          break;
        }
      }
    }

    return result;
  }

  /**
   * Analyze service configuration for transport hints
   */
  static analyzeConfig(service) {
    const result = {
      type: null,
      confidence: 0,
      reasoning: []
    };

    const config = service.config;
    if (!config) return result;

    // Port configuration suggests HTTP/WebSocket
    if (config.port) {
      result.type = 'http';
      result.confidence += 20;
      result.reasoning.push('Port configuration suggests network transport');
    }

    // Health check suggests HTTP
    if (service.healthCheck?.path) {
      result.type = 'http';
      result.confidence += 30;
      result.reasoning.push('Health check path suggests HTTP transport');
    }

    // Volume mounts suggest local/stdio
    if (config.volumes && config.volumes.length > 0) {
      if (!result.type) {
        result.type = 'stdio';
        result.confidence += 10;
        result.reasoning.push('Volume mounts suggest local execution');
      }
    }

    return result;
  }

  /**
   * Generate suggested transport configuration
   */
  static generateSuggestedConfig(transportType, service) {
    const config = {
      type: transportType,
      autoDetect: false
    };

    switch (transportType) {
      case 'stdio':
        config.stdio = {
          command: 'node',
          args: ['server.js'],
          env: {
            ...service.config?.environment,
            MCP_MODE: 'stdio'
          }
        };
        break;

      case 'http':
        config.http = {
          url: `http://localhost:\${port}/mcp`,
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 30000
        };
        break;

      case 'websocket':
        config.websocket = {
          url: `ws://localhost:\${port}/mcp`,
          reconnect: true,
          pingInterval: 30000
        };
        break;

      case 'sse':
        config.sse = {
          url: `http://localhost:\${port}/mcp/events`,
          reconnectInterval: 5000
        };
        break;
    }

    return config;
  }

  /**
   * Validate transport configuration
   */
  static validateTransportConfig(service) {
    const errors = [];
    const warnings = [];

    if (!service.transport) {
      errors.push('Transport configuration is missing');
      return { valid: false, errors, warnings };
    }

    const { type, ...config } = service.transport;

    if (!type) {
      errors.push('Transport type is required');
    } else if (!['stdio', 'http', 'websocket', 'sse'].includes(type)) {
      errors.push(`Invalid transport type: ${type}`);
    }

    // Validate type-specific configuration
    if (type && config[type]) {
      const typeConfig = config[type];

      switch (type) {
        case 'stdio':
          if (!typeConfig.command) {
            errors.push('stdio transport requires command');
          }
          break;

        case 'http':
          if (!typeConfig.url) {
            errors.push('http transport requires url');
          }
          break;

        case 'websocket':
          if (!typeConfig.url) {
            errors.push('websocket transport requires url');
          }
          break;

        case 'sse':
          if (!typeConfig.url) {
            errors.push('sse transport requires url');
          }
          break;
      }
    } else if (type) {
      warnings.push(`No configuration provided for ${type} transport`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
}

module.exports = TransportDetector;