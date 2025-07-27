const { EventEmitter } = require('events');

/**
 * Distributed Tracing (FEATURE-8.2)
 * Implements distributed tracing across the platform using OpenTelemetry
 */
class DistributedTracing extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      serviceName: config.serviceName || 'mcp-platform',
      exporterUrl: config.exporterUrl || 'http://localhost:4318/v1/traces',
      samplingRate: config.samplingRate || 1.0,
      propagators: config.propagators || ['w3c', 'b3'],
      resourceAttributes: config.resourceAttributes || {},
      enableAutoInstrumentation: config.enableAutoInstrumentation !== false,
      exportInterval: config.exportInterval || 5000,
      maxQueueSize: config.maxQueueSize || 2048
    };
    
    this.tracer = null;
    this.provider = null;
    this.propagator = null;
    this.exporter = null;
    this.spans = new Map();
    this.initialized = false;
    
    // Lazy-loaded dependencies
    this.api = null;
    this.sdk = null;
    this.otlpExporter = null;
    this.instrumentations = null;
  }
  
  /**
   * Initialize OpenTelemetry tracing
   */
  async initialize() {
    if (this.initialized) {
      return;
    }
    
    try {
      // Lazy load OpenTelemetry dependencies
      this.api = require('@opentelemetry/api');
      this.sdk = require('@opentelemetry/sdk-node');
      this.otlpExporter = require('@opentelemetry/exporter-trace-otlp-http');
      
      // Create OTLP exporter
      this.exporter = new this.otlpExporter.OTLPTraceExporter({
        url: this.config.exporterUrl,
        headers: {},
      });
      
      // Create trace provider
      const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
      const { BatchSpanProcessor } = require('@opentelemetry/sdk-trace-base');
      const { Resource } = require('@opentelemetry/resources');
      const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
      
      const provider = new NodeTracerProvider({
        resource: new Resource({
          [SemanticResourceAttributes.SERVICE_NAME]: this.config.serviceName,
          ...this.config.resourceAttributes
        }),
        sampler: this._createSampler()
      });
      
      // Add span processor
      provider.addSpanProcessor(new BatchSpanProcessor(this.exporter, {
        maxQueueSize: this.config.maxQueueSize,
        scheduledDelayMillis: this.config.exportInterval
      }));
      
      // Register provider
      provider.register();
      this.provider = provider;
      
      // Get tracer
      this.tracer = this.api.trace.getTracer(
        this.config.serviceName,
        '1.0.0'
      );
      
      // Setup propagators
      this._setupPropagators();
      
      // Setup auto-instrumentation if enabled
      if (this.config.enableAutoInstrumentation) {
        await this._setupAutoInstrumentation();
      }
      
      this.initialized = true;
      this.emit('initialized');
    } catch (error) {
      this.emit('error', new Error(`Failed to initialize distributed tracing: ${error.message}`));
      throw error;
    }
  }
  
  /**
   * Start a new trace span
   */
  startSpan(name, options = {}) {
    if (!this.tracer) {
      throw new Error('Distributed tracing not initialized');
    }
    
    const spanOptions = {
      kind: options.kind || this.api.SpanKind.INTERNAL,
      attributes: options.attributes || {},
      links: options.links || [],
      startTime: options.startTime || Date.now()
    };
    
    // Get parent context if provided
    let parentContext = options.parentContext;
    if (!parentContext && options.parentSpanId) {
      const parentSpan = this.spans.get(options.parentSpanId);
      if (parentSpan) {
        parentContext = this.api.trace.setSpan(
          this.api.context.active(),
          parentSpan
        );
      }
    }
    
    // Start span with parent context
    const span = parentContext
      ? this.tracer.startSpan(name, spanOptions, parentContext)
      : this.tracer.startSpan(name, spanOptions);
    
    // Store span reference
    const spanId = span.spanContext().spanId;
    this.spans.set(spanId, span);
    
    // Return span wrapper
    return {
      span,
      spanId,
      
      // Add attributes
      setAttribute(key, value) {
        span.setAttribute(key, value);
        return this;
      },
      
      // Add event
      addEvent(name, attributes) {
        span.addEvent(name, attributes);
        return this;
      },
      
      // Set status
      setStatus(code, message) {
        span.setStatus({ code, message });
        return this;
      },
      
      // End span
      end(endTime) {
        span.end(endTime);
        this.spans.delete(spanId);
      },
      
      // Execute function within span context
      async execute(fn) {
        return this.api.context.with(
          this.api.trace.setSpan(this.api.context.active(), span),
          fn
        );
      }
    };
  }
  
  /**
   * Add trace context to messages
   */
  injectTraceContext(message) {
    if (!this.api || !this.propagator) {
      return message;
    }
    
    const headers = message.headers || {};
    
    // Inject trace context into headers
    this.api.propagation.inject(
      this.api.context.active(),
      headers,
      {
        set(carrier, key, value) {
          carrier[key] = value;
        }
      }
    );
    
    return {
      ...message,
      headers
    };
  }
  
  /**
   * Extract trace context from messages
   */
  extractTraceContext(message) {
    if (!this.api || !this.propagator) {
      return null;
    }
    
    const headers = message.headers || {};
    
    // Extract trace context from headers
    const context = this.api.propagation.extract(
      this.api.context.active(),
      headers,
      {
        get(carrier, key) {
          return carrier[key];
        },
        keys(carrier) {
          return Object.keys(carrier);
        }
      }
    );
    
    return context;
  }
  
  /**
   * Record error in current span
   */
  recordError(error) {
    const span = this.api.trace.getActiveSpan();
    if (span) {
      span.recordException(error);
      span.setStatus({
        code: this.api.SpanStatusCode.ERROR,
        message: error.message
      });
    }
  }
  
  /**
   * Get current trace ID
   */
  getCurrentTraceId() {
    const span = this.api.trace.getActiveSpan();
    if (span) {
      return span.spanContext().traceId;
    }
    return null;
  }
  
  /**
   * Create sampler based on configuration
   */
  _createSampler() {
    const { TraceIdRatioBasedSampler, AlwaysOnSampler, AlwaysOffSampler } = 
      require('@opentelemetry/sdk-trace-base');
    
    if (this.config.samplingRate === 0) {
      return new AlwaysOffSampler();
    } else if (this.config.samplingRate === 1) {
      return new AlwaysOnSampler();
    } else {
      return new TraceIdRatioBasedSampler(this.config.samplingRate);
    }
  }
  
  /**
   * Setup context propagators
   */
  _setupPropagators() {
    const { W3CTraceContextPropagator } = require('@opentelemetry/core');
    const { B3Propagator } = require('@opentelemetry/propagator-b3');
    const { CompositePropagator } = require('@opentelemetry/core');
    
    const propagators = [];
    
    if (this.config.propagators.includes('w3c')) {
      propagators.push(new W3CTraceContextPropagator());
    }
    
    if (this.config.propagators.includes('b3')) {
      propagators.push(new B3Propagator());
    }
    
    this.propagator = new CompositePropagator({
      propagators
    });
    
    this.api.propagation.setGlobalPropagator(this.propagator);
  }
  
  /**
   * Setup automatic instrumentation
   */
  async _setupAutoInstrumentation() {
    try {
      // HTTP instrumentation
      const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
      
      // gRPC instrumentation
      const { GrpcInstrumentation } = require('@opentelemetry/instrumentation-grpc');
      
      this.instrumentations = [
        new HttpInstrumentation({
          requestHook: (span, request) => {
            span.setAttribute('http.request.body.size', request.headers['content-length'] || 0);
          }
        }),
        new GrpcInstrumentation()
      ];
      
      // Register instrumentations
      const { registerInstrumentations } = require('@opentelemetry/instrumentation');
      registerInstrumentations({
        instrumentations: this.instrumentations
      });
      
    } catch (error) {
      this.emit('warning', `Failed to setup auto-instrumentation: ${error.message}`);
    }
  }
  
  /**
   * Shutdown tracing
   */
  async shutdown() {
    if (this.provider) {
      await this.provider.shutdown();
    }
    
    this.initialized = false;
    this.emit('shutdown');
  }
  
  /**
   * Get tracing statistics
   */
  getStats() {
    return {
      activeSpans: this.spans.size,
      initialized: this.initialized,
      serviceName: this.config.serviceName,
      samplingRate: this.config.samplingRate,
      exporterUrl: this.config.exporterUrl
    };
  }
}

module.exports = DistributedTracing;