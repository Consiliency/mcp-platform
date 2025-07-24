/**
 * Integration tests for full build process
 * @module tests/integration/build/full-build.test
 */

const BuildOrchestrator = require('../../../scripts/build/build');
const PackageBuilder = require('../../../scripts/build/package');
const VersionManager = require('../../../scripts/build/version-bump');
const AssetOptimizer = require('../../../scripts/build/asset-optimize');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);

describe('Full Build Process Integration', () => {
  let tempDir;
  let originalCwd;

  beforeAll(async () => {
    // Create temporary directory for test
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'build-test-'));
    originalCwd = process.cwd();
    
    // Set up test project structure
    await setupTestProject(tempDir);
  });

  afterAll(async () => {
    // Clean up
    process.chdir(originalCwd);
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function setupTestProject(dir) {
    process.chdir(dir);
    
    // Create basic project structure
    await fs.mkdir(path.join(dir, 'src'), { recursive: true });
    await fs.mkdir(path.join(dir, 'scripts/build'), { recursive: true });
    await fs.mkdir(path.join(dir, 'tests'), { recursive: true });
    
    // Create package.json
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
      name: 'test-project',
      version: '1.0.0',
      scripts: {
        build: 'echo "Building..."',
        'build:frontend': 'echo "Building frontend..."',
        'build:frontend:dev': 'echo "Building frontend dev..."',
        'build:api': 'echo "Building API..."',
        'build:worker': 'echo "Building worker..."',
        'build:sdk': 'echo "Building SDK..."',
        'test:unit': 'echo "Running tests..."'
      },
      dependencies: {},
      devDependencies: {}
    }, null, 2));
    
    // Create package-lock.json
    await fs.writeFile(path.join(dir, 'package-lock.json'), JSON.stringify({
      name: 'test-project',
      version: '1.0.0',
      lockfileVersion: 2,
      packages: {
        '': {
          name: 'test-project',
          version: '1.0.0'
        }
      }
    }, null, 2));
    
    // Create sample source files
    await fs.writeFile(path.join(dir, 'src/app.js'), `
      // Sample application code
      function main() {
        console.log('Hello World');
        return 42;
      }
      
      module.exports = { main };
    `);
    
    await fs.writeFile(path.join(dir, 'src/styles.css'), `
      /* Sample styles */
      body {
        margin: 0;
        padding: 0;
        font-family: Arial, sans-serif;
      }
      
      .container {
        max-width: 1200px;
        margin: 0 auto;
        padding: 20px;
      }
    `);
    
    // Create test files
    await fs.writeFile(path.join(dir, 'tests/app.test.js'), `
      const { main } = require('../src/app');
      
      test('main returns 42', () => {
        expect(main()).toBe(42);
      });
    `);
    
    // Initialize git repo
    await exec('git init');
    await exec('git config user.name "Test User"');
    await exec('git config user.email "test@example.com"');
    await exec('git add .');
    await exec('git commit -m "Initial commit"');
  }

  describe('Build Orchestration', () => {
    it('should complete a full development build', async () => {
      const orchestrator = new BuildOrchestrator({
        target: 'development',
        outputDir: path.join(tempDir, 'dist-dev'),
        skipTests: true,
        skipOptimization: true,
        verbose: true
      });
      
      const result = await orchestrator.build();
      
      expect(result).toHaveProperty('version', '1.0.0');
      expect(result).toHaveProperty('target', 'development');
      expect(result).toHaveProperty('status', 'success');
      expect(result.components).toHaveProperty('frontend');
      expect(result.components).toHaveProperty('api');
      
      // Check output directory exists
      const outputExists = await fs.access(path.join(tempDir, 'dist-dev'))
        .then(() => true)
        .catch(() => false);
      expect(outputExists).toBe(true);
    }, 30000); // 30 second timeout

    it('should complete a full production build', async () => {
      const orchestrator = new BuildOrchestrator({
        target: 'production',
        outputDir: path.join(tempDir, 'dist-prod'),
        skipTests: true,
        verbose: false
      });
      
      const result = await orchestrator.build();
      
      expect(result).toHaveProperty('status', 'success');
      expect(result.artifacts).toBeInstanceOf(Array);
      expect(result.artifacts.length).toBeGreaterThan(0);
    }, 30000);

    it('should handle parallel builds', async () => {
      const orchestrator = new BuildOrchestrator({
        outputDir: path.join(tempDir, 'dist-parallel'),
        parallel: true,
        skipTests: true,
        skipOptimization: true
      });
      
      const startTime = Date.now();
      const result = await orchestrator.build();
      const duration = Date.now() - startTime;
      
      expect(result).toHaveProperty('status', 'success');
      // Parallel builds should be faster
      expect(duration).toBeLessThan(20000);
    }, 30000);

    it('should generate build reports', async () => {
      const outputDir = path.join(tempDir, 'dist-reports');
      const orchestrator = new BuildOrchestrator({
        outputDir,
        skipTests: true,
        skipOptimization: true
      });
      
      await orchestrator.build();
      
      // Check for generated reports
      const reportFiles = [
        'build-info.json',
        'build-report.json',
        'build-report.html'
      ];
      
      for (const file of reportFiles) {
        const exists = await fs.access(path.join(outputDir, file))
          .then(() => true)
          .catch(() => false);
        expect(exists).toBe(true);
      }
    }, 30000);
  });

  describe('Version Management', () => {
    beforeEach(async () => {
      // Reset version to 1.0.0
      const packageJson = JSON.parse(await fs.readFile('package.json', 'utf8'));
      packageJson.version = '1.0.0';
      await fs.writeFile('package.json', JSON.stringify(packageJson, null, 2));
      
      // Commit the change
      await exec('git add package.json');
      await exec('git commit -m "Reset version" || true');
    });

    it('should bump patch version', async () => {
      const versionManager = new VersionManager({
        type: 'patch',
        commit: true,
        tag: true,
        dryRun: false
      });
      
      const result = await versionManager.bump();
      
      expect(result.current).toBe('1.0.0');
      expect(result.new).toBe('1.0.1');
      expect(result.committed).toBe(true);
      expect(result.tagged).toBe(true);
      
      // Verify file was updated
      const packageJson = JSON.parse(await fs.readFile('package.json', 'utf8'));
      expect(packageJson.version).toBe('1.0.1');
      
      // Verify git operations
      const { stdout: tags } = await exec('git tag');
      expect(tags).toContain('v1.0.1');
    });

    it('should bump minor version', async () => {
      const versionManager = new VersionManager({
        type: 'minor',
        commit: false,
        tag: false
      });
      
      const result = await versionManager.bump();
      
      expect(result.new).toBe('1.1.0');
      expect(result.files.length).toBeGreaterThan(0);
    });

    it('should handle prerelease versions', async () => {
      const versionManager = new VersionManager({
        type: 'prerelease',
        preid: 'beta',
        commit: false
      });
      
      const result = await versionManager.bump();
      
      expect(result.new).toMatch(/1\.0\.1-beta\.\d+/);
    });
  });

  describe('Asset Optimization', () => {
    beforeEach(async () => {
      // Create assets to optimize
      const assetsDir = path.join(tempDir, 'assets');
      await fs.mkdir(assetsDir, { recursive: true });
      
      // Create larger JS file
      await fs.writeFile(path.join(assetsDir, 'large.js'), `
        // Large JavaScript file with comments
        function calculateComplexValue(input) {
          console.log('Calculating...', input);
          // This is a comment that should be removed
          const result = input * 2 + 10;
          console.log('Result:', result);
          return result;
        }
        
        // Another comment
        const data = {
          key1: 'value1',
          key2: 'value2',
          key3: 'value3'
        };
        
        module.exports = { calculateComplexValue, data };
      `);
      
      // Create CSS file
      await fs.writeFile(path.join(assetsDir, 'styles.css'), `
        /* Main styles */
        body {
          margin: 0;
          padding: 0;
          background-color: #ffffff;
        }
        
        /* Container styles */
        .container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px 30px;
        }
        
        /* Header styles */
        .header {
          background-color: #333333;
          color: #ffffff;
          padding: 10px 20px;
        }
      `);
    });

    it('should optimize assets', async () => {
      const assetsDir = path.join(tempDir, 'assets');
      const optimizer = new AssetOptimizer({
        inputDir: assetsDir,
        minify: true,
        compress: true,
        images: false,
        cache: false
      });
      
      const stats = await optimizer.optimize();
      
      expect(stats.files).toBeGreaterThan(0);
      expect(stats.savings).toBeGreaterThan(0);
      expect(stats.optimizedSize).toBeLessThan(stats.originalSize);
      
      // Check if files were actually minified
      const jsContent = await fs.readFile(path.join(assetsDir, 'large.js'), 'utf8');
      expect(jsContent).not.toContain('// Large JavaScript file');
      
      const cssContent = await fs.readFile(path.join(assetsDir, 'styles.css'), 'utf8');
      expect(cssContent).not.toContain('/* Main styles */');
    });

    it('should generate compression files', async () => {
      const assetsDir = path.join(tempDir, 'assets');
      const optimizer = new AssetOptimizer({
        inputDir: assetsDir,
        minify: false,
        compress: true,
        images: false
      });
      
      await optimizer.optimize();
      
      // Check for compressed files
      const gzExists = await fs.access(path.join(assetsDir, 'large.js.gz'))
        .then(() => true)
        .catch(() => false);
      const brExists = await fs.access(path.join(assetsDir, 'large.js.br'))
        .then(() => true)
        .catch(() => false);
      
      expect(gzExists).toBe(true);
      expect(brExists).toBe(true);
    });
  });

  describe('Package Creation', () => {
    beforeEach(async () => {
      // Create dist directory with content
      const distDir = path.join(tempDir, 'dist');
      await fs.mkdir(distDir, { recursive: true });
      
      await fs.writeFile(path.join(distDir, 'app.js'), 'console.log("app");');
      await fs.writeFile(path.join(distDir, 'index.html'), '<html></html>');
      await fs.writeFile(path.join(distDir, 'README.md'), '# Test App');
    });

    it('should create tar.gz package', async () => {
      const packageBuilder = new PackageBuilder({
        inputDir: path.join(tempDir, 'dist'),
        outputDir: path.join(tempDir, 'packages'),
        formats: ['tar.gz'],
        version: '1.0.0',
        sign: false
      });
      
      const artifacts = await packageBuilder.package();
      
      expect(artifacts).toHaveLength(1);
      expect(artifacts[0].format).toBe('tar.gz');
      expect(artifacts[0].name).toContain('1.0.0');
      
      // Verify package exists
      const packageExists = await fs.access(artifacts[0].path)
        .then(() => true)
        .catch(() => false);
      expect(packageExists).toBe(true);
    });

    it('should create multiple package formats', async () => {
      const packageBuilder = new PackageBuilder({
        inputDir: path.join(tempDir, 'dist'),
        outputDir: path.join(tempDir, 'packages-multi'),
        formats: ['tar.gz', 'zip'],
        version: '1.0.0',
        sign: false
      });
      
      const artifacts = await packageBuilder.package();
      
      expect(artifacts).toHaveLength(2);
      expect(artifacts.map(a => a.format)).toContain('tar.gz');
      expect(artifacts.map(a => a.format)).toContain('zip');
    });

    it('should generate checksums', async () => {
      const outputDir = path.join(tempDir, 'packages-checksum');
      const packageBuilder = new PackageBuilder({
        inputDir: path.join(tempDir, 'dist'),
        outputDir,
        formats: ['tar.gz'],
        sign: false
      });
      
      await packageBuilder.package();
      
      // Check for checksum files
      const checksumFiles = ['checksums.txt', 'checksums.json'];
      for (const file of checksumFiles) {
        const exists = await fs.access(path.join(outputDir, file))
          .then(() => true)
          .catch(() => false);
        expect(exists).toBe(true);
      }
    });
  });

  describe('End-to-End Build Pipeline', () => {
    it('should complete full build pipeline', async () => {
      // 1. Version bump
      const versionManager = new VersionManager({
        type: 'patch',
        commit: true,
        tag: false
      });
      const versionResult = await versionManager.bump();
      expect(versionResult.new).toBe('1.0.1');
      
      // 2. Build
      const outputDir = path.join(tempDir, 'dist-e2e');
      const orchestrator = new BuildOrchestrator({
        outputDir,
        skipTests: true,
        skipOptimization: false
      });
      const buildResult = await orchestrator.build();
      expect(buildResult.status).toBe('success');
      
      // 3. Package
      const packageBuilder = new PackageBuilder({
        inputDir: outputDir,
        outputDir: path.join(tempDir, 'releases'),
        formats: ['tar.gz'],
        version: versionResult.new,
        sign: false
      });
      const artifacts = await packageBuilder.package();
      expect(artifacts.length).toBeGreaterThan(0);
      
      // Verify final artifact
      const artifact = artifacts[0];
      expect(artifact.name).toContain('1.0.1');
      const artifactExists = await fs.access(artifact.path)
        .then(() => true)
        .catch(() => false);
      expect(artifactExists).toBe(true);
    }, 60000); // 60 second timeout for full pipeline
  });

  describe('Error Handling', () => {
    it('should handle missing dependencies gracefully', async () => {
      // Remove package.json
      await fs.rename('package.json', 'package.json.bak');
      
      const orchestrator = new BuildOrchestrator({
        outputDir: path.join(tempDir, 'dist-error'),
        skipTests: true
      });
      
      await expect(orchestrator.build()).rejects.toThrow();
      
      // Restore package.json
      await fs.rename('package.json.bak', 'package.json');
    });

    it('should handle build failures gracefully', async () => {
      // Create a package.json with failing script
      const packageJson = JSON.parse(await fs.readFile('package.json', 'utf8'));
      packageJson.scripts['build:frontend'] = 'exit 1';
      await fs.writeFile('package.json', JSON.stringify(packageJson, null, 2));
      
      const orchestrator = new BuildOrchestrator({
        outputDir: path.join(tempDir, 'dist-fail'),
        skipTests: true,
        skipOptimization: true
      });
      
      await expect(orchestrator.build()).rejects.toThrow();
    });
  });
});