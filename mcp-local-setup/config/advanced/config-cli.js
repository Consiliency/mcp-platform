#!/usr/bin/env node

/**
 * Configuration CLI
 * Command-line interface for managing MCP configurations
 */

const ConfigurationManager = require('./configuration-manager');
const ConfigValidator = require('./config-validator');
const SecretManager = require('./secret-manager');
const readline = require('readline');
const path = require('path');
const fs = require('fs').promises;

class ConfigCLI {
    constructor() {
        this.configManager = new ConfigurationManager({
            basePath: path.join(__dirname, 'environments'),
            schemasPath: path.join(__dirname, 'schemas'),
            secretsPath: path.join(__dirname, 'secrets'),
            encryptionKey: process.env.MCP_CONFIG_ENCRYPTION_KEY
        });
        
        this.validator = new ConfigValidator();
        this.secretManager = new SecretManager({
            masterKey: process.env.MCP_CONFIG_ENCRYPTION_KEY ? 
                Buffer.from(process.env.MCP_CONFIG_ENCRYPTION_KEY, 'hex') : undefined
        });
    }

    async run() {
        const args = process.argv.slice(2);
        const command = args[0];
        
        try {
            switch (command) {
                case 'list':
                    await this.listEnvironments();
                    break;
                    
                case 'show':
                    await this.showConfig(args[1]);
                    break;
                    
                case 'create':
                    await this.createEnvironment(args[1]);
                    break;
                    
                case 'delete':
                    await this.deleteEnvironment(args[1]);
                    break;
                    
                case 'validate':
                    await this.validateConfig(args[1]);
                    break;
                    
                case 'export':
                    await this.exportConfig(args[1], args[2]);
                    break;
                    
                case 'import':
                    await this.importConfig(args[1], args[2]);
                    break;
                    
                case 'secret':
                    await this.manageSecret(args.slice(1));
                    break;
                    
                case 'migrate':
                    await this.migrateConfig(args[1], args[2]);
                    break;
                    
                case 'init':
                    await this.initialize();
                    break;
                    
                default:
                    this.showHelp();
            }
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    }

    async listEnvironments() {
        const environments = await this.configManager.listEnvironments();
        
        if (environments.length === 0) {
            console.log('No environments found.');
            return;
        }
        
        console.log('Available environments:');
        for (const env of environments) {
            const metadata = await this.configManager.getConfigMetadata(env);
            console.log(`  - ${env} (v${metadata.version})`);
        }
    }

    async showConfig(environment) {
        if (!environment) {
            console.error('Environment name required');
            return;
        }
        
        const config = await this.configManager.loadConfig(environment, {
            includeSecrets: false
        });
        
        console.log(JSON.stringify(config, null, 2));
    }

    async createEnvironment(environment) {
        if (!environment) {
            console.error('Environment name required');
            return;
        }
        
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        const question = (query) => new Promise(resolve => rl.question(query, resolve));
        
        try {
            const baseConfig = {
                environment,
                version: '1.0.0',
                createdAt: new Date().toISOString()
            };
            
            // Interactive configuration
            baseConfig.server = {
                host: await question('Server host (localhost): ') || 'localhost',
                port: parseInt(await question('Server port (3000): ') || '3000'),
                protocol: await question('Protocol (http/https): ') || 'http'
            };
            
            await this.configManager.createEnvironment(environment, baseConfig);
            console.log(`Environment '${environment}' created successfully.`);
            
        } finally {
            rl.close();
        }
    }

    async deleteEnvironment(environment) {
        if (!environment) {
            console.error('Environment name required');
            return;
        }
        
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        const answer = await new Promise(resolve => 
            rl.question(`Delete environment '${environment}'? (y/N): `, resolve)
        );
        
        rl.close();
        
        if (answer.toLowerCase() === 'y') {
            await this.configManager.deleteEnvironment(environment, { backup: true });
            console.log(`Environment '${environment}' deleted.`);
        } else {
            console.log('Deletion cancelled.');
        }
    }

    async validateConfig(environment) {
        if (!environment) {
            console.error('Environment name required');
            return;
        }
        
        const config = await this.configManager.loadConfig(environment);
        
        // Basic validation
        const result = await this.configManager.validateConfig(config, config.version);
        
        console.log(`\nValidation for environment '${environment}':`);
        console.log(`Status: ${result.valid ? 'VALID' : 'INVALID'}`);
        
        if (result.errors.length > 0) {
            console.log('\nErrors:');
            result.errors.forEach(err => {
                console.log(`  - ${err.path}: ${err.message}`);
            });
        }
        
        if (result.warnings.length > 0) {
            console.log('\nWarnings:');
            result.warnings.forEach(warn => {
                console.log(`  - ${warn.path}: ${warn.message}`);
            });
        }
        
        // Environment-specific validation
        const envResult = this.validator.validateEnvironmentConstraints(config, environment);
        if (!envResult.valid || envResult.warnings.length > 0) {
            console.log(`\nEnvironment-specific validation:`);
            envResult.errors.forEach(err => {
                console.log(`  ERROR - ${err.path}: ${err.message}`);
            });
            envResult.warnings.forEach(warn => {
                console.log(`  WARN - ${warn.path}: ${warn.message}`);
            });
        }
        
        // Security validation
        const secResult = this.validator.validateSecurity(config);
        if (!secResult.valid || secResult.warnings.length > 0) {
            console.log(`\nSecurity validation:`);
            secResult.errors.forEach(err => {
                console.log(`  ERROR - ${err.path}: ${err.message}`);
            });
            secResult.warnings.forEach(warn => {
                console.log(`  WARN - ${warn.path}: ${warn.message}`);
            });
        }
    }

    async exportConfig(environment, format = 'json') {
        if (!environment) {
            console.error('Environment name required');
            return;
        }
        
        const exported = await this.configManager.exportConfig(environment, {
            format,
            includeSecrets: false
        });
        
        console.log(exported);
    }

    async importConfig(environment, filePath) {
        if (!environment || !filePath) {
            console.error('Environment name and file path required');
            return;
        }
        
        const data = await fs.readFile(filePath, 'utf8');
        const format = path.extname(filePath).slice(1) || 'json';
        
        await this.configManager.importConfig(data, environment, {
            format,
            merge: false
        });
        
        console.log(`Configuration imported to environment '${environment}'.`);
    }

    async manageSecret(args) {
        const action = args[0];
        const environment = args[1] || 'development';
        
        switch (action) {
            case 'list':
                const secrets = await this.configManager.listSecrets({ environment });
                console.log(`Secrets in '${environment}':`);
                secrets.forEach(s => {
                    console.log(`  - ${s.key} (created: ${s.createdAt})`);
                });
                break;
                
            case 'set':
                if (args.length < 3) {
                    console.error('Usage: config secret set <environment> <key> [value]');
                    return;
                }
                
                const key = args[2];
                let value = args[3];
                
                if (!value) {
                    // Read from stdin for sensitive input
                    const rl = readline.createInterface({
                        input: process.stdin,
                        output: process.stdout
                    });
                    
                    value = await new Promise(resolve => {
                        rl.question(`Enter value for '${key}': `, resolve);
                    });
                    rl.close();
                }
                
                await this.configManager.setSecrets(
                    { [key]: value },
                    { environment }
                );
                
                console.log(`Secret '${key}' set in environment '${environment}'.`);
                break;
                
            case 'delete':
                if (args.length < 3) {
                    console.error('Usage: config secret delete <environment> <key>');
                    return;
                }
                
                await this.configManager.deleteSecret(args[2], { environment });
                console.log(`Secret '${args[2]}' deleted from environment '${environment}'.`);
                break;
                
            case 'generate':
                const password = this.secretManager.generatePassword({
                    length: parseInt(args[2]) || 32
                });
                console.log(`Generated password: ${password}`);
                break;
                
            default:
                console.error('Unknown secret command. Use: list, set, delete, generate');
        }
    }

    async migrateConfig(environment, targetVersion) {
        if (!environment || !targetVersion) {
            console.error('Environment and target version required');
            return;
        }
        
        const config = await this.configManager.loadConfig(environment);
        const currentVersion = config.version;
        
        console.log(`Migrating '${environment}' from v${currentVersion} to v${targetVersion}...`);
        
        const result = await this.configManager.migrateConfig(
            config,
            currentVersion,
            targetVersion
        );
        
        if (result.success) {
            await this.configManager.saveConfig(result.config, environment, {
                backup: true,
                validate: true
            });
            
            console.log('\nMigration completed successfully!');
            console.log('Changes:');
            result.changes.forEach(change => {
                console.log(`  - ${change}`);
            });
            
            if (result.warnings && result.warnings.length > 0) {
                console.log('\nWarnings:');
                result.warnings.forEach(warn => {
                    console.log(`  - ${warn.message || warn}`);
                });
            }
        } else {
            console.error(`Migration failed: ${result.error}`);
        }
    }

    async initialize() {
        console.log('Initializing MCP configuration system...\n');
        
        // Check encryption key
        if (!process.env.MCP_CONFIG_ENCRYPTION_KEY) {
            console.log('Generating encryption key...');
            const key = this.secretManager.generateKey(32);
            console.log(`\nSet this environment variable:`);
            console.log(`export MCP_CONFIG_ENCRYPTION_KEY="${key.toString('hex')}"\n`);
        }
        
        // Create directories
        const dirs = ['environments', 'schemas', 'secrets'];
        for (const dir of dirs) {
            const dirPath = path.join(__dirname, dir);
            await fs.mkdir(dirPath, { recursive: true });
            console.log(`Created directory: ${dir}/`);
        }
        
        // Check for default schema
        const schemaPath = path.join(__dirname, 'schemas', 'schema.json');
        try {
            await fs.access(schemaPath);
            console.log('Default schema already exists.');
        } catch {
            console.log('Default schema not found. Please create one manually.');
        }
        
        console.log('\nInitialization complete!');
    }

    showHelp() {
        console.log(`
MCP Configuration CLI

Usage: config-cli <command> [options]

Commands:
  init                           Initialize configuration system
  list                          List all environments
  show <env>                    Show configuration for environment
  create <env>                  Create new environment
  delete <env>                  Delete environment
  validate <env>                Validate environment configuration
  export <env> [format]         Export configuration (json/env)
  import <env> <file>           Import configuration from file
  migrate <env> <version>       Migrate configuration to version
  
Secret Management:
  secret list <env>             List secrets for environment
  secret set <env> <key>        Set a secret
  secret delete <env> <key>     Delete a secret
  secret generate [length]      Generate secure password

Environment Variables:
  MCP_CONFIG_ENCRYPTION_KEY     Master key for secret encryption

Examples:
  config-cli init
  config-cli create production
  config-cli validate production
  config-cli secret set production API_KEY
  config-cli migrate production 1.1.0
        `);
    }
}

// Run CLI
if (require.main === module) {
    const cli = new ConfigCLI();
    cli.run();
}

module.exports = ConfigCLI;