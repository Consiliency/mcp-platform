const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { Pool } = require('pg');
const Joi = require('joi');
const { v4: uuidv4 } = require('uuid');
const MCPServiceInterface = require('../../interfaces/mcp-service.interface');
const { createHealthStatus, HealthStatusEnum, calculateOverallHealth } = require('../../interfaces/health-status.interface');

// Validation schemas
const todoSchema = Joi.object({
    title: Joi.string().min(1).max(255).required(),
    description: Joi.string().max(1000).optional(),
    due_date: Joi.date().iso().optional(),
    priority: Joi.string().valid('low', 'medium', 'high').default('medium'),
    tags: Joi.array().items(Joi.string()).default([])
});

const updateTodoSchema = Joi.object({
    title: Joi.string().min(1).max(255).optional(),
    description: Joi.string().max(1000).optional(),
    completed: Joi.boolean().optional(),
    due_date: Joi.date().iso().optional(),
    priority: Joi.string().valid('low', 'medium', 'high').optional(),
    tags: Joi.array().items(Joi.string()).optional()
});

class TodoMCPService extends MCPServiceInterface {
    constructor(config) {
        super(config);
        this.app = express();
        this.startTime = Date.now();
        this.pool = null;
        this.setupMiddleware();
        this.setupDatabase();
        this.setupRoutes();
    }

    setupMiddleware() {
        this.app.use(cors());
        this.app.use(express.json());
        this.app.use(morgan('combined'));
    }

    setupDatabase() {
        this.pool = new Pool({
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT || 5432,
            database: process.env.DB_NAME || 'todos',
            user: process.env.DB_USER || 'todouser',
            password: process.env.DB_PASSWORD || 'todopass',
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
        });

        this.pool.on('error', (err) => {
            console.error('Unexpected database error:', err);
        });
    }

