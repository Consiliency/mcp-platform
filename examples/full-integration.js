/**
 * Full Integration Example
 * Shows how the SDK works with IDE, CLI, and CI/CD
 */

const MCPClient = require('../sdk/js');

// Example 1: IDE Extension using SDK
class IDEIntegration {
  constructor() {
    this.sdk = new MCPClient({
      apiKey: process.env.MCP_API_KEY,
      tenantId: 'ide-tenant'
    });
  }

  async initialize() {
    // Authenticate
    await this.sdk.connect(process.env.MCP_API_KEY);
    
    // Listen for service events
    this.sdk.on('service.installed', (event) => {
      console.log(`[IDE] Service ${event.serviceId} installed`);
      // Update IDE UI to show new service
    });
    
    this.sdk.on('service.error', (event) => {
      console.error(`[IDE] Service error: ${event.error}`);
      // Show error in IDE notifications
    });
  }

  async getServiceCompletions(prefix) {
    // Get available services for code completion
    const services = await this.sdk.listServices({});
    return services
      .filter(s => s.id.startsWith(prefix))
      .map(s => ({
        label: s.id,
        kind: 'Service',
        detail: s.description
      }));
  }

  async validateServiceConfig(serviceId, config) {
    // Validate configuration against service schema
    try {
      const service = await this.sdk.getService(serviceId);
      // Validate config against service.config schema
      return { valid: true };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }
}

// Example 2: CLI Plugin using SDK
class CLIPlugin {
  constructor(sdk) {
    this.sdk = sdk;
  }

  async executeCommand(command, args) {
    switch (command) {
      case 'install':
        return await this.installService(args);
      case 'list':
        return await this.listServices(args);
      case 'health':
        return await this.checkHealth(args);
      default:
        throw new Error(`Unknown command: ${command}`);
    }
  }

  async installService(args) {
    const { service, config } = args;
    console.log(`Installing ${service}...`);
    
    const result = await this.sdk.installService(service, config);
    if (result.success) {
      console.log(`✓ ${result.message}`);
      
      // Connect to the service
      const serviceProxy = await this.sdk.connectService(service);
      console.log(`✓ Connected to ${service}`);
      
      return serviceProxy;
    } else {
      console.error(`✗ ${result.message}`);
      throw new Error(result.message);
    }
  }

  async listServices(args) {
    const services = await this.sdk.listServices(args.filters);
    console.log(`Found ${services.length} services:`);
    
    services.forEach(service => {
      const status = service.installed ? '✓ installed' : '  available';
      console.log(`${status} ${service.id} - ${service.description}`);
    });
    
    return services;
  }

  async checkHealth(args) {
    const health = await this.sdk.getHealth(args.service);
    console.log(`Health Status: ${health.status}`);
    console.log('Details:', JSON.stringify(health.details, null, 2));
    return health;
  }
}

// Example 3: CI/CD Integration
class CICDIntegration {
  constructor() {
    this.sdk = new MCPClient({
      apiKey: process.env.CI_MCP_KEY,
      tenantId: 'ci-tenant'
    });
  }

  async deploymentPipeline() {
    console.log('[CI/CD] Starting deployment pipeline...');
    
    // Authenticate
    await this.sdk.connect(process.env.CI_MCP_KEY);
    
    // Install required services
    const requiredServices = ['postgres-mcp', 'redis-mcp', 'api-gateway'];
    
    for (const serviceId of requiredServices) {
      console.log(`[CI/CD] Installing ${serviceId}...`);
      const result = await this.sdk.installService(serviceId, {
        environment: 'production',
        region: 'us-east-1'
      });
      
      if (!result.success) {
        throw new Error(`Failed to install ${serviceId}: ${result.message}`);
      }
    }
    
    // Health check all services
    console.log('[CI/CD] Running health checks...');
    for (const serviceId of requiredServices) {
      const health = await this.sdk.getHealth(serviceId);
      if (health.status !== 'healthy') {
        throw new Error(`Service ${serviceId} is not healthy`);
      }
    }
    
    console.log('[CI/CD] All services deployed and healthy!');
    return true;
  }
}

// Example 4: Full Application using SDK
async function runFullExample() {
  console.log('=== MCP SDK Full Integration Example ===\n');
  
  // 1. IDE Integration
  console.log('1. IDE Extension Integration:');
  const ide = new IDEIntegration();
  await ide.initialize();
  
  const completions = await ide.getServiceCompletions('post');
  console.log('Code completions for "post":', completions);
  
  // 2. CLI Plugin
  console.log('\n2. CLI Plugin Integration:');
  const client = new MCPClient({ apiKey: 'test-key' });
  await client.connect('test-key');
  
  const cli = new CLIPlugin(client);
  await cli.listServices({ filters: { category: 'database' } });
  
  // 3. Service Interaction
  console.log('\n3. Service Interaction:');
  const db = await client.connectService('postgres-mcp');
  
  // Call service method
  const result = await db.call('query', {
    sql: 'SELECT version()',
    timeout: 5000
  });
  console.log('Query result:', result);
  
  // 4. Event-driven monitoring
  console.log('\n4. Event Monitoring:');
  client.on('service.called', (event) => {
    console.log(`[Monitor] Called ${event.serviceId}.${event.method}`);
  });
  
  // 5. Health monitoring
  console.log('\n5. Health Monitoring:');
  const platformHealth = await client.getHealth();
  console.log('Platform health:', platformHealth);
  
  // 6. CI/CD Integration
  console.log('\n6. CI/CD Integration:');
  const cicd = new CICDIntegration();
  // await cicd.deploymentPipeline(); // Commented out for demo
  
  console.log('\n=== Example Complete ===');
}

// Export for testing
module.exports = {
  IDEIntegration,
  CLIPlugin,
  CICDIntegration,
  runFullExample
};

// Run if called directly
if (require.main === module) {
  runFullExample().catch(console.error);
}