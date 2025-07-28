#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');

// MCP server that uses PowerShell for screenshots
class WindowsScreenshotServer {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    });
    
    this.lastScreenshot = null;
  }
  
  async start() {
    this.rl.on('line', async (line) => {
      try {
        const message = JSON.parse(line);
        const response = await this.handleMessage(message);
        console.log(JSON.stringify(response));
      } catch (error) {
        console.error('Error handling message:', error);
        console.log(JSON.stringify({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: error.message
          }
        }));
      }
    });
    
    // Log to stderr so it doesn't interfere with JSON-RPC
    console.error('Windows Screenshot MCP Server running on stdio');
  }
  
  async handleMessage(message) {
    switch (message.method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          id: message.id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {}
            },
            serverInfo: {
              name: 'windows-screenshot',
              version: '1.0.0'
            }
          }
        };
        
      case 'tools/list':
        return {
          jsonrpc: '2.0',
          id: message.id,
          result: {
            tools: [
              {
                name: 'TakeScreenshot',
                description: 'Takes a screenshot using Windows native APIs',
                inputSchema: {
                  type: 'object',
                  properties: {},
                  required: []
                }
              },
              {
                name: 'GetLastScreenshot',
                description: 'Returns the last screenshot taken',
                inputSchema: {
                  type: 'object',
                  properties: {},
                  required: []
                }
              }
            ]
          }
        };
        
      case 'tools/call':
        return this.handleToolCall(message);
        
      default:
        return {
          jsonrpc: '2.0',
          id: message.id,
          error: {
            code: -32601,
            message: `Method not found: ${message.method}`
          }
        };
    }
  }
  
  async handleToolCall(message) {
    const { name, arguments: args } = message.params;
    
    switch (name) {
      case 'TakeScreenshot':
        return this.takeScreenshot(message.id);
        
      case 'GetLastScreenshot':
        return this.getLastScreenshot(message.id);
        
      default:
        return {
          jsonrpc: '2.0',
          id: message.id,
          error: {
            code: -32602,
            message: `Unknown tool: ${name}`
          }
        };
    }
  }
  
  async takeScreenshot(id) {
    return new Promise((resolve) => {
      const scriptPath = path.join(__dirname, 'screenshot-wrapper.ps1');
      const ps = spawn('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', scriptPath,
        '-Format', 'Base64'
      ]);
      
      let output = '';
      let error = '';
      
      ps.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      ps.stderr.on('data', (data) => {
        error += data.toString();
      });
      
      ps.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(output);
            if (result.success) {
              this.lastScreenshot = result.data;
              resolve({
                jsonrpc: '2.0',
                id: id,
                result: {
                  content: [
                    {
                      type: 'image',
                      data: result.data,
                      mimeType: 'image/png'
                    }
                  ]
                }
              });
            } else {
              resolve({
                jsonrpc: '2.0',
                id: id,
                error: {
                  code: -32603,
                  message: result.error || 'Screenshot failed'
                }
              });
            }
          } catch (e) {
            resolve({
              jsonrpc: '2.0',
              id: id,
              error: {
                code: -32603,
                message: `Failed to parse PowerShell output: ${e.message}`
              }
            });
          }
        } else {
          resolve({
            jsonrpc: '2.0',
            id: id,
            error: {
              code: -32603,
              message: `PowerShell exited with code ${code}: ${error}`
            }
          });
        }
      });
    });
  }
  
  getLastScreenshot(id) {
    if (this.lastScreenshot) {
      return {
        jsonrpc: '2.0',
        id: id,
        result: {
          content: [
            {
              type: 'image',
              data: this.lastScreenshot,
              mimeType: 'image/png'
            }
          ]
        }
      };
    } else {
      return {
        jsonrpc: '2.0',
        id: id,
        error: {
          code: -32603,
          message: 'No screenshot available'
        }
      };
    }
  }
}

// Start the server
const server = new WindowsScreenshotServer();
server.start();