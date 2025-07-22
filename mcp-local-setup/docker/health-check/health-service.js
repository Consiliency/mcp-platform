#!/usr/bin/env node

/**
 * MCP Platform Health Check Service
 * Provides centralized health monitoring for all MCP services
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

const PORT = process.env.HEALTH_PORT || 3999;
const CHECK_INTERVAL = process.env.CHECK_INTERVAL || 30000; // 30 seconds
const TIMEOUT = process.env.HEALTH_TIMEOUT || 5000; // 5 seconds

// Service registry - will be populated from docker labels
let services = new Map();

// Health check results
let healthStatus = new Map();

/**
 * Health check states
 */
const HealthState = {
  HEALTHY: 'healthy',
  UNHEALTHY: 'unhealthy',
  DEGRADED: 'degraded',
  UNKNOWN: 'unknown'
};

/**
 * Perform health check on a service
 */
async function checkServiceHealth(serviceId, config) {
  const startTime = Date.now();
  
  try {
    const result = await performHttpCheck(config);
    const responseTime = Date.now() - startTime;
    
    healthStatus.set(serviceId, {
      status: result.healthy ? HealthState.HEALTHY : HealthState.UNHEALTHY,
      lastCheck: new Date().toISOString(),
      responseTime,
      message: result.message,
      details: result.details
    });
  } catch (error) {
    healthStatus.set(serviceId, {
      status: HealthState.UNHEALTHY,
      lastCheck: new Date().toISOString(),
      responseTime: Date.now() - startTime,
      message: error.message,
      error: error.toString()
    });
  }
}

/**
 * Perform HTTP/HTTPS health check
 */
function performHttpCheck(config) {
  return new Promise((resolve, reject) => {
    const url = new URL(config.endpoint);
    const protocol = url.protocol === 'https:' ? https : http;
    
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: config.method || 'GET',
      timeout: TIMEOUT,
      headers: {
        'User-Agent': 'MCP-Health-Check/1.0',
        ...config.headers
      }
    };
    
    const req = protocol.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        const healthy = res.statusCode >= 200 && res.statusCode < 300;
        let details = {};
        
        try {
          details = JSON.parse(data);
        } catch (e) {
          details = { response: data };
        }
        
        resolve({
          healthy,
          statusCode: res.statusCode,
          message: healthy ? 'Service is healthy' : `Unhealthy status code: ${res.statusCode}`,
          details
        });
      });
    });
    
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Health check timeout'));
    });
    
    req.end();
  });
}

/**
 * Discover services from Docker API
 */
async function discoverServices() {
  // In production, this would query Docker API for labeled services
  // For now, use a static configuration
  services.set('filesystem', {
    endpoint: 'http://mcp-filesystem:3000/health',
    method: 'GET'
  });
  
  services.set('git', {
    endpoint: 'http://mcp-git:3000/health',
    method: 'GET'
  });
  
  services.set('playwright', {
    endpoint: 'http://mcp-playwright:3000/health',
    method: 'GET'
  });
  
  console.log(`Discovered ${services.size} services`);
}

/**
 * Run health checks for all services
 */
async function runHealthChecks() {
  console.log('Running health checks...');
  
  const checks = [];
  for (const [serviceId, config] of services) {
    checks.push(checkServiceHealth(serviceId, config));
  }
  
  await Promise.all(checks);
  console.log(`Completed ${checks.length} health checks`);
}

/**
 * Calculate overall system health
 */
function getSystemHealth() {
  let healthy = 0;
  let unhealthy = 0;
  let degraded = 0;
  let unknown = 0;
  
  for (const [_, status] of healthStatus) {
    switch (status.status) {
      case HealthState.HEALTHY:
        healthy++;
        break;
      case HealthState.UNHEALTHY:
        unhealthy++;
        break;
      case HealthState.DEGRADED:
        degraded++;
        break;
      default:
        unknown++;
    }
  }
  
  const total = healthy + unhealthy + degraded + unknown;
  
  let overallStatus = HealthState.HEALTHY;
  if (unhealthy > 0) {
    overallStatus = unhealthy === total ? HealthState.UNHEALTHY : HealthState.DEGRADED;
  } else if (degraded > 0) {
    overallStatus = HealthState.DEGRADED;
  } else if (unknown === total) {
    overallStatus = HealthState.UNKNOWN;
  }
  
  return {
    status: overallStatus,
    services: {
      total,
      healthy,
      unhealthy,
      degraded,
      unknown
    }
  };
}

/**
 * HTTP server for health status API
 */
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  if (req.url === '/health') {
    // Overall system health
    const systemHealth = getSystemHealth();
    res.statusCode = systemHealth.status === HealthState.HEALTHY ? 200 : 503;
    res.end(JSON.stringify(systemHealth, null, 2));
    
  } else if (req.url === '/health/services') {
    // Individual service health
    const serviceHealth = {};
    for (const [serviceId, status] of healthStatus) {
      serviceHealth[serviceId] = status;
    }
    res.statusCode = 200;
    res.end(JSON.stringify(serviceHealth, null, 2));
    
  } else if (req.url.startsWith('/health/service/')) {
    // Specific service health
    const serviceId = req.url.split('/').pop();
    const status = healthStatus.get(serviceId);
    
    if (status) {
      res.statusCode = status.status === HealthState.HEALTHY ? 200 : 503;
      res.end(JSON.stringify(status, null, 2));
    } else {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'Service not found' }));
    }
    
  } else {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

/**
 * Start health check service
 */
async function start() {
  console.log('MCP Health Check Service starting...');
  
  // Discover services
  await discoverServices();
  
  // Initial health check
  await runHealthChecks();
  
  // Schedule periodic health checks
  setInterval(runHealthChecks, CHECK_INTERVAL);
  
  // Start HTTP server
  server.listen(PORT, () => {
    console.log(`Health check service listening on port ${PORT}`);
    console.log(`Check interval: ${CHECK_INTERVAL}ms`);
  });
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down health check service...');
  server.close(() => {
    process.exit(0);
  });
});

// Start the service
start().catch(console.error);