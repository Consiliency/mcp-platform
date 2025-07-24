#!/usr/bin/env node

/**
 * Version Management Script
 * Handles semantic versioning and version bumps across the project
 * 
 * @module scripts/build/version-bump
 * @assigned-to CI/CD Team
 */

const path = require('path');
const fs = require('fs').promises;
const { spawn } = require('child_process');
const semver = require('semver');

class VersionManager {
  constructor(options = {}) {
    this.options = {
      type: options.type || 'patch', // major, minor, patch, prerelease
      preid: options.preid || 'alpha', // alpha, beta, rc
      commit: options.commit !== false,
      tag: options.tag !== false,
      push: options.push || false,
      dryRun: options.dryRun || false,
      files: options.files || this.getDefaultFiles(),
      ...options
    };
    
    this.currentVersion = null;
    this.newVersion = null;
    this.modifiedFiles = [];
  }

  getDefaultFiles() {
    return [
      'package.json',
      'package-lock.json',
      'charts/*/Chart.yaml',
      'version.go',
      'version.py',
      'docs/API.md',
      'README.md'
    ];
  }

  // Main version bump method
  async bump() {
    console.log(`🔢 Bumping version (${this.options.type})...`);
    
    try {
      await this.validateGitStatus();
      await this.getCurrentVersion();
      await this.calculateNewVersion();
      
      if (this.options.dryRun) {
        console.log(`\n📋 Dry run - would bump from ${this.currentVersion} to ${this.newVersion}`);
        return { current: this.currentVersion, new: this.newVersion, dryRun: true };
      }
      
      await this.updateVersionFiles();
      
      if (this.options.commit) {
        await this.commitChanges();
      }
      
      if (this.options.tag) {
        await this.createTag();
      }
      
      if (this.options.push) {
        await this.pushChanges();
      }
      
      console.log(`\n✅ Version bumped from ${this.currentVersion} to ${this.newVersion}`);
      
      return {
        current: this.currentVersion,
        new: this.newVersion,
        files: this.modifiedFiles,
        committed: this.options.commit,
        tagged: this.options.tag,
        pushed: this.options.push
      };
    } catch (error) {
      console.error('❌ Version bump failed:', error.message);
      throw error;
    }
  }

  // Validate git status
  async validateGitStatus() {
    console.log('  Checking git status...');
    
    // Check if in git repository
    try {
      await this.runCommand('git', ['status'], { silent: true });
    } catch {
      throw new Error('Not in a git repository');
    }
    
    // Check for uncommitted changes
    const status = await this.runCommand('git', ['status', '--porcelain'], { silent: true });
    if (status.trim() && !this.options.force) {
      throw new Error('Uncommitted changes detected. Commit or stash them first.');
    }
    
    // Get current branch
    const branch = await this.runCommand('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { silent: true });
    this.currentBranch = branch.trim();
    
    console.log(`    ✓ On branch: ${this.currentBranch}`);
  }

  // Get current version
  async getCurrentVersion() {
    console.log('  Getting current version...');
    
    try {
      const packageJson = await fs.readFile('package.json', 'utf8');
      const pkg = JSON.parse(packageJson);
      this.currentVersion = pkg.version;
      
      if (!semver.valid(this.currentVersion)) {
        throw new Error(`Invalid version in package.json: ${this.currentVersion}`);
      }
      
      console.log(`    ✓ Current version: ${this.currentVersion}`);
    } catch (error) {
      throw new Error(`Failed to read package.json: ${error.message}`);
    }
  }

  // Calculate new version
  async calculateNewVersion() {
    console.log('  Calculating new version...');
    
    switch (this.options.type) {
      case 'major':
      case 'minor':
      case 'patch':
        this.newVersion = semver.inc(this.currentVersion, this.options.type);
        break;
        
      case 'prerelease':
        this.newVersion = semver.inc(this.currentVersion, 'prerelease', this.options.preid);
        break;
        
      case 'release':
        // Remove prerelease suffix
        if (semver.prerelease(this.currentVersion)) {
          this.newVersion = semver.inc(this.currentVersion, 'patch');
        } else {
          throw new Error('Current version is not a prerelease');
        }
        break;
        
      default:
        // Check if it's a specific version
        if (semver.valid(this.options.type)) {
          if (semver.gt(this.options.type, this.currentVersion)) {
            this.newVersion = this.options.type;
          } else {
            throw new Error(`New version must be greater than current version (${this.currentVersion})`);
          }
        } else {
          throw new Error(`Invalid version type: ${this.options.type}`);
        }
    }
    
    console.log(`    ✓ New version: ${this.newVersion}`);
  }

  // Update version in files
  async updateVersionFiles() {
    console.log('  Updating version files...');
    
    // Update package.json
    await this.updatePackageJson();
    
    // Update package-lock.json
    await this.updatePackageLock();
    
    // Update other files
    for (const filePattern of this.options.files) {
      if (filePattern.includes('*')) {
        await this.updateGlobFiles(filePattern);
      } else {
        await this.updateFile(filePattern);
      }
    }
    
    console.log(`    ✓ Updated ${this.modifiedFiles.length} files`);
  }

  async updatePackageJson() {
    const filePath = 'package.json';
    
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const pkg = JSON.parse(content);
      pkg.version = this.newVersion;
      
      await fs.writeFile(filePath, JSON.stringify(pkg, null, 2) + '\n');
      this.modifiedFiles.push(filePath);
    } catch (error) {
      console.warn(`    ⚠️  Failed to update ${filePath}: ${error.message}`);
    }
  }

