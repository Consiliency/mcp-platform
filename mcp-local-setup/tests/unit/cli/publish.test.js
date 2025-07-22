/**
 * Unit tests for PublishCommand
 */

const path = require('path');
const PublishCommand = require('../../../cli/commands/publish');

// Mock modules
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    mkdir: jest.fn(),
    access: jest.fn(),
    stat: jest.fn(),
    readdir: jest.fn()
  }
}));

jest.mock('child_process', () => ({
  exec: jest.fn()
}));

const fs = require('fs').promises;
const { exec } = require('child_process');

describe('PublishCommand', () => {
  let publishCommand;
  let mockPackageJson;
  let mockMcpJson;
  let mockCatalog;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock exec for async operations
    exec.mockImplementation((cmd, cb) => cb(null, { stdout: '', stderr: '' }));

    // Create test data
    mockPackageJson = {
      name: "test-service",
      version: "1.0.0",
      dependencies: {
        "express": "^4.17.1"
      },
      engines: {
        "node": ">=14.0.0"
      }
    };

    mockMcpJson = {
      name: "Test Service",
      description: "A test MCP service",
      category: "development",
      source: {
        type: "npm",
        package: "test-service"
      },
      tags: ["test", "development"]
    };

    mockCatalog = {
      version: "2.0",
      updated: "2025-01-22",
      servers: []
    };

    // Mock file operations
    fs.stat.mockResolvedValue({ isDirectory: () => true });
    fs.access.mockResolvedValue();
    fs.readFile.mockImplementation((filePath) => {
      if (filePath.includes('package.json')) {
        return Promise.resolve(JSON.stringify(mockPackageJson));
      } else if (filePath.includes('mcp.json')) {
        return Promise.resolve(JSON.stringify(mockMcpJson));
      } else if (filePath.includes('catalog.json')) {
        return Promise.resolve(JSON.stringify(mockCatalog));
      }
      return Promise.resolve('{}');
    });
    fs.writeFile.mockResolvedValue();
    fs.mkdir.mockResolvedValue();
    fs.readdir.mockResolvedValue([
      { name: 'index.js', isDirectory: () => false },
      { name: 'package.json', isDirectory: () => false }
    ]);

    // Create command instance
    publishCommand = new PublishCommand();
  });

  describe('validateService', () => {
    it('should validate a valid service', async () => {
      const result = await publishCommand.validateService('/test/path');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing required files', async () => {
      fs.access.mockImplementation((filePath) => {
        if (filePath.includes('mcp.json')) {
          return Promise.reject(new Error('File not found'));
        }
        return Promise.resolve();
      });

      const result = await publishCommand.validateService('/test/path');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required file: mcp.json');
    });

    it('should validate package.json fields', async () => {
      mockPackageJson = { version: "1.0.0" }; // Missing name
      fs.readFile.mockImplementation((filePath) => {
        if (filePath.includes('package.json')) {
          return Promise.resolve(JSON.stringify(mockPackageJson));
        }
        return Promise.resolve(JSON.stringify(mockMcpJson));
      });

      const result = await publishCommand.validateService('/test/path');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('package.json must have a name field');
    });

    it('should validate version format', async () => {
      mockPackageJson.version = "invalid-version";
      fs.readFile.mockImplementation((filePath) => {
        if (filePath.includes('package.json')) {
          return Promise.resolve(JSON.stringify(mockPackageJson));
        }
        return Promise.resolve(JSON.stringify(mockMcpJson));
      });

      const result = await publishCommand.validateService('/test/path');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid version format in package.json');
    });

    it('should validate mcp.json fields', async () => {
      mockMcpJson = { name: "Test" }; // Missing required fields
      fs.readFile.mockImplementation((filePath) => {
        if (filePath.includes('mcp.json')) {
          return Promise.resolve(JSON.stringify(mockMcpJson));
        }
        return Promise.resolve(JSON.stringify(mockPackageJson));
      });

      const result = await publishCommand.validateService('/test/path');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('mcp.json must have a description field');
      expect(result.errors).toContain('mcp.json must have a source field');
    });

    it('should validate source type', async () => {
      mockMcpJson.source = { type: "invalid" };
      fs.readFile.mockImplementation((filePath) => {
        if (filePath.includes('mcp.json')) {
          return Promise.resolve(JSON.stringify(mockMcpJson));
        }
        return Promise.resolve(JSON.stringify(mockPackageJson));
      });

      const result = await publishCommand.validateService('/test/path');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid source type: invalid');
    });

    it('should generate warnings for missing optional files', async () => {
      fs.access.mockImplementation((filePath) => {
        if (filePath.includes('README.md') || filePath.includes('test')) {
          return Promise.reject(new Error('File not found'));
        }
        return Promise.resolve();
      });

      const result = await publishCommand.validateService('/test/path');

      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('No README.md found - documentation is recommended');
      expect(result.warnings).toContain('No test directory found - tests are recommended');
    });
  });

  describe('manageMetadata', () => {
    it('should enhance metadata with defaults', async () => {
      const metadata = {
        name: "test-service",
        version: "1.0.0"
      };

      const enhanced = await publishCommand.manageMetadata(metadata);

      expect(enhanced.id).toBe('test-service');
      expect(enhanced.publishedAt).toBeDefined();
      expect(enhanced.publisher).toBeDefined();
      expect(enhanced.featured).toBe(false);
      expect(enhanced.category).toBe('custom');
      expect(enhanced.community).toEqual({
        rating: 0,
        downloads: 0,
        reviews: []
      });
      expect(enhanced.checksum).toBeDefined();
    });

    it('should normalize category', async () => {
      const metadata = {
        name: "test-service",
        category: "invalid-category"
      };

      const enhanced = await publishCommand.manageMetadata(metadata);

      expect(enhanced.category).toBe('custom');
    });

    it('should generate ID from name', async () => {
      const metadata = {
        name: "Test Service Name!"
      };

      const enhanced = await publishCommand.manageMetadata(metadata);

      expect(enhanced.id).toBe('test-service-name-');
    });
  });

  describe('handleVersioning', () => {
    it('should handle new service', async () => {
      const result = await publishCommand.handleVersioning('1.0.0');

      expect(result.version).toBe('1.0.0');
      expect(result.isNewService).toBe(true);
      expect(result.previousVersions).toEqual([]);
    });

    it('should handle version update', async () => {
      mockCatalog.servers = [{
        id: 'test-service',
        version: '1.0.0',
        publishedAt: '2025-01-01T00:00:00Z'
      }];
      fs.readFile.mockImplementation((filePath) => {
        if (filePath.includes('catalog.json')) {
          return Promise.resolve(JSON.stringify(mockCatalog));
        }
        return Promise.resolve('{}');
      });

      const result = await publishCommand.handleVersioning('1.1.0');

      expect(result.version).toBe('1.1.0');
      expect(result.isNewService).toBe(false);
      expect(result.versionBump).toBe('minor');
      expect(result.previousVersions).toHaveLength(1);
    });

    it('should reject lower versions', async () => {
      mockCatalog.servers = [{
        id: 'test-service',
        version: '2.0.0'
      }];
      fs.readFile.mockImplementation((filePath) => {
        if (filePath.includes('catalog.json')) {
          return Promise.resolve(JSON.stringify(mockCatalog));
        }
        return Promise.resolve('{}');
      });

      await expect(publishCommand.handleVersioning('1.0.0'))
        .rejects.toThrow('New version (1.0.0) must be greater than existing version (2.0.0)');
    });

    it('should warn on major version bump', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      mockCatalog.servers = [{
        id: 'test-service',
        version: '1.0.0'
      }];
      fs.readFile.mockImplementation((filePath) => {
        if (filePath.includes('catalog.json')) {
          return Promise.resolve(JSON.stringify(mockCatalog));
        }
        return Promise.resolve('{}');
      });

      await publishCommand.handleVersioning('2.0.0');

      expect(consoleSpy).toHaveBeenCalledWith(
        'Major version bump detected - ensure breaking changes are documented'
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('execute', () => {
    it('should publish a valid service', async () => {
      const result = await publishCommand.execute(['/test/path'], {});

      expect(result.success).toBe(true);
      expect(result.service).toBe('Test Service');
      expect(result.version).toBe('1.0.0');
      expect(result.packageId).toBeDefined();
      expect(result.registry).toBe('local');
    });

    it('should handle dry run', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const result = await publishCommand.execute(['/test/path'], { dryRun: true });

      expect(result.success).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Dry run completed successfully. No changes were made.'
      );
      expect(fs.writeFile).not.toHaveBeenCalledWith(
        expect.stringContaining('catalog.json'),
        expect.any(String)
      );

      consoleSpy.mockRestore();
    });

    it('should handle validation failure', async () => {
      fs.access.mockImplementation((filePath) => {
        if (filePath.includes('mcp.json')) {
          return Promise.reject(new Error('File not found'));
        }
        return Promise.resolve();
      });

      await expect(publishCommand.execute(['/test/path'], {}))
        .rejects.toThrow('Service validation failed');
    });
  });

  describe('private methods', () => {
    it('should calculate checksum', async () => {
      const metadata = {
        name: 'test-service',
        version: '1.0.0',
        source: { type: 'npm' }
      };

      const checksum = await publishCommand._calculateChecksum(metadata);

      expect(checksum).toBeDefined();
      expect(checksum).toHaveLength(64); // SHA256 hex length
    });

    it('should list package files', async () => {
      fs.readdir.mockResolvedValue([
        { name: 'index.js', isDirectory: () => false },
        { name: 'lib', isDirectory: () => true },
        { name: '.git', isDirectory: () => true },
        { name: 'node_modules', isDirectory: () => true }
      ]);
      fs.stat.mockResolvedValue({
        size: 1024,
        mtime: new Date()
      });

      const files = await publishCommand._listPackageFiles('/test/path');

      expect(files).toHaveLength(1);
      expect(files[0].path).toBe('index.js');
      expect(files[0].size).toBe(1024);
      // Should skip .git and node_modules
    });
  });
});