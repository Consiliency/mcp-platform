/**
 * Unit tests for AssetOptimizer
 * @module tests/unit/scripts/build/asset-optimize.test
 */

const { AssetOptimizer } = require('../../../../scripts/build/asset-optimize');
const fs = require('fs').promises;
const { spawn } = require('child_process');
const path = require('path');
const zlib = require('zlib');
const { promisify } = require('util');

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
    createWriteStream: jest.fn()
  },
  createWriteStream: jest.fn()
}));
jest.mock('child_process');
jest.mock('zlib');

// Mock terser and clean-css
jest.mock('terser', () => ({
  minify: jest.fn().mockResolvedValue({
    code: 'minified code',
    map: 'source map'
  })
}), { virtual: true });

jest.mock('clean-css', () => {
  return jest.fn().mockImplementation(() => ({
    minify: jest.fn().mockReturnValue({
      styles: 'minified css',
      errors: [],
      sourceMap: { toString: () => 'css source map' }
    })
  }));
}, { virtual: true });

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

describe('AssetOptimizer', () => {
  let optimizer;
  let mockGzip;
  let mockBrotli;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock zlib functions
    mockGzip = jest.fn().mockResolvedValue(Buffer.from('gzipped content'));
    mockBrotli = jest.fn().mockResolvedValue(Buffer.from('brotli content'));
    
    zlib.gzip = jest.fn((data, cb) => cb(null, mockGzip()));
    zlib.brotliCompress = jest.fn((data, options, cb) => cb(null, mockBrotli()));
    
    // Default mocks
    fs.access.mockResolvedValue();
    fs.readFile.mockResolvedValue('file content');
    fs.writeFile.mockResolvedValue();
    fs.stat.mockResolvedValue({ size: 1000 });
    fs.readdir.mockResolvedValue([]);
    fs.rename.mockResolvedValue();
    
    spawn.mockReturnValue(createMockProcess());
    
    optimizer = new AssetOptimizer({
      inputDir: '/tmp/dist',
      verbose: false
    });
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const opt = new AssetOptimizer();
      expect(opt.options.target).toBe('production');
      expect(opt.options.minify).toBe(true);
      expect(opt.options.compress).toBe(true);
      expect(opt.options.images).toBe(true);
      expect(opt.options.cache).toBe(true);
      expect(opt.options.sourceMaps).toBe(false);
    });

    it('should merge custom options', () => {
      const opt = new AssetOptimizer({
        target: 'development',
        minify: false,
        sourceMaps: true
      });
      expect(opt.options.target).toBe('development');
      expect(opt.options.minify).toBe(false);
      expect(opt.options.sourceMaps).toBe(true);
    });

    it('should initialize stats', () => {
      expect(optimizer.stats).toEqual({
        files: 0,
        originalSize: 0,
        optimizedSize: 0,
        savings: 0,
        errors: []
      });
    });
  });

  describe('optimize', () => {
    beforeEach(() => {
      optimizer.validateInput = jest.fn().mockResolvedValue();
      optimizer.minifyAssets = jest.fn().mockResolvedValue();
      optimizer.optimizeImages = jest.fn().mockResolvedValue();
      optimizer.compressAssets = jest.fn().mockResolvedValue();
      optimizer.generateCacheManifest = jest.fn().mockResolvedValue();
      optimizer.generateReport = jest.fn().mockResolvedValue();
    });

    it('should run all optimizations successfully', async () => {
      optimizer.stats = {
        files: 10,
        originalSize: 10000,
        optimizedSize: 7000,
        savings: 3000,
        errors: []
      };
      
      const result = await optimizer.optimize();
      
      expect(optimizer.validateInput).toHaveBeenCalled();
      expect(optimizer.minifyAssets).toHaveBeenCalled();
      expect(optimizer.optimizeImages).toHaveBeenCalled();
      expect(optimizer.compressAssets).toHaveBeenCalled();
      expect(optimizer.generateCacheManifest).toHaveBeenCalled();
      expect(optimizer.generateReport).toHaveBeenCalled();
      expect(result).toEqual(optimizer.stats);
    });

    it('should skip disabled optimizations', async () => {
      optimizer.options.minify = false;
      optimizer.options.images = false;
      optimizer.options.compress = false;
      optimizer.options.cache = false;
      
      await optimizer.optimize();
      
      expect(optimizer.minifyAssets).not.toHaveBeenCalled();
      expect(optimizer.optimizeImages).not.toHaveBeenCalled();
      expect(optimizer.compressAssets).not.toHaveBeenCalled();
      expect(optimizer.generateCacheManifest).not.toHaveBeenCalled();
    });

    it('should handle optimization errors', async () => {
      optimizer.validateInput.mockRejectedValue(new Error('Input error'));
      
      await expect(optimizer.optimize()).rejects.toThrow('Input error');
    });

    it('should warn about errors during optimization', async () => {
      optimizer.stats.errors = [
        { file: 'test.js', error: 'Minify failed' }
      ];
      
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      await optimizer.optimize();
      
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('1 errors occurred'));
      consoleSpy.mockRestore();
    });
  });

  describe('validateInput', () => {
    it('should validate input directory exists', async () => {
      await expect(optimizer.validateInput()).resolves.not.toThrow();
      expect(fs.access).toHaveBeenCalledWith('/tmp/dist');
    });

    it('should throw when input directory not found', async () => {
      fs.access.mockRejectedValue(new Error('Not found'));
      
      await expect(optimizer.validateInput()).rejects.toThrow('Input directory not found: /tmp/dist');
    });
  });

  describe('minifyAssets', () => {
    beforeEach(() => {
      optimizer.findFiles = jest.fn().mockResolvedValue([
        '/tmp/dist/app.js',
        '/tmp/dist/styles.css',
        '/tmp/dist/app.min.js' // Should be skipped
      ]);
      optimizer.minifyJavaScript = jest.fn().mockResolvedValue();
      optimizer.minifyCSS = jest.fn().mockResolvedValue();
    });

    it('should minify JavaScript and CSS files', async () => {
      fs.stat
        .mockResolvedValueOnce({ size: 5000 }) // app.js original
        .mockResolvedValueOnce({ size: 2000 }) // app.js minified
        .mockResolvedValueOnce({ size: 3000 }) // styles.css original
        .mockResolvedValueOnce({ size: 1500 }); // styles.css minified
      
      await optimizer.minifyAssets();
      
      expect(optimizer.minifyJavaScript).toHaveBeenCalledWith('/tmp/dist/app.js');
      expect(optimizer.minifyCSS).toHaveBeenCalledWith('/tmp/dist/styles.css');
      expect(optimizer.stats.files).toBe(2);
      expect(optimizer.stats.originalSize).toBe(8000);
      expect(optimizer.stats.optimizedSize).toBe(3500);
    });

    it('should skip already minified files', async () => {
      await optimizer.minifyAssets();
      
      expect(optimizer.minifyJavaScript).not.toHaveBeenCalledWith('/tmp/dist/app.min.js');
    });

    it('should handle minification errors', async () => {
      optimizer.minifyJavaScript.mockRejectedValue(new Error('Minify failed'));
      
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      await optimizer.minifyAssets();
      
      expect(optimizer.stats.errors).toHaveLength(1);
      expect(optimizer.stats.errors[0]).toMatchObject({
        file: '/tmp/dist/app.js',
        error: 'Minify failed'
      });
      
      consoleSpy.mockRestore();
    });

    it('should show verbose output', async () => {
      optimizer.options.verbose = true;
      fs.stat
        .mockResolvedValueOnce({ size: 5000 })
        .mockResolvedValueOnce({ size: 2000 });
      
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      await optimizer.minifyAssets();
      
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('saved'));
      consoleSpy.mockRestore();
    });
  });

  describe('minifyJavaScript', () => {
    it('should use terser command when available', async () => {
      optimizer.commandExists = jest.fn().mockResolvedValue(true);
      
      await optimizer.minifyJavaScript('/tmp/dist/app.js');
      
      expect(spawn).toHaveBeenCalledWith('terser', [
        '/tmp/dist/app.js',
        '-o', '/tmp/dist/app.js',
        '-c', 'drop_console=true,drop_debugger=true',
        '-m'
      ]);
    });

    it('should include source maps when enabled', async () => {
      optimizer.options.sourceMaps = true;
      optimizer.commandExists = jest.fn().mockResolvedValue(true);
      
      await optimizer.minifyJavaScript('/tmp/dist/app.js');
      
      expect(spawn).toHaveBeenCalledWith('terser', expect.arrayContaining(['--source-map']));
    });

    it('should use terser module when command not available', async () => {
      optimizer.commandExists = jest.fn().mockResolvedValue(false);
      const terser = require('terser');
      
      await optimizer.minifyJavaScript('/tmp/dist/app.js');
      
      expect(terser.minify).toHaveBeenCalledWith(
        'file content',
        expect.objectContaining({
          compress: expect.objectContaining({
            drop_console: true,
            drop_debugger: true
          }),
          mangle: true,
          sourceMap: false
        })
      );
      expect(fs.writeFile).toHaveBeenCalledWith('/tmp/dist/app.js', 'minified code');
    });

    it('should fallback to uglifyjs when terser not available', async () => {
      optimizer.commandExists = jest.fn()
        .mockResolvedValueOnce(false) // terser
        .mockResolvedValueOnce(true); // uglifyjs
      
      await optimizer.minifyJavaScript('/tmp/dist/app.js');
      
      expect(spawn).toHaveBeenCalledWith('uglifyjs', expect.arrayContaining([
        '/tmp/dist/app.js',
        '-o', '/tmp/dist/app.js'
      ]));
    });
  });

  describe('minifyCSS', () => {
    it('should use cleancss command when available', async () => {
      optimizer.commandExists = jest.fn().mockResolvedValue(true);
      
      await optimizer.minifyCSS('/tmp/dist/styles.css');
      
      expect(spawn).toHaveBeenCalledWith('cleancss', [
        '-o', '/tmp/dist/styles.css',
        '/tmp/dist/styles.css'
      ]);
    });

    it('should use clean-css module when command not available', async () => {
      optimizer.commandExists = jest.fn().mockResolvedValue(false);
      const CleanCSS = require('clean-css');
      
      await optimizer.minifyCSS('/tmp/dist/styles.css');
      
      expect(fs.writeFile).toHaveBeenCalledWith('/tmp/dist/styles.css', 'minified css');
    });
  });

  describe('optimizeImages', () => {
    beforeEach(() => {
      optimizer.findFiles = jest.fn().mockResolvedValue([
        '/tmp/dist/logo.png',
        '/tmp/dist/banner.jpg',
        '/tmp/dist/icon.svg'
      ]);
      optimizer.optimizeImage = jest.fn().mockResolvedValue();
    });

    it('should optimize all image files', async () => {
      fs.stat
        .mockResolvedValueOnce({ size: 10000 })
        .mockResolvedValueOnce({ size: 8000 })
        .mockResolvedValueOnce({ size: 20000 })
        .mockResolvedValueOnce({ size: 15000 })
        .mockResolvedValueOnce({ size: 5000 })
        .mockResolvedValueOnce({ size: 4000 });
      
      await optimizer.optimizeImages();
      
      expect(optimizer.optimizeImage).toHaveBeenCalledTimes(3);
      expect(optimizer.stats.files).toBe(3);
      expect(optimizer.stats.originalSize).toBe(35000);
      expect(optimizer.stats.optimizedSize).toBe(27000);
    });

    it('should handle image optimization errors', async () => {
      optimizer.optimizeImage.mockRejectedValue(new Error('Optimize failed'));
      
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      await optimizer.optimizeImages();
      
      expect(optimizer.stats.errors).toHaveLength(3);
      consoleSpy.mockRestore();
    });
  });

  describe('image optimization methods', () => {
    beforeEach(() => {
      optimizer.commandExists = jest.fn().mockResolvedValue(true);
    });

    describe('optimizeJPEG', () => {
      it('should use jpegoptim when available', async () => {
        await optimizer.optimizeJPEG('/tmp/dist/photo.jpg');
        
        expect(spawn).toHaveBeenCalledWith('jpegoptim', [
          '--strip-all',
          '--max=85',
          '/tmp/dist/photo.jpg'
        ]);
      });

      it('should fallback to jpegtran', async () => {
        optimizer.commandExists
          .mockResolvedValueOnce(false) // jpegoptim
          .mockResolvedValueOnce(true); // jpegtran
        
        await optimizer.optimizeJPEG('/tmp/dist/photo.jpg');
        
        expect(spawn).toHaveBeenCalledWith('jpegtran', expect.arrayContaining([
          '-optimize',
          '-progressive'
        ]));
        expect(fs.rename).toHaveBeenCalled();
      });
    });

    describe('optimizePNG', () => {
      it('should use pngquant when available', async () => {
        await optimizer.optimizePNG('/tmp/dist/logo.png');
        
        expect(spawn).toHaveBeenCalledWith('pngquant', [
          '--force',
          '--ext', '.png',
          '--speed', '1',
          '/tmp/dist/logo.png'
        ]);
      });

      it('should fallback to optipng', async () => {
        optimizer.commandExists
          .mockResolvedValueOnce(false) // pngquant
          .mockResolvedValueOnce(true); // optipng
        
        await optimizer.optimizePNG('/tmp/dist/logo.png');
        
        expect(spawn).toHaveBeenCalledWith('optipng', expect.arrayContaining(['-o7']));
      });
    });

    describe('optimizeSVG', () => {
      it('should use svgo when available', async () => {
        await optimizer.optimizeSVG('/tmp/dist/icon.svg');
        
        expect(spawn).toHaveBeenCalledWith('svgo', [
          '/tmp/dist/icon.svg',
          '-o', '/tmp/dist/icon.svg'
        ]);
      });

      it('should use simple optimization when svgo not available', async () => {
        optimizer.commandExists.mockResolvedValue(false);
        fs.readFile.mockResolvedValue(`
          <!-- Comment -->
          <svg   width="100"   height="100">
            <rect  x="0"  y="0"  />
          </svg>
        `);
        
        await optimizer.optimizeSVG('/tmp/dist/icon.svg');
        
        const writeCall = fs.writeFile.mock.calls[0];
        expect(writeCall[1]).not.toContain('<!-- Comment -->');
        expect(writeCall[1]).toContain('><');
      });
    });
  });

  describe('compressAssets', () => {
    beforeEach(() => {
      optimizer.findFiles = jest.fn().mockResolvedValue([
        '/tmp/dist/app.js',
        '/tmp/dist/styles.css',
        '/tmp/dist/index.html'
      ]);
    });

    it('should compress files with gzip and brotli', async () => {
      await optimizer.compressAssets();
      
      expect(fs.writeFile).toHaveBeenCalledWith(
        '/tmp/dist/app.js.gz',
        expect.any(Buffer)
      );
      expect(fs.writeFile).toHaveBeenCalledWith(
        '/tmp/dist/app.js.br',
        expect.any(Buffer)
      );
    });

    it('should skip already compressed files', async () => {
      optimizer.findFiles.mockResolvedValue([
        '/tmp/dist/app.js',
        '/tmp/dist/app.js.gz',
        '/tmp/dist/app.js.br'
      ]);
      
      await optimizer.compressAssets();
      
      // Should only compress app.js, not the already compressed versions
      expect(fs.writeFile).toHaveBeenCalledTimes(2);
    });
  });

  describe('generateCacheManifest', () => {
    it('should generate cache manifest', async () => {
      optimizer.findFiles = jest.fn().mockResolvedValue([
        '/tmp/dist/app.js',
        '/tmp/dist/styles.css'
      ]);
      
      await optimizer.generateCacheManifest();
      
      expect(fs.writeFile).toHaveBeenCalledWith(
        '/tmp/dist/cache-manifest.json',
        expect.stringContaining('"version"')
      );
    });
  });

  describe('utility methods', () => {
    describe('findFiles', () => {
      it('should recursively find files with extensions', async () => {
        fs.readdir.mockImplementation((dir) => {
          if (dir === '/tmp/dist') {
            return Promise.resolve([
              { name: 'app.js', isDirectory: () => false },
              { name: 'styles.css', isDirectory: () => false },
              { name: 'subdir', isDirectory: () => true }
            ]);
          } else if (dir === '/tmp/dist/subdir') {
            return Promise.resolve([
              { name: 'module.js', isDirectory: () => false }
            ]);
          }
          return Promise.resolve([]);
        });
        
        const files = await optimizer.findFiles('/tmp/dist', ['.js', '.css']);
        
        expect(files).toContain('/tmp/dist/app.js');
        expect(files).toContain('/tmp/dist/styles.css');
        expect(files).toContain('/tmp/dist/subdir/module.js');
      });
    });

    describe('formatBytes', () => {
      it('should format bytes correctly', () => {
        expect(optimizer.formatBytes(0)).toBe('0 B');
        expect(optimizer.formatBytes(1024)).toBe('1.00 KB');
        expect(optimizer.formatBytes(1048576)).toBe('1.00 MB');
        expect(optimizer.formatBytes(1073741824)).toBe('1.00 GB');
      });
    });

    describe('commandExists', () => {
      it('should check if command exists', async () => {
        spawn.mockReturnValue(createMockProcess(0));
        
        const exists = await optimizer.commandExists('terser');
        expect(exists).toBe(true);
      });

      it('should return false when command not found', async () => {
        spawn.mockReturnValue(createMockProcess(1));
        
        const exists = await optimizer.commandExists('nonexistent');
        expect(exists).toBe(false);
      });
    });
  });

  describe('CLI execution', () => {
    it('should handle CLI arguments', () => {
      const originalArgv = process.argv;
      process.argv = ['node', 'asset-optimize.js', '--target', 'production', '--verbose'];
      
      jest.isolateModules(() => {
        require('../../../../scripts/build/asset-optimize');
      });
      
      process.argv = originalArgv;
    });
  });
});