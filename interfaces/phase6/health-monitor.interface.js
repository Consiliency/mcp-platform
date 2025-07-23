// Contract: Health Monitor
// Purpose: Define the health check and monitoring interface
// Team responsible: Docker Production Team

// Import the actual implementation
const HealthMonitor = require('../../docker/health/health-monitor');

// Export the implementation as the interface
module.exports = HealthMonitor;