  async updatePackageLock() {
    const filePath = 'package-lock.json';
    
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const lockfile = JSON.parse(content);
      
      // Update root version
      lockfile.version = this.newVersion;
      
      // Update packages object if it exists (npm v7+)
      if (lockfile.packages && lockfile.packages['']) {
        lockfile.packages[''].version = this.newVersion;
      }
      
      await fs.writeFile(filePath, JSON.stringify(lockfile, null, 2) + '\n');
      this.modifiedFiles.push(filePath);
    } catch (error) {
      console.warn(`    ⚠️  Failed to update ${filePath}: ${error.message}`);
    }
  }

  async updateFile(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      let updated = content;
      
      // Different update strategies based on file type
      if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
        updated = this.updateYamlVersion(content);
      } else if (filePath.endsWith('.go')) {
        updated = this.updateGoVersion(content);
      } else if (filePath.endsWith('.py')) {
        updated = this.updatePythonVersion(content);
      } else if (filePath.endsWith('.md')) {
        updated = this.updateMarkdownVersion(content);
      }
      
      if (updated !== content) {
        await fs.writeFile(filePath, updated);
        this.modifiedFiles.push(filePath);
      }
    } catch (error) {
      // File might not exist, which is OK
    }
  }

  async updateGlobFiles(pattern) {
    const glob = require('glob');
    
    try {
      const files = await new Promise((resolve, reject) => {
        glob(pattern, (err, files) => {
          if (err) reject(err);
          else resolve(files);
        });
      });
      
      for (const file of files) {
        await this.updateFile(file);
      }
    } catch (error) {
      console.warn(`    ⚠️  Failed to process glob ${pattern}: ${error.message}`);
    }
  }

  updateYamlVersion(content) {
    // Update version field in YAML
    return content.replace(
      /^version:\s*.+$/m,
      `version: ${this.newVersion}`
    ).replace(
      /^appVersion:\s*.+$/m,
      `appVersion: ${this.newVersion}`
    );
  }

  updateGoVersion(content) {
    // Update version constant in Go
    return content.replace(
      /Version\s*=\s*"[^"]+"/,
      `Version = "${this.newVersion}"`
    );
  }

  updatePythonVersion(content) {
    // Update version variable in Python
    return content.replace(
      /__version__\s*=\s*["'][^"']+["']/,
      `__version__ = "${this.newVersion}"`
    );
  }

  updateMarkdownVersion(content) {
    // Update version references in Markdown
    return content
      .replace(
        /version\s+v?\d+\.\d+\.\d+(-\w+\.\d+)?/gi,
        `version ${this.newVersion}`
      )
      .replace(
        /v\d+\.\d+\.\d+(-\w+\.\d+)?/g,
        `v${this.newVersion}`
      );
  }

  // Commit changes
  async commitChanges() {
    console.log('  Committing changes...');
    
    // Add modified files
    await this.runCommand('git', ['add', ...this.modifiedFiles]);
    
    // Create commit
    const message = `chore(release): ${this.newVersion}`;
    await this.runCommand('git', ['commit', '-m', message]);
    
    console.log(`    ✓ Created commit: ${message}`);
  }

  // Create git tag
  async createTag() {
    console.log('  Creating tag...');
    
    const tagName = `v${this.newVersion}`;
    const message = `Release version ${this.newVersion}`;
    
    await this.runCommand('git', ['tag', '-a', tagName, '-m', message]);
    
    console.log(`    ✓ Created tag: ${tagName}`);
  }

  // Push changes
  async pushChanges() {
    console.log('  Pushing changes...');
    
    // Push commits
    await this.runCommand('git', ['push', 'origin', this.currentBranch]);
    
    // Push tag
    if (this.options.tag) {
      await this.runCommand('git', ['push', 'origin', `v${this.newVersion}`]);
    }
    
    console.log('    ✓ Pushed to remote');
  }

  // Utility method to run commands
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
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  
  // Parse arguments
  const options = {
    type: args[0] || 'patch',
    preid: args.find(a => a.startsWith('--preid='))?.split('=')[1],
    commit: !args.includes('--no-commit'),
    tag: !args.includes('--no-tag'),
    push: args.includes('--push'),
    dryRun: args.includes('--dry-run'),
    force: args.includes('--force')
  };
  
  // Show help
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Version Bump Tool

Usage: version-bump [type] [options]

Types:
  major              Bump major version (1.0.0 -> 2.0.0)
  minor              Bump minor version (1.0.0 -> 1.1.0)
  patch              Bump patch version (1.0.0 -> 1.0.1) [default]
  prerelease         Bump prerelease version (1.0.0 -> 1.0.1-alpha.0)
  release            Remove prerelease suffix (1.0.1-alpha.0 -> 1.0.1)
  <version>          Set specific version (must be greater than current)

Options:
  --preid=<id>       Prerelease identifier (alpha, beta, rc) [default: alpha]
  --no-commit        Don't create a commit
  --no-tag           Don't create a tag
  --push             Push changes to remote
  --dry-run          Show what would be done without making changes
  --force            Allow bumping with uncommitted changes
  --help, -h         Show this help message

Examples:
  version-bump                     # Bump patch version
  version-bump minor               # Bump minor version
  version-bump prerelease --preid=beta
  version-bump 2.0.0              # Set specific version
  version-bump patch --push       # Bump and push
    `);
    process.exit(0);
  }
  
  const manager = new VersionManager(options);
  manager.bump().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = VersionManager;