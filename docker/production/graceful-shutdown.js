#!/usr/bin/env node

/**
 * Graceful shutdown handler for Node.js applications
 * Ensures proper cleanup of resources before container termination
 */

class GracefulShutdown {
  constructor(options = {}) {
    this.shutdownTimeout = options.shutdownTimeout || 30000; // 30 seconds
    this.server = options.server;
    this.cleanup = options.cleanup || [];
    this.logger = options.logger || console;
    this.isShuttingDown = false;
    this.connections = new Set();
    
    this.setupHandlers();
  }

  setupHandlers() {
    // Handle termination signals
    process.on('SIGTERM', () => this.shutdown('SIGTERM'));
    process.on('SIGINT', () => this.shutdown('SIGINT'));
    
    // Handle process errors
    process.on('uncaughtException', (error) => {
      this.logger.error('Uncaught exception:', error);
      this.shutdown('uncaughtException', 1);
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error('Unhandled rejection at:', promise, 'reason:', reason);
      this.shutdown('unhandledRejection', 1);
    });
  }

  async shutdown(signal, exitCode = 0) {
    if (this.isShuttingDown) {
      this.logger.warn('Shutdown already in progress');
      return;
    }
    
    this.isShuttingDown = true;
    this.logger.info(`Received ${signal}, starting graceful shutdown...`);
    
    // Set a timeout for forced shutdown
    const forceShutdownTimer = setTimeout(() => {
      this.logger.error('Forced shutdown due to timeout');
      process.exit(1);
    }, this.shutdownTimeout);
    
    try {
      // Step 1: Stop accepting new connections
      if (this.server) {
        await this.closeServer();
      }
      
      // Step 2: Close existing connections
      await this.closeConnections();
      
      // Step 3: Run custom cleanup functions
      await this.runCleanup();
      
      // Step 4: Clear timeout and exit
      clearTimeout(forceShutdownTimer);
      this.logger.info('Graceful shutdown complete');
      process.exit(exitCode);
      
    } catch (error) {
      this.logger.error('Error during shutdown:', error);
      clearTimeout(forceShutdownTimer);
      process.exit(1);
    }
  }

  closeServer() {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }
      
      this.logger.info('Closing server to new connections...');
      
      this.server.close((err) => {
        if (err) {
          this.logger.error('Error closing server:', err);
          reject(err);
        } else {
          this.logger.info('Server closed to new connections');
          resolve();
        }
      });
    });
  }

  closeConnections() {
    return new Promise((resolve) => {
      const connectionCount = this.connections.size;
      
      if (connectionCount === 0) {
        this.logger.info('No active connections to close');
        resolve();
        return;
      }
      
      this.logger.info(`Closing ${connectionCount} active connections...`);
      
      // Set connection close timeout
      const closeTimeout = setTimeout(() => {
        this.logger.warn('Connection close timeout reached, forcing closure');
        this.connections.forEach(connection => {
          if (connection.destroy) {
            connection.destroy();
          }
        });
        resolve();
      }, 10000); // 10 seconds for connections to close
      
      let closed = 0;
      this.connections.forEach(connection => {
        connection.end(() => {
          closed++;
          if (closed === connectionCount) {
            clearTimeout(closeTimeout);
            this.logger.info('All connections closed');
            resolve();
          }
        });
      });
    });
  }

  async runCleanup() {
    this.logger.info('Running cleanup tasks...');
    
    for (const cleanupFn of this.cleanup) {
      try {
        await cleanupFn();
      } catch (error) {
        this.logger.error('Cleanup function error:', error);
      }
    }
    
    this.logger.info('Cleanup tasks completed');
  }

  trackConnection(connection) {
    this.connections.add(connection);
    
    connection.on('close', () => {
      this.connections.delete(connection);
    });
  }

  // Middleware for Express apps
  middleware() {
    return (req, res, next) => {
      if (this.isShuttingDown) {
        res.status(503).set('Connection', 'close').json({
          error: 'Service is shutting down'
        });
        return;
      }
      
      this.trackConnection(res);
      next();
    };
  }
}

// Usage example
if (require.main === module) {
  const express = require('express');
  const app = express();
  const server = app.listen(3000);
  
  const shutdown = new GracefulShutdown({
    server,
    cleanup: [
      async () => {
        console.log('Closing database connections...');
        // Add database cleanup
      },
      async () => {
        console.log('Flushing logs...');
        // Add log flushing
      },
      async () => {
        console.log('Clearing caches...');
        // Add cache cleanup
      }
    ]
  });
  
  // Use shutdown middleware
  app.use(shutdown.middleware());
  
  console.log('Server running with graceful shutdown enabled');
}

module.exports = GracefulShutdown;