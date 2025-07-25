const { spawn } = require('child_process');
const { TransportInterface } = require('../../core');
const readline = require('readline');
const EventEmitter = require('events');

/**
 * stdio Transport Adapter
 * Handles communication with stdio-based MCP servers
 */
class StdioTransport extends TransportInterface {
    constructor(config) {
        super(config);
        this.type = 'stdio';
        this.processes = new Map();
    }

    /**
     * Initialize the stdio transport
     */
    async initialize() {
        this.status = 'initialized';
        console.log('stdio transport initialized');
    }

    /**
     * Start the stdio transport service
     */
    async start() {
        this.status = 'running';
        console.log('stdio transport started');
    }

    /**
     * Stop the stdio transport service
     */
    async stop() {
        // Kill all processes
        for (const [connectionId, processInfo] of this.processes) {
            await this.closeConnection(connectionId);
        }
        
        this.status = 'stopped';
        console.log('stdio transport stopped');
    }

    /**
     * Create a new stdio connection
     * @param {Object} options - Connection options
     * @returns {Promise<string>} Connection ID
     */
    async createConnection(options) {
        const connectionId = `stdio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const { command, args = [], env = {}, workingDir, serverId } = options;
        
        if (!command) {
            throw new Error('Command is required for stdio transport');
        }

        try {
            // Spawn the process
            const processEnv = {
                ...process.env,
                ...env,
                MCP_MODE: 'stdio'
            };

            const spawnOptions = {
                env: processEnv,
                stdio: ['pipe', 'pipe', 'pipe']
            };

            if (workingDir) {
                spawnOptions.cwd = workingDir;
            }

            const child = spawn(command, args, spawnOptions);
            
            // Create message handler
            const messageHandler = new StdioMessageHandler(child);
            
            // Store process info
            const processInfo = {
                connectionId,
                serverId,
                command,
                args,
                process: child,
                messageHandler,
                startTime: Date.now(),
                pid: child.pid
            };
            
            this.processes.set(connectionId, processInfo);
            this.connections.set(connectionId, {
                status: 'connected',
                created: new Date()
            });

            // Handle process events
            child.on('exit', (code, signal) => {
                console.log(`Process ${connectionId} exited with code ${code}, signal ${signal}`);
                this.handleProcessExit(connectionId, code, signal);
            });

            child.on('error', (error) => {
                console.error(`Process ${connectionId} error:`, error);
                this.handleProcessError(connectionId, error);
            });

            // Log stderr for debugging
            child.stderr.on('data', (data) => {
                console.error(`[${serverId}] stderr:`, data.toString());
            });

            console.log(`Created stdio connection: ${connectionId} for ${serverId}`);
            return connectionId;

        } catch (error) {
            console.error('Failed to create stdio connection:', error);
            throw error;
        }
    }

    /**
     * Close a stdio connection
     * @param {string} connectionId - Connection identifier
     */
    async closeConnection(connectionId) {
        const processInfo = this.processes.get(connectionId);
        
        if (!processInfo) {
            return;
        }

        try {
            // Gracefully terminate the process
            if (processInfo.process && !processInfo.process.killed) {
                processInfo.process.kill('SIGTERM');
                
                // Give it time to clean up
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // Force kill if still running
                if (!processInfo.process.killed) {
                    processInfo.process.kill('SIGKILL');
                }
            }

            // Cleanup
            processInfo.messageHandler.cleanup();
            this.processes.delete(connectionId);
            this.connections.delete(connectionId);

            console.log(`Closed stdio connection: ${connectionId}`);

        } catch (error) {
            console.error(`Error closing connection ${connectionId}:`, error);
            throw error;
        }
    }

    /**
     * Send a message through stdio
     * @param {string} connectionId - Connection identifier
     * @param {Object} message - Message to send
     * @returns {Promise<Object>} Response message
     */
    async sendMessage(connectionId, message) {
        const processInfo = this.processes.get(connectionId);
        
        if (!processInfo) {
            throw new Error(`Connection not found: ${connectionId}`);
        }

        if (!this.validateMessage(message)) {
            throw new Error('Invalid message format');
        }

        try {
            return await processInfo.messageHandler.sendMessage(message);
        } catch (error) {
            console.error(`Failed to send message on ${connectionId}:`, error);
            throw error;
        }
    }

    /**
     * Set up message handler for a connection
     * @param {string} connectionId - Connection identifier
     * @param {Function} handler - Message handler function
     */
    onMessage(connectionId, handler) {
        const processInfo = this.processes.get(connectionId);
        
        if (!processInfo) {
            throw new Error(`Connection not found: ${connectionId}`);
        }

        processInfo.messageHandler.on('message', handler);
    }

    /**
     * Handle process exit
     * @param {string} connectionId - Connection identifier
     * @param {number} code - Exit code
     * @param {string} signal - Exit signal
     */
    handleProcessExit(connectionId, code, signal) {
        const processInfo = this.processes.get(connectionId);
        
        if (processInfo) {
            processInfo.exitCode = code;
            processInfo.exitSignal = signal;
            processInfo.endTime = Date.now();
            
            // Update connection status
            const connection = this.connections.get(connectionId);
            if (connection) {
                connection.status = 'disconnected';
                connection.disconnected = new Date();
            }
        }
    }

    /**
     * Handle process error
     * @param {string} connectionId - Connection identifier
     * @param {Error} error - Error object
     */
    handleProcessError(connectionId, error) {
        const processInfo = this.processes.get(connectionId);
        
        if (processInfo) {
            processInfo.error = error;
            processInfo.errorTime = Date.now();
            
            // Update connection status
            const connection = this.connections.get(connectionId);
            if (connection) {
                connection.status = 'error';
                connection.error = error.message;
            }
        }
    }

    /**
     * Get transport metrics
     * @returns {Promise<Object>} Transport metrics
     */
    async getMetrics() {
        const metrics = {
            type: 'stdio',
            connections: {
                active: 0,
                total: this.processes.size
            },
            processes: []
        };

        for (const [connectionId, processInfo] of this.processes) {
            const isActive = processInfo.process && !processInfo.process.killed;
            if (isActive) {
                metrics.connections.active++;
            }

            metrics.processes.push({
                connectionId,
                serverId: processInfo.serverId,
                pid: processInfo.pid,
                active: isActive,
                uptime: Date.now() - processInfo.startTime,
                exitCode: processInfo.exitCode,
                error: processInfo.error ? processInfo.error.message : null
            });
        }

        return metrics;
    }
}

/**
 * stdio Message Handler
 * Handles JSON-RPC communication over stdio
 */
class StdioMessageHandler extends EventEmitter {
    constructor(process) {
        super();
        this.process = process;
        this.pendingRequests = new Map();
        this.buffer = '';
        
        this.setupStreams();
    }

    /**
     * Setup readline interface for stdout
     */
    setupStreams() {
        this.rl = readline.createInterface({
            input: this.process.stdout,
            crlfDelay: Infinity
        });

        this.rl.on('line', (line) => {
            this.handleLine(line);
        });
    }

    /**
     * Handle a line of output
     * @param {string} line - Line of text
     */
    handleLine(line) {
        try {
            // Try to parse as JSON
            const message = JSON.parse(line);
            
            // Check if it's a response to a pending request
            if (message.id && this.pendingRequests.has(message.id)) {
                const { resolve, reject } = this.pendingRequests.get(message.id);
                this.pendingRequests.delete(message.id);
                
                if (message.error) {
                    reject(new Error(message.error.message || 'Unknown error'));
                } else {
                    resolve(message);
                }
            } else {
                // It's a notification or request from the server
                this.emit('message', message);
            }
        } catch (error) {
            // Not valid JSON, might be debug output
            console.debug('Non-JSON output:', line);
        }
    }

    /**
     * Send a message to the process
     * @param {Object} message - Message to send
     * @returns {Promise<Object>} Response
     */
    sendMessage(message) {
        return new Promise((resolve, reject) => {
            try {
                // Add ID if not present (for requests)
                if (!message.id && message.method) {
                    message.id = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                }

                // Store pending request
                if (message.id) {
                    this.pendingRequests.set(message.id, { resolve, reject });
                    
                    // Timeout after 30 seconds
                    setTimeout(() => {
                        if (this.pendingRequests.has(message.id)) {
                            this.pendingRequests.delete(message.id);
                            reject(new Error('Request timeout'));
                        }
                    }, 30000);
                }

                // Write message to stdin
                const jsonMessage = JSON.stringify(message);
                this.process.stdin.write(jsonMessage + '\n');

                // If it's a notification (no id), resolve immediately
                if (!message.id) {
                    resolve({ success: true });
                }

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Cleanup resources
     */
    cleanup() {
        if (this.rl) {
            this.rl.close();
        }
        
        // Reject all pending requests
        for (const [id, { reject }] of this.pendingRequests) {
            reject(new Error('Connection closed'));
        }
        
        this.pendingRequests.clear();
        this.removeAllListeners();
    }
}

module.exports = StdioTransport;