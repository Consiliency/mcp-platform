#!/usr/bin/env node

/**
 * Migration 001: Add Dependencies and Enhanced Fields
 * 
 * This migration upgrades catalog from v1.0 to v2.0 format by adding:
 * - Service version field
 * - Dependencies array
 * - Health check configuration
 * - Lifecycle configuration
 * - Version compatibility matrix
 */

const fs = require('fs');
const path = require('path');

class Migration001 {
  constructor() {
    this.name = '001-add-dependencies';
    this.description = 'Add dependencies and enhanced fields to service definitions';
    this.fromVersion = '1.0';
    this.toVersion = '2.0';
  }

  /**
   * Generate a version based on source type
   * @param {Object} source - Source configuration
   * @returns {string} Version string
   */
  generateVersion(source) {
    if (source.type === 'npm' && source.version === 'latest') {
      return '1.0.0';
    }
    if (source.type === 'local') {
      return '0.1.0';
    }
    return '1.0.0';
  }

  /**
   * Generate default health check configuration
   * @param {Object} service - Service object
   * @returns {Object} Health check config
   */
  generateHealthCheck(service) {
    // Customize based on service characteristics
    const baseConfig = {
      path: '/health',
      interval: '30s',
      timeout: '5s',
      retries: 3,
      startPeriod: '30s'
    };

    // Services that might take longer to start
    if (service.id === 'playwright' || service.id === 'google-drive') {
      baseConfig.timeout = '10s';
      baseConfig.startPeriod = '60s';
    }

    // Database services might need more time
    if (service.category === 'data' && service.id !== 'filesystem') {
      baseConfig.startPeriod = '45s';
    }

    return baseConfig;
  }

  /**
   * Generate default lifecycle configuration
   * @param {Object} service - Service object
   * @returns {Object} Lifecycle config
   */
  generateLifecycle(service) {
    const baseConfig = {
      startupTimeout: '60s',
      shutdownGracePeriod: '30s',
      restartPolicy: 'unless-stopped'
    };

    // Services that might take longer to start
    if (service.id === 'playwright') {
      baseConfig.startupTimeout = '120s';
    }

    if (service.id === 'google-drive' || (service.dependencies && service.dependencies.length > 0)) {
      baseConfig.startupTimeout = '90s';
    }

    return baseConfig;
  }

  /**
   * Infer dependencies based on service configuration
   * @param {Object} service - Service object
   * @returns {Array} Dependencies array
   */
  inferDependencies(service) {
    const dependencies = [];

    // Check environment variables for database connections
    if (service.config && service.config.environment) {
      const env = service.config.environment;
      if (env.POSTGRES_URL || env.DATABASE_URL) {
        // Don't add postgres as its own dependency
        if (service.id !== 'postgres') {
          dependencies.push('postgres');
        }
      }
    }

    return dependencies;
  }

  /**
   * Migrate a single service to enhanced format
   * @param {Object} service - Original service object
   * @returns {Object} Enhanced service object
   */
  migrateService(service) {
    const enhanced = { ...service };

    // Add version if missing
    if (!enhanced.version) {
      enhanced.version = this.generateVersion(service.source);
    }

    // Add dependencies if missing
    if (!enhanced.dependencies) {
      enhanced.dependencies = this.inferDependencies(service);
    }

    // Add health check configuration if missing
    if (!enhanced.healthCheck) {
      enhanced.healthCheck = this.generateHealthCheck(service);
    }

    // Add lifecycle configuration if missing
    if (!enhanced.lifecycle) {
      enhanced.lifecycle = this.generateLifecycle(service);
    }

    // Add default tags if missing
    if (!enhanced.tags) {
      enhanced.tags = [];
      
      // Add category as tag
      if (service.category) {
        enhanced.tags.push(service.category);
      }

      // Add source type as tag
      if (service.source && service.source.type) {
        enhanced.tags.push(service.source.type);
      }

      // Add specific tags based on service
      if (service.id === 'filesystem') {
        enhanced.tags.push('filesystem', 'storage', 'io');
      } else if (service.id === 'git') {
        enhanced.tags.push('git', 'vcs', 'version-control');
      } else if (service.id === 'postgres') {
        enhanced.tags.push('database', 'sql', 'postgres', 'rdbms');
      }
    }

    return enhanced;
  }

  /**
   * Generate version compatibility matrix
   * @returns {Object} Version compatibility configuration
   */
  generateVersionCompatibility() {
    return {
      '1.0.0': {
        minProtocolVersion: '1.0',
        maxProtocolVersion: '1.0',
        compatibleClients: {
          'claude-code': '>=1.0.0',
          'vs-code': '>=1.0.0',
          'cursor': '>=1.0.0'
        }
      },
      '0.1.0': {
        minProtocolVersion: '0.9',
        maxProtocolVersion: '1.0',
        compatibleClients: {
          'claude-code': '>=0.9.0',
          'vs-code': '>=0.9.0',
          'cursor': '>=0.9.0'
        },
        notes: 'Beta version - may have breaking changes'
      }
    };
  }

