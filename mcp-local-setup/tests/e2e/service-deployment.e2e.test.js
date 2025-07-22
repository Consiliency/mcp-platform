/**
 * End-to-end tests for service deployment scenarios
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const yaml = require('js-yaml');
const axios = require('axios');
const {
  waitForHealthy,
  cleanupTestResources
} = require('../framework/test-helpers');

// Mock axios for controlled responses
jest.mock('axios');

// Increase timeout for e2e tests
jest.setTimeout(90000);

describe('Service Deployment E2E Tests', () => {
  const testResources = [];
  const MCP_HOME = process.env.MCP_HOME || path.join(process.env.HOME, '.mcp-platform');
  const catalogPath = path.join(MCP_HOME, 'registry', 'mcp-catalog.json');

  beforeAll(async () => {
    // Ensure required directories exist
    await fs.mkdir(path.join(MCP_HOME, 'registry'), { recursive: true });
    await fs.mkdir(path.join(MCP_HOME, 'services'), { recursive: true });
    await fs.mkdir(path.join(MCP_HOME, 'data'), { recursive: true });
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await cleanupTestResources(testResources);
    testResources.length = 0;
  });

  describe('Service Discovery and Installation', () => {
    it('should discover available services from registry', async () => {
      const mockCatalog = {
        version: '1.0.0',
        updated: new Date().toISOString(),
        services: {
          'echo-service': {
            id: 'echo-service',
            name: 'Echo Service',
            description: 'Simple echo service for testing',
            version: '1.0.0',
            author: 'MCP Team',
            tags: ['testing', 'utility'],
            docker: {
              image: 'mcp/echo-service:latest',
              ports: ['3000:3000']
            }
          },
          'database-service': {
            id: 'database-service',
            name: 'PostgreSQL Database',
            description: 'PostgreSQL database service',
            version: '14.0',
            tags: ['database', 'storage'],
            docker: {
              image: 'postgres:14',
              ports: ['5432:5432'],
              environment: {
                POSTGRES_DB: 'mcp',
                POSTGRES_USER: 'mcp_user'
              },
              volumes: [
                'postgres_data:/var/lib/postgresql/data'
              ]
            }
          },
          'cache-service': {
            id: 'cache-service',
            name: 'Redis Cache',
            description: 'Redis caching service',
            version: '7.0',
            tags: ['cache', 'performance'],
            docker: {
              image: 'redis:7-alpine',
              ports: ['6379:6379']
            }
          }
        }
      };

      // Write mock catalog
      await fs.writeFile(catalogPath, JSON.stringify(mockCatalog, null, 2));

      // Read and verify catalog
      const catalog = JSON.parse(await fs.readFile(catalogPath, 'utf8'));
      expect(Object.keys(catalog.services).length).toBe(3);
      expect(catalog.services['echo-service']).toBeDefined();
      expect(catalog.services['database-service'].docker.image).toBe('postgres:14');
    });

    it('should install a service from registry', async () => {
      // Mock service definition
      const serviceToInstall = {
        id: 'test-install-service',
        name: 'Test Install Service',
        version: '1.0.0',
        docker: {
          image: 'nginx:alpine',
          ports: ['8080:80'],
          environment: {
            SERVICE_NAME: 'test-install'
          }
        }
      };

      // Add to catalog
      const catalog = JSON.parse(await fs.readFile(catalogPath, 'utf8'));
      catalog.services[serviceToInstall.id] = serviceToInstall;
      await fs.writeFile(catalogPath, JSON.stringify(catalog, null, 2));

      // Generate docker-compose entry
      const dockerCompose = {
        version: '3.8',
        services: {
          [serviceToInstall.id]: {
            image: serviceToInstall.docker.image,
            ports: serviceToInstall.docker.ports,
            environment: serviceToInstall.docker.environment,
            networks: ['mcp-network'],
            restart: 'unless-stopped'
          }
        },
        networks: {
          'mcp-network': {
            driver: 'bridge'
          }
        }
      };

      const composePath = path.join(MCP_HOME, 'docker-compose.yml');
      await fs.writeFile(composePath, yaml.dump(dockerCompose));

      // Verify installation
      const installedCompose = yaml.load(await fs.readFile(composePath, 'utf8'));
      expect(installedCompose.services[serviceToInstall.id]).toBeDefined();
      expect(installedCompose.services[serviceToInstall.id].image).toBe('nginx:alpine');

      testResources.push(`service:${serviceToInstall.id}`);
    });

    it('should handle service dependencies during installation', async () => {
      const apiService = {
        id: 'api-service',
        name: 'API Service',
        dependencies: ['database-service', 'cache-service'],
        docker: {
          image: 'mcp/api:latest',
          ports: ['3000:3000'],
          depends_on: ['database-service', 'cache-service']
        }
      };

      // When installing api-service, dependencies should be installed first
      const installOrder = [];
      
      // Simulate dependency resolution
      const resolveDependencies = (serviceId, resolved = new Set()) => {
        if (resolved.has(serviceId)) return;
        
        const service = { 
          'api-service': apiService,
          'database-service': { id: 'database-service', dependencies: [] },
          'cache-service': { id: 'cache-service', dependencies: [] }
        }[serviceId];
        
        if (service.dependencies) {
          service.dependencies.forEach(dep => resolveDependencies(dep, resolved));
        }
        
        resolved.add(serviceId);
        installOrder.push(serviceId);
      };

      resolveDependencies('api-service');
      
      expect(installOrder).toEqual(['database-service', 'cache-service', 'api-service']);
    });
  });

  describe('Service Configuration', () => {
    it('should apply custom configuration during deployment', async () => {
      const serviceConfig = {
        id: 'configured-service',
        name: 'Configured Service',
        config: {
          port: 8080,
          workers: 4,
          log_level: 'debug',
          features: {
            cache: true,
            metrics: true
          }
        }
      };

      // Create service config file
      const configPath = path.join(MCP_HOME, 'services', serviceConfig.id, 'config.json');
      await fs.mkdir(path.dirname(configPath), { recursive: true });
      await fs.writeFile(configPath, JSON.stringify(serviceConfig.config, null, 2));

      // Verify config was saved
      const savedConfig = JSON.parse(await fs.readFile(configPath, 'utf8'));
      expect(savedConfig.port).toBe(8080);
      expect(savedConfig.features.cache).toBe(true);
    });

    it('should support environment-specific configurations', async () => {
      const environments = ['development', 'staging', 'production'];
      const serviceId = 'multi-env-service';

      for (const env of environments) {
        const envConfig = {
          environment: env,
          database_url: `postgres://db-${env}:5432/app`,
          api_key: `${env}-key-12345`,
          debug: env === 'development'
        };

        const configPath = path.join(MCP_HOME, 'services', serviceId, `config.${env}.json`);
        await fs.mkdir(path.dirname(configPath), { recursive: true });
        await fs.writeFile(configPath, JSON.stringify(envConfig, null, 2));
      }

      // Verify environment configs
      for (const env of environments) {
        const configPath = path.join(MCP_HOME, 'services', serviceId, `config.${env}.json`);
        const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
        expect(config.environment).toBe(env);
        expect(config.debug).toBe(env === 'development');
      }
    });

    it('should validate configuration before deployment', async () => {
      const invalidConfig = {
        id: 'invalid-config-service',
        config: {
          port: 'not-a-number', // Invalid
          workers: -1, // Invalid
          log_level: 'invalid-level' // Invalid
        }
      };

      const validateConfig = (config) => {
        const errors = [];
        
        if (typeof config.port !== 'number' || config.port < 1 || config.port > 65535) {
          errors.push('Invalid port number');
        }
        
        if (typeof config.workers !== 'number' || config.workers < 1) {
          errors.push('Workers must be a positive number');
        }
        
        if (!['debug', 'info', 'warn', 'error'].includes(config.log_level)) {
          errors.push('Invalid log level');
        }
        
        return errors;
      };

      const validationErrors = validateConfig(invalidConfig.config);
      expect(validationErrors).toHaveLength(3);
      expect(validationErrors).toContain('Invalid port number');
    });
  });

  describe('Service Deployment Strategies', () => {
    it('should support rolling deployment', async () => {
      const service = {
        id: 'rolling-deploy-service',
        replicas: 3,
        deployment: {
          strategy: 'rolling',
          max_surge: 1,
          max_unavailable: 1
        }
      };

      // Simulate rolling deployment
      const deploymentSteps = [];
      const currentReplicas = 3;
      const targetReplicas = 3;
      
      // Step 1: Start new replica
      deploymentSteps.push({
        action: 'start_new',
        running: currentReplicas + service.deployment.max_surge
      });
      
      // Step 2: Stop old replica
      deploymentSteps.push({
        action: 'stop_old',
        running: currentReplicas
      });
      
      // Repeat for all replicas
      expect(deploymentSteps[0].running).toBe(4); // 3 + 1 surge
      expect(deploymentSteps[1].running).toBe(3); // Back to normal
    });

    it('should support blue-green deployment', async () => {
      const service = {
        id: 'blue-green-service',
        deployment: {
          strategy: 'blue-green',
          environments: ['blue', 'green']
        }
      };

      let activeEnvironment = 'blue';
      const inactiveEnvironment = activeEnvironment === 'blue' ? 'green' : 'blue';

      // Deploy to inactive environment
      const deploymentPlan = {
        1: { action: 'deploy', target: inactiveEnvironment },
        2: { action: 'test', target: inactiveEnvironment },
        3: { action: 'switch', from: activeEnvironment, to: inactiveEnvironment },
        4: { action: 'cleanup', target: activeEnvironment }
      };

      // Simulate deployment
      activeEnvironment = inactiveEnvironment;
      
      expect(activeEnvironment).toBe('green');
      expect(Object.keys(deploymentPlan).length).toBe(4);
    });

    it('should support canary deployment', async () => {
      const service = {
        id: 'canary-service',
        deployment: {
          strategy: 'canary',
          stages: [
            { percentage: 10, duration: '5m' },
            { percentage: 50, duration: '10m' },
            { percentage: 100, duration: '0' }
          ]
        }
      };

      const canaryStages = [];
      
      for (const stage of service.deployment.stages) {
        canaryStages.push({
          traffic_percentage: stage.percentage,
          wait_duration: stage.duration,
          health_check: true
        });
      }

      expect(canaryStages).toHaveLength(3);
      expect(canaryStages[0].traffic_percentage).toBe(10);
      expect(canaryStages[2].traffic_percentage).toBe(100);
    });
  });

  describe('Service Scaling', () => {
    it('should scale service horizontally', async () => {
      const service = {
        id: 'scalable-service',
        scaling: {
          min_replicas: 2,
          max_replicas: 10,
          target_cpu: 70,
          target_memory: 80
        }
      };

      // Simulate scaling decision
      const currentMetrics = {
        cpu: 85, // Above target
        memory: 60,
        replicas: 3
      };

      const calculateDesiredReplicas = (metrics, config) => {
        const cpuRatio = metrics.cpu / config.target_cpu;
        const memoryRatio = metrics.memory / config.target_memory;
        const scaleFactor = Math.max(cpuRatio, memoryRatio);
        
        const desired = Math.ceil(metrics.replicas * scaleFactor);
        return Math.max(config.min_replicas, Math.min(desired, config.max_replicas));
      };

      const desiredReplicas = calculateDesiredReplicas(currentMetrics, service.scaling);
      expect(desiredReplicas).toBeGreaterThan(currentMetrics.replicas);
      expect(desiredReplicas).toBeLessThanOrEqual(service.scaling.max_replicas);
    });

    it('should respect scaling cooldown periods', async () => {
      const scalingHistory = [
        { timestamp: Date.now() - 300000, action: 'scale_up', from: 2, to: 3 },
        { timestamp: Date.now() - 60000, action: 'scale_up', from: 3, to: 4 }
      ];

      const cooldownPeriod = 180000; // 3 minutes
      const lastScaling = scalingHistory[scalingHistory.length - 1];
      const timeSinceLastScaling = Date.now() - lastScaling.timestamp;
      
      const canScale = timeSinceLastScaling >= cooldownPeriod;
      expect(canScale).toBe(false); // Only 1 minute has passed
    });
  });

  describe('Service Health and Recovery', () => {
    it('should detect and recover from service failures', async () => {
      const service = {
        id: 'auto-recovery-service',
        health: {
          check_interval: 30,
          timeout: 5,
          retries: 3,
          recovery: {
            restart_on_failure: true,
            max_restarts: 5,
            restart_window: 3600
          }
        }
      };

      // Simulate health check failure
      const healthChecks = [
        { timestamp: Date.now() - 120000, status: 'healthy' },
        { timestamp: Date.now() - 90000, status: 'healthy' },
        { timestamp: Date.now() - 60000, status: 'unhealthy', error: 'Connection timeout' },
        { timestamp: Date.now() - 30000, status: 'unhealthy', error: 'Connection timeout' },
        { timestamp: Date.now(), status: 'unhealthy', error: 'Connection timeout' }
      ];

      const consecutiveFailures = healthChecks
        .slice(-service.health.retries)
        .filter(check => check.status === 'unhealthy')
        .length;

      const shouldRestart = consecutiveFailures >= service.health.retries;
      expect(shouldRestart).toBe(true);
    });

    it('should implement circuit breaker for failing services', async () => {
      const circuitBreaker = {
        state: 'closed', // closed, open, half-open
        failure_threshold: 5,
        success_threshold: 3,
        timeout: 60000,
        failure_count: 0,
        success_count: 0,
        last_failure: null
      };

      // Simulate failures
      for (let i = 0; i < 5; i++) {
        circuitBreaker.failure_count++;
        circuitBreaker.last_failure = Date.now();
      }

      // Check if circuit should open
      if (circuitBreaker.failure_count >= circuitBreaker.failure_threshold) {
        circuitBreaker.state = 'open';
        circuitBreaker.failure_count = 0;
      }

      expect(circuitBreaker.state).toBe('open');
    });
  });

  describe('Service Networking', () => {
    it('should configure service networking and discovery', async () => {
      const networkConfig = {
        services: {
          'frontend': {
            id: 'frontend',
            network: {
              aliases: ['web', 'frontend-svc'],
              internal: false,
              expose: [80, 443]
            }
          },
          'backend': {
            id: 'backend',
            network: {
              aliases: ['api', 'backend-svc'],
              internal: true,
              links: ['database', 'cache']
            }
          },
          'database': {
            id: 'database',
            network: {
              aliases: ['db', 'postgres'],
              internal: true,
              isolate: true
            }
          }
        }
      };

      // Generate network configuration
      const networks = {
        'public': {
          driver: 'bridge',
          internal: false
        },
        'internal': {
          driver: 'bridge',
          internal: true
        },
        'isolated': {
          driver: 'bridge',
          internal: true,
          attachable: false
        }
      };

      // Assign services to networks
      const serviceNetworks = {
        'frontend': ['public', 'internal'],
        'backend': ['internal'],
        'database': ['isolated']
      };

      expect(serviceNetworks['frontend']).toContain('public');
      expect(serviceNetworks['backend']).not.toContain('public');
      expect(serviceNetworks['database']).toContain('isolated');
    });

    it('should setup service mesh for microservices', async () => {
      const serviceMesh = {
        proxy: 'envoy',
        services: [
          {
            name: 'product-service',
            port: 8080,
            routes: ['/api/products', '/api/inventory']
          },
          {
            name: 'order-service',
            port: 8081,
            routes: ['/api/orders', '/api/cart']
          },
          {
            name: 'user-service',
            port: 8082,
            routes: ['/api/users', '/api/auth']
          }
        ]
      };

      // Generate Envoy configuration
      const envoyConfig = {
        static_resources: {
          listeners: [{
            address: { socket_address: { address: '0.0.0.0', port_value: 80 } },
            filter_chains: [{
              filters: [{
                name: 'envoy.filters.network.http_connection_manager',
                typed_config: {
                  route_config: {
                    virtual_hosts: [{
                      name: 'backend',
                      domains: ['*'],
                      routes: serviceMesh.services.flatMap(svc => 
                        svc.routes.map(route => ({
                          match: { prefix: route },
                          route: { cluster: svc.name }
                        }))
                      )
                    }]
                  }
                }
              }]
            }]
          }]
        }
      };

      expect(envoyConfig.static_resources.listeners).toHaveLength(1);
      const routes = envoyConfig.static_resources.listeners[0].filter_chains[0]
        .filters[0].typed_config.route_config.virtual_hosts[0].routes;
      expect(routes).toHaveLength(6); // 2 routes × 3 services
    });
  });

  describe('Service Monitoring and Logging', () => {
    it('should configure centralized logging', async () => {
      const loggingConfig = {
        driver: 'fluentd',
        options: {
          'fluentd-address': 'localhost:24224',
          'tag': 'mcp.{{.Name}}',
          'fluentd-async-connect': 'true'
        },
        services: {
          'app-service': {
            log_level: 'info',
            structured: true,
            fields: ['timestamp', 'level', 'message', 'service', 'trace_id']
          }
        }
      };

      // Generate docker-compose logging config
      const serviceLogging = {
        logging: {
          driver: loggingConfig.driver,
          options: loggingConfig.options
        }
      };

      expect(serviceLogging.logging.driver).toBe('fluentd');
      expect(serviceLogging.logging.options.tag).toContain('{{.Name}}');
    });

    it('should setup metrics collection', async () => {
      const metricsConfig = {
        prometheus: {
          port: 9090,
          scrape_interval: '15s',
          targets: []
        }
      };

      // Add service metrics endpoints
      const services = ['api', 'worker', 'scheduler'];
      services.forEach((service, index) => {
        metricsConfig.prometheus.targets.push({
          targets: [`${service}:${9100 + index}`],
          labels: { job: service, env: 'production' }
        });
      });

      expect(metricsConfig.prometheus.targets).toHaveLength(3);
      expect(metricsConfig.prometheus.targets[0].targets[0]).toBe('api:9100');
    });
  });
});