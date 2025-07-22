const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const MCPServiceInterface = require('../../interfaces/mcp-service.interface');
const { createHealthStatus, HealthStatusEnum } = require('../../interfaces/health-status.interface');

class EchoMCPService extends MCPServiceInterface {
    constructor(config) {
        super(config);
        this.app = express();
        this.startTime = Date.now();
        this.setupMiddleware();
        this.setupRoutes();
    }

    setupMiddleware() {
        this.app.use(cors());
        this.app.use(express.json());
        this.app.use(express.text());
        this.app.use(morgan('combined'));
    }

    setupRoutes() {
        // Health endpoint
        this.app.get('/health', async (req, res) => {
            const health = await this.health();
            res.status(health.status === HealthStatusEnum.HEALTHY ? 200 : 503).json(health);
        });

        // Echo endpoints
        this.app.post('/echo', (req, res) => {
            const contentType = req.get('content-type');
            
            // Log the echo request
            console.log(`Echo request received: ${JSON.stringify(req.body)}`);
            
            // Return the exact same data
            if (contentType && contentType.includes('text/plain')) {
                res.type('text/plain').send(req.body);
            } else {
                res.json({
                    echo: req.body,
                    timestamp: new Date().toISOString(),
                    headers: req.headers
                });
            }
        });

        // Echo with delay
        this.app.post('/echo/delay/:ms', async (req, res) => {
            const delay = parseInt(req.params.ms) || 0;
            
            // Limit delay to 10 seconds
            const actualDelay = Math.min(delay, 10000);
            
            await new Promise(resolve => setTimeout(resolve, actualDelay));
            
            res.json({
                echo: req.body,
                timestamp: new Date().toISOString(),
                delay: actualDelay
            });
        });

        // Echo with transformation
        this.app.post('/echo/transform/:type', (req, res) => {
            const transformType = req.params.type;
            let transformed = req.body;
            
            try {
                switch (transformType) {
                    case 'uppercase':
                        transformed = typeof req.body === 'string' 
                            ? req.body.toUpperCase() 
                            : JSON.stringify(req.body).toUpperCase();
                        break;
                    case 'lowercase':
                        transformed = typeof req.body === 'string' 
                            ? req.body.toLowerCase() 
                            : JSON.stringify(req.body).toLowerCase();
                        break;
                    case 'reverse':
                        transformed = typeof req.body === 'string' 
                            ? req.body.split('').reverse().join('') 
                            : JSON.stringify(req.body).split('').reverse().join('');
                        break;
                    case 'base64':
                        transformed = Buffer.from(
                            typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
                        ).toString('base64');
                        break;
                    default:
                        return res.status(400).json({ 
                            error: 'Invalid transform type. Use: uppercase, lowercase, reverse, or base64' 
                        });
                }
                
                res.json({
                    original: req.body,
                    transformed,
                    transformType,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                res.status(500).json({ 
                    error: 'Transform failed', 
                    message: error.message 
                });
            }
        });

        // Service info
        this.app.get('/', (req, res) => {
            res.json(this.getManifest());
        });

        // 404 handler
        this.app.use((req, res) => {
            res.status(404).json({ 
                error: 'Endpoint not found', 
                availableEndpoints: this.getEndpoints() 
            });
        });

        // Error handler
        this.app.use((err, req, res, next) => {
            console.error('Server error:', err);
            res.status(500).json({ 
                error: 'Internal server error', 
                message: err.message 
            });
        });
    }

    async start() {
        return new Promise((resolve, reject) => {
            this.server = this.app.listen(this.port, () => {
                console.log(`Echo MCP Service v${this.version} listening on port ${this.port}`);
                resolve();
            });
            this.server.on('error', reject);
        });
    }

    async stop() {
        return new Promise((resolve) => {
            if (this.server) {
                this.server.close(() => {
                    console.log('Echo MCP Service stopped');
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }

    async health() {
        const uptime = Math.floor((Date.now() - this.startTime) / 1000);
        const checks = {
            service: 'healthy',
            memory: process.memoryUsage().heapUsed < 500 * 1024 * 1024 ? 'healthy' : 'unhealthy'
        };
        
        const issues = [];
        if (checks.memory === 'unhealthy') {
            issues.push('High memory usage');
        }
        
        return createHealthStatus(
            this.name,
            this.version,
            uptime,
            issues.length === 0 ? HealthStatusEnum.HEALTHY : HealthStatusEnum.DEGRADED,
            checks,
            issues
        );
    }

    getEndpoints() {
        return {
            '/': 'Service manifest',
            '/health': 'Health check endpoint',
            '/echo': 'Echo POST data back',
            '/echo/delay/:ms': 'Echo with delay (max 10s)',
            '/echo/transform/:type': 'Echo with transformation (uppercase, lowercase, reverse, base64)'
        };
    }

    getCapabilities() {
        return ['echo', 'transform', 'delay'];
    }

    getRequirements() {
        return {
            env: [],
            dependencies: ['express', 'cors', 'morgan']
        };
    }
}

// Start the service
if (require.main === module) {
    const config = {
        name: 'echo-mcp',
        version: '1.0.0',
        port: process.env.PORT || 3010,
        env: process.env
    };

    const service = new EchoMCPService(config);
    
    service.start().catch(err => {
        console.error('Failed to start service:', err);
        process.exit(1);
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
        console.log('SIGTERM received, shutting down gracefully...');
        await service.stop();
        process.exit(0);
    });

    process.on('SIGINT', async () => {
        console.log('SIGINT received, shutting down gracefully...');
        await service.stop();
        process.exit(0);
    });
}

module.exports = EchoMCPService;