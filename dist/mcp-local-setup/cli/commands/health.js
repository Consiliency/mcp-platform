#!/usr/bin/env node

const axios = require('axios');
const chalk = require('chalk');
const Table = require('cli-table3');
const ora = require('ora');

const HEALTH_SERVICE_URL = process.env.HEALTH_SERVICE_URL || 'http://localhost:8080/health';

/**
 * Get status color
 */
function getStatusColor(status) {
  switch (status) {
    case 'healthy':
      return chalk.green('● ' + status);
    case 'degraded':
      return chalk.yellow('● ' + status);
    case 'unhealthy':
      return chalk.red('● ' + status);
    default:
      return chalk.gray('● ' + status);
  }
}

/**
 * Format uptime
 */
function formatUptime(seconds) {
  if (!seconds) return 'N/A';
  
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  
  return parts.join(' ') || '< 1m';
}

/**
 * Show overall system health
 */
async function showSystemHealth() {
  const spinner = ora('Checking system health...').start();
  
  try {
    const response = await axios.get(HEALTH_SERVICE_URL);
    const health = response.data;
    
    spinner.stop();
    
    console.log('\n' + chalk.bold('System Health Status'));
    console.log('━'.repeat(50));
    console.log(`Overall Status: ${getStatusColor(health.status)}`);
    console.log(`Total Services: ${health.services.total}`);
    console.log(`  Healthy: ${chalk.green(health.services.healthy)}`);
    console.log(`  Degraded: ${chalk.yellow(health.services.degraded)}`);
    console.log(`  Unhealthy: ${chalk.red(health.services.unhealthy)}`);
    console.log(`  Unknown: ${chalk.gray(health.services.unknown)}`);
    
  } catch (error) {
    spinner.fail('Failed to check system health');
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  }
}

/**
 * Show all services health
 */
async function showServicesHealth() {
  const spinner = ora('Checking services health...').start();
  
  try {
    const response = await axios.get(`${HEALTH_SERVICE_URL}/services`);
    const services = response.data;
    
    spinner.stop();
    
    // Create table
    const table = new Table({
      head: [
        chalk.bold('Service'),
        chalk.bold('Status'),
        chalk.bold('Response Time'),
        chalk.bold('Last Check'),
        chalk.bold('Message')
      ],
      style: {
        head: ['cyan']
      }
    });
    
    // Add service rows
    for (const [serviceId, health] of Object.entries(services)) {
      table.push([
        serviceId,
        getStatusColor(health.status),
        health.responseTime ? `${health.responseTime}ms` : 'N/A',
        new Date(health.lastCheck).toLocaleTimeString(),
        health.message || ''
      ]);
    }
    
    console.log('\n' + chalk.bold('Services Health Status'));
    console.log(table.toString());
    
  } catch (error) {
    spinner.fail('Failed to check services health');
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  }
}

/**
 * Show specific service health
 */
async function showServiceHealth(serviceName) {
  const spinner = ora(`Checking ${serviceName} health...`).start();
  
  try {
    const response = await axios.get(`${HEALTH_SERVICE_URL}/service/${serviceName}`);
    const health = response.data;
    
    spinner.stop();
    
    console.log('\n' + chalk.bold(`${serviceName} Health Details`));
    console.log('━'.repeat(50));
    console.log(`Status: ${getStatusColor(health.status)}`);
    console.log(`Last Check: ${new Date(health.lastCheck).toLocaleString()}`);
    console.log(`Response Time: ${health.responseTime}ms`);
    
    if (health.message) {
      console.log(`Message: ${health.message}`);
    }
    
    if (health.details) {
      console.log('\n' + chalk.bold('Details:'));
      console.log(JSON.stringify(health.details, null, 2));
    }
    
    if (health.error) {
      console.log('\n' + chalk.red('Error:'));
      console.log(health.error);
    }
    
  } catch (error) {
    spinner.fail(`Failed to check ${serviceName} health`);
    
    if (error.response && error.response.status === 404) {
      console.error(chalk.red('Error:'), `Service '${serviceName}' not found`);
    } else {
      console.error(chalk.red('Error:'), error.message);
    }
    process.exit(1);
  }
}

/**
 * Main health command handler
 */
async function healthCommand(options, serviceName) {
  if (serviceName) {
    // Show specific service health
    await showServiceHealth(serviceName);
  } else if (options.all) {
    // Show all services health
    await showServicesHealth();
  } else {
    // Show system health
    await showSystemHealth();
  }
}

/**
 * Add health command to CLI
 */
function addHealthCommand(program) {
  program
    .command('health [service]')
    .description('Check health status of MCP services')
    .option('-a, --all', 'Show all services health details')
    .option('--json', 'Output in JSON format')
    .action(async (service, options) => {
      try {
        if (options.json) {
          // JSON output mode
          let url = HEALTH_SERVICE_URL;
          if (service) {
            url += `/service/${service}`;
          } else if (options.all) {
            url += '/services';
          }
          
          const response = await axios.get(url);
          console.log(JSON.stringify(response.data, null, 2));
        } else {
          // Normal output mode
          await healthCommand(options, service);
        }
      } catch (error) {
        console.error(chalk.red('Error:'), error.message);
        process.exit(1);
      }
    });
}

module.exports = {
  addHealthCommand,
  showSystemHealth,
  showServicesHealth,
  showServiceHealth
};