/**
 * Process Manager Implementation for Phase 7 Universal Transport Support
 * Handles process spawning, lifecycle management, and monitoring
 */

const { spawn } = require('child_process');
const path = require('path');
const EventEmitter = require('events');
const os = require('os');
const ProcessMetrics = require('./process-metrics');

class ProcessManager extends EventEmitter {
    constructor() {
        super();
        this.processes = new Map();
        this.nextPid = 1000;
        this.processLimit = 100;
        this.monitoringInterval = null;
        this.metrics = new ProcessMetrics();
        this.startMonitoring();
    }

    /**
     * Spawn a new process
     * @param {Object} config Process configuration
     * @returns {string} Process ID
     */
    spawnProcess(config) {
        // Validate configuration
        if (!config.command) {
            throw new Error('Command is required');
        }

        // Check process limit
        if (this.processes.size >= this.processLimit) {
            throw new Error(`Process limit (${this.processLimit}) exceeded`);
        }

        const processId = config.id || `proc_${this.nextPid}`;
        const args = config.args || [];
        const env = { ...process.env, ...(config.env || {}) };
        const workingDir = config.workingDir || process.cwd();
        const autoRestart = config.autoRestart || false;

        // Check if command exists
        const command = this.resolveCommand(config.command);
        
        // Spawn the process
        const proc = spawn(command, args, {
            cwd: workingDir,
            env: env,
            stdio: ['pipe', 'pipe', 'pipe']
        });

        // Initialize process tracking
        const processInfo = {
            id: processId,
            pid: proc.pid || this.nextPid++,
            process: proc,
            config: config,
            status: 'running',
            startTime: Date.now(),
            restarts: 0,
            autoRestart: autoRestart,
            logs: {
                stdout: [],
                stderr: []
            },
            metrics: {
                cpu: 0,
                memory: 0
            }
        };

        // Capture stdout
        proc.stdout.on('data', (data) => {
            const lines = data.toString().split('\n').filter(line => line);
            processInfo.logs.stdout.push(...lines);
            // Keep only last 1000 lines
            if (processInfo.logs.stdout.length > 1000) {
                processInfo.logs.stdout = processInfo.logs.stdout.slice(-1000);
            }
            this.emit('stdout', { processId, data: data.toString() });
        });

        // Capture stderr
        proc.stderr.on('data', (data) => {
            const lines = data.toString().split('\n').filter(line => line);
            processInfo.logs.stderr.push(...lines);
            // Keep only last 1000 lines
            if (processInfo.logs.stderr.length > 1000) {
                processInfo.logs.stderr = processInfo.logs.stderr.slice(-1000);
            }
            this.emit('stderr', { processId, data: data.toString() });
        });

        // Handle process exit
        proc.on('exit', (code, signal) => {
            processInfo.status = 'stopped';
            processInfo.exitCode = code;
            processInfo.exitSignal = signal;
            
            this.emit('exit', { processId, code, signal });

            // Handle auto-restart
            if (autoRestart && code !== 0 && processInfo.restarts < 5) {
                setTimeout(() => {
                    if (this.processes.has(processId)) {
                        this.restartProcess(processId);
                    }
                }, 1000); // Wait 1 second before restart
            }
        });

        // Handle process errors
        proc.on('error', (error) => {
            processInfo.status = 'error';
            processInfo.error = error.message;
            this.emit('error', { processId, error });
        });

        // Store process info
        this.processes.set(processId, processInfo);

        return processId;
    }

    /**
     * Stop a running process
     * @param {string} processId Process identifier
     * @param {number} timeout Milliseconds to wait before force kill
     * @returns {boolean} True if stopped successfully
     */
    stopProcess(processId, timeout = 5000) {
        const processInfo = this.processes.get(processId);
        if (!processInfo) {
            return false;
        }

        if (processInfo.status === 'stopped') {
            return true;
        }

        const proc = processInfo.process;
        
        // Try graceful shutdown first
        proc.kill('SIGTERM');

        // Set up force kill after timeout
        const forceKillTimeout = setTimeout(() => {
            if (proc.killed === false) {
                proc.kill('SIGKILL');
            }
        }, timeout);

        // Wait for process to exit
        return new Promise((resolve) => {
            proc.once('exit', () => {
                clearTimeout(forceKillTimeout);
                processInfo.status = 'stopped';
                resolve(true);
            });

            // Also resolve if already killed
            setTimeout(() => {
                clearTimeout(forceKillTimeout);
                resolve(proc.killed);
            }, timeout + 100);
        });
    }

    /**
     * Get process status
     * @param {string} processId Process identifier
     * @returns {Object} Status dictionary
     */
    getProcessStatus(processId) {
        const processInfo = this.processes.get(processId);
        if (!processInfo) {
            return {
                pid: 0,
                status: 'unknown',
                uptime: 0,
                cpu: 0,
                memory: 0,
                restarts: 0
            };
        }

        const uptime = processInfo.status === 'running' 
            ? Math.floor((Date.now() - processInfo.startTime) / 1000)
            : 0;

        return {
            pid: processInfo.pid,
            status: processInfo.status,
            uptime: uptime,
            cpu: processInfo.metrics.cpu,
            memory: processInfo.metrics.memory,
            restarts: processInfo.restarts
        };
    }

