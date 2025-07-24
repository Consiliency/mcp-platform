/**
 * Unit tests for BuildOrchestrator
 * @module tests/unit/scripts/build/build.test
 */

const BuildOrchestrator = require('../../../../scripts/build/build');
const fs = require('fs').promises;
const { spawn } = require('child_process');
const path = require('path');
const crypto = require('crypto');

// Mock dependencies
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    mkdir: jest.fn(),
    rm: jest.fn(),
    readdir: jest.fn(),
    stat: jest.fn(),
    access: jest.fn(),
    statfs: jest.fn(),
    cp: jest.fn(),
    rename: jest.fn()
  }
}));
jest.mock('child_process');
jest.mock('../../../../scripts/build/asset-optimize', () => ({
  optimize: jest.fn().mockResolvedValue({})
}));
jest.mock('../../../../scripts/build/package', () => ({
  package: jest.fn().mockResolvedValue([
    { name: 'package.tar.gz', size: 1024000 }
  ])
}));

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

describe('BuildOrchestrator', () => {
  let orchestrator;
  let mockPackageJson;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock package.json
    mockPackageJson = { version: '1.0.0' };
    jest.doMock('../../../../package.json', () => mockPackageJson, { virtual: true });
    
    // Default mocks
    fs.readFile.mockResolvedValue(Buffer.from('mock content'));
    fs.writeFile.mockResolvedValue();
    fs.mkdir.mockResolvedValue();
    fs.rm.mockResolvedValue();
    fs.readdir.mockResolvedValue([]);
    fs.stat.mockResolvedValue({ size: 1000 });
    fs.access.mockResolvedValue();
    fs.statfs.mockResolvedValue({
      bavail: 2048 * 1024,
      bsize: 1024
    });
    fs.cp.mockResolvedValue();
    
    spawn.mockReturnValue(createMockProcess());
    
    orchestrator = new BuildOrchestrator({
      outputDir: '/tmp/dist',
      cacheDir: '/tmp/cache',
      verbose: false,
      skipCache: true
    });
  });

  afterEach(() => {
    jest.resetModules();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const builder = new BuildOrchestrator();
      expect(builder.options.target).toBe('production');
      expect(builder.options.platform).toBe(process.platform);
      expect(builder.options.arch).toBe(process.arch);
      expect(builder.options.parallel).toBe(true);
      expect(builder.options.verbose).toBe(false);
    });

    it('should merge custom options', () => {
      const builder = new BuildOrchestrator({
        target: 'development',
        verbose: true,
        skipTests: true
      });
      expect(builder.options.target).toBe('development');
      expect(builder.options.verbose).toBe(true);
      expect(builder.options.skipTests).toBe(true);
    });

    it('should initialize build manifest', () => {
      expect(orchestrator.buildManifest).toHaveProperty('version', '1.0.0');
      expect(orchestrator.buildManifest).toHaveProperty('target', 'production');
      expect(orchestrator.buildManifest).toHaveProperty('components', {});
      expect(orchestrator.buildManifest).toHaveProperty('artifacts', []);
    });
  });

  describe('build', () => {
    it('should execute all build steps successfully', async () => {
      const result = await orchestrator.build();
      
      expect(result).toHaveProperty('version', '1.0.0');
      expect(result).toHaveProperty('artifacts');
      expect(result.artifacts).toHaveLength(1);
    });

    it('should handle build failure gracefully', async () => {
      const error = new Error('Build failed');
      orchestrator.validateEnvironment = jest.fn().mockRejectedValue(error);
      
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      await orchestrator.build();
      
      expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Build failed:', 'Build failed');
      expect(exitSpy).toHaveBeenCalledWith(1);
      
      exitSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('validateEnvironment', () => {
    it('should pass all environment checks', async () => {
      await expect(orchestrator.validateEnvironment()).resolves.not.toThrow();
    });

    it('should fail when Node version is too low', async () => {
      const originalVersion = process.version;
      Object.defineProperty(process, 'version', {
        value: 'v16.0.0',
        configurable: true
      });
      
      await expect(orchestrator.validateEnvironment()).rejects.toThrow('Environment validation failed');
      
      Object.defineProperty(process, 'version', {
        value: originalVersion,
        configurable: true
      });
    });

    it('should check npm version', async () => {
      await orchestrator.checkNpmVersion();
      expect(spawn).toHaveBeenCalledWith('npm', ['--version']);
    });

    it('should check disk space', async () => {
      const result = await orchestrator.checkDiskSpace();
      expect(result.success).toBe(true);
      expect(fs.statfs).toHaveBeenCalled();
    });

    it('should fail when disk space is insufficient', async () => {
      fs.statfs.mockResolvedValue({
        bavail: 100,
        bsize: 1024
      });
      
      const result = await orchestrator.checkDiskSpace();
      expect(result.success).toBe(false);
      expect(result.error).toContain('Insufficient disk space');
    });

    it('should check required tools', async () => {
      spawn.mockImplementation((cmd) => {
        if (cmd === 'which') {
          return createMockProcess(0, '/usr/bin/tool');
        }
        return createMockProcess();
      });
      
      const result = await orchestrator.checkRequiredTools();
      expect(result.success).toBe(true);
    });
  });

  describe('clean', () => {
    it('should remove and recreate directories', async () => {
      await orchestrator.clean();
      
      expect(fs.rm).toHaveBeenCalledWith(expect.stringContaining('dist'), { recursive: true, force: true });
      expect(fs.rm).toHaveBeenCalledWith(expect.stringContaining('coverage'), { recursive: true, force: true });
      expect(fs.mkdir).toHaveBeenCalledWith('/tmp/dist', { recursive: true });
      expect(fs.mkdir).toHaveBeenCalledWith('/tmp/cache', { recursive: true });
    });
  });

  describe('installDependencies', () => {
    it('should install npm dependencies', async () => {
      await orchestrator.installDependencies();
      
      expect(spawn).toHaveBeenCalledWith('npm', ['ci', '--no-audit', '--prefer-offline']);
    });

    it('should install Python dependencies when requirements.txt exists', async () => {
      fs.access.mockImplementation((file) => {
        if (file === 'requirements.txt') return Promise.resolve();
        return Promise.reject(new Error('Not found'));
      });
      
      await orchestrator.installDependencies();
      
      expect(spawn).toHaveBeenCalledWith('pip', ['install', '-r', 'requirements.txt']);
    });

    it('should install Go dependencies when go.mod exists', async () => {
      fs.access.mockImplementation((file) => {
        if (file === 'go.mod') return Promise.resolve();
        return Promise.reject(new Error('Not found'));
      });
      
      await orchestrator.installDependencies();
      
      expect(spawn).toHaveBeenCalledWith('go', ['mod', 'download']);
    });
  });

  describe('preBuild', () => {
    it('should run all pre-build tasks', async () => {
      orchestrator.generateBuildInfo = jest.fn().mockResolvedValue();
      orchestrator.runLinters = jest.fn().mockResolvedValue();
      orchestrator.runTests = jest.fn().mockResolvedValue();
      
      await orchestrator.preBuild();
      
      expect(orchestrator.generateBuildInfo).toHaveBeenCalled();
      expect(orchestrator.runLinters).toHaveBeenCalled();
      expect(orchestrator.runTests).toHaveBeenCalled();
    });

    it('should skip linting when skipLint is true', async () => {
      orchestrator.options.skipLint = true;
      orchestrator.runLinters = jest.fn();
      
      await orchestrator.preBuild();
      
      expect(orchestrator.runLinters).not.toHaveBeenCalled();
    });

    it('should skip tests when skipTests is true', async () => {
      orchestrator.options.skipTests = true;
      orchestrator.runTests = jest.fn();
      
      await orchestrator.preBuild();
      
      expect(orchestrator.runTests).not.toHaveBeenCalled();
    });
  });

  describe('buildComponents', () => {
    beforeEach(() => {
      orchestrator.buildFrontend = jest.fn().mockResolvedValue({ outputDir: '/tmp/dist/frontend' });
      orchestrator.buildAPI = jest.fn().mockResolvedValue({ outputDir: '/tmp/dist/api' });
      orchestrator.buildWorker = jest.fn().mockResolvedValue({ outputDir: '/tmp/dist/worker' });
      orchestrator.buildCLI = jest.fn().mockResolvedValue({ outputDir: '/tmp/dist/cli' });
      orchestrator.buildSDK = jest.fn().mockResolvedValue({ outputDir: '/tmp/dist/sdk' });
    });

    it('should build all components in parallel', async () => {
      orchestrator.options.parallel = true;
      
      await orchestrator.buildComponents();
      
      expect(orchestrator.buildFrontend).toHaveBeenCalled();
      expect(orchestrator.buildAPI).toHaveBeenCalled();
      expect(orchestrator.buildWorker).toHaveBeenCalled();
      expect(orchestrator.buildCLI).toHaveBeenCalled();
      expect(orchestrator.buildSDK).toHaveBeenCalled();
      
      expect(orchestrator.buildManifest.components).toHaveProperty('frontend');
      expect(orchestrator.buildManifest.components.frontend.success).toBe(true);
    });

    it('should build components sequentially when parallel is false', async () => {
      orchestrator.options.parallel = false;
      
      await orchestrator.buildComponents();
      
      expect(orchestrator.buildFrontend).toHaveBeenCalled();
      expect(orchestrator.buildAPI).toHaveBeenCalled();
    });

    it('should handle component build failure', async () => {
      orchestrator.buildFrontend.mockRejectedValue(new Error('Frontend build failed'));
      
      await expect(orchestrator.buildComponents()).rejects.toThrow('Frontend build failed');
      
      expect(orchestrator.buildManifest.components.frontend).toHaveProperty('success', false);
      expect(orchestrator.buildManifest.components.frontend).toHaveProperty('error', 'Frontend build failed');
    });
  });

  describe('buildFrontend', () => {
    it('should build frontend for production', async () => {
      orchestrator.options.target = 'production';
      await orchestrator.buildFrontend();
      
      expect(spawn).toHaveBeenCalledWith('npm', ['run', 'build:frontend']);
      expect(fs.cp).toHaveBeenCalled();
    });

    it('should build frontend for development', async () => {
      orchestrator.options.target = 'development';
      await orchestrator.buildFrontend();
      
      expect(spawn).toHaveBeenCalledWith('npm', ['run', 'build:frontend:dev']);
    });
  });

  describe('postBuild', () => {
    it('should run post-build tasks', async () => {
      orchestrator.optimizeAssets = jest.fn().mockResolvedValue();
      orchestrator.generateLicenses = jest.fn().mockResolvedValue();
      orchestrator.createChecksums = jest.fn().mockResolvedValue();
      
      await orchestrator.postBuild();
      
      expect(orchestrator.optimizeAssets).toHaveBeenCalled();
      expect(orchestrator.generateLicenses).toHaveBeenCalled();
      expect(orchestrator.createChecksums).toHaveBeenCalled();
    });

    it('should skip optimization when skipOptimization is true', async () => {
      orchestrator.options.skipOptimization = true;
      orchestrator.optimizeAssets = jest.fn();
      
      await orchestrator.postBuild();
      
      expect(orchestrator.optimizeAssets).not.toHaveBeenCalled();
    });
  });

  describe('utility methods', () => {
    describe('compareVersions', () => {
      it('should compare versions correctly', () => {
        expect(orchestrator.compareVersions('1.0.0', '1.0.0')).toBe(0);
        expect(orchestrator.compareVersions('1.0.1', '1.0.0')).toBe(1);
        expect(orchestrator.compareVersions('1.0.0', '1.0.1')).toBe(-1);
        expect(orchestrator.compareVersions('2.0.0', '1.9.9')).toBe(1);
        expect(orchestrator.compareVersions('1.0', '1.0.0')).toBe(0);
      });
    });

    describe('getGitCommit', () => {
      it('should return git commit hash', async () => {
        spawn.mockReturnValue(createMockProcess(0, 'abc123def456\n'));
        
        const commit = await orchestrator.getGitCommit();
        expect(commit).toBe('abc123def456');
        expect(spawn).toHaveBeenCalledWith('git', ['rev-parse', 'HEAD']);
      });

      it('should return unknown on error', async () => {
        spawn.mockReturnValue(createMockProcess(1));
        
        const commit = await orchestrator.getGitCommit();
        expect(commit).toBe('unknown');
      });
    });

    describe('getAllFiles', () => {
      it('should recursively get all files', async () => {
        fs.readdir.mockImplementation((dir) => {
          if (dir === '/tmp/dist') {
            return Promise.resolve([
              { name: 'file1.js', isDirectory: () => false },
              { name: 'subdir', isDirectory: () => true }
            ]);
          } else if (dir === '/tmp/dist/subdir') {
            return Promise.resolve([
              { name: 'file2.js', isDirectory: () => false }
            ]);
          }
          return Promise.resolve([]);
        });
        
        const files = await orchestrator.getAllFiles('/tmp/dist');
        expect(files).toEqual([
          '/tmp/dist/file1.js',
          '/tmp/dist/subdir/file2.js'
        ]);
      });
    });

    describe('createChecksums', () => {
      it('should create checksums for all files', async () => {
        orchestrator.getAllFiles = jest.fn().mockResolvedValue([
          '/tmp/dist/file1.js',
          '/tmp/dist/file2.js'
        ]);
        
        await orchestrator.createChecksums();
        
        expect(fs.writeFile).toHaveBeenCalledWith(
          expect.stringContaining('checksums.json'),
          expect.any(String)
        );
      });
    });
  });

  describe('generateHTMLReport', () => {
    it('should generate valid HTML report', () => {
      const report = {
        version: '1.0.0',
        target: 'production',
        platform: 'linux',
        arch: 'x64',
        duration: '120.50',
        status: 'success',
        timestamp: new Date().toISOString(),
        components: {
          frontend: { success: true, duration: '30.25', files: 150, size: 5242880 },
          api: { success: false, error: 'Build failed' }
        },
        artifacts: [
          { name: 'package.tar.gz', size: 10485760 }
        ]
      };
      
      const html = orchestrator.generateHTMLReport(report);
      
      expect(html).toContain('<title>Build Report - 1.0.0</title>');
      expect(html).toContain('frontend');
      expect(html).toContain('✓');
      expect(html).toContain('✗');
      expect(html).toContain('package.tar.gz');
      expect(html).toContain('10.00 MB');
    });
  });

  describe('CLI execution', () => {
    it('should handle CLI arguments', () => {
      const originalArgv = process.argv;
      process.argv = ['node', 'build.js', 'development', '--verbose', '--skip-tests'];
      
      jest.isolateModules(() => {
        require('../../../../scripts/build/build');
      });
      
      process.argv = originalArgv;
    });
  });
});