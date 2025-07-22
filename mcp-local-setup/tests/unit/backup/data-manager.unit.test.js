/**
 * Unit tests for DataManager
 */

const DataManager = require('../../../scripts/data-manager');
const fs = require('fs').promises;
const { exec } = require('child_process');
const { promisify } = require('util');

// Mock dependencies
jest.mock('fs', () => ({
    promises: {
        mkdir: jest.fn(),
        readFile: jest.fn(),
        writeFile: jest.fn(),
        access: jest.fn(),
        stat: jest.fn(),
        copyFile: jest.fn(),
        unlink: jest.fn(),
        rm: jest.fn(),
        readdir: jest.fn(),
        rename: jest.fn()
    }
}));

jest.mock('child_process', () => ({
    exec: jest.fn((cmd, callback) => callback(null, { stdout: '', stderr: '' }))
}));

jest.mock('tar', () => ({
    create: jest.fn(),
    extract: jest.fn()
}));

jest.mock('stream/promises', () => ({
    pipeline: jest.fn()
}));

describe('DataManager Unit Tests', () => {
    let dataManager;
    let mockFs;
    let mockExec;
    let execAsync;

    beforeEach(() => {
        jest.clearAllMocks();
        dataManager = new DataManager();
        mockFs = require('fs').promises;
        mockExec = require('child_process').exec;
        execAsync = promisify(mockExec);
    });

    describe('initialize', () => {
        it('should create temp directory', async () => {
            await dataManager.initialize();

            expect(mockFs.mkdir).toHaveBeenCalledWith(
                expect.stringContaining('temp'),
                { recursive: true }
            );
        });
    });

    describe('getServiceVolumes', () => {
        it('should get volumes for a service', async () => {
            const mockMounts = [
                {
                    Type: 'volume',
                    Name: 'test-volume',
                    Source: '/var/lib/docker/volumes/test-volume/_data',
                    Destination: '/data',
                    Driver: 'local'
                },
                {
                    Type: 'bind',
                    Source: '/home/user/data',
                    Destination: '/app/data'
                }
            ];

            mockExec.mockImplementation((cmd, callback) => {
                callback(null, { stdout: JSON.stringify(mockMounts) });
            });

            const volumes = await dataManager.getServiceVolumes('test-service');

            expect(volumes).toHaveLength(2);
            expect(volumes[0].type).toBe('volume');
            expect(volumes[0].name).toBe('test-volume');
            expect(volumes[1].type).toBe('bind');
        });

        it('should handle service without container', async () => {
            mockExec.mockImplementation((cmd, callback) => {
                callback(new Error('No such container'));
            });

            const volumes = await dataManager.getServiceVolumes('non-existent');

            expect(volumes).toEqual([]);
        });
    });

    describe('exportServiceData', () => {
        it('should export service data volumes', async () => {
            const services = ['test-service'];
            const exportPath = '/tmp/export';

            mockExec.mockImplementation((cmd, callback) => {
                if (cmd.includes('docker inspect')) {
                    callback(null, {
                        stdout: JSON.stringify([{
                            Type: 'volume',
                            Name: 'test-volume',
                            Source: '/var/lib/docker/volumes/test-volume/_data',
                            Destination: '/data'
                        }])
                    });
                } else {
                    callback(null, { stdout: '' });
                }
            });

            mockFs.mkdir.mockResolvedValue();
            mockFs.writeFile.mockResolvedValue();
            mockExec.mockImplementation((cmd, callback) => callback(null, { stdout: '' }));

            const result = await dataManager.exportServiceData(services, exportPath);

            expect(result.success).toBe(true);
            expect(result.volumes['test-service']).toBeDefined();
            expect(mockFs.mkdir).toHaveBeenCalled();
        });

        it('should handle export failures', async () => {
            const services = ['failing-service'];
            const exportPath = '/tmp/export';

            mockExec.mockImplementation((cmd, callback) => {
                callback(new Error('Export failed'));
            });

            const result = await dataManager.exportServiceData(services, exportPath);

            expect(result.success).toBe(false);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].service).toBe('failing-service');
        });
    });

    describe('importServiceData', () => {
        it('should import service data volumes', async () => {
            const services = ['test-service'];
            const importPath = '/tmp/import';

            mockFs.readdir.mockResolvedValue(['test-volume']);
            mockFs.access.mockResolvedValue();
            mockFs.readFile.mockResolvedValue(JSON.stringify({
                volumeName: 'test-volume',
                type: 'docker-volume'
            }));
            mockExec.mockImplementation((cmd, callback) => callback(null, { stdout: '' }));

            const result = await dataManager.importServiceData(services, importPath);

            expect(result.success).toBe(true);
            expect(result.volumes['test-service']).toBeDefined();
        });

        it('should handle overwrite option', async () => {
            const services = ['test-service'];
            const importPath = '/tmp/import';
            const options = { overwrite: true };

            mockFs.readdir.mockResolvedValue(['test-volume']);
            mockFs.access.mockResolvedValue();
            mockFs.readFile.mockResolvedValue(JSON.stringify({
                volumeName: 'test-volume',
                type: 'docker-volume'
            }));

            let clearDataCalled = false;
            mockExec.mockImplementation((cmd, callback) => {
                if (cmd.includes('rm -rf /volume/*')) {
                    clearDataCalled = true;
                }
                callback(null, { stdout: '' });
            });

            await dataManager.importServiceData(services, importPath, options);

            expect(clearDataCalled).toBe(true);
        });
    });

    describe('exportDockerVolume', () => {
        it('should export docker volume', async () => {
            const volumeName = 'test-volume';
            const exportPath = '/tmp/export/test-volume';

            mockFs.mkdir.mockResolvedValue();
            mockFs.writeFile.mockResolvedValue();
            mockExec.mockImplementation((cmd, callback) => callback(null, { stdout: '' }));

            await dataManager.exportDockerVolume(volumeName, exportPath);

            expect(mockExec).toHaveBeenCalledWith(
                expect.stringContaining('docker run'),
                expect.any(Function)
            );
            expect(mockExec).toHaveBeenCalledWith(
                expect.stringContaining('docker cp'),
                expect.any(Function)
            );
            expect(mockFs.writeFile).toHaveBeenCalledWith(
                expect.stringContaining('.volume-metadata.json'),
                expect.any(String)
            );
        });

        it('should clean up container on failure', async () => {
            const volumeName = 'test-volume';
            const exportPath = '/tmp/export/test-volume';

            mockFs.mkdir.mockResolvedValue();
            
            let containerCreated = false;
            let containerRemoved = false;
            
            mockExec.mockImplementation((cmd, callback) => {
                if (cmd.includes('docker run')) {
                    containerCreated = true;
                    callback(null, { stdout: '' });
                } else if (cmd.includes('docker cp')) {
                    callback(new Error('Copy failed'));
                } else if (cmd.includes('docker rm -f')) {
                    containerRemoved = true;
                    callback(null, { stdout: '' });
                }
            });

            await expect(dataManager.exportDockerVolume(volumeName, exportPath))
                .rejects.toThrow();

            expect(containerCreated).toBe(true);
            expect(containerRemoved).toBe(true);
        });
    });

    describe('createIncrementalBackup', () => {
        it('should create incremental backup', async () => {
            const volumes = ['test-volume'];
            const baseBackupPath = '/tmp/base-backup';
            const exportPath = '/tmp/incremental';

            // Mock snapshot data
            const baseSnapshot = {
                'file1.txt': { size: 100, mtime: '2024-01-01T00:00:00Z' },
                'file2.txt': { size: 200, mtime: '2024-01-01T00:00:00Z' }
            };
            
            const currentSnapshot = {
                'file1.txt': { size: 150, mtime: '2024-01-02T00:00:00Z' }, // Changed
                'file2.txt': { size: 200, mtime: '2024-01-01T00:00:00Z' }, // Unchanged
                'file3.txt': { size: 300, mtime: '2024-01-02T00:00:00Z' }  // New
            };

            dataManager.getVolumeSnapshot = jest.fn().mockResolvedValue(currentSnapshot);
            dataManager.readVolumeSnapshot = jest.fn().mockResolvedValue(baseSnapshot);
            dataManager.exportVolumeChanges = jest.fn().mockResolvedValue();
            dataManager.getDirectorySize = jest.fn().mockResolvedValue(1024);

            mockFs.mkdir.mockResolvedValue();

            const result = await dataManager.createIncrementalBackup(
                volumes,
                baseBackupPath,
                exportPath
            );

            expect(result.success).toBe(true);
            expect(result.volumes['test-volume'].changedFiles).toBe(1);
            expect(result.volumes['test-volume'].newFiles).toBe(1);
            expect(result.volumes['test-volume'].deletedFiles).toBe(0);
        });
    });

    describe('migrateServiceData', () => {
        it('should handle generic migration for unknown services', async () => {
            const result = await dataManager.migrateServiceData(
                'unknown-service',
                '1.0',
                '2.0',
                '/data'
            );

            expect(result.success).toBe(true);
            expect(result.message).toContain('No specific migration needed');
        });

        it('should migrate PostgreSQL data between major versions', async () => {
            mockExec.mockImplementation((cmd, callback) => callback(null, { stdout: '' }));

            const result = await dataManager.migrateServiceData(
                'postgres',
                '13.0',
                '14.0',
                '/data/postgres'
            );

            expect(result.success).toBe(true);
            expect(result.message).toContain('Migrated PostgreSQL');
        });

        it('should skip PostgreSQL migration for same major version', async () => {
            const result = await dataManager.migrateServiceData(
                'postgres',
                '14.1',
                '14.5',
                '/data/postgres'
            );

            expect(result.success).toBe(true);
            expect(result.message).toContain('Same major version');
        });

        it('should handle Redis migration', async () => {
            const result = await dataManager.migrateServiceData(
                'redis',
                '6.0',
                '7.0',
                '/data/redis'
            );

            expect(result.success).toBe(true);
            expect(result.message).toContain('compatible across versions');
        });

        it('should prevent Elasticsearch major version skipping', async () => {
            const result = await dataManager.migrateServiceData(
                'elasticsearch',
                '6.0',
                '8.0',
                '/data/elasticsearch'
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain('Cannot skip major versions');
        });
    });

    describe('validateVolumeData', () => {
        it('should validate volume data integrity', async () => {
            const volumePath = '/tmp/volume';

            mockFs.access.mockResolvedValue();
            mockFs.readFile.mockResolvedValue(JSON.stringify({
                volumeName: 'test-volume',
                type: 'docker-volume'
            }));
            mockFs.stat.mockResolvedValue({
                isFile: () => true,
                isDirectory: () => false
            });

            dataManager.walkDirectory = jest.fn().mockResolvedValue([
                '/tmp/volume/file1.txt',
                '/tmp/volume/file2.txt'
            ]);

            const result = await dataManager.validateVolumeData(volumePath);

            expect(result.valid).toBe(true);
            expect(result.metadata).toBeDefined();
            expect(result.checks.filesExist).toBe(true);
        });

        it('should detect invalid files', async () => {
            const volumePath = '/tmp/volume';

            mockFs.access.mockResolvedValue();
            mockFs.stat.mockResolvedValue({
                isFile: () => false,
                isDirectory: () => false
            });

            dataManager.walkDirectory = jest.fn().mockResolvedValue([
                '/tmp/volume/invalid'
            ]);

            const result = await dataManager.validateVolumeData(volumePath);

            expect(result.valid).toBe(true);
            expect(result.checks.filesExist).toBe(false);
            expect(result.errors).toContain('Invalid file type: /tmp/volume/invalid');
        });
    });

    describe('optimizeVolumeStorage', () => {
        it('should optimize volume storage', async () => {
            const volumePath = '/tmp/volume';

            dataManager.getDirectorySize = jest.fn()
                .mockResolvedValueOnce(10 * 1024 * 1024) // Original size
                .mockResolvedValueOnce(8 * 1024 * 1024); // After optimization

            dataManager.findFiles = jest.fn()
                .mockResolvedValueOnce([  // Temp files
                    '/tmp/volume/temp.tmp',
                    '/tmp/volume/.DS_Store'
                ])
                .mockResolvedValueOnce([  // Large text files
                    '/tmp/volume/large.log'
                ]);

            mockFs.unlink.mockResolvedValue();
            mockFs.stat.mockResolvedValue({ size: 2 * 1024 * 1024 }); // 2MB file
            dataManager.compressFile = jest.fn().mockResolvedValue();

            const result = await dataManager.optimizeVolumeStorage(volumePath);

            expect(result.spaceSaved).toBe(2 * 1024 * 1024);
            expect(result.actions).toContain('Removed temporary file: /tmp/volume/temp.tmp');
            expect(result.actions).toContain('Compressed large file: /tmp/volume/large.log');
        });
    });

    describe('helper methods', () => {
        it('should walk directory recursively', async () => {
            const testDir = '/test/dir';
            
            mockFs.readdir.mockImplementation(async (dir) => {
                if (dir === testDir) {
                    return ['file1.txt', 'subdir'];
                } else if (dir === '/test/dir/subdir') {
                    return ['file2.txt'];
                }
                return [];
            });

            mockFs.stat.mockImplementation(async (path) => ({
                isDirectory: () => path.includes('subdir'),
                isFile: () => !path.includes('subdir')
            }));

            const files = await dataManager.walkDirectory(testDir);

            expect(files).toContain('/test/dir/file1.txt');
            expect(files).toContain('/test/dir/subdir/file2.txt');
        });

        it('should match file patterns', () => {
            expect(dataManager.matchPattern('test.txt', '*.txt')).toBe(true);
            expect(dataManager.matchPattern('test.log', '*.txt')).toBe(false);
            expect(dataManager.matchPattern('test.tmp', 'test.*')).toBe(true);
            expect(dataManager.matchPattern('file.txt', '?ile.txt')).toBe(true);
        });

        it('should calculate volume changes correctly', async () => {
            const baseSnapshot = {
                'file1.txt': { size: 100, mtime: '2024-01-01T00:00:00Z' },
                'file2.txt': { size: 200, mtime: '2024-01-01T00:00:00Z' },
                'file3.txt': { size: 300, mtime: '2024-01-01T00:00:00Z' }
            };

            const currentSnapshot = {
                'file1.txt': { size: 150, mtime: '2024-01-02T00:00:00Z' }, // Changed
                'file2.txt': { size: 200, mtime: '2024-01-01T00:00:00Z' }, // Unchanged
                'file4.txt': { size: 400, mtime: '2024-01-02T00:00:00Z' }  // New
            };

            const changes = await dataManager.calculateVolumeChanges(
                baseSnapshot,
                currentSnapshot
            );

            expect(changes.new).toEqual(['file4.txt']);
            expect(changes.changed).toEqual(['file1.txt']);
            expect(changes.deleted).toEqual(['file3.txt']);
        });
    });
});