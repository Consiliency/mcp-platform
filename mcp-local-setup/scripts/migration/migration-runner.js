#!/usr/bin/env node

/**
 * Migration Runner
 * Executes configuration migrations between versions
 */

const fs = require('fs').promises;
const path = require('path');
const ConfigurationManager = require('../../config/advanced/configuration-manager');

class MigrationRunner {
    constructor(options = {}) {
        this.configManager = new ConfigurationManager(options);
        this.migrationsPath = options.migrationsPath || __dirname;
        this.dryRun = options.dryRun || false;
    }

    /**
     * Run migrations for a specific environment
     * @param {string} environment - Environment to migrate
     * @param {string} targetVersion - Target version to migrate to
     * @returns {Promise<Object>} Migration results
     */
    async runMigration(environment, targetVersion) {
        console.log(`Starting migration for environment: ${environment}`);
        
        // Load current configuration
        const config = await this.configManager.loadConfig(environment);
        const currentVersion = config.version;
        
        console.log(`Current version: ${currentVersion}`);
        console.log(`Target version: ${targetVersion}`);
        
        // Find migration path
        const migrationPath = await this.findMigrationPath(currentVersion, targetVersion);
        
        if (migrationPath.length === 0) {
            throw new Error(`No migration path found from ${currentVersion} to ${targetVersion}`);
        }
        
        console.log(`Migration path: ${migrationPath.join(' -> ')}`);
        
        // Execute migrations in sequence
        let migratedConfig = config;
        const results = [];
        
        for (let i = 0; i < migrationPath.length - 1; i++) {
            const fromVersion = migrationPath[i];
            const toVersion = migrationPath[i + 1];
            
            console.log(`\nMigrating from ${fromVersion} to ${toVersion}...`);
            
            const result = await this.configManager.migrateConfig(
                migratedConfig,
                fromVersion,
                toVersion
            );
            
            if (!result.success) {
                throw new Error(`Migration failed: ${result.error}`);
            }
            
            results.push(result);
            migratedConfig = result.config;
            
            // Log changes
            result.changes.forEach(change => {
                console.log(`  ✓ ${change}`);
            });
            
            // Log warnings
            if (result.warnings && result.warnings.length > 0) {
                result.warnings.forEach(warning => {
                    console.warn(`  ⚠ ${warning.message}`);
                });
            }
        }
        
        // Save migrated configuration
        if (!this.dryRun) {
            await this.configManager.saveConfig(migratedConfig, environment, {
                backup: true,
                validate: true
            });
            console.log(`\n✅ Migration completed successfully!`);
        } else {
            console.log(`\n🔍 Dry run completed. No changes were saved.`);
        }
        
        return {
            success: true,
            fromVersion: currentVersion,
            toVersion: targetVersion,
            migrationPath,
            results,
            finalConfig: migratedConfig
        };
    }

    /**
     * Find available migrations
     * @returns {Promise<Array>} List of available migrations
     */
    async findAvailableMigrations() {
        const files = await fs.readdir(this.migrationsPath);
        const migrations = [];
        
        const migrationPattern = /^migrate-(.+)-to-(.+)\.js$/;
        
        for (const file of files) {
            const match = file.match(migrationPattern);
            if (match) {
                migrations.push({
                    file,
                    fromVersion: match[1],
                    toVersion: match[2]
                });
            }
        }
        
        return migrations;
    }

    /**
     * Find migration path between versions
     * @param {string} fromVersion - Starting version
     * @param {string} toVersion - Target version
     * @returns {Promise<Array>} Ordered list of versions to migrate through
     */
    async findMigrationPath(fromVersion, toVersion) {
        const migrations = await this.findAvailableMigrations();
        
        // Build version graph
        const graph = new Map();
        
        for (const migration of migrations) {
            if (!graph.has(migration.fromVersion)) {
                graph.set(migration.fromVersion, []);
            }
            graph.get(migration.fromVersion).push(migration.toVersion);
        }
        
        // Find path using BFS
        const queue = [[fromVersion]];
        const visited = new Set([fromVersion]);
        
        while (queue.length > 0) {
            const path = queue.shift();
            const current = path[path.length - 1];
            
            if (current === toVersion) {
                return path;
            }
            
            const neighbors = graph.get(current) || [];
            for (const neighbor of neighbors) {
                if (!visited.has(neighbor)) {
                    visited.add(neighbor);
                    queue.push([...path, neighbor]);
                }
            }
        }
        
        return [];
    }

