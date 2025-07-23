// Stack Builder
// Provides platform-agnostic stack building utilities

class StackBuilder {
  constructor() {
    this.stack = {
      name: '',
      services: [],
      networks: [],
      volumes: [],
      configs: [],
      secrets: []
    };
  }

  withName(name) {
    this.stack.name = name;
    return this;
  }

  addService(config) {
    const service = {
      name: config.name,
      image: config.image,
      replicas: config.replicas || 1,
      ports: config.ports || [],
      env: config.env || {},
      labels: config.labels || {},
      command: config.command,
      args: config.args,
      healthCheck: config.healthCheck,
      resources: config.resources || {
        limits: { cpu: '1', memory: '1Gi' },
        requests: { cpu: '100m', memory: '128Mi' }
      },
      volumes: config.volumes || [],
      dependencies: config.dependencies || []
    };

    this.stack.services.push(service);
    return this;
  }

  addNetwork(config) {
    const network = {
      name: config.name,
      driver: config.driver || 'bridge',
      type: config.type || 'overlay',
      ipam: config.ipam,
      attachable: config.attachable !== false
    };

    this.stack.networks.push(network);
    return this;
  }

  addVolume(config) {
    const volume = {
      name: config.name,
      driver: config.driver || 'local',
      driverOpts: config.driverOpts || {},
      labels: config.labels || {}
    };

    this.stack.volumes.push(volume);
    return this;
  }

  addConfig(name, data) {
    this.stack.configs.push({ name, data });
    return this;
  }

  addSecret(name, data) {
    this.stack.secrets.push({ name, data });
    return this;
  }

  build() {
    this._validate();
    return { ...this.stack };
  }

  toKubernetes() {
    const k8sManifests = [];

    // Convert services to deployments
    for (const service of this.stack.services) {
      const deployment = {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: {
          name: service.name,
          labels: service.labels
        },
        spec: {
          replicas: service.replicas,
          selector: {
            matchLabels: {
              app: service.name
            }
          },
          template: {
            metadata: {
              labels: {
                app: service.name,
                ...service.labels
              }
            },
            spec: {
              containers: [{
                name: service.name,
                image: service.image,
                ports: service.ports.map(p => ({
                  containerPort: p.containerPort || p
                })),
                env: Object.entries(service.env).map(([key, value]) => ({
                  name: key,
                  value: String(value)
                })),
                resources: service.resources,
                command: service.command,
                args: service.args
              }]
            }
          }
        }
      };

      k8sManifests.push(deployment);

      // Create service if ports exist
      if (service.ports.length > 0) {
        const svc = {
          apiVersion: 'v1',
          kind: 'Service',
          metadata: {
            name: service.name,
            labels: service.labels
          },
          spec: {
            selector: {
              app: service.name
            },
            ports: service.ports.map(p => ({
              port: p.containerPort || p,
              targetPort: p.containerPort || p,
              protocol: p.protocol || 'TCP'
            }))
          }
        };
        k8sManifests.push(svc);
      }
    }

    return k8sManifests;
  }

  toSwarm() {
    const swarmCompose = {
      version: '3.8',
      services: {},
      networks: {},
      volumes: {},
      configs: {},
      secrets: {}
    };

    // Convert services
    for (const service of this.stack.services) {
      swarmCompose.services[service.name] = {
        image: service.image,
        deploy: {
          replicas: service.replicas,
          resources: {
            limits: {
              cpus: this._cpuToSwarm(service.resources.limits.cpu),
              memory: service.resources.limits.memory
            },
            reservations: {
              cpus: this._cpuToSwarm(service.resources.requests.cpu),
              memory: service.resources.requests.memory
            }
          }
        },
        ports: service.ports.map(p => `${p.containerPort}:${p.containerPort}`),
        environment: service.env,
        labels: service.labels,
        command: service.command,
        networks: this.stack.networks.map(n => n.name)
      };

      if (service.dependencies.length > 0) {
        swarmCompose.services[service.name].depends_on = service.dependencies;
      }
    }

    // Convert networks
    for (const network of this.stack.networks) {
      swarmCompose.networks[network.name] = {
        driver: network.driver,
        attachable: network.attachable
      };
    }

    // Convert volumes
    for (const volume of this.stack.volumes) {
      swarmCompose.volumes[volume.name] = {
        driver: volume.driver,
        driver_opts: volume.driverOpts
      };
    }

    return swarmCompose;
  }

  toNomad() {
    const job = {
      ID: this.stack.name,
      Name: this.stack.name,
      Type: 'service',
      Datacenters: ['dc1'],
      TaskGroups: []
    };

    // Convert services to task groups
    for (const service of this.stack.services) {
      const taskGroup = {
        Name: service.name,
        Count: service.replicas,
        Tasks: [{
          Name: service.name,
          Driver: 'docker',
          Config: {
            image: service.image,
            command: service.command,
            args: service.args,
            ports: service.ports.map(p => p.containerPort || p)
          },
          Env: service.env,
          Resources: {
            CPU: this._cpuToMHz(service.resources.requests.cpu),
            MemoryMB: this._memoryToMB(service.resources.requests.memory)
          }
        }],
        Networks: [{
          Mode: 'bridge',
          DynamicPorts: service.ports.map(p => ({
            Label: `port${p.containerPort || p}`,
            To: p.containerPort || p
          }))
        }]
      };

      job.TaskGroups.push(taskGroup);
    }

    return job;
  }

  _validate() {
    if (!this.stack.name) {
      throw new Error('Stack name is required');
    }
    if (this.stack.services.length === 0) {
      throw new Error('At least one service is required');
    }
  }

  _cpuToSwarm(cpu) {
    // Convert Kubernetes CPU format to Docker Swarm format
    if (cpu.endsWith('m')) {
      return (parseInt(cpu) / 1000).toString();
    }
    return cpu;
  }

  _cpuToMHz(cpu) {
    // Convert Kubernetes CPU format to Nomad MHz
    if (cpu.endsWith('m')) {
      return parseInt(cpu);
    }
    return parseInt(cpu) * 1000;
  }

  _memoryToMB(memory) {
    // Convert Kubernetes memory format to MB
    if (memory.endsWith('Mi')) {
      return parseInt(memory);
    } else if (memory.endsWith('Gi')) {
      return parseInt(memory) * 1024;
    }
    return 512; // Default
  }
}

module.exports = StackBuilder;