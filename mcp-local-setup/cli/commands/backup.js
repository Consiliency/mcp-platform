/**
 * Backup command implementation for MCP CLI
 */

const BackupManager = require('../../scripts/backup-manager');
const DataManager = require('../../scripts/data-manager');
const chalk = require('chalk');
const ora = require('ora');
const Table = require('cli-table3');
const { program } = require('commander');

let backupManager;
let dataManager;

/**
 * Initialize managers
 */
async function initializeManagers() {
    if (!backupManager) {
        backupManager = new BackupManager();
        await backupManager.initialize();
    }
    if (!dataManager) {
        dataManager = new DataManager();
        await dataManager.initialize();
    }
}

/**
 * Create backup command
 */
async function createBackup(options) {
    const spinner = ora('Creating backup...').start();
    
    try {
        await initializeManagers();
        
        const backupOptions = {
            type: options.type || 'full',
            services: options.services ? options.services.split(',') : undefined,
            includeData: options.data !== false,
            includeConfig: options.config !== false,
            includeLogs: options.logs || false,
            description: options.description,
            compress: options.compress !== false
        };
        
        const backupId = await backupManager.createBackup(backupOptions);
        
        spinner.succeed(chalk.green(`Backup created successfully: ${backupId}`));
        
        // Display backup details
        const metadata = await backupManager.getBackupMetadata(backupId);
        console.log('\nBackup Details:');
        console.log(`  ID: ${metadata.id}`);
        console.log(`  Type: ${metadata.type}`);
        console.log(`  Size: ${formatBytes(metadata.size)}`);
        console.log(`  Services: ${metadata.services.join(', ')}`);
        
    } catch (error) {
        spinner.fail(chalk.red(`Backup failed: ${error.message}`));
        process.exit(1);
    }
}

/**
 * List backups command
 */
async function listBackups(options) {
    try {
        await initializeManagers();
        
        const filter = {};
        if (options.type) filter.type = options.type;
        if (options.days) {
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - options.days);
            filter.startDate = startDate;
        }
        
        const backups = await backupManager.listBackups(filter);
        
        if (backups.length === 0) {
            console.log(chalk.yellow('No backups found'));
            return;
        }
        
        // Create table
        const table = new Table({
            head: ['ID', 'Type', 'Created', 'Size', 'Services'],
            style: { head: ['cyan'] }
        });
        
        backups.forEach(backup => {
            table.push([
                backup.id,
                backup.type,
                backup.createdAt.toLocaleString(),
                formatBytes(backup.size || 0),
                backup.services.slice(0, 3).join(', ') + (backup.services.length > 3 ? '...' : '')
            ]);
        });
        
        console.log(table.toString());
        console.log(`\nTotal backups: ${backups.length}`);
        
    } catch (error) {
        console.error(chalk.red(`Failed to list backups: ${error.message}`));
        process.exit(1);
    }
}

/**
 * Restore backup command
 */
async function restoreBackup(backupId, options) {
    const spinner = ora('Restoring backup...').start();
    
    try {
        await initializeManagers();
        
        const restoreOptions = {
            stopServices: options.stop || true,
            overwrite: options.overwrite || false,
            services: options.services ? options.services.split(',') : undefined,
            skipData: options.skipData || false,
            dryRun: options.dryRun || false
        };
        
        if (options.dryRun) {
            spinner.text = 'Running restore simulation...';
        }
        
        const success = await backupManager.restoreBackup(backupId, restoreOptions);
        
        if (success) {
            if (options.dryRun) {
                spinner.succeed(chalk.green('Restore simulation completed successfully'));
            } else {
                spinner.succeed(chalk.green('Backup restored successfully'));
            }
        }
        
    } catch (error) {
        spinner.fail(chalk.red(`Restore failed: ${error.message}`));
        process.exit(1);
    }
}

/**
 * Schedule backup command
 */
async function scheduleBackup(cronExpression, options) {
    try {
        await initializeManagers();
        
        const backupOptions = {
            type: options.type || 'full',
            services: options.services ? options.services.split(',') : undefined,
            includeData: true,
            includeConfig: true,
            compress: options.compress !== false,
            description: options.description || `Scheduled ${options.type || 'full'} backup`
        };
        
        const scheduleId = await backupManager.scheduleBackup(cronExpression, backupOptions);
        
        console.log(chalk.green(`Backup scheduled successfully: ${scheduleId}`));
        console.log(`Cron expression: ${cronExpression}`);
        
    } catch (error) {
        console.error(chalk.red(`Failed to schedule backup: ${error.message}`));
        process.exit(1);
    }
}

