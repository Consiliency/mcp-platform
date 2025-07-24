#!/usr/bin/env node

/**
 * Startup Probe
 * Checks if the application has completed initialization
 * Returns 0 if started, 1 if still starting
 */

const http = require('http');
const https = require('https');
const fs = require('fs').promises;
const path = require('path');

class StartupProbe {
  constructor(options = {}) {
    this.host = options.host || process.env.HEALTH_CHECK_HOST || 'localhost';
    this.port = options.port || process.env.HEALTH_CHECK_PORT || 3000;
    this.path = options.path || process.env.HEALTH_CHECK_PATH || '/health/startup';
    this.timeout = options.timeout || 10000; // Longer timeout for startup
    this.secure = options.secure || process.env.HEALTH_CHECK_SECURE === 'true';
    
    // Startup markers
    this.markers = options.markers || this.parseMarkers();
    this.requiredFiles = options.requiredFiles || this.parseRequiredFiles();
    this.minUptime = options.minUptime || parseInt(process.env.MIN_UPTIME_SECONDS) || 5;
  }

  parseMarkers() {
    const markers = [];
    
    // Check for initialization markers in environment
    if (process.env.STARTUP_MARKERS) {
      const markerList = process.env.STARTUP_MARKERS.split(',');
      markerList.forEach(marker => {
        markers.push(marker.trim());
      });
    }
    
    // Default markers
    if (markers.length === 0) {
      markers.push(
        'database_connected',
        'cache_initialized',
        'services_registered',
        'routes_loaded'
      );
    }
    
    return markers;
  }

  parseRequiredFiles() {
    const files = [];
    
    if (process.env.REQUIRED_FILES) {
      const fileList = process.env.REQUIRED_FILES.split(',');
      fileList.forEach(file => {
        files.push(file.trim());
      });
    }
    
    return files;
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
          'User-Agent': 'Startup-Probe/1.0'
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
              if (result.started === true) {
                resolve({ 
                  started: true, 
                  status: res.statusCode, 
                  initialized: result.initialized || [],
                  pending: result.pending || []
                });
              } else {
                reject(new Error(`Not started yet. Pending: ${(result.pending || []).join(', ')}`));
              }
            } catch (e) {
              // Check specific status code
              if (res.statusCode === 200) {
                resolve({ started: true, status: res.statusCode });
              } else {
                reject(new Error(`Service still starting: ${res.statusCode}`));
              }
            }
          } else if (res.statusCode === 503) {
            // 503 means still starting
            reject(new Error('Service still starting (503)'));
          } else {
            reject(new Error(`Unexpected status code: ${res.statusCode}`));
          }
        });
      });

      req.on('error', (err) => {
        reject(new Error(`Connection error: ${err.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout - service may still be starting'));
      });

      req.end();
    });
  }

  async checkUptime() {
    const uptime = process.uptime();
    return {
      uptime,
      minUptimeMet: uptime >= this.minUptime,
      message: uptime < this.minUptime 
        ? `Waiting for minimum uptime: ${uptime.toFixed(1)}s / ${this.minUptime}s`
        : 'Minimum uptime met'
    };
  }

  async checkRequiredFiles() {
    const results = {
      allPresent: true,
      files: []
    };

    for (const file of this.requiredFiles) {
      const fileCheck = {
        path: file,
        exists: false
      };

      try {
        await fs.access(file);
        fileCheck.exists = true;
      } catch (error) {
        fileCheck.exists = false;
        fileCheck.error = error.message;
        results.allPresent = false;
      }

      results.files.push(fileCheck);
    }

    return results;
  }

  async checkMarkerFile() {
    const markerPath = process.env.STARTUP_MARKER_FILE || '/tmp/app-started';
    
    try {
      const stat = await fs.stat(markerPath);
      return {
        exists: true,
        path: markerPath,
        created: stat.birthtime,
        age: Date.now() - stat.birthtime.getTime()
      };
    } catch (error) {
      return {
        exists: false,
        path: markerPath,
        error: error.message
      };
    }
  }

  async checkPort() {
    const net = require('net');
    
    return new Promise((resolve) => {
      const server = net.createServer();
      
      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          // Port is in use, which is what we want
          resolve({ 
            portInUse: true, 
            port: this.port,
            message: 'Application is listening on port'
          });
        } else {
          resolve({ 
            portInUse: false, 
            port: this.port,
            error: err.message 
          });
        }
      });
      
      server.once('listening', () => {
        // Port is free, application might not be started
        server.close();
        resolve({ 
          portInUse: false, 
          port: this.port,
          message: 'Port is free - application may not be listening'
        });
      });
      
      server.listen(this.port, this.host);
    });
  }

  async checkMemoryInit() {
    const memUsage = process.memoryUsage();
    const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
    
    // Check if memory usage has stabilized (not growing rapidly)
    // This is a simple heuristic - in production you might track this over time
    return {
      heapUsedMB: Math.round(heapUsedMB),
      rss: Math.round(memUsage.rss / 1024 / 1024),
      stabilized: heapUsedMB < 200 // Adjust threshold as needed
    };
  }

  async fullCheck() {
    const checks = {
      endpoint: false,
      uptime: false,
      port: false,
      files: true,
      memory: false,
      marker: false
    };

    // Check startup endpoint
    try {
      const endpointResult = await this.check();
      checks.endpoint = true;
      checks.endpointDetails = endpointResult;
    } catch (error) {
      checks.endpointError = error.message;
    }

    // Check uptime
    const uptimeResult = await this.checkUptime();
    checks.uptime = uptimeResult.minUptimeMet;
    checks.uptimeDetails = uptimeResult;

    // Check if port is in use
    const portResult = await this.checkPort();
    checks.port = portResult.portInUse;
    checks.portDetails = portResult;

    // Check required files
    if (this.requiredFiles.length > 0) {
      const fileResults = await this.checkRequiredFiles();
      checks.files = fileResults.allPresent;
      checks.fileDetails = fileResults;
    }

    // Check memory initialization
    const memoryResult = await this.checkMemoryInit();
    checks.memory = memoryResult.stabilized;
    checks.memoryDetails = memoryResult;

    // Check marker file
    const markerResult = await this.checkMarkerFile();
    checks.marker = markerResult.exists;
    checks.markerDetails = markerResult;

    // Overall startup status
    // Require at least endpoint OR (port + uptime) to consider started
    checks.started = (checks.endpoint || (checks.port && checks.uptime)) && 
                    checks.files && 
                    checks.memory;

    return checks;
  }
}

// CLI execution
if (require.main === module) {
  const probe = new StartupProbe();
  
  // Try full startup check
  probe.fullCheck()
    .then((result) => {
      if (result.started) {
        console.log('Startup check passed:', JSON.stringify(result, null, 2));
        process.exit(0);
      } else {
        console.error('Startup check failed:', JSON.stringify(result, null, 2));
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error('Startup check error:', err.message);
      process.exit(1);
    });
}

module.exports = StartupProbe;