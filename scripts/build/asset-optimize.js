#!/usr/bin/env node

/**
 * Asset Optimization Script
 * Optimizes build assets for production deployment
 * 
 * @module scripts/build/asset-optimize
 * @assigned-to CI/CD Team
 */

const path = require('path');
const fs = require('fs').promises;
const { spawn } = require('child_process');
const crypto = require('crypto');
const zlib = require('zlib');
const { promisify } = require('util');

const gzip = promisify(zlib.gzip);
const brotli = promisify(zlib.brotliCompress);

class AssetOptimizer {
  constructor(options = {}) {
    this.options = {
      inputDir: options.inputDir || path.join(__dirname, '../../dist'),
      target: options.target || 'production',
      minify: options.minify !== false,
      compress: options.compress !== false,
      images: options.images !== false,
      cache: options.cache !== false,
      sourceMaps: options.sourceMaps || false,
      verbose: options.verbose || false,
      ...options
    };
    
    this.stats = {
      files: 0,
      originalSize: 0,
      optimizedSize: 0,
      savings: 0,
      errors: []
    };
  }

  // Main optimization method
  async optimize() {
    console.log(`🚀 Optimizing assets for ${this.options.target}...`);
    
    try {
      const startTime = Date.now();
      
      await this.validateInput();
      
      // Run optimizations
      if (this.options.minify) {
        await this.minifyAssets();
      }
      
      if (this.options.images) {
        await this.optimizeImages();
      }
      
      if (this.options.compress) {
        await this.compressAssets();
      }
      
      if (this.options.cache) {
        await this.generateCacheManifest();
      }
      
      await this.generateReport();
      
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      const savingsPercent = ((this.stats.savings / this.stats.originalSize) * 100).toFixed(2);
      
      console.log(`\n✅ Optimization complete!`);
      console.log(`   Files: ${this.stats.files}`);
      console.log(`   Original: ${this.formatBytes(this.stats.originalSize)}`);
      console.log(`   Optimized: ${this.formatBytes(this.stats.optimizedSize)}`);
      console.log(`   Savings: ${this.formatBytes(this.stats.savings)} (${savingsPercent}%)`);
      console.log(`   Duration: ${duration}s`);
      
      if (this.stats.errors.length > 0) {
        console.warn(`\n⚠️  ${this.stats.errors.length} errors occurred during optimization`);
      }
      
      return this.stats;
    } catch (error) {
      console.error('❌ Optimization failed:', error);
      throw error;
    }
  }

  async validateInput() {
    try {
      await fs.access(this.options.inputDir);
    } catch {
      throw new Error(`Input directory not found: ${this.options.inputDir}`);
    }
  }

  // Minify JavaScript and CSS files
  async minifyAssets() {
    console.log('\n  Minifying JavaScript and CSS...');
    
    const files = await this.findFiles(this.options.inputDir, ['.js', '.css']);
    
    for (const file of files) {
      // Skip already minified files
      if (file.includes('.min.')) continue;
      
      try {
        const originalSize = (await fs.stat(file)).size;
        this.stats.originalSize += originalSize;
        
        if (file.endsWith('.js')) {
          await this.minifyJavaScript(file);
        } else if (file.endsWith('.css')) {
          await this.minifyCSS(file);
        }
        
        const optimizedSize = (await fs.stat(file)).size;
        this.stats.optimizedSize += optimizedSize;
        this.stats.files++;
        
        if (this.options.verbose) {
          const savings = originalSize - optimizedSize;
          const percent = ((savings / originalSize) * 100).toFixed(1);
          console.log(`    ✓ ${path.basename(file)} - saved ${this.formatBytes(savings)} (${percent}%)`);
        }
      } catch (error) {
        this.stats.errors.push({ file, error: error.message });
        console.warn(`    ⚠️  Failed to minify ${path.basename(file)}: ${error.message}`);
      }
    }
  }

  async minifyJavaScript(filePath) {
    // Check if terser is available
    if (!await this.commandExists('terser')) {
      // Fallback to uglify-js
      if (await this.commandExists('uglifyjs')) {
        await this.runCommand('uglifyjs', [
          filePath,
          '-o', filePath,
          '-c', 'drop_console=true',
          '-m',
          this.options.sourceMaps ? '--source-map' : ''
        ].filter(Boolean));
      } else {
        // Use Node.js API if available
        try {
          const terser = require('terser');
          const content = await fs.readFile(filePath, 'utf8');
          const result = await terser.minify(content, {
            compress: {
              drop_console: this.options.target === 'production',
              drop_debugger: true,
              pure_funcs: ['console.log', 'console.info', 'console.debug']
            },
            mangle: true,
            sourceMap: this.options.sourceMaps
          });
          
          if (result.error) throw result.error;
          
          await fs.writeFile(filePath, result.code);
          if (result.map && this.options.sourceMaps) {
            await fs.writeFile(filePath + '.map', result.map);
          }
        } catch {
          // Skip if terser not available
        }
      }
    } else {
      const args = [
        filePath,
        '-o', filePath,
        '-c', 'drop_console=true,drop_debugger=true',
        '-m'
      ];
      
      if (this.options.sourceMaps) {
        args.push('--source-map');
      }
      
      await this.runCommand('terser', args);
    }
  }

