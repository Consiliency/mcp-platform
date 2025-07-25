#!/usr/bin/env node

const axios = require('axios');
const chalk = require('chalk');
const Table = require('cli-table3');
const ora = require('ora');
const inquirer = require('inquirer');
const { convertServerTransport } = require('./transport');

const API_GATEWAY_URL = process.env.API_GATEWAY_URL || 'http://localhost:8080';

/**
 * Get server status color
 */
function getServerStatusColor(status) {
  switch (status) {
    case 'running':
    case 'healthy':
      return chalk.green('● ' + status);
    case 'starting':
    case 'stopping':
      return chalk.yellow('● ' + status);
    case 'stopped':
    case 'error':
      return chalk.red('● ' + status);
    default:
      return chalk.gray('● ' + status);
  }
}

/**
 * Format transport type
 */
function formatTransportType(type) {
  const badges = {
    'stdio': chalk.blue('[STDIO]'),
    'http': chalk.green('[HTTP]'),
    'ws': chalk.cyan('[WebSocket]'),
    'grpc': chalk.magenta('[gRPC]'),
    'docker': chalk.yellow('[Docker]'),
    'ssh': chalk.red('[SSH]')
  };
  return badges[type] || chalk.gray(`[${type.toUpperCase()}]`);
}

/**
 * Start server with specific transport
 */
async function startServerWithTransport(serverId, transportType, options) {
  const spinner = ora(`Starting ${serverId} with ${transportType} transport...`).start();
  
  try {
    // Prepare server configuration
    const config = {
      serverId,
      transport: transportType,
      detached: options.detach || false,
      environment: {}
    };
    
    // Add any environment variables
    if (options.env) {
      options.env.forEach(envVar => {
        const [key, value] = envVar.split('=');
        if (key && value) {
          config.environment[key] = value;
        }
      });
    }
    
    // Set transport-specific options
    if (options.port) {
      config.transportOptions = { port: parseInt(options.port) };
    }
    
    // Start the server
    const response = await axios.post(`${API_GATEWAY_URL}/api/servers/start`, config);
    
    spinner.stop();
    
    if (response.data.success) {
      console.log(chalk.green(`✓ Server ${serverId} started with ${transportType} transport`));
      
      // Display connection info
      if (response.data.connectionInfo) {
        console.log('\n' + chalk.bold('Connection Information:'));
        const info = response.data.connectionInfo;
        
        switch (transportType) {
          case 'http':
            console.log(`  URL: ${info.url}`);
            console.log(`  Method: POST`);
            console.log(`  Headers: Content-Type: application/json`);
            break;
            
          case 'ws':
            console.log(`  WebSocket URL: ${info.wsUrl}`);
            console.log(`  Protocol: ${info.protocol || 'mcp'}`);
            break;
            
          case 'stdio':
            console.log(`  Command: ${info.command}`);
            console.log(`  Args: ${info.args?.join(' ') || 'none'}`);
            break;
            
          case 'docker':
            console.log(`  Container: ${info.containerId}`);
            console.log(`  Network: ${info.network || 'bridge'}`);
            break;
            
          default:
            console.log(JSON.stringify(info, null, 2));
        }
      }
      
      if (options.detach) {
        console.log(chalk.yellow('\n⚠ Server running in detached mode'));
        console.log(`Use 'mcp server logs ${serverId}' to view logs`);
      }
    } else {
      console.log(chalk.red(`✗ Failed to start server: ${response.data.error}`));
    }
    
  } catch (error) {
    spinner.fail('Failed to start server');
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  }
}

/**
 * List all servers with transport info
 */
async function listServers(options) {
  const spinner = ora('Fetching server list...').start();
  
  try {
    const response = await axios.get(`${API_GATEWAY_URL}/api/servers`);
    const servers = response.data.servers || [];
    
    spinner.stop();
    
    // Create table
    const table = new Table({
      head: [
        chalk.bold('Server ID'),
        chalk.bold('Name'),
        chalk.bold('Transport'),
        chalk.bold('Status'),
        chalk.bold('Uptime'),
        chalk.bold('Connections')
      ],
      style: {
        head: ['cyan']
      }
    });
    
    // Add server rows
    for (const server of servers) {
      table.push([
        server.id,
        server.name || 'N/A',
        formatTransportType(server.transport),
        getServerStatusColor(server.status),
        server.uptime || 'N/A',
        server.connections || 0
      ]);
    }
    
    console.log('\n' + chalk.bold('MCP Servers'));
    console.log(table.toString());
    
    // Show summary
    const summary = response.data.summary || {};
    console.log('\n' + chalk.bold('Summary:'));
    console.log(`  Total Servers: ${summary.total || 0}`);
    console.log(`  Running: ${chalk.green(summary.running || 0)}`);
    console.log(`  Stopped: ${chalk.red(summary.stopped || 0)}`);
    
  } catch (error) {
    spinner.fail('Failed to fetch servers');
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  }
}

