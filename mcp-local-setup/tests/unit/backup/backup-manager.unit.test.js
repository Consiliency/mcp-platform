/**
 * Unit tests for BackupManager
 */

const BackupManager = require('../../../scripts/backup-manager');
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
        stat: jest.fn(),
        copyFile: jest.fn(),
        unlink: jest.fn(),
        rm: jest.fn(),
        readdir: jest.fn()
    }
}));

jest.mock('child_process', () => ({
    exec: jest.fn((cmd, callback) => callback(null, { stdout: '', stderr: '' }))
}));

jest.mock('tar', () => ({
    create: jest.fn(),
    extract: jest.fn(),
    list: jest.fn()
}));

jest.mock('node-cron', () => ({
    schedule: jest.fn(() => ({ stop: jest.fn() })),
    parseExpression: jest.fn(() => ({
        next: () => ({ toDate: () => new Date() })
    }))
}));

describe('BackupManager Unit Tests', () => {
    let backupManager;
    let mockFs;
    let mockTar;
    let mockCron;

    beforeEach(() => {
        jest.clearAllMocks();
        backupManager = new BackupManager();
        mockFs = require('fs').promises;
        mockTar = require('tar');
        mockCron = require('node-cron');
    });

    describe('initialize', () => {
        it('should create backup directories', async () => {
            mockFs.readFile.mockRejectedValue({ code: 'ENOENT' });
            
            await backupManager.initialize();

            expect(mockFs.mkdir).toHaveBeenCalledWith(
                expect.stringContaining('backup'),
                { recursive: true }
            );
            expect(mockFs.mkdir).toHaveBeenCalledWith(
                expect.stringContaining('archives'),
                { recursive: true }
            );
            expect(mockFs.mkdir).toHaveBeenCalledWith(
                expect.stringContaining('temp'),
                { recursive: true }
            );
        });

        it('should load existing metadata', async () => {
            const mockMetadata = {
                'backup-123': {
                    id: 'backup-123',
                    createdAt: new Date().toISOString()
                }
            };
            
            mockFs.readFile.mockResolvedValueOnce(JSON.stringify(mockMetadata));
            mockFs.readFile.mockRejectedValueOnce({ code: 'ENOENT' }); // schedules

            await backupManager.initialize();

            expect(backupManager.metadata.size).toBe(1);
            expect(backupManager.metadata.has('backup-123')).toBe(true);
        });
    });

    describe('createBackup', () => {
        beforeEach(async () => {
            mockFs.readFile.mockRejectedValue({ code: 'ENOENT' });
            await backupManager.initialize();
        });

        it('should create a full backup', async () => {
            const options = {
                type: 'full',
                includeData: true,
                includeConfig: true,
                includeLogs: false,
                description: 'Test backup'
            };

            mockFs.stat.mockResolvedValue({ size: 1024 * 1024 });
            mockTar.create.mockResolvedValue();

            const backupId = await backupManager.createBackup(options);

            expect(backupId).toMatch(/^backup-\d{4}-\d{2}-\d{2}/);
            expect(mockFs.mkdir).toHaveBeenCalled();
            expect(mockTar.create).toHaveBeenCalled();
            expect(backupManager.metadata.has(backupId)).toBe(true);
        });

        it('should handle backup creation failure', async () => {
            const options = { type: 'full' };
            
            mockTar.create.mockRejectedValue(new Error('Archive creation failed'));

            await expect(backupManager.createBackup(options))
                .rejects.toThrow('Backup creation failed');
        });

        it('should create incremental backup', async () => {
            const options = {
                type: 'incremental',
                services: ['filesystem', 'git']
            };

            mockFs.stat.mockResolvedValue({ size: 512 * 1024 });
            mockTar.create.mockResolvedValue();

            const backupId = await backupManager.createBackup(options);
            const metadata = backupManager.metadata.get(backupId);

            expect(metadata.type).toBe('incremental');
            expect(metadata.services).toEqual(['filesystem', 'git']);
        });
    });

    describe('listBackups', () => {
        beforeEach(async () => {
            mockFs.readFile.mockRejectedValue({ code: 'ENOENT' });
            await backupManager.initialize();
            
            // Add test backups
            const testBackups = [
                {
                    id: 'backup-1',
                    createdAt: new Date('2024-01-01'),
                    type: 'full',
                    services: ['filesystem']
                },
                {
                    id: 'backup-2',
                    createdAt: new Date('2024-01-02'),
                    type: 'incremental',
                    services: ['git', 'browser']
                },
                {
                    id: 'backup-3',
                    createdAt: new Date('2024-01-03'),
                    type: 'full',
                    services: ['filesystem', 'git']
                }
            ];

            testBackups.forEach(b => backupManager.metadata.set(b.id, b));
        });

        it('should list all backups', async () => {
            const backups = await backupManager.listBackups();
            
            expect(backups).toHaveLength(3);
            expect(backups[0].id).toBe('backup-3'); // Newest first
        });

        it('should filter by type', async () => {
            const backups = await backupManager.listBackups({ type: 'full' });
            
            expect(backups).toHaveLength(2);
            expect(backups.every(b => b.type === 'full')).toBe(true);
        });

        it('should filter by date range', async () => {
            const backups = await backupManager.listBackups({
                startDate: new Date('2024-01-02'),
                endDate: new Date('2024-01-02')
            });
            
            expect(backups).toHaveLength(1);
            expect(backups[0].id).toBe('backup-2');
        });

        it('should filter by services', async () => {
            const backups = await backupManager.listBackups({
                services: ['git']
            });
            
            expect(backups).toHaveLength(2);
            expect(backups[0].id).toBe('backup-3');
            expect(backups[1].id).toBe('backup-2');
        });
    });

    describe('restoreBackup', () => {
        beforeEach(async () => {
            mockFs.readFile.mockRejectedValue({ code: 'ENOENT' });
            await backupManager.initialize();
            
            // Add test backup
            backupManager.metadata.set('backup-test', {
                id: 'backup-test',
                createdAt: new Date(),
                type: 'full',
                services: ['filesystem', 'git'],
                checksum: 'abc123'
            });
        });

        it('should restore a backup', async () => {
            const options = {
                stopServices: true,
                overwrite: true
            };

            mockFs.access.mockResolvedValue();
            mockTar.extract.mockResolvedValue();
            mockTar.list.mockResolvedValue();
            mockFs.readFile.mockResolvedValue(JSON.stringify({
                services: ['filesystem', 'git']
            }));

            const result = await backupManager.restoreBackup('backup-test', options);

            expect(result).toBe(true);
            expect(mockTar.extract).toHaveBeenCalled();
        });

        it('should handle dry run mode', async () => {
            const options = {
                dryRun: true
            };

            mockFs.access.mockResolvedValue();
            mockTar.extract.mockResolvedValue();
            mockTar.list.mockResolvedValue();
            mockFs.readFile.mockResolvedValue(JSON.stringify({
                services: ['filesystem']
            }));

            const result = await backupManager.restoreBackup('backup-test', options);

            expect(result).toBe(true);
            expect(mockTar.extract).toHaveBeenCalled(); // Still extracts to check
        });

        it('should throw error for non-existent backup', async () => {
            await expect(backupManager.restoreBackup('non-existent'))
                .rejects.toThrow('Backup not found');
        });
    });

    describe('scheduleBackup', () => {
        it('should create a backup schedule', async () => {
            const cronExpression = '0 2 * * *';
            const options = { type: 'full' };

            const scheduleId = await backupManager.scheduleBackup(cronExpression, options);

            expect(scheduleId).toMatch(/^schedule-/);
            expect(mockCron.schedule).toHaveBeenCalledWith(
                cronExpression,
                expect.any(Function),
                expect.any(Object)
            );
            expect(backupManager.schedules.has(scheduleId)).toBe(true);
        });
    });

    describe('deleteBackup', () => {
        beforeEach(async () => {
            mockFs.readFile.mockRejectedValue({ code: 'ENOENT' });
            await backupManager.initialize();
            
            backupManager.metadata.set('backup-delete', {
                id: 'backup-delete',
                createdAt: new Date()
            });
        });

        it('should delete a backup', async () => {
            mockFs.unlink.mockResolvedValue();

            const result = await backupManager.deleteBackup('backup-delete');

            expect(result).toBe(true);
            expect(mockFs.unlink).toHaveBeenCalled();
            expect(backupManager.metadata.has('backup-delete')).toBe(false);
        });

        it('should handle missing backup file', async () => {
            mockFs.unlink.mockRejectedValue({ code: 'ENOENT' });

            const result = await backupManager.deleteBackup('backup-delete');

            expect(result).toBe(true);
            expect(backupManager.metadata.has('backup-delete')).toBe(false);
        });
    });

    describe('verifyBackup', () => {
        beforeEach(async () => {
            mockFs.readFile.mockRejectedValue({ code: 'ENOENT' });
            await backupManager.initialize();
            
            backupManager.metadata.set('backup-verify', {
                id: 'backup-verify',
                checksum: 'abc123'
            });
        });

        it('should verify backup integrity', async () => {
            mockFs.access.mockResolvedValue();
            mockTar.list.mockResolvedValue();
            
            // Mock checksum calculation
            const originalCalculateChecksum = backupManager.calculateChecksum;
            backupManager.calculateChecksum = jest.fn().mockResolvedValue('abc123');

            const result = await backupManager.verifyBackup('backup-verify');

            expect(result.valid).toBe(true);
            expect(result.checksumMatch).toBe(true);
            expect(result.filesIntact).toBe(true);

            backupManager.calculateChecksum = originalCalculateChecksum;
        });

        it('should detect checksum mismatch', async () => {
            mockFs.access.mockResolvedValue();
            mockTar.list.mockResolvedValue();
            
            const originalCalculateChecksum = backupManager.calculateChecksum;
            backupManager.calculateChecksum = jest.fn().mockResolvedValue('different');

            const result = await backupManager.verifyBackup('backup-verify');

            expect(result.valid).toBe(false);
            expect(result.checksumMatch).toBe(false);
            expect(result.errors).toContain('Checksum mismatch');

            backupManager.calculateChecksum = originalCalculateChecksum;
        });
    });

    describe('getStorageStats', () => {
        it('should return storage statistics', async () => {
            backupManager.metadata.set('backup-1', {
                id: 'backup-1',
                createdAt: new Date('2024-01-01'),
                size: 1024 * 1024,
                type: 'full'
            });
            backupManager.metadata.set('backup-2', {
                id: 'backup-2',
                createdAt: new Date('2024-01-02'),
                size: 512 * 1024,
                type: 'incremental'
            });

            const stats = await backupManager.getStorageStats();

            expect(stats.totalSize).toBe(1024 * 1024 + 512 * 1024);
            expect(stats.backupCount).toBe(2);
            expect(stats.byType.full.count).toBe(1);
            expect(stats.byType.incremental.count).toBe(1);
        });

        it('should handle empty backup list', async () => {
            const stats = await backupManager.getStorageStats();

            expect(stats.totalSize).toBe(0);
            expect(stats.backupCount).toBe(0);
            expect(stats.oldestBackup).toBeNull();
        });
    });

    describe('cleanupBackups', () => {
        beforeEach(async () => {
            mockFs.readFile.mockRejectedValue({ code: 'ENOENT' });
            await backupManager.initialize();
            
            // Add test backups
            for (let i = 1; i <= 5; i++) {
                backupManager.metadata.set(`backup-${i}`, {
                    id: `backup-${i}`,
                    createdAt: new Date(`2024-01-0${i}`),
                    size: 1024 * 1024
                });
            }
        });

        it('should cleanup old backups keeping specified versions', async () => {
            mockFs.unlink.mockResolvedValue();

            const result = await backupManager.cleanupBackups({
                keepVersions: 3
            });

            expect(result.deletedCount).toBe(2);
            expect(result.freedSpace).toBe(2 * 1024 * 1024);
            expect(backupManager.metadata.size).toBe(3);
        });

        it('should cleanup backups older than maxAge', async () => {
            mockFs.unlink.mockResolvedValue();
            
            // Set older dates for some backups
            backupManager.metadata.get('backup-1').createdAt = new Date('2023-01-01');
            backupManager.metadata.get('backup-2').createdAt = new Date('2023-01-02');

            const result = await backupManager.cleanupBackups({
                maxAge: 30 // 30 days
            });

            expect(result.deletedCount).toBe(2);
            expect(backupManager.metadata.has('backup-1')).toBe(false);
            expect(backupManager.metadata.has('backup-2')).toBe(false);
        });
    });

    describe('importBackup/exportBackup', () => {
        it('should export backup to local filesystem', async () => {
            backupManager.metadata.set('backup-export', {
                id: 'backup-export'
            });

            mockFs.access.mockResolvedValue();
            mockFs.copyFile.mockResolvedValue();

            await backupManager.exportBackup('backup-export', '/tmp/backup.tar.gz');

            expect(mockFs.copyFile).toHaveBeenCalled();
        });

        it('should import backup from local filesystem', async () => {
            mockFs.copyFile.mockResolvedValue();
            mockFs.stat.mockResolvedValue({ size: 1024 * 1024 });
            mockTar.extract.mockResolvedValue();
            mockFs.readFile.mockResolvedValue(JSON.stringify({
                id: 'old-id',
                createdAt: new Date()
            }));

            const backupId = await backupManager.importBackup('/tmp/backup.tar.gz');

            expect(backupId).toMatch(/^backup-/);
            expect(mockFs.copyFile).toHaveBeenCalled();
            expect(backupManager.metadata.has(backupId)).toBe(true);
        });
    });
});