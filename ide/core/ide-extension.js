// IDE Extension Implementation
// Purpose: Core implementation of IDE Extension interface with Language Server Protocol support

const IDEExtensionInterface = require('../../mcp-local-setup/interfaces/phase5/ide-extension.interface');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

class IDEExtension extends IDEExtensionInterface {
  constructor(sdk) {
    // Don't call super() as the interface throws
    if (!sdk) {
      throw new Error('SDK instance required');
    }
    this.sdk = sdk;
    this.languageServer = null;
    this.servicesCache = new Map();
    this.diagnosticsCache = new Map();
  }

  // Language Server Protocol
  async startLanguageServer() {
    if (this.languageServer) {
      throw new Error('Language server already running');
    }

    const serverPath = path.join(__dirname, 'language-server.js');
    const port = await this._findAvailablePort();
    
    this.languageServer = spawn('node', [serverPath, '--port', port], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, MCP_SDK_CONFIG: JSON.stringify({ apiKey: this.sdk.config?.apiKey }) }
    });

    // Wait for server to start
    await new Promise((resolve, reject) => {
      this.languageServer.stdout.once('data', (data) => {
        if (data.toString().includes('Language server started')) {
          resolve();
        }
      });
      this.languageServer.stderr.once('data', (data) => {
        reject(new Error(`Language server error: ${data}`));
      });
      setTimeout(() => reject(new Error('Language server startup timeout')), 5000);
    });

    return { port, pid: this.languageServer.pid };
  }

  async stopLanguageServer() {
    if (!this.languageServer) {
      return;
    }

    this.languageServer.kill('SIGTERM');
    await new Promise(resolve => {
      this.languageServer.on('exit', resolve);
      setTimeout(resolve, 1000); // Force resolve after 1s
    });
    
    this.languageServer = null;
  }

  // Code completion
  async getCompletions(document, position) {
    const { uri, content } = document;
    const { line, character } = position;
    
    // Get the text before cursor
    const lines = content.split('\n');
    const currentLine = lines[line] || '';
    const textBeforeCursor = currentLine.substring(0, character);
    
    const completions = [];
    
    // Check if we're completing MCP methods
    if (textBeforeCursor.match(/mcp\.\s*$/)) {
      completions.push({
        label: 'connectService',
        kind: 'Method',
        detail: 'Connect to an MCP service',
        insertText: 'connectService("$1")'
      });
      
      completions.push({
        label: 'installService',
        kind: 'Method',
        detail: 'Install an MCP service',
        insertText: 'installService("$1", $2)'
      });
      
      completions.push({
        label: 'listServices',
        kind: 'Method',
        detail: 'List available MCP services',
        insertText: 'listServices($1)'
      });
    }
    
    // Get available services from SDK
    try {
      const services = await this.sdk.listServices({});
      
      // If completing service names in quotes
      if (textBeforeCursor.match(/["'][\w-]*$/)) {
        services.forEach(service => {
          completions.push({
            label: service.id,
            kind: 'Service',
            detail: service.description || 'MCP Service',
            insertText: service.id
          });
        });
      }
      
      // If completing after mcp.
      if (textBeforeCursor.match(/mcp\.\s*$/)) {
        services.forEach(service => {
          completions.push({
            label: service.id,
            kind: 'Service',
            detail: service.description || 'MCP Service',
            insertText: `getService("${service.id}")`
          });
        });
      }
    } catch (error) {
      console.error('Error fetching services:', error);
    }
    
    return completions;
  }

  // Hover information
  async getHoverInfo(document, position) {
    const { uri, content } = document;
    const { line, character } = position;
    
    // Extract the word at position
    const lines = content.split('\n');
    const currentLine = lines[line] || '';
    
    // Find service ID in quotes
    const serviceMatch = currentLine.match(/["']([a-zA-Z0-9-_]+)["']/);
    if (serviceMatch && this._isPositionInRange(character, serviceMatch.index, serviceMatch.index + serviceMatch[0].length)) {
      const serviceId = serviceMatch[1];
      
      try {
        // Get service details from SDK
        const serviceDetails = await this.sdk.getService(serviceId);
        
        const hoverContent = [
          `**${serviceId}**`,
          '',
          serviceDetails.description || 'MCP Service',
          '',
          `Version: ${serviceDetails.version || 'unknown'}`,
          '',
          '**Configuration options:**'
        ];
        
        if (serviceDetails.config) {
          Object.entries(serviceDetails.config).forEach(([key, value]) => {
            hoverContent.push(`- \`${key}\`: ${value.description || value.type || 'any'}`);
          });
        }
        
        return {
          content: hoverContent.join('\n'),
          range: {
            start: { line, character: serviceMatch.index },
            end: { line, character: serviceMatch.index + serviceMatch[0].length }
          }
        };
      } catch (error) {
        return {
          content: `Service not found: ${serviceId}`,
          range: {
            start: { line, character: serviceMatch.index },
            end: { line, character: serviceMatch.index + serviceMatch[0].length }
          }
        };
      }
    }
    
    return null;
  }

  // Diagnostics
  async getDiagnostics(document) {
    const { uri, content } = document;
    const diagnostics = [];
    
    // Check if it's a config file
    if (uri.includes('mcp.config.json')) {
      try {
        const config = JSON.parse(content);
        
        if (config.services) {
          for (const [serviceId, serviceConfig] of Object.entries(config.services)) {
            try {
              // Check if service exists
              const serviceDetails = await this.sdk.getService(serviceId);
              
              // Validate configuration options
              if (serviceDetails.config) {
                const validOptions = Object.keys(serviceDetails.config);
                const providedOptions = Object.keys(serviceConfig);
                
                // Check for invalid options
                providedOptions.forEach(option => {
                  if (!validOptions.includes(option) && option !== 'enabled') {
                    const optionIndex = content.indexOf(`"${option}"`);
                    const line = content.substring(0, optionIndex).split('\n').length - 1;
                    
                    diagnostics.push({
                      message: `Unknown configuration option: ${option}`,
                      severity: 'warning',
                      source: 'mcp-sdk',
                      range: {
                        start: { line, character: 0 },
                        end: { line, character: 100 }
                      }
                    });
                  }
                });
              }
            } catch (error) {
              // Service not found
              const serviceIndex = content.indexOf(`"${serviceId}"`);
              const line = content.substring(0, serviceIndex).split('\n').length - 1;
              
              diagnostics.push({
                message: `Service not found: ${serviceId}`,
                severity: 'error',
                source: 'mcp-sdk',
                range: {
                  start: { line, character: 0 },
                  end: { line, character: 100 }
                }
              });
            }
          }
        }
      } catch (error) {
        if (error instanceof SyntaxError) {
          diagnostics.push({
            message: `JSON syntax error: ${error.message}`,
            severity: 'error',
            source: 'json',
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 100 }
            }
          });
        }
      }
    }
    
    // Check for missing service references in code files
    if (uri.match(/\.(js|ts|py)$/)) {
      const serviceReferences = content.matchAll(/["']([a-zA-Z0-9-_]+)["']/g);
      
      for (const match of serviceReferences) {
        const serviceId = match[1];
        
        // Skip if it doesn't look like a service ID
        if (!serviceId.includes('-mcp') && !serviceId.includes('_mcp')) {
          continue;
        }
        
        try {
          await this.sdk.getService(serviceId);
        } catch (error) {
          const index = match.index;
          const line = content.substring(0, index).split('\n').length - 1;
          
          diagnostics.push({
            message: `Service not installed: ${serviceId}`,
            severity: 'error',
            source: 'mcp-sdk',
            range: {
              start: { line, character: 0 },
              end: { line, character: 100 }
            }
          });
        }
      }
    }
    
    return diagnostics;
  }

  // Code actions
  async getCodeActions(document, range, context) {
    const { uri, content } = document;
    const { diagnostics } = context;
    const codeActions = [];
    
    // Check for service not installed errors
    for (const diagnostic of diagnostics) {
      if (diagnostic.message.startsWith('Service not installed:')) {
        const serviceId = diagnostic.message.split(': ')[1];
        
        codeActions.push({
          title: `Install ${serviceId} service`,
          kind: 'quickfix',
          command: {
            command: 'mcp.installService',
            arguments: [serviceId, { source: 'ide' }]
          },
          diagnostics: [diagnostic]
        });
      }
      
      if (diagnostic.message.startsWith('Unknown configuration option:')) {
        const option = diagnostic.message.split(': ')[1];
        
        codeActions.push({
          title: `Remove unknown option: ${option}`,
          kind: 'quickfix',
          command: {
            command: 'mcp.removeConfigOption',
            arguments: [option]
          },
          diagnostics: [diagnostic]
        });
      }
    }
    
    return codeActions;
  }

  // Commands
  async executeCommand(command, args) {
    switch (command) {
      case 'mcp.installService': {
        const [serviceId, options] = args;
        return await this.sdk.installService(serviceId, options);
      }
      
      case 'mcp.removeConfigOption': {
        // This would be handled by the IDE's text editor
        return { success: true };
      }
      
      case 'mcp.showServicePanel': {
        await this.showServicePanel();
        return { success: true };
      }
      
      case 'mcp.refreshServices': {
        this.servicesCache.clear();
        return { success: true };
      }
      
      default:
        throw new Error(`Unknown command: ${command}`);
    }
  }

  // Service management UI
  async showServicePanel() {
    // In a real implementation, this would open a UI panel
    // For now, we'll just prepare the data
    const services = await this.sdk.listServices({});
    const healthPromises = services.map(async service => {
      try {
        const health = await this.sdk.getHealth(service.id);
        return { ...service, health };
      } catch (error) {
        return { ...service, health: { status: 'unknown', details: {} } };
      }
    });
    
    const servicesWithHealth = await Promise.all(healthPromises);
    
    // Store for UI access
    this.servicesCache.set('panel', servicesWithHealth);
    
    return servicesWithHealth;
  }

  async showServiceDetails(serviceId) {
    const service = await this.sdk.getService(serviceId);
    const health = await this.sdk.getHealth(serviceId);
    
    const details = {
      ...service,
      health,
      endpoints: [],
      logs: []
    };
    
    // Try to get additional service info
    try {
      const endpoints = await this.sdk.callService(serviceId, 'getEndpoints', {});
      details.endpoints = endpoints;
    } catch (error) {
      // Service might not support this method
    }
    
    // Store for UI access
    this.servicesCache.set(serviceId, details);
    
    return details;
  }

  // Debugging
  async startDebugging(config) {
    const { serviceId, breakpoints } = config;
    
    // Get debug endpoint from service
    let debugEndpoint;
    try {
      debugEndpoint = await this.sdk.callService(serviceId, 'getDebugEndpoint', {});
    } catch (error) {
      throw new Error(`Service ${serviceId} does not support debugging`);
    }
    
    const sessionId = `debug-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Store session info
    this.debugSessions = this.debugSessions || new Map();
    this.debugSessions.set(sessionId, {
      serviceId,
      breakpoints,
      debugEndpoint,
      startTime: new Date()
    });
    
    return { sessionId };
  }

  async stopDebugging(sessionId) {
    if (!this.debugSessions || !this.debugSessions.has(sessionId)) {
      throw new Error(`Debug session not found: ${sessionId}`);
    }
    
    const session = this.debugSessions.get(sessionId);
    
    // Notify service to stop debugging
    try {
      await this.sdk.callService(session.serviceId, 'stopDebugSession', { sessionId });
    } catch (error) {
      // Service might not support this method
    }
    
    this.debugSessions.delete(sessionId);
  }

  // Helper methods
  _isPositionInRange(position, start, end) {
    return position >= start && position <= end;
  }

  async _findAvailablePort() {
    // Simple port finder
    const net = require('net');
    const server = net.createServer();
    
    return new Promise((resolve, reject) => {
      server.listen(0, () => {
        const port = server.address().port;
        server.close(() => resolve(port));
      });
      server.on('error', reject);
    });
  }
}

module.exports = IDEExtension;