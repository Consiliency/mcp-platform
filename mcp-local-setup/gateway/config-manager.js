const fs = require('fs').promises;
const path = require('path');

class ConfigManager {
  constructor() {
    this.config = {
      gateway: {
        apiKey: process.env.MCP_GATEWAY_API_KEY || 'mcp-gateway-default-key',
        autoStartServers: this.parseAutoStartServers(process.env.MCP_AUTO_START_SERVERS)
      },
      servers: {}
    };
    
    this.configPath = path.join(
      process.env.MCP_HOME || path.join(process.env.HOME, '.mcp-platform'),
      'gateway-config.json'
    );
    
    this.loadConfig();
  }
  
  parseAutoStartServers(envValue) {
    if (!envValue) {
      return ['snap-happy', 'echo']; // Default servers to auto-start
    }
    return envValue.split(',').map(s => s.trim()).filter(Boolean);
  }
  
  async loadConfig() {
    try {
      const data = await fs.readFile(this.configPath, 'utf8');
      const loadedConfig = JSON.parse(data);
      
      // Merge with environment-based config
      this.config = {
        ...this.config,
        ...loadedConfig,
        gateway: {
          ...this.config.gateway,
          ...loadedConfig.gateway
        },
        servers: {
          ...this.config.servers,
          ...loadedConfig.servers
        }
      };
      
      console.log('Loaded gateway configuration from', this.configPath);
      console.log('Config servers:', Object.keys(this.config.servers || {}));
    } catch (error) {
      // Config file doesn't exist, will use defaults
      console.log('Using default gateway configuration');
      await this.saveConfig();
    }
  }
  
  async saveConfig() {
    try {
      const dir = path.dirname(this.configPath);
      await fs.mkdir(dir, { recursive: true });
      
      await fs.writeFile(
        this.configPath,
        JSON.stringify(this.config, null, 2)
      );
      
      console.log('Saved gateway configuration to', this.configPath);
    } catch (error) {
      console.error('Failed to save config:', error);
    }
  }
  
  validateGatewayApiKey(apiKey) {
    if (!apiKey) return false;
    return apiKey === this.config.gateway.apiKey;
  }
  
  getAutoStartServers() {
    return this.config.gateway.autoStartServers || [];
  }
  
  getServerEnvironment(serverId) {
    const serverConfig = this.config.servers[serverId] || {};
    const env = {};
    
    // Load from environment variables with server prefix
    const prefix = `MCP_${serverId.toUpperCase().replace(/-/g, '_')}_`;
    
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith(prefix)) {
        const envKey = key.substring(prefix.length);
        env[envKey] = value;
      }
    }
    
    // Merge with config file settings, handling variable substitution
    if (serverConfig.environment) {
      for (const [key, value] of Object.entries(serverConfig.environment)) {
        if (typeof value === 'string' && value.startsWith('${') && value.endsWith('}')) {
          // Extract variable name
          const varName = value.slice(2, -1);
          env[key] = process.env[varName] || '';
        } else {
          env[key] = value;
        }
      }
    }
    
    // Add any API keys or secrets
    if (serverConfig.apiKey) {
      env.API_KEY = serverConfig.apiKey;
    }
    
    if (serverConfig.apiKeys) {
      Object.assign(env, serverConfig.apiKeys);
    }
    
    return env;
  }
  
  setServerConfig(serverId, config) {
    this.config.servers[serverId] = {
      ...this.config.servers[serverId],
      ...config
    };
    
    this.saveConfig();
  }
  
  getServerConfig(serverId) {
    return this.config.servers[serverId] || {};
  }
  
  getAllServerConfigs() {
    console.log('getAllServerConfigs called, returning:', this.config.servers);
    return this.config.servers || {};
  }
  
  // Helper method to set API keys for common services
  setServiceApiKeys(service, keys) {
    const serverConfigs = {
      github: {
        apiKeys: {
          GITHUB_TOKEN: keys.token,
          GITHUB_PERSONAL_ACCESS_TOKEN: keys.token
        }
      },
      openai: {
        apiKeys: {
          OPENAI_API_KEY: keys.apiKey
        }
      },
      anthropic: {
        apiKeys: {
          ANTHROPIC_API_KEY: keys.apiKey
        }
      },
      google: {
        apiKeys: {
          GOOGLE_API_KEY: keys.apiKey,
          GOOGLE_CLIENT_ID: keys.clientId,
          GOOGLE_CLIENT_SECRET: keys.clientSecret
        }
      },
      slack: {
        apiKeys: {
          SLACK_BOT_TOKEN: keys.botToken,
          SLACK_APP_TOKEN: keys.appToken
        }
      },
      linear: {
        apiKeys: {
          LINEAR_API_KEY: keys.apiKey
        }
      },
      notion: {
        apiKeys: {
          NOTION_API_KEY: keys.apiKey
        }
      }
    };
    
    if (serverConfigs[service]) {
      this.setServerConfig(service, serverConfigs[service]);
    }
  }
  
  // Get example configuration for documentation
  getExampleConfig() {
    return {
      gateway: {
        apiKey: 'your-secure-gateway-api-key',
        autoStartServers: ['github', 'filesystem', 'postgres']
      },
      servers: {
        github: {
          environment: {
            GITHUB_TOKEN: 'ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
          }
        },
        postgres: {
          environment: {
            DATABASE_URL: 'postgresql://user:password@localhost:5432/mydb'
          }
        },
        openai: {
          apiKey: 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
        }
      }
    };
  }
}

module.exports = ConfigManager;