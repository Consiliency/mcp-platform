const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs').promises;
const zlib = require('zlib');
const { promisify } = require('util');

const gzip = promisify(zlib.gzip);

/**
 * Log rotation configuration and management
 * Provides advanced rotation strategies and cleanup policies
 */
class LogRotation {
  constructor(options = {}) {
    this.options = {
      logDirectory: options.logDirectory || './logs',
      retentionDays: options.retentionDays || 30,
      maxFileSize: options.maxFileSize || '100m',
      datePattern: options.datePattern || 'YYYY-MM-DD',
      compression: options.compression !== false,
      archiveDirectory: options.archiveDirectory || path.join(options.logDirectory || './logs', 'archive'),
      ...options
    };

    this.rotationConfigs = new Map();
  }

  /**
   * Create rotation configuration for different log types
   */
  createRotationConfig(logType, customOptions = {}) {
    const baseConfig = {
      datePattern: this.options.datePattern,
      zippedArchive: this.options.compression,
      maxSize: this.options.maxFileSize,
      maxFiles: `${this.options.retentionDays}d`,
      auditFile: path.join(this.options.logDirectory, `.${logType}-audit.json`),
      ...customOptions
    };

    const configs = {
      application: {
        filename: path.join(this.options.logDirectory, 'application-%DATE%.log'),
        ...baseConfig,
        maxFiles: '14d' // 2 weeks for application logs
      },
      error: {
        filename: path.join(this.options.logDirectory, 'error-%DATE%.log'),
        ...baseConfig,
        maxFiles: '30d', // 30 days for error logs
        level: 'error'
      },
      audit: {
        filename: path.join(this.options.logDirectory, 'audit-%DATE%.log'),
        ...baseConfig,
        maxFiles: '90d', // 90 days for audit logs
        maxSize: '50m' // Smaller files for audit logs
      },
      performance: {
        filename: path.join(this.options.logDirectory, 'performance-%DATE%.log'),
        ...baseConfig,
        maxFiles: '7d', // 7 days for performance logs
        maxSize: '200m' // Larger files for performance data
      },
      security: {
        filename: path.join(this.options.logDirectory, 'security-%DATE%.log'),
        ...baseConfig,
        maxFiles: '365d', // 1 year for security logs
        maxSize: '50m',
        zippedArchive: true // Always compress security logs
      },
      access: {
        filename: path.join(this.options.logDirectory, 'access-%DATE%.log'),
        ...baseConfig,
        maxFiles: '7d', // 7 days for access logs
        frequency: 'daily'
      },
      debug: {
        filename: path.join(this.options.logDirectory, 'debug-%DATE%.log'),
        ...baseConfig,
        maxFiles: '3d', // 3 days for debug logs
        level: 'debug'
      }
    };

    const config = configs[logType] || {
      filename: path.join(this.options.logDirectory, `${logType}-%DATE%.log`),
      ...baseConfig
    };

    this.rotationConfigs.set(logType, config);
    return config;
  }

  /**
   * Create Winston transport with rotation
   */
  createRotatingTransport(logType, options = {}) {
    const config = this.createRotationConfig(logType, options);
    
    const transport = new DailyRotateFile({
      ...config,
      // Add custom archive handler
      options: {
        ...config.options,
        flags: 'a', // Append mode
        mode: 0o640 // Restrictive file permissions
      }
    });

    // Listen to rotation events
    transport.on('rotate', (oldFilename, newFilename) => {
      this._handleRotation(oldFilename, newFilename, logType);
    });

    transport.on('error', (error) => {
      console.error(`Rotation error for ${logType}:`, error);
    });

    return transport;
  }

  /**
   * Create hourly rotation configuration
   */
  createHourlyRotation(logType, options = {}) {
    return this.createRotationConfig(logType, {
      ...options,
      datePattern: 'YYYY-MM-DD-HH',
      frequency: 'hourly',
      maxFiles: '48h' // Keep 48 hours of hourly logs
    });
  }

