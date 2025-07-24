const LogRotation = require('../../../../monitoring/logging/rotation');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

jest.mock('fs').promises;
jest.mock('winston-daily-rotate-file');

describe('LogRotation', () => {
  let tempDir;
  let logRotation;

  beforeEach(async () => {
    // Create temp directory for tests
    tempDir = path.join(os.tmpdir(), `log-rotation-test-${Date.now()}`);
    
    logRotation = new LogRotation({
      logDirectory: tempDir,
      maxSize: '10m',
      maxFiles: '7d',
      datePattern: 'YYYY-MM-DD',
      compression: true
    });

    // Mock fs methods
    fs.mkdir = jest.fn().mockResolvedValue();
    fs.readdir = jest.fn().mockResolvedValue([]);
    fs.stat = jest.fn().mockResolvedValue({ size: 1024 * 1024 });
    fs.unlink = jest.fn().mockResolvedValue();
    fs.access = jest.fn().mockResolvedValue();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const rotation = new LogRotation();
      expect(rotation.options.logDirectory).toBe('./logs');
      expect(rotation.options.maxSize).toBe('20m');
      expect(rotation.options.maxFiles).toBe('14d');
      expect(rotation.options.datePattern).toBe('YYYY-MM-DD');
      expect(rotation.options.compression).toBe(true);
    });

    it('should accept custom options', () => {
      expect(logRotation.options.logDirectory).toBe(tempDir);
      expect(logRotation.options.maxSize).toBe('10m');
      expect(logRotation.options.maxFiles).toBe('7d');
    });
  });

  describe('initialize', () => {
    it('should create log directory if it does not exist', async () => {
      fs.access = jest.fn().mockRejectedValue(new Error('ENOENT'));
      
      await logRotation.initialize();
      
      expect(fs.mkdir).toHaveBeenCalledWith(tempDir, { recursive: true });
    });

    it('should not create directory if it exists', async () => {
      fs.access = jest.fn().mockResolvedValue();
      
      await logRotation.initialize();
      
      expect(fs.mkdir).not.toHaveBeenCalled();
    });

    it('should start cleanup scheduler', async () => {
      jest.spyOn(logRotation, '_startCleanupScheduler');
      
      await logRotation.initialize();
      
      expect(logRotation._startCleanupScheduler).toHaveBeenCalled();
      expect(logRotation.initialized).toBe(true);
    });
  });

  describe('createRotatingTransport', () => {
    it('should create transport with correct configuration', () => {
      const transport = logRotation.createRotatingTransport('app', {
        level: 'info',
        format: 'json'
      });

      expect(transport).toBeDefined();
      expect(transport.filename).toContain('app-%DATE%.log');
      expect(transport.dirname).toBe(tempDir);
      expect(transport.maxSize).toBe('10m');
      expect(transport.maxFiles).toBe('7d');
      expect(transport.datePattern).toBe('YYYY-MM-DD');
      expect(transport.zippedArchive).toBe(true);
    });

    it('should handle error logs separately', () => {
      const transport = logRotation.createRotatingTransport('error', {
        level: 'error'
      });

      expect(transport.filename).toContain('error-%DATE%.log');
      expect(transport.level).toBe('error');
    });

    it('should support custom filename patterns', () => {
      const transport = logRotation.createRotatingTransport('custom', {
        filename: 'custom-{{date}}-{{pid}}.log'
      });

      expect(transport.filename).toContain('custom-');
      expect(transport.filename).toContain(process.pid.toString());
    });
  });

  describe('rotateLog', () => {
    it('should manually rotate a specific log file', async () => {
      const logFile = path.join(tempDir, 'app.log');
      fs.access = jest.fn().mockResolvedValue();
      fs.rename = jest.fn().mockResolvedValue();

      await logRotation.rotateLog('app.log');

      expect(fs.rename).toHaveBeenCalled();
      const newFileName = fs.rename.mock.calls[0][1];
      expect(newFileName).toMatch(/app-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.log/);
    });

    it('should compress rotated file when enabled', async () => {
      fs.access = jest.fn().mockResolvedValue();
      fs.rename = jest.fn().mockResolvedValue();
      fs.createReadStream = jest.fn().mockReturnValue({
        pipe: jest.fn().mockReturnThis(),
        on: jest.fn((event, cb) => {
          if (event === 'finish') cb();
          return this;
        })
      });
      fs.createWriteStream = jest.fn().mockReturnValue({
        on: jest.fn()
      });

      await logRotation.rotateLog('app.log', { compress: true });

      expect(fs.createReadStream).toHaveBeenCalled();
      expect(fs.createWriteStream).toHaveBeenCalled();
    });

    it('should handle rotation errors gracefully', async () => {
      fs.access = jest.fn().mockRejectedValue(new Error('File not found'));
      
      await expect(logRotation.rotateLog('missing.log')).rejects.toThrow('File not found');
    });
  });

  describe('cleanupOldLogs', () => {
    it('should remove logs older than retention period', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10);
      
      fs.readdir = jest.fn().mockResolvedValue([
        'app-2025-01-01.log',
        'app-2025-01-10.log',
        'app-2025-01-15.log'
      ]);
      
      fs.stat = jest.fn()
        .mockResolvedValueOnce({ mtime: oldDate, isFile: () => true })
        .mockResolvedValueOnce({ mtime: new Date(), isFile: () => true })
        .mockResolvedValueOnce({ mtime: new Date(), isFile: () => true });

      await logRotation.cleanupOldLogs();

      expect(fs.unlink).toHaveBeenCalledTimes(1);
      expect(fs.unlink).toHaveBeenCalledWith(expect.stringContaining('app-2025-01-01.log'));
    });

    it('should handle cleanup by file count', async () => {
      logRotation.options.maxFiles = 5;
      
      const files = Array.from({ length: 10 }, (_, i) => 
        `app-2025-01-${String(i + 1).padStart(2, '0')}.log`
      );
      
      fs.readdir = jest.fn().mockResolvedValue(files);
      fs.stat = jest.fn().mockResolvedValue({ 
        mtime: new Date(), 
        isFile: () => true 
      });

      await logRotation.cleanupOldLogs();

      expect(fs.unlink).toHaveBeenCalledTimes(5);
    });

    it('should skip non-log files', async () => {
      fs.readdir = jest.fn().mockResolvedValue([
        'app.log',
        'readme.txt',
        '.gitignore'
      ]);
      
      fs.stat = jest.fn().mockResolvedValue({ 
        mtime: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), 
        isFile: () => true 
      });

      await logRotation.cleanupOldLogs();

      expect(fs.unlink).toHaveBeenCalledTimes(1);
      expect(fs.unlink).toHaveBeenCalledWith(expect.stringContaining('app.log'));
    });
  });

  describe('getLogStats', () => {
    it('should return statistics about log files', async () => {
      fs.readdir = jest.fn().mockResolvedValue([
        'app.log',
        'app-2025-01-14.log',
        'app-2025-01-15.log.gz',
        'error.log'
      ]);
      
      fs.stat = jest.fn()
        .mockResolvedValueOnce({ size: 1024 * 1024, mtime: new Date() })
        .mockResolvedValueOnce({ size: 2048 * 1024, mtime: new Date() })
        .mockResolvedValueOnce({ size: 512 * 1024, mtime: new Date() })
        .mockResolvedValueOnce({ size: 256 * 1024, mtime: new Date() });

      const stats = await logRotation.getLogStats();

      expect(stats.totalFiles).toBe(4);
      expect(stats.totalSize).toBe((1024 + 2048 + 512 + 256) * 1024);
      expect(stats.files).toHaveLength(4);
      expect(stats.compressed).toBe(1);
      expect(stats.byType.app).toBe(3);
      expect(stats.byType.error).toBe(1);
    });

    it('should handle empty log directory', async () => {
      fs.readdir = jest.fn().mockResolvedValue([]);

      const stats = await logRotation.getLogStats();

      expect(stats.totalFiles).toBe(0);
      expect(stats.totalSize).toBe(0);
      expect(stats.files).toHaveLength(0);
    });
  });

  describe('archiveLogs', () => {
    it('should create archive of specified logs', async () => {
      const mockArchiver = {
        pipe: jest.fn(),
        directory: jest.fn(),
        file: jest.fn(),
        finalize: jest.fn().mockResolvedValue(),
        on: jest.fn((event, cb) => {
          if (event === 'end') setTimeout(cb, 0);
        })
      };

      jest.spyOn(logRotation, '_createArchiver').mockReturnValue(mockArchiver);
      fs.createWriteStream = jest.fn().mockReturnValue({
        on: jest.fn()
      });

      const archivePath = await logRotation.archiveLogs({
        pattern: 'app-*.log',
        outputPath: path.join(tempDir, 'archive.zip')
      });

      expect(archivePath).toContain('archive.zip');
      expect(mockArchiver.file).toHaveBeenCalled();
      expect(mockArchiver.finalize).toHaveBeenCalled();
    });

    it('should support date range archiving', async () => {
      const mockArchiver = {
        pipe: jest.fn(),
        file: jest.fn(),
        finalize: jest.fn().mockResolvedValue(),
        on: jest.fn((event, cb) => {
          if (event === 'end') setTimeout(cb, 0);
        })
      };

      jest.spyOn(logRotation, '_createArchiver').mockReturnValue(mockArchiver);
      
      fs.readdir = jest.fn().mockResolvedValue([
        'app-2025-01-10.log',
        'app-2025-01-15.log',
        'app-2025-01-20.log'
      ]);

      await logRotation.archiveLogs({
        startDate: '2025-01-10',
        endDate: '2025-01-15'
      });

      expect(mockArchiver.file).toHaveBeenCalledTimes(2);
    });
  });

  describe('rotation policies', () => {
    it('should apply size-based rotation policy', async () => {
      const policy = logRotation.createRotationPolicy({
        type: 'size',
        maxSize: 1024 * 1024 // 1MB
      });

      fs.stat = jest.fn().mockResolvedValue({ size: 2 * 1024 * 1024 });
      
      const shouldRotate = await policy.shouldRotate('app.log');
      expect(shouldRotate).toBe(true);
    });

    it('should apply time-based rotation policy', async () => {
      const policy = logRotation.createRotationPolicy({
        type: 'time',
        interval: 'daily'
      });

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      fs.stat = jest.fn().mockResolvedValue({ mtime: yesterday });
      
      const shouldRotate = await policy.shouldRotate('app.log');
      expect(shouldRotate).toBe(true);
    });

    it('should apply combined rotation policies', async () => {
      const policy = logRotation.createRotationPolicy({
        type: 'combined',
        policies: [
          { type: 'size', maxSize: 1024 * 1024 },
          { type: 'time', interval: 'hourly' }
        ]
      });

      fs.stat = jest.fn().mockResolvedValue({ 
        size: 512 * 1024,
        mtime: new Date(Date.now() - 2 * 60 * 60 * 1000) // 2 hours ago
      });
      
      const shouldRotate = await policy.shouldRotate('app.log');
      expect(shouldRotate).toBe(true);
    });
  });

  describe('compression', () => {
    it('should compress log files', async () => {
      const mockGzip = {
        pipe: jest.fn().mockReturnThis(),
        on: jest.fn((event, cb) => {
          if (event === 'finish') cb();
          return this;
        })
      };

      jest.spyOn(require('zlib'), 'createGzip').mockReturnValue(mockGzip);
      
      fs.createReadStream = jest.fn().mockReturnValue({
        pipe: jest.fn().mockReturnThis()
      });
      
      fs.createWriteStream = jest.fn().mockReturnValue({
        on: jest.fn()
      });

      await logRotation.compressLog('app.log');

      expect(fs.createReadStream).toHaveBeenCalledWith(expect.stringContaining('app.log'));
      expect(fs.createWriteStream).toHaveBeenCalledWith(expect.stringContaining('app.log.gz'));
    });

    it('should handle compression errors', async () => {
      fs.createReadStream = jest.fn().mockImplementation(() => {
        throw new Error('Read error');
      });

      await expect(logRotation.compressLog('app.log')).rejects.toThrow('Read error');
    });
  });

  describe('monitoring', () => {
    it('should emit events for rotation lifecycle', async () => {
      const events = [];
      logRotation.on('rotate:start', (data) => events.push({ type: 'start', data }));
      logRotation.on('rotate:complete', (data) => events.push({ type: 'complete', data }));
      logRotation.on('rotate:error', (data) => events.push({ type: 'error', data }));

      fs.access = jest.fn().mockResolvedValue();
      fs.rename = jest.fn().mockResolvedValue();

      await logRotation.rotateLog('app.log');

      expect(events).toHaveLength(2);
      expect(events[0].type).toBe('start');
      expect(events[1].type).toBe('complete');
    });

    it('should track rotation metrics', async () => {
      fs.access = jest.fn().mockResolvedValue();
      fs.rename = jest.fn().mockResolvedValue();
      fs.stat = jest.fn().mockResolvedValue({ size: 1024 * 1024 });

      await logRotation.rotateLog('app.log');
      
      const metrics = logRotation.getMetrics();
      
      expect(metrics.rotations.total).toBe(1);
      expect(metrics.rotations.successful).toBe(1);
      expect(metrics.rotations.failed).toBe(0);
      expect(metrics.bytesRotated).toBe(1024 * 1024);
    });
  });
});