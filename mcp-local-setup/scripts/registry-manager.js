#!/usr/bin/env node
/**
 * MCP Service Registry Manager
 * Manages the MCP catalog and generates Docker Compose configurations
 */

const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');

class RegistryManager {
    constructor(basePath) {
        this.basePath = basePath || process.cwd();
        this.catalogPath = path.join(this.basePath, 'registry', 'mcp-catalog.json');
        this.dockerComposePath = path.join(this.basePath, 'docker-compose.yml');
        this.envPath = path.join(this.basePath, '.env');
        this.profilesPath = path.join(this.basePath, 'profiles');
        this.isWSL = this.detectWSL();
    }

    detectWSL() {
        try {
            const os = require('os');
            const release = os.release().toLowerCase();
            return release.includes('microsoft') || release.includes('wsl');
        } catch (error) {
            return false;
        }
    }

    async loadCatalog() {
        try {
            const data = await fs.readFile(this.catalogPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('Failed to load catalog:', error.message);
            return null;
        }
    }

    async loadProfile(profileName = 'default') {
        try {
            const profilePath = path.join(this.profilesPath, `${profileName}.yml`);
            const data = await fs.readFile(profilePath, 'utf8');
            return yaml.load(data);
        } catch (error) {
            console.error(`Failed to load profile ${profileName}:`, error.message);
            return null;
        }
    }

    async generateDockerCompose(profile = 'default') {
        const catalog = await this.loadCatalog();
        if (!catalog) return;
        
        // Store catalog for use in other methods
        this.catalog = catalog;

        const profileConfig = await this.loadProfile(profile);
        if (!profileConfig) return;

        // Base docker-compose structure
        const compose = {
            version: '3.8',
            services: {
                traefik: {
                    image: 'traefik:v2.10',
                    command: [
                        '--entrypoints.web.address=:8080',
                        '--providers.docker=false',  // Disable Docker provider in WSL
                        '--providers.file.directory=/etc/traefik/dynamic',
                        '--providers.file.watch=true',
                        '--api.dashboard=true',
                        '--api.insecure=true'
                    ],
                    ports: ['8080:8080'],
                    volumes: [
                        './traefik/traefik.yml:/etc/traefik/traefik.yml:ro',
                        './traefik/dynamic_conf.yml:/etc/traefik/dynamic/dynamic_conf.yml:ro'
                    ],
                    networks: ['mcp_network']
                }
            },
            networks: {
                mcp_network: {
                    driver: 'bridge'
                }
            },
            volumes: {}
        };

        // Add services from profile
        const enabledServices = profileConfig.services || [];
        const envVars = new Set();

        for (const serviceId of enabledServices) {
            const server = catalog.servers.find(s => s.id === serviceId);
            if (!server) {
                console.warn(`Service ${serviceId} not found in catalog`);
                continue;
            }

            // Generate service configuration
            const service = {
                networks: ['mcp_network'],
                labels: [
                    `traefik.enable=true`,
                    `traefik.http.routers.${serviceId}.rule=PathPrefix(\`/mcp/${serviceId}\`)`,
                    `traefik.http.services.${serviceId}.loadbalancer.server.port=${server.config.port}`
                ],
                environment: server.config.environment || {},
                restart: profileConfig.settings?.restart_policy || 'unless-stopped'
            };

            // Handle Docker image/build
            if (server.docker.image) {
                service.image = server.docker.image;
            } else if (server.docker.build) {
                service.build = server.docker.build;
            }

            // Handle volumes
            if (server.config.volumes) {
                service.volumes = server.config.volumes.map(v => {
                    // Replace environment variables
                    return v.replace(/\${(\w+)}/g, (match, varName) => {
                        if (varName === 'HOME') return '~';
                        envVars.add(varName);
                        return `\${${varName}}`;
                    });
                });

                // Add named volumes to top-level volumes
                server.config.volumes.forEach(v => {
                    if (!v.includes('/') && !v.includes('\\')) {
                        compose.volumes[v.split(':')[0]] = {};
                    }
                });
            }

            // Collect required environment variables
            if (server.config.env_required) {
                server.config.env_required.forEach(v => envVars.add(v));
            }

            compose.services[serviceId] = service;
        }

        // Add dashboard service
        compose.services.dashboard = {
            image: 'nginx:alpine',
            volumes: [
                './dashboard:/usr/share/nginx/html:ro',
                './nginx.conf:/etc/nginx/conf.d/default.conf:ro'
            ],
            labels: [
                'traefik.enable=true',
                'traefik.http.routers.dashboard.rule=PathPrefix(`/dashboard`)',
                'traefik.http.services.dashboard.loadbalancer.server.port=80'
            ],
            networks: ['mcp_network']
        };

        // Add gateway service
        compose.services.gateway = {
            build: {
                context: './gateway',
                dockerfile: 'Dockerfile'
            },
            environment: {
                NODE_ENV: 'production',
                GATEWAY_PORT: '8090',
                MCP_HOME: '/app/.mcp-platform',
                MCP_GATEWAY_API_KEY: '${MCP_GATEWAY_API_KEY:-mcp-gateway-default-key}',
                MCP_SERVERS: enabledServices.join(','),
                ...Object.fromEntries(
                    enabledServices.map(id => [
                        `MCP_${id.toUpperCase().replace(/-/g, '_')}_PORT`,
                        this.catalog.servers.find(s => s.id === id)?.config?.port || '3000'
                    ])
                ),
                ...Object.fromEntries(
                    Array.from(envVars).map(v => [v, `\${${v}}`])
                )
            },
            // No volumes needed for Docker-based gateway
            ports: ['8090:8090'],
            labels: [
                'traefik.enable=true',
                'traefik.http.routers.gateway.rule=PathPrefix(`/mcp`) || PathPrefix(`/.well-known/mcp-manifest.json`) || PathPrefix(`/api/gateway`)',
                'traefik.http.services.gateway.loadbalancer.server.port=8090',
                'traefik.http.routers.gateway-manifest.rule=Path(`/.well-known/mcp-manifest.json`)',
                'traefik.http.routers.gateway-api.rule=PathPrefix(`/api/gateway`)'
            ],
            networks: ['mcp_network'],
            depends_on: enabledServices.map(id => id),
            restart: 'unless-stopped'
        };

        // Add gateway API key to environment variables
        envVars.add('MCP_GATEWAY_API_KEY');

        return { compose, envVars: Array.from(envVars) };
    }

    async writeDockerCompose(profile = 'default') {
        const result = await this.generateDockerCompose(profile);
        if (!result) return;

        const { compose, envVars } = result;

        // Write docker-compose.yml
        const yamlStr = yaml.dump(compose, { indent: 2 });
        await fs.writeFile(this.dockerComposePath, yamlStr);
        console.log(`Generated docker-compose.yml for profile: ${profile}`);

        // Generate .env template if needed
        if (envVars.length > 0 || this.isWSL) {
            const envExists = await fs.access(this.envPath).then(() => true).catch(() => false);
            
            if (!envExists) {
                // Create .env with defaults for WSL
                const envContent = [];
                
                // Add WSL-specific defaults
                if (this.isWSL) {
                    envContent.push(`HOME=${process.env.HOME || '/home/user'}`);
                    envContent.push(`USER=${process.env.USER || 'user'}`);
                }
                
                // Add other required variables
                envContent.push(...envVars.map(v => {
                    if (v === 'MCP_GATEWAY_API_KEY') {
                        return `${v}=mcp-gateway-default-key`;
                    }
                    return `${v}=`;
                }));
                
                await fs.writeFile(this.envPath, envContent.join('\n'));
                console.log('Created .env file with required variables');
            } else {
                console.log('Required environment variables:');
                envVars.forEach(v => console.log(`  - ${v}`));
            }
        }
    }

    async listServices() {
        const catalog = await this.loadCatalog();
        if (!catalog) return;

        console.log('\nAvailable MCP Services:\n');
        
        Object.entries(catalog.categories).forEach(([catId, category]) => {
            const services = catalog.servers.filter(s => s.category === catId);
            if (services.length === 0) return;

            console.log(`${category.name}:`);
            services.forEach(s => {
                console.log(`  ${s.id.padEnd(15)} - ${s.description}`);
            });
            console.log();
        });
    }

    async getServiceInfo(serviceId) {
        const catalog = await this.loadCatalog();
        if (!catalog) return;

        const server = catalog.servers.find(s => s.id === serviceId);
        if (!server) {
            console.error(`Service ${serviceId} not found`);
            return;
        }

        console.log(`\nService: ${server.name}`);
        console.log(`ID: ${server.id}`);
        console.log(`Category: ${catalog.categories[server.category].name}`);
        console.log(`Description: ${server.description}`);
        console.log(`\nSource:`);
        console.log(`  Type: ${server.source.type}`);
        
        if (server.source.type === 'npm') {
            console.log(`  Package: ${server.source.package}`);
        } else if (server.source.type === 'local') {
            console.log(`  Path: ${server.source.path}`);
        }

        if (server.config.env_required && server.config.env_required.length > 0) {
            console.log(`\nRequired Environment Variables:`);
            server.config.env_required.forEach(v => console.log(`  - ${v}`));
        }

        console.log(`\nSupported Clients:`);
        server.clients.forEach(c => console.log(`  - ${c}`));
    }

    async updateManifest() {
        const catalog = await this.loadCatalog();
        if (!catalog) return;

        const manifest = {
            services: {}
        };

        // Only include enabled services
        const profileConfig = await this.loadProfile('default');
        if (!profileConfig) return;

        const enabledServices = profileConfig.services || [];
        
        enabledServices.forEach(serviceId => {
            const server = catalog.servers.find(s => s.id === serviceId);
            if (server) {
                manifest.services[serviceId] = {
                    description: server.description,
                    url: `http://localhost:8080/mcp/${serviceId}`
                };
            }
        });

        const manifestPath = path.join(this.basePath, '.well-known', 'mcp-manifest.json');
        await fs.mkdir(path.dirname(manifestPath), { recursive: true });
        await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
        console.log('Updated MCP manifest');
    }
}

// CLI interface
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    const manager = new RegistryManager();

    switch (command) {
        case 'list':
            await manager.listServices();
            break;
        
        case 'info':
            if (!args[1]) {
                console.error('Usage: registry-manager info <service-id>');
                process.exit(1);
            }
            await manager.getServiceInfo(args[1]);
            break;
        
        case 'generate':
            const profile = args[1] || 'default';
            await manager.writeDockerCompose(profile);
            await manager.updateManifest();
            break;
        
        case 'update-manifest':
            await manager.updateManifest();
            break;
        
        default:
            console.log('MCP Registry Manager');
            console.log('\nCommands:');
            console.log('  list                    - List all available services');
            console.log('  info <service-id>       - Show detailed info about a service');
            console.log('  generate [profile]      - Generate docker-compose.yml from profile');
            console.log('  update-manifest         - Update .well-known/mcp-manifest.json');
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = RegistryManager;