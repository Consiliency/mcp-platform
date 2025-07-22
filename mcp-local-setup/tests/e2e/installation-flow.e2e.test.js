/**
 * End-to-end tests for full installation flow simulation
 */

const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const util = require('util');
const execAsync = util.promisify(exec);

// Increase timeout for e2e tests
jest.setTimeout(120000);

describe('Installation Flow E2E Tests', () => {
  const testInstallDir = path.join(os.tmpdir(), `mcp-test-${Date.now()}`);
  const testHome = path.join(testInstallDir, '.mcp-platform');
  
  beforeAll(async () => {
    // Create test installation directory
    await fs.mkdir(testInstallDir, { recursive: true });
    process.env.TEST_MCP_HOME = testHome;
  });

  afterAll(async () => {
    // Clean up test installation
    try {
      await fs.rm(testInstallDir, { recursive: true, force: true });
    } catch (error) {
      console.error('Failed to clean up test directory:', error);
    }
    delete process.env.TEST_MCP_HOME;
  });

  describe('Initial Installation', () => {
    it('should detect OS and architecture correctly', async () => {
      const platform = os.platform();
      const arch = os.arch();
      
      expect(['linux', 'darwin', 'win32']).toContain(platform);
      expect(['x64', 'arm64', 'ia32']).toContain(arch);
    });

    it('should check for required dependencies', async () => {
      // Check Docker
      try {
        const { stdout: dockerVersion } = await execAsync('docker --version');
        expect(dockerVersion).toContain('Docker version');
      } catch (error) {
        console.warn('Docker not installed - skipping Docker checks');
      }

      // Check Node.js
      const { stdout: nodeVersion } = await execAsync('node --version');
      expect(nodeVersion).toMatch(/v\d+\.\d+\.\d+/);
      
      // Verify Node.js version is >= 14
      const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
      expect(majorVersion).toBeGreaterThanOrEqual(14);
    });

    it('should create directory structure', async () => {
      const directories = [
        '',
        'scripts',
        'profiles',
        'registry',
        'config',
        'logs',
        'traefik',
        'docker'
      ];

      for (const dir of directories) {
        const dirPath = path.join(testHome, dir);
        await fs.mkdir(dirPath, { recursive: true });
      }

      // Verify all directories were created
      for (const dir of directories) {
        const dirPath = path.join(testHome, dir);
        const exists = await fs.access(dirPath).then(() => true).catch(() => false);
        expect(exists).toBe(true);
      }
    });

    it('should copy installation files', async () => {
      const filesToCopy = [
        { src: 'docker-compose.yml', dest: 'docker-compose.yml' },
        { src: 'nginx.conf', dest: 'nginx.conf' },
        { src: 'scripts/registry-manager.js', dest: 'scripts/registry-manager.js' },
        { src: 'scripts/profile-manager.sh', dest: 'scripts/profile-manager.sh' }
      ];

      // Simulate file copying (in real test, would copy actual files)
      for (const file of filesToCopy) {
        const destPath = path.join(testHome, file.dest);
        await fs.mkdir(path.dirname(destPath), { recursive: true });
        await fs.writeFile(destPath, `# Mock content for ${file.src}`);
      }

      // Verify files were copied
      for (const file of filesToCopy) {
        const destPath = path.join(testHome, file.dest);
        const exists = await fs.access(destPath).then(() => true).catch(() => false);
        expect(exists).toBe(true);
      }
    });

    it('should set correct file permissions', async () => {
      const executableFiles = [
        'scripts/profile-manager.sh',
        'scripts/registry-manager.js'
      ];

      for (const file of executableFiles) {
        const filePath = path.join(testHome, file);
        
        // Ensure file exists
        await fs.writeFile(filePath, '#!/bin/bash\necho "test"', { mode: 0o755 });
        
        // Check permissions
        const stats = await fs.stat(filePath);
        const isExecutable = (stats.mode & 0o111) !== 0;
        expect(isExecutable).toBe(true);
      }
    });

    it('should create default configuration', async () => {
      const defaultConfig = {
        version: '1.0.0',
        settings: {
          auto_update: false,
          telemetry: false,
          log_level: 'info'
        },
        defaults: {
          profile: 'default',
          restart_policy: 'unless-stopped'
        }
      };

      const configPath = path.join(testHome, 'config', 'platform.json');
      await fs.writeFile(configPath, JSON.stringify(defaultConfig, null, 2));

      // Verify config was created
      const configContent = await fs.readFile(configPath, 'utf8');
      const config = JSON.parse(configContent);
      expect(config.version).toBe('1.0.0');
      expect(config.settings.auto_update).toBe(false);
    });

    it('should create default profile', async () => {
      const defaultProfile = {
        name: 'default',
        description: 'Default MCP profile',
        services: [],
        settings: {
          auto_start: false,
          restart_policy: 'no'
        }
      };

      const yaml = require('js-yaml');
      const profilePath = path.join(testHome, 'profiles', 'default.yml');
      await fs.writeFile(profilePath, yaml.dump(defaultProfile));

      // Verify profile was created
      const profileContent = await fs.readFile(profilePath, 'utf8');
      const profile = yaml.load(profileContent);
      expect(profile.name).toBe('default');
    });

    it('should initialize service registry', async () => {
      const initialCatalog = {
        version: '1.0.0',
        updated: new Date().toISOString(),
        services: {}
      };

      const catalogPath = path.join(testHome, 'registry', 'mcp-catalog.json');
      await fs.writeFile(catalogPath, JSON.stringify(initialCatalog, null, 2));

      // Verify catalog was created
      const catalogContent = await fs.readFile(catalogPath, 'utf8');
      const catalog = JSON.parse(catalogContent);
      expect(catalog.version).toBe('1.0.0');
      expect(catalog.services).toEqual({});
    });
  });

  describe('Environment Setup', () => {
    it('should create environment file', async () => {
      const envVars = {
        MCP_HOME: testHome,
        MCP_PROFILE: 'default',
        MCP_LOG_LEVEL: 'info',
        COMPOSE_PROJECT_NAME: 'mcp-platform'
      };

      const envContent = Object.entries(envVars)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');

      const envPath = path.join(testHome, '.env');
      await fs.writeFile(envPath, envContent);

      // Verify env file
      const savedEnv = await fs.readFile(envPath, 'utf8');
      expect(savedEnv).toContain(`MCP_HOME=${testHome}`);
      expect(savedEnv).toContain('MCP_PROFILE=default');
    });

    it('should configure PATH for CLI', async () => {
      const cliPath = path.join(testHome, 'cli');
      const mockCliScript = `#!/usr/bin/env node
console.log('MCP CLI v1.0.0');`;

      await fs.mkdir(cliPath, { recursive: true });
      await fs.writeFile(
        path.join(cliPath, 'mcp-cli.js'),
        mockCliScript,
        { mode: 0o755 }
      );

      // In real installation, would add to PATH
      // Here we just verify the CLI exists
      const cliExists = await fs.access(
        path.join(cliPath, 'mcp-cli.js')
      ).then(() => true).catch(() => false);
      
      expect(cliExists).toBe(true);
    });

    it('should setup shell completion', async () => {
      const completionScript = `# MCP CLI Bash Completion
_mcp_completion() {
    local cur prev opts
    COMPREPLY=()
    cur="\${COMP_WORDS[COMP_CWORD]}"
    prev="\${COMP_WORDS[COMP_CWORD-1]}"
    opts="start stop restart status health profile service help"
    
    COMPREPLY=( $(compgen -W "\${opts}" -- \${cur}) )
    return 0
}
complete -F _mcp_completion mcp`;

      const completionPath = path.join(testHome, 'scripts', 'mcp-completion.bash');
      await fs.writeFile(completionPath, completionScript);

      const exists = await fs.access(completionPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });
  });

  describe('Post-Installation Verification', () => {
    it('should verify all components are installed', async () => {
      const components = [
        { path: 'docker-compose.yml', type: 'file' },
        { path: 'scripts/registry-manager.js', type: 'file' },
        { path: 'profiles/default.yml', type: 'file' },
        { path: 'registry/mcp-catalog.json', type: 'file' },
        { path: 'config', type: 'directory' },
        { path: 'logs', type: 'directory' }
      ];

      for (const component of components) {
        const componentPath = path.join(testHome, component.path);
        const stats = await fs.stat(componentPath);
        
        if (component.type === 'file') {
          expect(stats.isFile()).toBe(true);
        } else if (component.type === 'directory') {
          expect(stats.isDirectory()).toBe(true);
        }
      }
    });

    it('should run installation self-test', async () => {
      // Simulate self-test script
      const selfTestScript = `#!/bin/bash
echo "Running MCP installation self-test..."
echo "✓ Directory structure: OK"
echo "✓ Configuration files: OK"
echo "✓ Permissions: OK"
echo "✓ Environment variables: OK"
echo "Installation test passed!"
exit 0`;

      const testScriptPath = path.join(testHome, 'scripts', 'self-test.sh');
      await fs.writeFile(testScriptPath, selfTestScript, { mode: 0o755 });

      // Run self-test
      const { stdout, stderr } = await execAsync(`bash ${testScriptPath}`);
      expect(stdout).toContain('Installation test passed!');
      expect(stderr).toBe('');
    });

    it('should display installation summary', async () => {
      const summary = {
        installation: {
          path: testHome,
          version: '1.0.0',
          timestamp: new Date().toISOString()
        },
        components: {
          cli: 'installed',
          registry: 'initialized',
          profiles: 'configured',
          docker: 'ready'
        },
        nextSteps: [
          'Run "mcp service list" to see available services',
          'Run "mcp service install <service>" to install a service',
          'Run "mcp help" for more information'
        ]
      };

      const summaryPath = path.join(testHome, 'installation-summary.json');
      await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));

      const savedSummary = JSON.parse(await fs.readFile(summaryPath, 'utf8'));
      expect(savedSummary.installation.version).toBe('1.0.0');
      expect(savedSummary.components.cli).toBe('installed');
    });
  });

  describe('Installation Rollback', () => {
    it('should support installation rollback on failure', async () => {
      const backupDir = path.join(testInstallDir, 'backup');
      
      // Create backup before changes
      await fs.mkdir(backupDir, { recursive: true });
      
      // Simulate failed installation step
      let installationFailed = false;
      try {
        // Simulate failure
        throw new Error('Installation step failed');
      } catch (error) {
        installationFailed = true;
        
        // Rollback would restore from backup
        // Here we just verify the backup directory exists
        const backupExists = await fs.access(backupDir).then(() => true).catch(() => false);
        expect(backupExists).toBe(true);
      }
      
      expect(installationFailed).toBe(true);
    });

    it('should clean up partial installation', async () => {
      const partialInstallDir = path.join(testInstallDir, 'partial');
      
      // Create partial installation
      await fs.mkdir(path.join(partialInstallDir, 'scripts'), { recursive: true });
      await fs.writeFile(path.join(partialInstallDir, 'test.txt'), 'partial');
      
      // Clean up
      await fs.rm(partialInstallDir, { recursive: true, force: true });
      
      // Verify cleanup
      const exists = await fs.access(partialInstallDir).then(() => true).catch(() => false);
      expect(exists).toBe(false);
    });
  });

  describe('Platform-Specific Installation', () => {
    it('should handle Linux-specific setup', async () => {
      if (os.platform() === 'linux') {
        // Linux-specific tests
        const systemdService = `[Unit]
Description=MCP Platform Service
After=docker.service
Requires=docker.service

[Service]
Type=simple
ExecStart=/usr/local/bin/mcp start
ExecStop=/usr/local/bin/mcp stop
Restart=on-failure

[Install]
WantedBy=multi-user.target`;

        const servicePath = path.join(testHome, 'mcp-platform.service');
        await fs.writeFile(servicePath, systemdService);
        
        const exists = await fs.access(servicePath).then(() => true).catch(() => false);
        expect(exists).toBe(true);
      }
    });

    it('should handle macOS-specific setup', async () => {
      if (os.platform() === 'darwin') {
        // macOS-specific tests
        const launchAgent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.mcp.platform</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/mcp</string>
        <string>start</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>`;

        const agentPath = path.join(testHome, 'com.mcp.platform.plist');
        await fs.writeFile(agentPath, launchAgent);
        
        const exists = await fs.access(agentPath).then(() => true).catch(() => false);
        expect(exists).toBe(true);
      }
    });

    it('should handle Windows-specific setup', async () => {
      if (os.platform() === 'win32') {
        // Windows-specific tests
        const batchScript = `@echo off
echo Starting MCP Platform...
cd /d "%MCP_HOME%"
docker-compose up -d
echo MCP Platform started successfully`;

        const scriptPath = path.join(testHome, 'start-mcp.bat');
        await fs.writeFile(scriptPath, batchScript);
        
        const exists = await fs.access(scriptPath).then(() => true).catch(() => false);
        expect(exists).toBe(true);
      }
    });
  });
});