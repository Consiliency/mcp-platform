/**
 * Service Publishing Command
 * MARKET-4.2: Service validation, metadata management, version control
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const semver = require('semver');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class PublishCommand {
  constructor(options = {}) {
    this.registryPath = options.registryPath || path.join(__dirname, '../../registry');
    this.catalogPath = path.join(this.registryPath, 'enhanced-catalog.json');
    this.publishedPath = path.join(this.registryPath, 'published');
    this.tempPath = path.join(this.registryPath, '.temp');
  }

  /**
   * Initialize publishing system
   */
  async initialize() {
    await fs.mkdir(this.publishedPath, { recursive: true });
    await fs.mkdir(this.tempPath, { recursive: true });
  }

  /**
   * Execute publish command
   */
  async execute(args, options) {
    try {
      await this.initialize();

      const servicePath = args[0] || process.cwd();
      const publishOptions = {
        version: options.version,
        tag: options.tag || 'latest',
        force: options.force || false,
        dryRun: options.dryRun || false,
        registry: options.registry || 'local'
      };

      console.log(`Publishing service from: ${servicePath}`);

      // Step 1: Validate service
      const validation = await this.validateService(servicePath);
      if (!validation.valid) {
        throw new Error(`Service validation failed:\n${validation.errors.join('\n')}`);
      }

      // Step 2: Read and enhance metadata
      const metadata = await this._readServiceMetadata(servicePath);
      const enhancedMetadata = await this.manageMetadata(metadata);

      // Step 3: Handle versioning
      const versionInfo = await this.handleVersioning(enhancedMetadata.version);
      enhancedMetadata.version = versionInfo.version;
      enhancedMetadata.previousVersions = versionInfo.previousVersions;

      // Step 4: Package service
      const packageInfo = await this._packageService(servicePath, enhancedMetadata);

      // Step 5: Publish to registry
      if (!publishOptions.dryRun) {
        await this._publishToRegistry(packageInfo, enhancedMetadata, publishOptions);
        console.log(`Successfully published ${enhancedMetadata.name}@${enhancedMetadata.version}`);
      } else {
        console.log('Dry run completed successfully. No changes were made.');
      }

      return {
        success: true,
        service: enhancedMetadata.name,
        version: enhancedMetadata.version,
        packageId: packageInfo.id,
        registry: publishOptions.registry
      };

    } catch (error) {
      console.error('Publishing failed:', error.message);
      throw error;
    }
  }

  /**
   * Validate service before publishing
   */
  async validateService(servicePath) {
    const errors = [];
    const warnings = [];

    try {
      // Check if path exists
      const stats = await fs.stat(servicePath);
      if (!stats.isDirectory()) {
        errors.push('Service path must be a directory');
      }

      // Check for required files
      const requiredFiles = ['package.json', 'mcp.json'];
      for (const file of requiredFiles) {
        try {
          await fs.access(path.join(servicePath, file));
        } catch {
          errors.push(`Missing required file: ${file}`);
        }
      }

      // Validate package.json
      const packageJsonPath = path.join(servicePath, 'package.json');
      try {
        const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
        
        if (!packageJson.name) errors.push('package.json must have a name field');
        if (!packageJson.version) errors.push('package.json must have a version field');
        if (!semver.valid(packageJson.version)) errors.push('Invalid version format in package.json');
        
        // Check for MCP-specific fields
        if (!packageJson.mcp) warnings.push('package.json should have an mcp field');
        
      } catch (error) {
        errors.push(`Invalid package.json: ${error.message}`);
      }

      // Validate mcp.json
      const mcpJsonPath = path.join(servicePath, 'mcp.json');
      try {
        const mcpJson = JSON.parse(await fs.readFile(mcpJsonPath, 'utf-8'));
        
        if (!mcpJson.name) errors.push('mcp.json must have a name field');
        if (!mcpJson.description) errors.push('mcp.json must have a description field');
        if (!mcpJson.category) warnings.push('mcp.json should have a category field');
        if (!mcpJson.source) errors.push('mcp.json must have a source field');
        
        // Validate source configuration
        if (mcpJson.source) {
          if (!mcpJson.source.type) errors.push('source must have a type field');
          if (!['npm', 'git', 'local'].includes(mcpJson.source.type)) {
            errors.push(`Invalid source type: ${mcpJson.source.type}`);
          }
        }
        
      } catch (error) {
        errors.push(`Invalid mcp.json: ${error.message}`);
      }

      // Check for README
      try {
        await fs.access(path.join(servicePath, 'README.md'));
      } catch {
        warnings.push('No README.md found - documentation is recommended');
      }

      // Check for tests
      const testPaths = ['test', 'tests', '__tests__'];
      let hasTests = false;
      for (const testPath of testPaths) {
        try {
          await fs.access(path.join(servicePath, testPath));
          hasTests = true;
          break;
        } catch {
          // Continue checking
        }
      }
      if (!hasTests) {
        warnings.push('No test directory found - tests are recommended');
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings
      };

    } catch (error) {
      errors.push(`Validation error: ${error.message}`);
      return {
        valid: false,
        errors,
        warnings
      };
    }
  }

  /**
   * Manage service metadata
   */
  async manageMetadata(metadata) {
    const enhanced = { ...metadata };

    // Add publishing metadata
    enhanced.publishedAt = new Date().toISOString();
    enhanced.publisher = process.env.USER || 'unknown';
    
    // Generate unique ID if not present
    if (!enhanced.id) {
      enhanced.id = metadata.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    }

    // Add default values
    enhanced.featured = enhanced.featured || false;
    enhanced.tags = enhanced.tags || [];
    enhanced.dependencies = enhanced.dependencies || [];
    enhanced.requirements = enhanced.requirements || {};

    // Add community defaults
    enhanced.community = enhanced.community || {
      rating: 0,
      downloads: 0,
      reviews: []
    };

    // Validate and normalize category
    const validCategories = ['development', 'data', 'ai-ml', 'cloud', 'custom'];
    if (!enhanced.category || !validCategories.includes(enhanced.category)) {
      enhanced.category = 'custom';
    }

    // Add documentation links
    if (!enhanced.documentation) {
      enhanced.documentation = {
        readme: 'README.md',
        api: null,
        examples: []
      };
    }

    // Calculate checksum for integrity
    enhanced.checksum = await this._calculateChecksum(metadata);

    return enhanced;
  }

  /**
   * Handle version control
   */
  async handleVersioning(version) {
    try {
      // Validate version format
      if (!semver.valid(version)) {
        throw new Error(`Invalid version format: ${version}`);
      }

      // Load existing catalog
      const catalog = await this._loadCatalog();
      
      // Find existing service
      const existingService = catalog.servers?.find(s => s.id === version.id);
      const previousVersions = [];

      if (existingService) {
        // Check version compatibility
        if (semver.lte(version, existingService.version)) {
          throw new Error(
            `New version (${version}) must be greater than existing version (${existingService.version})`
          );
        }

        // Store previous versions
        if (existingService.previousVersions) {
          previousVersions.push(...existingService.previousVersions);
        }
        previousVersions.push({
          version: existingService.version,
          publishedAt: existingService.publishedAt || new Date().toISOString(),
          deprecated: false
        });

        // Check for breaking changes
        const majorBump = semver.major(version) > semver.major(existingService.version);
        if (majorBump) {
          console.warn('Major version bump detected - ensure breaking changes are documented');
        }
      }

      return {
        version,
        previousVersions,
        isNewService: !existingService,
        versionBump: existingService ? semver.diff(existingService.version, version) : null
      };

    } catch (error) {
      throw new Error(`Version handling failed: ${error.message}`);
    }
  }

  /**
   * Read service metadata from files
   * @private
   */
  async _readServiceMetadata(servicePath) {
    const packageJson = JSON.parse(
      await fs.readFile(path.join(servicePath, 'package.json'), 'utf-8')
    );
    const mcpJson = JSON.parse(
      await fs.readFile(path.join(servicePath, 'mcp.json'), 'utf-8')
    );

    // Merge metadata
    return {
      ...mcpJson,
      version: packageJson.version,
      packageName: packageJson.name,
      dependencies: packageJson.dependencies || {},
      engines: packageJson.engines || {}
    };
  }

  /**
   * Package service for publishing
   * @private
   */
  async _packageService(servicePath, metadata) {
    const packageId = `${metadata.id}-${metadata.version}-${Date.now()}`;
    const packagePath = path.join(this.tempPath, packageId);

    try {
      // Create package directory
      await fs.mkdir(packagePath, { recursive: true });

      // Copy service files
      await execAsync(`cp -r ${servicePath}/* ${packagePath}/`);

      // Create package manifest
      const manifest = {
        id: packageId,
        service: metadata.id,
        version: metadata.version,
        created: new Date().toISOString(),
        files: await this._listPackageFiles(packagePath),
        checksum: metadata.checksum
      };

      await fs.writeFile(
        path.join(packagePath, 'package-manifest.json'),
        JSON.stringify(manifest, null, 2)
      );

      // Create tarball
      const tarballName = `${metadata.id}-${metadata.version}.tgz`;
      const tarballPath = path.join(this.publishedPath, tarballName);
      
      await execAsync(`tar -czf ${tarballPath} -C ${this.tempPath} ${packageId}`);

      // Clean up temp directory
      await execAsync(`rm -rf ${packagePath}`);

      return {
        id: packageId,
        path: tarballPath,
        manifest
      };

    } catch (error) {
      // Clean up on error
      try {
        await execAsync(`rm -rf ${packagePath}`);
      } catch {
        // Ignore cleanup errors
      }
      throw new Error(`Packaging failed: ${error.message}`);
    }
  }

  /**
   * Publish to registry
   * @private
   */
  async _publishToRegistry(packageInfo, metadata, options) {
    // Load and update catalog
    const catalog = await this._loadCatalog();
    
    // Find existing service index
    const existingIndex = catalog.servers?.findIndex(s => s.id === metadata.id);
    
    if (existingIndex >= 0) {
      // Update existing service
      catalog.servers[existingIndex] = metadata;
    } else {
      // Add new service
      if (!catalog.servers) catalog.servers = [];
      catalog.servers.push(metadata);
    }

    // Update catalog metadata
    catalog.updated = new Date().toISOString();
    
    // Write updated catalog
    await fs.writeFile(this.catalogPath, JSON.stringify(catalog, null, 2));

    // Store package info
    const packageRegistry = path.join(this.publishedPath, 'packages.json');
    let packages = {};
    
    try {
      packages = JSON.parse(await fs.readFile(packageRegistry, 'utf-8'));
    } catch {
      // File doesn't exist yet
    }

    if (!packages[metadata.id]) packages[metadata.id] = {};
    packages[metadata.id][metadata.version] = {
      packageId: packageInfo.id,
      path: packageInfo.path,
      publishedAt: metadata.publishedAt,
      manifest: packageInfo.manifest
    };

    await fs.writeFile(packageRegistry, JSON.stringify(packages, null, 2));
  }

  /**
   * Load catalog
   * @private
   */
  async _loadCatalog() {
    try {
      const data = await fs.readFile(this.catalogPath, 'utf-8');
      return JSON.parse(data);
    } catch {
      return {
        version: "2.0",
        updated: new Date().toISOString(),
        servers: []
      };
    }
  }

  /**
   * List package files
   * @private
   */
  async _listPackageFiles(packagePath) {
    const files = [];
    
    async function walk(dir, base = '') {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.join(base, entry.name);
        
        if (entry.isDirectory()) {
          // Skip node_modules and hidden directories
          if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
            await walk(fullPath, relativePath);
          }
        } else {
          const stats = await fs.stat(fullPath);
          files.push({
            path: relativePath,
            size: stats.size,
            modified: stats.mtime.toISOString()
          });
        }
      }
    }

    await walk(packagePath);
    return files;
  }

  /**
   * Calculate checksum for metadata
   * @private
   */
  async _calculateChecksum(metadata) {
    const content = JSON.stringify({
      name: metadata.name,
      version: metadata.version,
      source: metadata.source
    });
    
    return crypto
      .createHash('sha256')
      .update(content)
      .digest('hex');
  }
}

module.exports = PublishCommand;