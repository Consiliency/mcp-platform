/**
 * Docker Management Plugin for MCP CLI
 * Provides enhanced Docker operations for MCP services
 */

const { CLIPluginInterface } = require('../../../../interfaces/phase5/cli-plugin.interface');
const { spawn } = require('child_process');
const path = require('path');

class DockerPlugin extends CLIPluginInterface {
  getMetadata() {
    return {
      name: 'mcp-docker',
      version: '1.0.0',
      description: 'Enhanced Docker management for MCP CLI',
      author: 'MCP Team',
      commands: ['docker:stats', 'docker:clean', 'docker:exec', 'docker:inspect']
    };
  }

  async initialize(context) {
    await super.initialize(context);
    this.mcpHome = process.env.MCP_HOME || path.join(process.env.HOME, '.mcp-platform');
    this.dockerComposeFile = path.join(this.mcpHome, 'docker-compose.yml');
  }

  registerCommands() {
    return [
      {
        name: 'docker:stats',
        description: 'Show real-time statistics for MCP containers',
        options: [
          { flags: '--no-stream', description: 'Disable streaming stats' }
        ],
        execute: async (args, context) => {
          return this.dockerStats(args.options.noStream);
        }
      },
      {
        name: 'docker:clean',
        description: 'Clean up unused Docker resources',
        options: [
          { flags: '-a, --all', description: 'Remove all unused resources' },
          { flags: '--volumes', description: 'Also remove volumes' }
        ],
        execute: async (args, context) => {
          return this.dockerClean(args.options.all, args.options.volumes);
        }
      },
      {
        name: 'docker:exec',
        description: 'Execute a command in a running MCP service container',
        arguments: [
          { name: 'service', description: 'Service name', required: true },
          { name: 'command', description: 'Command to execute', required: true }
        ],
        options: [
          { flags: '-i, --interactive', description: 'Keep STDIN open' },
          { flags: '-t, --tty', description: 'Allocate a pseudo-TTY' }
        ],
        execute: async (args, context) => {
          const [service, ...commandParts] = args.arguments;
          const command = commandParts.join(' ');
          return this.dockerExec(service, command, args.options);
        }
      },
      {
        name: 'docker:inspect',
        description: 'Display detailed information about MCP services',
        arguments: [
          { name: 'service', description: 'Service name', required: false }
        ],
        execute: async (args, context) => {
          return this.dockerInspect(args.arguments[0]);
        }
      }
    ];
  }

  async beforeCommand(command, args) {
    // Check Docker availability before docker-dependent commands
    if (['start', 'stop', 'restart', 'status'].includes(command)) {
      const dockerAvailable = await this.checkDocker();
      if (!dockerAvailable) {
        this.context.logger.error('Docker is not available or not running');
        return { proceed: false };
      }
    }
    
    return { proceed: true };
  }

  async afterCommand(command, result) {
    // Show container stats after start/restart
    if (result && result.success && ['start', 'restart'].includes(command)) {
      this.context.logger.info('Container status:');
      await this.dockerPS();
    }
  }

  // Docker helper methods
  async checkDocker() {
    return new Promise((resolve) => {
      const docker = spawn('docker', ['--version'], { stdio: 'pipe' });
      docker.on('close', (code) => {
        resolve(code === 0);
      });
    });
  }

  async dockerStats(noStream) {
    return new Promise((resolve, reject) => {
      const args = ['compose', '-f', this.dockerComposeFile, 'stats'];
      if (noStream) args.push('--no-stream');
      
      const docker = spawn('docker', args, {
        cwd: this.mcpHome,
        stdio: 'inherit'
      });
      
      docker.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true });
        } else {
          reject(new Error('Failed to get Docker stats'));
        }
      });
    });
  }

  async dockerClean(all, volumes) {
    console.log('Cleaning up Docker resources...');
    
    try {
      // Stop all containers first
      await this.runDockerCommand(['compose', '-f', this.dockerComposeFile, 'down']);
      
      // Remove dangling images
      await this.runDockerCommand(['image', 'prune', '-f']);
      
      if (all) {
        // Remove all unused images
        await this.runDockerCommand(['image', 'prune', '-a', '-f']);
        
        // Remove unused containers
        await this.runDockerCommand(['container', 'prune', '-f']);
        
        // Remove unused networks
        await this.runDockerCommand(['network', 'prune', '-f']);
      }
      
      if (volumes) {
        // Remove unused volumes
        await this.runDockerCommand(['volume', 'prune', '-f']);
      }
      
      console.log('Docker cleanup completed');
      return { success: true, message: 'Cleanup completed successfully' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  async dockerExec(service, command, options) {
    const args = ['compose', '-f', this.dockerComposeFile, 'exec'];
    
    if (!options.interactive) args.push('-T');
    if (options.tty) args.push('-t');
    
    args.push(service);
    args.push('sh', '-c', command);
    
    return new Promise((resolve, reject) => {
      const docker = spawn('docker', args, {
        cwd: this.mcpHome,
        stdio: 'inherit'
      });
      
      docker.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true });
        } else {
          reject(new Error(`Command execution failed with code ${code}`));
        }
      });
    });
  }

  async dockerInspect(service) {
    const args = ['compose', '-f', this.dockerComposeFile];
    
    if (service) {
      args.push('ps', service, '--format', 'json');
    } else {
      args.push('ps', '--format', 'json');
    }
    
    return new Promise((resolve, reject) => {
      const docker = spawn('docker', args, {
        cwd: this.mcpHome,
        stdio: 'pipe'
      });
      
      let output = '';
      docker.stdout.on('data', (data) => { output += data.toString(); });
      docker.stderr.on('data', (data) => { output += data.toString(); });
      
      docker.on('close', (code) => {
        if (code === 0) {
          try {
            const services = output.trim().split('\n')
              .filter(line => line)
              .map(line => JSON.parse(line));
            
            console.log('\nMCP Services:\n');
            services.forEach(svc => {
              console.log(`Service: ${svc.Service}`);
              console.log(`  State: ${svc.State}`);
              console.log(`  Status: ${svc.Status}`);
              console.log(`  Ports: ${svc.Publishers ? svc.Publishers.map(p => `${p.PublishedPort}:${p.TargetPort}`).join(', ') : 'none'}`);
              console.log('');
            });
            
            resolve({ success: true, services });
          } catch (error) {
            console.log(output);
            resolve({ success: true });
          }
        } else {
          reject(new Error(`Docker inspect failed: ${output}`));
        }
      });
    });
  }

  async dockerPS() {
    return this.runDockerCommand(['compose', '-f', this.dockerComposeFile, 'ps']);
  }

  async runDockerCommand(args) {
    return new Promise((resolve, reject) => {
      const docker = spawn('docker', args, {
        cwd: this.mcpHome,
        stdio: 'inherit'
      });
      
      docker.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true });
        } else {
          reject(new Error(`Docker command failed with code ${code}`));
        }
      });
    });
  }
}

module.exports = DockerPlugin;