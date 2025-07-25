#!/usr/bin/env node

/**
 * Package Builder Script
 * Creates distributable packages for the MCP Platform
 * 
 * @module scripts/build/package
 */

const path = require('path');
const fs = require('fs').promises;
const { createReadStream, createWriteStream } = require('fs');
const { spawn } = require('child_process');
const crypto = require('crypto');
const zlib = require('zlib');
const { pipeline } = require('stream').promises;
const tar = require('tar');

class PackageBuilder {
  constructor(options = {}) {
    this.options = {
      sourceDir: options.sourceDir || path.join(__dirname, '../../dist'),
      outputDir: options.outputDir || path.join(__dirname, '../../packages'),
      formats: options.formats || ['tar.gz', 'zip'],
      platforms: options.platforms || ['linux', 'darwin', 'win32'],
      arch: options.arch || process.arch,
      version: options.version || '1.0.0',
      sign: options.sign !== false,
      compress: options.compress !== false,
      ...options
    };
    
    this.packages = [];
    this.checksums = {};
  }

  async package() {
    console.log('📦 Starting packaging process...');
    console.log(`  Version: ${this.options.version}`);
    console.log(`  Platforms: ${this.options.platforms.join(', ')}`);
    console.log(`  Formats: ${this.options.formats.join(', ')}`);
    
    try {
      await this.createOutputDir();
      
      // Package for each platform
      for (const platform of this.options.platforms) {
        await this.packagePlatform(platform);
      }
      
      await this.generateChecksums();
      
      if (this.options.sign) {
        await this.signPackages();
      }
      
      // Create installers for specific platforms
      if (this.options.createInstallers !== false) {
        await this.createInstallers();
      }
      
      await this.generateManifest();
      
      console.log('✅ Packaging completed successfully!');
      console.log(`📁 Packages created in: ${this.options.outputDir}`);
      
      return this.packages;
    } catch (error) {
      console.error('❌ Packaging failed:', error.message);
      throw error;
    }
  }

  async createOutputDir() {
    console.log('🗂️ Creating output directory...');
    
    await fs.mkdir(this.options.outputDir, { recursive: true });
    
    // Clean existing packages
    const existing = await fs.readdir(this.options.outputDir);
    for (const file of existing) {
      if (file.endsWith('.tar.gz') || file.endsWith('.zip') || file.endsWith('.exe') || file.endsWith('.dmg') || file.endsWith('.deb')) {
        await fs.unlink(path.join(this.options.outputDir, file));
      }
    }
    
    console.log(`  ✓ Output directory ready: ${this.options.outputDir}`);
  }

  async packagePlatform(platform) {
    console.log(`📦 Packaging for ${platform}...`);
    
    const baseName = `mcp-platform-${this.options.version}-${platform}-${this.options.arch}`;
    const sourceFiles = await this.prepareSourceFiles(platform);
    
    for (const format of this.options.formats) {
      const packageFile = await this.createPackage(baseName, sourceFiles, format, platform);
      
      if (packageFile) {
        this.packages.push({
          file: packageFile,
          platform,
          arch: this.options.arch,
          format,
          size: (await fs.stat(packageFile)).size
        });
        
        console.log(`  ✓ Created ${path.basename(packageFile)}`);
      }
    }
  }

  async prepareSourceFiles(platform) {
    const files = [];
    const platformSpecific = {
      win32: {
        scripts: ['install.ps1', 'mcp.bat'],
        exclude: ['*.sh']
      },
      darwin: {
        scripts: ['install.sh', 'mcp'],
        exclude: ['*.ps1', '*.bat']
      },
      linux: {
        scripts: ['install.sh', 'mcp'],
        exclude: ['*.ps1', '*.bat']
      }
    };
    
    const config = platformSpecific[platform] || platformSpecific.linux;
    
    // Collect all files recursively
    async function collectFiles(dir, basePath = '') {
      const items = await fs.readdir(dir);
      
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const relativePath = path.join(basePath, item);
        const stat = await fs.stat(fullPath);
        
        // Skip excluded patterns
        if (config.exclude.some(pattern => {
          const regex = new RegExp(pattern.replace('*', '.*'));
          return regex.test(item);
        })) {
          continue;
        }
        
        if (stat.isDirectory()) {
          // Skip certain directories
          if (['node_modules', '.git', 'test', 'tests', '__tests__'].includes(item)) {
            continue;
          }
          await collectFiles(fullPath, relativePath);
        } else {
          files.push({
            source: fullPath,
            dest: relativePath,
            mode: stat.mode
          });
        }
      }
    }
    
