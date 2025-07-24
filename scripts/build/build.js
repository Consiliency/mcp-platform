#!/usr/bin/env node

/**
 * Main Build Script
 * Orchestrates the complete build pipeline for all components
 * 
 * @module scripts/build/build
 * @assigned-to CI/CD Team
 */

const path = require('path');
const fs = require('fs').promises;
const { spawn } = require('child_process');
const crypto = require('crypto');

class BuildOrchestrator {
  constructor(options = {}) {
    this.options = {
      target: options.target || 'production',
      platform: options.platform || process.platform,
      arch: options.arch || process.arch,
      outputDir: options.outputDir || path.join(__dirname, '../../dist'),
      cacheDir: options.cacheDir || path.join(__dirname, '../../.build-cache'),
      parallel: options.parallel !== false,
      verbose: options.verbose || false,
      skipTests: options.skipTests || false,
      skipOptimization: options.skipOptimization || false,
      ...options
    };
    
    this.startTime = Date.now();
    this.buildManifest = {
      version: require('../../package.json').version,
      target: this.options.target,
      platform: this.options.platform,
      arch: this.options.arch,
      timestamp: new Date().toISOString(),
      components: {},
      artifacts: []
    };
  }

  // Main build method
  async build() {
    console.log(`🏗️  Starting ${this.options.target} build for ${this.options.platform}-${this.options.arch}...`);
    
    try {
      await this.validateEnvironment();
      await this.clean();
      await this.installDependencies();
      await this.preBuild();
      await this.buildComponents();
      await this.postBuild();
      await this.packageArtifacts();
      await this.generateReport();
      
      const duration = ((Date.now() - this.startTime) / 1000).toFixed(2);
      console.log(`✅ Build completed successfully in ${duration}s!`);
      
      return this.buildManifest;
    } catch (error) {
      console.error('❌ Build failed:', error.message);
      await this.generateErrorReport(error);
      process.exit(1);
    }
  }

  // Validate build environment
  async validateEnvironment() {
    console.log('🔍 Validating environment...');
    
    const checks = [
      this.checkNodeVersion(),
      this.checkNpmVersion(),
      this.checkDiskSpace(),
      this.checkRequiredTools()
    ];
    
    const results = await Promise.all(checks);
    const failed = results.filter(r => !r.success);
    
    if (failed.length > 0) {
      throw new Error(`Environment validation failed:\n${failed.map(f => `  - ${f.error}`).join('\n')}`);
    }
    
    console.log('✓ Environment validation passed');
  }

  async checkNodeVersion() {
    const requiredVersion = '18.0.0';
    const currentVersion = process.version.substring(1);
    
    if (this.compareVersions(currentVersion, requiredVersion) < 0) {
      return { success: false, error: `Node.js ${requiredVersion} or higher required (found ${currentVersion})` };
    }
    
    return { success: true };
  }

  async checkNpmVersion() {
    return new Promise((resolve) => {
      const npm = spawn('npm', ['--version']);
      let version = '';
      
      npm.stdout.on('data', (data) => {
        version += data.toString().trim();
      });
      
      npm.on('close', (code) => {
        if (code !== 0) {
          resolve({ success: false, error: 'npm not found' });
        } else {
          resolve({ success: true, version });
        }
      });
    });
  }

  async checkDiskSpace() {
    // Require at least 1GB free space
    const requiredSpace = 1024 * 1024 * 1024;
    
    try {
      const stats = await fs.statfs(this.options.outputDir).catch(() => fs.statfs('.'));
      const freeSpace = stats.bavail * stats.bsize;
      
      if (freeSpace < requiredSpace) {
        return { success: false, error: `Insufficient disk space (${(freeSpace / 1024 / 1024).toFixed(0)}MB free, 1GB required)` };
      }
      
      return { success: true };
    } catch (error) {
      // Non-critical, continue build
      return { success: true };
    }
  }

  async checkRequiredTools() {
    const tools = ['git', 'python3', 'go'];
    const missing = [];
    
    for (const tool of tools) {
      const exists = await this.commandExists(tool);
      if (!exists) {
        missing.push(tool);
      }
    }
    
    if (missing.length > 0) {
      return { success: false, error: `Missing required tools: ${missing.join(', ')}` };
    }
    
    return { success: true };
  }

