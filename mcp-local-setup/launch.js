#!/usr/bin/env node
/**
 * MCP Platform Launcher - Cross-platform Node.js launcher
 * Works on Windows, macOS, and Linux
 */

const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');
const readline = require('readline');

// Configuration
const MCP_HOME = process.env.MCP_HOME || __dirname;
const API_PORT = process.env.API_PORT || 3000;
const TRAEFIK_PORT = process.env.TRAEFIK_PORT || 8080;
const DASHBOARD_URL = `http://localhost:${API_PORT}/catalog.html`;
const TRAEFIK_URL = `http://localhost:${TRAEFIK_PORT}`;
const PID_FILE = path.join(MCP_HOME, '.mcp-services.json');

// Platform detection
const platform = {
    isWindows: process.platform === 'win32',
    isMac: process.platform === 'darwin',
    isLinux: process.platform === 'linux',
    isWSL: process.platform === 'linux' && fs.existsSync('/proc/version') && 
            fs.readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft')
};

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

// Utility functions
const print = {
    header: () => {
        console.log(`${colors.cyan}================================================${colors.reset}`);
        console.log(`${colors.cyan}          MCP Platform Launcher                 ${colors.reset}`);
        console.log(`${colors.cyan}================================================${colors.reset}`);
        console.log('');
    },
    success: (msg) => console.log(`${colors.green}✓ ${msg}${colors.reset}`),
    error: (msg) => console.log(`${colors.red}✗ ${msg}${colors.reset}`),
    warning: (msg) => console.log(`${colors.yellow}⚠ ${msg}${colors.reset}`),
    info: (msg) => console.log(`${colors.blue}→ ${msg}${colors.reset}`)
};

// Service tracking
class ServiceTracker {
    constructor() {
        this.services = this.load();
    }

    load() {
        try {
            if (fs.existsSync(PID_FILE)) {
                return JSON.parse(fs.readFileSync(PID_FILE, 'utf8'));
            }
        } catch (e) {
            // Ignore errors
        }
        return { api: null, startTime: null };
    }

    save() {
        fs.writeFileSync(PID_FILE, JSON.stringify(this.services, null, 2));
    }

    setApiPid(pid) {
        this.services.api = pid;
        this.services.startTime = new Date().toISOString();
        this.save();
    }

    clear() {
        if (fs.existsSync(PID_FILE)) {
            fs.unlinkSync(PID_FILE);
        }
        this.services = { api: null, startTime: null };
    }
}

// Check if a command exists
function commandExists(cmd) {
    return new Promise((resolve) => {
        const checkCmd = platform.isWindows ? `where ${cmd}` : `which ${cmd}`;
        exec(checkCmd, (error) => {
            resolve(!error);
        });
    });
}

// Check dependencies
async function checkDependencies() {
    const missing = [];
    
    if (!await commandExists('docker')) {
        missing.push('Docker');
    }
    
    if (!await commandExists('node')) {
        missing.push('Node.js');
    }
    
    if (!await commandExists('npm')) {
        missing.push('npm');
    }
    
    if (missing.length > 0) {
        print.error('Missing required dependencies:');
        missing.forEach(dep => console.log(`  - ${dep}`));
        console.log('\nPlease install missing dependencies:');
        console.log('  - Docker: https://docs.docker.com/get-docker/');
        console.log('  - Node.js: https://nodejs.org/');
        process.exit(1);
    }
}

// Execute command with promise
function execCommand(cmd, options = {}) {
    return new Promise((resolve, reject) => {
        exec(cmd, { ...options, cwd: MCP_HOME }, (error, stdout, stderr) => {
            if (error) {
                reject({ error, stderr });
            } else {
                resolve({ stdout, stderr });
            }
        });
    });
}

// Check if services are already running
function checkRunningServices() {
    const tracker = new ServiceTracker();
    if (tracker.services.api) {
        print.warning('MCP services may already be running');
        console.log("Run 'node launch.js stop' to stop them first");
        process.exit(1);
    }
}