/**
 * List schedules command
 */
async function listSchedules() {
    try {
        await initializeManagers();
        
        const schedules = await backupManager.getSchedules();
        
        if (schedules.length === 0) {
            console.log(chalk.yellow('No scheduled backups found'));
            return;
        }
        
        const table = new Table({
            head: ['ID', 'Schedule', 'Type', 'Enabled', 'Next Run', 'Last Run'],
            style: { head: ['cyan'] }
        });
        
        schedules.forEach(schedule => {
            table.push([
                schedule.id,
                schedule.cronExpression,
                schedule.options.type,
                schedule.enabled ? chalk.green('Yes') : chalk.red('No'),
                schedule.nextRun ? schedule.nextRun.toLocaleString() : '-',
                schedule.lastRun ? schedule.lastRun.toLocaleString() : 'Never'
            ]);
        });
        
        console.log(table.toString());
        
    } catch (error) {
        console.error(chalk.red(`Failed to list schedules: ${error.message}`));
        process.exit(1);
    }
}

/**
 * Delete backup command
 */
async function deleteBackup(backupId) {
    try {
        await initializeManagers();
        
        const deleted = await backupManager.deleteBackup(backupId);
        
        if (deleted) {
            console.log(chalk.green(`Backup ${backupId} deleted successfully`));
        } else {
            console.log(chalk.yellow(`Backup ${backupId} not found`));
        }
        
    } catch (error) {
        console.error(chalk.red(`Failed to delete backup: ${error.message}`));
        process.exit(1);
    }
}

/**
 * Cleanup backups command
 */
async function cleanupBackups(options) {
    const spinner = ora('Cleaning up backups...').start();
    
    try {
        await initializeManagers();
        
        const cleanupOptions = {
            keepVersions: options.keep || 10,
            maxAge: options.days,
            cleanTemp: true
        };
        
        const result = await backupManager.cleanupBackups(cleanupOptions);
        
        spinner.succeed(chalk.green('Cleanup completed'));
        console.log(`  Deleted: ${result.deletedCount} backups`);
        console.log(`  Freed: ${formatBytes(result.freedSpace)}`);
        console.log(`  Remaining: ${result.remainingCount} backups`);
        
    } catch (error) {
        spinner.fail(chalk.red(`Cleanup failed: ${error.message}`));
        process.exit(1);
    }
}

/**
 * Verify backup command
 */
async function verifyBackup(backupId) {
    const spinner = ora('Verifying backup...').start();
    
    try {
        await initializeManagers();
        
        const result = await backupManager.verifyBackup(backupId);
        
        if (result.valid) {
            spinner.succeed(chalk.green('Backup is valid'));
            console.log(`  Checksum: ${result.checksumMatch ? chalk.green('✓') : chalk.red('✗')}`);
            console.log(`  Files: ${result.filesIntact ? chalk.green('✓') : chalk.red('✗')}`);
        } else {
            spinner.fail(chalk.red('Backup verification failed'));
            result.errors.forEach(error => {
                console.log(chalk.red(`  - ${error}`));
            });
        }
        
    } catch (error) {
        spinner.fail(chalk.red(`Verification failed: ${error.message}`));
        process.exit(1);
    }
}

/**
 * Storage stats command
 */
async function storageStats() {
    try {
        await initializeManagers();
        
        const stats = await backupManager.getStorageStats();
        
        console.log(chalk.cyan('\nBackup Storage Statistics:'));
        console.log(`  Total Size: ${formatBytes(stats.totalSize)}`);
        console.log(`  Backup Count: ${stats.backupCount}`);
        console.log(`  Average Size: ${formatBytes(stats.averageSize)}`);
        
        if (stats.oldestBackup) {
            console.log(`  Oldest Backup: ${stats.oldestBackup.toLocaleString()}`);
            console.log(`  Newest Backup: ${stats.newestBackup.toLocaleString()}`);
        }
        
        if (Object.keys(stats.byType).length > 0) {
            console.log('\n  By Type:');
            Object.entries(stats.byType).forEach(([type, data]) => {
                console.log(`    ${type}: ${data.count} backups (${formatBytes(data.size)})`);
            });
        }
        
    } catch (error) {
        console.error(chalk.red(`Failed to get storage stats: ${error.message}`));
        process.exit(1);
    }
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Export command functions
module.exports = {
    createBackup,
    listBackups,
    restoreBackup,
    scheduleBackup,
    listSchedules,
    deleteBackup,
    cleanupBackups,
    verifyBackup,
    storageStats
};