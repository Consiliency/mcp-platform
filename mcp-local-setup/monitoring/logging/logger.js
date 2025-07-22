/**
 * Centralized Logging Infrastructure
 * MONITOR-4.2: Log collection, aggregation and search
 */

const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');

class LoggingService {
  constructor() {
    this.loggers = new Map();
    this.logBuffer = [];
    this.logDirectory = path.join(process.cwd(), 'logs');
    this.ensureLogDirectory();
    
    // Initialize main logger
    this.mainLogger = this.createLogger('mcp-platform');
    
    // Analysis tools configuration
    this.analysisConfig = {
      patterns: new Map(),
      alerts: new Map(),
      metrics: {
        errorCount: 0,
        warningCount: 0,
        totalLogs: 0
      }
    };
  }

  /**
   * Initialize centralized log collection
   */
  initializeLogCollection() {
    try {
      // Setup log transports
      const transports = [
        // Console transport for development
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.colorize(),
            winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
              return `[${timestamp}] ${level} [${service || 'system'}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
            })
          )
        }),
        
        // File transport for all logs
        new DailyRotateFile({
          filename: path.join(this.logDirectory, 'mcp-platform-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          maxSize: '20m',
          maxFiles: '14d',
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
          )
        }),
        
        // Error log file
        new DailyRotateFile({
          filename: path.join(this.logDirectory, 'mcp-errors-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          maxSize: '20m',
          maxFiles: '30d',
          level: 'error',
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
          )
        })
      ];

      // Configure main logger
      this.mainLogger.configure({
        level: process.env.LOG_LEVEL || 'info',
        transports
      });

      // Setup log stream processing
      this.setupLogStreaming();
      
      // Initialize log analysis
      this.initializeAnalysis();

      return {
        success: true,
        message: 'Log collection initialized successfully',
        logDirectory: this.logDirectory
      };
    } catch (error) {
      console.error('Failed to initialize log collection:', error);
      throw new Error(`Log collection initialization failed: ${error.message}`);
    }
  }

  /**
   * Aggregate logs from multiple services
   */
  aggregateLogs(services) {
    if (!Array.isArray(services)) {
      throw new Error('Services must be an array');
    }

    try {
      const aggregatedLogs = [];
      const logStats = {
        totalLogs: 0,
        byService: {},
        byLevel: {
          error: 0,
          warn: 0,
          info: 0,
          debug: 0
        }
      };

      // Process logs from each service
      for (const service of services) {
        const serviceLogs = this.getServiceLogs(service);
        
        if (serviceLogs && serviceLogs.length > 0) {
          aggregatedLogs.push(...serviceLogs);
          logStats.byService[service] = serviceLogs.length;
          logStats.totalLogs += serviceLogs.length;
          
          // Count by level
          serviceLogs.forEach(log => {
            if (log.level && logStats.byLevel[log.level] !== undefined) {
              logStats.byLevel[log.level]++;
            }
          });
        }
      }

      // Sort by timestamp
      aggregatedLogs.sort((a, b) => {
        return new Date(b.timestamp) - new Date(a.timestamp);
      });

      return {
        logs: aggregatedLogs,
        stats: logStats,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Failed to aggregate logs:', error);
      throw new Error(`Log aggregation failed: ${error.message}`);
    }
  }

  /**
   * Search logs with query
   */
  searchLogs(query, options = {}) {
    if (!query) {
      throw new Error('Search query is required');
    }

    try {
      const {
        service = null,
        level = null,
        startTime = null,
        endTime = null,
        limit = 100,
        offset = 0
      } = options;

      let results = [];
      
      // Search in memory buffer first
      results = this.searchInBuffer(query, { service, level, startTime, endTime });
      
      // If not enough results, search in files
      if (results.length < limit) {
        const fileResults = this.searchInFiles(query, {
          service,
          level,
          startTime,
          endTime,
          limit: limit - results.length
        });
        results.push(...fileResults);
      }

      // Apply pagination
      const paginatedResults = results.slice(offset, offset + limit);

      return {
        results: paginatedResults,
        total: results.length,
        query,
        options,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Log search failed:', error);
      throw new Error(`Log search failed: ${error.message}`);
    }
  }

  /**
   * Setup log analysis tools
   */
  setupAnalysisTools() {
    try {
      // Pattern matching for common issues
      this.analysisConfig.patterns.set('error_spike', {
        pattern: /error|exception|failed/i,
        threshold: 10,
        timeWindow: 60000, // 1 minute
        action: 'alert'
      });

      this.analysisConfig.patterns.set('memory_leak', {
        pattern: /memory.*leak|heap.*out.*of.*memory/i,
        threshold: 5,
        timeWindow: 300000, // 5 minutes
        action: 'critical_alert'
      });

      this.analysisConfig.patterns.set('slow_response', {
        pattern: /response.*time.*exceeded|timeout|slow/i,
        threshold: 20,
        timeWindow: 120000, // 2 minutes
        action: 'warning'
      });

      // Real-time analysis
      this.startRealtimeAnalysis();

      // Periodic report generation
      this.scheduleReports();

      return {
        success: true,
        patterns: Array.from(this.analysisConfig.patterns.keys()),
        message: 'Analysis tools configured successfully'
      };
    } catch (error) {
      console.error('Failed to setup analysis tools:', error);
      throw new Error(`Analysis tools setup failed: ${error.message}`);
    }
  }

  /**
   * Create a logger for a specific service
   */
  createLogger(serviceName) {
    if (this.loggers.has(serviceName)) {
      return this.loggers.get(serviceName);
    }

    const logger = winston.createLogger({
      defaultMeta: { service: serviceName },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
              return `[${timestamp}] ${level} [${service}]: ${message}`;
            })
          )
        })
      ]
    });

    this.loggers.set(serviceName, logger);
    return logger;
  }

  /**
   * Get logger for a service
   */
  getLogger(serviceName) {
    if (!this.loggers.has(serviceName)) {
      return this.createLogger(serviceName);
    }
    return this.loggers.get(serviceName);
  }

  /**
   * Log a message
   */
  log(level, message, meta = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...meta
    };

    // Add to buffer
    this.logBuffer.push(logEntry);
    if (this.logBuffer.length > 10000) {
      this.logBuffer.shift(); // Remove oldest entry
    }

    // Update metrics
    this.updateMetrics(level);

    // Log using winston
    this.mainLogger.log(level, message, meta);

    // Check for patterns
    this.analyzeLogEntry(logEntry);
  }

  /**
   * Ensure log directory exists
   */
  ensureLogDirectory() {
    if (!fs.existsSync(this.logDirectory)) {
      fs.mkdirSync(this.logDirectory, { recursive: true });
    }
  }

  /**
   * Setup log streaming
   */
  setupLogStreaming() {
    // This would typically connect to a log aggregation service
    // For now, we'll implement a simple event emitter
    this.logStream = {
      subscribers: new Set(),
      emit: (log) => {
        this.logStream.subscribers.forEach(callback => {
          try {
            callback(log);
          } catch (error) {
            console.error('Log stream subscriber error:', error);
          }
        });
      }
    };
  }

  /**
   * Initialize analysis
   */
  initializeAnalysis() {
    this.analysisConfig.recentMatches = new Map();
    this.analysisConfig.patternCounts = new Map();
  }

  /**
   * Search in memory buffer
   */
  searchInBuffer(query, filters) {
    return this.logBuffer.filter(log => {
      // Text search
      const matchesQuery = JSON.stringify(log).toLowerCase().includes(query.toLowerCase());
      
      // Apply filters
      const matchesService = !filters.service || log.service === filters.service;
      const matchesLevel = !filters.level || log.level === filters.level;
      const matchesTime = this.isWithinTimeRange(log.timestamp, filters.startTime, filters.endTime);
      
      return matchesQuery && matchesService && matchesLevel && matchesTime;
    });
  }

  /**
   * Search in log files
   */
  searchInFiles(query, filters) {
    const results = [];
    
    try {
      const logFiles = fs.readdirSync(this.logDirectory)
        .filter(file => file.endsWith('.log'))
        .sort((a, b) => b.localeCompare(a)); // Newest first

      for (const file of logFiles) {
        if (results.length >= filters.limit) break;
        
        const filePath = path.join(this.logDirectory, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          try {
            const log = JSON.parse(line);
            
            if (this.matchesSearchCriteria(log, query, filters)) {
              results.push(log);
              if (results.length >= filters.limit) break;
            }
          } catch (e) {
            // Skip malformed log entries
          }
        }
      }
    } catch (error) {
      console.error('Error searching log files:', error);
    }
    
    return results;
  }

  /**
   * Check if log matches search criteria
   */
  matchesSearchCriteria(log, query, filters) {
    const matchesQuery = JSON.stringify(log).toLowerCase().includes(query.toLowerCase());
    const matchesService = !filters.service || log.service === filters.service;
    const matchesLevel = !filters.level || log.level === filters.level;
    const matchesTime = this.isWithinTimeRange(log.timestamp, filters.startTime, filters.endTime);
    
    return matchesQuery && matchesService && matchesLevel && matchesTime;
  }

  /**
   * Check if timestamp is within range
   */
  isWithinTimeRange(timestamp, startTime, endTime) {
    const logTime = new Date(timestamp);
    
    if (startTime && logTime < new Date(startTime)) return false;
    if (endTime && logTime > new Date(endTime)) return false;
    
    return true;
  }

  /**
   * Get service logs
   */
  getServiceLogs(serviceName) {
    return this.logBuffer.filter(log => log.service === serviceName);
  }

  /**
   * Update metrics
   */
  updateMetrics(level) {
    this.analysisConfig.metrics.totalLogs++;
    
    if (level === 'error') {
      this.analysisConfig.metrics.errorCount++;
    } else if (level === 'warn') {
      this.analysisConfig.metrics.warningCount++;
    }
  }

  /**
   * Analyze log entry for patterns
   */
  analyzeLogEntry(logEntry) {
    const logText = `${logEntry.message} ${JSON.stringify(logEntry)}`;
    
    for (const [name, config] of this.analysisConfig.patterns) {
      if (config.pattern.test(logText)) {
        this.recordPatternMatch(name, logEntry, config);
      }
    }
  }

  /**
   * Record pattern match
   */
  recordPatternMatch(patternName, logEntry, config) {
    if (!this.analysisConfig.recentMatches.has(patternName)) {
      this.analysisConfig.recentMatches.set(patternName, []);
    }
    
    const matches = this.analysisConfig.recentMatches.get(patternName);
    matches.push({
      timestamp: logEntry.timestamp,
      log: logEntry
    });
    
    // Keep only recent matches within time window
    const cutoffTime = Date.now() - config.timeWindow;
    const recentMatches = matches.filter(m => new Date(m.timestamp) > cutoffTime);
    this.analysisConfig.recentMatches.set(patternName, recentMatches);
    
    // Check threshold
    if (recentMatches.length >= config.threshold) {
      this.triggerAnalysisAlert(patternName, config, recentMatches);
    }
  }

  /**
   * Trigger analysis alert
   */
  triggerAnalysisAlert(patternName, config, matches) {
    const alert = {
      pattern: patternName,
      action: config.action,
      threshold: config.threshold,
      matchCount: matches.length,
      timeWindow: config.timeWindow,
      timestamp: new Date().toISOString()
    };
    
    this.analysisConfig.alerts.set(patternName, alert);
    this.log('warn', `Pattern alert triggered: ${patternName}`, alert);
  }

  /**
   * Start real-time analysis
   */
  startRealtimeAnalysis() {
    // This would typically integrate with a stream processing system
    setInterval(() => {
      const metrics = this.getAnalysisMetrics();
      if (metrics.errorRate > 0.1) { // More than 10% errors
        this.log('warn', 'High error rate detected', metrics);
      }
    }, 30000); // Check every 30 seconds
  }

  /**
   * Schedule periodic reports
   */
  scheduleReports() {
    // Daily report
    setInterval(() => {
      this.generateReport('daily');
    }, 24 * 60 * 60 * 1000);
  }

  /**
   * Get analysis metrics
   */
  getAnalysisMetrics() {
    const total = this.analysisConfig.metrics.totalLogs;
    return {
      totalLogs: total,
      errorCount: this.analysisConfig.metrics.errorCount,
      warningCount: this.analysisConfig.metrics.warningCount,
      errorRate: total > 0 ? this.analysisConfig.metrics.errorCount / total : 0,
      activeAlerts: this.analysisConfig.alerts.size
    };
  }

  /**
   * Generate report
   */
  generateReport(type) {
    const report = {
      type,
      timestamp: new Date().toISOString(),
      metrics: this.getAnalysisMetrics(),
      topPatterns: Array.from(this.analysisConfig.recentMatches.entries())
        .map(([pattern, matches]) => ({ pattern, count: matches.length }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
    };
    
    this.log('info', `Generated ${type} report`, report);
    return report;
  }

  /**
   * Subscribe to log stream
   */
  subscribe(callback) {
    if (typeof callback === 'function') {
      this.logStream.subscribers.add(callback);
      return () => this.logStream.subscribers.delete(callback);
    }
    throw new Error('Callback must be a function');
  }

  /**
   * Get current alerts
   */
  getAlerts() {
    return Array.from(this.analysisConfig.alerts.values());
  }

  /**
   * Clear alerts
   */
  clearAlerts() {
    this.analysisConfig.alerts.clear();
  }
}

module.exports = LoggingService;