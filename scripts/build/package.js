#!/usr/bin/env node

/**
 * Package Builder Script
 * Creates distributable packages for multiple platforms
 * 
 * @module scripts/build/package
 * @assigned-to CI/CD Team
 */

const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const { spawn } = require('child_process');
const tar = require('tar');
const archiver = require('archiver');

class PackageBuilder {
  constructor(options = {}) {
    this.options = {
      inputDir: options.inputDir || path.join(__dirname, '../../dist'),
      outputDir: options.outputDir || path.join(__dirname, '../../packages'),
      platform: options.platform || process.platform,
      arch: options.arch || process.arch,
      version: options.version || require('../../package.json').version,
      name: options.name || 'mcps',
      formats: options.formats || this.getDefaultFormats(options.platform),
      sign: options.sign !== false,
      compress: options.compress !== false,
      ...options
    };
    
    this.artifacts = [];
  }

  getDefaultFormats(platform) {
    switch (platform) {
      case 'linux':
        return ['tar.gz', 'deb', 'rpm', 'AppImage'];
      case 'darwin':
        return ['tar.gz', 'dmg', 'pkg'];
      case 'win32':
        return ['zip', 'exe', 'msi'];
      default:
        return ['tar.gz', 'zip'];
    }
  }

  // Main packaging method
  async package() {
    console.log(`📦 Packaging ${this.options.name} v${this.options.version} for ${this.options.platform}-${this.options.arch}...`);
    
    try {
      await this.validateInput();
      await this.createOutputDir();
      
      // Create packages in requested formats
      for (const format of this.options.formats) {
        try {
          await this.createPackage(format);
        } catch (error) {
          console.error(`⚠️  Failed to create ${format} package: ${error.message}`);
        }
      }
      
      await this.generateChecksums();
      
      if (this.options.sign) {
        await this.signPackages();
      }
      
      await this.generateManifest();
      
      console.log(`✅ Created ${this.artifacts.length} packages`);
      return this.artifacts;
    } catch (error) {
      console.error('❌ Packaging failed:', error);
      throw error;
    }
  }

  async validateInput() {
    try {
      await fs.access(this.options.inputDir);
    } catch {
      throw new Error(`Input directory not found: ${this.options.inputDir}`);
    }
    
    // Check for required tools based on formats
    const requiredTools = {
      'deb': ['dpkg-deb', 'fakeroot'],
      'rpm': ['rpmbuild'],
      'dmg': ['hdiutil'],
      'pkg': ['pkgbuild'],
      'exe': ['makensis'],
      'msi': ['candle', 'light'],
      'AppImage': ['appimagetool']
    };
    
    for (const format of this.options.formats) {
      const tools = requiredTools[format];
      if (tools) {
        for (const tool of tools) {
          if (!await this.commandExists(tool)) {
            console.warn(`⚠️  Tool '${tool}' not found, skipping ${format} format`);
            this.options.formats = this.options.formats.filter(f => f !== format);
          }
        }
      }
    }
  }

  async createOutputDir() {
    await fs.mkdir(this.options.outputDir, { recursive: true });
  }

