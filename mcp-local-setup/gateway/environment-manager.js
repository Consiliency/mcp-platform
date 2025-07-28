const fs = require('fs').promises;
const path = require('path');
const EnvLoader = require('./env-loader');
const dotenv = require('dotenv');

/**
 * Environment Variable Manager for MCP Gateway
 * Manages discovery, validation, and storage of all environment variables for MCP servers
 */
class EnvironmentManager {
  constructor() {
    this.envLoader = new EnvLoader();
    this.catalogPath = path.join(__dirname, '..', 'catalog', 'servers-extended.json');
    this.metadataPath = path.join(__dirname, '..', 'catalog', 'environment-metadata.json');
    this.envMcpPath = path.join(__dirname, '..', '.env.mcp');
    this.environmentRequirements = new Map();
    this.loadedVariables = new Map();
    this.metadata = {};
  }

  /**
   * Initialize the environment manager
   */
  async initialize() {
    // Load environment variables from .env.mcp
    this.loadMcpEnvironment();
    
    // Load environment variables
    this.envLoader.load();
    
    // Load metadata
    await this.loadMetadata();
    
    // Scan catalog for environment requirements
    await this.scanCatalog();
    
    // Load existing environment variables
    this.loadExistingVariables();
    
    // Load persisted non-secret variables
    await this.loadPersistedVariables();
  }

  /**
   * Load environment variable metadata
   */
  async loadMetadata() {
    try {
      const metadataData = await fs.readFile(this.metadataPath, 'utf8');
      this.metadata = JSON.parse(metadataData);
    } catch (error) {
      console.log('Environment metadata not found, using defaults');
      this.metadata = {};
    }
  }

  /**
   * Scan the catalog to find all servers that need environment variables
   */
  async scanCatalog() {
    try {
      const catalogData = await fs.readFile(this.catalogPath, 'utf8');
      const catalog = JSON.parse(catalogData);
      
      for (const server of catalog) {
        const requiredVars = {};
        let hasRequirements = false;
        
        // First, check environment variables defined in the server config
        if (server.config && server.config.environment) {
          for (const [key, value] of Object.entries(server.config.environment)) {
            // Get metadata for this variable
            const varMetadata = this.metadata[server.id]?.[key] || {};
            
            // If value is empty string or we have metadata, it's required
            if (value === '' || varMetadata.required) {
              requiredVars[key] = {
                ...varMetadata,
                type: varMetadata.type || this.getVariableType(key),
                required: varMetadata.required !== false,
                description: varMetadata.description || this.getVariableDescription(server.id, key),
                currentValue: value || ''
              };
              hasRequirements = true;
            }
          }
        }
        
        // Also check metadata for any additional variables not in server config
        if (this.metadata[server.id]) {
          for (const [key, varMetadata] of Object.entries(this.metadata[server.id])) {
            if (!requiredVars[key] && varMetadata.required !== false) {
              requiredVars[key] = {
                ...varMetadata,
                type: varMetadata.type || this.getVariableType(key),
                required: varMetadata.required !== false,
                description: varMetadata.description || this.getVariableDescription(server.id, key),
                currentValue: ''
              };
              hasRequirements = true;
            }
          }
        }
        
        if (hasRequirements) {
          this.environmentRequirements.set(server.id, {
            name: server.name,
            package: server.package,
            category: server.category,
            variables: requiredVars
          });
        }
      }
      
      console.log(`Found ${this.environmentRequirements.size} servers requiring environment variables`);
    } catch (error) {
      console.error('Error scanning catalog:', error);
    }
  }

  /**
   * Determine variable type based on name and metadata
   */
  getVariableType(varName) {
    // Check common patterns
    if (/_KEY$/i.test(varName) && !/_ACCESS_KEY$/i.test(varName)) return 'api_key';
    if (/_TOKEN$/i.test(varName)) return 'token';
    if (/_SECRET$/i.test(varName)) return 'secret';
    if (/_PASSWORD$/i.test(varName) || /_PASSWD$/i.test(varName)) return 'password';
    if (/_CLIENT_ID$/i.test(varName)) return 'client_id';
    if (/_CLIENT_SECRET$/i.test(varName)) return 'client_secret';
    if (/_ACCESS_KEY$/i.test(varName)) return 'access_key';
    if (/_PATH$/i.test(varName) || /CONFIG$/i.test(varName)) return 'path';
    if (/_URL$/i.test(varName) || /_URI$/i.test(varName)) return 'url';
    if (/_HOST$/i.test(varName)) return 'host';
    if (/_PORT$/i.test(varName)) return 'port';
    if (/_USER$/i.test(varName) || /_USERNAME$/i.test(varName)) return 'username';
    if (/_EMAIL$/i.test(varName)) return 'email';
    if (/_DATABASE$/i.test(varName) || /_DB$/i.test(varName)) return 'database';
    if (/_REGION$/i.test(varName)) return 'region';
    if (/CONNECTION_STRING$/i.test(varName)) return 'connection_string';
    
    return 'string';
  }

