// Mock Data Generator for Dashboard Testing
// Provides realistic mock data when API is not available

const mockData = {
    // Mock servers data
    servers: [
        {
            id: 'filesystem-01',
            name: 'Filesystem Server',
            transport: 'stdio',
            status: 'running',
            connectionId: 'conn-fs-123456',
            uptime: 3600,
            config: {
                command: 'mcp-server-filesystem',
                args: ['--path', '/home/user/data'],
                env: { LOG_LEVEL: 'info' }
            },
            metrics: {
                requests: 1543,
                avgResponseTime: 23,
                successRate: 99.8
            },
            capabilities: ['read', 'write', 'list', 'search']
        },
        {
            id: 'git-01',
            name: 'Git Operations Server',
            transport: 'stdio',
            status: 'running',
            connectionId: 'conn-git-789012',
            uptime: 7200,
            config: {
                command: 'mcp-server-git',
                args: ['--repo', '/home/user/project'],
                env: { GIT_AUTHOR: 'MCP User' }
            },
            metrics: {
                requests: 892,
                avgResponseTime: 145,
                successRate: 98.5
            },
            capabilities: ['commit', 'push', 'pull', 'branch', 'merge']
        },
        {
            id: 'brave-search-01',
            name: 'Brave Search API',
            transport: 'http',
            status: 'running',
            connectionId: 'conn-brave-345678',
            uptime: 14400,
            config: {
                url: 'http://localhost:8081/brave-search',
                headers: { 'API-Key': '***' }
            },
            metrics: {
                requests: 567,
                avgResponseTime: 324,
                successRate: 99.9
            },
            capabilities: ['search', 'news', 'images']
        },
        {
            id: 'slack-01',
            name: 'Slack Integration',
            transport: 'http',
            status: 'stopped',
            config: {
                url: 'http://localhost:8082/slack',
                headers: { 'Authorization': 'Bearer ***' }
            },
            metrics: {
                requests: 0,
                avgResponseTime: 0,
                successRate: 0
            },
            capabilities: ['send_message', 'read_channel', 'list_users']
        },
        {
            id: 'puppeteer-01',
            name: 'Puppeteer Browser',
            transport: 'websocket',
            status: 'running',
            connectionId: 'conn-pup-901234',
            uptime: 1800,
            config: {
                url: 'ws://localhost:8083/puppeteer',
                options: { headless: true }
            },
            metrics: {
                requests: 234,
                avgResponseTime: 567,
                successRate: 97.2
            },
            capabilities: ['navigate', 'screenshot', 'pdf', 'evaluate']
        },
        {
            id: 'postgres-01',
            name: 'PostgreSQL Database',
            transport: 'websocket',
            status: 'error',
            error: 'Connection timeout',
            config: {
                url: 'ws://localhost:8084/postgres',
                database: 'mcp_data'
            },
            metrics: {
                requests: 0,
                avgResponseTime: 0,
                successRate: 0
            },
            capabilities: ['query', 'insert', 'update', 'delete']
        }
    ],

    // Mock metrics data
    metrics: {
        requests_total: 3426,
        requests_per_second: 5.7,
        requests_per_transport: {
            stdio: 2435,
            http: 567,
            websocket: 424
        },
        active_connections: 4,
        uptime: 86400,
        avg_response_times: {
            stdio: 84,
            http: 324,
            websocket: 567
        },
        success_rate: 98.9,
        totalRequests: 145678,
        avgResponseTime: 125,
        successRate: 98.9,
        uptime: 99.95,
        requests: generateTimeSeriesData(20, 50, 150),
        errors: generateTimeSeriesData(20, 0, 5),
        responseTimes: generateResponseTimes(1000),
        transportMetrics: {
            stdio: {
                totalRequests: 89234,
                successRate: 99.2,
                avgResponse: 84,
                activeConnections: 2,
                throughput: 850,
                uptime: 99.98,
                requests: 85,
                timeline: generateTimeSeriesData(20, 40, 100)
            },
            http: {
                totalRequests: 34567,
                successRate: 98.5,
                avgResponse: 324,
                activeConnections: 1,
                throughput: 450,
                uptime: 99.5,
                requests: 65,
                timeline: generateTimeSeriesData(20, 20, 60)
            },
            websocket: {
                totalRequests: 21877,
                successRate: 97.8,
                avgResponse: 567,
                activeConnections: 1,
                throughput: 250,
                uptime: 98.9,
                requests: 45,
                timeline: generateTimeSeriesData(20, 10, 40)
            }
        },
        serverMetrics: [
            {
                name: 'Filesystem Server',
                transport: 'stdio',
                requests: 45678,
                successRate: 99.2,
                avgResponse: 23,
                p95Response: 45,
                p99Response: 89,
                status: 'running'
            },
            {
                name: 'Git Operations Server',
                transport: 'stdio',
                requests: 23456,
                successRate: 98.5,
                avgResponse: 145,
                p95Response: 234,
                p99Response: 456,
                status: 'running'
            },
            {
                name: 'Brave Search API',
                transport: 'http',
                requests: 12345,
                successRate: 99.9,
                avgResponse: 324,
                p95Response: 456,
                p99Response: 678,
                status: 'running'
            },
            {
                name: 'Puppeteer Browser',
                transport: 'websocket',
                requests: 5678,
                successRate: 97.2,
                avgResponse: 567,
                p95Response: 890,
                p99Response: 1234,
                status: 'running'
            }
        ],
        errorBreakdown: {
            timeout: 45,
            connection: 23,
            serverError: 12,
            clientError: 8,
            other: 5
        },
        recentErrors: [
            {
                timestamp: Date.now() - 60000,
                message: 'Connection timeout to PostgreSQL server',
                server: 'postgres-01',
                transport: 'websocket'
            },
            {
                timestamp: Date.now() - 120000,
                message: 'Rate limit exceeded',
                server: 'brave-search-01',
                transport: 'http'
            },
            {
                timestamp: Date.now() - 180000,
                message: 'Git repository not found',
                server: 'git-01',
                transport: 'stdio'
            }
        ]
    },

    // Mock health data
    health: {
        status: 'healthy',
        services: {
            total: 6,
            healthy: 4,
            degraded: 1,
            unhealthy: 1
        }
    },

    // Mock services health
    servicesHealth: {
        'filesystem-01': {
            status: 'healthy',
            responseTime: 23,
            lastCheck: Date.now(),
            details: {
                checks: {
                    connectivity: 'healthy',
                    performance: 'healthy',
                    resources: 'healthy'
                }
            }
        },
        'git-01': {
            status: 'healthy',
            responseTime: 145,
            lastCheck: Date.now(),
            details: {
                checks: {
                    connectivity: 'healthy',
                    performance: 'healthy',
                    resources: 'healthy'
                }
            }
        },
        'brave-search-01': {
            status: 'degraded',
            responseTime: 324,
            lastCheck: Date.now(),
            message: 'High response times detected',
            details: {
                checks: {
                    connectivity: 'healthy',
                    performance: 'degraded',
                    resources: 'healthy'
                }
            }
        },
        'slack-01': {
            status: 'unknown',
            lastCheck: Date.now(),
            message: 'Service is stopped'
        },
        'puppeteer-01': {
            status: 'healthy',
            responseTime: 567,
            lastCheck: Date.now(),
            details: {
                checks: {
                    connectivity: 'healthy',
                    performance: 'healthy',
                    resources: 'healthy'
                }
            }
        },
        'postgres-01': {
            status: 'unhealthy',
            lastCheck: Date.now(),
            message: 'Connection timeout',
            details: {
                checks: {
                    connectivity: 'unhealthy',
                    performance: 'unknown',
                    resources: 'unknown'
                }
            }
        }
    }
};

