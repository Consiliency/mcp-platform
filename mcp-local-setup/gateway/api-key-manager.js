const fs = require('fs').promises;
const path = require('path');
const EnvLoader = require('./env-loader');

/**
 * API Key Manager for MCP Gateway
 * Manages discovery, validation, and storage of API keys for MCP servers
 */
class ApiKeyManager {
  constructor() {
    this.envLoader = new EnvLoader();
    this.catalogPath = path.join(__dirname, '..', 'catalog', 'servers-extended.json');
    this.apiKeyRequirements = new Map();
    this.loadedKeys = new Map();
  }

  /**
   * Initialize the API key manager
   */
  async initialize() {
    // Load environment variables
    this.envLoader.load();
    
    // Scan catalog for API key requirements
    await this.scanCatalog();
    
    // Load existing API keys
    this.loadExistingKeys();
  }

  /**
   * Scan the catalog to find all servers that need API keys
   */
  async scanCatalog() {
    try {
      const catalogData = await fs.readFile(this.catalogPath, 'utf8');
      const catalog = JSON.parse(catalogData);
      
      for (const server of catalog) {
        if (server.config && server.config.environment) {
          const requiredKeys = {};
          let hasRequirements = false;
          
          // Check each environment variable
          for (const [key, value] of Object.entries(server.config.environment)) {
            // If the value is empty string, it's likely a required API key
            if (value === '' || this.isApiKeyVariable(key)) {
              requiredKeys[key] = {
                type: this.getKeyType(key),
                required: true,
                description: this.getKeyDescription(server.id, key)
              };
              hasRequirements = true;
            }
          }
          
          if (hasRequirements) {
            this.apiKeyRequirements.set(server.id, {
              name: server.name,
              package: server.package,
              keys: requiredKeys
            });
          }
        }
      }
      
      console.log(`Found ${this.apiKeyRequirements.size} servers requiring API keys`);
    } catch (error) {
      console.error('Error scanning catalog:', error);
    }
  }

  /**
   * Check if a variable name looks like an API key
   */
  isApiKeyVariable(varName) {
    const patterns = [
      /_KEY$/i,
      /_TOKEN$/i,
      /_SECRET$/i,
      /_PASSWORD$/i,
      /_CLIENT_ID$/i,
      /_CLIENT_SECRET$/i,
      /_ACCESS_KEY$/i,
      /_AUTH$/i,
      /_CREDENTIALS$/i
    ];
    
    return patterns.some(pattern => pattern.test(varName));
  }

  /**
   * Get the type of API key based on variable name
   */
  getKeyType(varName) {
    if (/_KEY$/i.test(varName)) return 'api_key';
    if (/_TOKEN$/i.test(varName)) return 'token';
    if (/_SECRET$/i.test(varName)) return 'secret';
    if (/_CLIENT_ID$/i.test(varName)) return 'client_id';
    if (/_CLIENT_SECRET$/i.test(varName)) return 'client_secret';
    if (/_PASSWORD$/i.test(varName)) return 'password';
    if (/_URL$/i.test(varName) || /_HOST$/i.test(varName)) return 'url';
    if (/_DOMAIN$/i.test(varName)) return 'domain';
    if (/_REGION$/i.test(varName)) return 'region';
    if (/_USERNAME$/i.test(varName) || /_EMAIL$/i.test(varName)) return 'username';
    return 'credential';
  }