  async createPackage(format) {
    console.log(`  Creating ${format} package...`);
    
    const packageName = this.getPackageName(format);
    const packagePath = path.join(this.options.outputDir, packageName);
    
    switch (format) {
      case 'tar.gz':
        await this.createTarGz(packagePath);
        break;
      case 'zip':
        await this.createZip(packagePath);
        break;
      case 'deb':
        await this.createDeb(packagePath);
        break;
      case 'rpm':
        await this.createRpm(packagePath);
        break;
      case 'dmg':
        await this.createDmg(packagePath);
        break;
      case 'pkg':
        await this.createPkg(packagePath);
        break;
      case 'exe':
        await this.createExe(packagePath);
        break;
      case 'msi':
        await this.createMsi(packagePath);
        break;
      case 'AppImage':
        await this.createAppImage(packagePath);
        break;
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
    
    const stats = await fs.stat(packagePath);
    this.artifacts.push({
      name: packageName,
      path: packagePath,
      format,
      size: stats.size,
      platform: this.options.platform,
      arch: this.options.arch
    });
    
    console.log(`    ✓ Created ${packageName} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
  }

  getPackageName(format) {
    const base = `${this.options.name}-${this.options.version}-${this.options.platform}-${this.options.arch}`;
    
    switch (format) {
      case 'tar.gz':
        return `${base}.tar.gz`;
      case 'zip':
        return `${base}.zip`;
      case 'deb':
        return `${this.options.name}_${this.options.version}_${this.options.arch}.deb`;
      case 'rpm':
        return `${this.options.name}-${this.options.version}-1.${this.options.arch}.rpm`;
      case 'dmg':
        return `${base}.dmg`;
      case 'pkg':
        return `${base}.pkg`;
      case 'exe':
        return `${base}-installer.exe`;
      case 'msi':
        return `${base}.msi`;
      case 'AppImage':
        return `${this.options.name}-${this.options.version}-${this.options.arch}.AppImage`;
      default:
        return `${base}.${format}`;
    }
  }

  async createTarGz(outputPath) {
    await tar.create(
      {
        gzip: this.options.compress,
        file: outputPath,
        cwd: this.options.inputDir,
        portable: true,
        mtime: new Date('2000-01-01')
      },
      ['.']
    );
  }

  async createZip(outputPath) {
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(outputPath);
      const archive = archiver('zip', {
        zlib: { level: this.options.compress ? 9 : 0 }
      });
      
      output.on('close', resolve);
      archive.on('error', reject);
      
      archive.pipe(output);
      archive.directory(this.options.inputDir, false);
      archive.finalize();
    });
  }

  async createDeb(outputPath) {
    const debDir = path.join(this.options.outputDir, 'deb-build');
    
    // Create Debian package structure
    await this.createDebianStructure(debDir);
    
    // Build package
    await this.runCommand('dpkg-deb', ['--build', debDir, outputPath]);
    
    // Cleanup
    await fs.rm(debDir, { recursive: true, force: true });
  }

  async createDebianStructure(debDir) {
    // Create directory structure
    await fs.mkdir(path.join(debDir, 'DEBIAN'), { recursive: true });
    await fs.mkdir(path.join(debDir, 'usr/local/bin'), { recursive: true });
    await fs.mkdir(path.join(debDir, 'usr/share/doc', this.options.name), { recursive: true });
    
    // Copy binaries
    await this.copyFiles(
      this.options.inputDir,
      path.join(debDir, 'usr/local/bin')
    );
    
    // Create control file
    const control = `Package: ${this.options.name}
Version: ${this.options.version}
Section: utils
Priority: optional
Architecture: ${this.options.arch === 'x64' ? 'amd64' : this.options.arch}
Maintainer: MCPS Team <team@mcps.io>
Description: Model Context Protocol Server
 A comprehensive server implementation for the Model Context Protocol,
 providing tools and services for AI model integration.
`;
    
    await fs.writeFile(path.join(debDir, 'DEBIAN/control'), control);
    
    // Create postinst script
    const postinst = `#!/bin/sh
set -e

# Create system user
if ! getent passwd mcps >/dev/null; then
    useradd --system --shell /bin/false --home /var/lib/mcps mcps
fi

# Create directories
mkdir -p /var/lib/mcps /var/log/mcps /etc/mcps
chown mcps:mcps /var/lib/mcps /var/log/mcps

# Set executable permissions
chmod +x /usr/local/bin/mcps*

exit 0
`;
    
    await fs.writeFile(path.join(debDir, 'DEBIAN/postinst'), postinst);
    await fs.chmod(path.join(debDir, 'DEBIAN/postinst'), 0o755);
  }

  async createRpm(outputPath) {
    const rpmDir = path.join(this.options.outputDir, 'rpm-build');
    
    // Create RPM build structure
    const dirs = ['BUILD', 'RPMS', 'SOURCES', 'SPECS', 'SRPMS'];
    for (const dir of dirs) {
      await fs.mkdir(path.join(rpmDir, dir), { recursive: true });
    }
    
    // Create spec file
    const spec = `Name: ${this.options.name}
Version: ${this.options.version}
Release: 1
Summary: Model Context Protocol Server
License: MIT
URL: https://github.com/mcps/mcps
BuildArch: ${this.options.arch === 'x64' ? 'x86_64' : this.options.arch}

%description
A comprehensive server implementation for the Model Context Protocol,
providing tools and services for AI model integration.

%prep
# No prep needed

%build
# Pre-built binaries

%install
mkdir -p %{buildroot}/usr/local/bin
cp -r ${this.options.inputDir}/* %{buildroot}/usr/local/bin/

%files
/usr/local/bin/*

%post
# Create system user
if ! getent passwd mcps >/dev/null; then
    useradd --system --shell /bin/false --home /var/lib/mcps mcps
fi

# Create directories
mkdir -p /var/lib/mcps /var/log/mcps /etc/mcps
chown mcps:mcps /var/lib/mcps /var/log/mcps

%changelog
* ${new Date().toDateString()} MCPS Team <team@mcps.io> - ${this.options.version}
- Release ${this.options.version}
`;
    
    const specPath = path.join(rpmDir, 'SPECS', `${this.options.name}.spec`);
    await fs.writeFile(specPath, spec);
    
    // Build RPM
    await this.runCommand('rpmbuild', [
      '-bb',
      '--define', `_topdir ${rpmDir}`,
      specPath
    ]);
    
    // Move built RPM to output
    const rpmFile = `${this.options.name}-${this.options.version}-1.${this.options.arch === 'x64' ? 'x86_64' : this.options.arch}.rpm`;
    await fs.rename(
      path.join(rpmDir, 'RPMS', this.options.arch === 'x64' ? 'x86_64' : this.options.arch, rpmFile),
      outputPath
    );
    
    // Cleanup
    await fs.rm(rpmDir, { recursive: true, force: true });
  }

  async createDmg(outputPath) {
    const dmgDir = path.join(this.options.outputDir, 'dmg-build');
    
    // Create DMG structure
    await fs.mkdir(path.join(dmgDir, `${this.options.name}.app/Contents/MacOS`), { recursive: true });
    await fs.mkdir(path.join(dmgDir, `${this.options.name}.app/Contents/Resources`), { recursive: true });
    
    // Copy files
    await this.copyFiles(
      this.options.inputDir,
      path.join(dmgDir, `${this.options.name}.app/Contents/MacOS`)
    );
    
    // Create Info.plist
    const infoPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>${this.options.name}</string>
    <key>CFBundleIdentifier</key>
    <string>io.mcps.${this.options.name}</string>
    <key>CFBundleName</key>
    <string>${this.options.name}</string>
    <key>CFBundleVersion</key>
    <string>${this.options.version}</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
</dict>
</plist>`;
    
    await fs.writeFile(
      path.join(dmgDir, `${this.options.name}.app/Contents/Info.plist`),
      infoPlist
    );
    
    // Create DMG
    await this.runCommand('hdiutil', [
      'create',
      '-volname', this.options.name,
      '-srcfolder', dmgDir,
      '-ov',
      '-format', 'UDZO',
      outputPath
    ]);
    
    // Cleanup
    await fs.rm(dmgDir, { recursive: true, force: true });
  }

  async createPkg(outputPath) {
    const pkgDir = path.join(this.options.outputDir, 'pkg-build');
    
    // Create package structure
    await fs.mkdir(path.join(pkgDir, 'payload/usr/local/bin'), { recursive: true });
    
    // Copy files
    await this.copyFiles(
      this.options.inputDir,
      path.join(pkgDir, 'payload/usr/local/bin')
    );
    
    // Build package
    await this.runCommand('pkgbuild', [
      '--root', path.join(pkgDir, 'payload'),
      '--identifier', `io.mcps.${this.options.name}`,
      '--version', this.options.version,
      '--install-location', '/',
      outputPath
    ]);
    
    // Cleanup
    await fs.rm(pkgDir, { recursive: true, force: true });
  }

  async createExe(outputPath) {
    // Create NSIS script
    const nsisScript = `
!define PRODUCT_NAME "${this.options.name}"
!define PRODUCT_VERSION "${this.options.version}"
!define PRODUCT_PUBLISHER "MCPS Team"

Name "\${PRODUCT_NAME} \${PRODUCT_VERSION}"
OutFile "${outputPath}"
InstallDir "$PROGRAMFILES64\\MCPS"
RequestExecutionLevel admin

Section "MainSection" SEC01
    SetOutPath "$INSTDIR"
    File /r "${this.options.inputDir}\\*.*"
    
    ; Create shortcuts
    CreateDirectory "$SMPROGRAMS\\MCPS"
    CreateShortcut "$SMPROGRAMS\\MCPS\\MCPS.lnk" "$INSTDIR\\mcps.exe"
    CreateShortcut "$DESKTOP\\MCPS.lnk" "$INSTDIR\\mcps.exe"
    
    ; Write uninstaller
    WriteUninstaller "$INSTDIR\\uninstall.exe"
    
    ; Registry
    WriteRegStr HKLM "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\MCPS" "DisplayName" "MCPS"
    WriteRegStr HKLM "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\MCPS" "UninstallString" "$INSTDIR\\uninstall.exe"
    WriteRegStr HKLM "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\MCPS" "DisplayVersion" "\${PRODUCT_VERSION}"
    WriteRegStr HKLM "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\MCPS" "Publisher" "\${PRODUCT_PUBLISHER}"
SectionEnd

Section "Uninstall"
    Delete "$INSTDIR\\*.*"
    RMDir "$INSTDIR"
    
    Delete "$SMPROGRAMS\\MCPS\\*.*"
    RMDir "$SMPROGRAMS\\MCPS"
    Delete "$DESKTOP\\MCPS.lnk"
    
    DeleteRegKey HKLM "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\MCPS"
SectionEnd
`;
    
    const scriptPath = path.join(this.options.outputDir, 'installer.nsi');
    await fs.writeFile(scriptPath, nsisScript);
    
    // Build installer
    await this.runCommand('makensis', [scriptPath]);
    
    // Cleanup
    await fs.unlink(scriptPath);
  }

  async createMsi(outputPath) {
    console.warn('    MSI creation not yet implemented, creating ZIP instead');
    await this.createZip(outputPath.replace('.msi', '.zip'));
  }

  async createAppImage(outputPath) {
    const appDir = path.join(this.options.outputDir, `${this.options.name}.AppDir`);
    
    // Create AppImage structure
    await fs.mkdir(path.join(appDir, 'usr/bin'), { recursive: true });
    await fs.mkdir(path.join(appDir, 'usr/share/applications'), { recursive: true });
    await fs.mkdir(path.join(appDir, 'usr/share/icons/hicolor/256x256/apps'), { recursive: true });
    
    // Copy files
    await this.copyFiles(
      this.options.inputDir,
      path.join(appDir, 'usr/bin')
    );
    
    // Create desktop entry
    const desktop = `[Desktop Entry]
Type=Application
Name=${this.options.name}
Exec=${this.options.name}
Icon=${this.options.name}
Categories=Development;
`;
    
    await fs.writeFile(
      path.join(appDir, 'usr/share/applications', `${this.options.name}.desktop`),
      desktop
    );
    
    // Create AppRun
    const appRun = `#!/bin/sh
SELF=$(readlink -f "$0")
HERE=\${SELF%/*}
export PATH="${HERE}/usr/bin:${PATH}"
exec "${HERE}/usr/bin/${this.options.name}" "$@"
`;
    
    await fs.writeFile(path.join(appDir, 'AppRun'), appRun);
    await fs.chmod(path.join(appDir, 'AppRun'), 0o755);
    
    // Build AppImage
    await this.runCommand('appimagetool', [appDir, outputPath]);
    
    // Cleanup
    await fs.rm(appDir, { recursive: true, force: true });
  }

  async generateChecksums() {
    console.log('  Generating checksums...');
    
    const checksums = {
      sha256: {},
      sha512: {}
    };
    
    for (const artifact of this.artifacts) {
      const content = await fs.readFile(artifact.path);
      checksums.sha256[artifact.name] = crypto.createHash('sha256').update(content).digest('hex');
      checksums.sha512[artifact.name] = crypto.createHash('sha512').update(content).digest('hex');
    }
    
    // Write checksum files
    const sha256Content = Object.entries(checksums.sha256)
      .map(([file, hash]) => `${hash}  ${file}`)
      .join('\n');
    
    const sha512Content = Object.entries(checksums.sha512)
      .map(([file, hash]) => `${hash}  ${file}`)
      .join('\n');
    
    await fs.writeFile(
      path.join(this.options.outputDir, 'SHA256SUMS'),
      sha256Content + '\n'
    );
    
    await fs.writeFile(
      path.join(this.options.outputDir, 'SHA512SUMS'),
      sha512Content + '\n'
    );
    
    console.log('    ✓ Generated SHA256 and SHA512 checksums');
  }

  async signPackages() {
    console.log('  Signing packages...');
    
    // Check if GPG is available
    if (!await this.commandExists('gpg')) {
      console.warn('    ⚠️  GPG not found, skipping signing');
      return;
    }
    
    // Sign checksum files
    const files = ['SHA256SUMS', 'SHA512SUMS'];
    
    for (const file of files) {
      const filePath = path.join(this.options.outputDir, file);
      
      try {
        await this.runCommand('gpg', [
          '--detach-sign',
          '--armor',
          '--local-user', this.options.signingKey || 'MCPS Team',
          filePath
        ]);
        console.log(`    ✓ Signed ${file}`);
      } catch (error) {
        console.warn(`    ⚠️  Failed to sign ${file}: ${error.message}`);
      }
    }
  }

  async generateManifest() {
    console.log('  Generating manifest...');
    
    const manifest = {
      name: this.options.name,
      version: this.options.version,
      platform: this.options.platform,
      arch: this.options.arch,
      timestamp: new Date().toISOString(),
      artifacts: this.artifacts.map(a => ({
        name: a.name,
        format: a.format,
        size: a.size,
        sha256: crypto.createHash('sha256').update(fs.readFileSync(a.path)).digest('hex')
      }))
    };
    
    await fs.writeFile(
      path.join(this.options.outputDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2)
    );
    
    console.log('    ✓ Generated manifest.json');
  }

  // Utility methods
  async copyFiles(source, dest) {
    await fs.cp(source, dest, { recursive: true });
  }

  async runCommand(command, args, options = {}) {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, {
        stdio: options.silent ? 'pipe' : 'inherit',
        ...options
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
}

// Export for use in build script
module.exports = {
  package: async (options) => {
    const builder = new PackageBuilder(options);
    return await builder.package();
  },
  PackageBuilder
};

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {
    platform: args.find(a => a.startsWith('--platform='))?.split('=')[1],
    arch: args.find(a => a.startsWith('--arch='))?.split('=')[1],
    version: args.find(a => a.startsWith('--version='))?.split('=')[1],
    formats: args.find(a => a.startsWith('--formats='))?.split('=')[1]?.split(',')
  };
  
  const builder = new PackageBuilder(options);
  builder.package().catch(console.error);
}