// Helper function to generate time series data
function generateTimeSeriesData(points, min, max) {
    const data = [];
    const now = Date.now();
    for (let i = points - 1; i >= 0; i--) {
        data.push({
            timestamp: now - (i * 60000), // 1 minute intervals
            count: Math.floor(Math.random() * (max - min + 1)) + min,
            requests: Math.floor(Math.random() * (max - min + 1)) + min
        });
    }
    return data;
}

// Helper function to generate response times
function generateResponseTimes(count) {
    const times = [];
    for (let i = 0; i < count; i++) {
        // Generate realistic response time distribution
        const rand = Math.random();
        let time;
        if (rand < 0.6) time = Math.random() * 50; // 60% under 50ms
        else if (rand < 0.8) time = 50 + Math.random() * 50; // 20% 50-100ms
        else if (rand < 0.9) time = 100 + Math.random() * 100; // 10% 100-200ms
        else if (rand < 0.95) time = 200 + Math.random() * 300; // 5% 200-500ms
        else time = 500 + Math.random() * 500; // 5% over 500ms
        times.push(Math.floor(time));
    }
    return times;
}

// Mock API interceptor
function setupMockAPI() {
    // Store original fetch
    const originalFetch = window.fetch;
    
    // Override fetch for mock responses
    window.fetch = async (url, options) => {
        // Parse URL
        const urlObj = new URL(url, window.location.origin);
        const path = urlObj.pathname;
        
        // Mock API responses
        if (path === '/api/gateway/servers') {
            return mockResponse(mockData.servers);
        } else if (path.startsWith('/api/gateway/servers/') && path.endsWith('/start')) {
            const serverId = path.split('/')[4];
            const server = mockData.servers.find(s => s.id === serverId);
            if (server) {
                server.status = 'running';
                server.connectionId = `conn-${Date.now()}`;
                return mockResponse({ success: true, connectionId: server.connectionId });
            }
            return mockResponse({ success: false, message: 'Server not found' }, 404);
        } else if (path.startsWith('/api/gateway/servers/') && path.endsWith('/stop')) {
            const serverId = path.split('/')[4];
            const server = mockData.servers.find(s => s.id === serverId);
            if (server) {
                server.status = 'stopped';
                server.connectionId = null;
                return mockResponse({ success: true });
            }
            return mockResponse({ success: false, message: 'Server not found' }, 404);
        } else if (path.startsWith('/api/gateway/servers/')) {
            const serverId = path.split('/')[4];
            const server = mockData.servers.find(s => s.id === serverId);
            if (server) {
                return mockResponse(server);
            }
            return mockResponse({ error: 'Server not found' }, 404);
        } else if (path === '/api/gateway/metrics') {
            return mockResponse(mockData.metrics);
        } else if (path === '/health') {
            return mockResponse(mockData.health);
        } else if (path === '/health/services') {
            return mockResponse(mockData.servicesHealth);
        }
        
        // Fall back to original fetch for non-mocked URLs
        return originalFetch(url, options);
    };
    
    console.log('Mock API enabled. Using mock data for testing.');
}