  async minifyCSS(filePath) {
    // Check if cssnano/clean-css is available
    if (await this.commandExists('cleancss')) {
      await this.runCommand('cleancss', [
        '-o', filePath,
        filePath
      ]);
    } else {
      // Use Node.js API if available
      try {
        const CleanCSS = require('clean-css');
        const content = await fs.readFile(filePath, 'utf8');
        const result = new CleanCSS({
          level: 2,
          sourceMap: this.options.sourceMaps
        }).minify(content);
        
        if (result.errors.length > 0) {
          throw new Error(result.errors.join(', '));
        }
        
        await fs.writeFile(filePath, result.styles);
        if (result.sourceMap && this.options.sourceMaps) {
          await fs.writeFile(filePath + '.map', result.sourceMap.toString());
        }
      } catch {
        // Skip if clean-css not available
      }
    }
  }

  // Optimize images
  async optimizeImages() {
    console.log('\n  Optimizing images...');
    
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp'];
    const files = await this.findFiles(this.options.inputDir, imageExtensions);
    
    for (const file of files) {
      try {
        const originalSize = (await fs.stat(file)).size;
        this.stats.originalSize += originalSize;
        
        await this.optimizeImage(file);
        
        const optimizedSize = (await fs.stat(file)).size;
        this.stats.optimizedSize += optimizedSize;
        this.stats.files++;
        
        if (this.options.verbose) {
          const savings = originalSize - optimizedSize;
          const percent = ((savings / originalSize) * 100).toFixed(1);
          console.log(`    ✓ ${path.basename(file)} - saved ${this.formatBytes(savings)} (${percent}%)`);
        }
      } catch (error) {
        this.stats.errors.push({ file, error: error.message });
        console.warn(`    ⚠️  Failed to optimize ${path.basename(file)}: ${error.message}`);
      }
    }
  }

  async optimizeImage(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    
    switch (ext) {
      case '.jpg':
      case '.jpeg':
        await this.optimizeJPEG(filePath);
        break;
      case '.png':
        await this.optimizePNG(filePath);
        break;
      case '.svg':
        await this.optimizeSVG(filePath);
        break;
      case '.gif':
        await this.optimizeGIF(filePath);
        break;
      case '.webp':
        await this.optimizeWebP(filePath);
        break;
    }
  }

  async optimizeJPEG(filePath) {
    if (await this.commandExists('jpegoptim')) {
      await this.runCommand('jpegoptim', [
        '--strip-all',
        '--max=85',
        filePath
      ]);
    } else if (await this.commandExists('jpegtran')) {
      const tempFile = filePath + '.tmp';
      await this.runCommand('jpegtran', [
        '-copy', 'none',
        '-optimize',
        '-progressive',
        '-outfile', tempFile,
        filePath
      ]);
      await fs.rename(tempFile, filePath);
    }
  }

  async optimizePNG(filePath) {
    if (await this.commandExists('pngquant')) {
      await this.runCommand('pngquant', [
        '--force',
        '--ext', '.png',
        '--speed', '1',
        filePath
      ]);
    } else if (await this.commandExists('optipng')) {
      await this.runCommand('optipng', [
        '-o7',
        '-strip', 'all',
        filePath
      ]);
    }
  }

  async optimizeSVG(filePath) {
    if (await this.commandExists('svgo')) {
      await this.runCommand('svgo', [
        filePath,
        '-o', filePath
      ]);
    } else {
      // Simple SVG optimization
      const content = await fs.readFile(filePath, 'utf8');
      const optimized = content
        .replace(/<!--[\s\S]*?-->/g, '') // Remove comments
        .replace(/\s+/g, ' ') // Collapse whitespace
        .replace(/> </g, '><') // Remove whitespace between tags
        .trim();
      
      if (optimized.length < content.length) {
        await fs.writeFile(filePath, optimized);
      }
    }
  }

  async optimizeGIF(filePath) {
    if (await this.commandExists('gifsicle')) {
      const tempFile = filePath + '.tmp';
      await this.runCommand('gifsicle', [
        '-O3',
        '--colors', '256',
        filePath,
        '-o', tempFile
      ]);
      await fs.rename(tempFile, filePath);
    }
  }

  async optimizeWebP(filePath) {
    if (await this.commandExists('cwebp')) {
      const tempFile = filePath + '.tmp';
      await this.runCommand('cwebp', [
        '-q', '80',
        '-m', '6',
        filePath,
        '-o', tempFile
      ]);
      await fs.rename(tempFile, filePath);
    }
  }