    /**
     * Get process logs
     * @param {string} processId Process identifier
     * @param {number} lines Number of recent lines to return
     * @returns {Object} Dictionary with stdout and stderr logs
     */
    getProcessLogs(processId, lines = 100) {
        const processInfo = this.processes.get(processId);
        if (!processInfo) {
            return { stdout: [], stderr: [] };
        }

        return {
            stdout: processInfo.logs.stdout.slice(-lines),
            stderr: processInfo.logs.stderr.slice(-lines)
        };
    }

    /**
     * List all managed processes
     * @returns {Array} List of process info dictionaries
     */
    listProcesses() {
        const result = [];
        for (const [processId, processInfo] of this.processes) {
            result.push({
                id: processId,
                pid: processInfo.pid,
                status: processInfo.status,
                command: processInfo.config.command,
                uptime: processInfo.status === 'running' 
                    ? Math.floor((Date.now() - processInfo.startTime) / 1000)
                    : 0
            });
        }
        return result;
    }

    /**
     * Restart a process
     * @param {string} processId Process identifier
     * @returns {boolean} True if restarted successfully
     */
    async restartProcess(processId) {
        const processInfo = this.processes.get(processId);
        if (!processInfo) {
            return false;
        }

        // Stop the process if running
        if (processInfo.status === 'running') {
            await this.stopProcess(processId);
        }

        // Increment restart counter
        processInfo.restarts++;

        // Spawn new process with same config
        const newProc = spawn(processInfo.config.command, processInfo.config.args || [], {
            cwd: processInfo.config.workingDir || process.cwd(),
            env: { ...process.env, ...(processInfo.config.env || {}) },
            stdio: ['pipe', 'pipe', 'pipe']
        });

        // Update process info
        processInfo.process = newProc;
        processInfo.pid = newProc.pid || this.nextPid++;
        processInfo.status = 'running';
        processInfo.startTime = Date.now();

        // Re-attach event handlers
        this.attachProcessHandlers(processId, processInfo, newProc);

        this.emit('restart', { processId, restarts: processInfo.restarts });
        return true;
    }

    /**
     * Attach event handlers to a process
     */
    attachProcessHandlers(processId, processInfo, proc) {
        // Capture stdout
        proc.stdout.on('data', (data) => {
            const lines = data.toString().split('\n').filter(line => line);
            processInfo.logs.stdout.push(...lines);
            if (processInfo.logs.stdout.length > 1000) {
                processInfo.logs.stdout = processInfo.logs.stdout.slice(-1000);
            }
            this.emit('stdout', { processId, data: data.toString() });
        });

        // Capture stderr
        proc.stderr.on('data', (data) => {
            const lines = data.toString().split('\n').filter(line => line);
            processInfo.logs.stderr.push(...lines);
            if (processInfo.logs.stderr.length > 1000) {
                processInfo.logs.stderr = processInfo.logs.stderr.slice(-1000);
            }
            this.emit('stderr', { processId, data: data.toString() });
        });

        // Handle process exit
        proc.on('exit', (code, signal) => {
            processInfo.status = 'stopped';
            processInfo.exitCode = code;
            processInfo.exitSignal = signal;
            
            this.emit('exit', { processId, code, signal });

            // Handle auto-restart
            if (processInfo.autoRestart && code !== 0 && processInfo.restarts < 5) {
                setTimeout(() => {
                    if (this.processes.has(processId)) {
                        this.restartProcess(processId);
                    }
                }, 1000);
            }
        });

        // Handle process errors
        proc.on('error', (error) => {
            processInfo.status = 'error';
            processInfo.error = error.message;
            this.emit('error', { processId, error });
        });
    }

    /**
     * Resolve command path
     */
    resolveCommand(command) {
        // Check if it's an absolute path
        if (path.isAbsolute(command)) {
            return command;
        }

        // Check common locations
        const commonPaths = [
            path.join(process.cwd(), command),
            path.join(process.cwd(), 'node_modules', '.bin', command),
            path.join(__dirname, '..', 'node_modules', '.bin', command)
        ];

        for (const cmdPath of commonPaths) {
            try {
                const fs = require('fs');
                if (fs.existsSync(cmdPath)) {
                    return cmdPath;
                }
            } catch (e) {
                // Continue to next path
            }
        }

        // Return as-is and let spawn handle PATH resolution
        return command;
    }

    /**
     * Start monitoring processes for resource usage
     */
    startMonitoring() {
        // Monitor every 5 seconds
        this.monitoringInterval = setInterval(() => {
            for (const [processId, processInfo] of this.processes) {
                if (processInfo.status === 'running' && processInfo.pid) {
                    this.updateProcessMetrics(processId, processInfo);
                }
            }
        }, 5000);
    }

    /**
     * Update process metrics (CPU and memory)
     */
    async updateProcessMetrics(processId, processInfo) {
        try {
            const pid = processInfo.pid;
            
            // Get real metrics using platform-specific methods
            const metrics = await this.metrics.getMetrics(pid);
            processInfo.metrics.cpu = metrics.cpu;
            processInfo.metrics.memory = metrics.memory;
            
        } catch (error) {
            // Fallback to default metrics on error
            processInfo.metrics.cpu = 0;
            processInfo.metrics.memory = 0;
        }
    }

    /**
     * Cleanup and stop monitoring
     */
    cleanup() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }

        // Stop all processes
        for (const [processId] of this.processes) {
            this.stopProcess(processId, 1000);
        }
    }
}

module.exports = ProcessManager;