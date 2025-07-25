#!/usr/bin/env node

/**
 * Migration: Add transport configuration to existing registry entries
 * Version: 002
 * Description: Adds transport type metadata to all services in the registry
 */

const fs = require('fs');
const path = require('path');
const TransportDetector = require('../transport-detector');

class AddTransportMigration {
  constructor() {
    this.name = '002-add-transport';
    this.version = '002';
    this.description = 'Add transport configuration to existing registry entries';
  }

  /**
   * Run the migration
   * @param {string} catalogPath - Path to the catalog file
   * @returns {Object} Migration result
   */
  async run(catalogPath) {
    console.log(`Running migration: ${this.name}`);
    console.log(`Processing catalog: ${catalogPath}`);

    try {
      // Read the catalog
      const catalogData = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
      
      // Backup the original
      const backupPath = catalogPath.replace('.json', `.backup-${Date.now()}.json`);
      fs.writeFileSync(backupPath, JSON.stringify(catalogData, null, 2));
      console.log(`Created backup: ${backupPath}`);

      // Track migration stats
      const stats = {
        total: 0,
        migrated: 0,
        skipped: 0,
        errors: []
      };

      // Process each server
      if (catalogData.servers && Array.isArray(catalogData.servers)) {
        stats.total = catalogData.servers.length;

        catalogData.servers = catalogData.servers.map(server => {
          try {
            // Skip if already has transport configuration
            if (server.transport && server.transport.type) {
              console.log(`  ⏭️  Skipping ${server.id} - already has transport configuration`);
              stats.skipped++;
              return server;
            }

            // Detect transport type
            const detection = TransportDetector.detect(server);
            console.log(`  🔍 Detecting transport for ${server.id}...`);
            console.log(`     Type: ${detection.type} (confidence: ${detection.confidence}%)`);
            console.log(`     Reasoning: ${detection.reasoning.join(', ')}`);

            // Add transport configuration
            server.transport = detection.suggestedConfig;

            // Apply specific adjustments based on known patterns
            this.applyServiceSpecificAdjustments(server);

            console.log(`  ✅ Migrated ${server.id} to ${server.transport.type} transport`);
            stats.migrated++;
            
            return server;
          } catch (error) {
            console.error(`  ❌ Error migrating ${server.id}: ${error.message}`);
            stats.errors.push({ service: server.id, error: error.message });
            return server;
          }
        });
      }

      // Update schema version
      catalogData.schemaVersion = 'transport-enhanced.schema.json';
      catalogData.version = '3.0';
      catalogData.updated = new Date().toISOString().split('T')[0];

      // Add transport profiles if not present
      if (!catalogData.transportProfiles) {
        catalogData.transportProfiles = this.getDefaultTransportProfiles();
      }

      // Write the updated catalog
      fs.writeFileSync(catalogPath, JSON.stringify(catalogData, null, 2));
      console.log(`\n✅ Migration completed successfully!`);
      console.log(`   Total services: ${stats.total}`);
      console.log(`   Migrated: ${stats.migrated}`);
      console.log(`   Skipped: ${stats.skipped}`);
      if (stats.errors.length > 0) {
        console.log(`   Errors: ${stats.errors.length}`);
        stats.errors.forEach(err => {
          console.log(`     - ${err.service}: ${err.error}`);
        });
      }

      return {
        success: true,
        stats,
        backupPath
      };

    } catch (error) {
      console.error(`Migration failed: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Apply service-specific adjustments based on known patterns
   */
  applyServiceSpecificAdjustments(server) {
    // Slack typically uses WebSocket
    if (server.id === 'slack') {
      server.transport = {
        type: 'websocket',
        websocket: {
          url: `ws://localhost:\${port}/mcp`,
          reconnect: true,
          pingInterval: 30000
        },
        autoDetect: false
      };
      if (server.config && server.config.environment) {
        server.config.environment.MCP_MODE = 'websocket';
      }
    }

    // Weather services might use SSE for real-time updates
    if (server.id === 'weather-mcp') {
      server.transport = {
        type: 'sse',
        sse: {
          url: `http://localhost:\${port}/mcp/events`,
          reconnectInterval: 5000
        },
        autoDetect: true
      };
      if (server.config && server.config.environment) {
        server.config.environment.MCP_MODE = 'sse';
      }
    }

    // Echo server is typically stdio for testing
    if (server.id === 'echo-mcp') {
      server.transport = {
        type: 'stdio',
        stdio: {
          command: 'node',
          args: ['server.js'],
          env: {
            MCP_MODE: 'stdio',
            NODE_ENV: 'production'
          }
        },
        autoDetect: true
      };
      if (server.config && server.config.environment) {
        server.config.environment.MCP_MODE = 'stdio';
      }
    }

    // Ensure MCP_MODE matches transport type
    if (server.config && server.config.environment && server.transport) {
      if (!server.config.environment.MCP_MODE) {
        server.config.environment.MCP_MODE = server.transport.type;
      }
    }
  }

  /**
   * Get default transport profiles
   */
  getDefaultTransportProfiles() {
    return {
      stdio: {
        description: 'Standard I/O transport for local process communication',
        defaultConfig: {
          command: 'node',
          args: ['server.js'],
          env: {
            MCP_MODE: 'stdio'
          }
        }
      },
      http: {
        description: 'HTTP-based transport for RESTful communication',
        defaultConfig: {
          url: 'http://localhost:${port}/mcp',
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      },
      websocket: {
        description: 'WebSocket transport for bidirectional streaming',
        defaultConfig: {
          url: 'ws://localhost:${port}/mcp',
          reconnect: true,
          pingInterval: 30000
        }
      },
      sse: {
        description: 'Server-Sent Events transport for server push communication',
        defaultConfig: {
          url: 'http://localhost:${port}/mcp/events',
          reconnectInterval: 5000
        }
      }
    };
  }

  /**
   * Rollback the migration
   * @param {string} catalogPath - Path to the catalog file
   * @param {string} backupPath - Path to the backup file
   */
  async rollback(catalogPath, backupPath) {
    try {
      console.log(`Rolling back migration: ${this.name}`);
      
      if (!fs.existsSync(backupPath)) {
        throw new Error(`Backup file not found: ${backupPath}`);
      }

      // Restore from backup
      const backupData = fs.readFileSync(backupPath, 'utf8');
      fs.writeFileSync(catalogPath, backupData);
      
      console.log(`✅ Rollback completed successfully`);
      return { success: true };
    } catch (error) {
      console.error(`Rollback failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const migration = new AddTransportMigration();

  if (args.length === 0) {
    console.log('Usage: node 002-add-transport.js <catalog-file> [--rollback <backup-file>]');
    console.log('Example: node 002-add-transport.js ../enhanced-catalog.json');
    console.log('Rollback: node 002-add-transport.js ../enhanced-catalog.json --rollback ../enhanced-catalog.backup-123456.json');
    process.exit(1);
  }

  const catalogPath = path.resolve(args[0]);

  if (args[1] === '--rollback' && args[2]) {
    const backupPath = path.resolve(args[2]);
    migration.rollback(catalogPath, backupPath).then(result => {
      process.exit(result.success ? 0 : 1);
    });
  } else {
    migration.run(catalogPath).then(result => {
      process.exit(result.success ? 0 : 1);
    });
  }
}

module.exports = AddTransportMigration;