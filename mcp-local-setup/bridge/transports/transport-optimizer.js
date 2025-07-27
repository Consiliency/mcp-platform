/**
 * Transport Performance Optimizer (PERF-8.1)
 * Optimizes transport performance across different types
 */
class TransportOptimizer {
  constructor() {
    this.connectionPools = new Map(); // transport -> connection pool
    this.messageQueues = new Map(); // connectionId -> message queue
    this.batchConfig = {
      maxBatchSize: 10,
      maxBatchDelay: 50 // ms
    };
    this.reconnectStrategies = new Map(); // transport -> reconnect strategy
  }
  
  /**
   * Optimize HTTP transport with connection pooling
   * TASK: Implement connection pooling for HTTP transport
   */
  optimizeHttpTransport(transport) {
    // Create connection pool if not exists
    if (!this.connectionPools.has(transport.id)) {
      const pool = {
        connections: new Map(),
        maxConnections: 10,
        keepAliveTimeout: 60000, // 60 seconds
        
        getConnection(host, port) {
          const key = `${host}:${port}`;
          let conn = this.connections.get(key);
          
          if (!conn || conn.isExpired()) {
            conn = {
              socket: null,
              lastUsed: Date.now(),
              isExpired() {
                return Date.now() - this.lastUsed > pool.keepAliveTimeout;
              }
            };
            this.connections.set(key, conn);
          }
          
          conn.lastUsed = Date.now();
          return conn;
        },
        
        cleanup() {
          for (const [key, conn] of this.connections) {
            if (conn.isExpired()) {
              if (conn.socket) {
                conn.socket.destroy();
              }
              this.connections.delete(key);
            }
          }
        }
      };
      
      this.connectionPools.set(transport.id, pool);
      
      // Setup periodic cleanup
      setInterval(() => pool.cleanup(), 30000);
    }
    
    // Apply keep-alive to transport
    if (transport.agent) {
      transport.agent.keepAlive = true;
      transport.agent.keepAliveMsecs = 1000;
      transport.agent.maxSockets = 10;
    }
    
    return this.connectionPools.get(transport.id);
  }
  
  /**
   * Optimize WebSocket reconnection
   * TASK: Improve WebSocket reconnection logic
   */
  optimizeWebSocketReconnection(transport) {
    if (!this.reconnectStrategies.has(transport.id)) {
      const strategy = {
        baseDelay: 1000, // 1 second
        maxDelay: 30000, // 30 seconds
        factor: 2,
        jitter: 0.3,
        attempts: 0,
        
        getNextDelay() {
          const delay = Math.min(
            this.baseDelay * Math.pow(this.factor, this.attempts),
            this.maxDelay
          );
          
          // Increment for next call
          this.attempts++;
          
          // Add jitter to prevent thundering herd
          const jitterAmount = delay * this.jitter * (Math.random() * 2 - 1);
          return Math.round(delay + jitterAmount);
        },
        
        reset() {
          this.attempts = 0;
        }
      };
      
      this.reconnectStrategies.set(transport.id, strategy);
    }
    
    const strategy = this.reconnectStrategies.get(transport.id);
    
    // Apply reconnection logic to transport
    if (transport.reconnect) {
      const originalReconnect = transport.reconnect.bind(transport);
      
      transport.reconnect = async () => {
        const delay = strategy.getNextDelay();
        
        await new Promise(resolve => setTimeout(resolve, delay));
        
        try {
          await originalReconnect();
          strategy.reset(); // Reset on successful connection
        } catch (error) {
          throw error;
        }
      };
    }
    
    return strategy;
  }
  
  /**
   * Implement message batching for high throughput
   * TASK: Add message batching capability
   */
  enableMessageBatching(transport) {
    const queueKey = transport.id || 'default';
    
    if (!this.messageQueues.has(queueKey)) {
      const queue = {
        messages: [],
        timer: null,
        
        add(message) {
          this.messages.push(message);
          
          if (this.messages.length >= this.batchConfig.maxBatchSize) {
            this.flush();
          } else if (!this.timer) {
            this.timer = setTimeout(() => this.flush(), this.batchConfig.maxBatchDelay);
          }
        },
        
        flush() {
          if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
          }
          
          if (this.messages.length === 0) return;
          
          const batch = this.messages.splice(0);
          
          // Send batched messages
          if (transport.sendBatch) {
            transport.sendBatch(batch);
          } else if (transport.send) {
            // Fallback to individual sends if batch not supported
            batch.forEach(msg => transport.send(msg));
          }
        },
        
        batchConfig: this.batchConfig
      };
      
      this.messageQueues.set(queueKey, queue);
    }
    
    const queue = this.messageQueues.get(queueKey);
    
    // Override send method to use batching
    if (transport.send && !transport._originalSend) {
      transport._originalSend = transport.send.bind(transport);
      
      transport.send = (message) => {
        if (transport.batchingEnabled) {
          queue.add(message);
        } else {
          transport._originalSend(message);
        }
      };
      
      transport.flushBatch = () => queue.flush();
    }
    
    return queue;
  }
  
  /**
   * Transport-specific performance tuning
   * TASK: Add performance tuning based on transport type
   */
  tuneTransportPerformance(transport, config = {}) {
    const defaultConfig = {
      bufferSize: 65536, // 64KB
      timeout: 30000, // 30 seconds
      concurrency: 10,
      compression: true
    };
    
    const mergedConfig = { ...defaultConfig, ...config };
    
    // Apply buffer size tuning
    if (transport.setBufferSize) {
      transport.setBufferSize(mergedConfig.bufferSize);
    }
    
    // Apply timeout configuration
    if (transport.setTimeout) {
      transport.setTimeout(mergedConfig.timeout);
    }
    
    // Apply concurrency limits
    if (transport.setConcurrency) {
      transport.setConcurrency(mergedConfig.concurrency);
    }
    
    // Enable compression if supported
    if (mergedConfig.compression && transport.enableCompression) {
      transport.enableCompression();
    }
    
    // Transport-specific optimizations
    switch (transport.type) {
      case 'http':
        this.optimizeHttpTransport(transport);
        break;
      case 'websocket':
        this.optimizeWebSocketReconnection(transport);
        break;
      case 'stdio':
        // Stdio specific optimizations
        if (transport.stream) {
          transport.stream.setNoDelay && transport.stream.setNoDelay(true);
        }
        break;
    }
    
    return mergedConfig;
  }
}

module.exports = TransportOptimizer;