// Start Docker services
async function startDockerServices() {
    print.info('Starting Docker services...');
    
    // Check if docker-compose.yml exists
    const dockerComposePath = path.join(MCP_HOME, 'docker-compose.yml');
    if (!fs.existsSync(dockerComposePath)) {
        print.error('docker-compose.yml not found');
        process.exit(1);
    }
    
    try {
        // Try docker compose first (newer syntax)
        await execCommand('docker compose up -d');
        print.success('Docker services started');
    } catch (e) {
        try {
            // Fall back to docker-compose
            await execCommand('docker-compose up -d');
            print.success('Docker services started');
        } catch (e2) {
            print.error('Failed to start Docker services');
            console.error(e2.stderr || e2.error);
            process.exit(1);
        }
    }
}

// Install API dependencies
async function installApiDependencies() {
    const nodeModulesPath = path.join(MCP_HOME, 'api', 'node_modules');
    if (!fs.existsSync(nodeModulesPath)) {
        print.info('Installing API dependencies...');
        try {
            await execCommand('npm install', { cwd: path.join(MCP_HOME, 'api') });
            print.success('API dependencies installed');
        } catch (e) {
            print.error('Failed to install dependencies');
            process.exit(1);
        }
    }
}

// Check if API is ready
function checkApiReady() {
    return new Promise((resolve) => {
        const options = {
            hostname: 'localhost',
            port: API_PORT,
            path: '/health',
            method: 'GET',
            timeout: 1000
        };

        const req = http.request(options, (res) => {
            resolve(res.statusCode === 200);
        });

        req.on('error', () => resolve(false));
        req.on('timeout', () => {
            req.destroy();
            resolve(false);
        });

        req.end();
    });
}