    /**
     * Create a new migration file
     * @param {string} fromVersion - Source version
     * @param {string} toVersion - Target version
     * @returns {Promise<string>} Path to created file
     */
    async createMigrationTemplate(fromVersion, toVersion) {
        const fileName = `migrate-${fromVersion}-to-${toVersion}.js`;
        const filePath = path.join(this.migrationsPath, fileName);
        
        const template = `/**
 * Migration from version ${fromVersion} to ${toVersion}
 * 
 * Changes:
 * - TODO: Document changes
 */

const migrate = async (config) => {
    const result = {
        success: true,
        config: { ...config },
        changes: [],
        warnings: []
    };

    try {
        // Update version
        result.config.version = '${toVersion}';
        result.changes.push('Updated version from ${fromVersion} to ${toVersion}');

        // TODO: Add migration logic here
        
        // Example: Add new field
        // if (!result.config.newField) {
        //     result.config.newField = 'defaultValue';
        //     result.changes.push('Added newField with default value');
        // }

    } catch (error) {
        result.success = false;
        result.error = error.message;
    }

    return result;
};

module.exports = { migrate };`;

        await fs.writeFile(filePath, template);
        console.log(`Created migration template: ${filePath}`);
        
        return filePath;
    }

    /**
     * Validate a migration
     * @param {string} fromVersion - Source version
     * @param {string} toVersion - Target version
     * @returns {Promise<Object>} Validation results
     */
    async validateMigration(fromVersion, toVersion) {
        const migrationPath = path.join(
            this.migrationsPath,
            `migrate-${fromVersion}-to-${toVersion}.js`
        );
        
        try {
            const migration = require(migrationPath);
            
            if (typeof migration.migrate !== 'function') {
                return {
                    valid: false,
                    error: 'Migration must export a migrate function'
                };
            }
            
            // Test with sample config
            const testConfig = {
                version: fromVersion,
                test: true
            };
            
            const result = await migration.migrate(testConfig);
            
            if (!result || typeof result !== 'object') {
                return {
                    valid: false,
                    error: 'Migration must return a result object'
                };
            }
            
            if (!('success' in result)) {
                return {
                    valid: false,
                    error: 'Migration result must include success property'
                };
            }
            
            return {
                valid: true,
                message: 'Migration is valid'
            };
            
        } catch (error) {
            return {
                valid: false,
                error: error.message
            };
        }
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];
    
    const runner = new MigrationRunner({
        dryRun: args.includes('--dry-run')
    });
    
    const printUsage = () => {
        console.log(`
Usage: migration-runner <command> [options]

Commands:
  run <environment> <target-version>  Run migration for an environment
  list                               List available migrations
  create <from> <to>                 Create migration template
  validate <from> <to>               Validate a migration
  path <from> <to>                   Show migration path

Options:
  --dry-run                          Preview changes without saving
        `);
    };
    
    const main = async () => {
        try {
            switch (command) {
                case 'run':
                    if (args.length < 3) {
                        throw new Error('Environment and target version required');
                    }
                    await runner.runMigration(args[1], args[2]);
                    break;
                    
                case 'list':
                    const migrations = await runner.findAvailableMigrations();
                    console.log('\nAvailable migrations:');
                    migrations.forEach(m => {
                        console.log(`  ${m.fromVersion} -> ${m.toVersion}`);
                    });
                    break;
                    
                case 'create':
                    if (args.length < 3) {
                        throw new Error('From and to versions required');
                    }
                    await runner.createMigrationTemplate(args[1], args[2]);
                    break;
                    
                case 'validate':
                    if (args.length < 3) {
                        throw new Error('From and to versions required');
                    }
                    const validation = await runner.validateMigration(args[1], args[2]);
                    console.log(validation.valid ? '✅ ' + validation.message : '❌ ' + validation.error);
                    break;
                    
                case 'path':
                    if (args.length < 3) {
                        throw new Error('From and to versions required');
                    }
                    const path = await runner.findMigrationPath(args[1], args[2]);
                    console.log(`Migration path: ${path.join(' -> ')}`);
                    break;
                    
                default:
                    printUsage();
            }
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    };
    
    main();
}

module.exports = MigrationRunner;