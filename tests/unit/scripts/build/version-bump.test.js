/**
 * Unit tests for VersionManager
 * @module tests/unit/scripts/build/version-bump.test
 */

const VersionManager = require('../../../../scripts/build/version-bump');
const fs = require('fs').promises;
const { spawn } = require('child_process');
const semver = require('semver');
const glob = require('glob');

// Mock dependencies
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    access: jest.fn()
  }
}));
jest.mock('child_process');
jest.mock('glob');

// Helper to create a mock spawn process
const createMockProcess = (exitCode = 0, stdout = '', stderr = '') => {
  const proc = {
    stdout: {
      on: jest.fn((event, handler) => {
        if (event === 'data' && stdout) {
          handler(Buffer.from(stdout));
        }
      })
    },
    stderr: {
      on: jest.fn((event, handler) => {
        if (event === 'data' && stderr) {
          handler(Buffer.from(stderr));
        }
      })
    },
    on: jest.fn((event, handler) => {
      if (event === 'close') {
        process.nextTick(() => handler(exitCode));
      }
    })
  };
  return proc;
};

describe('VersionManager', () => {
  let versionManager;
  let mockPackageJson;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock package.json
    mockPackageJson = {
      name: 'test-app',
      version: '1.0.0',
      dependencies: {}
    };
    
    // Default mocks
    fs.readFile.mockImplementation((file) => {
      if (file === 'package.json') {
        return Promise.resolve(JSON.stringify(mockPackageJson, null, 2));
      } else if (file === 'package-lock.json') {
        return Promise.resolve(JSON.stringify({
          version: '1.0.0',
          packages: {
            '': { version: '1.0.0' }
          }
        }, null, 2));
      }
      return Promise.resolve('mock content');
    });
    
    fs.writeFile.mockResolvedValue();
    spawn.mockReturnValue(createMockProcess());
    
    versionManager = new VersionManager({
      dryRun: false,
      commit: false,
      tag: false,
      push: false
    });
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const vm = new VersionManager();
      expect(vm.options.type).toBe('patch');
      expect(vm.options.preid).toBe('alpha');
      expect(vm.options.commit).toBe(true);
      expect(vm.options.tag).toBe(true);
      expect(vm.options.push).toBe(false);
      expect(vm.options.dryRun).toBe(false);
    });

    it('should merge custom options', () => {
      const vm = new VersionManager({
        type: 'major',
        preid: 'beta',
        dryRun: true
      });
      expect(vm.options.type).toBe('major');
      expect(vm.options.preid).toBe('beta');
      expect(vm.options.dryRun).toBe(true);
    });

    it('should set default files', () => {
      expect(versionManager.options.files).toContain('package.json');
      expect(versionManager.options.files).toContain('package-lock.json');
      expect(versionManager.options.files).toContain('version.go');
      expect(versionManager.options.files).toContain('README.md');
    });
  });

  describe('bump', () => {
    beforeEach(() => {
      versionManager.validateGitStatus = jest.fn().mockResolvedValue();
      versionManager.getCurrentVersion = jest.fn().mockImplementation(() => {
        versionManager.currentVersion = '1.0.0';
      });
      versionManager.calculateNewVersion = jest.fn().mockImplementation(() => {
        versionManager.newVersion = '1.0.1';
      });
      versionManager.updateVersionFiles = jest.fn().mockResolvedValue();
      versionManager.commitChanges = jest.fn().mockResolvedValue();
      versionManager.createTag = jest.fn().mockResolvedValue();
      versionManager.pushChanges = jest.fn().mockResolvedValue();
    });

    it('should bump version successfully', async () => {
      const result = await versionManager.bump();
      
      expect(result).toEqual({
        current: '1.0.0',
        new: '1.0.1',
        files: [],
        committed: false,
        tagged: false,
        pushed: false
      });
      
      expect(versionManager.validateGitStatus).toHaveBeenCalled();
      expect(versionManager.getCurrentVersion).toHaveBeenCalled();
      expect(versionManager.calculateNewVersion).toHaveBeenCalled();
      expect(versionManager.updateVersionFiles).toHaveBeenCalled();
    });

    it('should handle dry run', async () => {
      versionManager.options.dryRun = true;
      
      const result = await versionManager.bump();
      
      expect(result).toEqual({
        current: '1.0.0',
        new: '1.0.1',
        dryRun: true
      });
      
      expect(versionManager.updateVersionFiles).not.toHaveBeenCalled();
    });

    it('should commit changes when enabled', async () => {
      versionManager.options.commit = true;
      versionManager.modifiedFiles = ['package.json'];
      
      await versionManager.bump();
      
      expect(versionManager.commitChanges).toHaveBeenCalled();
    });

    it('should create tag when enabled', async () => {
      versionManager.options.tag = true;
      
      await versionManager.bump();
      
      expect(versionManager.createTag).toHaveBeenCalled();
    });

    it('should push changes when enabled', async () => {
      versionManager.options.push = true;
      
      await versionManager.bump();
      
      expect(versionManager.pushChanges).toHaveBeenCalled();
    });

    it('should handle bump failure', async () => {
      versionManager.validateGitStatus.mockRejectedValue(new Error('Git error'));
      
      await expect(versionManager.bump()).rejects.toThrow('Git error');
    });
  });

  describe('validateGitStatus', () => {
    it('should validate clean git status', async () => {
      spawn.mockImplementation((cmd, args) => {
        if (args.includes('--porcelain')) {
          return createMockProcess(0, '');
        } else if (args.includes('--abbrev-ref')) {
          return createMockProcess(0, 'main\n');
        }
        return createMockProcess(0);
      });
      
      await versionManager.validateGitStatus();
      
      expect(versionManager.currentBranch).toBe('main');
    });

    it('should throw on uncommitted changes', async () => {
      spawn.mockImplementation((cmd, args) => {
        if (args.includes('--porcelain')) {
          return createMockProcess(0, 'M package.json\n');
        }
        return createMockProcess(0);
      });
      
      await expect(versionManager.validateGitStatus()).rejects.toThrow('Uncommitted changes detected');
    });

    it('should allow force with uncommitted changes', async () => {
      versionManager.options.force = true;
      spawn.mockImplementation((cmd, args) => {
        if (args.includes('--porcelain')) {
          return createMockProcess(0, 'M package.json\n');
        } else if (args.includes('--abbrev-ref')) {
          return createMockProcess(0, 'main\n');
        }
        return createMockProcess(0);
      });
      
      await expect(versionManager.validateGitStatus()).resolves.not.toThrow();
    });

    it('should throw when not in git repository', async () => {
      spawn.mockReturnValue(createMockProcess(128, '', 'fatal: not a git repository'));
      
      await expect(versionManager.validateGitStatus()).rejects.toThrow('Not in a git repository');
    });
  });

  describe('getCurrentVersion', () => {
    it('should read version from package.json', async () => {
      await versionManager.getCurrentVersion();
      
      expect(versionManager.currentVersion).toBe('1.0.0');
      expect(fs.readFile).toHaveBeenCalledWith('package.json', 'utf8');
    });

    it('should throw on invalid version', async () => {
      mockPackageJson.version = 'invalid-version';
      
      await expect(versionManager.getCurrentVersion()).rejects.toThrow('Invalid version in package.json');
    });

    it('should throw when package.json not found', async () => {
      fs.readFile.mockRejectedValue(new Error('ENOENT'));
      
      await expect(versionManager.getCurrentVersion()).rejects.toThrow('Failed to read package.json');
    });
  });

  describe('calculateNewVersion', () => {
    beforeEach(() => {
      versionManager.currentVersion = '1.0.0';
    });

    it('should calculate major version bump', async () => {
      versionManager.options.type = 'major';
      await versionManager.calculateNewVersion();
      expect(versionManager.newVersion).toBe('2.0.0');
    });

    it('should calculate minor version bump', async () => {
      versionManager.options.type = 'minor';
      await versionManager.calculateNewVersion();
      expect(versionManager.newVersion).toBe('1.1.0');
    });

    it('should calculate patch version bump', async () => {
      versionManager.options.type = 'patch';
      await versionManager.calculateNewVersion();
      expect(versionManager.newVersion).toBe('1.0.1');
    });

    it('should calculate prerelease version', async () => {
      versionManager.options.type = 'prerelease';
      versionManager.options.preid = 'beta';
      await versionManager.calculateNewVersion();
      expect(versionManager.newVersion).toBe('1.0.1-beta.0');
    });

    it('should handle release from prerelease', async () => {
      versionManager.currentVersion = '1.0.1-beta.0';
      versionManager.options.type = 'release';
      await versionManager.calculateNewVersion();
      expect(versionManager.newVersion).toBe('1.0.1');
    });

    it('should throw when releasing non-prerelease', async () => {
      versionManager.options.type = 'release';
      await expect(versionManager.calculateNewVersion()).rejects.toThrow('Current version is not a prerelease');
    });

    it('should accept specific version', async () => {
      versionManager.options.type = '2.0.0';
      await versionManager.calculateNewVersion();
      expect(versionManager.newVersion).toBe('2.0.0');
    });

    it('should throw when specific version is not greater', async () => {
      versionManager.options.type = '0.9.0';
      await expect(versionManager.calculateNewVersion()).rejects.toThrow('New version must be greater than current version');
    });

    it('should throw on invalid version type', async () => {
      versionManager.options.type = 'invalid';
      await expect(versionManager.calculateNewVersion()).rejects.toThrow('Invalid version type: invalid');
    });
  });

  describe('updateVersionFiles', () => {
    beforeEach(() => {
      versionManager.currentVersion = '1.0.0';
      versionManager.newVersion = '1.0.1';
      versionManager.updatePackageJson = jest.fn().mockResolvedValue();
      versionManager.updatePackageLock = jest.fn().mockResolvedValue();
      versionManager.updateFile = jest.fn().mockResolvedValue();
      versionManager.updateGlobFiles = jest.fn().mockResolvedValue();
    });

    it('should update all version files', async () => {
      await versionManager.updateVersionFiles();
      
      expect(versionManager.updatePackageJson).toHaveBeenCalled();
      expect(versionManager.updatePackageLock).toHaveBeenCalled();
    });

    it('should handle glob patterns', async () => {
      versionManager.options.files = ['package.json', 'charts/*/Chart.yaml'];
      
      await versionManager.updateVersionFiles();
      
      expect(versionManager.updateGlobFiles).toHaveBeenCalledWith('charts/*/Chart.yaml');
    });

    it('should handle regular files', async () => {
      versionManager.options.files = ['package.json', 'version.go'];
      
      await versionManager.updateVersionFiles();
      
      expect(versionManager.updateFile).toHaveBeenCalledWith('version.go');
    });
  });

  describe('updatePackageJson', () => {
    it('should update package.json version', async () => {
      versionManager.newVersion = '1.0.1';
      
      await versionManager.updatePackageJson();
      
      expect(fs.writeFile).toHaveBeenCalledWith(
        'package.json',
        expect.stringContaining('"version": "1.0.1"')
      );
      expect(versionManager.modifiedFiles).toContain('package.json');
    });

    it('should handle file write error', async () => {
      fs.writeFile.mockRejectedValue(new Error('Write error'));
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      await versionManager.updatePackageJson();
      
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to update package.json'));
      consoleSpy.mockRestore();
    });
  });

  describe('updatePackageLock', () => {
    it('should update package-lock.json version', async () => {
      versionManager.newVersion = '1.0.1';
      
      await versionManager.updatePackageLock();
      
      const writeCall = fs.writeFile.mock.calls.find(call => call[0] === 'package-lock.json');
      expect(writeCall).toBeDefined();
      expect(writeCall[1]).toContain('"version": "1.0.1"');
      expect(versionManager.modifiedFiles).toContain('package-lock.json');
    });

    it('should handle missing package-lock.json', async () => {
      fs.readFile.mockImplementation((file) => {
        if (file === 'package-lock.json') {
          return Promise.reject(new Error('ENOENT'));
        }
        return Promise.resolve('{}');
      });
      
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      await versionManager.updatePackageLock();
      
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('version update methods', () => {
    beforeEach(() => {
      versionManager.currentVersion = '1.0.0';
      versionManager.newVersion = '1.0.1';
    });

    describe('updateYamlVersion', () => {
      it('should update version in YAML', () => {
        const content = 'version: 1.0.0\nname: test';
        const updated = versionManager.updateYamlVersion(content);
        expect(updated).toContain('version: 1.0.1');
      });

      it('should update appVersion in YAML', () => {
        const content = 'appVersion: 1.0.0\nname: test';
        const updated = versionManager.updateYamlVersion(content);
        expect(updated).toContain('appVersion: 1.0.1');
      });
    });

    describe('updateGoVersion', () => {
      it('should update version constant in Go', () => {
        const content = 'const Version = "1.0.0"';
        const updated = versionManager.updateGoVersion(content);
        expect(updated).toContain('Version = "1.0.1"');
      });
    });

    describe('updatePythonVersion', () => {
      it('should update version variable in Python', () => {
        const content = '__version__ = "1.0.0"';
        const updated = versionManager.updatePythonVersion(content);
        expect(updated).toContain('__version__ = "1.0.1"');
      });

      it('should handle single quotes', () => {
        const content = "__version__ = '1.0.0'";
        const updated = versionManager.updatePythonVersion(content);
        expect(updated).toContain('__version__ = "1.0.1"');
      });
    });

    describe('updateMarkdownVersion', () => {
      it('should update version badge in Markdown', () => {
        const content = '![Version](https://img.shields.io/badge/version-1.0.0-blue)';
        const updated = versionManager.updateMarkdownVersion(content);
        expect(updated).toContain('version-1.0.1-blue');
      });

      it('should update version in title', () => {
        const content = '# My App v1.0.0';
        const updated = versionManager.updateMarkdownVersion(content);
        expect(updated).toContain('# My App v1.0.1');
      });
    });
  });

  describe('updateGlobFiles', () => {
    it('should update files matching glob pattern', async () => {
      glob.mockImplementation((pattern, callback) => {
        callback(null, ['charts/app1/Chart.yaml', 'charts/app2/Chart.yaml']);
      });
      
      versionManager.updateFile = jest.fn().mockResolvedValue();
      
      await versionManager.updateGlobFiles('charts/*/Chart.yaml');
      
      expect(versionManager.updateFile).toHaveBeenCalledWith('charts/app1/Chart.yaml');
      expect(versionManager.updateFile).toHaveBeenCalledWith('charts/app2/Chart.yaml');
    });

    it('should handle glob errors', async () => {
      glob.mockImplementation((pattern, callback) => {
        callback(new Error('Glob error'));
      });
      
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      await versionManager.updateGlobFiles('charts/*/Chart.yaml');
      
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to process glob'));
      consoleSpy.mockRestore();
    });
  });

  describe('git operations', () => {
    beforeEach(() => {
      versionManager.newVersion = '1.0.1';
      versionManager.modifiedFiles = ['package.json', 'package-lock.json'];
    });

    describe('commitChanges', () => {
      it('should commit version changes', async () => {
        await versionManager.commitChanges();
        
        expect(spawn).toHaveBeenCalledWith('git', ['add', 'package.json', 'package-lock.json']);
        expect(spawn).toHaveBeenCalledWith('git', [
          'commit',
          '-m',
          'chore: bump version to 1.0.1'
        ]);
      });

      it('should handle commit failure', async () => {
        spawn.mockReturnValue(createMockProcess(1, '', 'commit failed'));
        
        await expect(versionManager.commitChanges()).rejects.toThrow('Failed to commit changes');
      });
    });

    describe('createTag', () => {
      it('should create annotated tag', async () => {
        await versionManager.createTag();
        
        expect(spawn).toHaveBeenCalledWith('git', [
          'tag',
          '-a',
          'v1.0.1',
          '-m',
          'Release v1.0.1'
        ]);
      });

      it('should handle tag creation failure', async () => {
        spawn.mockReturnValue(createMockProcess(1, '', 'tag already exists'));
        
        await expect(versionManager.createTag()).rejects.toThrow('Failed to create tag');
      });
    });

    describe('pushChanges', () => {
      it('should push commits and tags', async () => {
        versionManager.currentBranch = 'main';
        
        await versionManager.pushChanges();
        
        expect(spawn).toHaveBeenCalledWith('git', ['push', 'origin', 'main']);
        expect(spawn).toHaveBeenCalledWith('git', ['push', 'origin', 'v1.0.1']);
      });

      it('should handle push failure', async () => {
        spawn.mockReturnValue(createMockProcess(1, '', 'push failed'));
        
        await expect(versionManager.pushChanges()).rejects.toThrow('Failed to push changes');
      });
    });
  });

  describe('utility methods', () => {
    describe('runCommand', () => {
      it('should execute command successfully', async () => {
        spawn.mockReturnValue(createMockProcess(0, 'success\n'));
        
        const result = await versionManager.runCommand('echo', ['test']);
        expect(result).toBe('success');
      });

      it('should throw on command failure', async () => {
        spawn.mockReturnValue(createMockProcess(1, '', 'error'));
        
        await expect(versionManager.runCommand('false', [])).rejects.toThrow('Command failed');
      });
    });
  });

  describe('CLI execution', () => {
    it('should handle CLI arguments', () => {
      const originalArgv = process.argv;
      process.argv = ['node', 'version-bump.js', 'minor', '--dry-run'];
      
      jest.isolateModules(() => {
        require('../../../../scripts/build/version-bump');
      });
      
      process.argv = originalArgv;
    });
  });
});