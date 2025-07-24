#!/usr/bin/env node

/**
 * Liveness Probe
 * Checks if the application process is alive and responsive
 * Returns 0 if alive, 1 if dead
 */

const http = require('http');
const https = require('https');

class LivenessProbe {
  constructor(options = {}) {
    this.host = options.host || process.env.HEALTH_CHECK_HOST || 'localhost';
    this.port = options.port || process.env.HEALTH_CHECK_PORT || 3000;
    this.path = options.path || process.env.HEALTH_CHECK_PATH || '/health/live';
    this.timeout = options.timeout || 3000;
    this.secure = options.secure || process.env.HEALTH_CHECK_SECURE === 'true';
  }

  async check() {
    return new Promise((resolve, reject) => {
      const protocol = this.secure ? https : http;
      
      const options = {
        hostname: this.host,
        port: this.port,
        path: this.path,
        method: 'GET',
        timeout: this.timeout,
        headers: {
          'User-Agent': 'Liveness-Probe/1.0'
        }
      };

      const req = protocol.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const result = JSON.parse(data);
              if (result.alive === true) {
                resolve({ alive: true, status: res.statusCode });
              } else {
                reject(new Error('Service reports not alive'));
              }
            } catch (e) {
              // If we get a 2xx response, consider it alive even if not JSON
              resolve({ alive: true, status: res.statusCode });
            }
          } else {
            reject(new Error(`Unhealthy status code: ${res.statusCode}`));
          }
        });
      });

      req.on('error', (err) => {
        reject(new Error(`Connection error: ${err.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.end();
    });
  }

  async checkProcess() {
    // Basic process checks
    try {
      // Check memory usage
      const memUsage = process.memoryUsage();
      const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
      const heapTotalMB = memUsage.heapTotal / 1024 / 1024;
      
      // Check if we're not running out of memory
      if (heapUsedMB / heapTotalMB > 0.95) {
        throw new Error('Memory usage critical');
      }

      // Check event loop lag
      const start = process.hrtime.bigint();
      setImmediate(() => {
        const lag = Number(process.hrtime.bigint() - start) / 1e6; // Convert to ms
        if (lag > 100) {
          console.warn(`Event loop lag detected: ${lag}ms`);
        }
      });

      return {
        alive: true,
        memory: {
          heapUsedMB: Math.round(heapUsedMB),
          heapTotalMB: Math.round(heapTotalMB),
          rss: Math.round(memUsage.rss / 1024 / 1024)
        },
        uptime: process.uptime()
      };
    } catch (error) {
      return {
        alive: false,
        error: error.message
      };
    }
  }
}

// CLI execution
if (require.main === module) {
  const probe = new LivenessProbe();
  
  // First try HTTP endpoint
  probe.check()
    .then((result) => {
      console.log('Liveness check passed:', result);
      process.exit(0);
    })
    .catch((err) => {
      // Fallback to process check
      console.log('HTTP check failed, trying process check:', err.message);
      return probe.checkProcess();
    })
    .then((result) => {
      if (result && result.alive) {
        console.log('Process check passed:', result);
        process.exit(0);
      } else {
        console.error('Process check failed:', result);
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error('Liveness check failed:', err.message);
      process.exit(1);
    });
}

module.exports = LivenessProbe;