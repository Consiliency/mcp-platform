/**
 * IP-based Rate Limiting Strategy
 * Implements rate limiting based on client IP addresses
 * 
 * @module security/rate-limiting/ip-limiter
 */

const crypto = require('crypto');

class IPRateLimiter {
  constructor(options = {}) {
    this.options = {
      trustProxy: options.trustProxy !== false,
      proxyDepth: options.proxyDepth || 1,
      ipWhitelist: new Set(options.ipWhitelist || []),
      ipBlacklist: new Set(options.ipBlacklist || []),
      subnetWhitelist: options.subnetWhitelist || [],
      subnetBlacklist: options.subnetBlacklist || [],
      ...options
    };

    // Storage backend (memory or Redis)
    this.storage = options.storage || 'memory';
    this.memoryStore = new Map();
    this.redis = options.redis;

    // Default limits for different IP categories
    this.limits = {
      default: { limit: 100, window: 3600000 }, // 100 per hour
      trusted: { limit: 1000, window: 3600000 }, // 1000 per hour for trusted IPs
      suspicious: { limit: 20, window: 3600000 }, // 20 per hour for suspicious IPs
      api: { limit: 500, window: 3600000 }, // 500 per hour for API endpoints
      auth: { limit: 10, window: 900000 }, // 10 per 15 minutes for auth endpoints
      ...options.limits
    };

    // Track suspicious IPs
    this.suspiciousIPs = new Map();
  }

  /**
   * Extract client IP from request
   */
  getClientIP(req) {
    if (!this.options.trustProxy) {
      return req.connection.remoteAddress || req.socket.remoteAddress;
    }

    // Check various headers in order of preference
    const headers = [
      'x-real-ip',
      'x-forwarded-for',
      'x-client-ip',
      'x-cluster-client-ip',
      'cf-connecting-ip', // Cloudflare
      'true-client-ip', // Akamai
      'x-forwarded',
      'forwarded-for',
      'forwarded'
    ];

    for (const header of headers) {
      const value = req.headers[header];
      if (value) {
        // Handle comma-separated list of IPs
        const ips = value.split(',').map(ip => ip.trim());
        
        // Get the IP based on proxy depth
        const ipIndex = Math.max(0, ips.length - this.options.proxyDepth);
        const ip = ips[ipIndex];
        
        if (this.isValidIP(ip)) {
          return ip;
        }
      }
    }

    // Fallback to socket address
    return req.connection.remoteAddress || 
           req.socket.remoteAddress ||
           req.connection.socket?.remoteAddress;
  }

  /**
   * Validate IP address format
   */
  isValidIP(ip) {
    if (!ip) return false;

    // Basic IPv4 validation
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipv4Regex.test(ip)) {
      const parts = ip.split('.');
      return parts.every(part => {
        const num = parseInt(part, 10);
        return num >= 0 && num <= 255;
      });
    }

