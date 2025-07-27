const EventEmitter = require('events');

/**
 * Circuit Breaker Pattern (STABILITY-8.1)
 * Prevents cascading failures
 */
class CircuitBreaker extends EventEmitter {
  constructor(options = {}) {
    super();
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000; // 1 minute
    this.failures = 0;
    this.lastFailTime = null;
    this.resetTimer = null;
    this.name = options.name || 'default';
    
    // Additional metrics
    this.metrics = {
      totalRequests: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      stateChanges: []
    };
  }
  
  /**
   * Execute function with circuit breaker protection
   * TASK: Implement circuit breaker logic
   */
  async execute(fn) {
    this.metrics.totalRequests++;
    
    // Check circuit state
    if (this.state === 'OPEN') {
      const error = new Error(`Circuit breaker ${this.name} is OPEN`);
      this.emit('rejected', { error, state: this.state });
      throw error;
    }
    
    try {
      // Execute function
      const result = await fn();
      
      // Track success
      this.onSuccess();
      
      return result;
    } catch (error) {
      // Track failure
      this.onFailure(error);
      
      throw error;
    }
  }
  
  /**
   * Handle successful execution
   */
  onSuccess() {
    this.metrics.totalSuccesses++;
    
    if (this.state === 'HALF_OPEN') {
      this.close();
    }
    
    // Reset failure count on success in CLOSED state
    if (this.state === 'CLOSED') {
      this.failures = 0;
    }
    
    this.emit('success', { state: this.state });
  }
  
  /**
   * Handle failed execution
   */
  onFailure(error) {
    this.failures++;
    this.lastFailTime = Date.now();
    this.metrics.totalFailures++;
    
    this.emit('failure', { error, failures: this.failures, state: this.state });
    
    // Check if we should open the circuit
    if (this.state === 'CLOSED' && this.failures >= this.failureThreshold) {
      this.open();
    } else if (this.state === 'HALF_OPEN') {
      // Failed in half-open state, re-open circuit
      this.open();
    }
  }
  
  /**
   * Open the circuit after threshold failures
   * TASK: Implement circuit opening logic
   */
  open() {
    if (this.state === 'OPEN') return;
    
    const previousState = this.state;
    this.state = 'OPEN';
    
    this.metrics.stateChanges.push({
      from: previousState,
      to: 'OPEN',
      timestamp: new Date().toISOString(),
      failures: this.failures
    });
    
    // Start reset timer
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
    }
    
    this.resetTimer = setTimeout(() => {
      this.halfOpen();
    }, this.resetTimeout);
    
    this.emit('stateChange', { from: previousState, to: 'OPEN' });
  }
  
  /**
   * Attempt to close circuit
   * TASK: Implement half-open state
   */
  halfOpen() {
    if (this.state !== 'OPEN') return;
    
    const previousState = this.state;
    this.state = 'HALF_OPEN';
    
    this.metrics.stateChanges.push({
      from: previousState,
      to: 'HALF_OPEN',
      timestamp: new Date().toISOString()
    });
    
    // Clear reset timer
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
    
    this.emit('stateChange', { from: previousState, to: 'HALF_OPEN' });
  }
  
  /**
   * Close circuit after successful recovery
   * TASK: Implement circuit closing
   */
  close() {
    if (this.state === 'CLOSED') return;
    
    const previousState = this.state;
    this.state = 'CLOSED';
    this.failures = 0;
    this.lastFailTime = null;
    
    this.metrics.stateChanges.push({
      from: previousState,
      to: 'CLOSED',
      timestamp: new Date().toISOString()
    });
    
    // Clear any timers
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
    
    this.emit('stateChange', { from: previousState, to: 'CLOSED' });
  }
  
  /**
   * Get current status
   */
  getStatus() {
    return {
      name: this.name,
      state: this.state,
      failures: this.failures,
      lastFailTime: this.lastFailTime,
      metrics: this.getMetrics()
    };
  }
  
  /**
   * Get metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      failureRate: this.metrics.totalRequests > 0 
        ? (this.metrics.totalFailures / this.metrics.totalRequests * 100).toFixed(2) + '%'
        : '0%',
      successRate: this.metrics.totalRequests > 0
        ? (this.metrics.totalSuccesses / this.metrics.totalRequests * 100).toFixed(2) + '%'
        : '0%'
    };
  }
  
  /**
   * Reset circuit breaker
   */
  reset() {
    this.close();
    this.failures = 0;
    this.lastFailTime = null;
    this.metrics = {
      totalRequests: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      stateChanges: []
    };
    
    this.emit('reset', { name: this.name });
  }
}

module.exports = CircuitBreaker;