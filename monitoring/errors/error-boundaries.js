const React = require('react');

/**
 * Error boundary components for React applications
 * Provides various error boundary implementations for different use cases
 */

/**
 * Base error boundary class
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0,
      lastErrorTime: null
    };
    
    this.resetErrorBoundary = this.resetErrorBoundary.bind(this);
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
      lastErrorTime: Date.now()
    };
  }

  componentDidCatch(error, errorInfo) {
    const { onError, errorTracker } = this.props;
    
    // Log error to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('Error caught by boundary:', error, errorInfo);
    }
    
    // Increment error count
    this.setState(prevState => ({
      errorCount: prevState.errorCount + 1,
      errorInfo
    }));
    
    // Report to error tracking service
    if (errorTracker) {
      errorTracker.captureException(error, {
        contexts: {
          react: {
            componentStack: errorInfo.componentStack,
            props: this.props,
            state: this.state
          }
        },
        tags: {
          component: this.constructor.name,
          error_boundary: true
        },
        extra: {
          errorInfo,
          propsKeys: Object.keys(this.props),
          errorCount: this.state.errorCount + 1
        }
      });
    }
    
    // Call custom error handler
    if (onError) {
      onError(error, errorInfo, {
        props: this.props,
        state: this.state,
        errorCount: this.state.errorCount + 1
      });
    }
  }

  resetErrorBoundary() {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
  }

  render() {
    const { hasError, error, errorInfo, errorCount } = this.state;
    const { fallback, fallbackComponent: FallbackComponent, children } = this.props;
    
    if (hasError) {
      // Custom fallback component
      if (FallbackComponent) {
        return (
          <FallbackComponent
            error={error}
            errorInfo={errorInfo}
            resetErrorBoundary={this.resetErrorBoundary}
            errorCount={errorCount}
          />
        );
      }
      
      // Custom fallback render function
      if (typeof fallback === 'function') {
        return fallback({
          error,
          errorInfo,
          resetErrorBoundary: this.resetErrorBoundary,
          errorCount
        });
      }
      
      // Static fallback
      if (fallback) {
        return fallback;
      }
      
      // Default fallback
      return (
        <div className="error-boundary-default-fallback">
          <h2>Something went wrong</h2>
          <details style={{ whiteSpace: 'pre-wrap' }}>
            {error && error.toString()}
            {errorInfo && errorInfo.componentStack}
          </details>
          <button onClick={this.resetErrorBoundary}>Try again</button>
        </div>
      );
    }
    
    return children;
  }
}

/**
 * Async error boundary for handling async errors
 */
class AsyncErrorBoundary extends ErrorBoundary {
  constructor(props) {
    super(props);
    this.promiseRejectionHandler = this.promiseRejectionHandler.bind(this);
  }

  componentDidMount() {
    // Listen for unhandled promise rejections
    window.addEventListener('unhandledrejection', this.promiseRejectionHandler);
  }

  componentWillUnmount() {
    window.removeEventListener('unhandledrejection', this.promiseRejectionHandler);
  }

  promiseRejectionHandler(event) {
    const { onAsyncError } = this.props;
    
    // Log the error
    console.error('Unhandled promise rejection:', event.reason);
    
    // Create an error object
    const error = new Error(event.reason?.message || 'Unhandled promise rejection');
    error.stack = event.reason?.stack;
    
    // Update state to show error UI
    this.setState({
      hasError: true,
      error,
      errorInfo: {
        componentStack: 'Async operation',
        source: 'unhandledrejection'
      }
    });
    
    // Call async error handler
    if (onAsyncError) {
      onAsyncError(error, event);
    }
    
    // Prevent default browser behavior
    event.preventDefault();
  }
}

/**
 * Network error boundary for handling network failures
 */
class NetworkErrorBoundary extends ErrorBoundary {
  constructor(props) {
    super(props);
    this.state = {
      ...this.state,
      isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
      networkErrors: []
    };
    
    this.handleOnline = this.handleOnline.bind(this);
    this.handleOffline = this.handleOffline.bind(this);
  }

  componentDidMount() {
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
  }

  componentWillUnmount() {
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
  }

  handleOnline() {
    this.setState({ isOnline: true });
    
    // Auto-retry if configured
    if (this.props.autoRetry && this.state.hasError) {
      setTimeout(() => {
        this.resetErrorBoundary();
      }, this.props.retryDelay || 1000);
    }
  }

  handleOffline() {
    this.setState({ isOnline: false });
  }

  static getDerivedStateFromError(error) {
    const state = ErrorBoundary.getDerivedStateFromError(error);
    
    // Check if it's a network error
    const isNetworkError = 
      error.message.includes('fetch') ||
      error.message.includes('network') ||
      error.message.includes('Network') ||
      error.code === 'NETWORK_ERROR';
    
    return {
      ...state,
      isNetworkError
    };
  }

  render() {
    const { hasError, error, isOnline, isNetworkError } = this.state;
    const { offlineFallback, networkErrorFallback } = this.props;
    
    // Offline fallback
    if (!isOnline && offlineFallback) {
      return offlineFallback;
    }
    
    // Network error specific fallback
    if (hasError && isNetworkError && networkErrorFallback) {
      return networkErrorFallback({
        error,
        isOnline,
        retry: this.resetErrorBoundary
      });
    }
    
    return super.render();
  }
}

/**
 * Suspense error boundary for handling loading states and errors
 */
class SuspenseErrorBoundary extends ErrorBoundary {
  constructor(props) {
    super(props);
    this.state = {
      ...this.state,
      isLoading: false
    };
  }

