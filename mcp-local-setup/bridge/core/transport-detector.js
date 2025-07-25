const net = require('net');
const http = require('http');
const { spawn } = require('child_process');

/**
 * Transport Detector
 * Automatically detects the transport type of an MCP server
 */
class TransportDetector {
    constructor() {
        this.detectionStrategies = new Map();
        this.setupDefaultStrategies();
    }

    /**
     * Setup default detection strategies
     */
    setupDefaultStrategies() {
        // HTTP detection
        this.detectionStrategies.set('http', {
            priority: 1,
            detect: async (config) => {
                if (config.url && (config.url.startsWith('http://') || config.url.startsWith('https://'))) {
                    return await this.detectHTTP(config.url);
                }
                if (config.port && !config.command) {
                    return await this.detectHTTP(`http://localhost:${config.port}`);
                }
                return false;
            }
        });

        // WebSocket detection
        this.detectionStrategies.set('websocket', {
            priority: 2,
            detect: async (config) => {
                if (config.url && (config.url.startsWith('ws://') || config.url.startsWith('wss://'))) {
                    return true;
                }
                if (config.transport && config.transport.toLowerCase() === 'websocket') {
                    return true;
                }
                return false;
            }
        });

        // stdio detection
        this.detectionStrategies.set('stdio', {
            priority: 3,
            detect: async (config) => {
                if (config.command) {
                    return await this.detectStdio(config.command, config.args);
                }
                if (config.transport && config.transport.toLowerCase() === 'stdio') {
                    return true;
                }
                return false;
            }
        });

        // SSE detection
        this.detectionStrategies.set('sse', {
            priority: 4,
            detect: async (config) => {
                if (config.transport && config.transport.toLowerCase() === 'sse') {
                    return true;
                }
                if (config.url && config.url.includes('/events')) {
                    return await this.detectSSE(config.url);
                }
                return false;
            }
        });
    }

    /**
     * Detect transport type from configuration
     * @param {Object} config - Server configuration
     * @returns {Promise<Object>} Detection result
     */
    async detectTransport(config) {
        // Sort strategies by priority
        const strategies = Array.from(this.detectionStrategies.entries())
            .sort((a, b) => a[1].priority - b[1].priority);

        for (const [type, strategy] of strategies) {
            try {
                const detected = await strategy.detect(config);
                if (detected) {
                    return {
                        type,
                        confidence: detected === true ? 0.8 : detected,
                        details: this.getTransportDetails(type, config)
                    };
                }
            } catch (error) {
                console.debug(`Detection failed for ${type}:`, error.message);
            }
        }

        return {
            type: 'unknown',
            confidence: 0,
            details: { error: 'Could not detect transport type' }
        };
    }

    /**
     * Detect HTTP-based transport
     * @param {string} url - URL to test
     * @returns {Promise<number>} Confidence score (0-1)
     */
    async detectHTTP(url) {
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                resolve(0);
            }, 5000);

            try {
                const req = http.request(url, { method: 'OPTIONS' }, (res) => {
                    clearTimeout(timeout);
                    
                    // Check for MCP-specific headers
                    if (res.headers['x-mcp-version'] || res.headers['mcp-version']) {
                        resolve(1.0);
                    } else if (res.statusCode < 500) {
                        resolve(0.7);
                    } else {
                        resolve(0.3);
                    }
                });

                req.on('error', () => {
                    clearTimeout(timeout);
                    resolve(0);
                });

                req.end();
            } catch (error) {
                clearTimeout(timeout);
                resolve(0);
            }
        });
    }

    /**
     * Detect stdio-based transport
     * @param {string} command - Command to test
     * @param {Array} args - Command arguments
     * @returns {Promise<number>} Confidence score (0-1)
     */
    async detectStdio(command, args = []) {
        return new Promise((resolve) => {
            try {
                const testProcess = spawn(command, [...args, '--version'], {
                    stdio: ['pipe', 'pipe', 'pipe']
                });

                let output = '';
                let errorOutput = '';

                testProcess.stdout.on('data', (data) => {
                    output += data.toString();
                });

                testProcess.stderr.on('data', (data) => {
                    errorOutput += data.toString();
                });

                testProcess.on('close', (code) => {
                    // Check if it mentions MCP
                    if (output.includes('MCP') || output.includes('Model Context Protocol')) {
                        resolve(1.0);
                    } else if (code === 0) {
                        resolve(0.8);
                    } else {
                        resolve(0.3);
                    }
                });

                testProcess.on('error', () => {
                    resolve(0);
                });

                // Kill after timeout
                setTimeout(() => {
                    testProcess.kill();
                    resolve(0.5);
                }, 3000);

            } catch (error) {
                resolve(0);
            }
        });
    }

    /**
     * Detect SSE-based transport
     * @param {string} url - URL to test
     * @returns {Promise<number>} Confidence score (0-1)
     */
    async detectSSE(url) {
        return new Promise((resolve) => {
            try {
                const req = http.request(url, {
                    headers: {
                        'Accept': 'text/event-stream'
                    }
                }, (res) => {
                    if (res.headers['content-type'] && 
                        res.headers['content-type'].includes('text/event-stream')) {
                        resolve(1.0);
                    } else {
                        resolve(0.3);
                    }
                });

                req.on('error', () => {
                    resolve(0);
                });

                req.setTimeout(3000, () => {
                    req.destroy();
                    resolve(0);
                });

                req.end();
            } catch (error) {
                resolve(0);
            }
        });
    }

    /**
     * Get transport-specific details
     * @param {string} type - Transport type
     * @param {Object} config - Server configuration
     * @returns {Object} Transport details
     */
    getTransportDetails(type, config) {
        const details = {
            type,
            capabilities: this.getTransportCapabilities(type)
        };

        switch (type) {
            case 'http':
                details.url = config.url || `http://localhost:${config.port || 3000}`;
                details.streaming = true;
                break;
                
            case 'websocket':
                details.url = config.url || `ws://localhost:${config.port || 3000}`;
                details.bidirectional = true;
                break;
                
            case 'stdio':
                details.command = config.command;
                details.args = config.args || [];
                details.env = config.env || {};
                break;
                
            case 'sse':
                details.url = config.url || `http://localhost:${config.port || 3000}/events`;
                details.unidirectional = true;
                break;
        }

        return details;
    }

    /**
     * Get transport capabilities
     * @param {string} type - Transport type
     * @returns {Object} Capabilities
     */
    getTransportCapabilities(type) {
        const capabilities = {
            http: {
                streaming: true,
                request_response: true,
                binary: true,
                authentication: true,
                tls: true
            },
            websocket: {
                streaming: true,
                bidirectional: true,
                binary: true,
                authentication: true,
                tls: true,
                reconnection: true
            },
            stdio: {
                streaming: true,
                bidirectional: true,
                binary: false,
                authentication: false,
                tls: false,
                process_control: true
            },
            sse: {
                streaming: true,
                unidirectional: true,
                binary: false,
                authentication: true,
                tls: true,
                auto_reconnect: true
            }
        };

        return capabilities[type] || {};
    }

    /**
     * Register custom detection strategy
     * @param {string} type - Transport type
     * @param {Object} strategy - Detection strategy
     */
    registerStrategy(type, strategy) {
        if (!strategy.detect || typeof strategy.detect !== 'function') {
            throw new Error('Detection strategy must have a detect function');
        }

        this.detectionStrategies.set(type, {
            priority: strategy.priority || 10,
            detect: strategy.detect
        });
    }
}

module.exports = TransportDetector;