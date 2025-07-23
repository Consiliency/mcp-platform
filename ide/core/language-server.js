#!/usr/bin/env node
// MCP Language Server
// Purpose: Language Server Protocol implementation for MCP IDE integration

const { createServer } = require('vscode-languageserver/node');
const { TextDocuments } = require('vscode-languageserver/node');
const { TextDocument } = require('vscode-languageserver-textdocument');

// Parse command line arguments
const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const port = portIndex !== -1 ? parseInt(args[portIndex + 1]) : 0;

// Create LSP connection
const connection = createServer();

// Create a simple text document manager
const documents = new TextDocuments(TextDocument);

// MCP SDK instance (would be initialized from config)
let mcpSDK = null;

// Initialize the language server
connection.onInitialize((params) => {
  console.log('Language server started');
  
  return {
    capabilities: {
      textDocumentSync: 1, // Full document sync
      completionProvider: {
        resolveProvider: true,
        triggerCharacters: ['.', '"', "'"]
      },
      hoverProvider: true,
      diagnosticProvider: {
        interFileDependencies: false,
        workspaceDiagnostics: false
      },
      codeActionProvider: true,
      executeCommandProvider: {
        commands: [
          'mcp.installService',
          'mcp.removeConfigOption',
          'mcp.showServicePanel',
          'mcp.refreshServices'
        ]
      }
    }
  };
});

// Handle completion requests
connection.onCompletion(async (params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];
  
  const position = params.position;
  const line = document.getText({
    start: { line: position.line, character: 0 },
    end: position
  });
  
  const completions = [];
  
  // Basic MCP method completions
  if (line.endsWith('mcp.')) {
    completions.push(
      {
        label: 'connectService',
        kind: 2, // Method
        detail: 'Connect to an MCP service',
        insertText: 'connectService("$1")',
        insertTextFormat: 2 // Snippet
      },
      {
        label: 'installService',
        kind: 2,
        detail: 'Install an MCP service',
        insertText: 'installService("$1", $2)',
        insertTextFormat: 2
      },
      {
        label: 'listServices',
        kind: 2,
        detail: 'List available MCP services',
        insertText: 'listServices($1)',
        insertTextFormat: 2
      }
    );
  }
  
  // Service name completions
  if (line.match(/["'][^"']*$/)) {
    // In a real implementation, we'd get this from the SDK
    const services = [
      { id: 'postgres-mcp', description: 'PostgreSQL MCP service' },
      { id: 'mysql-mcp', description: 'MySQL MCP service' },
      { id: 'redis-mcp', description: 'Redis MCP service' }
    ];
    
    services.forEach(service => {
      completions.push({
        label: service.id,
        kind: 12, // Value
        detail: service.description,
        insertText: service.id
      });
    });
  }
  
  return completions;
});

// Handle hover requests
connection.onHover(async (params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;
  
  const position = params.position;
  const line = document.getText({
    start: { line: position.line, character: 0 },
    end: { line: position.line + 1, character: 0 }
  });
  
  // Find service references
  const serviceMatch = line.match(/["']([a-zA-Z0-9-_]+)["']/);
  if (serviceMatch) {
    const serviceId = serviceMatch[1];
    const startChar = line.indexOf(serviceMatch[0]);
    const endChar = startChar + serviceMatch[0].length;
    
    if (position.character >= startChar && position.character <= endChar) {
      // In a real implementation, we'd get this from the SDK
      const serviceInfo = {
        'postgres-mcp': {
          description: 'PostgreSQL database service',
          version: '14.5',
          config: {
            host: 'string',
            port: 'number',
            database: 'string'
          }
        }
      }[serviceId];
      
      if (serviceInfo) {
        const content = [
          `**${serviceId}**`,
          '',
          serviceInfo.description,
          '',
          `Version: ${serviceInfo.version}`,
          '',
          '**Configuration options:**'
        ];
        
        Object.entries(serviceInfo.config).forEach(([key, type]) => {
          content.push(`- \`${key}\`: ${type}`);
        });
        
        return {
          contents: {
            kind: 'markdown',
            value: content.join('\n')
          },
          range: {
            start: { line: position.line, character: startChar },
            end: { line: position.line, character: endChar }
          }
        };
      }
    }
  }
  
  return null;
});

// Handle diagnostics
connection.languages.diagnostics.on(async (params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return { items: [] };
  
  const diagnostics = [];
  const text = document.getText();
  
  // Check for MCP configuration files
  if (params.textDocument.uri.includes('mcp.config.json')) {
    try {
      const config = JSON.parse(text);
      
      if (config.services) {
        Object.entries(config.services).forEach(([serviceId, serviceConfig]) => {
          // Check if service exists (mock check)
          const knownServices = ['postgres-mcp', 'mysql-mcp', 'redis-mcp'];
          if (!knownServices.includes(serviceId)) {
            const serviceIndex = text.indexOf(`"${serviceId}"`);
            const position = document.positionAt(serviceIndex);
            
            diagnostics.push({
              range: {
                start: position,
                end: { line: position.line, character: position.character + serviceId.length + 2 }
              },
              severity: 1, // Error
              message: `Service not found: ${serviceId}`,
              source: 'mcp-sdk'
            });
          }
        });
      }
    } catch (error) {
      diagnostics.push({
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 0 }
        },
        severity: 1,
        message: `JSON syntax error: ${error.message}`,
        source: 'json'
      });
    }
  }
  
  return { items: diagnostics };
});

// Handle code actions
connection.onCodeAction(async (params) => {
  const codeActions = [];
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];
  
  params.context.diagnostics.forEach(diagnostic => {
    if (diagnostic.message.startsWith('Service not found:')) {
      const serviceId = diagnostic.message.split(': ')[1];
      
      codeActions.push({
        title: `Install ${serviceId} service`,
        kind: 'quickfix',
        diagnostics: [diagnostic],
        command: {
          command: 'mcp.installService',
          arguments: [serviceId, { source: 'ide' }]
        }
      });
    }
  });
  
  return codeActions;
});

// Handle command execution
connection.onExecuteCommand(async (params) => {
  const { command, arguments: args } = params;
  
  switch (command) {
    case 'mcp.installService':
      // In a real implementation, this would use the SDK
      connection.window.showInformationMessage(`Installing service: ${args[0]}`);
      return { success: true };
      
    case 'mcp.showServicePanel':
      connection.window.showInformationMessage('Opening service panel...');
      return { success: true };
      
    default:
      throw new Error(`Unknown command: ${command}`);
  }
});

// Make the text document manager listen on the connection
documents.listen(connection);

// Listen on the connection
connection.listen();

// Log that we're ready
console.log('MCP Language Server running on port', port || 'stdio');