  render() {
    const { hasError } = this.state;
    const { loadingFallback, children } = this.props;
    
    if (hasError) {
      return super.render();
    }
    
    return (
      <React.Suspense fallback={loadingFallback || <div>Loading...</div>}>
        {children}
      </React.Suspense>
    );
  }
}

/**
 * Retrying error boundary with exponential backoff
 */
class RetryingErrorBoundary extends ErrorBoundary {
  constructor(props) {
    super(props);
    this.state = {
      ...this.state,
      retryCount: 0,
      isRetrying: false
    };
    
    this.retry = this.retry.bind(this);
  }

  async retry() {
    const { maxRetries = 3, retryDelay = 1000, backoffMultiplier = 2 } = this.props;
    const { retryCount } = this.state;
    
    if (retryCount >= maxRetries) {
      return;
    }
    
    this.setState({ isRetrying: true });
    
    // Calculate delay with exponential backoff
    const delay = retryDelay * Math.pow(backoffMultiplier, retryCount);
    
    await new Promise(resolve => setTimeout(resolve, delay));
    
    this.setState(prevState => ({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: prevState.retryCount + 1,
      isRetrying: false
    }));
  }

  resetErrorBoundary() {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
      isRetrying: false
    });
  }

  render() {
    const { hasError, error, retryCount, isRetrying } = this.state;
    const { maxRetries = 3, retryingFallback } = this.props;
    
    if (hasError) {
      if (retryingFallback) {
        return retryingFallback({
          error,
          retry: this.retry,
          retryCount,
          maxRetries,
          isRetrying,
          canRetry: retryCount < maxRetries,
          reset: this.resetErrorBoundary
        });
      }
      
      // Default retry UI
      return (
        <div className="error-boundary-retry-fallback">
          <h2>Something went wrong</h2>
          <p>{error?.message}</p>
          {retryCount < maxRetries && !isRetrying && (
            <button onClick={this.retry}>
              Retry ({retryCount}/{maxRetries})
            </button>
          )}
          {isRetrying && <p>Retrying...</p>}
          {retryCount >= maxRetries && (
            <p>Maximum retries exceeded. Please refresh the page.</p>
          )}
        </div>
      );
    }
    
    return this.props.children;
  }
}

/**
 * Error boundary with logging
 */
class LoggingErrorBoundary extends ErrorBoundary {
  componentDidCatch(error, errorInfo) {
    const { logger, logLevel = 'error' } = this.props;
    
    if (logger) {
      logger[logLevel]('React error boundary triggered', {
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name
        },
        errorInfo,
        component: this.constructor.name,
        props: this.props,
        url: window.location.href,
        userAgent: navigator.userAgent
      });
    }
    
    super.componentDidCatch(error, errorInfo);
  }
}

/**
 * HOC to wrap components with error boundary
 */
function withErrorBoundary(Component, errorBoundaryProps = {}) {
  const WrappedComponent = React.forwardRef((props, ref) => {
    return (
      <ErrorBoundary {...errorBoundaryProps}>
        <Component {...props} ref={ref} />
      </ErrorBoundary>
    );
  });
  
  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;
  
  return WrappedComponent;
}

/**
 * Hook for error handling (requires React 16.8+)
 */
function useErrorHandler(errorHandler) {
  const [error, setError] = React.useState(null);
  
  React.useEffect(() => {
    if (error) {
      errorHandler(error);
      setError(null);
    }
  }, [error, errorHandler]);
  
  const resetError = React.useCallback(() => {
    setError(null);
  }, []);
  
  const captureError = React.useCallback((error) => {
    setError(error);
  }, []);
  
  return { captureError, resetError };
}

/**
 * Error boundary for specific error types
 */
class TypedErrorBoundary extends ErrorBoundary {
  constructor(props) {
    super(props);
    this.errorHandlers = new Map();
    
    // Register error type handlers
    if (props.errorHandlers) {
      Object.entries(props.errorHandlers).forEach(([errorType, handler]) => {
        this.errorHandlers.set(errorType, handler);
      });
    }
  }

  componentDidCatch(error, errorInfo) {
    // Check for specific error type handlers
    for (const [ErrorType, handler] of this.errorHandlers) {
      if (error instanceof ErrorType || error.name === ErrorType) {
        const fallback = handler(error, errorInfo);
        if (fallback) {
          this.setState({ customFallback: fallback });
          return;
        }
      }
    }
    
    super.componentDidCatch(error, errorInfo);
  }

  render() {
    const { hasError, customFallback } = this.state;
    
    if (hasError && customFallback) {
      return customFallback;
    }
    
    return super.render();
  }
}

/**
 * Create error boundary for specific routes
 */
function createRouteErrorBoundary(options = {}) {
  return class RouteErrorBoundary extends ErrorBoundary {
    componentDidCatch(error, errorInfo) {
      const { onRouteError, redirectTo } = options;
      
      super.componentDidCatch(error, errorInfo);
      
      if (onRouteError) {
        onRouteError(error, {
          route: window.location.pathname,
          ...errorInfo
        });
      }
      
      if (redirectTo) {
        setTimeout(() => {
          window.location.href = redirectTo;
        }, options.redirectDelay || 2000);
      }
    }
  };
}

module.exports = {
  ErrorBoundary,
  AsyncErrorBoundary,
  NetworkErrorBoundary,
  SuspenseErrorBoundary,
  RetryingErrorBoundary,
  LoggingErrorBoundary,
  TypedErrorBoundary,
  withErrorBoundary,
  useErrorHandler,
  createRouteErrorBoundary
};