  /**
   * Run the migration
   * @param {Object} catalog - Original catalog
   * @returns {Object} Migrated catalog
   */
  up(catalog) {
    if (catalog.version !== this.fromVersion) {
      throw new Error(`Expected catalog version ${this.fromVersion}, got ${catalog.version}`);
    }

    const migrated = {
      version: this.toVersion,
      updated: new Date().toISOString().split('T')[0],
      schemaVersion: 'enhanced-service.schema.json',
      categories: catalog.categories,
      servers: catalog.servers.map(service => this.migrateService(service)),
      templates: catalog.templates,
      versionCompatibility: this.generateVersionCompatibility()
    };

    return migrated;
  }

  /**
   * Reverse the migration
   * @param {Object} catalog - Enhanced catalog
   * @returns {Object} Original format catalog
   */
  down(catalog) {
    if (catalog.version !== this.toVersion) {
      throw new Error(`Expected catalog version ${this.toVersion}, got ${catalog.version}`);
    }

    const reverted = {
      version: this.fromVersion,
      updated: catalog.updated,
      categories: catalog.categories,
      servers: catalog.servers.map(service => {
        const { version, dependencies, healthCheck, lifecycle, tags, ...base } = service;
        return base;
      }),
      templates: catalog.templates
    };

    return reverted;
  }

  /**
   * Validate the migration result
   * @param {Object} original - Original catalog
   * @param {Object} migrated - Migrated catalog
   * @returns {Object} Validation result
   */
  validate(original, migrated) {
    const issues = [];

    // Check that all original services are present
    const originalIds = new Set(original.servers.map(s => s.id));
    const migratedIds = new Set(migrated.servers.map(s => s.id));

    for (const id of originalIds) {
      if (!migratedIds.has(id)) {
        issues.push(`Service ${id} missing in migrated catalog`);
      }
    }

    // Check that all services have required new fields
    for (const service of migrated.servers) {
      if (!service.version) {
        issues.push(`Service ${service.id} missing version`);
      }
      if (!service.dependencies) {
        issues.push(`Service ${service.id} missing dependencies array`);
      }
      if (!service.healthCheck) {
        issues.push(`Service ${service.id} missing healthCheck`);
      }
      if (!service.lifecycle) {
        issues.push(`Service ${service.id} missing lifecycle`);
      }
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log('Usage: node 001-add-dependencies.js <input-file> <output-file> [--validate]');
    console.log('Example: node 001-add-dependencies.js ../mcp-catalog.json ../enhanced-catalog.json');
    console.log('');
    console.log('Options:');
    console.log('  --validate    Run validation after migration');
    console.log('  --dry-run     Show what would be changed without writing');
    process.exit(1);
  }

  const inputFile = path.resolve(args[0]);
  const outputFile = path.resolve(args[1]);
  const validate = args.includes('--validate');
  const dryRun = args.includes('--dry-run');

  const migration = new Migration001();

  try {
    console.log(`Migration: ${migration.name}`);
    console.log(`Description: ${migration.description}`);
    console.log(`From version: ${migration.fromVersion} → ${migration.toVersion}`);
    console.log('');

    // Read input catalog
    console.log(`Reading: ${inputFile}`);
    const originalCatalog = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

    // Run migration
    console.log('Running migration...');
    const migratedCatalog = migration.up(originalCatalog);

    // Validate if requested
    if (validate) {
      console.log('Validating migration...');
      const validation = migration.validate(originalCatalog, migratedCatalog);
      
      if (!validation.valid) {
        console.error('❌ Validation failed!');
        validation.issues.forEach(issue => console.error(`   - ${issue}`));
        process.exit(1);
      }
      console.log('✅ Validation passed!');
    }

    // Write output
    if (!dryRun) {
      console.log(`Writing: ${outputFile}`);
      fs.writeFileSync(outputFile, JSON.stringify(migratedCatalog, null, 2));
      console.log('✅ Migration completed successfully!');
    } else {
      console.log('\n--- DRY RUN - No files written ---');
      console.log('\nSample migrated service:');
      console.log(JSON.stringify(migratedCatalog.servers[0], null, 2));
    }

    // Show summary
    console.log('\n📊 Summary:');
    console.log(`   Services migrated: ${migratedCatalog.servers.length}`);
    console.log(`   Services with dependencies: ${migratedCatalog.servers.filter(s => s.dependencies.length > 0).length}`);
    console.log(`   New fields added: version, dependencies, healthCheck, lifecycle, tags`);

  } catch (error) {
    console.error(`❌ Migration failed: ${error.message}`);
    process.exit(1);
  }
}

module.exports = Migration001;