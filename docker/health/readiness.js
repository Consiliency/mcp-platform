#!/usr/bin/env node

/**
 * Readiness Probe
 * Checks if the application is ready to receive traffic
 * Returns 0 if ready, 1 if not ready
 */

const http = require('http');
const https = require('https');
const dns = require('dns').promises;
const net = require('net');

class ReadinessProbe {
  constructor(options = {}) {
    this.host = options.host || process.env.HEALTH_CHECK_HOST || 'localhost';
    this.port = options.port || process.env.HEALTH_CHECK_PORT || 3000;
    this.path = options.path || process.env.HEALTH_CHECK_PATH || '/health/ready';
    this.timeout = options.timeout || 5000;
    this.secure = options.secure || process.env.HEALTH_CHECK_SECURE === 'true';
    
    // Dependencies to check
    this.dependencies = options.dependencies || this.parseDependencies();
  }

  parseDependencies() {
    const deps = [];
    
    // Parse database dependencies
    if (process.env.DATABASE_URL) {
      const dbUrl = new URL(process.env.DATABASE_URL);
      deps.push({
        name: 'database',
        host: dbUrl.hostname,
        port: dbUrl.port || 5432,
        type: 'tcp'
      });
    }
    
    // Parse Redis dependencies
    if (process.env.REDIS_URL) {
      const redisUrl = new URL(process.env.REDIS_URL);
      deps.push({
        name: 'redis',
        host: redisUrl.hostname,
        port: redisUrl.port || 6379,
        type: 'tcp'
      });
    }
    
    // Parse other service dependencies
    if (process.env.DEPENDENCY_SERVICES) {
      const services = process.env.DEPENDENCY_SERVICES.split(',');
      services.forEach(service => {
        const [name, endpoint] = service.split('=');
        if (endpoint) {
          try {
            const url = new URL(endpoint);
            deps.push({
              name: name.trim(),
              host: url.hostname,
              port: url.port || (url.protocol === 'https:' ? 443 : 80),
              type: 'http',
              path: url.pathname || '/health'
            });
          } catch (e) {
            console.warn(`Invalid dependency URL for ${name}: ${endpoint}`);
          }
        }
      });
    }
    
    return deps;
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
          'User-Agent': 'Readiness-Probe/1.0'
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
              if (result.ready === true) {
                resolve({ ready: true, status: res.statusCode, details: result });
              } else {
                reject(new Error('Service reports not ready'));
              }
            } catch (e) {
              // If we get a 2xx response, check status code specifically
              if (res.statusCode === 200) {
                resolve({ ready: true, status: res.statusCode });
              } else {
                reject(new Error(`Service not ready: ${res.statusCode}`));
              }
            }
          } else if (res.statusCode === 503) {
            // 503 typically means not ready
            reject(new Error('Service not ready (503)'));
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
        reject(new Error('Request timeout'));
      });

      req.end();
    });
  }

  async checkTcpConnection(host, port, timeout = 2000) {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      let connected = false;

      socket.setTimeout(timeout);

      socket.on('connect', () => {
        connected = true;
        socket.destroy();
        resolve(true);
      });

      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error(`TCP connection timeout to ${host}:${port}`));
      });

      socket.on('error', (err) => {
        reject(new Error(`TCP connection failed to ${host}:${port}: ${err.message}`));
      });

      socket.connect(port, host);
    });
  }

  async checkHttpDependency(dep) {
    const protocol = dep.secure ? https : http;
    
    return new Promise((resolve, reject) => {
      const options = {
        hostname: dep.host,
        port: dep.port,
        path: dep.path || '/health',
        method: 'GET',
        timeout: 2000
      };

      const req = protocol.request(options, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(true);
        } else {
          reject(new Error(`HTTP check failed: ${res.statusCode}`));
        }
        res.resume(); // Consume response
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('HTTP timeout'));
      });

      req.end();
    });
  }

  async checkDependencies() {
    const results = {
      ready: true,
      checks: []
    };

    for (const dep of this.dependencies) {
      const check = {
        name: dep.name,
        type: dep.type,
        endpoint: `${dep.host}:${dep.port}`
      };

      try {
        if (dep.type === 'tcp') {
          await this.checkTcpConnection(dep.host, dep.port);
          check.status = 'healthy';
        } else if (dep.type === 'http') {
          await this.checkHttpDependency(dep);
          check.status = 'healthy';
        }
      } catch (error) {
        check.status = 'unhealthy';
        check.error = error.message;
        results.ready = false;
      }

      results.checks.push(check);
    }

    return results;
  }

  async checkDns() {
    try {
      // Try to resolve a known domain to check DNS
      await dns.resolve4('google.com');
      return { dns: 'working' };
    } catch (error) {
      return { dns: 'failed', error: error.message };
    }
  }

  async fullCheck() {
    const checks = {
      app: false,
      dependencies: false,
      dns: false
    };

    // Check application endpoint
    try {
      await this.check();
      checks.app = true;
    } catch (error) {
      console.error('App check failed:', error.message);
    }

    // Check dependencies
    if (this.dependencies.length > 0) {
      const depResults = await this.checkDependencies();
      checks.dependencies = depResults.ready;
      checks.dependencyDetails = depResults.checks;
    } else {
      checks.dependencies = true; // No dependencies to check
    }

    // Check DNS
    const dnsResult = await this.checkDns();
    checks.dns = dnsResult.dns === 'working';

    // Overall readiness
    checks.ready = checks.app && checks.dependencies && checks.dns;

    return checks;
  }
}

// CLI execution
if (require.main === module) {
  const probe = new ReadinessProbe();
  
  // Try full readiness check
  probe.fullCheck()
    .then((result) => {
      if (result.ready) {
        console.log('Readiness check passed:', JSON.stringify(result, null, 2));
        process.exit(0);
      } else {
        console.error('Readiness check failed:', JSON.stringify(result, null, 2));
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error('Readiness check error:', err.message);
      process.exit(1);
    });
}

module.exports = ReadinessProbe;