  /**
   * Get human-readable description for a variable
   */
  getVariableDescription(serverId, varName) {
    const descriptions = {
      // Search services
      'BRAVE_API_KEY': 'Brave Search API key for web search',
      'TAVILY_API_KEY': 'Tavily API key for advanced search',
      'SERPER_API_KEY': 'Serper API key for Google search results',
      'EXA_API_KEY': 'Exa API key for neural search',
      
      // Paths
      'VAULT_PATH': 'Path to your Obsidian vault folder',
      'SSH_CONFIG_PATH': 'Path to SSH configuration directory',
      'KUBECONFIG': 'Path to Kubernetes configuration file',
      'SNAP_HAPPY_SCREENSHOT_PATH': 'Directory where screenshots will be saved',
      
      // Cloud providers
      'AWS_ACCESS_KEY_ID': 'AWS access key ID',
      'AWS_SECRET_ACCESS_KEY': 'AWS secret access key',
      'AWS_REGION': 'AWS region (e.g., us-east-1)',
      
      // Development platforms
      'GITHUB_PERSONAL_ACCESS_TOKEN': 'GitHub personal access token with repo access',
      'GITLAB_PERSONAL_ACCESS_TOKEN': 'GitLab personal access token',
      'GITLAB_API_URL': 'GitLab API URL (default: https://gitlab.com/api/v4)',
      
      // Databases
      'POSTGRES_CONNECTION_STRING': 'PostgreSQL connection string (postgresql://user:pass@host:port/dbname)',
      'MYSQL_HOST': 'MySQL server hostname',
      'MYSQL_USER': 'MySQL username',
      'MYSQL_PASSWORD': 'MySQL password',
      'MYSQL_DATABASE': 'MySQL database name',
      'MONGODB_URI': 'MongoDB connection URI',
      'REDIS_URL': 'Redis connection URL',
      'NEO4J_URI': 'Neo4j connection URI (bolt://host:port)',
      'NEO4J_USER': 'Neo4j username',
      'NEO4J_PASSWORD': 'Neo4j password',
      
      // Project management
      'JIRA_HOST': 'Jira instance URL (e.g., yourcompany.atlassian.net)',
      'JIRA_EMAIL': 'Jira account email',
      'JIRA_API_TOKEN': 'Jira API token',
      
      // Default
      [varName]: `${varName} configuration value`
    };
    
    return descriptions[varName] || descriptions.default;
  }

  /**
   * Load existing environment variables
   */
  loadExistingVariables() {
    // Load from process.env
    for (const [serverId, requirements] of this.environmentRequirements) {
      for (const varName of Object.keys(requirements.variables)) {
        if (process.env[varName]) {
          this.loadedVariables.set(`${serverId}:${varName}`, process.env[varName]);
        }
      }
    }
  }

  /**
   * Get server environment status
   */
  getServerStatus(serverId) {
    const requirements = this.environmentRequirements.get(serverId);
    if (!requirements) {
      return {
        hasRequirements: false,
        requirements: {},
        configured: [],
        missing: []
      };
    }

    const configured = [];
    const missing = [];
    const variableDetails = {};

    for (const [varName, varInfo] of Object.entries(requirements.variables)) {
      const value = this.loadedVariables.get(`${serverId}:${varName}`) || process.env[varName];
      const isSecret = this.isSecretVariable(varName);
      
      // Enhance variable info with storage type and value (for non-secrets)
      variableDetails[varName] = {
        ...varInfo,
        storageType: isSecret ? 'secret' : 'config',
        value: isSecret ? null : value, // Only expose non-secret values
        isConfigured: !!value
      };
      
      if (value) {
        configured.push(varName);
      } else if (varInfo.required) {
        missing.push(varName);
      }
    }

    return {
      hasRequirements: true,
      requirements: variableDetails,
      configured,
      missing,
      serverName: requirements.name,
      category: requirements.category
    };
  }

