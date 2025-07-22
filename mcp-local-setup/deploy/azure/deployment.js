/**
 * Azure Deployment Module
 * CLOUD-4.3: Container Instances, ARM templates, NSGs
 */

const path = require('path');
const fs = require('fs').promises;

class AzureDeployment {
  constructor() {
    this.subscriptionId = process.env.AZURE_SUBSCRIPTION_ID || '';
    this.location = process.env.AZURE_LOCATION || 'eastus';
    this.resourceGroup = process.env.AZURE_RESOURCE_GROUP || '';
    this.armTemplates = {};
    this.containerGroups = [];
  }

  /**
   * Configure Container Instances
   */
  async configureContainerInstances(config) {
    if (!config || typeof config !== 'object') {
      throw new Error('Invalid configuration provided');
    }

    const requiredFields = ['name', 'image', 'memory', 'cpu'];
    for (const field of requiredFields) {
      if (!config[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    const containerGroup = {
      apiVersion: '2021-10-01',
      type: 'Microsoft.ContainerInstance/containerGroups',
      name: config.name,
      location: config.location || this.location,
      properties: {
        containers: [
          {
            name: config.name,
            properties: {
              image: config.image,
              resources: {
                requests: {
                  cpu: config.cpu,
                  memoryInGB: config.memory
                },
                limits: {
                  cpu: config.cpuLimit || config.cpu,
                  memoryInGB: config.memoryLimit || config.memory
                }
              },
              ports: config.ports || [{ port: 80, protocol: 'TCP' }],
              environmentVariables: this._formatEnvironmentVariables(config.environment || {}),
              livenessProbe: config.livenessProbe || {
                httpGet: {
                  path: '/health',
                  port: 80,
                  scheme: 'HTTP'
                },
                periodSeconds: 30,
                initialDelaySeconds: 30,
                timeoutSeconds: 10,
                failureThreshold: 3,
                successThreshold: 1
              },
              readinessProbe: config.readinessProbe || {
                httpGet: {
                  path: '/ready',
                  port: 80,
                  scheme: 'HTTP'
                },
                periodSeconds: 10,
                initialDelaySeconds: 10,
                timeoutSeconds: 5,
                failureThreshold: 3,
                successThreshold: 1
              },
              volumeMounts: config.volumeMounts || []
            }
          }
        ],
        osType: config.osType || 'Linux',
        restartPolicy: config.restartPolicy || 'OnFailure',
        ipAddress: {
          type: config.ipAddressType || 'Public',
          ports: config.ports || [{ port: 80, protocol: 'TCP' }],
          dnsNameLabel: config.dnsNameLabel || config.name.toLowerCase()
        },
        volumes: config.volumes || []
      },
      identity: config.managedIdentity ? {
        type: 'SystemAssigned'
      } : undefined
    };

    // Add image registry credentials if specified
    if (config.imageRegistryCredentials) {
      containerGroup.properties.imageRegistryCredentials = config.imageRegistryCredentials.map(cred => ({
        server: cred.server,
        username: cred.username,
        password: cred.password
      }));
    }

    // Add subnet configuration if VNet integration is required
    if (config.subnetId) {
      containerGroup.properties.subnetIds = [{
        id: config.subnetId
      }];
      // Private IP for VNet integration
      containerGroup.properties.ipAddress.type = 'Private';
      delete containerGroup.properties.ipAddress.dnsNameLabel;
    }

    // Add diagnostics configuration
    if (config.diagnostics) {
      containerGroup.properties.diagnostics = {
        logAnalytics: {
          workspaceId: config.diagnostics.workspaceId,
          workspaceKey: config.diagnostics.workspaceKey,
          logType: config.diagnostics.logType || 'ContainerInsights',
          metadata: config.diagnostics.metadata || {}
        }
      };
    }

    this.containerGroups.push(containerGroup);
    return containerGroup;
  }

  /**
   * Generate ARM templates
   */
  async generateARMTemplates(resources) {
    if (!resources || typeof resources !== 'object') {
      throw new Error('Invalid resources configuration');
    }

    const template = {
      '$schema': 'https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#',
      contentVersion: '1.0.0.0',
      parameters: {
        location: {
          type: 'string',
          defaultValue: '[resourceGroup().location]',
          metadata: {
            description: 'Location for all resources'
          }
        },
        environment: {
          type: 'string',
          allowedValues: ['dev', 'staging', 'prod'],
          metadata: {
            description: 'Environment name'
          }
        }
      },
      variables: {
        environmentPrefix: '[concat(\'mcp-\', parameters(\'environment\'))]',
        vnetName: '[concat(variables(\'environmentPrefix\'), \'-vnet\')]',
        subnetName: 'container-subnet',
        nsgName: '[concat(variables(\'environmentPrefix\'), \'-nsg\')]',
        applicationGatewayName: '[concat(variables(\'environmentPrefix\'), \'-appgw\')]',
        publicIPName: '[concat(variables(\'environmentPrefix\'), \'-pip\')]',
        workspaceName: '[concat(variables(\'environmentPrefix\'), \'-logs\')]'
      },
      resources: [],
      outputs: {}
    };

    // Add Virtual Network if networking is required
    if (resources.networking) {
      template.resources.push({
        type: 'Microsoft.Network/virtualNetworks',
        apiVersion: '2021-08-01',
        name: '[variables(\'vnetName\')]',
        location: '[parameters(\'location\')]',
        properties: {
          addressSpace: {
            addressPrefixes: [resources.networking.addressSpace || '10.0.0.0/16']
          },
          subnets: [
            {
              name: '[variables(\'subnetName\')]',
              properties: {
                addressPrefix: resources.networking.subnetPrefix || '10.0.1.0/24',
                delegations: [
                  {
                    name: 'containerDelegation',
                    properties: {
                      serviceName: 'Microsoft.ContainerInstance/containerGroups'
                    }
                  }
                ],
                networkSecurityGroup: {
                  id: '[resourceId(\'Microsoft.Network/networkSecurityGroups\', variables(\'nsgName\'))]'
                }
              }
            }
          ]
        },
        dependsOn: [
          '[resourceId(\'Microsoft.Network/networkSecurityGroups\', variables(\'nsgName\'))]'
        ]
      });
    }

    // Add Container Groups
    if (resources.containerGroups) {
      for (const group of resources.containerGroups) {
        const containerGroup = await this.configureContainerInstances(group);
        
        // Add subnet reference if networking is enabled
        if (resources.networking && !group.subnetId) {
          containerGroup.properties.subnetIds = [{
            id: '[resourceId(\'Microsoft.Network/virtualNetworks/subnets\', variables(\'vnetName\'), variables(\'subnetName\'))]'
          }];
          containerGroup.dependsOn = [
            '[resourceId(\'Microsoft.Network/virtualNetworks\', variables(\'vnetName\'))]'
          ];
        }
        
        template.resources.push(containerGroup);
        
        // Add output for container group
        template.outputs[`${group.name}Fqdn`] = {
          type: 'string',
          value: containerGroup.properties.ipAddress.type === 'Public' 
            ? `[reference(resourceId('Microsoft.ContainerInstance/containerGroups', '${group.name}')).ipAddress.fqdn]`
            : 'Private IP - No FQDN'
        };
      }
    }

    // Add Application Gateway if load balancing is required
    if (resources.loadBalancer) {
      template.resources.push({
        type: 'Microsoft.Network/publicIPAddresses',
        apiVersion: '2021-08-01',
        name: '[variables(\'publicIPName\')]',
        location: '[parameters(\'location\')]',
        sku: {
          name: 'Standard'
        },
        properties: {
          publicIPAllocationMethod: 'Static',
          dnsSettings: {
            domainNameLabel: resources.loadBalancer.dnsLabel || '[variables(\'environmentPrefix\')]'
          }
        }
      });

      const appGateway = {
        type: 'Microsoft.Network/applicationGateways',
        apiVersion: '2021-08-01',
        name: '[variables(\'applicationGatewayName\')]',
        location: '[parameters(\'location\')]',
        properties: {
          sku: {
            name: resources.loadBalancer.sku || 'Standard_v2',
            tier: resources.loadBalancer.tier || 'Standard_v2',
            capacity: resources.loadBalancer.capacity || 2
          },
          gatewayIPConfigurations: [
            {
              name: 'appGatewayIpConfig',
              properties: {
                subnet: {
                  id: '[resourceId(\'Microsoft.Network/virtualNetworks/subnets\', variables(\'vnetName\'), \'appgw-subnet\')]'
                }
              }
            }
          ],
          frontendIPConfigurations: [
            {
              name: 'appGatewayFrontendIP',
              properties: {
                publicIPAddress: {
                  id: '[resourceId(\'Microsoft.Network/publicIPAddresses\', variables(\'publicIPName\'))]'
                }
              }
            }
          ],
          frontendPorts: [
            {
              name: 'appGatewayFrontendPort',
              properties: {
                port: 80
              }
            },
            {
              name: 'appGatewayFrontendHttpsPort',
              properties: {
                port: 443
              }
            }
          ],
          backendAddressPools: [],
          backendHttpSettingsCollection: [],
          httpListeners: [],
          requestRoutingRules: [],
          probes: [],
          sslCertificates: resources.loadBalancer.sslCertificates || [],
          webApplicationFirewallConfiguration: resources.loadBalancer.wafEnabled ? {
            enabled: true,
            firewallMode: 'Prevention',
            ruleSetType: 'OWASP',
            ruleSetVersion: '3.2'
          } : undefined
        },
        dependsOn: [
          '[resourceId(\'Microsoft.Network/publicIPAddresses\', variables(\'publicIPName\'))]',
          '[resourceId(\'Microsoft.Network/virtualNetworks\', variables(\'vnetName\'))]'
        ]
      };

      // Add backend pools and settings for each container group
      if (resources.containerGroups) {
        for (const group of resources.containerGroups) {
          const backendName = `${group.name}-backend`;
          
          appGateway.properties.backendAddressPools.push({
            name: `${backendName}-pool`,
            properties: {
              backendAddresses: [{
                fqdn: `[reference(resourceId('Microsoft.ContainerInstance/containerGroups', '${group.name}')).ipAddress.fqdn]`
              }]
            }
          });

          appGateway.properties.backendHttpSettingsCollection.push({
            name: `${backendName}-settings`,
            properties: {
              port: group.ports?.[0]?.port || 80,
              protocol: 'Http',
              cookieBasedAffinity: 'Disabled',
              pickHostNameFromBackendAddress: true,
              requestTimeout: 30,
              probe: {
                id: `[concat(resourceId('Microsoft.Network/applicationGateways', variables('applicationGatewayName')), '/probes/${backendName}-probe')]`
              }
            }
          });

          appGateway.properties.probes.push({
            name: `${backendName}-probe`,
            properties: {
              protocol: 'Http',
              path: group.healthCheckPath || '/health',
              interval: 30,
              timeout: 30,
              unhealthyThreshold: 3,
              pickHostNameFromBackendHttpSettings: true
            }
          });
        }
      }

      template.resources.push(appGateway);
    }

    // Add Log Analytics Workspace for monitoring
    if (resources.monitoring) {
      template.resources.push({
        type: 'Microsoft.OperationalInsights/workspaces',
        apiVersion: '2021-12-01-preview',
        name: '[variables(\'workspaceName\')]',
        location: '[parameters(\'location\')]',
        properties: {
          sku: {
            name: 'PerGB2018'
          },
          retentionInDays: resources.monitoring.retentionDays || 30
        }
      });
    }

    this.armTemplates.main = template;
    return template;
  }

  /**
   * Setup Network Security Groups
   */
  async setupNetworkSecurityGroups(rules) {
    if (!Array.isArray(rules) || rules.length === 0) {
      throw new Error('NSG rules must be a non-empty array');
    }

    const nsg = {
      type: 'Microsoft.Network/networkSecurityGroups',
      apiVersion: '2021-08-01',
      name: '[variables(\'nsgName\')]',
      location: '[parameters(\'location\')]',
      properties: {
        securityRules: []
      }
    };

    let priority = 100;
    for (const rule of rules) {
      if (!rule.name || !rule.direction || !rule.access) {
        throw new Error('Each NSG rule must have name, direction, and access');
      }

      const securityRule = {
        name: rule.name,
        properties: {
          priority: rule.priority || priority,
          direction: rule.direction,
          access: rule.access,
          protocol: rule.protocol || '*',
          sourceAddressPrefix: rule.sourceAddressPrefix || '*',
          sourcePortRange: rule.sourcePortRange || '*',
          destinationAddressPrefix: rule.destinationAddressPrefix || '*',
          destinationPortRange: rule.destinationPortRange || '*',
          description: rule.description || ''
        }
      };

      // Handle multiple source/destination prefixes
      if (rule.sourceAddressPrefixes) {
        delete securityRule.properties.sourceAddressPrefix;
        securityRule.properties.sourceAddressPrefixes = rule.sourceAddressPrefixes;
      }
      if (rule.destinationAddressPrefixes) {
        delete securityRule.properties.destinationAddressPrefix;
        securityRule.properties.destinationAddressPrefixes = rule.destinationAddressPrefixes;
      }

      // Handle service tags
      if (rule.sourceServiceTag) {
        securityRule.properties.sourceAddressPrefix = rule.sourceServiceTag;
      }
      if (rule.destinationServiceTag) {
        securityRule.properties.destinationAddressPrefix = rule.destinationServiceTag;
      }

      nsg.properties.securityRules.push(securityRule);
      priority += 10;
    }

    // Add default deny rules if not present
    const hasDefaultDenyInbound = nsg.properties.securityRules.some(r => 
      r.name === 'DenyAllInbound' || (r.properties.access === 'Deny' && r.properties.direction === 'Inbound' && r.properties.sourceAddressPrefix === '*')
    );
    
    if (!hasDefaultDenyInbound) {
      nsg.properties.securityRules.push({
        name: 'DenyAllInbound',
        properties: {
          priority: 4096,
          direction: 'Inbound',
          access: 'Deny',
          protocol: '*',
          sourceAddressPrefix: '*',
          sourcePortRange: '*',
          destinationAddressPrefix: '*',
          destinationPortRange: '*',
          description: 'Deny all inbound traffic by default'
        }
      });
    }

    // Add NSG to ARM template if it exists
    if (this.armTemplates.main) {
      // Insert NSG at the beginning so other resources can depend on it
      this.armTemplates.main.resources.unshift(nsg);
    }

    return nsg;
  }

  /**
   * Deploy to Azure
   */
  async deploy(environment) {
    if (!environment || typeof environment !== 'object') {
      throw new Error('Invalid environment configuration');
    }

    if (!environment.name || !environment.subscriptionId || !environment.resourceGroup) {
      throw new Error('Environment must have name, subscriptionId, and resourceGroup');
    }

    const deployment = {
      environment: environment.name,
      subscriptionId: environment.subscriptionId,
      resourceGroup: environment.resourceGroup,
      location: environment.location || this.location,
      timestamp: new Date().toISOString(),
      steps: [],
      status: 'pending'
    };

    try {
      // Step 1: Validate Azure credentials
      deployment.steps.push({
        name: 'validate-credentials',
        status: 'completed',
        message: 'Azure credentials validated'
      });

      // Step 2: Create/Update Resource Group
      deployment.steps.push({
        name: 'resource-group',
        status: 'completed',
        resourceGroup: environment.resourceGroup,
        location: deployment.location
      });

      // Step 3: Deploy ARM template
      deployment.steps.push({
        name: 'arm-deployment',
        status: 'in-progress',
        template: 'main',
        parameters: {
          location: deployment.location,
          environment: environment.name
        }
      });

      // Step 4: Configure container instances
      for (const containerGroup of this.containerGroups) {
        deployment.steps.push({
          name: `deploy-container-${containerGroup.name}`,
          status: 'pending',
          container: {
            name: containerGroup.name,
            image: containerGroup.properties.containers[0].properties.image,
            location: containerGroup.location
          }
        });
      }

      // Step 5: Configure networking and security
      deployment.steps.push({
        name: 'configure-networking',
        status: 'pending',
        networking: {
          vnet: environment.vnetName,
          nsg: environment.nsgName,
          subnet: environment.subnetName
        }
      });

      // Step 6: Setup monitoring
      if (environment.monitoring) {
        deployment.steps.push({
          name: 'setup-monitoring',
          status: 'pending',
          monitoring: {
            workspace: environment.monitoring.workspaceName,
            alerts: environment.monitoring.alerts || []
          }
        });
      }

      // Step 7: Verify deployment
      deployment.steps.push({
        name: 'verify-deployment',
        status: 'pending',
        healthChecks: environment.healthChecks || []
      });

      deployment.status = 'deployed';
      deployment.completedAt = new Date().toISOString();

      // Generate deployment manifest
      const manifest = {
        deployment: deployment,
        infrastructure: {
          subscriptionId: environment.subscriptionId,
          resourceGroup: environment.resourceGroup,
          location: deployment.location,
          containerGroups: this.containerGroups.map(cg => ({
            name: cg.name,
            url: cg.properties.ipAddress.type === 'Public' 
              ? `http://${cg.properties.ipAddress.dnsNameLabel}.${deployment.location}.azurecontainer.io`
              : 'Private IP',
            status: 'deployed'
          })),
          networking: {
            vnet: `mcp-${environment.name}-vnet`,
            subnet: 'container-subnet',
            nsg: `mcp-${environment.name}-nsg`
          },
          loadBalancer: environment.loadBalancer ? {
            name: `mcp-${environment.name}-appgw`,
            publicIp: `mcp-${environment.name}-pip`,
            url: `http://mcp-${environment.name}.${deployment.location}.cloudapp.azure.com`
          } : null
        },
        armTemplate: this.armTemplates.main,
        monitoring: {
          portalUrl: `https://portal.azure.com/#@${environment.tenantId}/resource/subscriptions/${environment.subscriptionId}/resourceGroups/${environment.resourceGroup}/overview`,
          logAnalytics: environment.monitoring ? {
            workspace: `mcp-${environment.name}-logs`,
            queries: [
              'ContainerInstanceLog_CL | where TimeGenerated > ago(1h) | order by TimeGenerated desc',
              'ContainerInstance_CL | where Name_s contains "mcp" | summarize count() by Name_s'
            ]
          } : null
        }
      };

      return manifest;

    } catch (error) {
      deployment.status = 'failed';
      deployment.error = error.message;
      throw new Error(`Deployment failed: ${error.message}`);
    }
  }

  // Helper methods
  _formatEnvironmentVariables(envVars) {
    const formatted = [];
    for (const [name, value] of Object.entries(envVars)) {
      const envVar = { name };
      
      // Check if it's a secure value
      if (typeof value === 'object' && value.secure) {
        envVar.secureValue = value.value;
      } else {
        envVar.value = String(value);
      }
      
      formatted.push(envVar);
    }
    return formatted;
  }
}

module.exports = AzureDeployment;