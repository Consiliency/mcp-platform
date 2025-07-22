/**
 * Unit tests for UpdateManager
 */

const UpdateManager = require('../../../scripts/update-manager');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

// Mock dependencies
jest.mock('fs', () => ({
    promises: {
        mkdir: jest.fn(),
        readFile: jest.fn(),
        writeFile: jest.fn(),
        access: jest.fn(),
        unlink: jest.fn(),
        readdir: jest.fn(),
        stat: jest.fn(),
        rm: jest.fn()
    }
}));

jest.mock('https');
jest.mock('tar');
jest.mock('node-cron');
jest.mock('child_process');

const mockFs = require('fs').promises;
const mockHttps = require('https');
const mockTar = require('tar');
const mockCron = require('node-cron');

describe('UpdateManager', () => {
    let updateManager;

    beforeEach(() => {
        jest.clearAllMocks();
        updateManager = new UpdateManager();
        
        // Setup default mock responses
        mockFs.access.mockRejectedValue(new Error('File not found'));
        mockFs.mkdir.mockResolvedValue();
        mockFs.writeFile.mockResolvedValue();
        mockFs.readFile.mockResolvedValue('{}');
    });

    describe('initialization', () => {
        it('should create update directory structure', async () => {
            await updateManager.initialize();

            expect(mockFs.mkdir).toHaveBeenCalledWith(
                expect.stringContaining('updates'),
                { recursive: true }
            );
        });

        it('should initialize metadata file if not exists', async () => {
            await updateManager.initialize();

            expect(mockFs.writeFile).toHaveBeenCalledWith(
                expect.stringContaining('metadata.json'),
                expect.stringContaining('"currentVersion"')
            );
        });

        it('should initialize history file if not exists', async () => {
            await updateManager.initialize();

            expect(mockFs.writeFile).toHaveBeenCalledWith(
                expect.stringContaining('history.json'),
                '[]'
            );
        });

        it('should initialize config file if not exists', async () => {
            await updateManager.initialize();

            expect(mockFs.writeFile).toHaveBeenCalledWith(
                expect.stringContaining('config.json'),
                expect.stringContaining('"enabled"')
            );
        });

        it('should schedule auto-update if enabled', async () => {
            mockFs.access.mockImplementation((path) => {
                if (path.includes('config.json')) {
                    return Promise.resolve();
                }
                return Promise.reject(new Error('File not found'));
            });

            mockFs.readFile.mockImplementation((path) => {
                if (path.includes('config.json')) {
                    return Promise.resolve(JSON.stringify({
                        enabled: true,
                        channel: 'stable',
                        schedule: '0 3 * * 0'
                    }));
                }
                return Promise.resolve('{}');
            });

            mockCron.schedule.mockReturnValue({ stop: jest.fn() });

            await updateManager.initialize();

            expect(mockCron.schedule).toHaveBeenCalledWith(
                '0 3 * * 0',
                expect.any(Function)
            );
        });
    });

    describe('checkForUpdates', () => {
        beforeEach(() => {
            mockFs.readFile.mockResolvedValue(JSON.stringify({
                currentVersion: '1.0.0',
                lastCheck: null,
                availableUpdates: []
            }));
        });

        it('should fetch and filter available updates', async () => {
            const updates = await updateManager.checkForUpdates();

            expect(Array.isArray(updates)).toBe(true);
            expect(mockFs.writeFile).toHaveBeenCalledWith(
                expect.stringContaining('metadata.json'),
                expect.stringContaining('"lastCheck"')
            );
        });

        it('should filter updates by channel', async () => {
            const updates = await updateManager.checkForUpdates({ channel: 'beta' });

            expect(Array.isArray(updates)).toBe(true);
        });

        it('should include beta updates when requested', async () => {
            const updates = await updateManager.checkForUpdates({ 
                channel: 'stable',
                includeBeta: true 
            });

            expect(Array.isArray(updates)).toBe(true);
        });

        it('should filter updates based on current version', async () => {
            // Mock higher current version
            mockFs.readFile.mockResolvedValue(JSON.stringify({
                currentVersion: '2.0.0',
                lastCheck: null,
                availableUpdates: []
            }));

            const updates = await updateManager.checkForUpdates();

            // Should filter out updates <= 2.0.0
            expect(updates.every(u => u.version > '2.0.0')).toBe(true);
        });
    });

    describe('downloadUpdate', () => {
        const mockUpdate = {
            version: '1.1.0',
            downloadUrl: 'https://example.com/update.tar.gz',
            size: 1024,
            checksum: 'abc123'
        };

        beforeEach(() => {
            mockFs.readFile.mockResolvedValue(JSON.stringify({
                currentVersion: '1.0.0',
                availableUpdates: [mockUpdate]
            }));

            // Mock https.get
            const mockResponse = {
                headers: { 'content-length': '1024' },
                on: jest.fn(),
                pipe: jest.fn()
            };
            
            mockHttps.get.mockImplementation((url, callback) => {
                callback(mockResponse);
                return { on: jest.fn() };
            });
        });

        it('should download update file', async () => {
            const createWriteStream = jest.fn().mockReturnValue({
                on: jest.fn((event, callback) => {
                    if (event === 'finish') {
                        callback();
                    }
                }),
                close: jest.fn()
            });

            require('fs').createWriteStream = createWriteStream;

            const downloadPath = await updateManager.downloadUpdate('1.1.0');

            expect(downloadPath).toContain('mcp-update-1.1.0.tar.gz');
            expect(mockHttps.get).toHaveBeenCalledWith(
                mockUpdate.downloadUrl,
                expect.any(Function)
            );
        });

        it('should track download progress', async () => {
            const onProgress = jest.fn();
            const createWriteStream = jest.fn().mockReturnValue({
                on: jest.fn((event, callback) => {
                    if (event === 'finish') {
                        callback();
                    }
                }),
                close: jest.fn()
            });

            require('fs').createWriteStream = createWriteStream;

            await updateManager.downloadUpdate('1.1.0', { onProgress });

            expect(updateManager.currentUpdateStatus).toBeDefined();
            expect(updateManager.currentUpdateStatus.status).toBe('ready');
        });

        it('should verify checksum if requested', async () => {
            const createWriteStream = jest.fn().mockReturnValue({
                on: jest.fn((event, callback) => {
                    if (event === 'finish') {
                        callback();
                    }
                }),
                close: jest.fn()
            });

            require('fs').createWriteStream = createWriteStream;
            require('fs').createReadStream = jest.fn().mockReturnValue({
                on: jest.fn(),
                pipe: jest.fn()
            });

            // Mock crypto hash
            const mockHash = {
                update: jest.fn(),
                digest: jest.fn().mockReturnValue('invalid')
            };
            crypto.createHash = jest.fn().mockReturnValue(mockHash);

            await expect(
                updateManager.downloadUpdate('1.1.0', { verify: true })
            ).rejects.toThrow('checksum mismatch');
        });

        it('should throw error if version not found', async () => {
            await expect(
                updateManager.downloadUpdate('9.9.9')
            ).rejects.toThrow('Update version 9.9.9 not found');
        });
    });

    describe('applyUpdate', () => {
        beforeEach(() => {
            mockFs.readFile.mockResolvedValue(JSON.stringify({
                currentVersion: '1.0.0',
                availableUpdates: [{
                    version: '1.1.0',
                    requirements: { minVersion: '1.0.0' }
                }]
            }));

            mockFs.access.mockImplementation((path) => {
                if (path.includes('mcp-update-1.1.0.tar.gz')) {
                    return Promise.resolve();
                }
                return Promise.reject(new Error('File not found'));
            });
        });

        it('should apply update successfully', async () => {
            mockTar.create.mockResolvedValue();
            mockTar.extract.mockResolvedValue();

            const result = await updateManager.applyUpdate('1.1.0');

            expect(result).toBe(true);
            expect(mockFs.writeFile).toHaveBeenCalledWith(
                expect.stringContaining('metadata.json'),
                expect.stringContaining('"currentVersion":"1.1.0"')
            );
        });

        it('should create backup if requested', async () => {
            mockTar.create.mockResolvedValue();
            mockTar.extract.mockResolvedValue();

            await updateManager.applyUpdate('1.1.0', { backup: true });

            expect(mockTar.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    gzip: true,
                    file: expect.stringContaining('backup-1.0.0.tar.gz')
                }),
                expect.any(Array)
            );
        });

        it('should simulate update in dry run mode', async () => {
            const result = await updateManager.applyUpdate('1.1.0', { dryRun: true });

            expect(result).toBe(true);
            expect(mockTar.extract).not.toHaveBeenCalled();
            expect(updateManager.currentUpdateStatus.status).toBe('complete');
        });

        it('should prevent downgrade without force flag', async () => {
            mockFs.readFile.mockResolvedValue(JSON.stringify({
                currentVersion: '2.0.0',
                availableUpdates: []
            }));

            await expect(
                updateManager.applyUpdate('1.0.0', { force: false })
            ).rejects.toThrow('Downgrade not allowed');
        });

        it('should allow downgrade with force flag', async () => {
            mockFs.readFile.mockResolvedValue(JSON.stringify({
                currentVersion: '2.0.0',
                availableUpdates: []
            }));

            mockFs.access.mockResolvedValue(); // File exists
            mockTar.create.mockResolvedValue();
            mockTar.extract.mockResolvedValue();

            const result = await updateManager.applyUpdate('1.0.0', { force: true });

            expect(result).toBe(true);
        });

        it('should add to history on success', async () => {
            mockTar.create.mockResolvedValue();
            mockTar.extract.mockResolvedValue();

            await updateManager.applyUpdate('1.1.0');

            expect(mockFs.writeFile).toHaveBeenCalledWith(
                expect.stringContaining('history.json'),
                expect.stringContaining('"version":"1.1.0"')
            );
        });

        it('should add to history on failure', async () => {
            mockTar.extract.mockRejectedValue(new Error('Extract failed'));

            await expect(
                updateManager.applyUpdate('1.1.0')
            ).rejects.toThrow('Extract failed');

            expect(mockFs.writeFile).toHaveBeenCalledWith(
                expect.stringContaining('history.json'),
                expect.stringContaining('"success":false')
            );
        });
    });

    describe('rollback', () => {
        beforeEach(() => {
            mockFs.readFile.mockResolvedValue(JSON.stringify({
                currentVersion: '1.1.0'
            }));

            mockFs.access.mockImplementation((path) => {
                if (path.includes('backup-1.0.0.tar.gz')) {
                    return Promise.resolve();
                }
                return Promise.reject(new Error('File not found'));
            });
        });

        it('should rollback to previous version', async () => {
            mockTar.extract.mockResolvedValue();

            const result = await updateManager.rollback('1.0.0');

            expect(result).toBe(true);
            expect(mockTar.extract).toHaveBeenCalledWith(
                expect.objectContaining({
                    file: expect.stringContaining('backup-1.0.0.tar.gz')
                })
            );
        });

        it('should throw error if no backup found', async () => {
            mockFs.access.mockRejectedValue(new Error('File not found'));

            await expect(
                updateManager.rollback('1.0.0')
            ).rejects.toThrow('No backup found for version 1.0.0');
        });

        it('should check compatibility unless forced', async () => {
            await expect(
                updateManager.rollback('0.1.0', { force: false })
            ).rejects.toThrow('Incompatible version');
        });

        it('should backup user data if requested', async () => {
            mockTar.extract.mockResolvedValue();
            
            await updateManager.rollback('1.0.0', { keepData: true });

            expect(mockFs.mkdir).toHaveBeenCalledWith(
                expect.stringContaining('userdata-backup'),
                { recursive: true }
            );
        });
    });

    describe('getUpdateHistory', () => {
        const mockHistory = [
            {
                version: '1.1.0',
                installedAt: '2024-01-15T10:00:00Z',
                success: true
            },
            {
                version: '1.0.0',
                installedAt: '2024-01-10T10:00:00Z',
                success: true
            }
        ];

        beforeEach(() => {
            mockFs.readFile.mockResolvedValue(JSON.stringify(mockHistory));
        });

        it('should return update history', async () => {
            const history = await updateManager.getUpdateHistory();

            expect(history).toHaveLength(2);
            expect(history[0].installedAt).toBeInstanceOf(Date);
        });

        it('should filter by date range', async () => {
            const history = await updateManager.getUpdateHistory({
                startDate: new Date('2024-01-12'),
                endDate: new Date('2024-01-16')
            });

            expect(history).toHaveLength(1);
            expect(history[0].version).toBe('1.1.0');
        });

        it('should limit results', async () => {
            const history = await updateManager.getUpdateHistory({ limit: 1 });

            expect(history).toHaveLength(1);
            expect(history[0].version).toBe('1.1.0');
        });
    });

    describe('verifyUpdate', () => {
        it('should verify update checksum', async () => {
            const mockHash = {
                update: jest.fn(),
                digest: jest.fn().mockReturnValue('abc123')
            };
            
            crypto.createHash = jest.fn().mockReturnValue(mockHash);
            
            require('fs').createReadStream = jest.fn().mockReturnValue({
                on: jest.fn(),
                pipe: jest.fn((destination) => {
                    destination.update('data');
                    return Promise.resolve();
                })
            });

            const result = await updateManager.verifyUpdate('/path/to/update', 'abc123');

            expect(result).toBe(true);
        });

        it('should return false for invalid checksum', async () => {
            const mockHash = {
                update: jest.fn(),
                digest: jest.fn().mockReturnValue('invalid')
            };
            
            crypto.createHash = jest.fn().mockReturnValue(mockHash);

            const result = await updateManager.verifyUpdate('/path/to/update', 'abc123');

            expect(result).toBe(false);
        });
    });

    describe('cleanupUpdates', () => {
        beforeEach(() => {
            mockFs.readdir.mockResolvedValue([
                'mcp-update-1.0.0.tar.gz',
                'mcp-update-1.1.0.tar.gz',
                'mcp-update-1.2.0.tar.gz',
                'mcp-update-1.3.0.tar.gz'
            ]);

            mockFs.stat.mockResolvedValue({ size: 1024 });
            mockFs.unlink.mockResolvedValue();
            mockFs.rm.mockResolvedValue();
        });

        it('should keep recent versions and delete old ones', async () => {
            const stats = await updateManager.cleanupUpdates({ keepVersions: 2 });

            expect(stats.deletedFiles).toBe(2);
            expect(stats.freedSpace).toBe(2048);
            expect(stats.keptVersions).toHaveLength(2);
        });

        it('should clean temporary files if requested', async () => {
            mockFs.access.mockResolvedValue(); // temp dir exists

            const stats = await updateManager.cleanupUpdates({ cleanTemp: true });

            expect(mockFs.rm).toHaveBeenCalledWith(
                expect.stringContaining('temp'),
                { recursive: true, force: true }
            );
        });
    });

    describe('configureAutoUpdate', () => {
        it('should save auto-update configuration', async () => {
            const config = {
                enabled: true,
                channel: 'stable',
                schedule: '0 3 * * 0',
                downloadOnly: true
            };

            await updateManager.configureAutoUpdate(config);

            expect(mockFs.writeFile).toHaveBeenCalledWith(
                expect.stringContaining('config.json'),
                JSON.stringify(config, null, 2)
            );
        });

        it('should schedule cron job if enabled', async () => {
            mockCron.schedule.mockReturnValue({ stop: jest.fn() });

            await updateManager.configureAutoUpdate({ enabled: true });

            expect(mockCron.schedule).toHaveBeenCalled();
        });

        it('should cancel existing cron job when disabled', async () => {
            const mockTask = { stop: jest.fn() };
            updateManager.autoUpdateTask = mockTask;

            await updateManager.configureAutoUpdate({ enabled: false });

            expect(mockTask.stop).toHaveBeenCalled();
            expect(updateManager.autoUpdateTask).toBeNull();
        });
    });

    describe('getChannels', () => {
        it('should return available update channels', async () => {
            const channels = await updateManager.getChannels();

            expect(channels).toEqual(['stable', 'beta', 'nightly']);
        });
    });
});