  /**
   * Get human-readable description for an API key
   */
  getKeyDescription(serverId, keyName) {
    const descriptions = {
      // Search services
      'BRAVE_API_KEY': 'Brave Search API key for web search',
      'TAVILY_API_KEY': 'Tavily API key for advanced search',
      'SERPER_API_KEY': 'Serper API key for Google search results',
      'EXA_API_KEY': 'Exa API key for neural search',
      
      // Cloud providers
      'AWS_ACCESS_KEY_ID': 'AWS access key ID',
      'AWS_SECRET_ACCESS_KEY': 'AWS secret access key',
      'AWS_REGION': 'AWS region (e.g., us-east-1)',
      'AZURE_SUBSCRIPTION_ID': 'Azure subscription ID',
      'AZURE_TENANT_ID': 'Azure tenant ID',
      'AZURE_CLIENT_ID': 'Azure app client ID',
      'AZURE_CLIENT_SECRET': 'Azure app client secret',
      'GOOGLE_CLIENT_ID': 'Google OAuth client ID',
      'GOOGLE_CLIENT_SECRET': 'Google OAuth client secret',
      'GOOGLE_MAPS_API_KEY': 'Google Maps API key',
      
      // Development platforms
      'GITHUB_PERSONAL_ACCESS_TOKEN': 'GitHub personal access token',
      'GITLAB_PERSONAL_ACCESS_TOKEN': 'GitLab personal access token',
      'GITLAB_API_URL': 'GitLab API URL (default: https://gitlab.com/api/v4)',
      
      // Communication platforms
      'SLACK_BOT_TOKEN': 'Slack bot token (xoxb-...)',
      'SLACK_TEAM_ID': 'Slack team/workspace ID',
      'DISCORD_BOT_TOKEN': 'Discord bot token',
      'TWILIO_ACCOUNT_SID': 'Twilio account SID',
      'TWILIO_AUTH_TOKEN': 'Twilio auth token',
      'SENDGRID_API_KEY': 'SendGrid API key for email',
      'MAILGUN_API_KEY': 'Mailgun API key',
      'MAILGUN_DOMAIN': 'Mailgun domain',
      
      // Project management
      'NOTION_API_KEY': 'Notion integration token',
      'ASANA_ACCESS_TOKEN': 'Asana personal access token',
      'TRELLO_API_KEY': 'Trello API key',
      'TRELLO_TOKEN': 'Trello user token',
      'JIRA_HOST': 'Jira instance URL (e.g., yourcompany.atlassian.net)',
      'JIRA_EMAIL': 'Jira account email',
      'JIRA_API_TOKEN': 'Jira API token',
      'CONFLUENCE_HOST': 'Confluence instance URL',
      'CONFLUENCE_EMAIL': 'Confluence account email',
      'CONFLUENCE_API_TOKEN': 'Confluence API token',
      'LINEAR_API_KEY': 'Linear API key',
      
      // Hosting/deployment
      'VERCEL_TOKEN': 'Vercel API token',
      'NETLIFY_AUTH_TOKEN': 'Netlify access token',
      'HEROKU_API_KEY': 'Heroku API key',
      'CLOUDFLARE_API_TOKEN': 'Cloudflare API token',
      'DIGITALOCEAN_TOKEN': 'DigitalOcean API token',
      'LINODE_TOKEN': 'Linode API token',
      'VULTR_API_KEY': 'Vultr API key',
      
      // Payment/commerce
      'STRIPE_SECRET_KEY': 'Stripe secret key (sk_...)',
      'PAYPAL_CLIENT_ID': 'PayPal app client ID',
      'PAYPAL_CLIENT_SECRET': 'PayPal app client secret',
      
      // Monitoring/analytics
      'SENTRY_AUTH_TOKEN': 'Sentry authentication token',
      'SENTRY_ORG': 'Sentry organization slug',
      'DATADOG_API_KEY': 'Datadog API key',
      'DATADOG_APP_KEY': 'Datadog application key',
      'NEWRELIC_API_KEY': 'New Relic API key',
      'BROWSERSTACK_USERNAME': 'BrowserStack username',
      'BROWSERSTACK_ACCESS_KEY': 'BrowserStack access key',
      
      // Design tools
      'FIGMA_ACCESS_TOKEN': 'Figma personal access token',
      'ADOBE_CLIENT_ID': 'Adobe Creative Cloud client ID',
      'ADOBE_CLIENT_SECRET': 'Adobe Creative Cloud client secret',
      'CANVA_API_KEY': 'Canva API key',
      
      // Security/secrets
      'VAULT_ADDR': 'HashiCorp Vault address',
      'VAULT_TOKEN': 'HashiCorp Vault token',
      'OP_CONNECT_HOST': '1Password Connect server URL',
      'OP_CONNECT_TOKEN': '1Password Connect token',
      'SONARQUBE_URL': 'SonarQube server URL',
      'SONARQUBE_TOKEN': 'SonarQube token',
      'ZAP_API_KEY': 'OWASP ZAP API key',
      
      // Databases
      'ELASTICSEARCH_URL': 'Elasticsearch URL',
      'ELASTICSEARCH_API_KEY': 'Elasticsearch API key',
      'CASSANDRA_CONTACT_POINTS': 'Cassandra contact points',
      'CASSANDRA_KEYSPACE': 'Cassandra keyspace',
      
      // Other
      'YOUTUBE_API_KEY': 'YouTube Data API key',
      'MS365_CLIENT_ID': 'Microsoft 365 app client ID',
      'MS365_CLIENT_SECRET': 'Microsoft 365 app client secret',
      'MS365_TENANT_ID': 'Microsoft 365 tenant ID',
      'VAULT_PATH': 'Path to Obsidian vault'
    };
    
    return descriptions[keyName] || `${keyName} for ${serverId}`;
  }