  // Clean previous builds
  async clean() {
    console.log('🧹 Cleaning previous builds...');
    
    const dirs = [
      this.options.outputDir,
      path.join(__dirname, '../../coverage'),
      path.join(__dirname, '../../.next'),
      path.join(__dirname, '../../build')
    ];
    
    for (const dir of dirs) {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
    
    await fs.mkdir(this.options.outputDir, { recursive: true });
    await fs.mkdir(this.options.cacheDir, { recursive: true });
    
    console.log('✓ Clean completed');
  }

  // Install dependencies
  async installDependencies() {
    console.log('📦 Installing dependencies...');
    
    const cacheKey = await this.getDependencyCacheKey();
    const cached = await this.checkCache('dependencies', cacheKey);
    
    if (cached && !this.options.skipCache) {
      console.log('✓ Dependencies restored from cache');
      return;
    }
    
    await this.runCommand('npm', ['ci', '--no-audit', '--prefer-offline']);
    
    // Install Python dependencies if requirements.txt exists
    if (await this.fileExists('requirements.txt')) {
      await this.runCommand('pip', ['install', '-r', 'requirements.txt']);
    }
    
    // Install Go dependencies if go.mod exists
    if (await this.fileExists('go.mod')) {
      await this.runCommand('go', ['mod', 'download']);
    }
    
    await this.saveCache('dependencies', cacheKey);
    console.log('✓ Dependencies installed');
  }

  // Pre-build tasks
  async preBuild() {
    console.log('🔧 Running pre-build tasks...');
    
    // Generate build info
    await this.generateBuildInfo();
    
    // Run linting if not skipped
    if (!this.options.skipLint) {
      await this.runLinters();
    }
    
    // Run tests if not skipped
    if (!this.options.skipTests) {
      await this.runTests();
    }
    
    console.log('✓ Pre-build tasks completed');
  }

  async generateBuildInfo() {
    const buildInfo = {
      version: this.buildManifest.version,
      commit: await this.getGitCommit(),
      branch: await this.getGitBranch(),
      timestamp: this.buildManifest.timestamp,
      target: this.options.target,
      platform: this.options.platform,
      arch: this.options.arch
    };
    
    await fs.writeFile(
      path.join(this.options.outputDir, 'build-info.json'),
      JSON.stringify(buildInfo, null, 2)
    );
    
    this.buildManifest.buildInfo = buildInfo;
  }

  async runLinters() {
    console.log('  Running linters...');
    
    const linters = [
      { name: 'ESLint', command: 'npm', args: ['run', 'lint:js'] },
      { name: 'TypeScript', command: 'npm', args: ['run', 'typecheck'] },
      { name: 'Python', command: 'flake8', args: ['.'] },
      { name: 'Go', command: 'golangci-lint', args: ['run'] }
    ];
    
    const results = await Promise.allSettled(
      linters.map(linter => this.runLinter(linter))
    );
    
    const failed = results.filter(r => r.status === 'rejected');
    if (failed.length > 0 && this.options.target === 'production') {
      throw new Error('Linting failed');
    }
  }

  async runLinter({ name, command, args }) {
    try {
      await this.runCommand(command, args, { silent: !this.options.verbose });
      console.log(`    ✓ ${name}`);
    } catch (error) {
      console.log(`    ✗ ${name}: ${error.message}`);
      throw error;
    }
  }

  async runTests() {
    console.log('  Running tests...');
    
    try {
      await this.runCommand('npm', ['run', 'test:unit'], { silent: !this.options.verbose });
      console.log('    ✓ Unit tests passed');
    } catch (error) {
      if (this.options.target === 'production') {
        throw new Error('Unit tests failed');
      }
      console.log('    ⚠️  Unit tests failed (continuing in development mode)');
    }
  }

  // Build components
  async buildComponents() {
    console.log('🏗️  Building components...');
    
    const components = [
      { name: 'frontend', builder: this.buildFrontend.bind(this) },
      { name: 'api', builder: this.buildAPI.bind(this) },
      { name: 'worker', builder: this.buildWorker.bind(this) },
      { name: 'cli', builder: this.buildCLI.bind(this) },
      { name: 'sdk', builder: this.buildSDK.bind(this) }
    ];
    
    if (this.options.parallel) {
      await Promise.all(components.map(c => this.buildComponent(c)));
    } else {
      for (const component of components) {
        await this.buildComponent(component);
      }
    }
    
    console.log('✓ All components built');
  }

  async buildComponent({ name, builder }) {
    console.log(`  Building ${name}...`);
    const startTime = Date.now();
    
    try {
      const result = await builder();
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      
      this.buildManifest.components[name] = {
        success: true,
        duration,
        ...result
      };
      
      console.log(`    ✓ ${name} built in ${duration}s`);
    } catch (error) {
      this.buildManifest.components[name] = {
        success: false,
        error: error.message
      };
      
      console.error(`    ✗ ${name} failed: ${error.message}`);
      throw error;
    }
  }

  async buildFrontend() {
    const outputDir = path.join(this.options.outputDir, 'frontend');
    
    if (this.options.target === 'production') {
      await this.runCommand('npm', ['run', 'build:frontend']);
    } else {
      await this.runCommand('npm', ['run', 'build:frontend:dev']);
    }
    
    // Copy build output
    await fs.cp(path.join(__dirname, '../../build/frontend'), outputDir, { recursive: true });
    
    return {
      outputDir,
      files: await this.countFiles(outputDir),
      size: await this.getDirectorySize(outputDir)
    };
  }

  async buildAPI() {
    const outputDir = path.join(this.options.outputDir, 'api');
    await fs.mkdir(outputDir, { recursive: true });
    
    // Build Node.js API
    await this.runCommand('npm', ['run', 'build:api']);
    
    // Build Go services if present
    if (await this.fileExists('cmd/server/main.go')) {
      const env = {
        GOOS: this.options.platform === 'win32' ? 'windows' : this.options.platform,
        GOARCH: this.options.arch === 'x64' ? 'amd64' : this.options.arch,
        CGO_ENABLED: '0'
      };
      
      await this.runCommand('go', [
        'build',
        '-ldflags', `-s -w -X main.version=${this.buildManifest.version}`,
        '-o', path.join(outputDir, 'server'),
        './cmd/server'
      ], { env });
    }
    
    return {
      outputDir,
      files: await this.countFiles(outputDir),
      size: await this.getDirectorySize(outputDir)
    };
  }

  async buildWorker() {
    const outputDir = path.join(this.options.outputDir, 'worker');
    await fs.mkdir(outputDir, { recursive: true });
    
    // Build worker components
    await this.runCommand('npm', ['run', 'build:worker']);
    
    return {
      outputDir,
      files: await this.countFiles(outputDir),
      size: await this.getDirectorySize(outputDir)
    };
  }

  async buildCLI() {
    const outputDir = path.join(this.options.outputDir, 'cli');
    await fs.mkdir(outputDir, { recursive: true });
    
    // Build CLI
    if (await this.fileExists('cmd/cli/main.go')) {
      const env = {
        GOOS: this.options.platform === 'win32' ? 'windows' : this.options.platform,
        GOARCH: this.options.arch === 'x64' ? 'amd64' : this.options.arch,
        CGO_ENABLED: '0'
      };
      
      await this.runCommand('go', [
        'build',
        '-ldflags', `-s -w -X main.version=${this.buildManifest.version}`,
        '-o', path.join(outputDir, 'mcps-cli'),
        './cmd/cli'
      ], { env });
    }
    
    return {
      outputDir,
      files: await this.countFiles(outputDir),
      size: await this.getDirectorySize(outputDir)
    };
  }

  async buildSDK() {
    const outputDir = path.join(this.options.outputDir, 'sdk');
    await fs.mkdir(outputDir, { recursive: true });
    
    // Build SDK packages
    await this.runCommand('npm', ['run', 'build:sdk']);
    
    return {
      outputDir,
      files: await this.countFiles(outputDir),
      size: await this.getDirectorySize(outputDir)
    };
  }

  // Post-build tasks
  async postBuild() {
    console.log('🔨 Running post-build tasks...');
    
    if (!this.options.skipOptimization) {
      await this.optimizeAssets();
    }
    
    await this.generateLicenses();
    await this.createChecksums();
    
    console.log('✓ Post-build tasks completed');
  }

  async optimizeAssets() {
    console.log('  Optimizing assets...');
    
    // Run asset optimization script
    const optimizer = require('./asset-optimize');
    await optimizer.optimize({
      inputDir: this.options.outputDir,
      target: this.options.target
    });
  }

  async generateLicenses() {
    console.log('  Generating license information...');
    
    const licenses = {
      npm: await this.getNpmLicenses(),
      python: await this.getPythonLicenses(),
      go: await this.getGoLicenses()
    };
    
    await fs.writeFile(
      path.join(this.options.outputDir, 'licenses.json'),
      JSON.stringify(licenses, null, 2)
    );
  }

  async createChecksums() {
    console.log('  Creating checksums...');
    
    const files = await this.getAllFiles(this.options.outputDir);
    const checksums = {};
    
    for (const file of files) {
      const content = await fs.readFile(file);
      checksums[path.relative(this.options.outputDir, file)] = {
        sha256: crypto.createHash('sha256').update(content).digest('hex'),
        size: content.length
      };
    }
    
    await fs.writeFile(
      path.join(this.options.outputDir, 'checksums.json'),
      JSON.stringify(checksums, null, 2)
    );
  }

  // Package artifacts
  async packageArtifacts() {
    console.log('📦 Packaging artifacts...');
    
    const packager = require('./package');
    const artifacts = await packager.package({
      inputDir: this.options.outputDir,
      outputDir: path.join(this.options.outputDir, 'packages'),
      platform: this.options.platform,
      arch: this.options.arch,
      version: this.buildManifest.version
    });
    
    this.buildManifest.artifacts = artifacts;
    console.log(`✓ Created ${artifacts.length} artifacts`);
  }

  // Generate build report
  async generateReport() {
    console.log('📊 Generating build report...');
    
    const report = {
      ...this.buildManifest,
      duration: ((Date.now() - this.startTime) / 1000).toFixed(2),
      status: 'success'
    };
    
    await fs.writeFile(
      path.join(this.options.outputDir, 'build-report.json'),
      JSON.stringify(report, null, 2)
    );
    
    // Generate HTML report
    const htmlReport = this.generateHTMLReport(report);
    await fs.writeFile(
      path.join(this.options.outputDir, 'build-report.html'),
      htmlReport
    );
    
    console.log('✓ Build report generated');
  }

  generateHTMLReport(report) {
    return `
<!DOCTYPE html>
<html>
<head>
  <title>Build Report - ${report.version}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 40px; }
    h1, h2 { color: #333; }
    .success { color: #28a745; }
    .failed { color: #dc3545; }
    .info { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .component { border: 1px solid #dee2e6; padding: 15px; margin: 10px 0; border-radius: 4px; }
    .artifact { background: #e9ecef; padding: 10px; margin: 5px 0; border-radius: 4px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 8px; text-align: left; border-bottom: 1px solid #dee2e6; }
  </style>
</head>
<body>
  <h1>Build Report</h1>
  
  <div class="info">
    <h2>Build Information</h2>
    <table>
      <tr><th>Version</th><td>${report.version}</td></tr>
      <tr><th>Target</th><td>${report.target}</td></tr>
      <tr><th>Platform</th><td>${report.platform}-${report.arch}</td></tr>
      <tr><th>Duration</th><td>${report.duration}s</td></tr>
      <tr><th>Status</th><td class="${report.status}">${report.status.toUpperCase()}</td></tr>
      <tr><th>Timestamp</th><td>${report.timestamp}</td></tr>
    </table>
  </div>
  
  <h2>Components</h2>
  ${Object.entries(report.components).map(([name, component]) => `
    <div class="component">
      <h3>${name} <span class="${component.success ? 'success' : 'failed'}">${component.success ? '✓' : '✗'}</span></h3>
      ${component.success ? `
        <p>Duration: ${component.duration}s</p>
        <p>Files: ${component.files || 'N/A'}</p>
        <p>Size: ${component.size ? (component.size / 1024 / 1024).toFixed(2) + ' MB' : 'N/A'}</p>
      ` : `
        <p class="failed">Error: ${component.error}</p>
      `}
    </div>
  `).join('')}
  
  <h2>Artifacts</h2>
  ${report.artifacts.map(artifact => `
    <div class="artifact">
      <strong>${artifact.name}</strong> - ${(artifact.size / 1024 / 1024).toFixed(2)} MB
    </div>
  `).join('')}
</body>
</html>
    `;
  }

  async generateErrorReport(error) {
    const report = {
      ...this.buildManifest,
      duration: ((Date.now() - this.startTime) / 1000).toFixed(2),
      status: 'failed',
      error: {
        message: error.message,
        stack: error.stack
      }
    };
    
    await fs.writeFile(
      path.join(this.options.outputDir, 'build-error.json'),
      JSON.stringify(report, null, 2)
    ).catch(() => {});
  }

  // Utility methods
  async runCommand(command, args, options = {}) {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, {
        stdio: options.silent ? 'pipe' : 'inherit',
        env: { ...process.env, ...options.env }
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

  async fileExists(file) {
    try {
      await fs.access(file);
      return true;
    } catch {
      return false;
    }
  }

  async getDependencyCacheKey() {
    const files = ['package-lock.json', 'requirements.txt', 'go.sum'];
    let hash = crypto.createHash('sha256');
    
    for (const file of files) {
      if (await this.fileExists(file)) {
        const content = await fs.readFile(file);
        hash.update(content);
      }
    }
    
    return hash.digest('hex');
  }

  async checkCache(type, key) {
    const cacheFile = path.join(this.options.cacheDir, `${type}-${key}.json`);
    
    try {
      const cache = JSON.parse(await fs.readFile(cacheFile, 'utf8'));
      return cache.timestamp > Date.now() - 86400000; // 24 hour cache
    } catch {
      return false;
    }
  }

  async saveCache(type, key) {
    const cacheFile = path.join(this.options.cacheDir, `${type}-${key}.json`);
    
    await fs.writeFile(cacheFile, JSON.stringify({
      timestamp: Date.now(),
      key
    }));
  }

  async getGitCommit() {
    try {
      const commit = await this.runCommand('git', ['rev-parse', 'HEAD'], { silent: true });
      return commit.trim();
    } catch {
      return 'unknown';
    }
  }

  async getGitBranch() {
    try {
      const branch = await this.runCommand('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { silent: true });
      return branch.trim();
    } catch {
      return 'unknown';
    }
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

  async countFiles(dir) {
    const files = await this.getAllFiles(dir);
    return files.length;
  }

  async getDirectorySize(dir) {
    const files = await this.getAllFiles(dir);
    let totalSize = 0;
    
    for (const file of files) {
      const stats = await fs.stat(file);
      totalSize += stats.size;
    }
    
    return totalSize;
  }

  compareVersions(a, b) {
    const partsA = a.split('.').map(Number);
    const partsB = b.split('.').map(Number);
    
    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
      const partA = partsA[i] || 0;
      const partB = partsB[i] || 0;
      
      if (partA > partB) return 1;
      if (partA < partB) return -1;
    }
    
    return 0;
  }

  async getNpmLicenses() {
    try {
      const output = await this.runCommand('npm', ['ls', '--json', '--all'], { silent: true });
      return JSON.parse(output);
    } catch {
      return {};
    }
  }

  async getPythonLicenses() {
    try {
      const output = await this.runCommand('pip', ['list', '--format=json'], { silent: true });
      return JSON.parse(output);
    } catch {
      return [];
    }
  }

  async getGoLicenses() {
    try {
      const output = await this.runCommand('go', ['list', '-m', '-json', 'all'], { silent: true });
      return output.split('\n').filter(Boolean).map(line => JSON.parse(line));
    } catch {
      return [];
    }
  }
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {
    target: args[0] || 'production',
    verbose: args.includes('--verbose') || args.includes('-v'),
    skipTests: args.includes('--skip-tests'),
    skipOptimization: args.includes('--skip-optimization'),
    parallel: !args.includes('--no-parallel')
  };
  
  const orchestrator = new BuildOrchestrator(options);
  orchestrator.build().catch(console.error);
}

module.exports = BuildOrchestrator;