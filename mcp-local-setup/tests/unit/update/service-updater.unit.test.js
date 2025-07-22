/**
 * Unit tests for ServiceUpdater
 */

const ServiceUpdater = require('../../../scripts/service-updater');
const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

// Mock dependencies
jest.mock('fs', () => ({
    promises: {
        mkdir: jest.fn(),
        readFile: jest.fn(),
        writeFile: jest.fn(),
        readdir: jest.fn()
    }
}));

jest.mock('child_process', () => ({
    execSync: jest.fn()
}));

const mockFs = require('fs').promises;

describe('ServiceUpdater', () => {
    let serviceUpdater;

    beforeEach(() => {
        jest.clearAllMocks();
        serviceUpdater = new ServiceUpdater();
        
        // Setup default mock responses
        mockFs.mkdir.mockResolvedValue();
        mockFs.readFile.mockResolvedValue('{}');
        mockFs.writeFile.mockResolvedValue();
        mockFs.readdir.mockResolvedValue([]);
        execSync.mockReturnValue('');
    });

    describe('initialization', () => {
        it('should create service update directory', async () => {
            await serviceUpdater.initialize();

            expect(mockFs.mkdir).toHaveBeenCalledWith(
                expect.stringContaining('updates/services'),
                { recursive: true }
            );
        });
    });

    describe('checkServiceUpdates', () => {
        const mockRegistry = {
            services: {
                filesystem: {
                    version: '1.1.0',
                    dependencies: {}
                },
                git: {
                    version: '2.0.0',
                    dependencies: {
                        filesystem: '^1.1.0'
                    }
                }
            }
        };

        beforeEach(() => {
            mockFs.readFile.mockResolvedValue(JSON.stringify(mockRegistry));

            // Mock Docker ps output
            execSync.mockImplementation((cmd) => {
                if (cmd.includes('docker ps')) {
                    return 'mcp-filesystem\nmcp-git\n';
                }
                if (cmd.includes('docker inspect')) {
                    return '1.0.0\n';
                }
                return '';
            });
        });

        it('should check updates for all services', async () => {
            const updates = await serviceUpdater.checkServiceUpdates();

            expect(updates).toHaveLength(2);
            expect(updates[0].service).toBe('filesystem');
            expect(updates[0].availableVersion).toBe('1.1.0');
        });

        it('should check updates for specific services', async () => {
            const updates = await serviceUpdater.checkServiceUpdates(['filesystem']);

            expect(updates).toHaveLength(1);
            expect(updates[0].service).toBe('filesystem');
        });

        it('should detect compatible updates', async () => {
            const updates = await serviceUpdater.checkServiceUpdates();

            const filesystemUpdate = updates.find(u => u.service === 'filesystem');
            expect(filesystemUpdate.compatible).toBe(true);
        });

        it('should detect breaking changes', async () => {
            // Mock version history with breaking changes
            serviceUpdater.getServiceVersions = jest.fn().mockResolvedValue([
                { version: '1.0.0', changes: ['Initial'] },
                { version: '2.0.0', changes: ['Major rewrite'], breakingChanges: ['API changed'] }
            ]);

            const updates = await serviceUpdater.checkServiceUpdates(['git']);

            const gitUpdate = updates.find(u => u.service === 'git');
            expect(gitUpdate.breakingChanges).toContain('API changed');
            expect(gitUpdate.compatible).toBe(false);
        });

        it('should analyze dependencies', async () => {
            const updates = await serviceUpdater.checkServiceUpdates(['git']);

            const gitUpdate = updates.find(u => u.service === 'git');
            expect(gitUpdate.dependencies).toBeDefined();
            expect(Array.isArray(gitUpdate.dependencies)).toBe(true);
        });
    });

    describe('updateService', () => {
        beforeEach(() => {
            mockFs.readFile.mockResolvedValue(JSON.stringify({
                services: {
                    filesystem: {
                        version: '1.1.0',
                        image: 'mcp/filesystem:1.1.0'
                    }
                }
            }));

            execSync.mockImplementation((cmd) => {
                if (cmd.includes('docker ps')) {
                    return 'mcp-filesystem\n';
                }
                if (cmd.includes('docker inspect')) {
                    return '1.0.0\n';
                }
                return '';
            });
        });

        it('should update service successfully', async () => {
            const result = await serviceUpdater.updateService('filesystem', '1.1.0');

            expect(result).toBe(true);
            expect(execSync).toHaveBeenCalledWith(expect.stringContaining('docker stop mcp-filesystem'));
            expect(execSync).toHaveBeenCalledWith(expect.stringContaining('docker pull'));
            expect(execSync).toHaveBeenCalledWith(expect.stringContaining('docker start mcp-filesystem'));
        });

        it('should throw error if service not installed', async () => {
            execSync.mockImplementation((cmd) => {
                if (cmd.includes('docker ps')) {
                    return '';
                }
                return '';
            });

            await expect(
                serviceUpdater.updateService('nonexistent', '1.0.0')
            ).rejects.toThrow('Service nonexistent is not installed');
        });

        it('should throw error for incompatible update without force', async () => {
            serviceUpdater.analyzeServiceUpdate = jest.fn().mockResolvedValue({
                compatible: false,
                breakingChanges: ['API changed']
            });

            await expect(
                serviceUpdater.updateService('filesystem', '2.0.0')
            ).rejects.toThrow('not compatible due to breaking changes');
        });

        it('should allow incompatible update with force flag', async () => {
            serviceUpdater.analyzeServiceUpdate = jest.fn().mockResolvedValue({
                compatible: false,
                breakingChanges: ['API changed']
            });

            const result = await serviceUpdater.updateService('filesystem', '2.0.0', { force: true });

            expect(result).toBe(true);
        });

        it('should update dependencies first', async () => {
            serviceUpdater.resolveDependencies = jest.fn().mockResolvedValue([
                { service: 'dependency1', requiredVersion: '1.0.0' }
            ]);

            const updateServiceSpy = jest.spyOn(serviceUpdater, 'updateService');

            await serviceUpdater.updateService('filesystem', '1.1.0');

            expect(updateServiceSpy).toHaveBeenCalledWith('dependency1', '1.0.0', undefined);
        });

        it('should backup service before update', async () => {
            await serviceUpdater.updateService('filesystem', '1.1.0');

            expect(execSync).toHaveBeenCalledWith(
                expect.stringContaining('tar czf')
            );
        });

        it('should run migrations after update', async () => {
            mockFs.readdir.mockResolvedValue(['1.0.0-to-1.1.0.js']);
            
            const mockMigration = {
                up: jest.fn().mockResolvedValue()
            };
            jest.doMock(
                path.join(serviceUpdater.updateDir, 'migrations', 'filesystem', '1.0.0-to-1.1.0.js'),
                () => mockMigration,
                { virtual: true }
            );

            await serviceUpdater.updateService('filesystem', '1.1.0');

            expect(mockMigration.up).toHaveBeenCalled();
        });

        it('should rollback on failure', async () => {
            execSync.mockImplementation((cmd) => {
                if (cmd.includes('docker ps')) {
                    return 'mcp-filesystem\n';
                }
                if (cmd.includes('docker inspect')) {
                    return '1.0.0\n';
                }
                if (cmd.includes('docker start')) {
                    throw new Error('Start failed');
                }
                return '';
            });

            const rollbackSpy = jest.spyOn(serviceUpdater, 'rollbackService');

            await expect(
                serviceUpdater.updateService('filesystem', '1.1.0')
            ).rejects.toThrow('Start failed');

            expect(rollbackSpy).toHaveBeenCalledWith('filesystem', '1.0.0');
        });
    });

    describe('resolveDependencies', () => {
        beforeEach(() => {
            execSync.mockImplementation((cmd) => {
                if (cmd.includes('docker ps')) {
                    return 'mcp-filesystem\nmcp-git\n';
                }
                if (cmd.includes('docker inspect')) {
                    return '1.0.0\n';
                }
                return '';
            });
        });

        it('should identify missing dependencies', async () => {
            const dependencies = { database: '^2.0.0' };
            
            const required = await serviceUpdater.resolveDependencies('service', '1.0.0', dependencies);

            expect(required).toHaveLength(1);
            expect(required[0].service).toBe('database');
            expect(required[0].action).toBe('install');
        });

        it('should identify outdated dependencies', async () => {
            const dependencies = { filesystem: '^2.0.0' };
            
            const required = await serviceUpdater.resolveDependencies('service', '1.0.0', dependencies);

            expect(required).toHaveLength(1);
            expect(required[0].service).toBe('filesystem');
            expect(required[0].action).toBe('update');
        });

        it('should return empty array if all dependencies satisfied', async () => {
            const dependencies = { filesystem: '^1.0.0' };
            
            const required = await serviceUpdater.resolveDependencies('service', '1.0.0', dependencies);

            expect(required).toHaveLength(0);
        });
    });

    describe('getInstalledServices', () => {
        it('should get Docker services', async () => {
            execSync.mockImplementation((cmd) => {
                if (cmd.includes('docker ps')) {
                    return 'mcp-filesystem\nmcp-git\n';
                }
                if (cmd.includes('docker inspect')) {
                    return '1.2.3\n';
                }
                return '';
            });

            const installed = await serviceUpdater.getInstalledServices();

            expect(installed.filesystem).toBeDefined();
            expect(installed.filesystem.version).toBe('1.2.3');
            expect(installed.filesystem.type).toBe('docker');
        });

        it('should get local services from package.json', async () => {
            mockFs.readdir.mockResolvedValue(['filesystem-mcp', 'git-mcp']);
            mockFs.readFile.mockImplementation((path) => {
                if (path.includes('package.json')) {
                    return Promise.resolve(JSON.stringify({ version: '1.0.0' }));
                }
                return Promise.resolve('{}');
            });

            const installed = await serviceUpdater.getInstalledServices();

            expect(installed.filesystem).toBeDefined();
            expect(installed.filesystem.type).toBe('local');
        });

        it('should handle errors gracefully', async () => {
            execSync.mockImplementation(() => {
                throw new Error('Docker not available');
            });

            const installed = await serviceUpdater.getInstalledServices();

            expect(installed).toEqual({});
        });
    });

    describe('verifyService', () => {
        it('should verify Docker service is running', async () => {
            execSync.mockReturnValue('Up 5 seconds\n');

            await expect(
                serviceUpdater.verifyService('filesystem', '1.1.0')
            ).resolves.not.toThrow();
        });

        it('should throw if Docker service not running', async () => {
            execSync.mockReturnValue('');

            await expect(
                serviceUpdater.verifyService('filesystem', '1.1.0')
            ).rejects.toThrow('Service filesystem failed to start');
        });
    });

    describe('rollbackService', () => {
        beforeEach(() => {
            mockFs.readdir.mockResolvedValue(['1.0.0-2024-01-15.tar.gz', '1.0.0-2024-01-10.tar.gz']);
        });

        it('should rollback to previous version', async () => {
            await serviceUpdater.rollbackService('filesystem', '1.0.0');

            expect(execSync).toHaveBeenCalledWith(expect.stringContaining('docker stop'));
            expect(execSync).toHaveBeenCalledWith(expect.stringContaining('tar xzf'));
            expect(execSync).toHaveBeenCalledWith(expect.stringContaining('docker start'));
        });

        it('should use most recent backup', async () => {
            await serviceUpdater.rollbackService('filesystem', '1.0.0');

            expect(execSync).toHaveBeenCalledWith(
                expect.stringContaining('1.0.0-2024-01-15.tar.gz')
            );
        });

        it('should throw if no backup found', async () => {
            mockFs.readdir.mockResolvedValue([]);

            await expect(
                serviceUpdater.rollbackService('filesystem', '1.0.0')
            ).rejects.toThrow('No backup found');
        });
    });

    describe('buildDockerRunCommand', () => {
        it('should build Docker run command with all options', () => {
            const registryEntry = {
                version: '1.1.0',
                volumes: ['mcp-filesystem-data:/data'],
                environment: {
                    NODE_ENV: 'production',
                    PORT: '3000'
                }
            };

            const command = serviceUpdater.buildDockerRunCommand('filesystem', 'mcp/filesystem:1.1.0', registryEntry);

            expect(command).toContain('docker run -d --name mcp-filesystem');
            expect(command).toContain('--network mcp-network');
            expect(command).toContain('-v mcp-filesystem-data:/data');
            expect(command).toContain('-e NODE_ENV=production');
            expect(command).toContain('-e PORT=3000');
            expect(command).toContain('--label version=1.1.0');
            expect(command).toContain('mcp/filesystem:1.1.0');
        });
    });

    describe('runMigrations', () => {
        it('should run applicable migrations in order', async () => {
            mockFs.readdir.mockResolvedValue([
                '1.0.0-to-1.1.0.js',
                '1.1.0-to-1.2.0.js',
                '0.9.0-to-1.0.0.js'
            ]);

            const migration1 = { up: jest.fn() };
            const migration2 = { up: jest.fn() };
            
            jest.doMock(
                path.join(serviceUpdater.updateDir, 'migrations', 'filesystem', '1.0.0-to-1.1.0.js'),
                () => migration1,
                { virtual: true }
            );
            jest.doMock(
                path.join(serviceUpdater.updateDir, 'migrations', 'filesystem', '1.1.0-to-1.2.0.js'),
                () => migration2,
                { virtual: true }
            );

            await serviceUpdater.runMigrations('filesystem', '1.0.0', '1.2.0');

            expect(migration1.up).toHaveBeenCalled();
            expect(migration2.up).toHaveBeenCalled();
        });

        it('should handle missing migrations directory', async () => {
            mockFs.readdir.mockRejectedValue({ code: 'ENOENT' });

            await expect(
                serviceUpdater.runMigrations('filesystem', '1.0.0', '1.1.0')
            ).resolves.not.toThrow();
        });
    });
});