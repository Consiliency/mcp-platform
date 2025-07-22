/**
 * Unit tests for mcp-cli.js command parsing and options
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

// Mock dependencies
jest.mock('child_process');
jest.mock('fs').promises;
jest.mock('inquirer');
jest.mock('ora');

const cliPath = path.join(__dirname, '../../cli/mcp-cli.js');

describe('MCP CLI Command Parsing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('CLI Initialization', () => {
    it('should set up correct environment variables', () => {
      const { MCP_HOME } = require(cliPath);
      expect(MCP_HOME).toBeDefined();
    });

    it('should define all required command paths', () => {
      const cli = require(cliPath);
      expect(cli.DOCKER_COMPOSE_FILE).toContain('docker-compose.yml');
      expect(cli.PROFILE_MANAGER).toContain('profile-manager.sh');
      expect(cli.REGISTRY_MANAGER).toContain('registry-manager.js');
    });
  });

  describe('Utility Functions', () => {
    it('fileExists should check file accessibility', async () => {
      const mockAccess = jest.fn();
      fs.access = mockAccess;

      // Test file exists
      mockAccess.mockResolvedValueOnce(undefined);
      const cli = require(cliPath);
      const exists = await cli.fileExists('/test/path');
      expect(exists).toBe(true);
      expect(mockAccess).toHaveBeenCalledWith('/test/path');

      // Test file doesn't exist
      mockAccess.mockRejectedValueOnce(new Error('ENOENT'));
      const notExists = await cli.fileExists('/missing/path');
      expect(notExists).toBe(false);
    });

    it('runCommand should spawn process with correct arguments', async () => {
      const mockProc = {
        on: jest.fn((event, cb) => {
          if (event === 'close') cb(0);
        }),
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() }
      };
      spawn.mockReturnValue(mockProc);

      const cli = require(cliPath);
      await cli.runCommand('docker', ['ps'], { silent: true });

      expect(spawn).toHaveBeenCalledWith('docker', ['ps'], expect.objectContaining({
        stdio: 'pipe'
      }));
    });

    it('runCommand should handle process errors', async () => {
      const mockProc = {
        on: jest.fn((event, cb) => {
          if (event === 'close') cb(1);
        }),
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() }
      };
      spawn.mockReturnValue(mockProc);

      const cli = require(cliPath);
      await expect(cli.runCommand('failing-command')).rejects.toThrow();
    });
  });

  describe('Command Structure', () => {
    it('should parse version command', () => {
      process.argv = ['node', 'mcp-cli.js', '--version'];
      const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {});
      
      require(cliPath);
      
      expect(mockExit).toHaveBeenCalled();
      mockExit.mockRestore();
    });

    it('should parse help command', () => {
      process.argv = ['node', 'mcp-cli.js', '--help'];
      const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {});
      
      require(cliPath);
      
      expect(mockExit).toHaveBeenCalled();
      mockExit.mockRestore();
    });
  });

  describe('Service Commands', () => {
    it('should validate service start command', () => {
      const mockRunCommand = jest.fn().mockResolvedValue(true);
      const cli = require(cliPath);
      cli.runCommand = mockRunCommand;

      // Simulate start command
      cli.startService('test-service');
      
      expect(mockRunCommand).toHaveBeenCalledWith(
        'docker',
        expect.arrayContaining(['compose', 'up', '-d']),
        expect.any(Object)
      );
    });

    it('should validate service stop command', () => {
      const mockRunCommand = jest.fn().mockResolvedValue(true);
      const cli = require(cliPath);
      cli.runCommand = mockRunCommand;

      // Simulate stop command
      cli.stopService('test-service');
      
      expect(mockRunCommand).toHaveBeenCalledWith(
        'docker',
        expect.arrayContaining(['compose', 'stop']),
        expect.any(Object)
      );
    });

    it('should validate service restart command', () => {
      const mockRunCommand = jest.fn().mockResolvedValue(true);
      const cli = require(cliPath);
      cli.runCommand = mockRunCommand;

      // Simulate restart command
      cli.restartService('test-service');
      
      expect(mockRunCommand).toHaveBeenCalledWith(
        'docker',
        expect.arrayContaining(['compose', 'restart']),
        expect.any(Object)
      );
    });
  });

  describe('Profile Commands', () => {
    it('should handle profile list command', async () => {
      const mockReaddir = jest.fn().mockResolvedValue(['default.yml', 'dev.yml']);
      fs.readdir = mockReaddir;

      const cli = require(cliPath);
      const profiles = await cli.listProfiles();

      expect(profiles).toEqual(['default', 'dev']);
      expect(mockReaddir).toHaveBeenCalled();
    });

    it('should handle profile switch command', async () => {
      const mockWriteFile = jest.fn().mockResolvedValue(undefined);
      fs.writeFile = mockWriteFile;

      const cli = require(cliPath);
      await cli.switchProfile('dev');

      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('.current-profile'),
        'dev'
      );
    });

    it('should validate profile creation', async () => {
      const mockRunCommand = jest.fn().mockResolvedValue(true);
      const cli = require(cliPath);
      cli.runCommand = mockRunCommand;

      await cli.createProfile('test-profile', ['service1', 'service2']);

      expect(mockRunCommand).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['create', 'test-profile']),
        expect.any(Object)
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle missing docker-compose file', async () => {
      const mockAccess = jest.fn().mockRejectedValue(new Error('ENOENT'));
      fs.access = mockAccess;

      const cli = require(cliPath);
      await expect(cli.checkDockerCompose()).rejects.toThrow();
    });

    it('should handle invalid profile names', async () => {
      const cli = require(cliPath);
      
      await expect(cli.switchProfile('')).rejects.toThrow();
      await expect(cli.switchProfile('invalid/name')).rejects.toThrow();
    });

    it('should handle service command failures gracefully', async () => {
      const mockRunCommand = jest.fn().mockRejectedValue(new Error('Docker not found'));
      const cli = require(cliPath);
      cli.runCommand = mockRunCommand;

      await expect(cli.startService('test')).rejects.toThrow('Docker not found');
    });
  });
});