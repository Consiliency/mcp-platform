#!/usr/bin/env node

const axios = require('axios');
const chalk = require('chalk');
const Table = require('cli-table3');
const ora = require('ora');
const inquirer = require('inquirer');

const API_GATEWAY_URL = process.env.API_GATEWAY_URL || 'http://localhost:8080';
const REGISTRY_URL = process.env.REGISTRY_URL || 'http://localhost:3002';

/**
 * Get transport status color
 */
function getTransportStatusColor(status) {
  switch (status) {
    case 'connected':
    case 'active':
      return chalk.green('● ' + status);
    case 'connecting':
    case 'initializing':
      return chalk.yellow('● ' + status);
    case 'disconnected':
    case 'error':
      return chalk.red('● ' + status);
    default:
      return chalk.gray('● ' + status);
  }
}

/**
 * Format transport type badge
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
 * List all available transports
 */
async function listTransports() {
  const spinner = ora('Fetching available transports...').start();
  
  try {
    // Get transport schemas from registry
    const response = await axios.get(`${REGISTRY_URL}/api/transports`);
    const transports = response.data.transports || [];
    
    spinner.stop();
    
    // Create table
    const table = new Table({
      head: [
        chalk.bold('Transport'),
        chalk.bold('Type'),
        chalk.bold('Description'),
        chalk.bold('Status'),
        chalk.bold('Features')
      ],
      style: {
        head: ['cyan']
      }
    });
    
    // Add transport rows
    for (const transport of transports) {
      const features = [];
      if (transport.features?.bidirectional) features.push('Bidirectional');
      if (transport.features?.streaming) features.push('Streaming');
      if (transport.features?.multiplexing) features.push('Multiplexing');
      
      table.push([
        transport.id,
        formatTransportType(transport.type),
        transport.description || 'No description',
        getTransportStatusColor(transport.status || 'available'),
        features.join(', ') || 'None'
      ]);
    }
    
    console.log('\n' + chalk.bold('Available Transports'));
    console.log(table.toString());
    
  } catch (error) {
    spinner.fail('Failed to fetch transports');
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  }
}

/**
 * Show transport connection status
 */
async function showTransportStatus() {
  const spinner = ora('Checking transport connections...').start();
  
  try {
    // Get server transport status from API gateway
    const response = await axios.get(`${API_GATEWAY_URL}/api/transports/status`);
    const connections = response.data.connections || [];
    
    spinner.stop();
    
    // Create table
    const table = new Table({
      head: [
        chalk.bold('Server'),
        chalk.bold('Transport'),
        chalk.bold('Status'),
        chalk.bold('Connected'),
        chalk.bold('Messages'),
        chalk.bold('Errors')
      ],
      style: {
        head: ['cyan']
      }
    });
    
    // Add connection rows
    for (const conn of connections) {
      table.push([
        conn.serverId,
        formatTransportType(conn.transport),
        getTransportStatusColor(conn.status),
        conn.connectedAt ? new Date(conn.connectedAt).toLocaleTimeString() : 'N/A',
        conn.stats?.messageCount || 0,
        conn.stats?.errorCount || 0
      ]);
    }
    
    console.log('\n' + chalk.bold('Transport Connection Status'));
    console.log(table.toString());
    
    // Show summary
    const summary = response.data.summary || {};
    console.log('\n' + chalk.bold('Summary:'));
    console.log(`  Total Connections: ${summary.total || 0}`);
    console.log(`  Active: ${chalk.green(summary.active || 0)}`);
    console.log(`  Inactive: ${chalk.red(summary.inactive || 0)}`);
    
  } catch (error) {
    spinner.fail('Failed to check transport status');
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  }
}

/**
 * Test transport connectivity
 */
async function testTransport(transportType) {
  const spinner = ora(`Testing ${transportType} transport...`).start();
  
  try {
    // Run transport diagnostics
    const response = await axios.post(`${API_GATEWAY_URL}/api/transports/test`, {
      transport: transportType,
      timeout: 5000
    });
    
    const result = response.data;
    spinner.stop();
    
    console.log('\n' + chalk.bold(`${transportType.toUpperCase()} Transport Test Results`));
    console.log('━'.repeat(50));
    
    // Show test results
    if (result.success) {
      console.log(chalk.green('✓ Transport test passed'));
      console.log(`Connection Time: ${result.connectionTime}ms`);
      console.log(`Round Trip Time: ${result.roundTripTime}ms`);
      
      if (result.details) {
        console.log('\n' + chalk.bold('Details:'));
        for (const [key, value] of Object.entries(result.details)) {
          console.log(`  ${key}: ${value}`);
        }
      }
    } else {
      console.log(chalk.red('✗ Transport test failed'));
      console.log(`Error: ${result.error}`);
      
      if (result.diagnostics) {
        console.log('\n' + chalk.bold('Diagnostics:'));
        console.log(JSON.stringify(result.diagnostics, null, 2));
      }
    }
    
  } catch (error) {
    spinner.fail(`Failed to test ${transportType} transport`);
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  }
}

