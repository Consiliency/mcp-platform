/**
 * Retry Strategy (STABILITY-8.1)
 * Intelligent retry mechanisms
 */
class RetryStrategy {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.baseDelay = options.baseDelay || 1000;
    this.maxDelay = options.maxDelay || 30000;
    this.factor = options.factor || 2;
    this.jitter = options.jitter !== false; // Enable jitter by default
    this.retryableErrors = options.retryableErrors || [
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ENOTFOUND',
      'ENETUNREACH',
      'EAI_AGAIN'
    ];
    this.retryableStatusCodes = options.retryableStatusCodes || [
      408, // Request Timeout
      429, // Too Many Requests
      500, // Internal Server Error
      502, // Bad Gateway
      503, // Service Unavailable
      504  // Gateway Timeout
    ];
    
    // Metrics
    this.metrics = {
      totalAttempts: 0,
      successfulRetries: 0,
      failedRetries: 0,
      retryHistory: []
    };
  }
  
  /**
   * Execute with exponential backoff
   * TASK: Implement exponential backoff retry
   */
  async executeWithBackoff(fn, context = {}) {
    let lastError;
    let attempt = 0;
    
    while (attempt <= this.maxRetries) {
      try {
        this.metrics.totalAttempts++;
        
        // Execute the function
        const result = await fn(attempt);
        
        // Success after retry
        if (attempt > 0) {
          this.metrics.successfulRetries++;
          this.recordRetry(context, attempt, true);
        }
        
        return result;
      } catch (error) {
        lastError = error;
        
        // Check if error is retryable
        if (!this.isRetryable(error) || attempt === this.maxRetries) {
          this.metrics.failedRetries++;
          this.recordRetry(context, attempt, false, error);
          throw this.wrapError(error, attempt, context);
        }
        
        // Calculate delay for next attempt
        const delay = this.calculateDelay(attempt);
        
        // Log retry attempt
        this.logRetry(attempt, delay, error, context);
        
        // Wait before retrying
        await this.sleep(delay);
        
        attempt++;
      }
    }
    
    // Should not reach here, but just in case
    throw this.wrapError(lastError, attempt, context);
  }
  
  /**
   * Determine if error is retryable
   * TASK: Implement retry decision logic
   */
  isRetryable(error) {
    // Check for specific error codes
    if (error.code && this.retryableErrors.includes(error.code)) {
      return true;
    }
    
    // Check HTTP status codes
    if (error.response && error.response.status) {
      return this.retryableStatusCodes.includes(error.response.status);
    }
    
    // Check for custom retryable property
    if (error.retryable === true) {
      return true;
    }
    
    // Check for network errors
    if (error.message && (
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('ETIMEDOUT') ||
      error.message.includes('network')
    )) {
      return true;
    }
    
    // Default to not retryable
    return false;
  }
  
  /**
   * Calculate next retry delay
   * TASK: Implement delay calculation
   */
  calculateDelay(attempt) {
    // Calculate exponential delay
    let delay = Math.min(
      this.baseDelay * Math.pow(this.factor, attempt),
      this.maxDelay
    );
    
    // Add jitter to prevent thundering herd
    if (this.jitter) {
      const jitterRange = delay * 0.1; // 10% jitter
      const jitterValue = Math.random() * jitterRange * 2 - jitterRange;
      delay = Math.round(delay + jitterValue);
    }
    
    return delay;
  }
  
  /**
   * Create retry context
   * TASK: Track retry metadata
   */
  createRetryContext(originalError, attempt) {
    return {
      error: {
        message: originalError.message,
        code: originalError.code,
        stack: originalError.stack
      },
      attempt: attempt,
      timestamp: new Date().toISOString(),
      maxRetries: this.maxRetries,
      baseDelay: this.baseDelay,
      factor: this.factor
    };
  }
  
  /**
   * Wrap error with retry context
   */
  wrapError(error, attempt, context) {
    const wrappedError = new Error(
      `Operation failed after ${attempt + 1} attempts: ${error.message}`
    );
    wrappedError.originalError = error;
    wrappedError.retryContext = this.createRetryContext(error, attempt);
    wrappedError.context = context;
    return wrappedError;
  }
  
  /**
   * Log retry attempt
   */
  logRetry(attempt, delay, error, context) {
    console.log(`Retry attempt ${attempt + 1}/${this.maxRetries} after ${delay}ms delay`, {
      error: error.message,
      code: error.code,
      context
    });
  }
  
  /**
   * Record retry for metrics
   */
  recordRetry(context, attempt, success, error = null) {
    this.metrics.retryHistory.push({
      timestamp: new Date().toISOString(),
      attempt,
      success,
      context,
      error: error ? {
        message: error.message,
        code: error.code
      } : null
    });
    
    // Keep only last 100 entries
    if (this.metrics.retryHistory.length > 100) {
      this.metrics.retryHistory = this.metrics.retryHistory.slice(-100);
    }
  }
  
  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Get retry metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      successRate: this.metrics.totalAttempts > 0
        ? (this.metrics.successfulRetries / this.metrics.totalAttempts * 100).toFixed(2) + '%'
        : '0%'
    };
  }
  
  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      totalAttempts: 0,
      successfulRetries: 0,
      failedRetries: 0,
      retryHistory: []
    };
  }
}

module.exports = RetryStrategy;