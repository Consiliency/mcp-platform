const fs = require('fs').promises;
const path = require('path');

class ManifestGenerator {
  constructor(gatewayService) {
    this.gatewayService = gatewayService;
    this.manifestPath = path.join(
      process.env.MCP_HOME || path.join(process.env.HOME, '.mcp-platform'),
      '.well-known',
      'mcp-manifest.json'
    );
  }
  
  generateManifest() {
    const tools = this.gatewayService.getAllToolsSync();
    const servers = Array.from(this.gatewayService.servers.values());
    
    const manifest = {
      version: '1.0',
      protocol: 'mcp',
      gateway: {
        name: 'MCP Unified Gateway',
        version: '1.0.0',
        description: 'Unified access point for all MCP servers',
        endpoint: `http://localhost:${process.env.GATEWAY_PORT || 8090}/mcp`,
        authentication: {
          type: 'api-key',
          header: 'X-API-Key'
        }
      },
      servers: servers.map(server => ({
        id: server.id,
        name: server.name,
        transport: server.transport.type,
        status: this.gatewayService.bridge.getServerStatus(server.id)?.status || 'stopped'
      })),
      tools: tools.map(tool => ({
        name: tool.namespacedName,
        description: tool.description || `${tool.originalName} from ${tool.serverId}`,
        serverId: tool.serverId,
        inputSchema: tool.inputSchema || {
          type: 'object',
          properties: {},
          additionalProperties: true
        }
      })),
      capabilities: {
        tools: true,
        prompts: false, // Will be added later
        resources: false, // Will be added later
        namespacing: 'serverId:toolName',
        conflictResolution: 'automatic'
      },
      metadata: {
        generatedAt: new Date().toISOString(),
        totalTools: tools.length,
        activeServers: servers.filter(s => {
          const status = this.gatewayService.bridge.getServerStatus(s.id);
          return status && status.status === 'running';
        }).length,
        totalServers: servers.length
      }
    };
    
    return manifest;
  }
  
  async saveManifest() {
    const manifest = this.generateManifest();
    
    try {
      const dir = path.dirname(this.manifestPath);
      await fs.mkdir(dir, { recursive: true });
      
      await fs.writeFile(
        this.manifestPath,
        JSON.stringify(manifest, null, 2)
      );
      
      console.log('Saved MCP manifest to', this.manifestPath);
      return true;
    } catch (error) {
      console.error('Failed to save manifest:', error);
      return false;
    }
  }
  
  // Generate client-specific manifests
  generateClientManifest(clientType) {
    const baseManifest = this.generateManifest();
    
    switch (clientType) {
      case 'claude-code':
        return {
          ...baseManifest,
          client: {
            type: 'claude-code',
            configuration: {
              command: 'claude mcp add unified-gateway --transport sse',
              url: baseManifest.gateway.endpoint,
              headers: {
                'X-API-Key': '<your-gateway-api-key>'
              }
            },
            example: `claude mcp add unified-gateway --transport sse ${baseManifest.gateway.endpoint} --header "X-API-Key: your-key"`
          }
        };
        
      case 'cursor':
        return {
          ...baseManifest,
          client: {
            type: 'cursor',
            configuration: {
              file: '.cursor/mcp.json',
              content: {
                mcpServers: {
                  'unified-gateway': {
                    type: 'sse',
                    url: baseManifest.gateway.endpoint,
                    headers: {
                      'X-API-Key': '<your-gateway-api-key>'
                    }
                  }
                }
              }
            }
          }
        };
        
      case 'claude-desktop':
        return {
          ...baseManifest,
          client: {
            type: 'claude-desktop',
            configuration: {
              file: 'claude_desktop_config.json',
              content: {
                mcpServers: {
                  'unified-gateway': {
                    type: 'sse',
                    url: baseManifest.gateway.endpoint,
                    headers: {
                      'X-API-Key': '<your-gateway-api-key>'
                    }
                  }
                }
              }
            }
          }
        };
        
      case 'vscode':
        return {
          ...baseManifest,
          client: {
            type: 'vscode',
            configuration: {
              file: '.vscode/mcp.json',
              content: {
                mcp: {
                  servers: {
                    'unified-gateway': {
                      type: 'sse',
                      url: baseManifest.gateway.endpoint,
                      headers: {
                        'X-API-Key': '<your-gateway-api-key>'
                      }
                    }
                  }
                }
              }
            }
          }
        };
        
      case 'chatgpt':
        return {
          ...baseManifest,
          client: {
            type: 'chatgpt',
            note: 'ChatGPT requires custom connector setup',
            configuration: {
              connectorType: 'custom',
              url: baseManifest.gateway.endpoint,
              requiredTools: ['search', 'fetch'],
              authentication: {
                type: 'custom-header',
                header: 'X-API-Key'
              }
            }
          }
        };
        
      default:
        return baseManifest;
    }
  }
  
  // Get example tool calls
  getExampleToolCalls() {
    const tools = this.gatewayService.getAllToolsSync();
    const examples = [];
    
    // Get up to 3 example tools
    const sampleTools = tools.slice(0, 3);
    
    for (const tool of sampleTools) {
      examples.push({
        tool: tool.namespacedName,
        description: tool.description,
        example: {
          jsonrpc: '2.0',
          id: 'example-1',
          method: 'tools/call',
          params: {
            name: tool.namespacedName,
            arguments: tool.inputSchema?.properties ? 
              Object.keys(tool.inputSchema.properties).reduce((acc, key) => {
                acc[key] = '<value>';
                return acc;
              }, {}) : {}
          }
        }
      });
    }
    
    return examples;
  }
}

module.exports = ManifestGenerator;