/**
 * Show transport performance metrics
 */
async function showTransportMetrics(options) {
  const spinner = ora('Fetching transport metrics...').start();
  
  try {
    const params = new URLSearchParams();
    if (options.transport) params.append('transport', options.transport);
    if (options.server) params.append('server', options.server);
    if (options.period) params.append('period', options.period);
    
    const response = await axios.get(`${API_GATEWAY_URL}/api/transports/metrics?${params}`);
    const metrics = response.data;
    
    spinner.stop();
    
    console.log('\n' + chalk.bold('Transport Performance Metrics'));
    console.log('━'.repeat(50));
    
    // Show overall metrics
    if (metrics.overall) {
      console.log('\n' + chalk.bold('Overall Performance:'));
      console.log(`  Messages Sent: ${metrics.overall.messagesSent}`);
      console.log(`  Messages Received: ${metrics.overall.messagesReceived}`);
      console.log(`  Average Latency: ${metrics.overall.avgLatency}ms`);
      console.log(`  Error Rate: ${metrics.overall.errorRate}%`);
    }
    
    // Show per-transport metrics
    if (metrics.byTransport) {
      console.log('\n' + chalk.bold('By Transport Type:'));
      
      const table = new Table({
        head: [
          chalk.bold('Transport'),
          chalk.bold('Messages'),
          chalk.bold('Avg Latency'),
          chalk.bold('P95 Latency'),
          chalk.bold('Errors')
        ],
        style: {
          head: ['cyan']
        }
      });
      
      for (const [transport, data] of Object.entries(metrics.byTransport)) {
        table.push([
          formatTransportType(transport),
          data.messageCount,
          `${data.avgLatency}ms`,
          `${data.p95Latency}ms`,
          data.errorCount
        ]);
      }
      
      console.log(table.toString());
    }
    
  } catch (error) {
    spinner.fail('Failed to fetch transport metrics');
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  }
}

/**
 * Convert server to different transport
 */
async function convertServerTransport(serverId, newTransport) {
  const spinner = ora(`Converting ${serverId} to ${newTransport} transport...`).start();
  
  try {
    // Confirm the conversion
    spinner.stop();
    
    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: `Are you sure you want to convert ${serverId} from its current transport to ${newTransport}?`,
      default: false
    }]);
    
    if (!confirm) {
      console.log(chalk.yellow('Conversion cancelled'));
      return;
    }
    
    spinner.start('Converting transport...');
    
    // Call API to convert transport
    const response = await axios.post(`${API_GATEWAY_URL}/api/servers/${serverId}/convert-transport`, {
      newTransport: newTransport,
      preserveConnections: true
    });
    
    spinner.stop();
    
    if (response.data.success) {
      console.log(chalk.green(`✓ Successfully converted ${serverId} to ${newTransport} transport`));
      
      if (response.data.reconnectionRequired) {
        console.log(chalk.yellow('\n⚠ Clients need to reconnect using the new transport'));
      }
      
      if (response.data.newConfig) {
        console.log('\n' + chalk.bold('New Connection Configuration:'));
        console.log(JSON.stringify(response.data.newConfig, null, 2));
      }
    } else {
      console.log(chalk.red(`✗ Failed to convert transport: ${response.data.error}`));
    }
    
  } catch (error) {
    spinner.fail('Failed to convert transport');
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  }
}

/**
 * Configure transport settings
 */
