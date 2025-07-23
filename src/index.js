const express = require('express');
const HealthMonitor = require('../docker/health/health-monitor');

const app = express();
const port = process.env.PORT || 3000;

// Initialize health monitor
const healthMonitor = new HealthMonitor({
  services: ['database', 'cache'],
  checkInterval: 30000
});

// Health endpoints
app.use(healthMonitor.createHealthEndpoint());
app.use(healthMonitor.createMetricsEndpoint());

// Main API endpoint
app.get('/api', (req, res) => {
  res.json({ message: 'MCP API Service', version: '1.0.0' });
});

const server = app.listen(port, () => {
  console.log(`MCP API Service listening on port ${port}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

module.exports = server;