    // Basic IPv6 validation
    const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
    return ipv6Regex.test(ip);
  }

  /**
   * Check if IP is whitelisted
   */
  isWhitelisted(ip) {
    // Check exact IP whitelist
    if (this.options.ipWhitelist.has(ip)) {
      return true;
    }

    // Check subnet whitelist
    return this.options.subnetWhitelist.some(subnet => 
      this.isIPInSubnet(ip, subnet)
    );
  }

  /**
   * Check if IP is blacklisted
   */
  isBlacklisted(ip) {
    // Check exact IP blacklist
    if (this.options.ipBlacklist.has(ip)) {
      return true;
    }

    // Check subnet blacklist
    return this.options.subnetBlacklist.some(subnet => 
      this.isIPInSubnet(ip, subnet)
    );
  }

  /**
   * Check if IP is in subnet (simplified implementation)
   */
  isIPInSubnet(ip, subnet) {
    // This is a simplified check - in production, use a proper IP subnet library
    const [subnetIP, mask] = subnet.split('/');
    if (!mask) return ip === subnetIP;

    // For now, just check if IPs start with the same prefix
    const ipParts = ip.split('.');
    const subnetParts = subnetIP.split('.');
    const maskBits = parseInt(mask, 10);
    const octets = Math.floor(maskBits / 8);

    for (let i = 0; i < octets; i++) {
      if (ipParts[i] !== subnetParts[i]) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if IP is suspicious
   */
  isSuspicious(ip) {
    const suspiciousData = this.suspiciousIPs.get(ip);
    if (!suspiciousData) return false;

    // Clear old suspicious markers (older than 24 hours)
    if (Date.now() - suspiciousData.markedAt > 86400000) {
      this.suspiciousIPs.delete(ip);
      return false;
    }

    return true;
  }

  /**
   * Mark IP as suspicious
   */
  markSuspicious(ip, reason) {
    this.suspiciousIPs.set(ip, {
      markedAt: Date.now(),
      reason,
      violations: (this.suspiciousIPs.get(ip)?.violations || 0) + 1
    });
  }

  /**
   * Get rate limit for IP
   */
  getRateLimitForIP(ip, endpoint) {
    // Blacklisted IPs get no access
    if (this.isBlacklisted(ip)) {
      return { limit: 0, window: 3600000 };
    }

    // Whitelisted IPs get higher limits
    if (this.isWhitelisted(ip)) {
      return this.limits.trusted;
    }

    // Suspicious IPs get lower limits
    if (this.isSuspicious(ip)) {
      return this.limits.suspicious;
    }

    // Endpoint-specific limits
    if (endpoint) {
      if (endpoint.includes('/auth') || endpoint.includes('/login')) {
        return this.limits.auth;
      }
      if (endpoint.includes('/api')) {
        return this.limits.api;
      }
    }

    // Default limits
    return this.limits.default;
  }

  /**
   * Check rate limit for IP
   */
  async checkLimit(ip, endpoint) {
    if (!ip) {
      throw new Error('IP address is required');
    }

    // Get appropriate limit
    const rateLimit = this.getRateLimitForIP(ip, endpoint);
    
    // Blacklisted IPs are always blocked
    if (rateLimit.limit === 0) {
      return {
        allowed: false,
        remaining: 0,
        limit: 0,
        resetAt: new Date(Date.now() + rateLimit.window),
        reason: 'IP blacklisted'
      };
    }

    const key = `ip:${ip}:${endpoint || 'global'}`;
    const now = Date.now();
    const windowStart = now - rateLimit.window;

    if (this.storage === 'memory') {
      const record = this.memoryStore.get(key) || { requests: [] };
      
      // Remove expired requests
      record.requests = record.requests.filter(timestamp => timestamp > windowStart);
      
      const used = record.requests.length;
      const allowed = used < rateLimit.limit;
      const remaining = Math.max(0, rateLimit.limit - used);
      
      let resetAt;
      if (record.requests.length > 0) {
        resetAt = new Date(Math.min(...record.requests) + rateLimit.window);
      } else {
        resetAt = new Date(now + rateLimit.window);
      }

      return {
        allowed,
        remaining,
        limit: rateLimit.limit,
        resetAt,
        used
      };
    }

    // Redis implementation would go here
    throw new Error('Redis storage not implemented in this module');
  }

  /**
   * Consume token for IP
   */
  async consumeToken(ip, endpoint, tokens = 1) {
    if (!ip) {
      throw new Error('IP address is required');
    }

    const rateLimit = this.getRateLimitForIP(ip, endpoint);
    
    // Blacklisted IPs can't consume tokens
    if (rateLimit.limit === 0) {
      return {
        success: false,
        remaining: 0,
        resetAt: new Date(Date.now() + rateLimit.window),
        reason: 'IP blacklisted'
      };
    }

    const key = `ip:${ip}:${endpoint || 'global'}`;
    const now = Date.now();
    const windowStart = now - rateLimit.window;

    if (this.storage === 'memory') {
      const record = this.memoryStore.get(key) || { requests: [] };
      
      // Remove expired requests
      record.requests = record.requests.filter(timestamp => timestamp > windowStart);
      
      // Check if we can consume tokens
      if (record.requests.length + tokens > rateLimit.limit) {
        // Mark IP as suspicious if hitting limits frequently
        if (endpoint?.includes('/auth') || endpoint?.includes('/login')) {
          this.markSuspicious(ip, 'Excessive auth attempts');
        }
        
        return {
          success: false,
          remaining: Math.max(0, rateLimit.limit - record.requests.length),
          resetAt: new Date(Math.min(...record.requests, now) + rateLimit.window)
        };
      }
      
      // Consume tokens
      for (let i = 0; i < tokens; i++) {
        record.requests.push(now);
      }
      
      this.memoryStore.set(key, record);
      
      return {
        success: true,
        remaining: Math.max(0, rateLimit.limit - record.requests.length),
        resetAt: new Date(Math.min(...record.requests) + rateLimit.window)
      };
    }

    throw new Error('Redis storage not implemented in this module');
  }

  /**
   * Create IP-based rate limiting middleware
   */
  createMiddleware(options = {}) {
    const endpoint = options.endpoint;
    const skipWhitelisted = options.skipWhitelisted !== false;

    return async (req, res, next) => {
      try {
        const ip = this.getClientIP(req);
        if (!ip) {
          console.warn('Could not determine client IP');
          return next();
        }

        // Skip rate limiting for whitelisted IPs if configured
        if (skipWhitelisted && this.isWhitelisted(ip)) {
          req.clientIP = ip;
          req.rateLimitSkipped = true;
          return next();
        }

        // Determine endpoint for rate limiting
        const rateLimitEndpoint = endpoint || req.path;
        
        // Consume a token
        const result = await this.consumeToken(ip, rateLimitEndpoint);
        
        // Add IP info to request
        req.clientIP = ip;
        req.rateLimitInfo = {
          ip,
          endpoint: rateLimitEndpoint,
          ...result
        };

        // Set rate limit headers
        const rateLimit = this.getRateLimitForIP(ip, rateLimitEndpoint);
        res.setHeader('X-RateLimit-Limit', rateLimit.limit);
        res.setHeader('X-RateLimit-Remaining', result.remaining);
        res.setHeader('X-RateLimit-Reset', result.resetAt.toISOString());

        if (!result.success) {
          res.setHeader('Retry-After', Math.ceil((result.resetAt - Date.now()) / 1000));
          
          const message = result.reason || 'Too many requests from this IP';
          
          return res.status(429).json({
            error: message,
            retryAfter: result.resetAt
          });
        }

        next();
      } catch (error) {
        console.error('IP rate limit middleware error:', error);
        next(); // Fail open
      }
    };
  }

  /**
   * Get statistics for an IP
   */
  async getIPStats(ip) {
    const stats = {
      ip,
      isWhitelisted: this.isWhitelisted(ip),
      isBlacklisted: this.isBlacklisted(ip),
      isSuspicious: this.isSuspicious(ip),
      endpoints: {}
    };

    if (stats.isSuspicious) {
      stats.suspiciousData = this.suspiciousIPs.get(ip);
    }

    // Get usage across all endpoints
    if (this.storage === 'memory') {
      for (const [key, record] of this.memoryStore.entries()) {
        if (key.startsWith(`ip:${ip}:`)) {
          const endpoint = key.replace(`ip:${ip}:`, '');
          const rateLimit = this.getRateLimitForIP(ip, endpoint);
          const now = Date.now();
          const windowStart = now - rateLimit.window;
          
          const activeRequests = record.requests.filter(ts => ts > windowStart);
          
          stats.endpoints[endpoint] = {
            used: activeRequests.length,
            limit: rateLimit.limit,
            remaining: Math.max(0, rateLimit.limit - activeRequests.length),
            percentage: (activeRequests.length / rateLimit.limit) * 100
          };
        }
      }
    }

    return stats;
  }

  /**
   * Add IP to whitelist
   */
  addToWhitelist(ip) {
    if (!this.isValidIP(ip)) {
      throw new Error('Invalid IP address');
    }
    this.options.ipWhitelist.add(ip);
    return { success: true };
  }

  /**
   * Remove IP from whitelist
   */
  removeFromWhitelist(ip) {
    this.options.ipWhitelist.delete(ip);
    return { success: true };
  }

  /**
   * Add IP to blacklist
   */
  addToBlacklist(ip) {
    if (!this.isValidIP(ip)) {
      throw new Error('Invalid IP address');
    }
    this.options.ipBlacklist.add(ip);
    return { success: true };
  }

  /**
   * Remove IP from blacklist
   */
  removeFromBlacklist(ip) {
    this.options.ipBlacklist.delete(ip);
    return { success: true };
  }

  /**
   * Clear suspicious IP marking
   */
  clearSuspicious(ip) {
    this.suspiciousIPs.delete(ip);
    return { success: true };
  }

  /**
   * Get all suspicious IPs
   */
  getSuspiciousIPs() {
    const now = Date.now();
    const suspicious = [];

    for (const [ip, data] of this.suspiciousIPs.entries()) {
      // Only include IPs marked within last 24 hours
      if (now - data.markedAt < 86400000) {
        suspicious.push({
          ip,
          ...data,
          age: now - data.markedAt
        });
      }
    }

    return suspicious.sort((a, b) => b.violations - a.violations);
  }

  /**
   * Clean up old data
   */
  cleanup() {
    const now = Date.now();
    
    // Clean up old suspicious IP entries
    for (const [ip, data] of this.suspiciousIPs.entries()) {
      if (now - data.markedAt > 86400000) {
        this.suspiciousIPs.delete(ip);
      }
    }

    // Clean up old rate limit data
    if (this.storage === 'memory') {
      for (const [key, record] of this.memoryStore.entries()) {
        // Extract endpoint from key to get appropriate rate limit
        const parts = key.split(':');
        if (parts.length >= 3) {
          const endpoint = parts.slice(2).join(':');
          const ip = parts[1];
          const rateLimit = this.getRateLimitForIP(ip, endpoint);
          const windowStart = now - rateLimit.window;
          
          record.requests = record.requests.filter(ts => ts > windowStart);
          
          if (record.requests.length === 0) {
            this.memoryStore.delete(key);
          }
        }
      }
    }

    return { success: true };
  }
}

module.exports = IPRateLimiter;