/**
 * Unit tests for PackageBuilder
 * @module tests/unit/scripts/build/package.test
 */

const PackageBuilder = require('../../../../scripts/build/package');
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
    rename: jest.fn(),
    cp: jest.fn()
  },
  createWriteStream: jest.fn()
}));
jest.mock('child_process');
jest.mock('tar');
jest.mock('archiver');

// Mock archiver instance
const mockArchive = {
  pipe: jest.fn(),
  directory: jest.fn(),
  file: jest.fn(),
  finalize: jest.fn().mockResolvedValue(),
  on: jest.fn((event, handler) => {
    if (event === 'end') {
      process.nextTick(handler);
    }
  })
};

archiver.mockReturnValue(mockArchive);

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

describe('PackageBuilder', () => {
  let packageBuilder;
  let mockPackageJson;
  let mockWriteStream;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock package.json
    mockPackageJson = { version: '1.0.0' };
    jest.doMock('../../../../package.json', () => mockPackageJson, { virtual: true });
    
    // Mock write stream
    mockWriteStream = {
      on: jest.fn((event, handler) => {
        if (event === 'close') {
          process.nextTick(handler);
        }
      })
    };
    
    // Default mocks
    fs.access.mockResolvedValue();
    fs.mkdir.mockResolvedValue();
    fs.writeFile.mockResolvedValue();
    fs.readFile.mockResolvedValue(Buffer.from('mock content'));
    fs.readdir.mockResolvedValue([]);
    fs.stat.mockResolvedValue({ size: 1000 });
    fs.createWriteStream = jest.fn().mockReturnValue(mockWriteStream);
    
    spawn.mockReturnValue(createMockProcess());
    
    packageBuilder = new PackageBuilder({
      inputDir: '/tmp/dist',
      outputDir: '/tmp/packages',
      version: '1.0.0',
      sign: false // Disable signing by default in tests
    });
  });

  afterEach(() => {
    jest.resetModules();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const builder = new PackageBuilder();
      expect(builder.options.platform).toBe(process.platform);
      expect(builder.options.arch).toBe(process.arch);
      expect(builder.options.name).toBe('mcps');
      expect(builder.options.sign).toBe(true);
      expect(builder.options.compress).toBe(true);
    });

    it('should set platform-specific default formats', () => {
      const linuxBuilder = new PackageBuilder({ platform: 'linux' });
      expect(linuxBuilder.options.formats).toEqual(['tar.gz', 'deb', 'rpm', 'AppImage']);
      
      const darwinBuilder = new PackageBuilder({ platform: 'darwin' });
      expect(darwinBuilder.options.formats).toEqual(['tar.gz', 'dmg', 'pkg']);
      
      const win32Builder = new PackageBuilder({ platform: 'win32' });
      expect(win32Builder.options.formats).toEqual(['zip', 'exe', 'msi']);
      
      const otherBuilder = new PackageBuilder({ platform: 'freebsd' });
      expect(otherBuilder.options.formats).toEqual(['tar.gz', 'zip']);
    });

    it('should merge custom options', () => {
      const builder = new PackageBuilder({
        name: 'custom-app',
        formats: ['tar.gz'],
        compress: false
      });
      expect(builder.options.name).toBe('custom-app');
      expect(builder.options.formats).toEqual(['tar.gz']);
      expect(builder.options.compress).toBe(false);
    });
  });

  describe('package', () => {
    it('should create packages successfully', async () => {
      packageBuilder.options.formats = ['tar.gz', 'zip'];
      packageBuilder.createPackage = jest.fn().mockResolvedValue();
      packageBuilder.generateChecksums = jest.fn().mockResolvedValue();
      packageBuilder.generateManifest = jest.fn().mockResolvedValue();
      
      const artifacts = await packageBuilder.package();
      
      expect(packageBuilder.createPackage).toHaveBeenCalledTimes(2);
      expect(packageBuilder.createPackage).toHaveBeenCalledWith('tar.gz');
      expect(packageBuilder.createPackage).toHaveBeenCalledWith('zip');
      expect(packageBuilder.generateChecksums).toHaveBeenCalled();
      expect(packageBuilder.generateManifest).toHaveBeenCalled();
      expect(artifacts).toEqual(packageBuilder.artifacts);
    });

    it('should handle package creation failure gracefully', async () => {
      packageBuilder.options.formats = ['tar.gz', 'invalid'];
      packageBuilder.createPackage = jest.fn()
        .mockResolvedValueOnce()
        .mockRejectedValueOnce(new Error('Invalid format'));
      
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      await packageBuilder.package();
      
      expect(consoleSpy).toHaveBeenCalledWith('⚠️  Failed to create invalid package: Invalid format');
      consoleSpy.mockRestore();
    });

    it('should sign packages when enabled', async () => {
      packageBuilder.options.sign = true;
      packageBuilder.signPackages = jest.fn().mockResolvedValue();
      
      await packageBuilder.package();
      
      expect(packageBuilder.signPackages).toHaveBeenCalled();
    });
  });

  describe('validateInput', () => {
    it('should validate input directory exists', async () => {
      await expect(packageBuilder.validateInput()).resolves.not.toThrow();
      expect(fs.access).toHaveBeenCalledWith('/tmp/dist');
    });

    it('should throw when input directory not found', async () => {
      fs.access.mockRejectedValue(new Error('Not found'));
      
      await expect(packageBuilder.validateInput()).rejects.toThrow('Input directory not found: /tmp/dist');
    });

    it('should check for required tools', async () => {
      packageBuilder.options.formats = ['deb'];
      packageBuilder.commandExists = jest.fn().mockResolvedValue(true);
      
      await packageBuilder.validateInput();
      
      expect(packageBuilder.commandExists).toHaveBeenCalledWith('dpkg-deb');
      expect(packageBuilder.commandExists).toHaveBeenCalledWith('fakeroot');
    });

    it('should throw when required tools are missing', async () => {
      packageBuilder.options.formats = ['deb'];
      packageBuilder.commandExists = jest.fn().mockResolvedValue(false);
      
      await expect(packageBuilder.validateInput()).rejects.toThrow('Missing required tools for deb: dpkg-deb, fakeroot');
    });
  });

  describe('createPackage', () => {
    beforeEach(() => {
      packageBuilder.createTarGz = jest.fn().mockResolvedValue('/tmp/packages/mcps-1.0.0.tar.gz');
      packageBuilder.createZip = jest.fn().mockResolvedValue('/tmp/packages/mcps-1.0.0.zip');
      packageBuilder.createDeb = jest.fn().mockResolvedValue('/tmp/packages/mcps-1.0.0.deb');
      packageBuilder.createRpm = jest.fn().mockResolvedValue('/tmp/packages/mcps-1.0.0.rpm');
      packageBuilder.createDmg = jest.fn().mockResolvedValue('/tmp/packages/mcps-1.0.0.dmg');
      packageBuilder.createPkg = jest.fn().mockResolvedValue('/tmp/packages/mcps-1.0.0.pkg');
      packageBuilder.createExe = jest.fn().mockResolvedValue('/tmp/packages/mcps-1.0.0.exe');
      packageBuilder.createMsi = jest.fn().mockResolvedValue('/tmp/packages/mcps-1.0.0.msi');
      packageBuilder.createAppImage = jest.fn().mockResolvedValue('/tmp/packages/mcps-1.0.0.AppImage');
    });

    it('should create tar.gz package', async () => {
      await packageBuilder.createPackage('tar.gz');
      
      expect(packageBuilder.createTarGz).toHaveBeenCalled();
      expect(packageBuilder.artifacts).toHaveLength(1);
      expect(packageBuilder.artifacts[0]).toMatchObject({
        name: 'mcps-1.0.0.tar.gz',
        path: '/tmp/packages/mcps-1.0.0.tar.gz',
        format: 'tar.gz'
      });
    });

    it('should create zip package', async () => {
      await packageBuilder.createPackage('zip');
      
      expect(packageBuilder.createZip).toHaveBeenCalled();
      expect(packageBuilder.artifacts).toHaveLength(1);
    });

    it('should create platform-specific packages', async () => {
      const formats = ['deb', 'rpm', 'dmg', 'pkg', 'exe', 'msi', 'AppImage'];
      
      for (const format of formats) {
        packageBuilder.artifacts = [];
        await packageBuilder.createPackage(format);
        
        const methodName = `create${format.charAt(0).toUpperCase()}${format.slice(1)}`;
        expect(packageBuilder[methodName]).toHaveBeenCalled();
      }
    });

    it('should throw for unsupported format', async () => {
      await expect(packageBuilder.createPackage('invalid')).rejects.toThrow('Unsupported package format: invalid');
    });
  });

  describe('createTarGz', () => {
    it('should create tar.gz package', async () => {
      const tar = require('tar');
      tar.create = jest.fn().mockResolvedValue();
      
      const outputPath = await packageBuilder.createTarGz();
      
      expect(tar.create).toHaveBeenCalledWith({
        gzip: true,
        file: expect.stringContaining('mcps-1.0.0-linux-'),
        cwd: '/tmp/dist',
        portable: true,
        filter: expect.any(Function)
      }, ['.']);
      
      expect(outputPath).toContain('mcps-1.0.0-linux-');
      expect(outputPath).toEndWith('.tar.gz');
    });

    it('should apply compression when enabled', async () => {
      const tar = require('tar');
      tar.create = jest.fn().mockResolvedValue();
      packageBuilder.options.compress = true;
      await packageBuilder.createTarGz();
      
      expect(tar.create).toHaveBeenCalledWith(
        expect.objectContaining({ gzip: true }),
        ['.']
      );
    });
  });

  describe('createZip', () => {
    it('should create zip package', async () => {
      const outputPath = await packageBuilder.createZip();
      
      expect(archiver).toHaveBeenCalledWith('zip', {
        zlib: { level: 9 }
      });
      expect(mockArchive.directory).toHaveBeenCalledWith('/tmp/dist', false);
      expect(mockArchive.finalize).toHaveBeenCalled();
      expect(outputPath).toContain('mcps-1.0.0-linux-');
      expect(outputPath).toEndWith('.zip');
    });
  });

  describe('createDeb', () => {
    it('should create Debian package', async () => {
      packageBuilder.createDebianControl = jest.fn().mockResolvedValue();
      packageBuilder.copyBinaries = jest.fn().mockResolvedValue();
      packageBuilder.createSystemdService = jest.fn().mockResolvedValue();
      
      const outputPath = await packageBuilder.createDeb();
      
      expect(packageBuilder.createDebianControl).toHaveBeenCalled();
      expect(packageBuilder.copyBinaries).toHaveBeenCalled();
      expect(packageBuilder.createSystemdService).toHaveBeenCalled();
      expect(spawn).toHaveBeenCalledWith('fakeroot', [
        'dpkg-deb',
        '--build',
        expect.any(String),
        expect.stringContaining('.deb')
      ]);
      expect(outputPath).toEndWith('.deb');
    });
  });

  describe('createRpm', () => {
    it('should create RPM package', async () => {
      packageBuilder.createRpmSpec = jest.fn().mockResolvedValue();
      
      const outputPath = await packageBuilder.createRpm();
      
      expect(packageBuilder.createRpmSpec).toHaveBeenCalled();
      expect(spawn).toHaveBeenCalledWith('rpmbuild', [
        '-bb',
        '--define', expect.stringContaining('_topdir'),
        '--define', expect.stringContaining('_tmppath'),
        expect.stringContaining('.spec')
      ]);
      expect(outputPath).toEndWith('.rpm');
    });
  });

  describe('generateChecksums', () => {
    it('should generate checksums for all artifacts', async () => {
      packageBuilder.artifacts = [
        { path: '/tmp/packages/mcps-1.0.0.tar.gz', name: 'mcps-1.0.0.tar.gz' },
        { path: '/tmp/packages/mcps-1.0.0.zip', name: 'mcps-1.0.0.zip' }
      ];
      
      await packageBuilder.generateChecksums();
      
      expect(fs.readFile).toHaveBeenCalledTimes(2);
      expect(fs.writeFile).toHaveBeenCalledWith(
        '/tmp/packages/checksums.txt',
        expect.stringContaining('mcps-1.0.0.tar.gz')
      );
      expect(fs.writeFile).toHaveBeenCalledWith(
        '/tmp/packages/checksums.json',
        expect.any(String)
      );
    });
  });

  describe('signPackages', () => {
    it('should sign packages with GPG', async () => {
      packageBuilder.artifacts = [
        { path: '/tmp/packages/mcps-1.0.0.tar.gz', name: 'mcps-1.0.0.tar.gz' }
      ];
      
      await packageBuilder.signPackages();
      
      expect(spawn).toHaveBeenCalledWith('gpg', [
        '--detach-sign',
        '--armor',
        '/tmp/packages/mcps-1.0.0.tar.gz'
      ]);
    });

    it('should handle signing errors gracefully', async () => {
      packageBuilder.artifacts = [{ path: '/tmp/test.tar.gz' }];
      spawn.mockReturnValue(createMockProcess(1, '', 'GPG error'));
      
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      await packageBuilder.signPackages();
      
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to sign'));
      consoleSpy.mockRestore();
    });
  });

  describe('generateManifest', () => {
    it('should generate package manifest', async () => {
      packageBuilder.artifacts = [
        {
          name: 'mcps-1.0.0.tar.gz',
          path: '/tmp/packages/mcps-1.0.0.tar.gz',
          format: 'tar.gz',
          size: 1024000,
          checksum: 'abc123'
        }
      ];
      
      await packageBuilder.generateManifest();
      
      expect(fs.writeFile).toHaveBeenCalledWith(
        '/tmp/packages/manifest.json',
        expect.stringContaining('"version":"1.0.0"')
      );
    });
  });

  describe('utility methods', () => {
    describe('commandExists', () => {
      it('should check if command exists', async () => {
        spawn.mockReturnValue(createMockProcess(0));
        
        const exists = await packageBuilder.commandExists('dpkg-deb');
        expect(exists).toBe(true);
        expect(spawn).toHaveBeenCalledWith('which', ['dpkg-deb']);
      });

      it('should return false when command not found', async () => {
        spawn.mockReturnValue(createMockProcess(1));
        
        const exists = await packageBuilder.commandExists('nonexistent');
        expect(exists).toBe(false);
      });
    });

    describe('runCommand', () => {
      it('should execute command successfully', async () => {
        spawn.mockReturnValue(createMockProcess(0, 'success'));
        
        const result = await packageBuilder.runCommand('echo', ['test']);
        expect(result).toBe('success');
      });

      it('should throw on command failure', async () => {
        spawn.mockReturnValue(createMockProcess(1, '', 'error'));
        
        await expect(packageBuilder.runCommand('false', [])).rejects.toThrow('Command failed');
      });
    });

    describe('getPlatformName', () => {
      it('should return platform names', () => {
        expect(packageBuilder.getPlatformName('linux')).toBe('linux');
        expect(packageBuilder.getPlatformName('darwin')).toBe('macos');
        expect(packageBuilder.getPlatformName('win32')).toBe('windows');
        expect(packageBuilder.getPlatformName('freebsd')).toBe('freebsd');
      });
    });

    describe('getArchName', () => {
      it('should return architecture names', () => {
        expect(packageBuilder.getArchName('x64')).toBe('amd64');
        expect(packageBuilder.getArchName('x86')).toBe('i386');
        expect(packageBuilder.getArchName('arm64')).toBe('arm64');
        expect(packageBuilder.getArchName('arm')).toBe('armhf');
        expect(packageBuilder.getArchName('ppc64')).toBe('ppc64');
      });
    });
  });

  describe('CLI execution', () => {
    it('should handle CLI arguments', () => {
      const originalArgv = process.argv;
      process.argv = ['node', 'package.js', '--platform', 'linux', '--arch', 'x64'];
      
      jest.isolateModules(() => {
        require('../../../../scripts/build/package');
      });
      
      process.argv = originalArgv;
    });
  });
});