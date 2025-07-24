/**
 * Helmet.js Security Middleware
 * Provides comprehensive security headers for Express applications
 * 
 * @module security/middleware/helmet
 */

const helmet = require('helmet');

class HelmetMiddleware {
  constructor(options = {}) {
    this.options = {
      // Content Security Policy
      contentSecurityPolicy: {
        enabled: options.contentSecurityPolicy?.enabled !== false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
          fontSrc: ["'self'"],
          connectSrc: ["'self'"],
          mediaSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameSrc: ["'none'"],
          sandbox: ['allow-forms', 'allow-scripts'],
          reportUri: '/api/csp-report',
          upgradeInsecureRequests: [],
          ...options.contentSecurityPolicy?.directives
        },
        reportOnly: options.contentSecurityPolicy?.reportOnly || false
      },

      // Cross-Origin-Embedder-Policy
      crossOriginEmbedderPolicy: {
        enabled: options.crossOriginEmbedderPolicy?.enabled !== false,
        policy: options.crossOriginEmbedderPolicy?.policy || "require-corp"
      },

      // Cross-Origin-Opener-Policy
      crossOriginOpenerPolicy: {
        enabled: options.crossOriginOpenerPolicy?.enabled !== false,
        policy: options.crossOriginOpenerPolicy?.policy || "same-origin"
      },

      // Cross-Origin-Resource-Policy
      crossOriginResourcePolicy: {
        enabled: options.crossOriginResourcePolicy?.enabled !== false,
        policy: options.crossOriginResourcePolicy?.policy || "same-origin"
      },

      // DNS Prefetch Control
      dnsPrefetchControl: {
        enabled: options.dnsPrefetchControl?.enabled !== false,
        allow: options.dnsPrefetchControl?.allow || false
      },

      // Expect-CT
      expectCt: {
        enabled: options.expectCt?.enabled || false,
        maxAge: options.expectCt?.maxAge || 86400,
        enforce: options.expectCt?.enforce || false,
        reportUri: options.expectCt?.reportUri
      },

      // Frameguard
      frameguard: {
        enabled: options.frameguard?.enabled !== false,
        action: options.frameguard?.action || 'deny'
      },

      // HSTS
      hsts: {
        enabled: options.hsts?.enabled !== false,
        maxAge: options.hsts?.maxAge || 31536000, // 1 year
        includeSubDomains: options.hsts?.includeSubDomains !== false,
        preload: options.hsts?.preload !== false
      },

      // IE No Open
      ieNoOpen: {
        enabled: options.ieNoOpen?.enabled !== false
      },

      // No Sniff
      noSniff: {
        enabled: options.noSniff?.enabled !== false
      },

      // Origin Agent Cluster
      originAgentCluster: {
        enabled: options.originAgentCluster?.enabled !== false
      },

      // Permitted Cross-Domain Policies
      permittedCrossDomainPolicies: {
        enabled: options.permittedCrossDomainPolicies?.enabled !== false,
        policy: options.permittedCrossDomainPolicies?.policy || "none"
      },

      // Referrer Policy
      referrerPolicy: {
        enabled: options.referrerPolicy?.enabled !== false,
        policy: options.referrerPolicy?.policy || ["no-referrer", "strict-origin-when-cross-origin"]
      },

      // XSS Filter
      xssFilter: {
        enabled: options.xssFilter?.enabled !== false
      },

      // Custom options
      ...options
    };