  // Compress assets
  async compressAssets() {
    console.log('\n  Compressing assets...');
    
    const compressibleExtensions = ['.js', '.css', '.html', '.json', '.xml', '.svg', '.txt'];
    const files = await this.findFiles(this.options.inputDir, compressibleExtensions);
    
    for (const file of files) {
      // Skip already compressed files
      if (file.endsWith('.gz') || file.endsWith('.br')) continue;
      
      try {
        const content = await fs.readFile(file);
        const originalSize = content.length;
        
        // Create gzip version
        if (this.options.compress === true || this.options.compress === 'gzip') {
          const gzipped = await gzip(content, { level: 9 });
          await fs.writeFile(file + '.gz', gzipped);
          
          if (this.options.verbose) {
            const percent = ((1 - gzipped.length / originalSize) * 100).toFixed(1);
            console.log(`    ✓ ${path.basename(file)}.gz - ${percent}% compression`);
          }
        }
        
        // Create brotli version
        if (this.options.compress === true || this.options.compress === 'brotli') {
          const brotlied = await brotli(content, {
            params: {
              [zlib.constants.BROTLI_PARAM_QUALITY]: 11
            }
          });
          await fs.writeFile(file + '.br', brotlied);
          
          if (this.options.verbose) {
            const percent = ((1 - brotlied.length / originalSize) * 100).toFixed(1);
            console.log(`    ✓ ${path.basename(file)}.br - ${percent}% compression`);
          }
        }
      } catch (error) {
        this.stats.errors.push({ file, error: error.message });
        console.warn(`    ⚠️  Failed to compress ${path.basename(file)}: ${error.message}`);
      }
    }
  }

  // Generate cache manifest
  async generateCacheManifest() {
    console.log('\n  Generating cache manifest...');
    
    const manifest = {
      version: Date.now(),
      files: {},
      routes: []
    };
    
    const files = await this.getAllFiles(this.options.inputDir);
    
    for (const file of files) {
      const relativePath = path.relative(this.options.inputDir, file);
      const content = await fs.readFile(file);
      const hash = crypto.createHash('sha256').update(content).digest('hex').substring(0, 8);
      
      manifest.files[relativePath] = {
        size: content.length,
        hash,
        mtime: (await fs.stat(file)).mtime.toISOString()
      };
      
      // Add cache-busted filename
      const ext = path.extname(file);
      const base = path.basename(file, ext);
      const dir = path.dirname(file);
      const hashedFilename = `${base}.${hash}${ext}`;
      
      // Create symlink with hashed filename
      try {
        await fs.symlink(
          path.basename(file),
          path.join(dir, hashedFilename)
        );
      } catch {
        // Symlink might already exist
      }
    }
    
    // Write manifest
    await fs.writeFile(
      path.join(this.options.inputDir, 'cache-manifest.json'),
      JSON.stringify(manifest, null, 2)
    );
    
    console.log(`    ✓ Generated cache manifest with ${Object.keys(manifest.files).length} files`);
  }

  // Generate optimization report
  async generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      target: this.options.target,
      stats: this.stats,
      options: this.options,
      errors: this.stats.errors
    };
    
    await fs.writeFile(
      path.join(this.options.inputDir, 'optimization-report.json'),
      JSON.stringify(report, null, 2)
    );
    
    // Update stats with final calculations
    this.stats.savings = this.stats.originalSize - this.stats.optimizedSize;
  }

  // Utility methods
  async findFiles(dir, extensions) {
    const files = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        files.push(...await this.findFiles(fullPath, extensions));
      } else if (extensions.some(ext => entry.name.endsWith(ext))) {
        files.push(fullPath);
      }
    }
    
    return files;
  }

  async getAllFiles(dir) {
    const files = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...await this.getAllFiles(fullPath));
      } else {
        files.push(fullPath);
      }
    }
    
    return files;
  }

  async runCommand(command, args, options = {}) {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, {
        stdio: options.silent ? 'pipe' : 'inherit'
      });
      
      let stdout = '';
      let stderr = '';
      
      if (options.silent) {
        proc.stdout.on('data', (data) => { stdout += data; });
        proc.stderr.on('data', (data) => { stderr += data; });
      }
      
      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`${command} exited with code ${code}\n${stderr}`));
        } else {
          resolve(stdout);
        }
      });
    });
  }

  async commandExists(command) {
    try {
      await this.runCommand('which', [command], { silent: true });
      return true;
    } catch {
      return false;
    }
  }

  formatBytes(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }
}

// Export for use in build script
module.exports = {
  optimize: async (options) => {
    const optimizer = new AssetOptimizer(options);
    return await optimizer.optimize();
  },
  AssetOptimizer
};

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {
    inputDir: args.find(a => a.startsWith('--input='))?.split('=')[1],
    target: args.find(a => a.startsWith('--target='))?.split('=')[1],
    minify: !args.includes('--no-minify'),
    compress: args.includes('--compress') || args.includes('--gzip') || args.includes('--brotli'),
    images: !args.includes('--no-images'),
    cache: args.includes('--cache'),
    sourceMaps: args.includes('--source-maps'),
    verbose: args.includes('--verbose') || args.includes('-v')
  };
  
  const optimizer = new AssetOptimizer(options);
  optimizer.optimize().catch(console.error);
}