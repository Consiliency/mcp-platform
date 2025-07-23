// Mock implementation for ErrorTrackerInterface to support testing
class ErrorTrackerMock {
  constructor(config) {
    this.dsn = config.dsn || 'mock-dsn';
    this.environment = config.environment || 'development';
    this.sampleRate = config.sampleRate || 1.0;
    this.beforeSend = config.beforeSend || null;
    
    this.errors = [];
    this.transactions = new Map();
    this.alerts = [];
    this.transactionCounter = 0;
  }

  captureException(error, context = {}) {
    const errorData = {
      id: `error-${Date.now()}-${Math.random()}`,
      timestamp: new Date(),
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : error,
      context,
      environment: this.environment
    };
    
    this.errors.push(errorData);
    return errorData.id;
  }

  captureMessage(message, level = 'info', context = {}) {
    const messageData = {
      id: `msg-${Date.now()}-${Math.random()}`,
      timestamp: new Date(),
      message,
      level,
      context,
      environment: this.environment
    };
    
    this.errors.push(messageData);
    return messageData.id;
  }

  setUser(user) {
    this.currentUser = user;
    return { set: true };
  }

  setTags(tags) {
    this.globalTags = { ...this.globalTags, ...tags };
    return { set: true };
  }

  setContext(key, context) {
    if (!this.contexts) {
      this.contexts = {};
    }
    this.contexts[key] = context;
    return { set: true };
  }

  startTransaction(name, operation) {
    const transactionId = `txn-${++this.transactionCounter}`;
    const transaction = {
      id: transactionId,
      name,
      operation,
      startTime: Date.now(),
      spans: [],
      finish: () => {
        transaction.endTime = Date.now();
        transaction.duration = transaction.endTime - transaction.startTime;
        return { finished: true };
      }
    };
    
    this.transactions.set(transactionId, transaction);
    return transaction;
  }

  async configureAlert(config) {
    const alert = {
      id: `alert-${this.alerts.length + 1}`,
      name: config.name,
      conditions: config.conditions,
      actions: config.actions,
      enabled: true
    };
    
    this.alerts.push(alert);
    
    return {
      created: true,
      alertId: alert.id
    };
  }

  async getAlerts() {
    return this.alerts.filter(a => a.enabled);
  }

  async testAlert(alertId) {
    const alert = this.alerts.find(a => a.id === alertId);
    if (!alert) {
      throw new Error('Alert not found');
    }
    
    return {
      tested: true,
      alert: alert.name,
      actions: alert.actions
    };
  }

  async flush() {
    const errorCount = this.errors.length;
    const transactionCount = this.transactions.size;
    
    // Simulate flushing data
    return {
      flushed: true,
      errors: errorCount,
      transactions: transactionCount
    };
  }
}

module.exports = ErrorTrackerMock;