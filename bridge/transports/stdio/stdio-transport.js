// File: bridge/transports/stdio/stdio-transport.js
// Purpose: stdio transport adapter implementation

const { spawn } = require('child_process');
const TransportInterface = require('../../core/transport.interface');

class StdioTransport extends TransportInterface {
    constructor() {
        super();
        this.processes = new Map(); // Map of connectionId to process info
    }

    /**
     * Initialize the stdio transport adapter
     */
    initialize() {
        this.status = 'initialized';
        console.log('Stdio transport initialized');
    }

    /**
     * Create a new stdio connection by spawning a process
     * @param {Object} config - Connection configuration
     * @returns {string} Connection ID
     */
    createConnection(config) {
        if (this.status !== 'initialized') {
            throw new Error('Transport not initialized');
        }

        if (!config.command) {
            throw new Error('command is required for stdio transport');
        }

        const connectionId = this.generateConnectionId();
        const startTime = Date.now();

        try {
            // Spawn the process
            const args = config.args || [];
            const env = { ...process.env, ...(config.env || {}) };
            
            const childProcess = spawn(config.command, args, {
                env,
                stdio: ['pipe', 'pipe', 'pipe']
            });

            // Store process info
            const processInfo = {
                process: childProcess,
                serverId: config.serverId,
                command: config.command,
                args,
                status: 'connected',
                startTime,
                messageQueue: [],
                pendingRequests: new Map(), // Map of request ID to callback
                buffer: '' // Buffer for incomplete messages
            };

            this.connections.set(connectionId, processInfo);
            this.processes.set(connectionId, processInfo);

            // Set up process event handlers
            this.setupProcessHandlers(connectionId, childProcess);

            // Update metrics
            this.metrics.totalConnections++;
            this.metrics.activeConnections++;

            return connectionId;
        } catch (error) {
            throw new Error(`Failed to spawn process: ${error.message}`);
        }
    }

    /**
     * Set up event handlers for the child process
     * @param {string} connectionId - Connection ID
     * @param {ChildProcess} childProcess - The child process
     */
    setupProcessHandlers(connectionId, childProcess) {
        const processInfo = this.processes.get(connectionId);

        // Handle stdout data
        childProcess.stdout.on('data', (data) => {
            processInfo.buffer += data.toString();
            this.processBufferedMessages(connectionId);
        });

        // Handle stderr data
        childProcess.stderr.on('data', (data) => {
            console.error(`[${connectionId}] stderr:`, data.toString());
        });

        // Handle process exit
        childProcess.on('exit', (code, signal) => {
            console.log(`[${connectionId}] Process exited with code ${code}, signal ${signal}`);
            processInfo.status = 'disconnected';
            this.metrics.activeConnections--;

            // Reject all pending requests
            for (const [id, callback] of processInfo.pendingRequests) {
                callback(this.createErrorResponse(id, -32603, 'Process terminated'));
            }
            processInfo.pendingRequests.clear();
        });

        // Handle process errors
        childProcess.on('error', (error) => {
            console.error(`[${connectionId}] Process error:`, error);
            processInfo.status = 'error';
        });
    }

    /**
     * Process buffered messages from stdout
     * @param {string} connectionId - Connection ID
     */
    processBufferedMessages(connectionId) {
        const processInfo = this.processes.get(connectionId);
        const lines = processInfo.buffer.split('\n');
        
        // Keep the last incomplete line in the buffer
        processInfo.buffer = lines.pop() || '';

        for (const line of lines) {
            if (line.trim()) {
                try {
                    const message = JSON.parse(line);
                    this.handleIncomingMessage(connectionId, message);
                } catch (error) {
                    console.error(`[${connectionId}] Failed to parse message:`, line, error);
                }
            }
        }
    }

    /**
     * Handle incoming message from the process
     * @param {string} connectionId - Connection ID
     * @param {Object} message - Parsed message
     */
    handleIncomingMessage(connectionId, message) {
        const processInfo = this.processes.get(connectionId);
        
        if (!this.validateJsonRpcMessage(message)) {
            console.error(`[${connectionId}] Invalid JSON-RPC message:`, message);
            return;
        }

        // If it's a response, match it with pending request
        if ('id' in message && (message.result !== undefined || message.error !== undefined)) {
            const callback = processInfo.pendingRequests.get(message.id);
            if (callback) {
                processInfo.pendingRequests.delete(message.id);
                callback(message);
            }
        }
    }

    /**
     * Send a message through the stdio transport
     * @param {string} connectionId - Connection identifier
     * @param {Object} message - JSON-RPC 2.0 message
     * @returns {Promise<Object>} Response message
     */
    async sendMessage(connectionId, message) {
        const processInfo = this.processes.get(connectionId);
        
        if (!processInfo) {
            throw new Error(`Connection ${connectionId} not found`);
        }

        if (processInfo.status !== 'connected') {
            throw new Error(`Connection ${connectionId} is not active`);
        }

        if (!this.validateJsonRpcMessage(message)) {
            throw new Error('Invalid JSON-RPC 2.0 message');
        }

        return new Promise((resolve, reject) => {
            try {
                // If the message has an ID, track it for response matching
                if ('id' in message) {
                    processInfo.pendingRequests.set(message.id, resolve);
                    
                    // Set timeout for response
                    setTimeout(() => {
                        if (processInfo.pendingRequests.has(message.id)) {
                            processInfo.pendingRequests.delete(message.id);
                            reject(new Error(`Request ${message.id} timed out`));
                        }
                    }, 30000); // 30 second timeout
                }

                // Send the message
                const messageStr = JSON.stringify(message) + '\n';
                processInfo.process.stdin.write(messageStr, (error) => {
                    if (error) {
                        if ('id' in message) {
                            processInfo.pendingRequests.delete(message.id);
                        }
                        reject(error);
                    } else if (!('id' in message)) {
                        // For notifications (no ID), resolve immediately
                        resolve({ jsonrpc: '2.0', result: 'notification sent' });
                    }
                });

                // Update metrics
                this.metrics.totalMessages++;

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Close a stdio connection
     * @param {string} connectionId - Connection identifier
     */
    closeConnection(connectionId) {
        const processInfo = this.processes.get(connectionId);
        
        if (!processInfo) {
            return; // Already closed or doesn't exist
        }

        // Kill the process
        if (processInfo.process && !processInfo.process.killed) {
            processInfo.process.kill('SIGTERM');
            
            // Force kill after timeout
            setTimeout(() => {
                if (!processInfo.process.killed) {
                    processInfo.process.kill('SIGKILL');
                }
            }, 5000);
        }

        // Update status
        processInfo.status = 'disconnected';
        
        // Clean up
        this.connections.delete(connectionId);
        this.processes.delete(connectionId);
        
        // Update metrics
        if (this.metrics.activeConnections > 0) {
            this.metrics.activeConnections--;
        }
    }

    /**
     * Get connection status
     * @param {string} connectionId - Connection identifier
     * @returns {Object} Status dictionary
     */
    getStatus(connectionId) {
        const processInfo = this.processes.get(connectionId);
        
        if (!processInfo) {
            return {
                status: 'unknown',
                uptime: 0,
                metrics: {}
            };
        }

        const uptime = Math.floor((Date.now() - processInfo.startTime) / 1000);
        
        return {
            status: processInfo.status,
            uptime,
            metrics: {
                messages_sent: this.metrics.totalMessages,
                pending_requests: processInfo.pendingRequests.size,
                buffer_size: processInfo.buffer.length
            }
        };
    }
}

module.exports = StdioTransport;