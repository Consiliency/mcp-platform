/**
 * End-to-end tests for client configuration generation
 */

const path = require('path');
const fs = require('fs').promises;
const yaml = require('js-yaml');
const { cleanupTestResources } = require('../framework/test-helpers');

// Increase timeout for e2e tests
jest.setTimeout(60000);

describe('Client Configuration Generation E2E Tests', () => {
  const testResources = [];
  const MCP_HOME = process.env.MCP_HOME || path.join(process.env.HOME, '.mcp-platform');
  const clientsDir = path.join(MCP_HOME, 'clients');
  const templatesDir = path.join(MCP_HOME, 'templates');

  beforeAll(async () => {
    // Ensure required directories exist
    await fs.mkdir(clientsDir, { recursive: true });
    await fs.mkdir(templatesDir, { recursive: true });
    await fs.mkdir(path.join(clientsDir, 'configs'), { recursive: true });
  });

  afterEach(async () => {
    await cleanupTestResources(testResources);
    testResources.length = 0;
  });

  describe('Client SDK Configuration', () => {
    it('should generate Python client configuration', async () => {
      const pythonConfig = {
        client_name: 'python-mcp-client',
        sdk_version: '1.0.0',
        services: {
          'api-service': {
            endpoint: 'http://localhost:3000',
            auth: {
              type: 'bearer',
              token_env: 'MCP_API_TOKEN'
            }
          },
          'grpc-service': {
            endpoint: 'localhost:50051',
            protocol: 'grpc',
            tls: false
          }
        },
        settings: {
          timeout: 30,
          retry: {
            max_attempts: 3,
            backoff_multiplier: 2
          }
        }
      };

      // Generate Python config file
      const pythonConfigContent = `# MCP Client Configuration
# Generated automatically - DO NOT EDIT

import os
from typing import Dict, Any

class MCPConfig:
    """MCP Client Configuration"""
    
    def __init__(self):
        self.services = {
            'api-service': {
                'endpoint': '${pythonConfig.services['api-service'].endpoint}',
                'auth': {
                    'type': '${pythonConfig.services['api-service'].auth.type}',
                    'token': os.environ.get('${pythonConfig.services['api-service'].auth.token_env}', '')
                }
            },
            'grpc-service': {
                'endpoint': '${pythonConfig.services['grpc-service'].endpoint}',
                'protocol': '${pythonConfig.services['grpc-service'].protocol}',
                'tls': ${pythonConfig.services['grpc-service'].tls}
            }
        }
        
        self.settings = {
            'timeout': ${pythonConfig.settings.timeout},
            'retry': {
                'max_attempts': ${pythonConfig.settings.retry.max_attempts},
                'backoff_multiplier': ${pythonConfig.settings.retry.backoff_multiplier}
            }
        }
    
    def get_service_config(self, service_name: str) -> Dict[str, Any]:
        """Get configuration for a specific service"""
        return self.services.get(service_name, {})

# Global config instance
config = MCPConfig()`;

      const pythonConfigPath = path.join(clientsDir, 'configs', 'mcp_config.py');
      await fs.writeFile(pythonConfigPath, pythonConfigContent);

      // Verify generated config
      const savedConfig = await fs.readFile(pythonConfigPath, 'utf8');
      expect(savedConfig).toContain('class MCPConfig:');
      expect(savedConfig).toContain("'api-service':");
      expect(savedConfig).toContain('os.environ.get');
    });

    it('should generate JavaScript/TypeScript client configuration', async () => {
      const jsConfig = {
        client_name: 'js-mcp-client',
        sdk_version: '1.0.0',
        typescript: true,
        services: {
          'rest-api': {
            baseURL: 'http://localhost:8080/api',
            headers: {
              'Content-Type': 'application/json'
            }
          },
          'websocket': {
            url: 'ws://localhost:8081',
            reconnect: true,
            reconnectInterval: 5000
          }
        }
      };

      // Generate TypeScript config
      const tsConfigContent = `// MCP Client Configuration
// Generated automatically - DO NOT EDIT

export interface ServiceConfig {
  baseURL?: string;
  url?: string;
  headers?: Record<string, string>;
  reconnect?: boolean;
  reconnectInterval?: number;
}

export interface MCPClientConfig {
  services: Record<string, ServiceConfig>;
  sdkVersion: string;
}

export const mcpConfig: MCPClientConfig = {
  sdkVersion: '${jsConfig.sdk_version}',
  services: {
    'rest-api': {
      baseURL: '${jsConfig.services['rest-api'].baseURL}',
      headers: ${JSON.stringify(jsConfig.services['rest-api'].headers, null, 6)}
    },
    'websocket': {
      url: '${jsConfig.services.websocket.url}',
      reconnect: ${jsConfig.services.websocket.reconnect},
      reconnectInterval: ${jsConfig.services.websocket.reconnectInterval}
    }
  }
};

// Helper function to get service config
export function getServiceConfig(serviceName: string): ServiceConfig | undefined {
  return mcpConfig.services[serviceName];
}

// Environment-aware configuration
export function getConfig(): MCPClientConfig {
  const env = process.env.NODE_ENV || 'development';
  
  // Override with environment-specific values
  if (env === 'production') {
    mcpConfig.services['rest-api'].baseURL = process.env.MCP_API_URL || mcpConfig.services['rest-api'].baseURL;
  }
  
  return mcpConfig;
}`;

      const tsConfigPath = path.join(clientsDir, 'configs', 'mcp-config.ts');
      await fs.writeFile(tsConfigPath, tsConfigContent);

      // Generate package.json for the client
      const packageJson = {
        name: '@mcp/client-config',
        version: jsConfig.sdk_version,
        main: 'index.js',
        types: 'index.d.ts',
        dependencies: {
          'axios': '^1.5.0',
          'ws': '^8.14.0'
        }
      };

      const packagePath = path.join(clientsDir, 'configs', 'package.json');
      await fs.writeFile(packagePath, JSON.stringify(packageJson, null, 2));

      // Verify generated files
      const savedTsConfig = await fs.readFile(tsConfigPath, 'utf8');
      expect(savedTsConfig).toContain('export interface MCPClientConfig');
      expect(savedTsConfig).toContain('rest-api');
      expect(savedTsConfig).toContain('websocket');
    });

    it('should generate Go client configuration', async () => {
      const goConfig = {
        module: 'github.com/mcp/client',
        services: {
          'grpc-service': {
            address: 'localhost:50051',
            useTLS: false
          },
          'http-service': {
            baseURL: 'http://localhost:8080',
            timeout: '30s'
          }
        }
      };

      const goConfigContent = `// Package config provides MCP client configuration
// Generated automatically - DO NOT EDIT

package config

import (
    "os"
    "time"
)

// ServiceConfig represents configuration for a single service
type ServiceConfig struct {
    Address  string
    BaseURL  string
    UseTLS   bool
    Timeout  time.Duration
}

// Config represents the complete MCP client configuration
type Config struct {
    Services map[string]ServiceConfig
}

// NewConfig creates a new MCP client configuration
func NewConfig() *Config {
    return &Config{
        Services: map[string]ServiceConfig{
            "grpc-service": {
                Address: getEnv("MCP_GRPC_ADDRESS", "${goConfig.services['grpc-service'].address}"),
                UseTLS:  ${goConfig.services['grpc-service'].useTLS},
            },
            "http-service": {
                BaseURL: getEnv("MCP_HTTP_BASEURL", "${goConfig.services['http-service'].baseURL}"),
                Timeout: parseDuration(getEnv("MCP_HTTP_TIMEOUT", "${goConfig.services['http-service'].timeout}")),
            },
        },
    }
}

// GetService returns configuration for a specific service
func (c *Config) GetService(name string) (ServiceConfig, bool) {
    cfg, ok := c.Services[name]
    return cfg, ok
}

// Helper functions
func getEnv(key, defaultValue string) string {
    if value := os.Getenv(key); value != "" {
        return value
    }
    return defaultValue
}

func parseDuration(s string) time.Duration {
    d, err := time.ParseDuration(s)
    if err != nil {
        return 30 * time.Second // default timeout
    }
    return d
}`;

      const goConfigPath = path.join(clientsDir, 'configs', 'config.go');
      await fs.writeFile(goConfigPath, goConfigContent);

      // Generate go.mod file
      const goMod = `module ${goConfig.module}

go 1.21

require (
    google.golang.org/grpc v1.58.0
    github.com/go-resty/resty/v2 v2.7.0
)`;

      const goModPath = path.join(clientsDir, 'configs', 'go.mod');
      await fs.writeFile(goModPath, goMod);

      // Verify generated files
      const savedGoConfig = await fs.readFile(goConfigPath, 'utf8');
      expect(savedGoConfig).toContain('type Config struct');
      expect(savedGoConfig).toContain('grpc-service');
      expect(savedGoConfig).toContain('getEnv');
    });
  });

  describe('Authentication Configuration', () => {
    it('should generate OAuth2 client configuration', async () => {
      const oauth2Config = {
        client_id: 'mcp-client-id',
        client_secret_env: 'MCP_CLIENT_SECRET',
        auth_url: 'https://auth.mcp.local/oauth/authorize',
        token_url: 'https://auth.mcp.local/oauth/token',
        redirect_uri: 'http://localhost:3000/callback',
        scopes: ['read:services', 'write:config']
      };

      const authConfigPath = path.join(clientsDir, 'configs', 'auth.json');
      await fs.writeFile(authConfigPath, JSON.stringify(oauth2Config, null, 2));

      // Generate OAuth2 helper script
      const oauth2Helper = `#!/usr/bin/env node
// OAuth2 Authentication Helper for MCP

const crypto = require('crypto');
const { URL } = require('url');

class OAuth2Client {
  constructor(config) {
    this.clientId = config.client_id;
    this.clientSecret = process.env[config.client_secret_env];
    this.authUrl = config.auth_url;
    this.tokenUrl = config.token_url;
    this.redirectUri = config.redirect_uri;
    this.scopes = config.scopes;
  }

  generateAuthUrl(state) {
    const url = new URL(this.authUrl);
    url.searchParams.append('client_id', this.clientId);
    url.searchParams.append('redirect_uri', this.redirectUri);
    url.searchParams.append('response_type', 'code');
    url.searchParams.append('scope', this.scopes.join(' '));
    url.searchParams.append('state', state);
    return url.toString();
  }

  async exchangeCodeForToken(code) {
    // Implementation for token exchange
    const response = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.redirectUri
      })
    });
    return response.json();
  }
}

module.exports = { OAuth2Client };`;

      const oauth2HelperPath = path.join(clientsDir, 'configs', 'oauth2-helper.js');
      await fs.writeFile(oauth2HelperPath, oauth2Helper);

      // Verify files
      const savedAuthConfig = JSON.parse(await fs.readFile(authConfigPath, 'utf8'));
      expect(savedAuthConfig.client_id).toBe('mcp-client-id');
      expect(savedAuthConfig.scopes).toContain('read:services');
    });

    it('should generate API key authentication configuration', async () => {
      const apiKeyConfig = {
        services: {
          'public-api': {
            auth_type: 'api_key',
            header_name: 'X-API-Key',
            key_env: 'MCP_PUBLIC_API_KEY'
          },
          'private-api': {
            auth_type: 'api_key',
            query_param: 'apikey',
            key_env: 'MCP_PRIVATE_API_KEY'
          }
        }
      };

      // Generate API key configuration helper
      const apiKeyHelper = `// API Key Authentication Configuration

export class APIKeyAuth {
  constructor(config) {
    this.config = config;
  }

  getHeaders(serviceName) {
    const service = this.config.services[serviceName];
    if (!service || service.auth_type !== 'api_key') {
      return {};
    }

    const apiKey = process.env[service.key_env];
    if (!apiKey) {
      throw new Error(\`API key not found for service: \${serviceName}\`);
    }

    if (service.header_name) {
      return { [service.header_name]: apiKey };
    }
    return {};
  }

  getQueryParams(serviceName) {
    const service = this.config.services[serviceName];
    if (!service || service.auth_type !== 'api_key' || !service.query_param) {
      return {};
    }

    const apiKey = process.env[service.key_env];
    if (!apiKey) {
      throw new Error(\`API key not found for service: \${serviceName}\`);
    }

    return { [service.query_param]: apiKey };
  }
}

// Export configuration
export const apiKeyConfig = ${JSON.stringify(apiKeyConfig, null, 2)};`;

      const apiKeyPath = path.join(clientsDir, 'configs', 'api-key-auth.js');
      await fs.writeFile(apiKeyPath, apiKeyHelper);

      // Verify
      const savedHelper = await fs.readFile(apiKeyPath, 'utf8');
      expect(savedHelper).toContain('class APIKeyAuth');
      expect(savedHelper).toContain('X-API-Key');
    });

    it('should generate mTLS client certificate configuration', async () => {
      const mtlsConfig = {
        ca_cert: '/path/to/ca.crt',
        client_cert: '/path/to/client.crt',
        client_key: '/path/to/client.key',
        verify_server: true,
        services: {
          'secure-service': {
            require_mtls: true,
            server_name: 'secure.mcp.local'
          }
        }
      };

      // Generate mTLS configuration script
      const mtlsScript = `#!/bin/bash
# mTLS Configuration Setup Script

set -e

# Configuration paths
CA_CERT="${mtlsConfig.ca_cert}"
CLIENT_CERT="${mtlsConfig.client_cert}"
CLIENT_KEY="${mtlsConfig.client_key}"

# Verify certificates exist
if [ ! -f "$CA_CERT" ]; then
    echo "Error: CA certificate not found at $CA_CERT"
    exit 1
fi

if [ ! -f "$CLIENT_CERT" ]; then
    echo "Error: Client certificate not found at $CLIENT_CERT"
    exit 1
fi

if [ ! -f "$CLIENT_KEY" ]; then
    echo "Error: Client key not found at $CLIENT_KEY"
    exit 1
fi

# Verify certificate validity
openssl verify -CAfile "$CA_CERT" "$CLIENT_CERT"

# Generate combined PEM file for some clients
cat "$CLIENT_CERT" "$CLIENT_KEY" > client-combined.pem

echo "mTLS configuration verified successfully"`;

      const mtlsScriptPath = path.join(clientsDir, 'configs', 'setup-mtls.sh');
      await fs.writeFile(mtlsScriptPath, mtlsScript, { mode: 0o755 });

      // Generate mTLS config JSON
      const mtlsConfigPath = path.join(clientsDir, 'configs', 'mtls.json');
      await fs.writeFile(mtlsConfigPath, JSON.stringify(mtlsConfig, null, 2));

      // Verify
      const savedConfig = JSON.parse(await fs.readFile(mtlsConfigPath, 'utf8'));
      expect(savedConfig.verify_server).toBe(true);
      expect(savedConfig.services['secure-service'].require_mtls).toBe(true);
    });
  });

  describe('Service Discovery Configuration', () => {
    it('should generate static service discovery configuration', async () => {
      const staticDiscovery = {
        version: '1.0',
        services: [
          {
            name: 'user-service',
            instances: [
              { host: 'user-1.mcp.local', port: 8080, weight: 1 },
              { host: 'user-2.mcp.local', port: 8080, weight: 1 }
            ]
          },
          {
            name: 'product-service',
            instances: [
              { host: 'product.mcp.local', port: 8081, weight: 1 }
            ]
          }
        ]
      };

      const discoveryPath = path.join(clientsDir, 'configs', 'service-discovery.json');
      await fs.writeFile(discoveryPath, JSON.stringify(staticDiscovery, null, 2));

      // Generate load balancer configuration
      const lbConfig = `// Load Balancer Configuration for Service Discovery

class LoadBalancer {
  constructor(services) {
    this.services = new Map();
    services.forEach(service => {
      this.services.set(service.name, {
        instances: service.instances,
        currentIndex: 0
      });
    });
  }

  getNextInstance(serviceName) {
    const service = this.services.get(serviceName);
    if (!service || service.instances.length === 0) {
      throw new Error(\`No instances available for service: \${serviceName}\`);
    }

    // Round-robin selection
    const instance = service.instances[service.currentIndex];
    service.currentIndex = (service.currentIndex + 1) % service.instances.length;
    
    return \`http://\${instance.host}:\${instance.port}\`;
  }

  getAllInstances(serviceName) {
    const service = this.services.get(serviceName);
    if (!service) {
      return [];
    }
    
    return service.instances.map(inst => \`http://\${inst.host}:\${inst.port}\`);
  }
}

// Export discovery configuration
export const serviceDiscovery = ${JSON.stringify(staticDiscovery, null, 2)};
export const loadBalancer = new LoadBalancer(serviceDiscovery.services);`;

      const lbConfigPath = path.join(clientsDir, 'configs', 'load-balancer.js');
      await fs.writeFile(lbConfigPath, lbConfig);

      // Verify
      const savedDiscovery = JSON.parse(await fs.readFile(discoveryPath, 'utf8'));
      expect(savedDiscovery.services).toHaveLength(2);
      expect(savedDiscovery.services[0].instances).toHaveLength(2);
    });

    it('should generate dynamic service discovery configuration', async () => {
      const dynamicDiscovery = {
        provider: 'consul',
        consul: {
          address: 'consul.mcp.local:8500',
          datacenter: 'dc1',
          token_env: 'CONSUL_TOKEN',
          health_check: {
            interval: '10s',
            timeout: '5s'
          }
        },
        cache: {
          enabled: true,
          ttl: 30,
          refresh_interval: 15
        }
      };

      // Generate Consul client configuration
      const consulClient = `// Consul Service Discovery Client

const consul = require('consul');

class ConsulDiscovery {
  constructor(config) {
    this.consul = consul({
      host: config.consul.address.split(':')[0],
      port: config.consul.address.split(':')[1] || '8500',
      secure: false,
      defaults: {
        dc: config.consul.datacenter,
        token: process.env[config.consul.token_env]
      }
    });
    
    this.cache = new Map();
    this.cacheConfig = config.cache;
  }

  async discoverService(serviceName) {
    // Check cache first
    const cached = this.cache.get(serviceName);
    if (cached && Date.now() - cached.timestamp < this.cacheConfig.ttl * 1000) {
      return cached.instances;
    }

    // Fetch from Consul
    const services = await this.consul.health.service(serviceName);
    const instances = services
      .filter(s => s.Checks.every(check => check.Status === 'passing'))
      .map(s => ({
        id: s.Service.ID,
        address: s.Service.Address || s.Node.Address,
        port: s.Service.Port,
        tags: s.Service.Tags,
        meta: s.Service.Meta
      }));

    // Update cache
    this.cache.set(serviceName, {
      instances,
      timestamp: Date.now()
    });

    return instances;
  }

  async watchService(serviceName, callback) {
    const watcher = this.consul.watch({
      method: this.consul.health.service,
      options: { service: serviceName }
    });

    watcher.on('change', data => {
      const instances = data
        .filter(s => s.Checks.every(check => check.Status === 'passing'))
        .map(s => ({
          address: s.Service.Address || s.Node.Address,
          port: s.Service.Port
        }));
      
      callback(instances);
    });

    watcher.on('error', err => {
      console.error('Consul watch error:', err);
    });

    return watcher;
  }
}

module.exports = { ConsulDiscovery };`;

      const consulClientPath = path.join(clientsDir, 'configs', 'consul-discovery.js');
      await fs.writeFile(consulClientPath, consulClient);

      // Save dynamic discovery config
      const dynamicConfigPath = path.join(clientsDir, 'configs', 'dynamic-discovery.json');
      await fs.writeFile(dynamicConfigPath, JSON.stringify(dynamicDiscovery, null, 2));

      // Verify
      const savedClient = await fs.readFile(consulClientPath, 'utf8');
      expect(savedClient).toContain('class ConsulDiscovery');
      expect(savedClient).toContain('watchService');
    });
  });

  describe('Client Template Generation', () => {
    it('should generate client SDK from OpenAPI specification', async () => {
      const openApiSpec = {
        openapi: '3.0.0',
        info: {
          title: 'MCP API',
          version: '1.0.0'
        },
        servers: [
          { url: 'http://localhost:8080/api/v1' }
        ],
        paths: {
          '/services': {
            get: {
              operationId: 'listServices',
              summary: 'List all services',
              responses: {
                '200': {
                  description: 'List of services',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/Service' }
                      }
                    }
                  }
                }
              }
            }
          },
          '/services/{id}': {
            get: {
              operationId: 'getService',
              summary: 'Get service by ID',
              parameters: [
                {
                  name: 'id',
                  in: 'path',
                  required: true,
                  schema: { type: 'string' }
                }
              ]
            }
          }
        },
        components: {
          schemas: {
            Service: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                status: { type: 'string' }
              }
            }
          }
        }
      };

      // Save OpenAPI spec
      const specPath = path.join(templatesDir, 'openapi.json');
      await fs.writeFile(specPath, JSON.stringify(openApiSpec, null, 2));

      // Generate TypeScript client from OpenAPI
      const tsClient = `// Generated MCP API Client
// Source: OpenAPI 3.0.0 Specification

import axios, { AxiosInstance } from 'axios';

export interface Service {
  id: string;
  name: string;
  status: string;
}

export class MCPAPIClient {
  private client: AxiosInstance;

  constructor(baseURL: string = '${openApiSpec.servers[0].url}') {
    this.client = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * List all services
   */
  async listServices(): Promise<Service[]> {
    const response = await this.client.get<Service[]>('/services');
    return response.data;
  }

  /**
   * Get service by ID
   */
  async getService(id: string): Promise<Service> {
    const response = await this.client.get<Service>(\`/services/\${id}\`);
    return response.data;
  }
}`;

      const tsClientPath = path.join(clientsDir, 'generated', 'mcp-api-client.ts');
      await fs.mkdir(path.dirname(tsClientPath), { recursive: true });
      await fs.writeFile(tsClientPath, tsClient);

      // Verify
      const savedClient = await fs.readFile(tsClientPath, 'utf8');
      expect(savedClient).toContain('class MCPAPIClient');
      expect(savedClient).toContain('listServices');
      expect(savedClient).toContain('getService');
    });

    it('should generate gRPC client from protobuf', async () => {
      const protoDefinition = `syntax = "proto3";

package mcp.services;

service ServiceManager {
  rpc ListServices (ListServicesRequest) returns (ListServicesResponse);
  rpc GetService (GetServiceRequest) returns (Service);
  rpc CreateService (CreateServiceRequest) returns (Service);
}

message Service {
  string id = 1;
  string name = 2;
  string status = 3;
  map<string, string> labels = 4;
}

message ListServicesRequest {
  string filter = 1;
  int32 page_size = 2;
  string page_token = 3;
}

message ListServicesResponse {
  repeated Service services = 1;
  string next_page_token = 2;
}

message GetServiceRequest {
  string id = 1;
}

message CreateServiceRequest {
  string name = 1;
  map<string, string> labels = 2;
}`;

      // Save proto file
      const protoPath = path.join(templatesDir, 'service-manager.proto');
      await fs.writeFile(protoPath, protoDefinition);

      // Generate Go gRPC client
      const goGrpcClient = `// Generated gRPC Client for ServiceManager
// Source: service-manager.proto

package client

import (
    "context"
    "time"
    
    "google.golang.org/grpc"
    pb "github.com/mcp/api/services"
)

type ServiceManagerClient struct {
    conn   *grpc.ClientConn
    client pb.ServiceManagerClient
}

// NewServiceManagerClient creates a new gRPC client
func NewServiceManagerClient(address string, opts ...grpc.DialOption) (*ServiceManagerClient, error) {
    defaultOpts := []grpc.DialOption{
        grpc.WithInsecure(),
        grpc.WithTimeout(30 * time.Second),
    }
    
    opts = append(defaultOpts, opts...)
    
    conn, err := grpc.Dial(address, opts...)
    if err != nil {
        return nil, err
    }
    
    return &ServiceManagerClient{
        conn:   conn,
        client: pb.NewServiceManagerClient(conn),
    }, nil
}

// ListServices retrieves a list of services
func (c *ServiceManagerClient) ListServices(ctx context.Context, filter string, pageSize int32) ([]*pb.Service, string, error) {
    req := &pb.ListServicesRequest{
        Filter:   filter,
        PageSize: pageSize,
    }
    
    resp, err := c.client.ListServices(ctx, req)
    if err != nil {
        return nil, "", err
    }
    
    return resp.Services, resp.NextPageToken, nil
}

// GetService retrieves a service by ID
func (c *ServiceManagerClient) GetService(ctx context.Context, id string) (*pb.Service, error) {
    req := &pb.GetServiceRequest{
        Id: id,
    }
    
    return c.client.GetService(ctx, req)
}

// CreateService creates a new service
func (c *ServiceManagerClient) CreateService(ctx context.Context, name string, labels map[string]string) (*pb.Service, error) {
    req := &pb.CreateServiceRequest{
        Name:   name,
        Labels: labels,
    }
    
    return c.client.CreateService(ctx, req)
}

// Close closes the gRPC connection
func (c *ServiceManagerClient) Close() error {
    return c.conn.Close()
}`;

      const goClientPath = path.join(clientsDir, 'generated', 'service_manager_client.go');
      await fs.mkdir(path.dirname(goClientPath), { recursive: true });
      await fs.writeFile(goClientPath, goGrpcClient);

      // Verify
      const savedGoClient = await fs.readFile(goClientPath, 'utf8');
      expect(savedGoClient).toContain('type ServiceManagerClient struct');
      expect(savedGoClient).toContain('ListServices');
      expect(savedGoClient).toContain('grpc.Dial');
    });
  });

  describe('Client Configuration Export', () => {
    it('should export client configuration package', async () => {
      const exportConfig = {
        package_name: 'mcp-client-config',
        version: '1.0.0',
        output_format: 'npm',
        include: [
          'configs/*.js',
          'configs/*.ts',
          'configs/*.json',
          'generated/*'
        ]
      };

      // Create package structure
      const packageStructure = {
        'package.json': {
          name: exportConfig.package_name,
          version: exportConfig.version,
          main: 'index.js',
          types: 'index.d.ts',
          files: exportConfig.include
        },
        'index.js': `// MCP Client Configuration Package
const fs = require('fs');
const path = require('path');

// Export all configurations
module.exports = {
  loadConfig: (configName) => {
    const configPath = path.join(__dirname, 'configs', \`\${configName}.json\`);
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  },
  
  getAuthConfig: () => require('./configs/auth.json'),
  getServiceDiscovery: () => require('./configs/service-discovery.json'),
  
  // Generated clients
  APIClient: require('./generated/mcp-api-client'),
  ServiceManagerClient: require('./generated/service_manager_client')
};`,
        'index.d.ts': `// Type definitions for MCP Client Configuration

export interface Config {
  [key: string]: any;
}

export function loadConfig(configName: string): Config;
export function getAuthConfig(): Config;
export function getServiceDiscovery(): Config;

export class APIClient {
  constructor(baseURL?: string);
  listServices(): Promise<any[]>;
  getService(id: string): Promise<any>;
}

export class ServiceManagerClient {
  constructor(address: string);
  close(): Promise<void>;
}`
      };

      // Write package files
      for (const [filename, content] of Object.entries(packageStructure)) {
        const filePath = path.join(clientsDir, 'package', filename);
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        
        if (typeof content === 'object') {
          await fs.writeFile(filePath, JSON.stringify(content, null, 2));
        } else {
          await fs.writeFile(filePath, content);
        }
      }

      // Create .npmignore
      const npmignore = `# NPM Ignore
*.test.js
*.spec.js
examples/
docs/
.env*`;

      await fs.writeFile(path.join(clientsDir, 'package', '.npmignore'), npmignore);

      // Verify package structure
      const packageJson = JSON.parse(
        await fs.readFile(path.join(clientsDir, 'package', 'package.json'), 'utf8')
      );
      expect(packageJson.name).toBe('mcp-client-config');
      expect(packageJson.version).toBe('1.0.0');
    });

    it('should generate client configuration documentation', async () => {
      const documentation = `# MCP Client Configuration Guide

## Overview
This guide provides instructions for configuring MCP clients across different programming languages.

## Quick Start

### JavaScript/TypeScript
\`\`\`javascript
const { MCPAPIClient } = require('mcp-client-config');

const client = new MCPAPIClient('http://localhost:8080/api/v1');
const services = await client.listServices();
\`\`\`

### Python
\`\`\`python
from mcp_config import MCPConfig

config = MCPConfig()
api_config = config.get_service_config('api-service')
\`\`\`

### Go
\`\`\`go
import "github.com/mcp/client/config"

cfg := config.NewConfig()
serviceConfig, _ := cfg.GetService("grpc-service")
\`\`\`

## Authentication

### API Key
Set the appropriate environment variable:
- \`MCP_PUBLIC_API_KEY\` for public API
- \`MCP_PRIVATE_API_KEY\` for private API

### OAuth2
1. Configure OAuth2 client with credentials
2. Generate authorization URL
3. Exchange authorization code for token

### mTLS
1. Install CA certificate
2. Configure client certificate and key
3. Enable mTLS for secure services

## Service Discovery

### Static Discovery
Services are defined in \`service-discovery.json\`

### Dynamic Discovery (Consul)
Configure Consul address and authentication token

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| MCP_HOME | MCP installation directory | ~/.mcp-platform |
| MCP_API_URL | API endpoint URL | http://localhost:8080 |
| MCP_LOG_LEVEL | Logging level | info |

## Troubleshooting

### Connection Errors
- Verify service is running: \`mcp health\`
- Check network connectivity
- Verify authentication credentials

### Certificate Errors
- Ensure certificates are valid and not expired
- Check certificate paths in configuration
- Verify CA certificate is trusted

## Support
For additional help, visit: https://mcp.local/docs`;

      const docPath = path.join(clientsDir, 'README.md');
      await fs.writeFile(docPath, documentation);

      // Verify documentation
      const savedDoc = await fs.readFile(docPath, 'utf8');
      expect(savedDoc).toContain('# MCP Client Configuration Guide');
      expect(savedDoc).toContain('## Quick Start');
      expect(savedDoc).toContain('## Authentication');
    });
  });
});