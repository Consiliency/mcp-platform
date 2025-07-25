#!/usr/bin/env node
/**
 * MCP Platform CLI
 * Unified command-line interface for managing MCP services
 */

const { program } = require('commander');
const { spawn, execSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const chalk = require('chalk');
const inquirer = require('inquirer');
const ora = require('ora');
const yaml = require('js-yaml');
const os = require('os');
const { addHealthCommand } = require('./commands/health');
const { addTransportCommand } = require('./commands/transport');
const { addServerCommand } = require('./commands/server');
const PluginManager = require('./plugins/core/plugin-manager');

// Configuration
const MCP_HOME = process.env.MCP_HOME || path.join(process.env.HOME, '.mcp-platform');
const DOCKER_COMPOSE_FILE = path.join(MCP_HOME, 'docker-compose.yml');
const PROFILE_MANAGER = path.join(MCP_HOME, 'scripts', 'profile-manager.sh');
const REGISTRY_MANAGER = path.join(MCP_HOME, 'scripts', 'registry-manager.js');
const CURRENT_PROFILE_FILE = path.join(MCP_HOME, '.current-profile');
const ENV_FILE = path.join(MCP_HOME, '.env');

// Utility functions
const fileExists = async (filePath) => {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
};

const runCommand = (command, args = [], options = {}) => {
    return new Promise((resolve, reject) => {
        const proc = spawn(command, args, {
            ...options,
            stdio: options.silent ? 'pipe' : 'inherit'
        });
        
        let output = '';
        if (options.silent) {
            proc.stdout.on('data', (data) => { output += data.toString(); });
            proc.stderr.on('data', (data) => { output += data.toString(); });
        }
        
        proc.on('close', (code) => {
            if (code === 0) {
                resolve(output);
            } else {
                reject(new Error(`Command failed with code ${code}: ${output}`));
            }
        });
    });
};

// Check Docker
const checkDocker = async () => {
    try {
        await runCommand('docker', ['--version'], { silent: true });
        return true;
    } catch {
        return false;
    }
};

// Check if services are running
const checkServicesRunning = async () => {
    try {
        const output = await runCommand('docker', ['compose', '-f', DOCKER_COMPOSE_FILE, 'ps', '--format', 'json'], { 
            silent: true,
            cwd: MCP_HOME 
        });
        const services = output.split('\n').filter(line => line.trim()).map(line => JSON.parse(line));
        return services.filter(s => s.State === 'running').length > 0;
    } catch {
        return false;
    }
};

// Get current profile
const getCurrentProfile = async () => {
    try {
        const profile = await fs.readFile(CURRENT_PROFILE_FILE, 'utf8');
        return profile.trim();
    } catch {
        return 'default';
    }
};

// Add service to profile
const addServiceToProfile = async (profileName, serviceId) => {
    const profilePath = path.join(MCP_HOME, 'profiles', `${profileName}.yml`);
    const profileContent = await fs.readFile(profilePath, 'utf8');
    const profile = yaml.load(profileContent);
    
    if (!profile.services) {
        profile.services = [];
    }
    
    if (!profile.services.includes(serviceId)) {
        profile.services.push(serviceId);
        const updatedYaml = yaml.dump(profile, { indent: 2 });
        await fs.writeFile(profilePath, updatedYaml);
        return true;
    }
    return false;
};

// Update .env file
const updateEnvFile = async (envVars) => {
    let envContent = '';
    
    // Read existing .env if it exists
    if (await fileExists(ENV_FILE)) {
        envContent = await fs.readFile(ENV_FILE, 'utf8');
    }
    
    // Update or add new variables
    for (const [key, value] of Object.entries(envVars)) {
        const regex = new RegExp(`^${key}=.*$`, 'm');
        if (regex.test(envContent)) {
            envContent = envContent.replace(regex, `${key}=${value}`);
        } else {
            envContent += `\n${key}=${value}`;
        }
    }
    
    await fs.writeFile(ENV_FILE, envContent.trim() + '\n');
};

// Load catalog
const loadCatalog = async () => {
    const catalogPath = path.join(MCP_HOME, 'registry', 'mcp-catalog.json');
    const catalogContent = await fs.readFile(catalogPath, 'utf8');
    return JSON.parse(catalogContent);
};

// List profiles
const listProfiles = async () => {
    const profilesDir = path.join(MCP_HOME, 'profiles');
    const files = await fs.readdir(profilesDir);
    return files
        .filter(f => f.endsWith('.yml'))
        .map(f => f.replace('.yml', ''));
};

// Client Configuration Generator
class ClientConfigGenerator {
    constructor(mcpHome) {
        this.mcpHome = mcpHome;
        this.configs = {
            'claude-code': {
                path: path.join(os.homedir(), '.config', 'claude', 'mcp-servers.json'),
                generator: this.generateClaudeConfig.bind(this)
            },
            'vscode': {
                path: 'Add to settings.json manually',
                generator: this.generateVSCodeConfig.bind(this)
            },
            'cursor': {
                path: path.join(os.homedir(), '.cursor', 'mcp-servers.json'),
                generator: this.generateCursorConfig.bind(this)
            }
        };
    }

    async generateClaudeConfig(services) {
        const config = { mcpServers: {} };
        for (const service of services) {
            config.mcpServers[service] = {
                url: `http://localhost:8080/mcp/${service}`
            };
        }
        return config;
    }

    async generateVSCodeConfig(services) {
        const config = { mcpServers: {} };
        for (const service of services) {
            config.mcpServers[service] = {
                url: `http://localhost:8080/mcp/${service}`
            };
        }
        return config;
    }

    async generateCursorConfig(services) {
        return this.generateClaudeConfig(services);
    }

    async getCurrentProfileServices() {
        const currentProfile = await getCurrentProfile();
        const profilePath = path.join(this.mcpHome, 'profiles', `${currentProfile}.yml`);
        const profileContent = await fs.readFile(profilePath, 'utf8');
        const profile = yaml.load(profileContent);
        return profile.services || [];
    }

    async generateAll() {
        const services = await this.getCurrentProfileServices();
        
        for (const [client, config] of Object.entries(this.configs)) {
            try {
                const clientConfig = await config.generator(services);
                if (config.path.includes('settings.json')) {
                    console.log(`\n${chalk.blue(client)}: Add the following to your settings.json:`);
                    console.log(chalk.gray(JSON.stringify(clientConfig, null, 2)));
                } else {
                    await fs.mkdir(path.dirname(config.path), { recursive: true });
                    await fs.writeFile(config.path, JSON.stringify(clientConfig, null, 2));
                    console.log(chalk.green(`✓ Generated ${client} config at ${config.path}`));
                }
            } catch (error) {
                console.warn(chalk.yellow(`Could not generate ${client} config: ${error.message}`));
            }
        }
    }

    async generateForClient(clientName) {
        const client = this.configs[clientName];
        if (!client) {
            throw new Error(`Unknown client: ${clientName}`);
        }
        
        const services = await this.getCurrentProfileServices();
        const clientConfig = await client.generator(services);
        
        if (client.path.includes('settings.json')) {
            console.log(`\n${chalk.blue(clientName)}: Add the following to your settings.json:`);
            console.log(chalk.gray(JSON.stringify(clientConfig, null, 2)));
        } else {
            await fs.mkdir(path.dirname(client.path), { recursive: true });
            await fs.writeFile(client.path, JSON.stringify(clientConfig, null, 2));
            console.log(chalk.green(`✓ Generated ${clientName} config at ${client.path}`));
        }
    }
};

// Interactive service installation
async function interactiveServiceInstall() {
    // Load catalog
    const catalog = await loadCatalog();
    
    // Group services by category
    const categories = {};
    catalog.servers.forEach(server => {
        if (!categories[server.category]) {
            categories[server.category] = [];
        }
        categories[server.category].push(server);
    });
    
    // Select category
    const { category } = await inquirer.prompt([{
        type: 'list',
        name: 'category',
        message: 'Select service category:',
        choices: Object.keys(categories).map(cat => ({
            name: catalog.categories[cat].name,
            value: cat
        }))
    }]);
    
    // Select service
    const { service } = await inquirer.prompt([{
        type: 'list',
        name: 'service',
        message: 'Select service to install:',
        choices: categories[category].map(s => ({
            name: `${s.name} - ${s.description}`,
            value: s.id
        }))
    }]);
    
    // Get service details
    const selectedService = catalog.servers.find(s => s.id === service);
    
    // Collect required environment variables
    if (selectedService.config.env_required?.length > 0) {
        console.log(chalk.yellow('\nThis service requires environment variables:'));
        const envAnswers = await inquirer.prompt(
            selectedService.config.env_required.map(env => ({
                type: 'input',
                name: env,
                message: `Enter ${env}:`,
                validate: input => input.length > 0 || 'This field is required'
            }))
        );
        
        // Save to .env file
        await updateEnvFile(envAnswers);
    }
    
    // Select profile
    const profiles = await listProfiles();
    const currentProfile = await getCurrentProfile();
    const { profile } = await inquirer.prompt([{
        type: 'list',
        name: 'profile',
        message: 'Add to which profile?',
        choices: profiles,
        default: currentProfile
    }]);
    
    // Install service
    const spinner = ora(`Installing ${service}...`).start();
    
    try {
        // Add to profile
        const added = await addServiceToProfile(profile, service);
        
        if (added) {
            // Regenerate docker-compose if it's the current profile
            if (profile === currentProfile) {
                spinner.text = 'Updating configuration...';
                await runCommand('node', [REGISTRY_MANAGER, 'generate', profile], { silent: true });
                await runCommand('node', [REGISTRY_MANAGER, 'update-manifest'], { silent: true });
            }
            
            spinner.succeed(`Installed ${service} to profile '${profile}'`);
            
            if (profile === currentProfile) {
                console.log(chalk.green('\nRestart services to apply changes: mcp restart'));
            } else {
                console.log(chalk.yellow(`\nSwitch to '${profile}' profile to use this service: mcp profile switch ${profile}`));
            }
        } else {
            spinner.info(`Service ${service} already in profile '${profile}'`);
        }
    } catch (error) {
        spinner.fail(`Failed to install ${service}`);
        throw error;
    }
};

// Commands
program
    .name('mcp')
    .description('MCP Platform CLI - Manage Model Context Protocol services')
    .version('1.0.0');

// Start command (legacy - for docker-compose based services)
program
    .command('start')
    .description('Start MCP services (docker-compose)')
    .option('-p, --profile <profile>', 'Profile to use', 'default')
    .option('-d, --detach', 'Run in background')
    .option('-t, --transport <type>', 'Default transport for new servers', 'stdio')
    .action(async (options) => {
        const spinner = ora('Starting MCP services...').start();
        
        try {
            // Check Docker
            if (!await checkDocker()) {
                spinner.fail('Docker is not installed or not running');
                console.log(chalk.yellow('\nPlease install Docker: https://docs.docker.com/get-docker/'));
                process.exit(1);
            }
            
            // Switch profile if needed
            if (options.profile !== 'default') {
                spinner.text = `Switching to profile: ${options.profile}`;
                await runCommand('bash', [PROFILE_MANAGER, 'switch', options.profile], { silent: true });
            }
            
            // Set default transport if specified
            if (options.transport) {
                await updateEnvFile({ DEFAULT_TRANSPORT: options.transport });
            }
            
            // Start services
            spinner.text = 'Starting Docker services...';
            const args = ['compose', 'up'];
            if (options.detach) args.push('-d');
            
            await runCommand('docker', args, { cwd: MCP_HOME });
            
            spinner.succeed('MCP services started successfully');
            
            if (options.detach) {
                console.log(chalk.green('\nServices running in background'));
                console.log(chalk.blue('View logs: mcp logs'));
                console.log(chalk.blue('Stop services: mcp stop'));
            }
        } catch (error) {
            spinner.fail('Failed to start services');
            console.error(chalk.red(error.message));
            process.exit(1);
        }
    });

// Stop command
program
    .command('stop')
    .description('Stop MCP services')
    .action(async () => {
        const spinner = ora('Stopping MCP services...').start();
        
        try {
            await runCommand('docker', ['compose', 'down'], { cwd: MCP_HOME });
            spinner.succeed('MCP services stopped');
        } catch (error) {
            spinner.fail('Failed to stop services');
            console.error(chalk.red(error.message));
            process.exit(1);
        }
    });

// Status command
program
    .command('status')
    .description('Show status of MCP services')
    .action(async () => {
        try {
            console.log(chalk.blue('\nMCP Services Status:\n'));
            await runCommand('docker', ['compose', 'ps'], { cwd: MCP_HOME });
        } catch (error) {
            console.error(chalk.red('Failed to get status:', error.message));
            process.exit(1);
        }
    });

// Logs command
program
    .command('logs')
    .description('View logs from MCP services')
    .option('-f, --follow', 'Follow log output')
    .option('-t, --tail <lines>', 'Number of lines to show from the end', '50')
    .argument('[service]', 'Service name to show logs for')
    .action(async (service, options) => {
        try {
            const args = ['compose', 'logs'];
            if (options.follow) args.push('-f');
            args.push('--tail', options.tail);
            if (service) args.push(service);
            
            await runCommand('docker', args, { cwd: MCP_HOME });
        } catch (error) {
            console.error(chalk.red('Failed to get logs:', error.message));
            process.exit(1);
        }
    });

// List command
program
    .command('list')
    .description('List available MCP servers')
    .option('-i, --installed', 'Show only installed services')
    .action(async (options) => {
        try {
            if (options.installed) {
                // Show running services
                console.log(chalk.blue('\nInstalled MCP Services:\n'));
                await runCommand('docker', ['compose', 'ps', '--services'], { cwd: MCP_HOME });
            } else {
                // Show all available services
                await runCommand('node', [REGISTRY_MANAGER, 'list']);
            }
        } catch (error) {
            console.error(chalk.red('Failed to list services:', error.message));
            process.exit(1);
        }
    });

// Install command
program
    .command('install <service>')
    .description('Install a new MCP server')
    .action(async (service) => {
        const spinner = ora(`Installing ${service}...`).start();
        
        try {
            // Get service info
            const catalogPath = path.join(MCP_HOME, 'registry', 'mcp-catalog.json');
            const catalog = JSON.parse(await fs.readFile(catalogPath, 'utf8'));
            const server = catalog.servers.find(s => s.id === service);
            
            if (!server) {
                spinner.fail(`Service '${service}' not found`);
                console.log(chalk.yellow('\nRun "mcp list" to see available services'));
                process.exit(1);
            }
            
            // Check for required environment variables
            if (server.config.env_required && server.config.env_required.length > 0) {
                spinner.stop();
                console.log(chalk.yellow('\nThis service requires environment variables:'));
                server.config.env_required.forEach(env => {
                    console.log(`  - ${env}`);
                });
                
                const { proceed } = await inquirer.prompt([{
                    type: 'confirm',
                    name: 'proceed',
                    message: 'Have you set these environment variables?',
                    default: false
                }]);
                
                if (!proceed) {
                    console.log(chalk.yellow('\nPlease set the required environment variables in .env file'));
                    process.exit(0);
                }
                
                spinner.start();
            }
            
            // Add to current profile
            spinner.text = 'Adding to profile...';
            const currentProfile = await getCurrentProfile();
            const added = await addServiceToProfile(currentProfile, service);
            
            if (added) {
                spinner.text = `Added ${service} to profile '${currentProfile}'`;
                
                // Regenerate docker-compose
                spinner.text = 'Updating configuration...';
                await runCommand('node', [REGISTRY_MANAGER, 'generate', currentProfile], { silent: true });
                
                // Update manifest
                await runCommand('node', [REGISTRY_MANAGER, 'update-manifest'], { silent: true });
            } else {
                spinner.text = `Service ${service} already in profile '${currentProfile}'`;
            }
            
            spinner.succeed(`Installed ${service}`);
            console.log(chalk.green('\nRestart services to apply changes: mcp restart'));
        } catch (error) {
            spinner.fail('Failed to install service');
            console.error(chalk.red(error.message));
            process.exit(1);
        }
    });

// Profile command group
const profile = program
    .command('profile')
    .description('Manage MCP profiles');

profile
    .command('list')
    .description('List all profiles')
    .action(async () => {
        try {
            await runCommand('bash', [PROFILE_MANAGER, 'list']);
        } catch (error) {
            console.error(chalk.red('Failed to list profiles:', error.message));
            process.exit(1);
        }
    });

profile
    .command('switch <profile>')
    .description('Switch to a different profile')
    .action(async (profileName) => {
        try {
            await runCommand('bash', [PROFILE_MANAGER, 'switch', profileName]);
        } catch (error) {
            console.error(chalk.red('Failed to switch profile:', error.message));
            process.exit(1);
        }
    });

profile
    .command('create <name>')
    .description('Create a new profile')
    .action(async (name) => {
        try {
            await runCommand('bash', [PROFILE_MANAGER, 'create', name]);
        } catch (error) {
            console.error(chalk.red('Failed to create profile:', error.message));
            process.exit(1);
        }
    });

// Config command
program
    .command('config')
    .description('Manage MCP configuration')
    .option('-g, --generate', 'Generate client configurations')
    .option('-c, --client <client>', 'Generate config for specific client')
    .action(async (options) => {
        if (options.generate) {
            const spinner = ora('Generating client configurations...').start();
            try {
                spinner.stop();
                
                const generator = new ClientConfigGenerator(MCP_HOME);
                
                if (options.client) {
                    await generator.generateForClient(options.client);
                } else {
                    await generator.generateAll();
                }
                
                console.log(chalk.green('\n✓ Client configurations generated successfully'));
            } catch (error) {
                spinner.fail('Failed to generate configurations');
                console.error(chalk.red(error.message));
                process.exit(1);
            }
        } else {
            console.log(chalk.blue('MCP Configuration'));
            console.log(`\nMCP_HOME: ${MCP_HOME}`);
            console.log(`Config file: ${path.join(MCP_HOME, '.env')`);
            console.log(`\nAvailable clients for config generation:`);
            console.log(`  - claude-code`);
            console.log(`  - vscode`);
            console.log(`  - cursor`);
            console.log(`\nUse: mcp config --generate [-c <client>]`);
        }
    });

// Restart command
program
    .command('restart')
    .description('Restart MCP services')
    .action(async () => {
        const spinner = ora('Restarting MCP services...').start();
        
        try {
            spinner.text = 'Stopping services...';
            await runCommand('docker', ['compose', 'down'], { cwd: MCP_HOME, silent: true });
            
            spinner.text = 'Starting services...';
            await runCommand('docker', ['compose', 'up', '-d'], { cwd: MCP_HOME, silent: true });
            
            spinner.succeed('MCP services restarted');
        } catch (error) {
            spinner.fail('Failed to restart services');
            console.error(chalk.red(error.message));
            process.exit(1);
        }
    });

// Interactive mode
program
    .command('interactive')
    .alias('i')
    .description('Interactive MCP management')
    .action(async () => {
        console.log(chalk.blue.bold('\nMCP Platform Interactive Mode\n'));
        
        const mainMenu = async () => {
            const { action } = await inquirer.prompt([{
                type: 'list',
                name: 'action',
                message: 'What would you like to do?',
                choices: [
                    { name: 'Start services', value: 'start' },
                    { name: 'Stop services', value: 'stop' },
                    { name: 'View service status', value: 'status' },
                    { name: 'Install new service', value: 'install' },
                    { name: 'Manage profiles', value: 'profiles' },
                    { name: 'View logs', value: 'logs' },
                    new inquirer.Separator(),
                    { name: 'Exit', value: 'exit' }
                ]
            }]);
            
            switch (action) {
                case 'start':
                    await runCommand('docker', ['compose', 'up', '-d'], { cwd: MCP_HOME });
                    console.log(chalk.green('\nServices started successfully'));
                    break;
                    
                case 'stop':
                    await runCommand('docker', ['compose', 'down'], { cwd: MCP_HOME });
                    console.log(chalk.green('\nServices stopped'));
                    break;
                    
                case 'status':
                    await runCommand('docker', ['compose', 'ps'], { cwd: MCP_HOME });
                    break;
                    
                case 'install':
                    await interactiveServiceInstall();
                    break;
                    
                case 'profiles':
                    await runCommand('bash', [PROFILE_MANAGER, 'list']);
                    break;
                    
                case 'logs':
                    await runCommand('docker', ['compose', 'logs', '--tail', '50'], { cwd: MCP_HOME });
                    break;
                    
                case 'exit':
                    console.log(chalk.blue('\nGoodbye!'));
                    process.exit(0);
            }
            
            // Return to menu
            await mainMenu();
        };
        
        try {
            await mainMenu();
        } catch (error) {
            console.error(chalk.red('Error:', error.message));
            process.exit(1);
        }
    });

// Add health command
addHealthCommand(program);

// Add transport command
addTransportCommand(program);

// Add server command
addServerCommand(program);

// Plugin command group
const plugin = program
    .command('plugin')
    .description('Manage CLI plugins');

plugin
    .command('list')
    .description('List installed plugins')
    .action(async () => {
        const pluginManager = new PluginManager();
        const plugins = await pluginManager.listPlugins();
        
        if (plugins.length === 0) {
            console.log(chalk.yellow('No plugins installed'));
            return;
        }
        
        console.log(chalk.blue('\nInstalled Plugins:\n'));
        for (const plugin of plugins) {
            console.log(`${chalk.green(plugin.name)} v${plugin.version} - ${plugin.description}`);
        }
    });

plugin
    .command('install <package>')
    .description('Install a CLI plugin')
    .action(async (packageName) => {
        const spinner = ora(`Installing plugin ${packageName}...`).start();
        
        try {
            const pluginManager = new PluginManager();
            const result = await pluginManager.installPlugin(packageName);
            
            if (result.success) {
                spinner.succeed(result.message);
            } else {
                spinner.fail(result.message);
            }
        } catch (error) {
            spinner.fail(`Failed to install plugin: ${error.message}`);
            process.exit(1);
        }
    });

plugin
    .command('update <name>')
    .description('Update a CLI plugin')
    .action(async (pluginName) => {
        const spinner = ora(`Updating plugin ${pluginName}...`).start();
        
        try {
            const pluginManager = new PluginManager();
            const result = await pluginManager.updatePlugin(pluginName);
            
            if (result.success) {
                spinner.succeed(result.message);
            } else {
                spinner.fail(result.message);
            }
        } catch (error) {
            spinner.fail(`Failed to update plugin: ${error.message}`);
            process.exit(1);
        }
    });

plugin
    .command('unload <name>')
    .description('Unload a CLI plugin')
    .action(async (pluginName) => {
        const spinner = ora(`Unloading plugin ${pluginName}...`).start();
        
        try {
            const pluginManager = new PluginManager();
            await pluginManager.unloadPlugin(pluginName);
            spinner.succeed(`Plugin ${pluginName} unloaded`);
        } catch (error) {
            spinner.fail(`Failed to unload plugin: ${error.message}`);
            process.exit(1);
        }
    });

// Initialize and load plugins
(async () => {
    try {
        const pluginManager = new PluginManager();
        
        // Create context for plugins
        const context = {
            config: {},
            logger: console,
            api: {
                // CLI API that plugins can use
                runCommand,
                fileExists,
                loadCatalog,
                getCurrentProfile,
                listProfiles
            }
        };
        
        // Try to load SDK if available
        try {
            const SDKCoreInterface = require('../../interfaces/phase5/sdk-core.interface');
            context.sdk = new SDKCoreInterface({ apiKey: process.env.MCP_API_KEY || 'default-key' });
        } catch (error) {
            // SDK not available yet - that's ok
        }
        
        // Initialize plugin manager
        await pluginManager.initialize(context);
        
        // Register plugin commands
        pluginManager.registerCommands(program);
        
        // Parse arguments
        program.parse();
        
        // Show help if no command provided
        if (!process.argv.slice(2).length) {
            program.outputHelp();
        }
    } catch (error) {
        console.error(chalk.red('Failed to initialize plugins:', error.message));
        
        // Still parse arguments even if plugins fail to load
        program.parse();
        
        if (!process.argv.slice(2).length) {
            program.outputHelp();
        }
    }
})();