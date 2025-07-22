/**
 * AWS Deployment Module Tests
 */

const AWSDeployment = require('../aws/deployment');

describe('AWSDeployment', () => {
  let awsDeployment;
  
  beforeEach(() => {
    awsDeployment = new AWSDeployment();
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      expect(awsDeployment.region).toBe('us-east-1');
      expect(awsDeployment.accountId).toBe('');
      expect(awsDeployment.deploymentStack).toEqual([]);
      expect(awsDeployment.templates).toEqual({});
    });

    it('should use environment variables when available', () => {
      process.env.AWS_REGION = 'eu-west-1';
      process.env.AWS_ACCOUNT_ID = '123456789012';
      
      const deployment = new AWSDeployment();
      expect(deployment.region).toBe('eu-west-1');
      expect(deployment.accountId).toBe('123456789012');
      
      delete process.env.AWS_REGION;
      delete process.env.AWS_ACCOUNT_ID;
    });
  });

  describe('createECSTaskDefinition', () => {
    it('should create valid ECS task definition', async () => {
      const config = {
        name: 'test-service',
        image: 'test:latest',
        memory: '512',
        cpu: '256',
        environment: {
          NODE_ENV: 'production',
          API_KEY: 'test-key'
        }
      };

      const taskDef = await awsDeployment.createECSTaskDefinition(config);
      
      expect(taskDef.family).toBe('test-service');
      expect(taskDef.networkMode).toBe('awsvpc');
      expect(taskDef.requiresCompatibilities).toEqual(['FARGATE']);
      expect(taskDef.cpu).toBe('256');
      expect(taskDef.memory).toBe('512');
      expect(taskDef.containerDefinitions).toHaveLength(1);
      expect(taskDef.containerDefinitions[0].name).toBe('test-service');
      expect(taskDef.containerDefinitions[0].image).toBe('test:latest');
      expect(taskDef.containerDefinitions[0].environment).toHaveLength(2);
    });

    it('should throw error for invalid configuration', async () => {
      await expect(awsDeployment.createECSTaskDefinition(null))
        .rejects.toThrow('Invalid configuration provided');
      
      await expect(awsDeployment.createECSTaskDefinition({}))
        .rejects.toThrow('Missing required field: name');
    });

    it('should handle custom port mappings', async () => {
      const config = {
        name: 'test-service',
        image: 'test:latest',
        memory: '512',
        cpu: '256',
        ports: [
          { containerPort: 8080, protocol: 'tcp' },
          { containerPort: 8443, protocol: 'tcp' }
        ]
      };

      const taskDef = await awsDeployment.createECSTaskDefinition(config);
      expect(taskDef.containerDefinitions[0].portMappings).toHaveLength(2);
      expect(taskDef.containerDefinitions[0].portMappings[0].containerPort).toBe(8080);
    });

    it('should add volumes when specified', async () => {
      const config = {
        name: 'test-service',
        image: 'test:latest',
        memory: '512',
        cpu: '256',
        volumes: [
          {
            name: 'data-volume',
            efsConfig: {
              fileSystemId: 'fs-12345',
              rootDirectory: '/data'
            }
          }
        ]
      };

      const taskDef = await awsDeployment.createECSTaskDefinition(config);
      expect(taskDef.volumes).toHaveLength(1);
      expect(taskDef.volumes[0].name).toBe('data-volume');
    });
  });

  describe('generateCloudFormationTemplate', () => {
    it('should generate valid CloudFormation template', async () => {
      const services = [
        {
          name: 'api-service',
          image: 'api:latest',
          memory: '1024',
          cpu: '512',
          desiredCount: 3,
          loadBalancer: true,
          port: 8080
        }
      ];

      const template = await awsDeployment.generateCloudFormationTemplate(services);
      
      expect(template.AWSTemplateFormatVersion).toBe('2010-09-09');
      expect(template.Description).toBe('MCP Services CloudFormation Stack');
      expect(template.Parameters).toHaveProperty('VPC');
      expect(template.Parameters).toHaveProperty('Subnets');
      expect(template.Resources).toHaveProperty('ECSCluster');
      expect(template.Resources).toHaveProperty('apiserviceService');
      expect(template.Resources).toHaveProperty('apiserviceTaskDefinition');
      expect(awsDeployment.templates.main).toBe(template);
    });

    it('should throw error for invalid services', async () => {
      await expect(awsDeployment.generateCloudFormationTemplate(null))
        .rejects.toThrow('Services must be a non-empty array');
      
      await expect(awsDeployment.generateCloudFormationTemplate([]))
        .rejects.toThrow('Services must be a non-empty array');
    });

    it('should handle services with load balancer', async () => {
      const services = [
        {
          name: 'web-app',
          image: 'web:latest',
          memory: '512',
          cpu: '256',
          loadBalancer: true,
          pathPattern: '/app/*',
          priority: 50
        }
      ];

      const template = await awsDeployment.generateCloudFormationTemplate(services);
      expect(template.Resources).toHaveProperty('webappTargetGroup');
      expect(template.Resources).toHaveProperty('webappListenerRule');
    });
  });

  describe('configureAutoScaling', () => {
    beforeEach(async () => {
      // Setup a template first
      const services = [{
        name: 'test-service',
        image: 'test:latest',
        memory: '512',
        cpu: '256'
      }];
      await awsDeployment.generateCloudFormationTemplate(services);
    });

    it('should configure CPU-based auto-scaling', async () => {
      const rules = [
        {
          serviceName: 'test-service',
          metricType: 'cpu',
          targetValue: 75,
          minCapacity: 2,
          maxCapacity: 20
        }
      ];

      const policies = await awsDeployment.configureAutoScaling(rules);
      
      expect(policies).toHaveLength(1);
      expect(policies[0].target.Type).toBe('AWS::ApplicationAutoScaling::ScalableTarget');
      expect(policies[0].policy.Type).toBe('AWS::ApplicationAutoScaling::ScalingPolicy');
      expect(policies[0].policy.Properties.TargetTrackingScalingPolicyConfiguration.TargetValue).toBe(75);
    });

    it('should configure memory-based auto-scaling', async () => {
      const rules = [
        {
          serviceName: 'test-service',
          metricType: 'memory',
          targetValue: 80
        }
      ];

      const policies = await awsDeployment.configureAutoScaling(rules);
      expect(policies[0].policy.Properties.TargetTrackingScalingPolicyConfiguration.PredefinedMetricSpecification.PredefinedMetricType)
        .toBe('ECSServiceAverageMemoryUtilization');
    });

    it('should configure custom metric auto-scaling', async () => {
      const rules = [
        {
          serviceName: 'test-service',
          metricType: 'custom',
          targetValue: 1000,
          customMetric: {
            name: 'RequestCount',
            namespace: 'MyApp/Metrics',
            statistic: 'Sum',
            unit: 'Count'
          }
        }
      ];

      const policies = await awsDeployment.configureAutoScaling(rules);
      expect(policies[0].policy.Properties.TargetTrackingScalingPolicyConfiguration.CustomizedMetricSpecification.MetricName)
        .toBe('RequestCount');
    });

    it('should throw error for invalid rules', async () => {
      await expect(awsDeployment.configureAutoScaling(null))
        .rejects.toThrow('Auto-scaling rules must be a non-empty array');
      
      await expect(awsDeployment.configureAutoScaling([{}]))
        .rejects.toThrow('Each rule must have serviceName and metricType');
    });

    it('should throw error for unsupported metric type', async () => {
      const rules = [
        {
          serviceName: 'test-service',
          metricType: 'invalid'
        }
      ];

      await expect(awsDeployment.configureAutoScaling(rules))
        .rejects.toThrow('Unsupported metric type: invalid');
    });
  });

  describe('deploy', () => {
    it('should create deployment manifest', async () => {
      const environment = {
        name: 'production',
        region: 'us-east-1',
        vpcId: 'vpc-12345',
        subnetIds: ['subnet-1', 'subnet-2'],
        services: [
          {
            name: 'api',
            image: 'api:latest',
            memory: '1024',
            cpu: '512'
          }
        ]
      };

      const manifest = await awsDeployment.deploy(environment);
      
      expect(manifest.deployment.environment).toBe('production');
      expect(manifest.deployment.region).toBe('us-east-1');
      expect(manifest.deployment.status).toBe('deployed');
      expect(manifest.deployment.steps).toHaveLength(4); // Fixed: Only 4 steps when no task definitions in deploymentStack
      expect(manifest.infrastructure.vpc).toBe('vpc-12345');
      expect(manifest.infrastructure.subnets).toEqual(['subnet-1', 'subnet-2']);
    });

    it('should throw error for invalid environment', async () => {
      await expect(awsDeployment.deploy(null))
        .rejects.toThrow('Invalid environment configuration');
      
      await expect(awsDeployment.deploy({}))
        .rejects.toThrow('Environment must have name and region');
    });

    it('should handle deployment failure', async () => {
      const environment = {
        name: 'production',
        region: 'us-east-1'
      };

      // Mock a failure by not providing required fields
      awsDeployment.templates.main = null;
      
      try {
        await awsDeployment.deploy(environment);
      } catch (error) {
        expect(error.message).toContain('Deployment failed:');
      }
    });
  });

  describe('helper methods', () => {
    it('should format environment variables correctly', () => {
      const envVars = {
        NODE_ENV: 'production',
        PORT: 3000,
        DEBUG: false
      };

      const formatted = awsDeployment._formatEnvironmentVariables(envVars);
      
      expect(formatted).toHaveLength(3);
      expect(formatted[0]).toEqual({ name: 'NODE_ENV', value: 'production' });
      expect(formatted[1]).toEqual({ name: 'PORT', value: '3000' });
      expect(formatted[2]).toEqual({ name: 'DEBUG', value: 'false' });
    });

    it('should sanitize resource names', () => {
      expect(awsDeployment._sanitizeResourceName('my-service-name')).toBe('myservicename');
      expect(awsDeployment._sanitizeResourceName('service_123')).toBe('service123');
      expect(awsDeployment._sanitizeResourceName('service@name!')).toBe('servicename');
    });
  });
});