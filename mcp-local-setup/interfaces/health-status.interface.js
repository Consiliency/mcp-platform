/**
 * Health Status Interface
 * Standard health check response format for all MCP services
 */

/**
 * @typedef {Object} HealthStatus
 * @property {'healthy'|'degraded'|'unhealthy'} status - Overall health status
 * @property {string} service - Service name
 * @property {string} version - Service version
 * @property {number} uptime - Service uptime in seconds
 * @property {string} timestamp - ISO 8601 timestamp
 * @property {Object.<string, 'healthy'|'unhealthy'>} [checks] - Individual component checks
 * @property {Array<string>} [issues] - List of current issues if any
 * @property {Object} [metrics] - Optional performance metrics
 */

/**
 * Health status enumeration
 */
const HealthStatusEnum = {
    HEALTHY: 'healthy',
    DEGRADED: 'degraded',
    UNHEALTHY: 'unhealthy'
};

/**
 * Create a standard health status response
 * @param {string} service - Service name
 * @param {string} version - Service version
 * @param {number} uptime - Service uptime in seconds
 * @param {string} status - Health status
 * @param {Object} [checks] - Component health checks
 * @param {Array<string>} [issues] - Current issues
 * @returns {HealthStatus}
 */
function createHealthStatus(service, version, uptime, status = HealthStatusEnum.HEALTHY, checks = {}, issues = []) {
    return {
        status,
        service,
        version,
        uptime,
        timestamp: new Date().toISOString(),
        checks,
        issues
    };
}

/**
 * Determine overall health from component checks
 * @param {Object.<string, 'healthy'|'unhealthy'>} checks
 * @returns {'healthy'|'degraded'|'unhealthy'}
 */
function calculateOverallHealth(checks) {
    const values = Object.values(checks);
    if (values.length === 0) return HealthStatusEnum.HEALTHY;
    
    const unhealthyCount = values.filter(v => v === 'unhealthy').length;
    
    if (unhealthyCount === 0) return HealthStatusEnum.HEALTHY;
    if (unhealthyCount === values.length) return HealthStatusEnum.UNHEALTHY;
    return HealthStatusEnum.DEGRADED;
}

module.exports = {
    HealthStatusEnum,
    createHealthStatus,
    calculateOverallHealth
};