/**
 * Show server details including transport info
 */
async function showServerDetails(serverId) {
  const spinner = ora(`Fetching details for ${serverId}...`).start();
  
  try {
    const response = await axios.get(`${API_GATEWAY_URL}/api/servers/${serverId}`);
    const server = response.data;
    
    spinner.stop();
    
    console.log('\n' + chalk.bold(`Server: ${server.name || serverId}`));
    console.log('━'.repeat(50));
    console.log(`ID: ${server.id}`);
    console.log(`Status: ${getServerStatusColor(server.status)}`);
    console.log(`Transport: ${formatTransportType(server.transport)}`);
    console.log(`Version: ${server.version || 'unknown'}`);
    console.log(`Started: ${server.startedAt ? new Date(server.startedAt).toLocaleString() : 'N/A'}`);
    console.log(`Uptime: ${server.uptime || 'N/A'}`);
    
    // Transport details
    if (server.transportConfig) {
      console.log('\n' + chalk.bold('Transport Configuration:'));
      console.log(JSON.stringify(server.transportConfig, null, 2));
    }
    
    // Connection info
    if (server.connectionInfo) {
      console.log('\n' + chalk.bold('Connection Information:'));
      console.log(JSON.stringify(server.connectionInfo, null, 2));
    }
    
    // Statistics
    if (server.stats) {
      console.log('\n' + chalk.bold('Statistics:'));
      console.log(`  Total Connections: ${server.stats.totalConnections || 0}`);
      console.log(`  Active Connections: ${server.stats.activeConnections || 0}`);
      console.log(`  Messages Processed: ${server.stats.messagesProcessed || 0}`);
      console.log(`  Errors: ${server.stats.errors || 0}`);
    }
    
    // Capabilities
    if (server.capabilities && server.capabilities.length > 0) {
      console.log('\n' + chalk.bold('Capabilities:'));
      server.capabilities.forEach(cap => {
        console.log(`  - ${cap}`);
      });
    }
    
  } catch (error) {
    spinner.fail('Failed to fetch server details');
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  }
}

/**
 * Stop a server
 */
async function stopServer(serverId, options) {
  const spinner = ora(`Stopping ${serverId}...`).start();
  
  try {
    const response = await axios.post(`${API_GATEWAY_URL}/api/servers/${serverId}/stop`, {
      force: options.force || false,
      timeout: options.timeout || 30000
    });
    
    spinner.stop();
    
    if (response.data.success) {
      console.log(chalk.green(`✓ Server ${serverId} stopped successfully`));
    } else {
      console.log(chalk.red(`✗ Failed to stop server: ${response.data.error}`));
    }
    
  } catch (error) {
    spinner.fail('Failed to stop server');
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  }
}

/**
 * Restart a server
 */
async function restartServer(serverId, options) {
  const spinner = ora(`Restarting ${serverId}...`).start();
  
  try {
    // First stop the server
    spinner.text = `Stopping ${serverId}...`;
    await axios.post(`${API_GATEWAY_URL}/api/servers/${serverId}/stop`, {
      force: false,
      timeout: 30000
    });
    
    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Then start it again
    spinner.text = `Starting ${serverId}...`;
    const response = await axios.post(`${API_GATEWAY_URL}/api/servers/${serverId}/start`);
    
    spinner.stop();
    
    if (response.data.success) {
      console.log(chalk.green(`✓ Server ${serverId} restarted successfully`));
      
      if (response.data.connectionInfo) {
        console.log('\n' + chalk.bold('Connection Information:'));
        console.log(JSON.stringify(response.data.connectionInfo, null, 2));
      }
    } else {
      console.log(chalk.red(`✗ Failed to restart server: ${response.data.error}`));
    }
    
  } catch (error) {
    spinner.fail('Failed to restart server');
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  }
}

/**
 * Show server logs
 */