    async initializeDatabase() {
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS todos (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                title VARCHAR(255) NOT NULL,
                description TEXT,
                completed BOOLEAN DEFAULT FALSE,
                priority VARCHAR(10) DEFAULT 'medium',
                tags TEXT[] DEFAULT '{}',
                due_date TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_todos_completed ON todos(completed);
            CREATE INDEX IF NOT EXISTS idx_todos_priority ON todos(priority);
            CREATE INDEX IF NOT EXISTS idx_todos_due_date ON todos(due_date);
        `;

        try {
            await this.pool.query(createTableQuery);
            console.log('Database tables initialized');
        } catch (error) {
            console.error('Failed to initialize database:', error);
            throw error;
        }
    }

    setupRoutes() {
        // Health endpoint
        this.app.get('/health', async (req, res) => {
            const health = await this.health();
            res.status(health.status === HealthStatusEnum.HEALTHY ? 200 : 503).json(health);
        });

        // Service info
        this.app.get('/', (req, res) => {
            res.json(this.getManifest());
        });

        // Get all todos with filtering
        this.app.get('/todos', async (req, res) => {
            try {
                const { completed, priority, tag, sort = 'created_at', order = 'desc' } = req.query;
                
                let query = 'SELECT * FROM todos WHERE 1=1';
                const params = [];
                let paramCount = 0;

                if (completed !== undefined) {
                    params.push(completed === 'true');
                    query += ` AND completed = $${++paramCount}`;
                }

                if (priority) {
                    params.push(priority);
                    query += ` AND priority = $${++paramCount}`;
                }

                if (tag) {
                    params.push(tag);
                    query += ` AND $${++paramCount} = ANY(tags)`;
                }

                // Validate sort field
                const validSortFields = ['created_at', 'updated_at', 'due_date', 'priority', 'title'];
                const sortField = validSortFields.includes(sort) ? sort : 'created_at';
                const sortOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
                
                query += ` ORDER BY ${sortField} ${sortOrder}`;

                const result = await this.pool.query(query, params);
                res.json({
                    todos: result.rows,
                    count: result.rowCount
                });
            } catch (error) {
                console.error('Error fetching todos:', error);
                res.status(500).json({ error: 'Failed to fetch todos' });
            }
        });

        // Get single todo
        this.app.get('/todos/:id', async (req, res) => {
            try {
                const { id } = req.params;
                const result = await this.pool.query('SELECT * FROM todos WHERE id = $1', [id]);
                
                if (result.rows.length === 0) {
                    return res.status(404).json({ error: 'Todo not found' });
                }
                
                res.json(result.rows[0]);
            } catch (error) {
                console.error('Error fetching todo:', error);
                res.status(500).json({ error: 'Failed to fetch todo' });
            }
        });

        // Create todo
        this.app.post('/todos', async (req, res) => {
            try {
                const { error, value } = todoSchema.validate(req.body);
                if (error) {
                    return res.status(400).json({ error: error.details[0].message });
                }

                const { title, description, due_date, priority, tags } = value;
                const id = uuidv4();

                const query = `
                    INSERT INTO todos (id, title, description, due_date, priority, tags)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    RETURNING *
                `;

                const result = await this.pool.query(query, [
                    id, title, description, due_date, priority, tags
                ]);

                res.status(201).json(result.rows[0]);
            } catch (error) {
                console.error('Error creating todo:', error);
                res.status(500).json({ error: 'Failed to create todo' });
            }
        });

        // Update todo
        this.app.patch('/todos/:id', async (req, res) => {
            try {
                const { id } = req.params;
                const { error, value } = updateTodoSchema.validate(req.body);
                if (error) {
                    return res.status(400).json({ error: error.details[0].message });
                }

                // Build dynamic update query
                const updates = [];
                const params = [];
                let paramCount = 0;

                Object.entries(value).forEach(([key, val]) => {
                    params.push(val);
                    updates.push(`${key} = $${++paramCount}`);
                });

                if (updates.length === 0) {
                    return res.status(400).json({ error: 'No updates provided' });
                }

                params.push(id);
                const query = `
                    UPDATE todos 
                    SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
                    WHERE id = $${++paramCount}
                    RETURNING *
                `;

                const result = await this.pool.query(query, params);
                
                if (result.rows.length === 0) {
                    return res.status(404).json({ error: 'Todo not found' });
                }

                res.json(result.rows[0]);
            } catch (error) {
                console.error('Error updating todo:', error);
                res.status(500).json({ error: 'Failed to update todo' });
            }
        });

        // Delete todo
        this.app.delete('/todos/:id', async (req, res) => {
            try {
                const { id } = req.params;
                const result = await this.pool.query(
                    'DELETE FROM todos WHERE id = $1 RETURNING id',
                    [id]
                );

                if (result.rows.length === 0) {
                    return res.status(404).json({ error: 'Todo not found' });
                }

                res.status(204).send();
            } catch (error) {
                console.error('Error deleting todo:', error);
                res.status(500).json({ error: 'Failed to delete todo' });
            }
        });

        // Bulk operations
        this.app.post('/todos/bulk/complete', async (req, res) => {
            try {
                const { ids } = req.body;
                if (!Array.isArray(ids) || ids.length === 0) {
                    return res.status(400).json({ error: 'Invalid or empty ids array' });
                }

                const query = `
                    UPDATE todos 
                    SET completed = TRUE, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ANY($1::uuid[])
                    RETURNING id
                `;

                const result = await this.pool.query(query, [ids]);
                res.json({
                    updated: result.rowCount,
                    ids: result.rows.map(r => r.id)
                });
            } catch (error) {
                console.error('Error completing todos:', error);
                res.status(500).json({ error: 'Failed to complete todos' });
            }
        });

        // Statistics endpoint
        this.app.get('/todos/stats', async (req, res) => {
            try {
                const query = `
                    SELECT 
                        COUNT(*) as total,
                        COUNT(*) FILTER (WHERE completed = true) as completed,
                        COUNT(*) FILTER (WHERE completed = false) as pending,
                        COUNT(*) FILTER (WHERE priority = 'high') as high_priority,
                        COUNT(*) FILTER (WHERE priority = 'medium') as medium_priority,
                        COUNT(*) FILTER (WHERE priority = 'low') as low_priority,
                        COUNT(*) FILTER (WHERE due_date < CURRENT_TIMESTAMP AND completed = false) as overdue
                    FROM todos
                `;

                const result = await this.pool.query(query);
                res.json(result.rows[0]);
            } catch (error) {
                console.error('Error fetching stats:', error);
                res.status(500).json({ error: 'Failed to fetch statistics' });
            }
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
        try {
            // Initialize database tables
            await this.initializeDatabase();
            
            // Start Express server
            return new Promise((resolve, reject) => {
                this.server = this.app.listen(this.port, () => {
                    console.log(`Todo MCP Service v${this.version} listening on port ${this.port}`);
                    resolve();
                });
                this.server.on('error', reject);
            });
        } catch (error) {
            console.error('Failed to start service:', error);
            throw error;
        }
    }

    async stop() {
        const promises = [];
        
        // Close Express server
        if (this.server) {
            promises.push(new Promise((resolve) => {
                this.server.close(() => {
                    console.log('Express server stopped');
                    resolve();
                });
            }));
        }
        
        // Close database pool
        if (this.pool) {
            promises.push(this.pool.end().then(() => {
                console.log('Database pool closed');
            }));
        }
        
        await Promise.all(promises);
        console.log('Todo MCP Service stopped');
    }

    async health() {
        const uptime = Math.floor((Date.now() - this.startTime) / 1000);
        const checks = {
            service: 'healthy',
            database: 'healthy',
            memory: process.memoryUsage().heapUsed < 500 * 1024 * 1024 ? 'healthy' : 'unhealthy'
        };
        
        const issues = [];
        
        // Check database connection
        try {
            await this.pool.query('SELECT 1');
        } catch (error) {
            checks.database = 'unhealthy';
            issues.push('Database connection failed');
        }
        
        if (checks.memory === 'unhealthy') {
            issues.push('High memory usage');
        }
        
        const overallStatus = calculateOverallHealth(checks);
        
        return createHealthStatus(
            this.name,
            this.version,
            uptime,
            overallStatus,
            checks,
            issues
        );
    }

    getEndpoints() {
        return {
            '/': 'Service manifest',
            '/health': 'Health check endpoint',
            'GET /todos': 'List all todos with filtering',
            'GET /todos/:id': 'Get a single todo',
            'POST /todos': 'Create a new todo',
            'PATCH /todos/:id': 'Update a todo',
            'DELETE /todos/:id': 'Delete a todo',
            'POST /todos/bulk/complete': 'Mark multiple todos as complete',
            'GET /todos/stats': 'Get todo statistics'
        };
    }

    getCapabilities() {
        return ['crud', 'filtering', 'bulk-operations', 'statistics', 'persistence'];
    }

    getRequirements() {
        return {
            env: [
                'DB_HOST - PostgreSQL host (default: localhost)',
                'DB_PORT - PostgreSQL port (default: 5432)',
                'DB_NAME - Database name (default: todos)',
                'DB_USER - Database user (default: todouser)',
                'DB_PASSWORD - Database password (default: todopass)'
            ],
            dependencies: ['express', 'pg', 'joi', 'uuid', 'cors', 'morgan']
        };
    }
}

// Start the service
if (require.main === module) {
    const config = {
        name: 'todo-mcp',
        version: '1.0.0',
        port: process.env.PORT || 3011,
        env: process.env
    };

    const service = new TodoMCPService(config);
    
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

module.exports = TodoMCPService;