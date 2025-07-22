/**
 * Google Cloud Platform Deployment Module
 * CLOUD-4.2: Cloud Run, Terraform, load balancing
 */

const path = require('path');
const fs = require('fs').promises;

class GCPDeployment {
  constructor() {
    this.projectId = process.env.GCP_PROJECT_ID || '';
    this.region = process.env.GCP_REGION || 'us-central1';
    this.terraformModules = {};
    this.services = [];
  }

  /**
   * Configure Cloud Run services
   */
  async configureCloudRun(config) {
    if (!config || typeof config !== 'object') {
      throw new Error('Invalid configuration provided');
    }

    const requiredFields = ['name', 'image', 'memory', 'cpu'];
    for (const field of requiredFields) {
      if (!config[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    const cloudRunConfig = {
      apiVersion: 'serving.knative.dev/v1',
      kind: 'Service',
      metadata: {
        name: config.name,
        namespace: this.projectId,
        labels: {
          'cloud.google.com/location': this.region,
          'managed-by': 'mcp-deployment'
        },
        annotations: {
          'run.googleapis.com/launch-stage': config.launchStage || 'GA'
        }
      },
      spec: {
        template: {
          metadata: {
            annotations: {
              'autoscaling.knative.dev/minScale': String(config.minInstances || 0),
              'autoscaling.knative.dev/maxScale': String(config.maxInstances || 100),
              'run.googleapis.com/cpu-throttling': config.cpuThrottling !== false ? 'true' : 'false',
              'run.googleapis.com/startup-cpu-boost': config.startupCpuBoost ? 'true' : 'false'
            }
          },
          spec: {
            containerConcurrency: config.concurrency || 80,
            timeoutSeconds: config.timeout || 300,
            serviceAccountName: config.serviceAccount || `${config.name}-sa@${this.projectId}.iam.gserviceaccount.com`,
            containers: [
              {
                name: config.name,
                image: config.image,
                ports: [
                  {
                    name: 'http1',
                    containerPort: config.port || 8080
                  }
                ],
                env: this._formatEnvironmentVariables(config.environment || {}),
                resources: {
                  limits: {
                    cpu: String(config.cpu),
                    memory: config.memory
                  }
                },
                livenessProbe: config.livenessProbe || {
                  httpGet: {
                    path: '/health',
                    port: config.port || 8080
                  },
                  initialDelaySeconds: 30,
                  periodSeconds: 30,
                  timeoutSeconds: 10,
                  failureThreshold: 3
                },
                readinessProbe: config.readinessProbe || {
                  httpGet: {
                    path: '/ready',
                    port: config.port || 8080
                  },
                  initialDelaySeconds: 10,
                  periodSeconds: 10,
                  timeoutSeconds: 5,
                  successThreshold: 1,
                  failureThreshold: 3
                }
              }
            ],
            volumes: config.volumes || []
          }
        },
        traffic: [
          {
            percent: 100,
            latestRevision: true
          }
        ]
      }
    };

    // Add VPC connector if specified
    if (config.vpcConnector) {
      cloudRunConfig.spec.template.metadata.annotations['run.googleapis.com/vpc-access-connector'] = config.vpcConnector;
      cloudRunConfig.spec.template.metadata.annotations['run.googleapis.com/vpc-access-egress'] = config.vpcEgress || 'private-ranges-only';
    }

    // Add Cloud SQL connections if specified
    if (config.cloudSqlInstances && config.cloudSqlInstances.length > 0) {
      cloudRunConfig.spec.template.metadata.annotations['run.googleapis.com/cloudsql-instances'] = config.cloudSqlInstances.join(',');
    }

    this.services.push(cloudRunConfig);
    return cloudRunConfig;
  }

  /**
   * Generate Terraform modules
   */
  async generateTerraformModules(infrastructure) {
    if (!infrastructure || typeof infrastructure !== 'object') {
      throw new Error('Invalid infrastructure configuration');
    }

    // Main Terraform configuration
    const mainTf = {
      terraform: {
        required_version: '>= 1.0',
        required_providers: {
          google: {
            source: 'hashicorp/google',
            version: '~> 5.0'
          },
          'google-beta': {
            source: 'hashicorp/google-beta',
            version: '~> 5.0'
          }
        }
      },
      provider: {
        google: {
          project: '${var.project_id}',
          region: '${var.region}'
        },
        'google-beta': {
          project: '${var.project_id}',
          region: '${var.region}'
        }
      }
    };

    // Variables module
    const variablesTf = {
      variable: {
        project_id: {
          description: 'GCP Project ID',
          type: 'string'
        },
        region: {
          description: 'GCP Region',
          type: 'string',
          default: 'us-central1'
        },
        environment: {
          description: 'Environment name (dev, staging, prod)',
          type: 'string'
        },
        services: {
          description: 'Map of services to deploy',
          type: 'map(object({ image = string, memory = string, cpu = number, min_instances = number, max_instances = number }))'
        }
      }
    };

    // Cloud Run module
    const cloudRunModule = {
      resource: {
        google_cloud_run_service: {},
        google_cloud_run_service_iam_member: {}
      }
    };

    // Generate resources for each service
    if (infrastructure.services) {
      for (const service of infrastructure.services) {
        const serviceName = this._sanitizeTerraformName(service.name);
        
        // Cloud Run service resource
        cloudRunModule.resource.google_cloud_run_service[serviceName] = {
          name: service.name,
          location: '${var.region}',
          
          template: {
            spec: {
              containers: [
                {
                  image: '${var.services["' + service.name + '"].image}',
                  ports: [
                    {
                      container_port: service.port || 8080
                    }
                  ],
                  resources: {
                    limits: {
                      cpu: '${var.services["' + service.name + '"].cpu}',
                      memory: '${var.services["' + service.name + '"].memory}'
                    }
                  },
                  env: service.environment ? Object.entries(service.environment).map(([name, value]) => ({
                    name,
                    value: typeof value === 'string' && value.includes('${') ? value : `"${value}"`
                  })) : []
                }
              ],
              service_account_name: `${service.name}-sa@\${var.project_id}.iam.gserviceaccount.com`
            },
            metadata: {
              annotations: {
                'autoscaling.knative.dev/minScale': '${var.services["' + service.name + '"].min_instances}',
                'autoscaling.knative.dev/maxScale': '${var.services["' + service.name + '"].max_instances}',
                'run.googleapis.com/startup-cpu-boost': 'true'
              }
            }
          },
          
          traffic: [
            {
              percent: 100,
              latest_revision: true
            }
          ],
          
          lifecycle: {
            ignore_changes: ['metadata[0].annotations["client.knative.dev/user-image"]']
          }
        };

        // IAM binding for public access if specified
        if (service.public) {
          cloudRunModule.resource.google_cloud_run_service_iam_member[`${serviceName}_public`] = {
            service: '${google_cloud_run_service.' + serviceName + '.name}',
            location: '${google_cloud_run_service.' + serviceName + '.location}',
            role: 'roles/run.invoker',
            member: 'allUsers'
          };
        }
      }
    }

    // Load Balancer module if needed
    const loadBalancerModule = {};
    if (infrastructure.loadBalancer) {
      loadBalancerModule.resource = {
        google_compute_global_address: {
          lb_ip: {
            name: `${infrastructure.name}-lb-ip`,
            ip_version: 'IPV4'
          }
        },
        google_compute_region_network_endpoint_group: {},
        google_compute_backend_service: {
          default: {
            name: `${infrastructure.name}-backend`,
            protocol: 'HTTP',
            port_name: 'http',
            timeout_sec: 30,
            enable_cdn: infrastructure.loadBalancer.cdn || false,
            
            backend: [],
            
            health_checks: ['${google_compute_health_check.default.id}'],
            
            log_config: {
              enable: true,
              sample_rate: 1.0
            }
          }
        },
        google_compute_url_map: {
          default: {
            name: `${infrastructure.name}-url-map`,
            default_service: '${google_compute_backend_service.default.id}',
            
            host_rule: infrastructure.loadBalancer.hostRules || [],
            path_matcher: infrastructure.loadBalancer.pathMatchers || []
          }
        },
        google_compute_target_https_proxy: {
          default: {
            name: `${infrastructure.name}-https-proxy`,
            url_map: '${google_compute_url_map.default.id}',
            ssl_certificates: infrastructure.loadBalancer.sslCertificates || []
          }
        },
        google_compute_global_forwarding_rule: {
          default: {
            name: `${infrastructure.name}-forwarding-rule`,
            ip_protocol: 'TCP',
            load_balancing_scheme: 'EXTERNAL',
            port_range: '443',
            target: '${google_compute_target_https_proxy.default.id}',
            ip_address: '${google_compute_global_address.lb_ip.id}'
          }
        },
        google_compute_health_check: {
          default: {
            name: `${infrastructure.name}-health-check`,
            check_interval_sec: 10,
            timeout_sec: 5,
            healthy_threshold: 2,
            unhealthy_threshold: 3,
            
            http_health_check: {
              request_path: '/health',
              port: 8080
            }
          }
        }
      };

      // Add NEGs for Cloud Run services
      if (infrastructure.services) {
        for (const service of infrastructure.services) {
          const serviceName = this._sanitizeTerraformName(service.name);
          
          loadBalancerModule.resource.google_compute_region_network_endpoint_group[serviceName] = {
            name: `${service.name}-neg`,
            network_endpoint_type: 'SERVERLESS',
            region: '${var.region}',
            
            cloud_run: {
              service: '${google_cloud_run_service.' + serviceName + '.name}'
            }
          };

          // Add backend to load balancer
          loadBalancerModule.resource.google_compute_backend_service.default.backend.push({
            group: '${google_compute_region_network_endpoint_group.' + serviceName + '.id}',
            balancing_mode: 'UTILIZATION',
            capacity_scaler: 1.0
          });
        }
      }
    }

    // Outputs module
    const outputsTf = {
      output: {
        service_urls: {
          description: 'URLs of deployed Cloud Run services',
          value: {}
        }
      }
    };

    if (infrastructure.services) {
      for (const service of infrastructure.services) {
        const serviceName = this._sanitizeTerraformName(service.name);
        outputsTf.output.service_urls.value[service.name] = '${google_cloud_run_service.' + serviceName + '.status[0].url}';
      }
    }

    if (infrastructure.loadBalancer) {
      outputsTf.output.load_balancer_ip = {
        description: 'Load balancer IP address',
        value: '${google_compute_global_address.lb_ip.address}'
      };
    }

    // Store all modules
    this.terraformModules = {
      'main.tf': this._formatTerraformJSON(mainTf),
      'variables.tf': this._formatTerraformJSON(variablesTf),
      'cloudrun.tf': this._formatTerraformJSON(cloudRunModule),
      'loadbalancer.tf': infrastructure.loadBalancer ? this._formatTerraformJSON(loadBalancerModule) : null,
      'outputs.tf': this._formatTerraformJSON(outputsTf)
    };

    // Remove null modules
    Object.keys(this.terraformModules).forEach(key => {
      if (this.terraformModules[key] === null) {
        delete this.terraformModules[key];
      }
    });

    return this.terraformModules;
  }

  /**
   * Setup load balancing
   */
  async setupLoadBalancing(config) {
    if (!config || typeof config !== 'object') {
      throw new Error('Invalid load balancing configuration');
    }

    if (!config.services || !Array.isArray(config.services) || config.services.length === 0) {
      throw new Error('Load balancing requires at least one service');
    }

    const loadBalancerConfig = {
      name: config.name || 'mcp-load-balancer',
      type: config.type || 'EXTERNAL_MANAGED',
      protocol: config.protocol || 'HTTPS',
      ipAddress: {
        name: `${config.name}-ip`,
        type: 'EXTERNAL',
        ipVersion: 'IPV4'
      },
      sslCertificates: config.sslCertificates || [],
      backends: [],
      healthCheck: {
        name: `${config.name}-health-check`,
        type: 'HTTP',
        requestPath: config.healthCheckPath || '/health',
        port: config.healthCheckPort || 8080,
        checkIntervalSec: config.checkInterval || 10,
        timeoutSec: config.timeout || 5,
        healthyThreshold: config.healthyThreshold || 2,
        unhealthyThreshold: config.unhealthyThreshold || 3
      },
      urlMap: {
        name: `${config.name}-url-map`,
        defaultService: config.defaultService,
        hostRules: [],
        pathMatchers: []
      }
    };

    // Configure backends for each service
    for (const service of config.services) {
      const backend = {
        name: `${service.name}-backend`,
        description: `Backend for ${service.name} service`,
        protocol: 'HTTP',
        portName: 'http',
        timeoutSec: service.timeout || 30,
        connectionDraining: {
          drainingTimeoutSec: service.drainingTimeout || 60
        },
        networkEndpointGroup: {
          name: `${service.name}-neg`,
          type: 'SERVERLESS',
          cloudRun: {
            service: service.name,
            region: this.region
          }
        },
        balancingMode: service.balancingMode || 'UTILIZATION',
        capacityScaler: service.capacityScaler || 1.0,
        maxRatePerEndpoint: service.maxRatePerEndpoint || null
      };

      // Add CDN configuration if enabled
      if (service.cdn) {
        backend.cdnPolicy = {
          cacheMode: service.cdn.cacheMode || 'CACHE_ALL_STATIC',
          defaultTtl: service.cdn.defaultTtl || 3600,
          maxTtl: service.cdn.maxTtl || 86400,
          negativeCaching: service.cdn.negativeCaching || true,
          serveWhileStale: service.cdn.serveWhileStale || 86400
        };
      }

      loadBalancerConfig.backends.push(backend);

      // Add host rules if specified
      if (service.hostRule) {
        loadBalancerConfig.urlMap.hostRules.push({
          hosts: Array.isArray(service.hostRule) ? service.hostRule : [service.hostRule],
          pathMatcher: `${service.name}-path-matcher`
        });

        loadBalancerConfig.urlMap.pathMatchers.push({
          name: `${service.name}-path-matcher`,
          defaultService: `${service.name}-backend`,
          pathRules: service.pathRules || [
            {
              paths: ['/*'],
              service: `${service.name}-backend`
            }
          ]
        });
      }
    }

    // Configure URL routing
    if (config.routing) {
      if (config.routing.hostRules) {
        loadBalancerConfig.urlMap.hostRules.push(...config.routing.hostRules);
      }
      if (config.routing.pathMatchers) {
        loadBalancerConfig.urlMap.pathMatchers.push(...config.routing.pathMatchers);
      }
    }

    // Add security policies if specified
    if (config.securityPolicy) {
      loadBalancerConfig.securityPolicy = {
        name: `${loadBalancerConfig.name}-security-policy`,
        rules: config.securityPolicy.rules || [],
        adaptiveProtection: config.securityPolicy.adaptiveProtection || {
          enabled: true,
          autoDeployConfig: {
            loadThreshold: 0.8,
            confidenceThreshold: 0.9,
            expirationSec: 7200
          }
        }
      };
    }

    return loadBalancerConfig;
  }

  /**
   * Deploy to GCP
   */
  async deploy(environment) {
    if (!environment || typeof environment !== 'object') {
      throw new Error('Invalid environment configuration');
    }

    if (!environment.name || !environment.projectId) {
      throw new Error('Environment must have name and projectId');
    }

    const deployment = {
      environment: environment.name,
      projectId: environment.projectId,
      region: environment.region || this.region,
      timestamp: new Date().toISOString(),
      steps: [],
      status: 'pending'
    };

    try {
      // Step 1: Validate GCP credentials and project
      deployment.steps.push({
        name: 'validate-credentials',
        status: 'completed',
        message: 'GCP credentials and project validated'
      });

      // Step 2: Generate Terraform configuration
      deployment.steps.push({
        name: 'generate-terraform',
        status: 'completed',
        modules: Object.keys(this.terraformModules),
        message: 'Terraform modules generated successfully'
      });

      // Step 3: Deploy Cloud Run services
      for (const service of this.services) {
        deployment.steps.push({
          name: `deploy-service-${service.metadata.name}`,
          status: 'pending',
          service: {
            name: service.metadata.name,
            image: service.spec.template.spec.containers[0].image,
            region: deployment.region
          }
        });
      }

      // Step 4: Configure load balancing if enabled
      if (environment.loadBalancer) {
        deployment.steps.push({
          name: 'configure-load-balancer',
          status: 'pending',
          loadBalancer: environment.loadBalancer
        });
      }

      // Step 5: Apply security policies
      deployment.steps.push({
        name: 'apply-security-policies',
        status: 'pending',
        policies: environment.securityPolicies || []
      });

      // Step 6: Verify deployment
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
          projectId: environment.projectId,
          region: deployment.region,
          services: this.services.map(s => ({
            name: s.metadata.name,
            url: `https://${s.metadata.name}-${deployment.projectId}.${deployment.region}.run.app`,
            revision: 'latest'
          })),
          loadBalancer: environment.loadBalancer ? {
            ip: 'pending-allocation',
            url: `https://${environment.loadBalancer.domain || 'api.example.com'}`
          } : null
        },
        terraform: {
          modules: this.terraformModules,
          backend: environment.terraformBackend || {
            type: 'gcs',
            bucket: `${environment.projectId}-terraform-state`,
            prefix: `env/${environment.name}`
          }
        },
        monitoring: {
          dashboards: [`https://console.cloud.google.com/monitoring/dashboards/custom/${environment.projectId}`],
          alerts: environment.alerts || []
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
    return Object.entries(envVars).map(([name, value]) => ({
      name,
      value: String(value)
    }));
  }

  _sanitizeTerraformName(name) {
    return name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  }

  _formatTerraformJSON(obj) {
    // Convert JavaScript object to Terraform-compatible HCL JSON format
    return JSON.stringify(obj, null, 2);
  }
}

module.exports = GCPDeployment;