// Start API server
async function startApiServer() {
    print.info('Starting API server...');
    
    // Check if API directory exists
    const apiPath = path.join(MCP_HOME, 'api');
    if (!fs.existsSync(apiPath)) {
        print.error('API directory not found');
        process.exit(1);
    }
    
    // Install dependencies if needed
    await installApiDependencies();
    
    // Start the API server
    const apiProcess = spawn('node', ['index.js'], {
        cwd: apiPath,
        detached: !platform.isWindows,
        stdio: ['ignore', 'pipe', 'pipe']
    });
    
    // Log output to files
    const logStream = fs.createWriteStream(path.join(MCP_HOME, 'api-server.log'));
    const errorStream = fs.createWriteStream(path.join(MCP_HOME, 'api-server-error.log'));
    
    apiProcess.stdout.pipe(logStream);
    apiProcess.stderr.pipe(errorStream);
    
    // Save PID
    const tracker = new ServiceTracker();
    tracker.setApiPid(apiProcess.pid);
    
    // Wait for API to be ready
    let retries = 0;
    while (retries < 30) {
        if (await checkApiReady()) {
            print.success(`API server started (PID: ${apiProcess.pid})`);
            return apiProcess;
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
        retries++;
    }
    
    print.error('API server failed to start');
    apiProcess.kill();
    process.exit(1);
}

// Display service information
function displayInfo() {
    console.log('');
    console.log(`${colors.green}================================================${colors.reset}`);
    console.log(`${colors.green}       MCP Platform Started Successfully!       ${colors.reset}`);
    console.log(`${colors.green}================================================${colors.reset}`);
    console.log('');
    console.log(`${colors.cyan}Service URLs:${colors.reset}`);
    console.log(`  Dashboard:    ${colors.blue}${DASHBOARD_URL}${colors.reset}`);
    console.log(`  Traefik:      ${colors.blue}${TRAEFIK_URL}${colors.reset}`);
    console.log(`  API Health:   ${colors.blue}http://localhost:${API_PORT}/health${colors.reset}`);
    console.log('');
    
    // Platform-specific instructions
    if (platform.isWSL) {
        console.log(`${colors.yellow}WSL Users:${colors.reset}`);
        console.log('  Access from Windows at the same URLs');
    } else if (platform.isMac) {
        console.log(`${colors.yellow}macOS Users:${colors.reset}`);
        console.log('  Use Cmd+Click to open URLs in browser');
    } else if (platform.isWindows) {
        console.log(`${colors.yellow}Windows Users:${colors.reset}`);
        console.log('  Services are accessible at the URLs above');
    }
    
    console.log('');
    console.log(`${colors.cyan}Commands:${colors.reset}`);
    console.log('  Stop services:    node launch.js stop');
    console.log('  View logs:        node launch.js logs');
    console.log('  Service status:   node launch.js status');
    console.log('');
    console.log(`${colors.yellow}Press Ctrl+C to stop all services${colors.reset}`);
}

// Stop all services
async function stopServices() {
    print.info('Stopping MCP services...');
    
    const tracker = new ServiceTracker();
    
    // Stop API server
    if (tracker.services.api) {
        try {
            process.kill(tracker.services.api);
            print.success('API server stopped');
        } catch (e) {
            // Process might already be stopped
        }
    }
    
    // Stop Docker services
    try {
        await execCommand('docker compose down');
    } catch (e) {
        try {
            await execCommand('docker-compose down');
        } catch (e2) {
            // Services might already be stopped
        }
    }
    print.success('Docker services stopped');
    
    tracker.clear();
}

// Show logs
async function showLogs() {
    console.log(`${colors.cyan}=== API Server Logs ===${colors.reset}`);
    const apiLogPath = path.join(MCP_HOME, 'api-server.log');
    if (fs.existsSync(apiLogPath)) {
        const logs = fs.readFileSync(apiLogPath, 'utf8').split('\n');
        console.log(logs.slice(-50).join('\n'));
    } else {
        console.log('No API logs found');
    }
    
    console.log('');
    console.log(`${colors.cyan}=== Docker Service Logs ===${colors.reset}`);
    try {
        const { stdout } = await execCommand('docker compose logs --tail=50');
        console.log(stdout);
    } catch (e) {
        try {
            const { stdout } = await execCommand('docker-compose logs --tail=50');
            console.log(stdout);
        } catch (e2) {
            console.log('Unable to retrieve Docker logs');
        }
    }
}

// Show status
async function showStatus() {
    console.log(`${colors.cyan}=== Service Status ===${colors.reset}`);
    console.log('');
    
    // Check API
    if (await checkApiReady()) {
        print.success('API server is running');
    } else {
        print.error('API server is not running');
    }
    
    // Check Docker services
    console.log('');
    try {
        const { stdout } = await execCommand('docker compose ps');
        console.log(stdout);
    } catch (e) {
        try {
            const { stdout } = await execCommand('docker-compose ps');
            console.log(stdout);
        } catch (e2) {
            console.log('Unable to check Docker service status');
        }
    }
}

// Handle graceful shutdown
function setupShutdownHandlers() {
    let shutdownInProgress = false;
    
    const shutdown = async () => {
        if (shutdownInProgress) return;
        shutdownInProgress = true;
        
        console.log('');
        print.info('Shutting down services...');
        await stopServices();
        process.exit(0);
    };
    
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    
    if (platform.isWindows) {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        rl.on('SIGINT', shutdown);
    }
}

// Main execution
async function main() {
    const command = process.argv[2] || 'start';
    
    switch (command) {
        case 'start':
            print.header();
            await checkDependencies();
            checkRunningServices();
            await startDockerServices();
            await startApiServer();
            displayInfo();
            
            // Set up signal handlers
            setupShutdownHandlers();
            
            // Keep process running
            setInterval(() => {}, 1000);
            break;
            
        case 'stop':
            await stopServices();
            break;
            
        case 'restart':
            await stopServices();
            await new Promise(resolve => setTimeout(resolve, 2000));
            process.argv[2] = 'start';
            await main();
            break;
            
        case 'logs':
            await showLogs();
            break;
            
        case 'status':
            await showStatus();
            break;
            
        default:
            console.log('Usage: node launch.js {start|stop|restart|logs|status}');
            console.log('');
            console.log('Commands:');
            console.log('  start    - Start all MCP services (default)');
            console.log('  stop     - Stop all services');
            console.log('  restart  - Restart all services');
            console.log('  logs     - Show service logs');
            console.log('  status   - Show service status');
            process.exit(1);
    }
}

// Run the launcher
main().catch(error => {
    print.error('An error occurred:');
    console.error(error);
    process.exit(1);
});