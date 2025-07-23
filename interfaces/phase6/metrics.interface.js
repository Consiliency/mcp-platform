// Contract: Metrics Collector
// Purpose: Define the metrics collection and export interface
// Team responsible: Observability Team

class MetricsInterface {
  constructor(config) {
    // config: { prefix?: string, defaultLabels?: object, pushGateway?: string }
    throw new Error('Not implemented - Observability team will implement');
  }

  // Counter metrics
  createCounter(name, help, labels) {
    // name: string, help: string, labels?: string[]
    // returns: { inc: (value?: number, labels?: object) => void }
    throw new Error('Not implemented - Observability team will implement');
  }

  // Gauge metrics
  createGauge(name, help, labels) {
    // name: string, help: string, labels?: string[]
    // returns: { set: (value: number, labels?: object) => void, inc: (value?: number) => void, dec: (value?: number) => void }
    throw new Error('Not implemented - Observability team will implement');
  }

  // Histogram metrics
  createHistogram(name, help, buckets, labels) {
    // name: string, help: string, buckets?: number[], labels?: string[]
    // returns: { observe: (value: number, labels?: object) => void, startTimer: (labels?: object) => function }
    throw new Error('Not implemented - Observability team will implement');
  }

  // Summary metrics
  createSummary(name, help, percentiles, labels) {
    // name: string, help: string, percentiles?: number[], labels?: string[]
    // returns: { observe: (value: number, labels?: object) => void, startTimer: (labels?: object) => function }
    throw new Error('Not implemented - Observability team will implement');
  }

  // Built-in collectors
  collectDefaultMetrics(options) {
    // options?: { prefix?: string, gcDurationBuckets?: number[], timeout?: number }
    throw new Error('Not implemented - Observability team will implement');
  }

  // HTTP metrics middleware
  createHTTPMetricsMiddleware(options) {
    // options?: { includePath?: boolean, includeMethod?: boolean, buckets?: number[] }
    // returns: Express/Koa middleware function
    throw new Error('Not implemented - Observability team will implement');
  }

  // Export metrics
  async getMetrics(format) {
    // format?: 'prometheus' | 'json'
    // returns: string (prometheus format) or object (json format)
    throw new Error('Not implemented - Observability team will implement');
  }

  // Metrics endpoint
  createMetricsEndpoint(options) {
    // options?: { path?: string, auth?: boolean }
    // returns: Express/Koa router
    throw new Error('Not implemented - Observability team will implement');
  }

  // Push to gateway (for batch jobs)
  async pushMetrics(jobName, groupingKey) {
    // jobName: string, groupingKey?: object
    // returns: { success: boolean, error?: string }
    throw new Error('Not implemented - Observability team will implement');
  }
}

module.exports = MetricsInterface;