    // CSP violation reports storage
    this.cspReports = [];
    this.maxReports = options.maxCspReports || 1000;
  }

  /**
   * Create Helmet middleware with configuration
   */
  createMiddleware() {
    const helmetConfig = {};

    // Configure each middleware based on options
    if (this.options.contentSecurityPolicy.enabled) {
      helmetConfig.contentSecurityPolicy = {
        directives: this.options.contentSecurityPolicy.directives,
        reportOnly: this.options.contentSecurityPolicy.reportOnly
      };
    } else {
      helmetConfig.contentSecurityPolicy = false;
    }

    if (this.options.crossOriginEmbedderPolicy.enabled) {
      helmetConfig.crossOriginEmbedderPolicy = {
        policy: this.options.crossOriginEmbedderPolicy.policy
      };
    } else {
      helmetConfig.crossOriginEmbedderPolicy = false;
    }

    if (this.options.crossOriginOpenerPolicy.enabled) {
      helmetConfig.crossOriginOpenerPolicy = {
        policy: this.options.crossOriginOpenerPolicy.policy
      };
    } else {
      helmetConfig.crossOriginOpenerPolicy = false;
    }

    if (this.options.crossOriginResourcePolicy.enabled) {
      helmetConfig.crossOriginResourcePolicy = {
        policy: this.options.crossOriginResourcePolicy.policy
      };
    } else {
      helmetConfig.crossOriginResourcePolicy = false;
    }

    if (this.options.dnsPrefetchControl.enabled) {
      helmetConfig.dnsPrefetchControl = {
        allow: this.options.dnsPrefetchControl.allow
      };
    } else {
      helmetConfig.dnsPrefetchControl = false;
    }

    if (this.options.expectCt.enabled) {
      helmetConfig.expectCt = {
        maxAge: this.options.expectCt.maxAge,
        enforce: this.options.expectCt.enforce,
        reportUri: this.options.expectCt.reportUri
      };
    } else {
      helmetConfig.expectCt = false;
    }

    if (this.options.frameguard.enabled) {
      helmetConfig.frameguard = {
        action: this.options.frameguard.action
      };
    } else {
      helmetConfig.frameguard = false;
    }

    if (this.options.hsts.enabled) {
      helmetConfig.hsts = {
        maxAge: this.options.hsts.maxAge,
        includeSubDomains: this.options.hsts.includeSubDomains,
        preload: this.options.hsts.preload
      };
    } else {
      helmetConfig.hsts = false;
    }

    if (this.options.ieNoOpen.enabled) {
      helmetConfig.ieNoOpen = true;
    } else {
      helmetConfig.ieNoOpen = false;
    }

    if (this.options.noSniff.enabled) {
      helmetConfig.noSniff = true;
    } else {
      helmetConfig.noSniff = false;
    }

    if (this.options.originAgentCluster.enabled) {
      helmetConfig.originAgentCluster = true;
    } else {
      helmetConfig.originAgentCluster = false;
    }

    if (this.options.permittedCrossDomainPolicies.enabled) {
      helmetConfig.permittedCrossDomainPolicies = {
        permittedPolicies: this.options.permittedCrossDomainPolicies.policy
      };
    } else {
      helmetConfig.permittedCrossDomainPolicies = false;
    }

    if (this.options.referrerPolicy.enabled) {
      helmetConfig.referrerPolicy = {
        policy: this.options.referrerPolicy.policy
      };
    } else {
      helmetConfig.referrerPolicy = false;
    }

    if (this.options.xssFilter.enabled) {
      helmetConfig.xssFilter = true;
    } else {
      helmetConfig.xssFilter = false;
    }

    return helmet(helmetConfig);
  }

  /**
   * Create CSP report handler
   */
  createCspReportHandler() {
    return (req, res) => {
      try {
        const report = req.body;
        
        if (!report || !report['csp-report']) {
          return res.status(400).json({ error: 'Invalid CSP report' });
        }

        const cspReport = report['csp-report'];
        const reportData = {
          documentUri: cspReport['document-uri'],
          violatedDirective: cspReport['violated-directive'],
          effectiveDirective: cspReport['effective-directive'],
          originalPolicy: cspReport['original-policy'],
          blockedUri: cspReport['blocked-uri'],
          statusCode: cspReport['status-code'],
          referrer: cspReport.referrer,
          scriptSample: cspReport['script-sample'],
          timestamp: new Date(),
          userAgent: req.headers['user-agent'],
          ip: req.ip
        };

        // Store report
        this.cspReports.push(reportData);
        
        // Limit stored reports
        if (this.cspReports.length > this.maxReports) {
          this.cspReports = this.cspReports.slice(-this.maxReports);
        }

        // Log for monitoring
        console.warn('CSP Violation:', {
          documentUri: reportData.documentUri,
          violatedDirective: reportData.violatedDirective,
          blockedUri: reportData.blockedUri
        });

        res.status(204).end();
      } catch (error) {
        console.error('CSP report handler error:', error);
        res.status(500).json({ error: 'Failed to process CSP report' });
      }
    };
  }

  /**
   * Get CSP violation reports
   */
  getCspReports(filters = {}) {
    let reports = [...this.cspReports];

    // Apply filters
    if (filters.startDate) {
      reports = reports.filter(r => r.timestamp >= new Date(filters.startDate));
    }

    if (filters.endDate) {
      reports = reports.filter(r => r.timestamp <= new Date(filters.endDate));
    }

    if (filters.directive) {
      reports = reports.filter(r => 
        r.violatedDirective?.includes(filters.directive) ||
        r.effectiveDirective?.includes(filters.directive)
      );
    }

    if (filters.blockedUri) {
      reports = reports.filter(r => r.blockedUri?.includes(filters.blockedUri));
    }

    // Sort by timestamp (newest first)
    reports.sort((a, b) => b.timestamp - a.timestamp);

    return {
      total: reports.length,
      reports: filters.limit ? reports.slice(0, filters.limit) : reports
    };
  }

  /**
   * Get CSP violation statistics
   */
  getCspStats() {
    const stats = {
      total: this.cspReports.length,
      byDirective: {},
      byBlockedUri: {},
      byHour: {},
      recentViolations: []
    };

    for (const report of this.cspReports) {
      // Count by directive
      const directive = report.effectiveDirective || report.violatedDirective;
      if (directive) {
        stats.byDirective[directive] = (stats.byDirective[directive] || 0) + 1;
      }

      // Count by blocked URI domain
      if (report.blockedUri) {
        try {
          const domain = new URL(report.blockedUri).hostname;
          stats.byBlockedUri[domain] = (stats.byBlockedUri[domain] || 0) + 1;
        } catch (e) {
          stats.byBlockedUri['invalid-uri'] = (stats.byBlockedUri['invalid-uri'] || 0) + 1;
        }
      }

      // Count by hour
      const hour = report.timestamp.getHours();
      stats.byHour[hour] = (stats.byHour[hour] || 0) + 1;
    }

    // Get recent violations
    stats.recentViolations = this.cspReports
      .slice(-10)
      .map(r => ({
        directive: r.effectiveDirective || r.violatedDirective,
        blockedUri: r.blockedUri,
        timestamp: r.timestamp
      }));

    return stats;
  }

  /**
   * Create security headers middleware for specific routes
   */
  createRouteSpecificMiddleware(routeConfig) {
    const middlewares = new Map();

    for (const [route, config] of Object.entries(routeConfig)) {
      const routeOptions = { ...this.options, ...config };
      const routeHelmet = new HelmetMiddleware(routeOptions);
      middlewares.set(route, routeHelmet.createMiddleware());
    }

    return (req, res, next) => {
      // Find matching route
      for (const [route, middleware] of middlewares.entries()) {
        if (req.path.match(route)) {
          return middleware(req, res, next);
        }
      }

      // Use default middleware
      return this.createMiddleware()(req, res, next);
    };
  }

  /**
   * Create nonce generator for inline scripts
   */
  createNonceMiddleware() {
    return (req, res, next) => {
      // Generate a random nonce
      res.locals.nonce = Buffer.from(require('crypto').randomBytes(16)).toString('base64');
      
      // Modify CSP to include nonce
      const originalSetHeader = res.setHeader;
      res.setHeader = function(name, value) {
        if (name.toLowerCase() === 'content-security-policy') {
          // Add nonce to script-src
          value = value.replace(
            /script-src([^;]*)/,
            `script-src$1 'nonce-${res.locals.nonce}'`
          );
        }
        return originalSetHeader.call(this, name, value);
      };

      next();
    };
  }

  /**
   * Test security headers
   */
  testHeaders(headers) {
    const issues = [];
    const recommendations = [];

    // Check HSTS
    if (!headers['strict-transport-security']) {
      issues.push('Missing Strict-Transport-Security header');
      recommendations.push('Enable HSTS to enforce HTTPS connections');
    }

    // Check CSP
    if (!headers['content-security-policy']) {
      issues.push('Missing Content-Security-Policy header');
      recommendations.push('Implement CSP to prevent XSS attacks');
    }

    // Check X-Frame-Options
    if (!headers['x-frame-options']) {
      issues.push('Missing X-Frame-Options header');
      recommendations.push('Set X-Frame-Options to prevent clickjacking');
    }

    // Check X-Content-Type-Options
    if (!headers['x-content-type-options']) {
      issues.push('Missing X-Content-Type-Options header');
      recommendations.push('Set X-Content-Type-Options to nosniff');
    }

    // Check Referrer-Policy
    if (!headers['referrer-policy']) {
      issues.push('Missing Referrer-Policy header');
      recommendations.push('Set Referrer-Policy to control information leakage');
    }

    return {
      secure: issues.length === 0,
      issues,
      recommendations,
      headers: Object.keys(headers).filter(h => 
        h.toLowerCase().includes('security') ||
        h.toLowerCase().includes('policy') ||
        h.toLowerCase().includes('x-')
      )
    };
  }
}

module.exports = HelmetMiddleware;