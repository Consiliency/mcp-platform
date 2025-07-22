/**
 * Cloud Deployment Module Integration Tests
 */

const AWSDeployment = require('../aws/deployment');
const GCPDeployment = require('../gcp/deployment');
const AzureDeployment = require('../azure/deployment');

describe('Cloud Deployment Integration', () => {
  describe('Module Exports', () => {
    it('should export AWS deployment class', () => {
      expect(AWSDeployment).toBeDefined();
      expect(typeof AWSDeployment).toBe('function');
      const aws = new AWSDeployment();
      expect(aws).toBeInstanceOf(AWSDeployment);
    });

    it('should export GCP deployment class', () => {
      expect(GCPDeployment).toBeDefined();
      expect(typeof GCPDeployment).toBe('function');
      const gcp = new GCPDeployment();
      expect(gcp).toBeInstanceOf(GCPDeployment);
    });

    it('should export Azure deployment class', () => {
      expect(AzureDeployment).toBeDefined();
      expect(typeof AzureDeployment).toBe('function');
      const azure = new AzureDeployment();
      expect(azure).toBeInstanceOf(AzureDeployment);
    });
  });

  describe('Common Interface', () => {
    let aws, gcp, azure;

    beforeEach(() => {
      aws = new AWSDeployment();
      gcp = new GCPDeployment();
      azure = new AzureDeployment();
    });

    it('all modules should have deploy method', () => {
      expect(typeof aws.deploy).toBe('function');
      expect(typeof gcp.deploy).toBe('function');
      expect(typeof azure.deploy).toBe('function');
    });

    it('all modules should handle environment configuration', async () => {
      const invalidEnv = null;
      
      await expect(aws.deploy(invalidEnv)).rejects.toThrow('Invalid environment configuration');
      await expect(gcp.deploy(invalidEnv)).rejects.toThrow('Invalid environment configuration');
      await expect(azure.deploy(invalidEnv)).rejects.toThrow('Invalid environment configuration');
    });
  });

  describe('Cross-Cloud Deployment Scenarios', () => {
    it('should support multi-cloud deployment configuration', async () => {
      const aws = new AWSDeployment();
      const gcp = new GCPDeployment();
      const azure = new AzureDeployment();

      // Configure same service across clouds
      const serviceConfig = {
        name: 'mcp-api',
        image: 'mcp/api:latest',
        memory: '1024', // AWS format
        cpu: '512'
      };

      // AWS configuration
      const awsTaskDef = await aws.createECSTaskDefinition(serviceConfig);
      expect(awsTaskDef.family).toBe('mcp-api');

      // GCP configuration (adjust memory format)
      const gcpConfig = { ...serviceConfig, memory: '1Gi', cpu: '0.5' };
      const gcpService = await gcp.configureCloudRun(gcpConfig);
      expect(gcpService.metadata.name).toBe('mcp-api');

      // Azure configuration (adjust memory to number)
      const azureConfig = { ...serviceConfig, memory: 1, cpu: 0.5 };
      const azureContainer = await azure.configureContainerInstances(azureConfig);
      expect(azureContainer.name).toBe('mcp-api');
    });

    it('should generate deployment manifests for all clouds', async () => {
      const aws = new AWSDeployment();
      const gcp = new GCPDeployment();
      const azure = new AzureDeployment();

      const environments = {
        aws: {
          name: 'production',
          region: 'us-east-1'
        },
        gcp: {
          name: 'production',
          projectId: 'mcp-prod'
        },
        azure: {
          name: 'production',
          subscriptionId: 'sub-123',
          resourceGroup: 'mcp-prod-rg'
        }
      };

      // Generate manifests
      const awsManifest = await aws.deploy(environments.aws);
      const gcpManifest = await gcp.deploy(environments.gcp);
      const azureManifest = await azure.deploy(environments.azure);

      // Verify all manifests have common structure
      [awsManifest, gcpManifest, azureManifest].forEach(manifest => {
        expect(manifest).toHaveProperty('deployment');
        expect(manifest).toHaveProperty('infrastructure');
        expect(manifest.deployment.environment).toBe('production');
        expect(manifest.deployment.status).toBe('deployed');
      });
    });
  });

  describe('Error Handling', () => {
    it('should provide consistent error messages across clouds', async () => {
      const aws = new AWSDeployment();
      const gcp = new GCPDeployment();
      const azure = new AzureDeployment();

      // Test missing required fields
      const invalidConfig = { image: 'test:latest' }; // Missing name, cpu, memory

      await expect(aws.createECSTaskDefinition(invalidConfig))
        .rejects.toThrow('Missing required field: name');
      
      await expect(gcp.configureCloudRun(invalidConfig))
        .rejects.toThrow('Missing required field: name');
      
      await expect(azure.configureContainerInstances(invalidConfig))
        .rejects.toThrow('Missing required field: name');
    });
  });

  describe('Environment Variables', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should respect cloud-specific environment variables', () => {
      process.env.AWS_REGION = 'eu-central-1';
      process.env.GCP_REGION = 'europe-west1';
      process.env.AZURE_LOCATION = 'westeurope';

      const aws = new AWSDeployment();
      const gcp = new GCPDeployment();
      const azure = new AzureDeployment();

      expect(aws.region).toBe('eu-central-1');
      expect(gcp.region).toBe('europe-west1');
      expect(azure.location).toBe('westeurope');
    });
  });
});