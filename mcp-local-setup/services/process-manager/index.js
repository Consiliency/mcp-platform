const EventEmitter = require('events');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

/**
 * Process Manager Service
 * Manages lifecycle of stdio-based MCP server processes
 */
class ProcessManagerService extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            maxProcesses: 50,
            defaultTimeout: 30000,
            restartDelay: 5000,
            maxRestarts: 3,
            resourceLimits: {
                maxMemoryMB: 512,
                maxCpuPercent: 80
            },
            ...config
        };
        
        this.processes = new Map();
        this.restartCounts = new Map();
        this.resourceMonitor = null;
    }

    /**
     * Start the process manager service
     */
    async start() {
        console.log('Starting Process Manager Service...');
        
        // Start resource monitoring
        this.startResourceMonitoring();
        
        this.emit('service:started');
    }

    /**
     * Stop the process manager service
     */
    async stop() {
        console.log('Stopping Process Manager Service...');
        
        // Stop resource monitoring
        this.stopResourceMonitoring();
        
        // Stop all processes
        for (const [processId, proc] of this.processes) {
            await this.stopProcess(processId);
        }
        
        this.emit('service:stopped');
    }

    /**
     * Spawn a new process
     * @param {Object} config - Process configuration
     * @returns {Promise<string>} Process ID
     */
    async spawnProcess(config) {
        const {
            id,
            command,
            args = [],
            env = {},
            workingDir,
            autoRestart = true,
            resourceLimits = {}
        } = config;

        // Check process limit
        if (this.processes.size >= this.config.maxProcesses) {
            throw new Error(`Maximum process limit reached: ${this.config.maxProcesses}`);
        }

        // Check if process already exists
        if (this.processes.has(id)) {
            throw new Error(`Process already exists: ${id}`);
        }

        const processId = id || `proc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        try {
            // Prepare spawn options
            const spawnOptions = {
                env: {
                    ...process.env,
                    ...env,
                    PROCESS_ID: processId
                },
                stdio: ['pipe', 'pipe', 'pipe'],
                detached: false
            };

            if (workingDir) {
                spawnOptions.cwd = workingDir;
            }

            // Add resource limits if supported
            if (process.platform === 'linux') {
                spawnOptions.uid = process.getuid();
                spawnOptions.gid = process.getgid();
            }

            // Spawn the process
            const child = spawn(command, args, spawnOptions);

            // Create process record
            const processRecord = {
                id: processId,
                command,
                args,
                env,
                workingDir,
                process: child,
                pid: child.pid,
                status: 'running',
                startTime: Date.now(),
                autoRestart,
                resourceLimits: {
                    ...this.config.resourceLimits,
                    ...resourceLimits
                },
                logs: {
                    stdout: [],
                    stderr: []
                },
                metrics: {
                    cpu: 0,
                    memory: 0,
                    restarts: 0
                }
            };

            this.processes.set(processId, processRecord);

            // Set up event handlers
            this.setupProcessHandlers(processId, child);

            // Set up log capture
            this.setupLogCapture(processId, child);

            this.emit('process:spawned', {
                processId,
                pid: child.pid,
                command,
                args
            });

            console.log(`Spawned process: ${processId} (PID: ${child.pid})`);
            return processId;

        } catch (error) {
            console.error(`Failed to spawn process ${processId}:`, error);
            throw error;
        }
    }

    /**
     * Stop a process
     * @param {string} processId - Process ID
     * @param {Object} options - Stop options
     */
    async stopProcess(processId, options = {}) {
        const { signal = 'SIGTERM', timeout = 5000 } = options;
        
        const processRecord = this.processes.get(processId);
        if (!processRecord) {
            throw new Error(`Process not found: ${processId}`);
        }

        const { process: child } = processRecord;
        
        if (processRecord.status !== 'running') {
            return;
        }

        try {
            // Send termination signal
            child.kill(signal);
            processRecord.status = 'stopping';

            // Wait for process to exit
            await new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    // Force kill if not exited
                    child.kill('SIGKILL');
                    resolve();
                }, timeout);

                child.once('exit', () => {
                    clearTimeout(timer);
                    resolve();
                });
            });

            processRecord.status = 'stopped';
            processRecord.endTime = Date.now();

            this.emit('process:stopped', {
                processId,
                pid: processRecord.pid
            });

            console.log(`Stopped process: ${processId}`);

        } catch (error) {
            console.error(`Error stopping process ${processId}:`, error);
            throw error;
        }
    }

    /**
     * Restart a process
     * @param {string} processId - Process ID
     */
    async restartProcess(processId) {
        const processRecord = this.processes.get(processId);
        if (!processRecord) {
            throw new Error(`Process not found: ${processId}`);
        }

        console.log(`Restarting process: ${processId}`);

        // Stop the process
        await this.stopProcess(processId);

        // Wait before restart
        await new Promise(resolve => setTimeout(resolve, this.config.restartDelay));

        // Remove old record
        const { command, args, env, workingDir, autoRestart, resourceLimits } = processRecord;
        this.processes.delete(processId);

        // Spawn new process with same config
        return await this.spawnProcess({
            id: processId,
            command,
            args,
            env,
            workingDir,
            autoRestart,
            resourceLimits
        });
    }

    /**
     * Get process status
     * @param {string} processId - Process ID
     * @returns {Object} Process status
     */
    getProcessStatus(processId) {
        const processRecord = this.processes.get(processId);
        if (!processRecord) {
            return null;
        }

        const {
            id, pid, status, command, args,
            startTime, endTime, metrics, logs
        } = processRecord;

        return {
            id,
            pid,
            status,
            command,
            args,
            uptime: status === 'running' ? Date.now() - startTime : endTime - startTime,
            metrics,
            recentLogs: {
                stdout: logs.stdout.slice(-10),
                stderr: logs.stderr.slice(-10)
            }
        };
    }

    /**
     * Get all processes status
     * @returns {Array} Array of process statuses
     */
    getAllProcessesStatus() {
        const statuses = [];
        for (const [processId] of this.processes) {
            statuses.push(this.getProcessStatus(processId));
        }
        return statuses;
    }

    /**
     * Setup process event handlers
     * @param {string} processId - Process ID
     * @param {ChildProcess} child - Child process
     */
    setupProcessHandlers(processId, child) {
        child.on('exit', (code, signal) => {
            this.handleProcessExit(processId, code, signal);
        });

        child.on('error', (error) => {
            this.handleProcessError(processId, error);
        });
    }

    /**
     * Setup log capture for process
     * @param {string} processId - Process ID
     * @param {ChildProcess} child - Child process
     */
    setupLogCapture(processId, child) {
        const processRecord = this.processes.get(processId);
        const maxLogs = 1000;

        // Capture stdout
        child.stdout.on('data', (data) => {
            const lines = data.toString().split('\n').filter(line => line);
            for (const line of lines) {
                processRecord.logs.stdout.push({
                    timestamp: Date.now(),
                    data: line
                });
                
                // Limit log size
                if (processRecord.logs.stdout.length > maxLogs) {
                    processRecord.logs.stdout.shift();
                }

                this.emit('process:stdout', { processId, data: line });
            }
        });

        // Capture stderr
        child.stderr.on('data', (data) => {
            const lines = data.toString().split('\n').filter(line => line);
            for (const line of lines) {
                processRecord.logs.stderr.push({
                    timestamp: Date.now(),
                    data: line
                });
                
                // Limit log size
                if (processRecord.logs.stderr.length > maxLogs) {
                    processRecord.logs.stderr.shift();
                }

                this.emit('process:stderr', { processId, data: line });
            }
        });
    }

    /**
     * Handle process exit
     * @param {string} processId - Process ID
     * @param {number} code - Exit code
     * @param {string} signal - Exit signal
     */
    async handleProcessExit(processId, code, signal) {
        const processRecord = this.processes.get(processId);
        if (!processRecord) {
            return;
        }

        processRecord.status = 'exited';
        processRecord.exitCode = code;
        processRecord.exitSignal = signal;
        processRecord.endTime = Date.now();

        this.emit('process:exited', {
            processId,
            pid: processRecord.pid,
            code,
            signal
        });

        console.log(`Process ${processId} exited with code ${code}, signal ${signal}`);

        // Handle auto-restart
        if (processRecord.autoRestart && code !== 0) {
            const restartCount = this.restartCounts.get(processId) || 0;
            
            if (restartCount < this.config.maxRestarts) {
                this.restartCounts.set(processId, restartCount + 1);
                processRecord.metrics.restarts++;
                
                console.log(`Auto-restarting process ${processId} (attempt ${restartCount + 1})`);
                
                setTimeout(() => {
                    this.restartProcess(processId).catch(error => {
                        console.error(`Failed to auto-restart process ${processId}:`, error);
                    });
                }, this.config.restartDelay);
            } else {
                console.error(`Process ${processId} exceeded max restart attempts`);
                this.emit('process:restart-failed', { processId, attempts: restartCount });
            }
        }
    }

    /**
     * Handle process error
     * @param {string} processId - Process ID
     * @param {Error} error - Error object
     */
    handleProcessError(processId, error) {
        const processRecord = this.processes.get(processId);
        if (!processRecord) {
            return;
        }

        processRecord.status = 'error';
        processRecord.error = error;
        processRecord.errorTime = Date.now();

        this.emit('process:error', {
            processId,
            pid: processRecord.pid,
            error: error.message
        });

        console.error(`Process ${processId} error:`, error);
    }

    /**
     * Start resource monitoring
     */
    startResourceMonitoring() {
        this.resourceMonitor = setInterval(() => {
            this.updateResourceMetrics();
        }, 5000); // Update every 5 seconds
    }

    /**
     * Stop resource monitoring
     */
    stopResourceMonitoring() {
        if (this.resourceMonitor) {
            clearInterval(this.resourceMonitor);
            this.resourceMonitor = null;
        }
    }

    /**
     * Update resource metrics for all processes
     */
    async updateResourceMetrics() {
        // This is a simplified version - real implementation would use
        // system calls to get actual CPU and memory usage
        for (const [processId, processRecord] of this.processes) {
            if (processRecord.status === 'running' && processRecord.pid) {
                try {
                    // Placeholder for actual resource monitoring
                    // In production, use packages like 'pidusage' or system calls
                    processRecord.metrics.cpu = Math.random() * 100;
                    processRecord.metrics.memory = Math.random() * processRecord.resourceLimits.maxMemoryMB;

                    // Check resource limits
                    if (processRecord.metrics.memory > processRecord.resourceLimits.maxMemoryMB) {
                        console.warn(`Process ${processId} exceeding memory limit`);
                        this.emit('process:resource-limit', {
                            processId,
                            type: 'memory',
                            value: processRecord.metrics.memory,
                            limit: processRecord.resourceLimits.maxMemoryMB
                        });
                    }
                } catch (error) {
                    console.error(`Failed to update metrics for ${processId}:`, error);
                }
            }
        }
    }

    /**
     * Get service metrics
     * @returns {Object} Service metrics
     */
    getMetrics() {
        const metrics = {
            processes: {
                total: this.processes.size,
                running: 0,
                stopped: 0,
                error: 0
            },
            resources: {
                totalCpu: 0,
                totalMemory: 0
            }
        };

        for (const [processId, processRecord] of this.processes) {
            metrics.processes[processRecord.status]++;
            
            if (processRecord.status === 'running') {
                metrics.resources.totalCpu += processRecord.metrics.cpu;
                metrics.resources.totalMemory += processRecord.metrics.memory;
            }
        }

        return metrics;
    }
}

module.exports = ProcessManagerService;