// File: tests/unit/transports/http-transport.test.js
// Purpose: Unit tests for HTTP/SSE transport adapter

const HttpTransport = require('../../../bridge/transports/http/http-transport');
const http = require('http');
const https = require('https');
const EventEmitter = require('events');

// Mock http and https modules
jest.mock('http');
jest.mock('https');

describe('HttpTransport', () => {
    let transport;
    let mockRequest;
    let mockResponse;

    beforeEach(() => {
        transport = new HttpTransport();
        
        // Create mock request
        mockRequest = new EventEmitter();
        mockRequest.on = jest.fn((event, handler) => {
            EventEmitter.prototype.on.call(mockRequest, event, handler);
            return mockRequest;
        });
        mockRequest.write = jest.fn();
        mockRequest.end = jest.fn();
        mockRequest.setTimeout = jest.fn();
        mockRequest.destroy = jest.fn();

        // Create mock response
        mockResponse = new EventEmitter();
        mockResponse.statusCode = 200;
        mockResponse.on = jest.fn((event, handler) => {
            EventEmitter.prototype.on.call(mockResponse, event, handler);
            return mockResponse;
        });
        mockResponse.destroy = jest.fn();

        // Mock http.request and https.request
        http.request = jest.fn((options, callback) => {
            if (callback) setTimeout(() => callback(mockResponse), 10);
            return mockRequest;
        });
        https.request = jest.fn((options, callback) => {
            if (callback) setTimeout(() => callback(mockResponse), 10);
            return mockRequest;
        });

        // Mock http.get and https.get for SSE
        http.get = jest.fn((url, options, callback) => {
            if (callback) setTimeout(() => callback(mockResponse), 10);
            return mockRequest;
        });
        https.get = jest.fn((url, options, callback) => {
            if (callback) setTimeout(() => callback(mockResponse), 10);
            return mockRequest;
        });
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
            const uninitializedTransport = new HttpTransport();
            expect(() => {
                uninitializedTransport.createConnection({ url: 'http://example.com' });
            }).toThrow('Transport not initialized');
        });

        it('should throw error if url is missing', () => {
            expect(() => {
                transport.createConnection({ serverId: 'test' });
            }).toThrow('url is required for HTTP transport');
        });

        it('should create connection with HTTP URL', () => {
            const config = {
                serverId: 'test-server',
                url: 'http://example.com/api',
                headers: { 'Authorization': 'Bearer token' }
            };

            const connectionId = transport.createConnection(config);

            expect(connectionId).toMatch(/^conn_\d+_[a-z0-9]+$/);
            expect(transport.connections.has(connectionId)).toBe(true);
            
            const connectionInfo = transport.connections.get(connectionId);
            expect(connectionInfo.url).toBe('http://example.com/api');
            expect(connectionInfo.status).toBe('connected');
            expect(connectionInfo.headers).toEqual({ 'Authorization': 'Bearer token' });
        });

        it('should create connection with HTTPS URL', () => {
            const config = {
                serverId: 'test-server',
                url: 'https://secure.example.com/api'
            };

            const connectionId = transport.createConnection(config);
            const connectionInfo = transport.connections.get(connectionId);
            
            expect(connectionInfo.parsedUrl.protocol).toBe('https:');
        });

        it('should establish SSE connection if sseEndpoint provided', (done) => {
            const config = {
                serverId: 'test-server',
                url: 'http://example.com/api',
                sseEndpoint: '/events'
            };

            const connectionId = transport.createConnection(config);

            // Wait for SSE setup
            setTimeout(() => {
                expect(http.get).toHaveBeenCalledWith(
                    'http://example.com/events',
                    expect.objectContaining({
                        headers: expect.objectContaining({
                            'Accept': 'text/event-stream',
                            'Cache-Control': 'no-cache'
                        })
                    }),
                    expect.any(Function)
                );
                done();
            }, 20);
        });

        it('should update metrics on connection creation', () => {
            const initialTotal = transport.metrics.totalConnections;
            const initialActive = transport.metrics.activeConnections;

            transport.createConnection({ url: 'http://example.com' });

            expect(transport.metrics.totalConnections).toBe(initialTotal + 1);
            expect(transport.metrics.activeConnections).toBe(initialActive + 1);
        });
    });

    describe('sendMessage', () => {
        let connectionId;

        beforeEach(() => {
            transport.initialize();
            connectionId = transport.createConnection({ url: 'http://example.com/api' });
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
            ).rejects.toThrow('Connection conn_');
        });

        it('should throw error for invalid JSON-RPC message', async () => {
            await expect(
                transport.sendMessage(connectionId, { invalid: 'message' })
            ).rejects.toThrow('Invalid JSON-RPC 2.0 message');
        });

        it('should send HTTP POST request correctly', async () => {
            const message = { jsonrpc: '2.0', method: 'test', params: { data: 'hello' }, id: 1 };
            const expectedResponse = { jsonrpc: '2.0', id: 1, result: 'success' };

            // Setup response
            setTimeout(() => {
                mockResponse.emit('data', JSON.stringify(expectedResponse));
                mockResponse.emit('end');
            }, 20);

            const response = await transport.sendMessage(connectionId, message);

            expect(http.request).toHaveBeenCalledWith(
                expect.objectContaining({
                    hostname: 'example.com',
                    path: '/api',
                    method: 'POST',
                    headers: expect.objectContaining({
                        'Content-Type': 'application/json'
                    })
                }),
                expect.any(Function)
            );
            expect(mockRequest.write).toHaveBeenCalledWith(JSON.stringify(message));
            expect(mockRequest.end).toHaveBeenCalled();
            expect(response).toEqual(expectedResponse);
        });

        it('should handle HTTPS requests', async () => {
            const httpsConnectionId = transport.createConnection({ url: 'https://secure.example.com/api' });
            const message = { jsonrpc: '2.0', method: 'test', id: 1 };

            setTimeout(() => {
                mockResponse.emit('data', '{"jsonrpc":"2.0","id":1,"result":"ok"}');
                mockResponse.emit('end');
            }, 20);

            await transport.sendMessage(httpsConnectionId, message);

            expect(https.request).toHaveBeenCalled();
            expect(http.request).not.toHaveBeenCalled();
        });

        it('should handle HTTP errors', async () => {
            const message = { jsonrpc: '2.0', method: 'test', id: 1 };

            setTimeout(() => {
                mockResponse.statusCode = 500;
                mockResponse.emit('data', 'Internal Server Error');
                mockResponse.emit('end');
            }, 20);

            await expect(
                transport.sendMessage(connectionId, message)
            ).rejects.toThrow('HTTP error 500: Internal Server Error');
        });

        it('should handle request errors', async () => {
            const message = { jsonrpc: '2.0', method: 'test', id: 1 };

            setTimeout(() => {
                mockRequest.emit('error', new Error('Network error'));
            }, 20);

            await expect(
                transport.sendMessage(connectionId, message)
            ).rejects.toThrow('HTTP request failed: Network error');
        });

        it('should handle request timeout', async () => {
            const message = { jsonrpc: '2.0', method: 'test', id: 1 };

            setTimeout(() => {
                mockRequest.emit('timeout');
            }, 20);

            await expect(
                transport.sendMessage(connectionId, message)
            ).rejects.toThrow('HTTP request timed out');

            expect(mockRequest.destroy).toHaveBeenCalled();
        });

        it('should update metrics on successful message', async () => {
            const message = { jsonrpc: '2.0', method: 'test', id: 1 };
            const connectionInfo = transport.connections.get(connectionId);
            const initialMessageCount = connectionInfo.messageCount;
            const initialTotalMessages = transport.metrics.totalMessages;

            setTimeout(() => {
                mockResponse.emit('data', '{"jsonrpc":"2.0","id":1,"result":"ok"}');
                mockResponse.emit('end');
            }, 20);

            await transport.sendMessage(connectionId, message);

            expect(connectionInfo.messageCount).toBe(initialMessageCount + 1);
            expect(transport.metrics.totalMessages).toBe(initialTotalMessages + 1);
        });
    });

    describe('SSE handling', () => {
        let connectionId;

        beforeEach(() => {
            transport.initialize();
        });

        it('should handle SSE messages', (done) => {
            const config = {
                serverId: 'test-server',
                url: 'http://example.com/api',
                sseEndpoint: '/events'
            };

            connectionId = transport.createConnection(config);

            setTimeout(() => {
                // Simulate SSE data
                mockResponse.emit('data', 'data: {"type":"notification","content":"test"}\n\n');
                
                // Check that SSE connection was established
                const connectionInfo = transport.connections.get(connectionId);
                expect(connectionInfo.sseConnection).toBe(mockResponse);
                done();
            }, 30);
        });

        it('should handle SSE connection errors', (done) => {
            mockResponse.statusCode = 404;

            const config = {
                serverId: 'test-server',
                url: 'http://example.com/api',
                sseEndpoint: '/events'
            };

            connectionId = transport.createConnection(config);

            setTimeout(() => {
                const connectionInfo = transport.connections.get(connectionId);
                expect(connectionInfo.sseConnection).toBeNull();
                done();
            }, 30);
        });

        it('should parse SSE data correctly', (done) => {
            const config = {
                serverId: 'test-server',
                url: 'http://example.com/api',
                sseEndpoint: '/events'
            };

            connectionId = transport.createConnection(config);

            // Spy on handleSSEMessage
            const handleSSESpy = jest.spyOn(transport, 'handleSSEMessage');

            setTimeout(() => {
                // Send partial then complete SSE message
                mockResponse.emit('data', 'data: {"type":"not');
                mockResponse.emit('data', 'ification","id":123}\n\n');
                
                expect(handleSSESpy).toHaveBeenCalledWith(connectionId, {
                    type: 'notification',
                    id: 123
                });
                done();
            }, 30);
        });
    });

    describe('closeConnection', () => {
        let connectionId;

        beforeEach(() => {
            transport.initialize();
            connectionId = transport.createConnection({ 
                url: 'http://example.com/api',
                sseEndpoint: '/events'
            });
        });

        it('should close SSE connection if exists', (done) => {
            setTimeout(() => {
                transport.closeConnection(connectionId);

                expect(mockResponse.destroy).toHaveBeenCalled();
                expect(transport.connections.has(connectionId)).toBe(false);
                done();
            }, 30);
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

        it('should clean up SSE request', (done) => {
            setTimeout(() => {
                const sseReq = transport.sseConnections.get(connectionId);
                
                transport.closeConnection(connectionId);
                
                expect(sseReq.destroy).toHaveBeenCalled();
                expect(transport.sseConnections.has(connectionId)).toBe(false);
                done();
            }, 30);
        });
    });

    describe('getStatus', () => {
        let connectionId;

        beforeEach(() => {
            transport.initialize();
            connectionId = transport.createConnection({ url: 'http://example.com/api' });
        });

        it('should return correct status for active connection', () => {
            const status = transport.getStatus(connectionId);

            expect(status).toEqual({
                status: 'connected',
                uptime: expect.any(Number),
                metrics: {
                    messages_sent: 0,
                    sse_connected: false,
                    url: 'http://example.com/api'
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

        it('should show SSE connection status', (done) => {
            const sseConnectionId = transport.createConnection({ 
                url: 'http://example.com/api',
                sseEndpoint: '/events'
            });

            setTimeout(() => {
                const status = transport.getStatus(sseConnectionId);
                expect(status.metrics.sse_connected).toBe(true);
                done();
            }, 30);
        });
    });
});