  /**
   * Create size-based rotation with time backup
   */
  createSizeRotation(logType, options = {}) {
    return this.createRotationConfig(logType, {
      ...options,
      maxSize: options.maxSize || '10m',
      maxFiles: options.maxFiles || 100,
      // Add timestamp to filename when rotating by size
      filename: path.join(
        this.options.logDirectory, 
        `${logType}-%DATE%-%COUNT%.log`
      )
    });
  }

  /**
   * Manual log rotation
   */
  async rotateLog(logPath) {
    try {
      const stats = await fs.stat(logPath);
      if (!stats.isFile()) {
        throw new Error('Path is not a file');
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const dir = path.dirname(logPath);
      const basename = path.basename(logPath, '.log');
      const rotatedPath = path.join(dir, `${basename}-${timestamp}.log`);

      // Rename the current log file
      await fs.rename(logPath, rotatedPath);

      // Compress if enabled
      if (this.options.compression) {
        await this._compressFile(rotatedPath);
      }

      // Create new empty log file
      await fs.writeFile(logPath, '', { mode: 0o640 });

      return {
        success: true,
        rotatedFile: rotatedPath,
        compressed: this.options.compression
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Clean up old log files based on retention policy
   */
  async cleanupOldLogs() {
    const results = {
      deleted: [],
      errors: [],
      totalSize: 0
    };

    try {
      const files = await fs.readdir(this.options.logDirectory);
      const now = Date.now();
      const retentionMs = this.options.retentionDays * 24 * 60 * 60 * 1000;

      for (const file of files) {
        if (!file.endsWith('.log') && !file.endsWith('.gz')) continue;

        const filePath = path.join(this.options.logDirectory, file);
        
        try {
          const stats = await fs.stat(filePath);
          const age = now - stats.mtime.getTime();

          if (age > retentionMs) {
            results.totalSize += stats.size;
            await fs.unlink(filePath);
            results.deleted.push({
              file,
              size: stats.size,
              age: Math.floor(age / (24 * 60 * 60 * 1000))
            });
          }
        } catch (error) {
          results.errors.push({ file, error: error.message });
        }
      }
    } catch (error) {
      results.errors.push({ error: error.message });
    }

    return results;
  }

  /**
   * Archive old logs to separate directory
   */
  async archiveLogs(daysOld = 7) {
    const results = {
      archived: [],
      errors: []
    };

    try {
      // Ensure archive directory exists
      await fs.mkdir(this.options.archiveDirectory, { recursive: true });

      const files = await fs.readdir(this.options.logDirectory);
      const now = Date.now();
      const archiveThreshold = daysOld * 24 * 60 * 60 * 1000;

      for (const file of files) {
        if (!file.endsWith('.log') && !file.endsWith('.gz')) continue;
        if (file.startsWith('.')) continue; // Skip audit files

        const sourcePath = path.join(this.options.logDirectory, file);
        
        try {
          const stats = await fs.stat(sourcePath);
          const age = now - stats.mtime.getTime();

          if (age > archiveThreshold) {
            const destPath = path.join(this.options.archiveDirectory, file);
            
            // Compress before archiving if not already compressed
            if (file.endsWith('.log') && this.options.compression) {
              const compressedPath = await this._compressFile(sourcePath);
              await fs.rename(compressedPath, destPath + '.gz');
              await fs.unlink(sourcePath);
              results.archived.push({ file: file + '.gz', size: stats.size });
            } else {
              await fs.rename(sourcePath, destPath);
              results.archived.push({ file, size: stats.size });
            }
          }
        } catch (error) {
          results.errors.push({ file, error: error.message });
        }
      }
    } catch (error) {
      results.errors.push({ error: error.message });
    }

    return results;
  }

  /**
   * Get rotation statistics
   */
  async getRotationStats() {
    const stats = {
      logDirectory: this.options.logDirectory,
      archiveDirectory: this.options.archiveDirectory,
      files: [],
      totalSize: 0,
      oldestFile: null,
      newestFile: null
    };

    try {
      const files = await fs.readdir(this.options.logDirectory);
      
      for (const file of files) {
        if (!file.endsWith('.log') && !file.endsWith('.gz')) continue;

        const filePath = path.join(this.options.logDirectory, file);
        const fileStat = await fs.stat(filePath);
        
        const fileInfo = {
          name: file,
          size: fileStat.size,
          created: fileStat.birthtime,
          modified: fileStat.mtime,
          compressed: file.endsWith('.gz')
        };
        
        stats.files.push(fileInfo);
        stats.totalSize += fileStat.size;
        
        if (!stats.oldestFile || fileStat.mtime < stats.oldestFile.modified) {
          stats.oldestFile = fileInfo;
        }
        
        if (!stats.newestFile || fileStat.mtime > stats.newestFile.modified) {
          stats.newestFile = fileInfo;
        }
      }
      
      stats.fileCount = stats.files.length;
      stats.averageSize = stats.files.length > 0 ? 
        Math.round(stats.totalSize / stats.files.length) : 0;
    } catch (error) {
      stats.error = error.message;
    }

    return stats;
  }

  /**
   * Configure log rotation monitoring
   */
  setupRotationMonitoring(callback) {
    // Monitor disk space
    const checkDiskSpace = async () => {
      try {
        // This is a simplified version - in production, use proper disk space checking
        const stats = await this.getRotationStats();
        
        if (stats.totalSize > 1024 * 1024 * 1024) { // 1GB threshold
          callback({
            type: 'disk_space_warning',
            message: 'Log directory exceeding 1GB',
            stats
          });
        }
      } catch (error) {
        callback({
          type: 'monitoring_error',
          error: error.message
        });
      }
    };

    // Check every hour
    const interval = setInterval(checkDiskSpace, 60 * 60 * 1000);
    
    return {
      stop: () => clearInterval(interval)
    };
  }

  /**
   * Handle rotation event
   */
  async _handleRotation(oldFilename, newFilename, logType) {
    try {
      // Custom post-rotation handling
      if (this.options.onRotate) {
        await this.options.onRotate(oldFilename, newFilename, logType);
      }

      // Move to archive if configured
      if (this.options.autoArchive) {
        const archivePath = path.join(
          this.options.archiveDirectory,
          path.basename(oldFilename)
        );
        await fs.rename(oldFilename, archivePath);
      }
    } catch (error) {
      console.error('Post-rotation handling error:', error);
    }
  }

  /**
   * Compress a file
   */
  async _compressFile(filePath) {
    const compressedPath = filePath + '.gz';
    
    try {
      const fileContent = await fs.readFile(filePath);
      const compressed = await gzip(fileContent);
      await fs.writeFile(compressedPath, compressed);
      
      // Preserve timestamps
      const stats = await fs.stat(filePath);
      await fs.utimes(compressedPath, stats.atime, stats.mtime);
      
      return compressedPath;
    } catch (error) {
      throw new Error(`Compression failed: ${error.message}`);
    }
  }

  /**
   * Create rotation strategy based on environment
   */
  static getEnvironmentStrategy(env = process.env.NODE_ENV) {
    const strategies = {
      development: {
        retentionDays: 7,
        maxFileSize: '50m',
        compression: false,
        logTypes: ['application', 'error', 'debug']
      },
      staging: {
        retentionDays: 14,
        maxFileSize: '100m',
        compression: true,
        logTypes: ['application', 'error', 'audit', 'performance']
      },
      production: {
        retentionDays: 30,
        maxFileSize: '200m',
        compression: true,
        logTypes: ['application', 'error', 'audit', 'security', 'access', 'performance'],
        autoArchive: true
      }
    };

    return strategies[env] || strategies.development;
  }
}

module.exports = LogRotation;