  /**
   * Load existing API keys from environment
   */
  loadExistingKeys() {
    for (const [serverId, requirements] of this.apiKeyRequirements) {
      const serverKeys = {};
      let hasKeys = false;
      
      for (const keyName of Object.keys(requirements.keys)) {
        const value = this.envLoader.envVars[keyName] || 
                     this.envLoader.envVars[`MCP_${keyName}`] ||
                     this.envLoader.envVars[`${serverId.toUpperCase()}_${keyName}`];
        
        if (value) {
          serverKeys[keyName] = value;
          hasKeys = true;
        }
      }
      
      if (hasKeys) {
        this.loadedKeys.set(serverId, serverKeys);
      }
    }
  }

  /**
   * Get all servers that require API keys
   */
  getRequiredServers() {
    const servers = [];
    
    for (const [serverId, requirements] of this.apiKeyRequirements) {
      const loadedKeys = this.loadedKeys.get(serverId) || {};
      const missingKeys = [];
      const configuredKeys = [];
      
      for (const [keyName, keyInfo] of Object.entries(requirements.keys)) {
        if (loadedKeys[keyName]) {
          configuredKeys.push(keyName);
        } else {
          missingKeys.push(keyName);
        }
      }
      
      servers.push({
        id: serverId,
        name: requirements.name,
        package: requirements.package,
        totalKeys: Object.keys(requirements.keys).length,
        configuredKeys: configuredKeys.length,
        missingKeys: missingKeys.length,
        status: missingKeys.length === 0 ? 'configured' : 
                configuredKeys.length > 0 ? 'partial' : 'missing',
        keys: requirements.keys,
        configured: loadedKeys,
        missing: missingKeys
      });
    }
    
    // Sort by status: missing first, then partial, then configured
    servers.sort((a, b) => {
      const statusOrder = { missing: 0, partial: 1, configured: 2 };
      return statusOrder[a.status] - statusOrder[b.status];
    });
    
    return servers;
  }

  /**
   * Get API key status for a specific server
   */
  getServerKeyStatus(serverId) {
    const requirements = this.apiKeyRequirements.get(serverId);
    if (!requirements) {
      return { hasRequirements: false };
    }
    
    const loadedKeys = this.loadedKeys.get(serverId) || {};
    const missingKeys = [];
    
    for (const keyName of Object.keys(requirements.keys)) {
      if (!loadedKeys[keyName]) {
        missingKeys.push(keyName);
      }
    }
    
    return {
      hasRequirements: true,
      totalRequired: Object.keys(requirements.keys).length,
      configured: Object.keys(loadedKeys).length,
      missing: missingKeys.length,
      missingKeys: missingKeys,
      status: missingKeys.length === 0 ? 'configured' : 
              Object.keys(loadedKeys).length > 0 ? 'partial' : 'missing'
    };
  }

  /**
   * Save API keys for a server
   */
  async saveServerKeys(serverId, keys) {
    // Update loaded keys
    const existingKeys = this.loadedKeys.get(serverId) || {};
    const updatedKeys = { ...existingKeys, ...keys };
    this.loadedKeys.set(serverId, updatedKeys);
    
    // Update environment variables
    for (const [key, value] of Object.entries(keys)) {
      if (value) {
        this.envLoader.envVars[key] = value;
      }
    }
    
    // Save to .env file
    return this.envLoader.save(this.envLoader.envVars);
  }

  /**
   * Get environment variables for a server including API keys
   */
  getServerEnvironment(serverId) {
    const loadedKeys = this.loadedKeys.get(serverId) || {};
    return loadedKeys;
  }

  /**
   * Get summary statistics
   */
  getStats() {
    const servers = this.getRequiredServers();
    
    return {
      totalServers: servers.length,
      configured: servers.filter(s => s.status === 'configured').length,
      partial: servers.filter(s => s.status === 'partial').length,
      missing: servers.filter(s => s.status === 'missing').length,
      totalKeys: servers.reduce((sum, s) => sum + s.totalKeys, 0),
      configuredKeys: servers.reduce((sum, s) => sum + s.configuredKeys, 0),
      missingKeys: servers.reduce((sum, s) => sum + s.missingKeys, 0)
    };
  }

  /**
   * Check if a new server needs API keys (for dynamic discovery)
   */
  async checkServerRequirements(serverConfig) {
    const requirements = {};
    
    if (serverConfig.environment) {
      for (const [key, value] of Object.entries(serverConfig.environment)) {
        if (value === '' || this.isApiKeyVariable(key)) {
          requirements[key] = {
            type: this.getKeyType(key),
            required: true,
            description: this.getKeyDescription(serverConfig.id || 'unknown', key)
          };
        }
      }
    }
    
    return {
      hasRequirements: Object.keys(requirements).length > 0,
      requirements: requirements
    };
  }
}

module.exports = ApiKeyManager;