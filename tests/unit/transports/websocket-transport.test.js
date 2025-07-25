// File: tests/unit/transports/websocket-transport.test.js
// Purpose: Unit tests for WebSocket transport adapter

const WebSocketTransport = require('../../../bridge/transports/websocket/websocket-transport');
const WebSocket = require('ws');
const EventEmitter = require('events');

// Mock ws module
jest.mock('ws');

describe('WebSocketTransport', () => {
    let transport;
    let mockWs;

    beforeEach(() => {
        transport = new WebSocketTransport();
        
        // Create mock WebSocket
        mockWs = new EventEmitter();
        mockWs.readyState = WebSocket.OPEN;
        mockWs.send = jest.fn((data, callback) => {
            if (callback) callback();
        });
        mockWs.close = jest.fn();
        mockWs.pong = jest.fn();

        // Mock WebSocket constructor
        WebSocket.mockImplementation(() => mockWs);
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

        it('should throw error if transport not initialized', async () => {
            const uninitializedTransport = new WebSocketTransport();
            await expect(
                uninitializedTransport.createConnection({ url: 'ws://test.com' })
            ).rejects.toThrow('Transport not initialized');
        });

        it('should throw error if url is missing', async () => {
            await expect(
                transport.createConnection({ serverId: 'test' })
            ).rejects.toThrow('url is required for WebSocket transport');
        });

        it('should create WebSocket connection with correct parameters', async () => {
            const config = {
                serverId: 'test-server',
                url: 'ws://localhost:8080',
                headers: { 'Authorization': 'Bearer token' }
            };

            // Emit open event immediately
            setTimeout(() => mockWs.emit('open'), 0);

            const connectionId = await transport.createConnection(config);

            expect(WebSocket).toHaveBeenCalledWith('ws://localhost:8080', {
                headers: { 'Authorization': 'Bearer token' },
                perMessageDeflate: false,
                handshakeTimeout: 10000
            });
            expect(connectionId).toMatch(/^conn_\d+_[a-z0-9]+$/);
        });

        it('should update metrics on connection creation', async () => {
            const initialTotal = transport.metrics.totalConnections;
            
            setTimeout(() => mockWs.emit('open'), 0);
            await transport.createConnection({ url: 'ws://test.com' });

            expect(transport.metrics.totalConnections).toBe(initialTotal + 1);
            expect(transport.metrics.activeConnections).toBe(1);
        });

        it('should handle connection errors', async () => {
            const error = new Error('Connection failed');
            
            setTimeout(() => mockWs.emit('error', error), 0);

            await expect(
                transport.createConnection({ url: 'ws://test.com' })
            ).rejects.toThrow('Connection failed');
        });

        it('should handle secure WebSocket URLs', async () => {
            setTimeout(() => mockWs.emit('open'), 0);
            
            const connectionId = await transport.createConnection({ 
                url: 'wss://secure.test.com' 
            });

            expect(WebSocket).toHaveBeenCalledWith('wss://secure.test.com', expect.any(Object));
            expect(connectionId).toBeTruthy();
        });
    });

    describe('sendMessage', () => {
        let connectionId;

        beforeEach(async () => {
            transport.initialize();
            setTimeout(() => mockWs.emit('open'), 0);
            connectionId = await transport.createConnection({ url: 'ws://test.com' });
        });

        it('should throw error for non-existent connection', async () => {
            await expect(
                transport.sendMessage('invalid-connection', { jsonrpc: '2.0', method: 'test', id: 1 })
            ).rejects.toThrow('Connection invalid-connection not found');
        });

        it('should throw error if connection is not active', async () => {
            const connectionInfo = transport.connections.get(connectionId);
            connectionInfo.status = 'disconnected';

            await expect(
                transport.sendMessage(connectionId, { jsonrpc: '2.0', method: 'test', id: 1 })
            ).rejects.toThrow(`Connection ${connectionId} is not active`);
        });

        it('should throw error for invalid JSON-RPC message', async () => {
            await expect(
                transport.sendMessage(connectionId, { invalid: 'message' })
            ).rejects.toThrow('Invalid JSON-RPC 2.0 message');
        });

        it('should throw error if WebSocket is not open', async () => {
            mockWs.readyState = WebSocket.CLOSING;

            await expect(
                transport.sendMessage(connectionId, { jsonrpc: '2.0', method: 'test', id: 1 })
            ).rejects.toThrow('WebSocket is not open');
        });

        it('should send message correctly', async () => {
            const message = { jsonrpc: '2.0', method: 'test', params: { data: 'hello' }, id: 1 };
            
            // Set up response handling
            setTimeout(() => {
                const connectionInfo = transport.connections.get(connectionId);
                const callback = connectionInfo.pendingRequests.get(1);
                if (callback) {
                    callback({ jsonrpc: '2.0', id: 1, result: 'success' });
                }
            }, 10);

            const response = await transport.sendMessage(connectionId, message);

            expect(mockWs.send).toHaveBeenCalledWith(
                JSON.stringify(message),
                expect.any(Function)
            );
            expect(response).toEqual({ jsonrpc: '2.0', id: 1, result: 'success' });
            expect(transport.metrics.totalMessages).toBe(1);
        });

        it('should handle notifications (messages without id)', async () => {
            const message = { jsonrpc: '2.0', method: 'notify' };
            
            const response = await transport.sendMessage(connectionId, message);

            expect(mockWs.send).toHaveBeenCalled();
            expect(response).toEqual({ jsonrpc: '2.0', result: 'notification sent' });
        });

        it('should timeout if no response received', async () => {
            jest.setTimeout(35000);
            const message = { jsonrpc: '2.0', method: 'test', id: 1 };
            
            await expect(
                transport.sendMessage(connectionId, message)
            ).rejects.toThrow('Request 1 timed out');
        }, 35000);

        it('should handle send errors', async () => {
            const error = new Error('Send failed');
            mockWs.send = jest.fn((data, callback) => {
                if (callback) callback(error);
            });

            await expect(
                transport.sendMessage(connectionId, { jsonrpc: '2.0', method: 'test', id: 1 })
            ).rejects.toThrow('Send failed');
        });
    });

    describe('handleIncomingMessage', () => {
        let connectionId;

        beforeEach(async () => {
            transport.initialize();
            setTimeout(() => mockWs.emit('open'), 0);
            connectionId = await transport.createConnection({ url: 'ws://test.com' });
        });

        it('should handle response messages', () => {
            const connectionInfo = transport.connections.get(connectionId);
            const mockCallback = jest.fn();
            connectionInfo.pendingRequests.set(1, mockCallback);

            mockWs.emit('message', JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                result: 'test'
            }));

            expect(mockCallback).toHaveBeenCalledWith({
                jsonrpc: '2.0',
                id: 1,
                result: 'test'
            });
            expect(connectionInfo.pendingRequests.has(1)).toBe(false);
        });

        it('should handle error responses', () => {
            const connectionInfo = transport.connections.get(connectionId);
            const mockCallback = jest.fn();
            connectionInfo.pendingRequests.set(1, mockCallback);

            mockWs.emit('message', JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                error: { code: -32601, message: 'Method not found' }
            }));

            expect(mockCallback).toHaveBeenCalledWith({
                jsonrpc: '2.0',
                id: 1,
                error: { code: -32601, message: 'Method not found' }
            });
        });

        it('should handle server-initiated requests', () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            mockWs.emit('message', JSON.stringify({
                jsonrpc: '2.0',
                method: 'server.notification',
                params: { data: 'hello' }
            }));

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Received server message'),
                expect.objectContaining({ method: 'server.notification' })
            );

            consoleSpy.mockRestore();
        });

        it('should handle invalid JSON', () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

            mockWs.emit('message', 'invalid json');

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Failed to parse WebSocket message:')
            );

            consoleSpy.mockRestore();
        });
    });

    describe('connection events', () => {
        let connectionId;

        beforeEach(async () => {
            transport.initialize();
            setTimeout(() => mockWs.emit('open'), 0);
            connectionId = await transport.createConnection({ url: 'ws://test.com' });
        });

        it('should handle connection close', () => {
            const connectionInfo = transport.connections.get(connectionId);
            const mockCallback = jest.fn();
            connectionInfo.pendingRequests.set(1, mockCallback);
            // Disable reconnection for this test
            connectionInfo.maxReconnectAttempts = 0;

            mockWs.emit('close', 1000, 'Normal closure');

            expect(connectionInfo.status).toBe('disconnected');
            expect(transport.metrics.activeConnections).toBe(0);
            expect(mockCallback).toHaveBeenCalledWith(
                expect.objectContaining({
                    error: expect.objectContaining({
                        code: -32603,
                        message: 'WebSocket connection closed'
                    })
                })
            );
        });

        it('should attempt reconnection on close', (done) => {
            const connectionInfo = transport.connections.get(connectionId);
            connectionInfo.maxReconnectAttempts = 1;
            connectionInfo.reconnectDelay = 10;

            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            mockWs.emit('close', 1006, 'Abnormal closure');

            setTimeout(() => {
                expect(consoleSpy).toHaveBeenCalledWith(
                    expect.stringContaining('Attempting reconnection 1/1')
                );
                expect(WebSocket).toHaveBeenCalledTimes(2); // Initial + reconnect
                consoleSpy.mockRestore();
                done();
            }, 20);
        });

        it('should handle ping events', () => {
            mockWs.emit('ping');
            expect(mockWs.pong).toHaveBeenCalled();
        });
    });

    describe('closeConnection', () => {
        let connectionId;

        beforeEach(async () => {
            transport.initialize();
            setTimeout(() => mockWs.emit('open'), 0);
            connectionId = await transport.createConnection({ url: 'ws://test.com' });
        });

        it('should close the WebSocket connection', () => {
            transport.closeConnection(connectionId);

            expect(mockWs.close).toHaveBeenCalledWith(1000, 'Normal closure');
            expect(transport.connections.has(connectionId)).toBe(false);
            expect(transport.websockets.has(connectionId)).toBe(false);
        });

        it('should prevent reconnection attempts', () => {
            const connectionInfo = transport.connections.get(connectionId);
            connectionInfo.maxReconnectAttempts = 3;

            transport.closeConnection(connectionId);

            expect(connectionInfo.maxReconnectAttempts).toBe(0);
        });

        it('should handle non-existent connection gracefully', () => {
            expect(() => {
                transport.closeConnection('invalid-connection');
            }).not.toThrow();
        });
    });

    describe('getStatus', () => {
        let connectionId;

        beforeEach(async () => {
            transport.initialize();
            setTimeout(() => mockWs.emit('open'), 0);
            connectionId = await transport.createConnection({ url: 'ws://test.com' });
        });

        it('should return correct status for active connection', () => {
            const connectionInfo = transport.connections.get(connectionId);
            connectionInfo.messageCount = 5;
            connectionInfo.reconnectAttempts = 2;
            connectionInfo.pendingRequests.set(1, () => {});
            connectionInfo.pendingRequests.set(2, () => {});

            const status = transport.getStatus(connectionId);

            expect(status).toEqual({
                status: 'connected',
                uptime: expect.any(Number),
                metrics: {
                    messages_sent: 5,
                    pending_requests: 2,
                    reconnect_attempts: 2,
                    websocket_state: WebSocket.OPEN
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

        it('should handle missing WebSocket instance', () => {
            const connectionInfo = transport.connections.get(connectionId);
            connectionInfo.ws = null;

            const status = transport.getStatus(connectionId);

            expect(status.metrics.websocket_state).toBe('N/A');
        });
    });
});