// File: tests/unit/transports/test_stdio_transport.js
// Purpose: Unit tests for stdio transport adapter

const StdioTransport = require('../../../bridge/transports/stdio/stdio-transport');
const { spawn } = require('child_process');
const EventEmitter = require('events');

// Mock child_process
jest.mock('child_process');

describe('StdioTransport', () => {
    let transport;
    let mockProcess;

    beforeEach(() => {
        transport = new StdioTransport();
        
        // Create mock process
        mockProcess = new EventEmitter();
        mockProcess.stdin = {
            write: jest.fn((data, callback) => {
                if (callback) callback();
            })
        };
        mockProcess.stdout = new EventEmitter();
        mockProcess.stderr = new EventEmitter();
        mockProcess.kill = jest.fn();
        mockProcess.killed = false;

        // Mock spawn to return our mock process
        spawn.mockReturnValue(mockProcess);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('initialize', () => {
        it('should set status to initialized', () => {
            expect(transport.status).toBe('uninitialized');
            transport.initialize();
            expect(transport.status).toBe('initialized');
        });
    });

    describe('createConnection', () => {
        beforeEach(() => {
            transport.initialize();
        });

        it('should throw error if transport not initialized', () => {
            const uninitializedTransport = new StdioTransport();
            expect(() => {
                uninitializedTransport.createConnection({ command: 'test' });
            }).toThrow('Transport not initialized');
        });

        it('should throw error if command is missing', () => {
            expect(() => {
                transport.createConnection({ serverId: 'test' });
            }).toThrow('command is required for stdio transport');
        });

        it('should spawn process with correct parameters', () => {
            const config = {
                serverId: 'test-server',
                command: 'node',
                args: ['server.js'],
                env: { NODE_ENV: 'test' }
            };

            const connectionId = transport.createConnection(config);

            expect(spawn).toHaveBeenCalledWith('node', ['server.js'], {
                env: expect.objectContaining({ NODE_ENV: 'test' }),
                stdio: ['pipe', 'pipe', 'pipe']
            });
            expect(connectionId).toMatch(/^conn_\d+_[a-z0-9]+$/);
        });

        it('should update metrics on connection creation', () => {
            const initialTotal = transport.metrics.totalConnections;
            const initialActive = transport.metrics.activeConnections;

            transport.createConnection({ command: 'test' });

            expect(transport.metrics.totalConnections).toBe(initialTotal + 1);
            expect(transport.metrics.activeConnections).toBe(initialActive + 1);
        });

        it('should handle process exit correctly', () => {
            const connectionId = transport.createConnection({ command: 'test' });
            const processInfo = transport.processes.get(connectionId);
            
            // Add a pending request
            const mockCallback = jest.fn();
            processInfo.pendingRequests.set(1, mockCallback);

            // Simulate process exit
            mockProcess.emit('exit', 0, null);

            expect(processInfo.status).toBe('disconnected');
            expect(transport.metrics.activeConnections).toBe(0);
            expect(mockCallback).toHaveBeenCalledWith(
                expect.objectContaining({
                    jsonrpc: '2.0',
                    error: expect.objectContaining({
                        code: -32603,
                        message: 'Process terminated'
                    })
                })
            );
        });

        it('should handle process errors', () => {
            const connectionId = transport.createConnection({ command: 'test' });
            const processInfo = transport.processes.get(connectionId);

            const error = new Error('Process error');
            mockProcess.emit('error', error);

            expect(processInfo.status).toBe('error');
        });
    });

    describe('sendMessage', () => {
        let connectionId;

        beforeEach(() => {
            transport.initialize();
            connectionId = transport.createConnection({ command: 'test' });
        });

        it('should throw error for non-existent connection', async () => {
            await expect(
                transport.sendMessage('invalid-connection', { jsonrpc: '2.0', method: 'test', id: 1 })
            ).rejects.toThrow('Connection invalid-connection not found');
        });

        it('should throw error if connection is not active', async () => {
            const processInfo = transport.processes.get(connectionId);
            processInfo.status = 'disconnected';

            await expect(
                transport.sendMessage(connectionId, { jsonrpc: '2.0', method: 'test', id: 1 })
            ).rejects.toThrow('Connection conn_');
        });

        it('should throw error for invalid JSON-RPC message', async () => {
            await expect(
                transport.sendMessage(connectionId, { invalid: 'message' })
            ).rejects.toThrow('Invalid JSON-RPC 2.0 message');
        });

        it('should send message correctly', async () => {
            const message = { jsonrpc: '2.0', method: 'test', params: { data: 'hello' }, id: 1 };
            
            // Set up response handling
            setTimeout(() => {
                const processInfo = transport.processes.get(connectionId);
                const callback = processInfo.pendingRequests.get(1);
                if (callback) {
                    callback({ jsonrpc: '2.0', id: 1, result: 'success' });
                }
            }, 10);

            const response = await transport.sendMessage(connectionId, message);

            expect(mockProcess.stdin.write).toHaveBeenCalledWith(
                JSON.stringify(message) + '\n',
                expect.any(Function)
            );
            expect(response).toEqual({ jsonrpc: '2.0', id: 1, result: 'success' });
            expect(transport.metrics.totalMessages).toBe(1);
        });

        it('should handle notifications (messages without id)', async () => {
            const message = { jsonrpc: '2.0', method: 'notify' };
            
            const response = await transport.sendMessage(connectionId, message);

            expect(mockProcess.stdin.write).toHaveBeenCalled();
            expect(response).toEqual({ jsonrpc: '2.0', result: 'notification sent' });
        });

        it('should timeout if no response received', async () => {
            const message = { jsonrpc: '2.0', method: 'test', id: 1 };
            
            await expect(
                transport.sendMessage(connectionId, message)
            ).rejects.toThrow('Request 1 timed out');
        }, 35000); // Longer timeout for this test
    });

    describe('processBufferedMessages', () => {
        let connectionId;

        beforeEach(() => {
            transport.initialize();
            connectionId = transport.createConnection({ command: 'test' });
        });

        it('should parse complete JSON messages', () => {
            const processInfo = transport.processes.get(connectionId);
            const mockCallback = jest.fn();
            processInfo.pendingRequests.set(1, mockCallback);

            // Simulate receiving data
            mockProcess.stdout.emit('data', '{"jsonrpc":"2.0","id":1,"result":"test"}\n');

            expect(mockCallback).toHaveBeenCalledWith({
                jsonrpc: '2.0',
                id: 1,
                result: 'test'
            });
        });

        it('should handle partial messages', () => {
            const processInfo = transport.processes.get(connectionId);
            const mockCallback = jest.fn();
            processInfo.pendingRequests.set(1, mockCallback);

            // Send partial message
            mockProcess.stdout.emit('data', '{"jsonrpc":"2.0",');
            expect(mockCallback).not.toHaveBeenCalled();

            // Send rest of message
            mockProcess.stdout.emit('data', '"id":1,"result":"test"}\n');
            expect(mockCallback).toHaveBeenCalledWith({
                jsonrpc: '2.0',
                id: 1,
                result: 'test'
            });
        });

        it('should handle multiple messages in one chunk', () => {
            const processInfo = transport.processes.get(connectionId);
            const mockCallback1 = jest.fn();
            const mockCallback2 = jest.fn();
            processInfo.pendingRequests.set(1, mockCallback1);
            processInfo.pendingRequests.set(2, mockCallback2);

            const data = '{"jsonrpc":"2.0","id":1,"result":"test1"}\n{"jsonrpc":"2.0","id":2,"result":"test2"}\n';
            mockProcess.stdout.emit('data', data);

            expect(mockCallback1).toHaveBeenCalledWith({
                jsonrpc: '2.0',
                id: 1,
                result: 'test1'
            });
            expect(mockCallback2).toHaveBeenCalledWith({
                jsonrpc: '2.0',
                id: 2,
                result: 'test2'
            });
        });
    });

    describe('closeConnection', () => {
        let connectionId;

        beforeEach(() => {
            transport.initialize();
            connectionId = transport.createConnection({ command: 'test' });
        });

        it('should kill the process', () => {
            transport.closeConnection(connectionId);

            expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
            expect(transport.connections.has(connectionId)).toBe(false);
            expect(transport.processes.has(connectionId)).toBe(false);
        });

        it('should force kill if process does not terminate', (done) => {
            jest.useFakeTimers();
            
            transport.closeConnection(connectionId);
            
            expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
            
            // Fast-forward time
            jest.advanceTimersByTime(5000);
            
            expect(mockProcess.kill).toHaveBeenCalledWith('SIGKILL');
            
            jest.useRealTimers();
            done();
        });

        it('should update metrics', () => {
            const initialActive = transport.metrics.activeConnections;
            
            transport.closeConnection(connectionId);
            
            expect(transport.metrics.activeConnections).toBe(initialActive - 1);
        });

        it('should handle non-existent connection gracefully', () => {
            expect(() => {
                transport.closeConnection('invalid-connection');
            }).not.toThrow();
        });
    });

    describe('getStatus', () => {
        let connectionId;

        beforeEach(() => {
            transport.initialize();
            connectionId = transport.createConnection({ command: 'test' });
        });

        it('should return correct status for active connection', () => {
            const status = transport.getStatus(connectionId);

            expect(status).toEqual({
                status: 'connected',
                uptime: expect.any(Number),
                metrics: {
                    messages_sent: 0,
                    pending_requests: 0,
                    buffer_size: 0
                }
            });
            expect(status.uptime).toBeGreaterThanOrEqual(0);
        });

        it('should return unknown status for non-existent connection', () => {
            const status = transport.getStatus('invalid-connection');

            expect(status).toEqual({
                status: 'unknown',
                uptime: 0,
                metrics: {}
            });
        });

        it('should include pending requests in metrics', () => {
            const processInfo = transport.processes.get(connectionId);
            processInfo.pendingRequests.set(1, () => {});
            processInfo.pendingRequests.set(2, () => {});

            const status = transport.getStatus(connectionId);

            expect(status.metrics.pending_requests).toBe(2);
        });
    });
});