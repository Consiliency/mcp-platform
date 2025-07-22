/**
 * Example: Integrating Security with MCP Services
 * This demonstrates how to use the security module in a real MCP service
 */

const express = require('express');
const SecurityImplementation = require('../index');
const AuthMiddleware = require('../auth/middleware');

async function createSecureService() {
    const app = express();
    app.use(express.json());

    // Initialize security
    const security = new SecurityImplementation();
    await security.initialize();

    // Create middleware instances
    const authMiddleware = new AuthMiddleware(security);
    const networkManager = security.networkManager;

    // Apply global middleware
    app.use(networkManager.getCORSMiddleware());
    app.use(networkManager.getRateLimitMiddleware());

    // Public endpoints
    app.post('/auth/login', async (req, res) => {
        try {
            const { username, password } = req.body;
            const token = await security.authenticate({ username, password });
            res.json(token);
        } catch (error) {
            res.status(401).json({ error: error.message });
        }
    });

    app.post('/auth/api-key', authMiddleware.requirePermission('admin', 'create'), async (req, res) => {
        try {
            const { name, permissions } = req.body;
            const apiKey = await security.generateApiKey(name, permissions);
            res.json(apiKey);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    });

    // Protected service endpoints
    app.get('/api/services', authMiddleware.requireAuth(), async (req, res) => {
        // List available services
        res.json({
            services: [
                { id: 'filesystem', name: 'File System Service' },
                { id: 'database', name: 'Database Service' }
            ]
        });
    });

    app.get('/api/services/:id', authMiddleware.requirePermission('services', 'read'), async (req, res) => {
        // Get service details
        res.json({
            id: req.params.id,
            status: 'running',
            permissions: req.authToken ? 'Authenticated' : 'API Key'
        });
    });

    // Service-to-service communication
    app.post('/internal/communicate', authMiddleware.serviceAuth(), async (req, res) => {
        const { source, target, data } = req.body;
        
        // Check if communication is allowed
        const allowed = await security.networkManager.serviceIsolation.isAllowed(source, target);
        
        if (!allowed) {
            return res.status(403).json({ error: 'Service communication not allowed' });
        }

        // Process inter-service communication
        res.json({ status: 'Message delivered', source, target });
    });

    // Certificate management endpoints
    app.post('/admin/certificates', authMiddleware.requirePermission('admin', 'manage'), async (req, res) => {
        try {
            const { domain, type } = req.body;
            const cert = await security.generateCertificate({ domain, type });
            res.json({
                message: 'Certificate generated',
                certPath: cert.certPath,
                expiresAt: cert.expiresAt
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    app.get('/admin/certificates', authMiddleware.requirePermission('admin', 'read'), async (req, res) => {
        const certificates = await security.tlsManager.listCertificates();
        res.json(certificates);
    });

    // Health check (no auth required)
    app.get('/health', async (req, res) => {
        res.json({
            status: 'healthy',
            security: 'enabled',
            timestamp: new Date()
        });
    });

    return { app, security };
}

// Example usage
if (require.main === module) {
    (async () => {
        const { app, security } = await createSecureService();
        
        const PORT = process.env.PORT || 3000;
        const server = app.listen(PORT, () => {
            console.log(`Secure MCP service running on port ${PORT}`);
        });

        // Graceful shutdown
        process.on('SIGTERM', async () => {
            console.log('SIGTERM received, shutting down gracefully');
            server.close(() => {
                security.cleanup().then(() => {
                    console.log('Security cleanup complete');
                    process.exit(0);
                });
            });
        });
    })();
}

module.exports = createSecureService;