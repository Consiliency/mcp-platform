/**
 * Git Integration Plugin for MCP CLI
 * Provides git-related commands for MCP services
 */

const { CLIPluginInterface } = require('../../../../interfaces/phase5/cli-plugin.interface');
const { spawn } = require('child_process');
const path = require('path');

class GitPlugin extends CLIPluginInterface {
  getMetadata() {
    return {
      name: 'mcp-git',
      version: '1.0.0',
      description: 'Git integration for MCP CLI',
      author: 'MCP Team',
      commands: ['git:status', 'git:commit', 'git:push']
    };
  }

  async initialize(context) {
    await super.initialize(context);
    this.mcpHome = process.env.MCP_HOME || path.join(process.env.HOME, '.mcp-platform');
  }

  registerCommands() {
    return [
      {
        name: 'git:status',
        description: 'Show git status of MCP configuration',
        execute: async (args, context) => {
          return this.gitStatus();
        }
      },
      {
        name: 'git:commit',
        description: 'Commit MCP configuration changes',
        options: [
          { flags: '-m, --message <message>', description: 'Commit message' }
        ],
        execute: async (args, context) => {
          const message = args.options.message || 'Update MCP configuration';
          return this.gitCommit(message);
        }
      },
      {
        name: 'git:push',
        description: 'Push MCP configuration to remote repository',
        options: [
          { flags: '-f, --force', description: 'Force push' }
        ],
        execute: async (args, context) => {
          return this.gitPush(args.options.force);
        }
      }
    ];
  }

  async beforeCommand(command, args) {
    // Check if MCP_HOME is a git repository before certain commands
    if (['profile:create', 'profile:switch', 'install'].includes(command)) {
      const isGitRepo = await this.isGitRepository();
      if (isGitRepo) {
        this.context.logger.info('Git repository detected - changes will be tracked');
      }
    }
    
    return { proceed: true };
  }

  async afterCommand(command, result) {
    // Auto-commit after certain commands if in a git repo
    if (result && result.success && ['profile:create', 'install'].includes(command)) {
      const isGitRepo = await this.isGitRepository();
      if (isGitRepo) {
        this.context.logger.info('Auto-committing changes...');
        await this.gitAdd();
        await this.gitCommit(`Auto-commit: ${command} completed`);
      }
    }
  }

  // Git helper methods
  async isGitRepository() {
    return new Promise((resolve) => {
      const git = spawn('git', ['rev-parse', '--git-dir'], {
        cwd: this.mcpHome,
        stdio: 'pipe'
      });
      
      git.on('close', (code) => {
        resolve(code === 0);
      });
    });
  }

  async gitStatus() {
    return new Promise((resolve, reject) => {
      const git = spawn('git', ['status', '--porcelain'], {
        cwd: this.mcpHome,
        stdio: 'pipe'
      });
      
      let output = '';
      git.stdout.on('data', (data) => { output += data.toString(); });
      git.stderr.on('data', (data) => { output += data.toString(); });
      
      git.on('close', (code) => {
        if (code === 0) {
          if (output.trim()) {
            console.log('Modified files:');
            console.log(output);
          } else {
            console.log('No changes detected');
          }
          resolve({ success: true, changes: output.trim() !== '' });
        } else {
          reject(new Error(`Git status failed: ${output}`));
        }
      });
    });
  }

  async gitAdd() {
    return new Promise((resolve, reject) => {
      const git = spawn('git', ['add', '.'], {
        cwd: this.mcpHome,
        stdio: 'pipe'
      });
      
      git.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true });
        } else {
          reject(new Error('Git add failed'));
        }
      });
    });
  }

  async gitCommit(message) {
    return new Promise((resolve, reject) => {
      const git = spawn('git', ['commit', '-m', message], {
        cwd: this.mcpHome,
        stdio: 'pipe'
      });
      
      let output = '';
      git.stdout.on('data', (data) => { output += data.toString(); });
      git.stderr.on('data', (data) => { output += data.toString(); });
      
      git.on('close', (code) => {
        if (code === 0) {
          console.log('Changes committed successfully');
          resolve({ success: true, message: 'Committed successfully' });
        } else if (output.includes('nothing to commit')) {
          console.log('No changes to commit');
          resolve({ success: true, message: 'No changes to commit' });
        } else {
          reject(new Error(`Git commit failed: ${output}`));
        }
      });
    });
  }

  async gitPush(force = false) {
    return new Promise((resolve, reject) => {
      const args = ['push'];
      if (force) args.push('--force');
      
      const git = spawn('git', args, {
        cwd: this.mcpHome,
        stdio: 'inherit'
      });
      
      git.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, message: 'Pushed successfully' });
        } else {
          reject(new Error('Git push failed'));
        }
      });
    });
  }
}

module.exports = GitPlugin;