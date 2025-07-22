/**
 * GCP Deployment Module Tests
 */

const GCPDeployment = require('../gcp/deployment');

describe('GCPDeployment', () => {
  let gcpDeployment;
  
  beforeEach(() => {
    gcpDeployment = new GCPDeployment();
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      expect(gcpDeployment.projectId).toBe('');
      expect(gcpDeployment.region).toBe('us-central1');
      expect(gcpDeployment.terraformModules).toEqual({});
      expect(gcpDeployment.services).toEqual([]);
    });

    it('should use environment variables when available', () => {
      process.env.GCP_PROJECT_ID = 'my-project-123';
      process.env.GCP_REGION = 'europe-west1';
      
      const deployment = new GCPDeployment();
      expect(deployment.projectId).toBe('my-project-123');
      expect(deployment.region).toBe('europe-west1');
      
      delete process.env.GCP_PROJECT_ID;
      delete process.env.GCP_REGION;
    });
  });

  describe('configureCloudRun', () => {
    it('should create valid Cloud Run configuration', async () => {
      const config = {
        name: 'test-service',
        image: 'gcr.io/project/test:latest',
        memory: '1Gi',
        cpu: '1',
        environment: {
          NODE_ENV: 'production',
          DATABASE_URL: 'postgres://localhost'
        }
      };

      const cloudRunConfig = await gcpDeployment.configureCloudRun(config);
      
      expect(cloudRunConfig.apiVersion).toBe('serving.knative.dev/v1');
      expect(cloudRunConfig.kind).toBe('Service');
      expect(cloudRunConfig.metadata.name).toBe('test-service');
      expect(cloudRunConfig.spec.template.spec.containers[0].image).toBe('gcr.io/project/test:latest');
      expect(cloudRunConfig.spec.template.spec.containers[0].resources.limits.cpu).toBe('1');
      expect(cloudRunConfig.spec.template.spec.containers[0].resources.limits.memory).toBe('1Gi');
      expect(gcpDeployment.services).toHaveLength(1);
    });

    it('should throw error for invalid configuration', async () => {
      await expect(gcpDeployment.configureCloudRun(null))
        .rejects.toThrow('Invalid configuration provided');
      
      await expect(gcpDeployment.configureCloudRun({}))
        .rejects.toThrow('Missing required field: name');
    });

    it('should handle VPC connector configuration', async () => {
      const config = {
        name: 'private-service',
        image: 'gcr.io/project/private:latest',
        memory: '512Mi',
        cpu: '0.5',
        vpcConnector: 'projects/my-project/locations/us-central1/connectors/my-connector',
        vpcEgress: 'all-traffic'
      };

      const cloudRunConfig = await gcpDeployment.configureCloudRun(config);
      expect(cloudRunConfig.spec.template.metadata.annotations['run.googleapis.com/vpc-access-connector'])
        .toBe('projects/my-project/locations/us-central1/connectors/my-connector');
      expect(cloudRunConfig.spec.template.metadata.annotations['run.googleapis.com/vpc-access-egress'])
        .toBe('all-traffic');
    });

    it('should handle Cloud SQL connections', async () => {
      const config = {
        name: 'db-service',
        image: 'gcr.io/project/db:latest',
        memory: '2Gi',
        cpu: '2',
        cloudSqlInstances: ['my-project:us-central1:mysql-instance', 'my-project:us-central1:postgres-instance']
      };

      const cloudRunConfig = await gcpDeployment.configureCloudRun(config);
      expect(cloudRunConfig.spec.template.metadata.annotations['run.googleapis.com/cloudsql-instances'])
        .toBe('my-project:us-central1:mysql-instance,my-project:us-central1:postgres-instance');
    });

    it('should handle auto-scaling configuration', async () => {
      const config = {
        name: 'scalable-service',
        image: 'gcr.io/project/scale:latest',
        memory: '1Gi',
        cpu: '1',
        minInstances: 5,
        maxInstances: 50,
        concurrency: 100
      };

      const cloudRunConfig = await gcpDeployment.configureCloudRun(config);
      expect(cloudRunConfig.spec.template.metadata.annotations['autoscaling.knative.dev/minScale']).toBe('5');
      expect(cloudRunConfig.spec.template.metadata.annotations['autoscaling.knative.dev/maxScale']).toBe('50');
      expect(cloudRunConfig.spec.template.spec.containerConcurrency).toBe(100);
    });
  });

  describe('generateTerraformModules', () => {
    it('should generate valid Terraform modules', async () => {
      const infrastructure = {
        name: 'mcp-platform',
        services: [
          {
            name: 'api-service',
            image: 'gcr.io/project/api:latest',
            memory: '1Gi',
            cpu: '1',
            port: 8080,
            public: true
          }
        ]
      };

      const modules = await gcpDeployment.generateTerraformModules(infrastructure);
      
      expect(modules).toBeDefined();
      expect(typeof modules).toBe('object');
      expect(Object.keys(modules)).toContain('main.tf');
      expect(Object.keys(modules)).toContain('variables.tf');
      expect(Object.keys(modules)).toContain('cloudrun.tf');
      expect(Object.keys(modules)).toContain('outputs.tf');
      
      const mainTf = JSON.parse(modules['main.tf']);
      expect(mainTf.terraform.required_providers.google.version).toBe('~> 5.0');
    });

    it('should throw error for invalid infrastructure', async () => {
      await expect(gcpDeployment.generateTerraformModules(null))
        .rejects.toThrow('Invalid infrastructure configuration');
    });

    it('should generate load balancer module when specified', async () => {
      const infrastructure = {
        name: 'mcp-platform',
        services: [
          {
            name: 'web-service',
            image: 'gcr.io/project/web:latest',
            memory: '512Mi',
            cpu: '0.5'
          }
        ],
        loadBalancer: {
          cdn: true,
          sslCertificates: ['cert-1', 'cert-2']
        }
      };

      const modules = await gcpDeployment.generateTerraformModules(infrastructure);
      expect(Object.keys(modules)).toContain('loadbalancer.tf');
      
      const loadBalancer = JSON.parse(modules['loadbalancer.tf']);
      expect(loadBalancer.resource).toHaveProperty('google_compute_global_address');
      expect(loadBalancer.resource).toHaveProperty('google_compute_backend_service');
    });

    it('should sanitize Terraform resource names', async () => {
      const infrastructure = {
        services: [
          {
            name: 'my-service-name',
            image: 'gcr.io/project/test:latest',
            memory: '1Gi',
            cpu: '1'
          }
        ]
      };

      const modules = await gcpDeployment.generateTerraformModules(infrastructure);
      const cloudRun = JSON.parse(modules['cloudrun.tf']);
      expect(cloudRun.resource.google_cloud_run_service).toHaveProperty('my_service_name');
    });
  });

  describe('setupLoadBalancing', () => {
    it('should configure load balancing with multiple services', async () => {
      const config = {
        name: 'mcp-lb',
        services: [
          {
            name: 'api-service',
            port: 8080,
            healthCheckPath: '/api/health'
          },
          {
            name: 'web-service',
            port: 3000,
            healthCheckPath: '/health',
            cdn: {
              cacheMode: 'CACHE_ALL_STATIC',
              defaultTtl: 7200
            }
          }
        ]
      };

      const lbConfig = await gcpDeployment.setupLoadBalancing(config);
      
      expect(lbConfig.name).toBe('mcp-lb');
      expect(lbConfig.backends).toHaveLength(2);
      expect(lbConfig.backends[0].name).toBe('api-service-backend');
      expect(lbConfig.backends[1].cdnPolicy.defaultTtl).toBe(7200);
    });

    it('should throw error for invalid configuration', async () => {
      await expect(gcpDeployment.setupLoadBalancing(null))
        .rejects.toThrow('Invalid load balancing configuration');
      
      await expect(gcpDeployment.setupLoadBalancing({ services: [] }))
        .rejects.toThrow('Load balancing requires at least one service');
    });

    it('should configure host-based routing', async () => {
      const config = {
        services: [
          {
            name: 'api',
            hostRule: 'api.example.com',
            pathRules: [
              { paths: ['/v1/*'], service: 'api-v1-backend' },
              { paths: ['/v2/*'], service: 'api-v2-backend' }
            ]
          }
        ]
      };

      const lbConfig = await gcpDeployment.setupLoadBalancing(config);
      expect(lbConfig.urlMap.hostRules).toHaveLength(1);
      expect(lbConfig.urlMap.hostRules[0].hosts).toEqual(['api.example.com']);
      expect(lbConfig.urlMap.pathMatchers).toHaveLength(1);
    });

    it('should configure security policy', async () => {
      const config = {
        services: [{ name: 'secure-service' }],
        securityPolicy: {
          rules: [
            { priority: 1000, match: { srcIpRanges: ['10.0.0.0/8'] }, action: 'allow' }
          ],
          adaptiveProtection: {
            enabled: true,
            autoDeployConfig: {
              loadThreshold: 0.7
            }
          }
        }
      };

      const lbConfig = await gcpDeployment.setupLoadBalancing(config);
      expect(lbConfig.securityPolicy.name).toBe('mcp-load-balancer-security-policy');
      expect(lbConfig.securityPolicy.adaptiveProtection.autoDeployConfig.loadThreshold).toBe(0.7);
    });
  });

  describe('deploy', () => {
    beforeEach(async () => {
      // Configure some services first
      await gcpDeployment.configureCloudRun({
        name: 'test-service',
        image: 'gcr.io/project/test:latest',
        memory: '1Gi',
        cpu: '1'
      });
    });

    it('should create deployment manifest', async () => {
      const environment = {
        name: 'production',
        projectId: 'my-gcp-project',
        region: 'us-central1',
        loadBalancer: {
          domain: 'api.mycompany.com'
        },
        monitoring: {
          alerts: ['alert-1', 'alert-2']
        }
      };

      const manifest = await gcpDeployment.deploy(environment);
      
      expect(manifest.deployment.environment).toBe('production');
      expect(manifest.deployment.projectId).toBe('my-gcp-project');
      expect(manifest.deployment.status).toBe('deployed');
      expect(manifest.infrastructure.services).toHaveLength(1);
      expect(manifest.infrastructure.services[0].url).toContain('https://test-service-my-gcp-project.us-central1.run.app');
      expect(manifest.terraform.backend.type).toBe('gcs');
    });

    it('should throw error for invalid environment', async () => {
      await expect(gcpDeployment.deploy(null))
        .rejects.toThrow('Invalid environment configuration');
      
      await expect(gcpDeployment.deploy({ name: 'prod' }))
        .rejects.toThrow('Environment must have name and projectId');
    });

    it('should handle deployment without load balancer', async () => {
      const environment = {
        name: 'staging',
        projectId: 'my-gcp-project'
      };

      const manifest = await gcpDeployment.deploy(environment);
      expect(manifest.infrastructure.loadBalancer).toBeNull();
    });

    it('should include Terraform modules in manifest', async () => {
      const environment = {
        name: 'dev',
        projectId: 'dev-project'
      };

      const manifest = await gcpDeployment.deploy(environment);
      expect(manifest.terraform.modules).toBeDefined();
      expect(Object.keys(manifest.terraform.modules).length).toBe(0); // No modules generated without infrastructure config
    });
  });

  describe('helper methods', () => {
    it('should format environment variables correctly', () => {
      const envVars = {
        NODE_ENV: 'production',
        PORT: 8080,
        ENABLED: true
      };

      const formatted = gcpDeployment._formatEnvironmentVariables(envVars);
      
      expect(formatted).toHaveLength(3);
      expect(formatted[0]).toEqual({ name: 'NODE_ENV', value: 'production' });
      expect(formatted[1]).toEqual({ name: 'PORT', value: '8080' });
      expect(formatted[2]).toEqual({ name: 'ENABLED', value: 'true' });
    });

    it('should sanitize Terraform names', () => {
      expect(gcpDeployment._sanitizeTerraformName('my-service-name')).toBe('my_service_name');
      expect(gcpDeployment._sanitizeTerraformName('Service@Name!')).toBe('service_name_');
      expect(gcpDeployment._sanitizeTerraformName('123-service')).toBe('123_service');
    });

    it('should format Terraform JSON correctly', () => {
      const obj = {
        resource: {
          google_compute_instance: {
            test: {
              name: 'test-instance'
            }
          }
        }
      };

      const json = gcpDeployment._formatTerraformJSON(obj);
      expect(json).toBe(JSON.stringify(obj, null, 2));
      expect(JSON.parse(json)).toEqual(obj);
    });
  });
});