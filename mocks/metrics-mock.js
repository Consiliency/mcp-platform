// Mock implementation for MetricsInterface to support testing
class MetricsMock {
  constructor(config) {
    this.prefix = config.prefix || '';
    this.defaultLabels = config.defaultLabels || {};
    this.pushGateway = config.pushGateway || null;
    this.metrics = new Map();
  }

  createCounter(name, help) {
    const metricName = this.prefix + name;
    const counter = {
      name: metricName,
      help,
      type: 'counter',
      value: 0,
      labels: {},
      inc: (value = 1, labels = {}) => {
        const key = JSON.stringify({ ...this.defaultLabels, ...labels });
        if (!counter.labels[key]) {
          counter.labels[key] = 0;
        }
        counter.labels[key] += value;
        counter.value += value;
      }
    };
    
    this.metrics.set(metricName, counter);
    return counter;
  }

  createGauge(name, help) {
    const metricName = this.prefix + name;
    const gauge = {
      name: metricName,
      help,
      type: 'gauge',
      value: 0,
      labels: {},
      set: (value, labels = {}) => {
        const key = JSON.stringify({ ...this.defaultLabels, ...labels });
        gauge.labels[key] = value;
        gauge.value = value;
      },
      inc: (value = 1, labels = {}) => {
        const key = JSON.stringify({ ...this.defaultLabels, ...labels });
        if (!gauge.labels[key]) {
          gauge.labels[key] = 0;
        }
        gauge.labels[key] += value;
        gauge.value += value;
      },
      dec: (value = 1, labels = {}) => {
        const key = JSON.stringify({ ...this.defaultLabels, ...labels });
        if (!gauge.labels[key]) {
          gauge.labels[key] = 0;
        }
        gauge.labels[key] -= value;
        gauge.value -= value;
      }
    };
    
    this.metrics.set(metricName, gauge);
    return gauge;
  }

  createHistogram(name, help, buckets) {
    const metricName = this.prefix + name;
    const histogram = {
      name: metricName,
      help,
      type: 'histogram',
      buckets: buckets || [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      values: [],
      labels: {},
      observe: (value, labels = {}) => {
        histogram.values.push(value);
        const key = JSON.stringify({ ...this.defaultLabels, ...labels });
        if (!histogram.labels[key]) {
          histogram.labels[key] = [];
        }
        histogram.labels[key].push(value);
      },
      startTimer: (labels = {}) => {
        const start = Date.now();
        return (endLabels = {}) => {
          const duration = (Date.now() - start) / 1000;
          histogram.observe(duration, { ...labels, ...endLabels });
        };
      }
    };
    
    this.metrics.set(metricName, histogram);
    return histogram;
  }

  createSummary(name, help, percentiles) {
    const metricName = this.prefix + name;
    const summary = {
      name: metricName,
      help,
      type: 'summary',
      percentiles: percentiles || [0.5, 0.9, 0.95, 0.99],
      values: [],
      labels: {},
      observe: (value, labels = {}) => {
        summary.values.push(value);
        const key = JSON.stringify({ ...this.defaultLabels, ...labels });
        if (!summary.labels[key]) {
          summary.labels[key] = [];
        }
        summary.labels[key].push(value);
      }
    };
    
    this.metrics.set(metricName, summary);
    return summary;
  }

  collectDefaultMetrics(options = {}) {
    const prefix = options.prefix || this.prefix;
    
    // Create some default metrics
    this.createGauge(`${prefix}process_cpu_usage`, 'Process CPU usage');
    this.createGauge(`${prefix}process_memory_usage`, 'Process memory usage');
    this.createGauge(`${prefix}nodejs_heap_size_total_bytes`, 'Node.js heap size');
    
    return { started: true };
  }

  async getMetrics(format = 'prometheus') {
    if (format === 'json') {
      const result = {};
      for (const [name, metric] of this.metrics) {
        result[name] = metric.value || metric.values.length;
      }
      return result;
    }
    
    // Prometheus format
    let output = '';
    for (const [name, metric] of this.metrics) {
      output += `# HELP ${name} ${metric.help}\n`;
      output += `# TYPE ${name} ${metric.type}\n`;
      
      if (Object.keys(metric.labels).length > 0) {
        for (const [labelStr, value] of Object.entries(metric.labels)) {
          const labels = JSON.parse(labelStr);
          const labelPairs = Object.entries(labels)
            .map(([k, v]) => `${k}="${v}"`)
            .join(',');
          output += `${name}{${labelPairs}} ${value}\n`;
        }
      } else {
        output += `${name} ${metric.value}\n`;
      }
    }
    
    return output;
  }

  async pushMetrics(job, groupingKey = {}) {
    const metrics = await this.getMetrics();
    
    // Simulate push to gateway
    return {
      pushed: true,
      job,
      groupingKey,
      metricsCount: this.metrics.size
    };
  }

  async deleteMetrics(job, groupingKey = {}) {
    // Simulate delete from gateway
    return {
      deleted: true,
      job,
      groupingKey
    };
  }
}

module.exports = MetricsMock;