async function configureTransport(transportType) {
  const spinner = ora(`Loading ${transportType} configuration...`).start();
  
  try {
    // Get current configuration
    const response = await axios.get(`${API_GATEWAY_URL}/api/transports/${transportType}/config`);
    const currentConfig = response.data.config || {};
    
    spinner.stop();
    
    console.log('\n' + chalk.bold(`${transportType.toUpperCase()} Transport Configuration`));
    console.log('Current settings:');
    console.log(JSON.stringify(currentConfig, null, 2));
    
    // Ask if user wants to modify
    const { modify } = await inquirer.prompt([{
      type: 'confirm',
      name: 'modify',
      message: 'Do you want to modify these settings?',
      default: false
    }]);
    
    if (!modify) {
      return;
    }
    
    // Transport-specific configuration prompts
    let newConfig = {};
    
    switch (transportType) {
      case 'http':
        newConfig = await inquirer.prompt([
          {
            type: 'number',
            name: 'port',
            message: 'HTTP port:',
            default: currentConfig.port || 3000
          },
          {
            type: 'number',
            name: 'timeout',
            message: 'Request timeout (ms):',
            default: currentConfig.timeout || 30000
          },
          {
            type: 'confirm',
            name: 'enableCors',
            message: 'Enable CORS:',
            default: currentConfig.enableCors || false
          }
        ]);
        break;
        
      case 'ws':
        newConfig = await inquirer.prompt([
          {
            type: 'number',
            name: 'port',
            message: 'WebSocket port:',
            default: currentConfig.port || 3001
          },
          {
            type: 'number',
            name: 'pingInterval',
            message: 'Ping interval (ms):',
            default: currentConfig.pingInterval || 30000
          },
          {
            type: 'confirm',
            name: 'enableCompression',
            message: 'Enable compression:',
            default: currentConfig.enableCompression || true
          }
        ]);
        break;
        
      case 'stdio':
        newConfig = await inquirer.prompt([
          {
            type: 'input',
            name: 'encoding',
            message: 'Character encoding:',
            default: currentConfig.encoding || 'utf8'
          },
          {
            type: 'confirm',
            name: 'enableBuffer',
            message: 'Enable buffering:',
            default: currentConfig.enableBuffer || true
          }
        ]);
        break;
        
      default:
        console.log(chalk.yellow('Custom configuration not available for this transport type'));
        return;
    }
    
    // Apply new configuration
    spinner.start('Applying configuration...');
    
    const updateResponse = await axios.put(`${API_GATEWAY_URL}/api/transports/${transportType}/config`, {
      config: newConfig
    });
    
    spinner.stop();
    
    if (updateResponse.data.success) {
      console.log(chalk.green('✓ Configuration updated successfully'));
      
      if (updateResponse.data.restartRequired) {
        console.log(chalk.yellow('\n⚠ Restart required for changes to take effect'));
      }
    } else {
      console.log(chalk.red(`✗ Failed to update configuration: ${updateResponse.data.error}`));
    }
    
  } catch (error) {
    spinner.fail('Failed to configure transport');
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  }
}

/**
 * Add transport command to CLI
 */
function addTransportCommand(program) {
  const transport = program
    .command('transport')
    .description('Manage MCP transports');
  
  // List transports
  transport
    .command('list')
    .description('List all available transports')
    .option('--json', 'Output in JSON format')
    .action(async (options) => {
      if (options.json) {
        try {
          const response = await axios.get(`${REGISTRY_URL}/api/transports`);
          console.log(JSON.stringify(response.data, null, 2));
        } catch (error) {
          console.error(JSON.stringify({ error: error.message }));
          process.exit(1);
        }
      } else {
        await listTransports();
      }
    });
  
  // Transport status
  transport
    .command('status')
    .description('Show transport connection status')
    .option('--json', 'Output in JSON format')
    .action(async (options) => {
      if (options.json) {
        try {
          const response = await axios.get(`${API_GATEWAY_URL}/api/transports/status`);
          console.log(JSON.stringify(response.data, null, 2));
        } catch (error) {
          console.error(JSON.stringify({ error: error.message }));
          process.exit(1);
        }
      } else {
        await showTransportStatus();
      }
    });
  
  // Test transport
  transport
    .command('test <transport-type>')
    .description('Test transport connectivity')
    .action(async (transportType) => {
      await testTransport(transportType);
    });
  
  // Transport metrics
  transport
    .command('metrics')
    .description('Show transport performance metrics')
    .option('-t, --transport <type>', 'Filter by transport type')
    .option('-s, --server <id>', 'Filter by server ID')
    .option('-p, --period <period>', 'Time period (1h, 24h, 7d)', '1h')
    .option('--json', 'Output in JSON format')
    .action(async (options) => {
      if (options.json) {
        try {
          const params = new URLSearchParams();
          if (options.transport) params.append('transport', options.transport);
          if (options.server) params.append('server', options.server);
          if (options.period) params.append('period', options.period);
          
          const response = await axios.get(`${API_GATEWAY_URL}/api/transports/metrics?${params}`);
          console.log(JSON.stringify(response.data, null, 2));
        } catch (error) {
          console.error(JSON.stringify({ error: error.message }));
          process.exit(1);
        }
      } else {
        await showTransportMetrics(options);
      }
    });
  
  // Configure transport
  transport
    .command('config <transport-type>')
    .description('Configure transport settings')
    .action(async (transportType) => {
      await configureTransport(transportType);
    });
}

module.exports = {
  addTransportCommand,
  listTransports,
  showTransportStatus,
  testTransport,
  showTransportMetrics,
  convertServerTransport
};