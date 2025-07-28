const axios = require('axios');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

/**
 * Phase 8 Test Utilities
 * Helper functions for testing new capabilities
 */
class TestUtils {
  constructor(config = {}) {
    this.gatewayUrl = config.gatewayUrl || 'http://localhost:8080';
    this.bridgeUrl = config.bridgeUrl || 'http://localhost:3000';
    this.servers = new Map();
    this.processes = new Map();
  }

  /**
   * Start an MCP server for testing
   */
  async startServer(serverId, config = {}) {
    console.log(`Starting MCP server: ${serverId}`);
    
    const serverConfig = {
      port: config.port || 3000 + Math.floor(Math.random() * 1000),
      tools: config.tools || ['test-tool-1', 'test-tool-2'],
      transport: config.transport || 'http',
      ...config
    };

    // For testing, we'll simulate server startup
    this.servers.set(serverId, {
      id: serverId,
      config: serverConfig,
      startTime: Date.now(),
      tools: serverConfig.tools
    });

    return serverConfig;
  }

  /**
   * Stop an MCP server
   */
  async stopServer(serverId) {
    console.log(`Stopping MCP server: ${serverId}`);
    
    const server = this.servers.get(serverId);
    if (server) {
      this.servers.delete(serverId);
    }

    const process = this.processes.get(serverId);
    if (process) {
      process.kill();
      this.processes.delete(serverId);
    }
  }

  /**
   * Make a tool discovery request
   */
  async discoverTools(serverId = null) {
    try {
      const url = serverId 
        ? `${this.gatewayUrl}/api/servers/${serverId}/tools`
        : `${this.gatewayUrl}/api/tools`;
      
      const response = await axios.get(url);
      return response.data;
    } catch (error) {
      console.error('Tool discovery failed:', error.message);
      throw error;
    }
  }

  /**
   * Call a tool through the gateway
   */
  async callTool(serverId, toolName, params = {}) {
    try {
      const response = await axios.post(`${this.gatewayUrl}/api/call`, {
        server: serverId,
        tool: toolName,
        params
      });
      return response.data;
    } catch (error) {
      console.error('Tool call failed:', error.message);
      throw error;
    }
  }

  /**
   * Monitor resource usage
   */
  async getResourceMetrics() {
    try {
      const response = await axios.get(`${this.bridgeUrl}/metrics`);
      return response.data;
    } catch (error) {
      console.error('Failed to get metrics:', error.message);
      return {
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        connections: this.servers.size
      };
    }
  }

  /**
   * Simulate load for performance testing
   */
  async generateLoad(config = {}) {
    const {
      requests = 100,
      concurrency = 10,
      delay = 0,
      operation = 'discover'
    } = config;

    const results = {
      totalRequests: requests,
      successful: 0,
      failed: 0,
      avgLatency: 0,
      minLatency: Infinity,
      maxLatency: 0,
      latencies: []
    };

    const batchSize = Math.ceil(requests / concurrency);
    
    for (let i = 0; i < concurrency; i++) {
      const promises = [];
      
      for (let j = 0; j < batchSize && (i * batchSize + j) < requests; j++) {
        const start = Date.now();
        
        const promise = this._performOperation(operation)
          .then(() => {
            const latency = Date.now() - start;
            results.successful++;
            results.latencies.push(latency);
            results.minLatency = Math.min(results.minLatency, latency);
            results.maxLatency = Math.max(results.maxLatency, latency);
          })
          .catch(() => {
            results.failed++;
          });
        
        promises.push(promise);
        
        if (delay > 0) {
          await this.sleep(delay);
        }
      }
      
      await Promise.all(promises);
    }

    results.avgLatency = results.latencies.reduce((a, b) => a + b, 0) / results.latencies.length;
    return results;
  }

  /**
   * Perform test operation
   */
  async _performOperation(operation) {
    switch (operation) {
      case 'discover':
        return this.discoverTools();
      case 'call':
        return this.callTool('test-server', 'test-tool');
      case 'metrics':
        return this.getResourceMetrics();
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  }

  /**
   * Wait for a condition to be true
   */
  async waitFor(condition, timeout = 10000, interval = 100) {
    const start = Date.now();
    
    while (Date.now() - start < timeout) {
      if (await condition()) {
        return true;
      }
      await this.sleep(interval);
    }
    
    throw new Error('Timeout waiting for condition');
  }

  /**
   * Sleep for milliseconds
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clean up all test resources
   */
  async cleanup() {
    console.log('Cleaning up test resources...');
    
    // Stop all servers
    for (const serverId of this.servers.keys()) {
      await this.stopServer(serverId);
    }
    
    // Kill all processes
    for (const process of this.processes.values()) {
      process.kill();
    }
    
    this.servers.clear();
    this.processes.clear();
  }

  /**
   * Generate test metrics data
   */
  generateMetricsData(config = {}) {
    const {
      metric = 'cpu_usage',
      points = 100,
      baseline = 50,
      variance = 10,
      anomalyRate = 0.05
    } = config;

    const data = [];
    
    for (let i = 0; i < points; i++) {
      let value = baseline + (Math.random() - 0.5) * variance * 2;
      
      // Inject anomalies
      if (Math.random() < anomalyRate) {
        value = baseline + (Math.random() > 0.5 ? 1 : -1) * variance * 5;
      }
      
      data.push({
        metric,
        value,
        timestamp: Date.now() - (points - i) * 1000
      });
    }
    
    return data;
  }

  /**
   * Create a test transport
   */
  createTestTransport(type, config = {}) {
    const transports = {
      grpc: {
        type: 'grpc',
        host: 'localhost',
        port: 50051,
        ...config
      },
      unix: {
        type: 'unix',
        socketPath: '/tmp/mcp-test.sock',
        ...config
      },
      'named-pipe': {
        type: 'named-pipe',
        pipeName: 'mcp-test-pipe',
        ...config
      }
    };

    return transports[type] || { type, ...config };
  }

  /**
   * Simulate service failures
   */
  async simulateFailure(type = 'timeout', duration = 1000) {
    console.log(`Simulating ${type} failure for ${duration}ms`);
    
    switch (type) {
      case 'timeout':
        await this.sleep(duration);
        throw new Error('Request timeout');
      
      case 'connection':
        throw new Error('Connection refused');
      
      case 'partial':
        if (Math.random() > 0.5) {
          throw new Error('Partial failure');
        }
        return { partial: true };
      
      default:
        throw new Error(`Unknown failure type: ${type}`);
    }
  }

  /**
   * Measure performance
   */
  async measurePerformance(fn, iterations = 100) {
    const measurements = [];
    
    // Warm up
    for (let i = 0; i < 10; i++) {
      await fn();
    }
    
    // Measure
    for (let i = 0; i < iterations; i++) {
      const start = process.hrtime.bigint();
      await fn();
      const end = process.hrtime.bigint();
      measurements.push(Number(end - start) / 1e6); // Convert to ms
    }
    
    return {
      iterations,
      avg: measurements.reduce((a, b) => a + b) / measurements.length,
      min: Math.min(...measurements),
      max: Math.max(...measurements),
      p50: this.percentile(measurements, 50),
      p95: this.percentile(measurements, 95),
      p99: this.percentile(measurements, 99)
    };
  }

  /**
   * Calculate percentile
   */
  percentile(arr, p) {
    const sorted = arr.slice().sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[index];
  }
}

module.exports = TestUtils;