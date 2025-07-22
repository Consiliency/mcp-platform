/**
 * Azure Deployment Module Tests
 */

const AzureDeployment = require('../azure/deployment');

describe('AzureDeployment', () => {
  let azureDeployment;
  
  beforeEach(() => {
    azureDeployment = new AzureDeployment();
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      expect(azureDeployment.subscriptionId).toBe('');
      expect(azureDeployment.location).toBe('eastus');
      expect(azureDeployment.resourceGroup).toBe('');
      expect(azureDeployment.armTemplates).toEqual({});
      expect(azureDeployment.containerGroups).toEqual([]);
    });

    it('should use environment variables when available', () => {
      process.env.AZURE_SUBSCRIPTION_ID = '12345678-1234-1234-1234-123456789012';
      process.env.AZURE_LOCATION = 'westeurope';
      process.env.AZURE_RESOURCE_GROUP = 'my-rg';
      
      const deployment = new AzureDeployment();
      expect(deployment.subscriptionId).toBe('12345678-1234-1234-1234-123456789012');
      expect(deployment.location).toBe('westeurope');
      expect(deployment.resourceGroup).toBe('my-rg');
      
      delete process.env.AZURE_SUBSCRIPTION_ID;
      delete process.env.AZURE_LOCATION;
      delete process.env.AZURE_RESOURCE_GROUP;
    });
  });

  describe('configureContainerInstances', () => {
    it('should create valid container instance configuration', async () => {
      const config = {
        name: 'test-container',
        image: 'mcr.microsoft.com/azuredocs/aci-helloworld:latest',
        memory: 1.5,
        cpu: 1,
        environment: {
          NODE_ENV: 'production',
          API_KEY: 'test-key'
        }
      };

      const containerGroup = await azureDeployment.configureContainerInstances(config);
      
      expect(containerGroup.type).toBe('Microsoft.ContainerInstance/containerGroups');
      expect(containerGroup.name).toBe('test-container');
      expect(containerGroup.properties.containers[0].name).toBe('test-container');
      expect(containerGroup.properties.containers[0].properties.image).toBe('mcr.microsoft.com/azuredocs/aci-helloworld:latest');
      expect(containerGroup.properties.containers[0].properties.resources.requests.cpu).toBe(1);
      expect(containerGroup.properties.containers[0].properties.resources.requests.memoryInGB).toBe(1.5);
      expect(azureDeployment.containerGroups).toHaveLength(1);
    });

    it('should throw error for invalid configuration', async () => {
      await expect(azureDeployment.configureContainerInstances(null))
        .rejects.toThrow('Invalid configuration provided');
      
      await expect(azureDeployment.configureContainerInstances({}))
        .rejects.toThrow('Missing required field: name');
    });

    it('should handle secure environment variables', async () => {
      const config = {
        name: 'secure-container',
        image: 'secure:latest',
        memory: 1,
        cpu: 1,
        environment: {
          PUBLIC_VAR: 'public-value',
          SECRET_VAR: { secure: true, value: 'secret-value' }
        }
      };

      const containerGroup = await azureDeployment.configureContainerInstances(config);
      const envVars = containerGroup.properties.containers[0].properties.environmentVariables;
      
      expect(envVars).toHaveLength(2);
      expect(envVars[0]).toEqual({ name: 'PUBLIC_VAR', value: 'public-value' });
      expect(envVars[1]).toEqual({ name: 'SECRET_VAR', secureValue: 'secret-value' });
    });

    it('should handle image registry credentials', async () => {
      const config = {
        name: 'private-container',
        image: 'myregistry.azurecr.io/private:latest',
        memory: 1,
        cpu: 1,
        imageRegistryCredentials: [
          {
            server: 'myregistry.azurecr.io',
            username: 'myusername',
            password: 'mypassword'
          }
        ]
      };

      const containerGroup = await azureDeployment.configureContainerInstances(config);
      expect(containerGroup.properties.imageRegistryCredentials).toHaveLength(1);
      expect(containerGroup.properties.imageRegistryCredentials[0].server).toBe('myregistry.azurecr.io');
    });

    it('should configure VNet integration', async () => {
      const config = {
        name: 'vnet-container',
        image: 'vnet:latest',
        memory: 2,
        cpu: 2,
        subnetId: '/subscriptions/sub-id/resourceGroups/rg/providers/Microsoft.Network/virtualNetworks/vnet/subnets/subnet'
      };

      const containerGroup = await azureDeployment.configureContainerInstances(config);
      expect(containerGroup.properties.subnetIds).toHaveLength(1);
      expect(containerGroup.properties.ipAddress.type).toBe('Private');
      expect(containerGroup.properties.ipAddress.dnsNameLabel).toBeUndefined();
    });

    it('should configure diagnostics', async () => {
      const config = {
        name: 'monitored-container',
        image: 'monitored:latest',
        memory: 1,
        cpu: 1,
        diagnostics: {
          workspaceId: 'workspace-id',
          workspaceKey: 'workspace-key',
          logType: 'ContainerInsights'
        }
      };

      const containerGroup = await azureDeployment.configureContainerInstances(config);
      expect(containerGroup.properties.diagnostics.logAnalytics.workspaceId).toBe('workspace-id');
      expect(containerGroup.properties.diagnostics.logAnalytics.logType).toBe('ContainerInsights');
    });

    it('should configure managed identity', async () => {
      const config = {
        name: 'identity-container',
        image: 'identity:latest',
        memory: 1,
        cpu: 1,
        managedIdentity: true
      };

      const containerGroup = await azureDeployment.configureContainerInstances(config);
      expect(containerGroup.identity).toEqual({ type: 'SystemAssigned' });
    });
  });

  describe('generateARMTemplates', () => {
    it('should generate valid ARM template', async () => {
      const resources = {
        containerGroups: [
          {
            name: 'web-app',
            image: 'web:latest',
            memory: 1,
            cpu: 1
          }
        ],
        networking: {
          addressSpace: '10.0.0.0/16',
          subnetPrefix: '10.0.1.0/24'
        }
      };

      const template = await azureDeployment.generateARMTemplates(resources);
      
      expect(template.$schema).toBe('https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#');
      expect(template.contentVersion).toBe('1.0.0.0');
      expect(template.parameters).toHaveProperty('location');
      expect(template.parameters).toHaveProperty('environment');
      expect(template.resources).toHaveLength(2); // VNet + Container Group
      expect(azureDeployment.armTemplates.main).toBe(template);
    });

    it('should throw error for invalid resources', async () => {
      await expect(azureDeployment.generateARMTemplates(null))
        .rejects.toThrow('Invalid resources configuration');
    });

    it('should generate load balancer resources', async () => {
      const resources = {
        containerGroups: [
          {
            name: 'api',
            image: 'api:latest',
            memory: 2,
            cpu: 1,
            ports: [{ port: 8080, protocol: 'TCP' }]
          }
        ],
        loadBalancer: {
          sku: 'Standard_v2',
          capacity: 3,
          wafEnabled: true
        }
      };

      const template = await azureDeployment.generateARMTemplates(resources);
      
      const publicIpResource = template.resources.find(r => r.type === 'Microsoft.Network/publicIPAddresses');
      const appGatewayResource = template.resources.find(r => r.type === 'Microsoft.Network/applicationGateways');
      
      expect(publicIpResource).toBeDefined();
      expect(appGatewayResource).toBeDefined();
      expect(appGatewayResource.properties.sku.capacity).toBe(3);
      expect(appGatewayResource.properties.webApplicationFirewallConfiguration.enabled).toBe(true);
    });

    it('should generate monitoring resources', async () => {
      const resources = {
        containerGroups: [],
        monitoring: {
          retentionDays: 60
        }
      };

      const template = await azureDeployment.generateARMTemplates(resources);
      
      const workspaceResource = template.resources.find(r => r.type === 'Microsoft.OperationalInsights/workspaces');
      expect(workspaceResource).toBeDefined();
      expect(workspaceResource.properties.retentionInDays).toBe(60);
    });

    it('should handle container groups with networking', async () => {
      const resources = {
        containerGroups: [
          {
            name: 'private-api',
            image: 'api:latest',
            memory: 2,
            cpu: 2
          }
        ],
        networking: {
          addressSpace: '172.16.0.0/16'
        }
      };

      const template = await azureDeployment.generateARMTemplates(resources);
      
      const containerResource = template.resources.find(r => r.name === 'private-api');
      expect(containerResource.properties.subnetIds).toBeDefined();
      expect(containerResource.dependsOn).toContain("[resourceId('Microsoft.Network/virtualNetworks', variables('vnetName'))]");
    });
  });

  describe('setupNetworkSecurityGroups', () => {
    it('should create NSG with security rules', async () => {
      const rules = [
        {
          name: 'AllowHTTP',
          direction: 'Inbound',
          access: 'Allow',
          protocol: 'Tcp',
          sourceAddressPrefix: '*',
          destinationPortRange: '80'
        },
        {
          name: 'AllowHTTPS',
          direction: 'Inbound',
          access: 'Allow',
          protocol: 'Tcp',
          sourceAddressPrefix: '*',
          destinationPortRange: '443'
        }
      ];

      const nsg = await azureDeployment.setupNetworkSecurityGroups(rules);
      
      expect(nsg.type).toBe('Microsoft.Network/networkSecurityGroups');
      expect(nsg.properties.securityRules).toHaveLength(3); // 2 custom + 1 default deny
      expect(nsg.properties.securityRules[0].name).toBe('AllowHTTP');
      expect(nsg.properties.securityRules[0].properties.priority).toBe(100);
    });

    it('should throw error for invalid rules', async () => {
      await expect(azureDeployment.setupNetworkSecurityGroups(null))
        .rejects.toThrow('NSG rules must be a non-empty array');
      
      await expect(azureDeployment.setupNetworkSecurityGroups([{}]))
        .rejects.toThrow('Each NSG rule must have name, direction, and access');
    });

    it('should handle service tags', async () => {
      const rules = [
        {
          name: 'AllowAzureLoadBalancer',
          direction: 'Inbound',
          access: 'Allow',
          sourceServiceTag: 'AzureLoadBalancer',
          destinationPortRange: '*'
        }
      ];

      const nsg = await azureDeployment.setupNetworkSecurityGroups(rules);
      expect(nsg.properties.securityRules[0].properties.sourceAddressPrefix).toBe('AzureLoadBalancer');
    });

    it('should handle multiple address prefixes', async () => {
      const rules = [
        {
          name: 'AllowMultipleSubnets',
          direction: 'Inbound',
          access: 'Allow',
          sourceAddressPrefixes: ['10.0.1.0/24', '10.0.2.0/24'],
          destinationAddressPrefixes: ['172.16.1.0/24', '172.16.2.0/24'],
          destinationPortRange: '3389'
        }
      ];

      const nsg = await azureDeployment.setupNetworkSecurityGroups(rules);
      expect(nsg.properties.securityRules[0].properties.sourceAddressPrefixes).toHaveLength(2);
      expect(nsg.properties.securityRules[0].properties.destinationAddressPrefixes).toHaveLength(2);
    });

    it('should add NSG to ARM template if exists', async () => {
      // First create an ARM template
      await azureDeployment.generateARMTemplates({ containerGroups: [] });
      
      const rules = [
        {
          name: 'TestRule',
          direction: 'Inbound',
          access: 'Allow'
        }
      ];

      await azureDeployment.setupNetworkSecurityGroups(rules);
      
      const nsgResource = azureDeployment.armTemplates.main.resources.find(
        r => r.type === 'Microsoft.Network/networkSecurityGroups'
      );
      expect(nsgResource).toBeDefined();
    });
  });

  describe('deploy', () => {
    beforeEach(async () => {
      // Configure some container groups first
      await azureDeployment.configureContainerInstances({
        name: 'test-container',
        image: 'test:latest',
        memory: 1,
        cpu: 1
      });
    });

    it('should create deployment manifest', async () => {
      const environment = {
        name: 'production',
        subscriptionId: '12345678-1234-1234-1234-123456789012',
        resourceGroup: 'mcp-prod-rg',
        location: 'eastus',
        tenantId: 'tenant-123',
        monitoring: {
          workspaceName: 'mcp-logs',
          alerts: ['cpu-alert', 'memory-alert']
        }
      };

      const manifest = await azureDeployment.deploy(environment);
      
      expect(manifest.deployment.environment).toBe('production');
      expect(manifest.deployment.subscriptionId).toBe('12345678-1234-1234-1234-123456789012');
      expect(manifest.deployment.status).toBe('deployed');
      expect(manifest.infrastructure.containerGroups).toHaveLength(1);
      expect(manifest.infrastructure.containerGroups[0].url).toContain('http://test-container.eastus.azurecontainer.io');
      expect(manifest.monitoring.portalUrl).toContain('portal.azure.com');
    });

    it('should throw error for invalid environment', async () => {
      await expect(azureDeployment.deploy(null))
        .rejects.toThrow('Invalid environment configuration');
      
      await expect(azureDeployment.deploy({ name: 'prod' }))
        .rejects.toThrow('Environment must have name, subscriptionId, and resourceGroup');
    });

    it('should handle deployment without monitoring', async () => {
      const environment = {
        name: 'staging',
        subscriptionId: 'sub-123',
        resourceGroup: 'staging-rg'
      };

      const manifest = await azureDeployment.deploy(environment);
      expect(manifest.monitoring.logAnalytics).toBeNull();
    });

    it('should include load balancer configuration', async () => {
      const environment = {
        name: 'prod',
        subscriptionId: 'sub-123',
        resourceGroup: 'prod-rg',
        loadBalancer: {
          enabled: true
        }
      };

      const manifest = await azureDeployment.deploy(environment);
      expect(manifest.infrastructure.loadBalancer).toBeDefined();
      expect(manifest.infrastructure.loadBalancer.name).toBe('mcp-prod-appgw');
      expect(manifest.infrastructure.loadBalancer.url).toContain('mcp-prod.eastus.cloudapp.azure.com');
    });

    it('should include ARM template in manifest', async () => {
      azureDeployment.armTemplates.main = {
        $schema: 'test-schema',
        resources: []
      };

      const environment = {
        name: 'dev',
        subscriptionId: 'sub-123',
        resourceGroup: 'dev-rg'
      };

      const manifest = await azureDeployment.deploy(environment);
      expect(manifest.armTemplate).toBeDefined();
      expect(manifest.armTemplate.$schema).toBe('test-schema');
    });
  });

  describe('helper methods', () => {
    it('should format environment variables with secure values', () => {
      const envVars = {
        PUBLIC_VAR: 'public',
        SECRET_VAR: { secure: true, value: 'secret' },
        NUMBER_VAR: 123,
        BOOL_VAR: true
      };

      const formatted = azureDeployment._formatEnvironmentVariables(envVars);
      
      expect(formatted).toHaveLength(4);
      expect(formatted[0]).toEqual({ name: 'PUBLIC_VAR', value: 'public' });
      expect(formatted[1]).toEqual({ name: 'SECRET_VAR', secureValue: 'secret' });
      expect(formatted[2]).toEqual({ name: 'NUMBER_VAR', value: '123' });
      expect(formatted[3]).toEqual({ name: 'BOOL_VAR', value: 'true' });
    });

    it('should handle empty environment variables', () => {
      const formatted = azureDeployment._formatEnvironmentVariables({});
      expect(formatted).toEqual([]);
    });
  });
});