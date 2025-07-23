const express = require('express');
const HealthMonitorInterface = require('./health-monitor');
const http = require('http');
const { Client } = require('pg');
const redis = require('redis');
const axios = require('axios');

// Graceful shutdown handling
let isShuttingDown = false;
const connections = new Set();

const app = express();
const port = process.env.PORT || 9090;

// Parse service list from environment
const services = (process.env.MONITOR_SERVICES || 'api,worker,redis,postgres')
  .split(',')
  .map(s => s.trim());

// Initialize health monitor
const healthMonitor = new HealthMonitorInterface({
  services,
  checkInterval: 30000,
  timeout: 5000
});

// Register service-specific health checks
async function registerHealthChecks() {
  // API service health check
  await healthMonitor.registerHealthCheck('api', async () => {
    try {
      const response = await axios.get('http://api:3000/health', {
        timeout: 3000
      });
      return {
        healthy: response.status === 200,
        message: `API responding with status ${response.status}`
      };
    } catch (error) {
      return {
        healthy: false,
        message: `API health check failed: ${error.message}`
      };
    }
  });

  // Worker service health check
  await healthMonitor.registerHealthCheck('worker', async () => {
    try {
      const response = await axios.get('http://worker:8000/health', {
        timeout: 3000
      });
      return {
        healthy: response.status === 200,
        message: `Worker responding with status ${response.status}`
      };
    } catch (error) {
      return {
        healthy: false,
        message: `Worker health check failed: ${error.message}`
      };
    }
  });

  // Redis health check
  await healthMonitor.registerHealthCheck('redis', async () => {
    return new Promise((resolve) => {
      const client = redis.createClient({
        url: process.env.REDIS_URL || 'redis://redis:6379',
        socket: {
          connectTimeout: 3000
        }
      });

      client.on('error', (err) => {
        resolve({
          healthy: false,
          message: `Redis connection error: ${err.message}`
        });
      });

      client.connect().then(() => {
        return client.ping();
      }).then(() => {
        resolve({
          healthy: true,
          message: 'Redis PONG received'
        });
        client.quit();
      }).catch((err) => {
        resolve({
          healthy: false,
          message: `Redis ping failed: ${err.message}`
        });
      });
    });
  });

  // PostgreSQL health check
  await healthMonitor.registerHealthCheck('postgres', async () => {
    const client = new Client({
      connectionString: process.env.DATABASE_URL || 
        `postgresql://${process.env.POSTGRES_USER || 'mcp'}:${process.env.POSTGRES_PASSWORD}@postgres:5432/${process.env.POSTGRES_DB || 'mcp'}`,
      connectionTimeoutMillis: 3000
    });

    try {
      await client.connect();
      const result = await client.query('SELECT 1');
      await client.end();
      return {
        healthy: true,
        message: 'PostgreSQL connection successful'
      };
    } catch (error) {
      return {
        healthy: false,
        message: `PostgreSQL health check failed: ${error.message}`
      };
    }
  });

  // Mark services as initialized
  services.forEach(service => {
    healthMonitor.markInitialized(service);
  });
}

// Middleware to track connections for graceful shutdown
app.use((req, res, next) => {
  connections.add(res);
  res.on('finish', () => {
    connections.delete(res);
  });
  next();
});

// Health check middleware - reject requests during shutdown
app.use((req, res, next) => {
  if (isShuttingDown) {
    res.status(503).json({
      error: 'Service is shutting down'
    });
    return;
  }
  next();
});

// Mount health endpoints
app.use(healthMonitor.createHealthEndpoint({
  path: '/health',
  detailed: true,
  auth: false
}));

// Mount metrics endpoints
app.use(healthMonitor.createMetricsEndpoint({
  path: '/metrics',
  format: process.env.METRICS_FORMAT || 'json'
}));

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'MCP Health Monitor',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      healthDetailed: '/health',
      liveness: '/health/live',
      readiness: '/health/ready',
      startup: '/health/startup',
      metrics: '/metrics'
    }
  });
});

// Start server
const server = http.createServer(app);

server.listen(port, async () => {
  console.log(`Health monitor server listening on port ${port}`);
  
  // Register health checks after server starts
  try {
    await registerHealthChecks();
    console.log('Health checks registered successfully');
  } catch (error) {
    console.error('Failed to register health checks:', error);
  }
});

// Graceful shutdown handling
const gracefulShutdown = (signal) => {
  console.log(`Received ${signal}, starting graceful shutdown...`);
  isShuttingDown = true;

  // Stop accepting new connections
  server.close((err) => {
    if (err) {
      console.error('Error during server close:', err);
      process.exit(1);
    }
    console.log('Server closed to new connections');
  });

  // Close existing connections
  connections.forEach((connection) => {
    connection.end();
  });

  // Give connections time to close
  setTimeout(() => {
    console.log('Forcing shutdown after timeout');
    process.exit(0);
  }, 10000);
};

// Handle termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

module.exports = server;