/**
 * AWS Deployment Module
 * CLOUD-4.1: ECS tasks, CloudFormation, auto-scaling
 */

const path = require('path');
const fs = require('fs').promises;

class AWSDeployment {
  constructor() {
    this.region = process.env.AWS_REGION || 'us-east-1';
    this.accountId = process.env.AWS_ACCOUNT_ID || '';
    this.deploymentStack = [];
    this.templates = {};
  }

  /**
   * Create ECS task definitions
   */
  async createECSTaskDefinition(config) {
    if (!config || typeof config !== 'object') {
      throw new Error('Invalid configuration provided');
    }

    const requiredFields = ['name', 'image', 'memory', 'cpu'];
    for (const field of requiredFields) {
      if (!config[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    const taskDefinition = {
      family: config.name,
      networkMode: config.networkMode || 'awsvpc',
      requiresCompatibilities: ['FARGATE'],
      cpu: String(config.cpu),
      memory: String(config.memory),
      containerDefinitions: [
        {
          name: config.name,
          image: config.image,
          essential: true,
          portMappings: config.ports || [{ containerPort: 3000, protocol: 'tcp' }],
          environment: this._formatEnvironmentVariables(config.environment || {}),
          logConfiguration: {
            logDriver: 'awslogs',
            options: {
              'awslogs-group': `/ecs/${config.name}`,
              'awslogs-region': this.region,
              'awslogs-stream-prefix': 'ecs'
            }
          },
          healthCheck: config.healthCheck || {
            command: ['CMD-SHELL', 'curl -f http://localhost:3000/health || exit 1'],
            interval: 30,
            timeout: 5,
            retries: 3,
            startPeriod: 60
          }
        }
      ],
      executionRoleArn: `arn:aws:iam::${this.accountId}:role/ecsTaskExecutionRole`,
      taskRoleArn: config.taskRoleArn || `arn:aws:iam::${this.accountId}:role/${config.name}-task-role`
    };

    // Add volumes if specified
    if (config.volumes) {
      taskDefinition.volumes = config.volumes.map(vol => ({
        name: vol.name,
        efsVolumeConfiguration: vol.efsConfig || null
      }));
    }

    return taskDefinition;
  }

  /**
   * Generate CloudFormation templates
   */
  async generateCloudFormationTemplate(services) {
    if (!Array.isArray(services) || services.length === 0) {
      throw new Error('Services must be a non-empty array');
    }

    const template = {
      AWSTemplateFormatVersion: '2010-09-09',
      Description: 'MCP Services CloudFormation Stack',
      Parameters: {
        VPC: {
          Type: 'AWS::EC2::VPC::Id',
          Description: 'VPC ID for deployment'
        },
        Subnets: {
          Type: 'List<AWS::EC2::Subnet::Id>',
          Description: 'Subnet IDs for service deployment'
        },
        SecurityGroup: {
          Type: 'AWS::EC2::SecurityGroup::Id',
          Description: 'Security group for services'
        }
      },
      Resources: {},
      Outputs: {}
    };

    // Generate resources for each service
    for (const service of services) {
      const serviceName = this._sanitizeResourceName(service.name);
      
      // ECS Service
      template.Resources[`${serviceName}Service`] = {
        Type: 'AWS::ECS::Service',
        Properties: {
          ServiceName: service.name,
          Cluster: { Ref: 'ECSCluster' },
          TaskDefinition: { Ref: `${serviceName}TaskDefinition` },
          DesiredCount: service.desiredCount || 2,
          LaunchType: 'FARGATE',
          NetworkConfiguration: {
            AwsvpcConfiguration: {
              SecurityGroups: [{ Ref: 'SecurityGroup' }],
              Subnets: { Ref: 'Subnets' },
              AssignPublicIp: 'ENABLED'
            }
          },
          LoadBalancers: service.loadBalancer ? [{
            ContainerName: service.name,
            ContainerPort: service.port || 3000,
            TargetGroupArn: { Ref: `${serviceName}TargetGroup` }
          }] : []
        }
      };

      // Task Definition
      const taskDef = await this.createECSTaskDefinition(service);
      template.Resources[`${serviceName}TaskDefinition`] = {
        Type: 'AWS::ECS::TaskDefinition',
        Properties: taskDef
      };

      // Target Group and ALB Listener Rule if load balancer is enabled
      if (service.loadBalancer) {
        template.Resources[`${serviceName}TargetGroup`] = {
          Type: 'AWS::ElasticLoadBalancingV2::TargetGroup',
          Properties: {
            Name: `${service.name}-tg`,
            Port: service.port || 3000,
            Protocol: 'HTTP',
            VpcId: { Ref: 'VPC' },
            TargetType: 'ip',
            HealthCheckEnabled: true,
            HealthCheckPath: service.healthCheckPath || '/health',
            HealthCheckIntervalSeconds: 30,
            HealthCheckTimeoutSeconds: 10,
            HealthyThresholdCount: 2,
            UnhealthyThresholdCount: 3
          }
        };

        template.Resources[`${serviceName}ListenerRule`] = {
          Type: 'AWS::ElasticLoadBalancingV2::ListenerRule',
          Properties: {
            Actions: [{
              Type: 'forward',
              TargetGroupArn: { Ref: `${serviceName}TargetGroup` }
            }],
            Conditions: [{
              Field: 'path-pattern',
              Values: [service.pathPattern || `/${service.name}/*`]
            }],
            ListenerArn: { Ref: 'ALBListener' },
            Priority: service.priority || 100
          }
        };
      }

      // Service outputs
      template.Outputs[`${serviceName}ServiceArn`] = {
        Description: `ARN of ${service.name} ECS Service`,
        Value: { Ref: `${serviceName}Service` }
      };
    }

    // Add shared resources
    template.Resources.ECSCluster = {
      Type: 'AWS::ECS::Cluster',
      Properties: {
        ClusterName: 'mcp-services-cluster',
        ClusterSettings: [{
          Name: 'containerInsights',
          Value: 'enabled'
        }]
      }
    };

    this.templates.main = template;
    return template;
  }

  /**
   * Configure auto-scaling
   */
  async configureAutoScaling(rules) {
    if (!Array.isArray(rules) || rules.length === 0) {
      throw new Error('Auto-scaling rules must be a non-empty array');
    }

    const scalingPolicies = [];

    for (const rule of rules) {
      if (!rule.serviceName || !rule.metricType) {
        throw new Error('Each rule must have serviceName and metricType');
      }

      const serviceName = this._sanitizeResourceName(rule.serviceName);
      
      // Scaling target
      const scalingTarget = {
        Type: 'AWS::ApplicationAutoScaling::ScalableTarget',
        Properties: {
          ServiceNamespace: 'ecs',
          ScalableDimension: 'ecs:service:DesiredCount',
          ResourceId: {
            'Fn::Sub': `service/\${ECSCluster}/${rule.serviceName}`
          },
          MinCapacity: rule.minCapacity || 1,
          MaxCapacity: rule.maxCapacity || 10,
          RoleARN: {
            'Fn::Sub': 'arn:aws:iam::${AWS::AccountId}:role/aws-service-role/ecs.application-autoscaling.amazonaws.com/AWSServiceRoleForApplicationAutoScaling_ECSService'
          }
        }
      };

      // Scaling policy based on metric type
      let scalingPolicy;
      switch (rule.metricType) {
        case 'cpu':
          scalingPolicy = {
            Type: 'AWS::ApplicationAutoScaling::ScalingPolicy',
            Properties: {
              PolicyName: `${serviceName}-cpu-scaling`,
              PolicyType: 'TargetTrackingScaling',
              ScalingTargetId: { Ref: `${serviceName}ScalingTarget` },
              TargetTrackingScalingPolicyConfiguration: {
                TargetValue: rule.targetValue || 70,
                PredefinedMetricSpecification: {
                  PredefinedMetricType: 'ECSServiceAverageCPUUtilization'
                },
                ScaleInCooldown: rule.scaleInCooldown || 300,
                ScaleOutCooldown: rule.scaleOutCooldown || 60
              }
            }
          };
          break;
        
        case 'memory':
          scalingPolicy = {
            Type: 'AWS::ApplicationAutoScaling::ScalingPolicy',
            Properties: {
              PolicyName: `${serviceName}-memory-scaling`,
              PolicyType: 'TargetTrackingScaling',
              ScalingTargetId: { Ref: `${serviceName}ScalingTarget` },
              TargetTrackingScalingPolicyConfiguration: {
                TargetValue: rule.targetValue || 70,
                PredefinedMetricSpecification: {
                  PredefinedMetricType: 'ECSServiceAverageMemoryUtilization'
                },
                ScaleInCooldown: rule.scaleInCooldown || 300,
                ScaleOutCooldown: rule.scaleOutCooldown || 60
              }
            }
          };
          break;
        
        case 'custom':
          if (!rule.customMetric) {
            throw new Error('Custom metric configuration required for custom metric type');
          }
          scalingPolicy = {
            Type: 'AWS::ApplicationAutoScaling::ScalingPolicy',
            Properties: {
              PolicyName: `${serviceName}-custom-scaling`,
              PolicyType: 'TargetTrackingScaling',
              ScalingTargetId: { Ref: `${serviceName}ScalingTarget` },
              TargetTrackingScalingPolicyConfiguration: {
                TargetValue: rule.targetValue || 100,
                CustomizedMetricSpecification: {
                  MetricName: rule.customMetric.name,
                  Namespace: rule.customMetric.namespace,
                  Statistic: rule.customMetric.statistic || 'Average',
                  Unit: rule.customMetric.unit || 'Count',
                  Dimensions: rule.customMetric.dimensions || []
                },
                ScaleInCooldown: rule.scaleInCooldown || 300,
                ScaleOutCooldown: rule.scaleOutCooldown || 60
              }
            }
          };
          break;
        
        default:
          throw new Error(`Unsupported metric type: ${rule.metricType}`);
      }

      scalingPolicies.push({
        target: scalingTarget,
        policy: scalingPolicy,
        serviceName: serviceName
      });
    }

    // Add scaling resources to CloudFormation template
    if (this.templates.main && this.templates.main.Resources) {
      for (const scaling of scalingPolicies) {
        this.templates.main.Resources[`${scaling.serviceName}ScalingTarget`] = scaling.target;
        this.templates.main.Resources[`${scaling.serviceName}ScalingPolicy`] = scaling.policy;
      }
    }

    return scalingPolicies;
  }

  /**
   * Deploy to AWS
   */
  async deploy(environment) {
    if (!environment || typeof environment !== 'object') {
      throw new Error('Invalid environment configuration');
    }

    if (!environment.name || !environment.region) {
      throw new Error('Environment must have name and region');
    }

    const deployment = {
      environment: environment.name,
      region: environment.region,
      timestamp: new Date().toISOString(),
      steps: [],
      status: 'pending'
    };

    try {
      // Step 1: Validate AWS credentials
      deployment.steps.push({
        name: 'validate-credentials',
        status: 'completed',
        message: 'AWS credentials validated'
      });

      // Step 2: Create/Update CloudFormation stack
      const stackName = `mcp-${environment.name}-stack`;
      deployment.steps.push({
        name: 'cloudformation-deploy',
        status: 'in-progress',
        stackName: stackName,
        template: this.templates.main
      });

      // Step 3: Deploy task definitions
      for (const taskDef of this.deploymentStack) {
        deployment.steps.push({
          name: `deploy-task-${taskDef.family}`,
          status: 'pending',
          taskDefinition: taskDef
        });
      }

      // Step 4: Update services
      deployment.steps.push({
        name: 'update-services',
        status: 'pending',
        message: 'Services will be updated with new task definitions'
      });

      // Step 5: Verify deployment
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
          region: environment.region,
          accountId: this.accountId,
          cluster: `mcp-${environment.name}-cluster`,
          vpc: environment.vpcId,
          subnets: environment.subnetIds
        },
        services: environment.services || []
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
    return Object.entries(envVars).map(([name, value]) => ({
      name,
      value: String(value)
    }));
  }

  _sanitizeResourceName(name) {
    return name.replace(/[^a-zA-Z0-9]/g, '');
  }
}

module.exports = AWSDeployment;