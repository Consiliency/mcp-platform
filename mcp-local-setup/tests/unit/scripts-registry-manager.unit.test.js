/**
 * Unit tests for registry-manager.js functions
 */

const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');

// Mock dependencies
jest.mock('fs').promises;
jest.mock('js-yaml');

const RegistryManager = require('../../scripts/registry-manager');

describe('RegistryManager', () => {
  let registryManager;
  const mockBasePath = '/test/.mcp-platform';

  beforeEach(() => {
    jest.clearAllMocks();
    registryManager = new RegistryManager(mockBasePath);
  });

  describe('Constructor', () => {
    it('should initialize with correct paths', () => {
      expect(registryManager.basePath).toBe(mockBasePath);
      expect(registryManager.catalogPath).toBe(path.join(mockBasePath, 'registry', 'mcp-catalog.json'));
      expect(registryManager.dockerComposePath).toBe(path.join(mockBasePath, 'docker-compose.yml'));
      expect(registryManager.envPath).toBe(path.join(mockBasePath, '.env'));
      expect(registryManager.profilesPath).toBe(path.join(mockBasePath, 'profiles'));
    });

    it('should use MCP_HOME environment variable if no basePath provided', () => {
      process.env.MCP_HOME = '/custom/mcp';
      const rm = new RegistryManager();
      expect(rm.basePath).toBe('/custom/mcp');
      delete process.env.MCP_HOME;
    });
  });

  describe('loadCatalog', () => {
    it('should load and parse catalog successfully', async () => {
      const mockCatalog = {
        services: {
          'test-service': {
            id: 'test-service',
            name: 'Test Service',
            version: '1.0.0'
          }
        }
      };

      fs.readFile.mockResolvedValue(JSON.stringify(mockCatalog));
      
      const catalog = await registryManager.loadCatalog();
      
      expect(catalog).toEqual(mockCatalog);
      expect(fs.readFile).toHaveBeenCalledWith(registryManager.catalogPath, 'utf8');
    });

    it('should handle catalog file not found', async () => {
      fs.readFile.mockRejectedValue(new Error('ENOENT: no such file'));
      
      const catalog = await registryManager.loadCatalog();
      
      expect(catalog).toBeNull();
      expect(console.error).toHaveBeenCalledWith(
        'Failed to load catalog:',
        'ENOENT: no such file'
      );
    });

    it('should handle invalid JSON in catalog', async () => {
      fs.readFile.mockResolvedValue('invalid json{');
      
      const catalog = await registryManager.loadCatalog();
      
      expect(catalog).toBeNull();
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('loadProfile', () => {
    it('should load default profile', async () => {
      const mockProfile = {
        name: 'default',
        services: ['service1', 'service2'],
        settings: {
          auto_start: true
        }
      };

      fs.readFile.mockResolvedValue('mocked yaml content');
      yaml.load.mockReturnValue(mockProfile);
      
      const profile = await registryManager.loadProfile();
      
      expect(profile).toEqual(mockProfile);
      expect(fs.readFile).toHaveBeenCalledWith(
        path.join(mockBasePath, 'profiles', 'default.yml'),
        'utf8'
      );
    });

    it('should load specified profile', async () => {
      const mockProfile = {
        name: 'development',
        services: ['dev-service']
      };

      fs.readFile.mockResolvedValue('mocked yaml content');
      yaml.load.mockReturnValue(mockProfile);
      
      const profile = await registryManager.loadProfile('development');
      
      expect(profile).toEqual(mockProfile);
      expect(fs.readFile).toHaveBeenCalledWith(
        path.join(mockBasePath, 'profiles', 'development.yml'),
        'utf8'
      );
    });

    it('should handle profile not found', async () => {
      fs.readFile.mockRejectedValue(new Error('ENOENT'));
      
      const profile = await registryManager.loadProfile('missing');
      
      expect(profile).toBeNull();
      expect(console.error).toHaveBeenCalledWith(
        'Failed to load profile missing:',
        'ENOENT'
      );
    });
  });

  describe('generateDockerCompose', () => {
    it('should generate docker-compose configuration', async () => {
      const mockCatalog = {
        services: {
          'service1': {
            id: 'service1',
            docker: {
              image: 'test/service1:latest',
              ports: ['3000:3000'],
              environment: {
                NODE_ENV: 'production'
              }
            }
          },
          'service2': {
            id: 'service2',
            docker: {
              image: 'test/service2:latest',
              ports: ['4000:4000']
            }
          }
        }
      };

      const mockProfile = {
        name: 'test',
        services: ['service1', 'service2'],
        settings: {
          network: 'test-network'
        }
      };

      // Mock the methods
      registryManager.loadCatalog = jest.fn().mockResolvedValue(mockCatalog);
      registryManager.loadProfile = jest.fn().mockResolvedValue(mockProfile);
      yaml.dump = jest.fn().mockReturnValue('mocked yaml output');
      fs.writeFile = jest.fn().mockResolvedValue(undefined);

      await registryManager.generateDockerCompose('test');

      expect(registryManager.loadCatalog).toHaveBeenCalled();
      expect(registryManager.loadProfile).toHaveBeenCalledWith('test');
      expect(yaml.dump).toHaveBeenCalledWith(expect.objectContaining({
        version: '3.8',
        services: expect.any(Object),
        networks: expect.any(Object)
      }));
      expect(fs.writeFile).toHaveBeenCalledWith(
        registryManager.dockerComposePath,
        'mocked yaml output'
      );
    });

    it('should handle missing catalog', async () => {
      registryManager.loadCatalog = jest.fn().mockResolvedValue(null);
      
      await registryManager.generateDockerCompose();
      
      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it('should handle missing profile', async () => {
      registryManager.loadCatalog = jest.fn().mockResolvedValue({ services: {} });
      registryManager.loadProfile = jest.fn().mockResolvedValue(null);
      
      await registryManager.generateDockerCompose();
      
      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it('should filter services based on profile', async () => {
      const mockCatalog = {
        services: {
          'service1': { id: 'service1', docker: { image: 'test/service1' } },
          'service2': { id: 'service2', docker: { image: 'test/service2' } },
          'service3': { id: 'service3', docker: { image: 'test/service3' } }
        }
      };

      const mockProfile = {
        name: 'selective',
        services: ['service1', 'service3'] // Only include service1 and service3
      };

      registryManager.loadCatalog = jest.fn().mockResolvedValue(mockCatalog);
      registryManager.loadProfile = jest.fn().mockResolvedValue(mockProfile);
      yaml.dump = jest.fn().mockReturnValue('output');
      fs.writeFile = jest.fn().mockResolvedValue(undefined);

      await registryManager.generateDockerCompose('selective');

      const composeArg = yaml.dump.mock.calls[0][0];
      expect(Object.keys(composeArg.services)).toEqual(['service1', 'service3']);
      expect(composeArg.services.service2).toBeUndefined();
    });
  });

  describe('updateService', () => {
    it('should update service in catalog', async () => {
      const mockCatalog = {
        services: {
          'existing-service': {
            id: 'existing-service',
            version: '1.0.0'
          }
        }
      };

      registryManager.loadCatalog = jest.fn().mockResolvedValue(mockCatalog);
      fs.writeFile = jest.fn().mockResolvedValue(undefined);

      const updatedService = {
        id: 'existing-service',
        version: '2.0.0',
        description: 'Updated service'
      };

      await registryManager.updateService(updatedService);

      expect(fs.writeFile).toHaveBeenCalledWith(
        registryManager.catalogPath,
        expect.stringContaining('"version":"2.0.0"')
      );
    });

    it('should add new service to catalog', async () => {
      const mockCatalog = {
        services: {}
      };

      registryManager.loadCatalog = jest.fn().mockResolvedValue(mockCatalog);
      fs.writeFile = jest.fn().mockResolvedValue(undefined);

      const newService = {
        id: 'new-service',
        version: '1.0.0'
      };

      await registryManager.updateService(newService);

      const writtenData = JSON.parse(fs.writeFile.mock.calls[0][1]);
      expect(writtenData.services['new-service']).toEqual(newService);
    });
  });

  describe('removeService', () => {
    it('should remove service from catalog', async () => {
      const mockCatalog = {
        services: {
          'service1': { id: 'service1' },
          'service2': { id: 'service2' }
        }
      };

      registryManager.loadCatalog = jest.fn().mockResolvedValue(mockCatalog);
      fs.writeFile = jest.fn().mockResolvedValue(undefined);

      await registryManager.removeService('service1');

      const writtenData = JSON.parse(fs.writeFile.mock.calls[0][1]);
      expect(writtenData.services.service1).toBeUndefined();
      expect(writtenData.services.service2).toBeDefined();
    });

    it('should handle removing non-existent service', async () => {
      const mockCatalog = {
        services: {}
      };

      registryManager.loadCatalog = jest.fn().mockResolvedValue(mockCatalog);
      fs.writeFile = jest.fn().mockResolvedValue(undefined);

      await registryManager.removeService('non-existent');

      expect(fs.writeFile).toHaveBeenCalled();
    });
  });

  describe('validateCatalog', () => {
    it('should validate catalog structure', () => {
      const validCatalog = {
        services: {
          'service1': {
            id: 'service1',
            name: 'Service 1',
            version: '1.0.0',
            docker: {
              image: 'test/service1'
            }
          }
        }
      };

      const result = registryManager.validateCatalog(validCatalog);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should detect missing required fields', () => {
      const invalidCatalog = {
        services: {
          'service1': {
            id: 'service1',
            // Missing required fields: name, version, docker
          }
        }
      };

      const result = registryManager.validateCatalog(invalidCatalog);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Service service1 missing required field: name');
      expect(result.errors).toContain('Service service1 missing required field: version');
      expect(result.errors).toContain('Service service1 missing required field: docker');
    });
  });
});