// Helper to create mock response
function mockResponse(data, status = 200) {
    return Promise.resolve({
        ok: status >= 200 && status < 300,
        status: status,
        json: () => Promise.resolve(data),
        text: () => Promise.resolve(JSON.stringify(data)),
        blob: () => Promise.resolve(new Blob([JSON.stringify(data)], { type: 'application/json' }))
    });
}

// WebSocket mock
function mockWebSocket() {
    const originalWebSocket = window.WebSocket;
    
    window.WebSocket = function(url) {
        const ws = {
            url: url,
            readyState: 0,
            CONNECTING: 0,
            OPEN: 1,
            CLOSING: 2,
            CLOSED: 3,
            
            send: function(data) {
                console.log('Mock WebSocket send:', data);
            },
            
            close: function() {
                this.readyState = 3;
                if (this.onclose) this.onclose();
            }
        };
        
        // Simulate connection
        setTimeout(() => {
            ws.readyState = 1;
            if (ws.onopen) ws.onopen();
            
            // Send periodic updates
            setInterval(() => {
                if (ws.readyState === 1 && ws.onmessage) {
                    // Random server status update
                    const server = mockData.servers[Math.floor(Math.random() * mockData.servers.length)];
                    ws.onmessage({
                        data: JSON.stringify({
                            type: 'server_status',
                            serverId: server.id,
                            status: server.status
                        })
                    });
                    
                    // Metrics update
                    ws.onmessage({
                        data: JSON.stringify({
                            type: 'metrics_update',
                            metrics: {
                                requests_per_second: Math.random() * 10 + 5,
                                active_connections: Math.floor(Math.random() * 5) + 1
                            }
                        })
                    });
                }
            }, 5000);
        }, 100);
        
        return ws;
    };
}

// Enable mocking if running locally without backend
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    setupMockAPI();
    mockWebSocket();
}