  /**
   * Get all servers with their environment status
   */
  getAllServersStatus() {
    const result = [];
    
    for (const [serverId, requirements] of this.environmentRequirements) {
      const status = this.getServerStatus(serverId);
      result.push({
        serverId,
        ...requirements,
        status
      });
    }
    
    // Sort by category and name
    result.sort((a, b) => {
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category);
      }
      return a.name.localeCompare(b.name);
    });
    
    return result;
  }

  /**
   * Save environment variables for a server
   */
  async saveServerVariables(serverId, variables) {
    const requirements = this.environmentRequirements.get(serverId);
    if (!requirements) {
      throw new Error(`Server ${serverId} not found`);
    }

    // Validate and save each variable
    for (const [varName, value] of Object.entries(variables)) {
      if (value && value.trim()) {
        let processedValue = value.trim();
        
        // Special handling for snap-happy screenshot path
        if (serverId === 'snap-happy' && varName === 'SNAP_HAPPY_SCREENSHOT_PATH') {
          // If not provided, use default
          if (!processedValue) {
            processedValue = '${TEMP}/screenshots';
          }
          
          // Store the value
          this.loadedVariables.set(`${serverId}:${varName}`, processedValue);
          
          // Also ensure the directory will be created
          const varInfo = requirements.variables[varName];
          if (varInfo) {
            varInfo.createIfMissing = true;
          }
        } else {
          this.loadedVariables.set(`${serverId}:${varName}`, processedValue);
        }
      } else {
        this.loadedVariables.delete(`${serverId}:${varName}`);
      }
    }

    // Persist the variables
    await this.persistVariables();
    
    // Reload environment
    this.loadMcpEnvironment();
    this.envLoader.load();
    
    // Ensure paths exist for variables that need them
    await this.ensurePathsExist();
    
    return this.getServerStatus(serverId);
  }

  /**
   * Load environment variables from .env.mcp
   */
  loadMcpEnvironment() {
    try {
      // Load .env.mcp file
      const result = dotenv.config({ path: this.envMcpPath });
      if (result.error) {
        console.log('.env.mcp file not found, will be created on first save');
      }
    } catch (error) {
      console.error('Error loading .env.mcp:', error);
    }
  }

  /**
   * Load persisted variables from .env.mcp
   */
  async loadPersistedVariables() {
    try {
      // Read the .env.mcp file
      const envContent = await fs.readFile(this.envMcpPath, 'utf8');
      const parsed = dotenv.parse(envContent);
      
      // Load non-secret variables into memory
      for (const [key, value] of Object.entries(parsed)) {
        // Find which server this variable belongs to
        for (const [serverId, requirements] of this.environmentRequirements) {
          if (requirements.variables && requirements.variables[key]) {
            // Only load if it's not a secret
            if (!this.isSecretVariable(key)) {
              this.loadedVariables.set(`${serverId}:${key}`, value);
            }
            break;
          }
        }
      }
      
      console.log(`Loaded ${this.loadedVariables.size} environment variables from .env.mcp`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('Error loading persisted variables:', error);
      }
    }
  }

  /**
   * Persist non-secret variables to .env.mcp
   */
  async persistVariables() {
    const lines = [
      '# MCP Gateway Environment Variables',
      '# This file stores non-secret environment variables for MCP servers',
      '# Secrets and API keys are stored separately in data/api-keys.json',
      '# Format: VARIABLE_NAME=value',
      ''
    ];
    
    const grouped = new Map();

    // Group by server, excluding secrets
    for (const [key, value] of this.loadedVariables) {
      const [serverId, varName] = key.split(':');
      
      // Skip secrets - they go in api-keys.json
      if (this.isSecretVariable(varName)) {
        continue;
      }
      
      if (!grouped.has(serverId)) {
        grouped.set(serverId, []);
      }
      grouped.get(serverId).push({ varName, value });
    }

    // Write grouped variables
    for (const [serverId, vars] of grouped) {
      const requirements = this.environmentRequirements.get(serverId);
      if (requirements && vars.length > 0) {
        lines.push(`# ${requirements.name} configuration`);
        for (const { varName, value } of vars) {
          lines.push(`${varName}=${value}`);
        }
        lines.push('');
      }
    }
    
    // Add any additional non-secret variables
    lines.push('# Add other non-secret environment variables below');
    
    // Write to file
    await fs.writeFile(this.envMcpPath, lines.join('\n'), 'utf8');
    console.log('Persisted environment variables to .env.mcp');
  }

  /**
   * Check if variable is a secret (should go in api-keys.json)
   */
  isSecretVariable(varName) {
    const sensitivePatterns = [
      /key/i,
      /token/i,
      /secret/i,
      /password/i,
      /pwd/i,
      /pass/i,
      /auth/i,
      /credential/i,
      /private/i
    ];
    
    // Check if the variable name contains any sensitive patterns
    return sensitivePatterns.some(pattern => pattern.test(varName));
  }

  /**
   * Generate .env file content (deprecated - use persistVariables)
   */
  generateEnvContent() {
    const lines = ['# MCP Gateway Environment Variables', '# Generated by Environment Manager', ''];
    const grouped = new Map();

    // Group by server
    for (const [key, value] of this.loadedVariables) {
      const [serverId, varName] = key.split(':');
      if (!grouped.has(serverId)) {
        grouped.set(serverId, []);
      }
      grouped.get(serverId).push({ varName, value });
    }

    // Write grouped variables
    for (const [serverId, vars] of grouped) {
      const requirements = this.environmentRequirements.get(serverId);
      if (requirements) {
        lines.push(`# ${requirements.name} (${serverId})`);
        for (const { varName, value } of vars) {
          lines.push(`${varName}=${value}`);
        }
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  /**
   * Get environment variables for a specific server
   */
  getServerEnvironment(serverId) {
    const env = {};
    const requirements = this.environmentRequirements.get(serverId);
    
    if (!requirements) {
      return env;
    }

    for (const varName of Object.keys(requirements.variables)) {
      const value = this.loadedVariables.get(`${serverId}:${varName}`) || process.env[varName];
      if (value) {
        env[varName] = value;
      }
    }

    return env;
  }

  /**
   * Check if variable is an API key or sensitive credential
   */
  isSensitiveVariable(varName) {
    const type = this.getVariableType(varName);
    return ['api_key', 'token', 'secret', 'password', 'access_key', 'client_secret'].includes(type);
  }

  /**
   * Validate a variable value based on its type
   */
  validateVariable(varName, value, metadata = {}) {
    const type = metadata.type || this.getVariableType(varName);
    
    switch (type) {
      case 'url':
        try {
          new URL(value);
          return { valid: true };
        } catch {
          return { valid: false, error: 'Invalid URL format' };
        }
        
      case 'email':
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return { valid: emailRegex.test(value), error: 'Invalid email format' };
        
      case 'path':
        // Path validation would be done server-side
        return { valid: true };
        
      case 'port':
        const port = parseInt(value);
        return { 
          valid: !isNaN(port) && port > 0 && port < 65536,
          error: 'Port must be between 1 and 65535'
        };
        
      case 'connection_string':
        // Basic validation - just check it's not empty
        return { valid: value.trim().length > 0 };
        
      default:
        return { valid: true };
    }
  }

  /**
   * Create directories for path variables if needed
   */
  async ensurePathsExist() {
    for (const [serverId, requirements] of this.environmentRequirements) {
      for (const [varName, varInfo] of Object.entries(requirements.variables)) {
        if (varInfo.type === 'path' && varInfo.createIfMissing) {
          const value = this.loadedVariables.get(`${serverId}:${varName}`) || process.env[varName];
          if (value) {
            try {
              // Expand environment variables in path
              const expandedPath = value.replace(/\$\{(\w+)\}/g, (match, envVar) => {
                return process.env[envVar] || match;
              });
              
              // Create directory if it doesn't exist
              await fs.mkdir(expandedPath, { recursive: true });
              console.log(`Created directory: ${expandedPath}`);
            } catch (error) {
              console.error(`Failed to create directory ${value}:`, error.message);
            }
          }
        }
      }
    }
  }
}

module.exports = EnvironmentManager;