async function showServerLogs(serverId, options) {
  try {
    const params = new URLSearchParams();
    if (options.lines) params.append('lines', options.lines);
    if (options.since) params.append('since', options.since);
    if (options.filter) params.append('filter', options.filter);
    
    if (options.follow) {
      // Stream logs
      console.log(chalk.blue(`Following logs for ${serverId}...`));
      console.log(chalk.gray('Press Ctrl+C to stop'));
      console.log('━'.repeat(50));
      
      // In a real implementation, this would use WebSocket or SSE for streaming
      // For now, we'll poll the endpoint
      const pollLogs = async () => {
        try {
          const response = await axios.get(`${API_GATEWAY_URL}/api/servers/${serverId}/logs?${params}`);
          const logs = response.data.logs || [];
          
          logs.forEach(log => {
            const timestamp = new Date(log.timestamp).toLocaleTimeString();
            const level = log.level || 'info';
            const levelColor = {
              'error': chalk.red,
              'warn': chalk.yellow,
              'info': chalk.blue,
              'debug': chalk.gray
            }[level] || chalk.white;
            
            console.log(`${chalk.gray(timestamp)} ${levelColor(level.toUpperCase())} ${log.message}`);
          });
          
          // Update 'since' parameter for next poll
          if (logs.length > 0) {
            params.set('since', logs[logs.length - 1].timestamp);
          }
          
          // Poll again after 1 second
          setTimeout(pollLogs, 1000);
        } catch (error) {
          console.error(chalk.red('Error fetching logs:', error.message));
        }
      };
      
      pollLogs();
    } else {
      // Fetch logs once
      const response = await axios.get(`${API_GATEWAY_URL}/api/servers/${serverId}/logs?${params}`);
      const logs = response.data.logs || [];
      
      console.log(chalk.blue(`Logs for ${serverId}`));
      console.log('━'.repeat(50));
      
      logs.forEach(log => {
        const timestamp = new Date(log.timestamp).toLocaleTimeString();
        const level = log.level || 'info';
        const levelColor = {
          'error': chalk.red,
          'warn': chalk.yellow,
          'info': chalk.blue,
          'debug': chalk.gray
        }[level] || chalk.white;
        
        console.log(`${chalk.gray(timestamp)} ${levelColor(level.toUpperCase())} ${log.message}`);
      });
      
      if (logs.length === 0) {
        console.log(chalk.gray('No logs available'));
      }
    }
    
  } catch (error) {
    console.error(chalk.red('Failed to fetch logs:', error.message));
    process.exit(1);
  }
}

/**
 * Add server command to CLI
 */
function addServerCommand(program) {
  const server = program
    .command('server')
    .description('Manage MCP servers');
  
  // List servers
  server
    .command('list')
    .description('List all MCP servers')
    .option('--json', 'Output in JSON format')
    .action(async (options) => {
      if (options.json) {
        try {
          const response = await axios.get(`${API_GATEWAY_URL}/api/servers`);
          console.log(JSON.stringify(response.data, null, 2));
        } catch (error) {
          console.error(JSON.stringify({ error: error.message }));
          process.exit(1);
        }
      } else {
        await listServers(options);
      }
    });
  
  // Start server
  server
    .command('start <server-id>')
    .description('Start an MCP server')
    .option('-t, --transport <type>', 'Transport type (stdio, http, ws, grpc, docker, ssh)', 'stdio')
    .option('-d, --detach', 'Run in detached mode')
    .option('-p, --port <port>', 'Port for HTTP/WebSocket transports')
    .option('-e, --env <vars...>', 'Environment variables (KEY=value)')
    .action(async (serverId, options) => {
      await startServerWithTransport(serverId, options.transport, options);
    });
  
  // Stop server
  server
    .command('stop <server-id>')
    .description('Stop an MCP server')
    .option('-f, --force', 'Force stop without graceful shutdown')
    .option('-t, --timeout <ms>', 'Shutdown timeout in milliseconds', '30000')
    .action(async (serverId, options) => {
      await stopServer(serverId, options);
    });
  
  // Restart server
  server
    .command('restart <server-id>')
    .description('Restart an MCP server')
    .action(async (serverId, options) => {
      await restartServer(serverId, options);
    });
  
  // Server details
  server
    .command('info <server-id>')
    .description('Show detailed information about a server')
    .option('--json', 'Output in JSON format')
    .action(async (serverId, options) => {
      if (options.json) {
        try {
          const response = await axios.get(`${API_GATEWAY_URL}/api/servers/${serverId}`);
          console.log(JSON.stringify(response.data, null, 2));
        } catch (error) {
          console.error(JSON.stringify({ error: error.message }));
          process.exit(1);
        }
      } else {
        await showServerDetails(serverId);
      }
    });
  
  // Server logs
  server
    .command('logs <server-id>')
    .description('Show server logs')
    .option('-f, --follow', 'Follow log output')
    .option('-n, --lines <lines>', 'Number of lines to show', '50')
    .option('-s, --since <time>', 'Show logs since timestamp')
    .option('--filter <pattern>', 'Filter logs by pattern')
    .action(async (serverId, options) => {
      await showServerLogs(serverId, options);
    });
  
  // Convert transport
  server
    .command('convert <server-id> <new-transport>')
    .description('Convert server to use a different transport')
    .action(async (serverId, newTransport) => {
      await convertServerTransport(serverId, newTransport);
    });
}

module.exports = {
  addServerCommand,
  startServerWithTransport,
  listServers,
  showServerDetails
};