    await collectFiles(this.options.sourceDir);
    
    // Add platform-specific files
    for (const script of config.scripts) {
      const scriptPath = path.join(this.options.sourceDir, '..', 'scripts', 'platform', platform, script);
      if (await this.fileExists(scriptPath)) {
        files.push({
          source: scriptPath,
          dest: script,
          mode: 0o755 // Make scripts executable
        });
      }
    }
    
    // Add README and LICENSE from root
    const rootFiles = ['README.md', 'LICENSE', 'CHANGELOG.md'];
    for (const file of rootFiles) {
      const filePath = path.join(this.options.sourceDir, '..', file);
      if (await this.fileExists(filePath)) {
        files.push({
          source: filePath,
          dest: file,
          mode: 0o644
        });
      }
    }
    
    return files;
  }

  async createPackage(baseName, files, format, platform) {
    const packagePath = path.join(this.options.outputDir, `${baseName}.${format}`);
    
    try {
      switch (format) {
        case 'tar.gz':
          await this.createTarGz(packagePath, files, baseName);
          break;
        case 'zip':
          await this.createZip(packagePath, files, baseName);
          break;
        default:
          throw new Error(`Unsupported package format: ${format}`);
      }
      
      // Verify the package was created
      await fs.access(packagePath);
      return packagePath;
    } catch (error) {
      // If package creation failed, return null
      console.warn(`  ⚠ Failed to create ${format} package: ${error.message}`);
      return null;
    }
  }

  async createTarGz(outputPath, files, baseName) {
    // Create tar.gz archive
    const fileList = files.map(f => ({
      source: f.source,
      target: path.join(baseName, f.dest)
    }));
    
    // Create a temporary directory for staging
    const tempDir = path.join(this.options.outputDir, '.tmp', baseName);
    await fs.mkdir(path.dirname(tempDir), { recursive: true });
    await fs.mkdir(tempDir, { recursive: true });
    
    // Copy files to staging directory
    for (const file of files) {
      const destPath = path.join(tempDir, file.dest);
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      await fs.copyFile(file.source, destPath);
      
      // Preserve file permissions
      if (file.mode) {
        await fs.chmod(destPath, file.mode);
      }
    }
    
    // Create tar.gz
    await tar.create(
      {
        gzip: true,
        file: outputPath,
        cwd: path.dirname(tempDir),
        portable: true,
        preservePaths: false
      },
      [baseName]
    );
    
    // Clean up temp directory
    await fs.rm(path.join(this.options.outputDir, '.tmp'), { recursive: true, force: true });
  }

  async createZip(outputPath, files, baseName) {
    // For cross-platform compatibility, we'll use the system zip command if available
    // Otherwise, we'd use a Node.js zip library like archiver
    
    const tempDir = path.join(this.options.outputDir, '.tmp', baseName);
    await fs.mkdir(path.dirname(tempDir), { recursive: true });
    await fs.mkdir(tempDir, { recursive: true });
    
    // Copy files to staging directory
    for (const file of files) {
      const destPath = path.join(tempDir, file.dest);
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      await fs.copyFile(file.source, destPath);
      
      // Preserve file permissions
      if (file.mode) {
        await fs.chmod(destPath, file.mode);
      }
    }
    
    // Try to use system zip command
    try {
      await this.runCommand('zip', ['-r', outputPath, baseName], {
        cwd: path.dirname(tempDir)
      });
    } catch (error) {
      // If zip command not available, we could fall back to a Node.js implementation
      console.warn('  ⚠ System zip command not available, skipping zip format');
      await fs.rm(outputPath, { force: true });
    }
    
    // Clean up temp directory
    await fs.rm(path.join(this.options.outputDir, '.tmp'), { recursive: true, force: true });
  }

  async generateChecksums() {
    console.log('🔐 Generating checksums...');
    
    for (const pkg of this.packages) {
      const checksum = await this.calculateChecksum(pkg.file);
      this.checksums[path.basename(pkg.file)] = {
        sha256: checksum,
        size: pkg.size
      };
    }
    
    // Write checksums file
    const checksumsPath = path.join(this.options.outputDir, 'checksums.txt');
    let content = `# MCP Platform ${this.options.version} Checksums\n`;
    content += `# Generated: ${new Date().toISOString()}\n\n`;
    
    for (const [file, info] of Object.entries(this.checksums)) {
      content += `${info.sha256}  ${file} (${this.formatSize(info.size)})\n`;
    }
    
    await fs.writeFile(checksumsPath, content);
    
    // Also write JSON format
    await fs.writeFile(
      path.join(this.options.outputDir, 'checksums.json'),
      JSON.stringify(this.checksums, null, 2)
    );
    
    console.log(`  ✓ Generated checksums for ${this.packages.length} packages`);
  }

  async calculateChecksum(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = createReadStream(filePath);
      
      stream.on('data', data => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  async signPackages() {
    console.log('✍️ Signing packages...');
    
    // Check if GPG is available
    const hasGpg = await this.commandExists('gpg');
    if (!hasGpg) {
      console.warn('  ⚠ GPG not available, skipping package signing');
      return;
    }
    
    // Check if we have a signing key
    const signingKey = process.env.GPG_SIGNING_KEY || this.options.signingKey;
    if (!signingKey) {
      console.warn('  ⚠ No signing key specified, skipping package signing');
      return;
    }
    
    for (const pkg of this.packages) {
      try {
        await this.runCommand('gpg', [
          '--armor',
          '--detach-sign',
          '--local-user', signingKey,
          pkg.file
        ]);
        
        console.log(`  ✓ Signed ${path.basename(pkg.file)}`);
      } catch (error) {
        console.warn(`  ⚠ Failed to sign ${path.basename(pkg.file)}: ${error.message}`);
      }
    }
  }

  async createInstallers() {
    console.log('🔧 Creating platform installers...');
    
    const installers = {
      win32: this.createWindowsInstaller.bind(this),
      darwin: this.createMacInstaller.bind(this),
      linux: this.createLinuxInstaller.bind(this)
    };
    
    for (const platform of this.options.platforms) {
      if (installers[platform]) {
        try {
          await installers[platform]();
        } catch (error) {
          console.warn(`  ⚠ Failed to create ${platform} installer: ${error.message}`);
        }
      }
    }
  }

  async createWindowsInstaller() {
    // Check if NSIS is available
    if (!await this.commandExists('makensis')) {
      console.log('  ℹ Skipping Windows installer (NSIS not available)');
      return;
    }
    
    // Create NSIS script
    const nsisScript = `
!define PRODUCT_NAME "MCP Platform"
!define PRODUCT_VERSION "${this.options.version}"
!define PRODUCT_PUBLISHER "MCP Team"

Name "\${PRODUCT_NAME} \${PRODUCT_VERSION}"
OutFile "${this.options.outputDir}/mcp-platform-\${PRODUCT_VERSION}-setup.exe"
InstallDir "$PROGRAMFILES64\\MCPPlatform"
RequestExecutionLevel admin

Section "Main"
  SetOutPath "$INSTDIR"
  File /r "${this.options.sourceDir}\\*.*"
  
  ; Create start menu shortcuts
  CreateDirectory "$SMPROGRAMS\\MCP Platform"
  CreateShortcut "$SMPROGRAMS\\MCP Platform\\MCP Platform.lnk" "$INSTDIR\\mcp.bat"
  CreateShortcut "$SMPROGRAMS\\MCP Platform\\Uninstall.lnk" "$INSTDIR\\uninstall.exe"
  
  ; Write uninstaller
  WriteUninstaller "$INSTDIR\\uninstall.exe"
  
  ; Add to PATH
  nsExec::Exec 'setx PATH "%PATH%;$INSTDIR" /M'
SectionEnd

Section "Uninstall"
  RMDir /r "$INSTDIR"
  RMDir /r "$SMPROGRAMS\\MCP Platform"
SectionEnd
`;
    
    const scriptPath = path.join(this.options.outputDir, 'installer.nsi');
    await fs.writeFile(scriptPath, nsisScript);
    
    try {
      await this.runCommand('makensis', [scriptPath]);
      await fs.unlink(scriptPath); // Clean up script
      console.log('  ✓ Created Windows installer');
    } catch (error) {
      throw error;
    }
  }

  async createMacInstaller() {
    // Check if we're on macOS with necessary tools
    if (process.platform !== 'darwin') {
      console.log('  ℹ Skipping macOS installer (must build on macOS)');
      return;
    }
    
    // Create a simple .pkg installer structure
    const pkgRoot = path.join(this.options.outputDir, 'macos-installer');
    const scriptsDir = path.join(pkgRoot, 'scripts');
    const resourcesDir = path.join(pkgRoot, 'resources');
    
    await fs.mkdir(scriptsDir, { recursive: true });
    await fs.mkdir(resourcesDir, { recursive: true });
    
    // Create postinstall script
    const postinstall = `#!/bin/bash
# Add MCP to PATH
echo 'export PATH="$PATH:/usr/local/mcp-platform"' >> ~/.zshrc
echo 'export PATH="$PATH:/usr/local/mcp-platform"' >> ~/.bash_profile

# Make mcp executable
chmod +x /usr/local/mcp-platform/mcp

echo "MCP Platform installed successfully!"
`;
    
    await fs.writeFile(path.join(scriptsDir, 'postinstall'), postinstall);
    await fs.chmod(path.join(scriptsDir, 'postinstall'), 0o755);
    
    // Build the package
    try {
      await this.runCommand('pkgbuild', [
        '--root', this.options.sourceDir,
        '--identifier', 'io.mcp-platform.app',
        '--version', this.options.version,
        '--scripts', scriptsDir,
        '--install-location', '/usr/local/mcp-platform',
        path.join(this.options.outputDir, `mcp-platform-${this.options.version}.pkg`)
      ]);
      
      // Clean up
      await fs.rm(pkgRoot, { recursive: true, force: true });
      
      console.log('  ✓ Created macOS installer');
    } catch (error) {
      throw error;
    }
  }

  async createLinuxInstaller() {
    // Create .deb package for Debian/Ubuntu
    const debRoot = path.join(this.options.outputDir, 'debian-package');
    const debianDir = path.join(debRoot, 'DEBIAN');
    const usrDir = path.join(debRoot, 'usr', 'local', 'mcp-platform');
    const binDir = path.join(debRoot, 'usr', 'local', 'bin');
    
    // Clean up any existing debian-package directory to prevent recursive paths
    try {
      await fs.rm(debRoot, { recursive: true, force: true });
    } catch (error) {
      // Ignore errors if directory doesn't exist
    }
    
    await fs.mkdir(debianDir, { recursive: true });
    await fs.mkdir(usrDir, { recursive: true });
    await fs.mkdir(binDir, { recursive: true });
    
    // Copy files
    await this.copyDirectory(this.options.sourceDir, usrDir);
    
    // Create symlink in bin
    await fs.symlink('/usr/local/mcp-platform/mcp', path.join(binDir, 'mcp'));
    
    // Create control file
    const control = `Package: mcp-platform
Version: ${this.options.version}
Section: devel
Priority: optional
Architecture: ${this.options.arch === 'x64' ? 'amd64' : this.options.arch}
Maintainer: MCP Team <support@mcp-platform.io>
Description: MCP Platform - Model Context Protocol Development Platform
 A comprehensive platform for developing and running MCP servers
 with integrated tools for testing, debugging, and deployment.
Depends: docker.io | docker-ce, docker-compose
`;
    
    await fs.writeFile(path.join(debianDir, 'control'), control);
    
    // Create postinst script
    const postinst = `#!/bin/bash
set -e

# Make mcp executable
chmod +x /usr/local/mcp-platform/mcp

# Add to PATH if not already there
if ! grep -q "/usr/local/mcp-platform" ~/.bashrc; then
    echo 'export PATH="$PATH:/usr/local/mcp-platform"' >> ~/.bashrc
fi

echo "MCP Platform installed successfully!"
echo "Please restart your terminal or run 'source ~/.bashrc' to update PATH"
`;
    
    await fs.writeFile(path.join(debianDir, 'postinst'), postinst);
    await fs.chmod(path.join(debianDir, 'postinst'), 0o755);
    
    // Build the .deb package
    try {
      await this.runCommand('dpkg-deb', [
        '--build',
        debRoot,
        path.join(this.options.outputDir, `mcp-platform_${this.options.version}_${this.options.arch === 'x64' ? 'amd64' : this.options.arch}.deb`)
      ]);
      
      // Clean up
      await fs.rm(debRoot, { recursive: true, force: true });
      
      console.log('  ✓ Created Debian package');
    } catch (error) {
      console.warn(`  ⚠ Failed to create .deb package: ${error.message}`);
    }
    
    // Also create an AppImage if possible
    if (await this.commandExists('appimagetool')) {
      await this.createAppImage();
    }
  }

  async createAppImage() {
    // Create AppImage structure
    const appDir = path.join(this.options.outputDir, 'MCPPlatform.AppDir');
    
    // Clean up any existing AppDir to prevent issues
    try {
      await fs.rm(appDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore errors if directory doesn't exist
    }
    
    await fs.mkdir(appDir, { recursive: true });
    
    // Create desktop file
    const desktop = `[Desktop Entry]
Name=MCP Platform
Exec=mcp
Icon=mcp-platform
Type=Application
Categories=Development;
Comment=Model Context Protocol Development Platform
`;
    
    await fs.writeFile(path.join(appDir, 'mcp-platform.desktop'), desktop);
    
    // Create AppRun script
    const appRun = `#!/bin/bash
SELF=$(readlink -f "$0")
HERE=\${SELF%/*}
export PATH="${HERE}:$PATH"
exec "${HERE}/mcp" "$@"
`;
    
    await fs.writeFile(path.join(appDir, 'AppRun'), appRun);
    await fs.chmod(path.join(appDir, 'AppRun'), 0o755);
    
    // Copy application files
    await this.copyDirectory(this.options.sourceDir, appDir);
    
    // Build AppImage
    try {
      await this.runCommand('appimagetool', [
        appDir,
        path.join(this.options.outputDir, `MCPPlatform-${this.options.version}-${this.options.arch}.AppImage`)
      ]);
      
      // Clean up
      await fs.rm(appDir, { recursive: true, force: true });
      
      console.log('  ✓ Created AppImage');
    } catch (error) {
      console.warn(`  ⚠ Failed to create AppImage: ${error.message}`);
    }
  }

  async generateManifest() {
    console.log('📋 Generating package manifest...');
    
    const manifest = {
      version: this.options.version,
      timestamp: new Date().toISOString(),
      packages: this.packages.map(pkg => ({
        file: path.basename(pkg.file),
        platform: pkg.platform,
        arch: pkg.arch,
        format: pkg.format,
        size: pkg.size,
        sizeFormatted: this.formatSize(pkg.size),
        checksum: this.checksums[path.basename(pkg.file)]?.sha256,
        signature: this.fileExists(pkg.file + '.asc') ? path.basename(pkg.file) + '.asc' : null
      })),
      checksums: this.checksums,
      buildInfo: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        builder: process.env.USER || 'unknown'
      }
    };
    
    await fs.writeFile(
      path.join(this.options.outputDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2)
    );
    
    // Also create a human-readable manifest
    let readableManifest = `MCP Platform ${this.options.version} - Package Manifest\n`;
    readableManifest += `Generated: ${manifest.timestamp}\n\n`;
    readableManifest += `Packages:\n`;
    
    for (const pkg of manifest.packages) {
      readableManifest += `  - ${pkg.file} (${pkg.sizeFormatted})\n`;
      readableManifest += `    Platform: ${pkg.platform} / ${pkg.arch}\n`;
      readableManifest += `    SHA256: ${pkg.checksum}\n`;
      if (pkg.signature) {
        readableManifest += `    Signature: ${pkg.signature}\n`;
      }
      readableManifest += '\n';
    }
    
    await fs.writeFile(
      path.join(this.options.outputDir, 'MANIFEST.txt'),
      readableManifest
    );
    
    console.log('  ✓ Generated package manifest');
  }

  // Helper methods
  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async commandExists(command) {
    try {
      await this.runCommand('which', [command]);
      return true;
    } catch {
      return false;
    }
  }

  async runCommand(command, args, options = {}) {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, {
        stdio: 'pipe',
        ...options
      });
      
      let stdout = '';
      let stderr = '';
      
      proc.stdout?.on('data', data => stdout += data);
      proc.stderr?.on('data', data => stderr += data);
      
      proc.on('close', code => {
        if (code !== 0) {
          reject(new Error(`${command} failed with code ${code}: ${stderr}`));
        } else {
          resolve(stdout);
        }
      });
    });
  }

  async copyDirectory(src, dest, excludeDirs = []) {
    await fs.mkdir(dest, { recursive: true });
    const files = await fs.readdir(src);
    
    // Default exclusions to prevent recursive copying
    const defaultExclusions = ['debian-package', '.tmp', 'packages', 'MCPPlatform.AppDir'];
    const allExclusions = [...defaultExclusions, ...excludeDirs];
    
    for (const file of files) {
      // Skip excluded directories
      if (allExclusions.includes(file)) {
        continue;
      }
      
      const srcPath = path.join(src, file);
      const destPath = path.join(dest, file);
      const stat = await fs.stat(srcPath);
      
      if (stat.isDirectory()) {
        await this.copyDirectory(srcPath, destPath, excludeDirs);
      } else {
        await fs.copyFile(srcPath, destPath);
        // Preserve permissions
        await fs.chmod(destPath, stat.mode);
      }
    }
  }

  formatSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unit = 0;
    
    while (size >= 1024 && unit < units.length - 1) {
      size /= 1024;
      unit++;
    }
    
    return `${size.toFixed(2)} ${units[unit]}`;
  }
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {
    platforms: [],
    formats: ['tar.gz', 'zip']
  };
  
  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--source':
      case '-s':
        options.sourceDir = args[++i];
        break;
      case '--output':
      case '-o':
        options.outputDir = args[++i];
        break;
      case '--version':
      case '-v':
        options.version = args[++i];
        break;
      case '--platform':
      case '-p':
        options.platforms.push(args[++i]);
        break;
      case '--format':
      case '-f':
        const format = args[++i];
        if (!options.formats.includes(format)) {
          options.formats = [format];
        }
        break;
      case '--arch':
      case '-a':
        options.arch = args[++i];
        break;
      case '--no-sign':
        options.sign = false;
        break;
      case '--no-compress':
        options.compress = false;
        break;
      case '--help':
      case '-h':
        console.log(`
MCP Platform Package Builder

Usage: node package.js [options]

Options:
  --source, -s <dir>      Source directory to package
  --output, -o <dir>      Output directory for packages
  --version, -v <ver>     Package version
  --platform, -p <name>   Target platform (linux, darwin, win32)
                          Can be specified multiple times
  --format, -f <fmt>      Package format (tar.gz, zip)
  --arch, -a <arch>       Target architecture (x64, arm64)
  --no-sign               Skip package signing
  --no-compress           Skip compression
  --help, -h              Show help

Examples:
  node package.js -v 1.0.0 -p linux -p darwin
  node package.js --source ./dist --output ./releases --version 2.0.0
`);
        process.exit(0);
    }
  }
  
  // Default to current platform if none specified
  if (options.platforms.length === 0) {
    options.platforms = [process.platform];
  }
  
  const builder = new PackageBuilder(options);
  builder.package().catch(error => {
    console.error('Packaging failed:', error);
    process.exit(1);
  });
}

module.exports = PackageBuilder;