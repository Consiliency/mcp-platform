/**
 * Service Isolation
 * Manages network isolation and communication rules between services
 */

const fs = require('fs').promises;
const path = require('path');

class ServiceIsolation {
    constructor() {
        this.rules = new Map();
        this.defaultPolicy = 'deny'; // deny by default
        this.configPath = path.join(__dirname, '../../config/service-isolation.json');
    }

    async initialize() {
        // Load isolation rules
        await this.loadRules();

        // Set up default rules
        await this.setupDefaultRules();
    }

    async cleanup() {
        await this.saveRules();
    }

    /**
     * Configure service isolation
     */
    async configure(config) {
        if (config.defaultPolicy) {
            this.defaultPolicy = config.defaultPolicy;
        }

        if (config.rules) {
            for (const rule of config.rules) {
                await this.addRule(rule);
            }
        }

        await this.saveRules();
    }

    /**
     * Add an isolation rule
     */
    async addRule(rule) {
        const key = `${rule.source}:${rule.target}`;
        this.rules.set(key, {
            source: rule.source,
            target: rule.target,
            allowed: rule.allowed,
            protocols: rule.protocols || ['http', 'https'],
            ports: rule.ports || [],
            methods: rule.methods || ['GET', 'POST', 'PUT', 'DELETE']
        });
    }

    /**
     * Check if communication is allowed
     */
    async isAllowed(source, target, options = {}) {
        const key = `${source}:${target}`;
        const rule = this.rules.get(key);

        // If no specific rule, check wildcard rules
        if (!rule) {
            const wildcardRule = this.findWildcardRule(source, target);
            if (wildcardRule) {
                return this.validateRule(wildcardRule, options);
            }
        }

        // If no rule found, apply default policy
        if (!rule) {
            return this.defaultPolicy === 'allow';
        }

        return this.validateRule(rule, options);
    }

    /**
     * Validate a rule against options
     */
    validateRule(rule, options) {
        if (!rule.allowed) {
            return false;
        }

        // Check protocol
        if (options.protocol && rule.protocols.length > 0) {
            if (!rule.protocols.includes(options.protocol)) {
                return false;
            }
        }

        // Check port
        if (options.port && rule.ports.length > 0) {
            if (!rule.ports.includes(options.port)) {
                return false;
            }
        }

        // Check method
        if (options.method && rule.methods.length > 0) {
            if (!rule.methods.includes(options.method)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Find wildcard rule
     */
    findWildcardRule(source, target) {
        // Check source wildcard
        const sourceWildcard = this.rules.get(`*:${target}`);
        if (sourceWildcard) {
            return sourceWildcard;
        }

        // Check target wildcard
        const targetWildcard = this.rules.get(`${source}:*`);
        if (targetWildcard) {
            return targetWildcard;
        }

        // Check both wildcards
        const bothWildcard = this.rules.get('*:*');
        if (bothWildcard) {
            return bothWildcard;
        }

        return null;
    }

    /**
     * Get all rules
     */
    async getRules() {
        return Array.from(this.rules.values());
    }

    /**
     * Remove a rule
     */
    async removeRule(source, target) {
        const key = `${source}:${target}`;
        const deleted = this.rules.delete(key);
        
        if (deleted) {
            await this.saveRules();
        }
        
        return deleted;
    }

    /**
     * Setup default rules
     */
    async setupDefaultRules() {
        // Allow health service to communicate with all services
        await this.addRule({
            source: 'health-service',
            target: '*',
            allowed: true,
            methods: ['GET']
        });

        // Allow all services to respond to health checks
        await this.addRule({
            source: '*',
            target: 'health-service',
            allowed: true,
            methods: ['GET', 'POST']
        });

        // Allow dashboard to access all services (read-only)
        await this.addRule({
            source: 'dashboard',
            target: '*',
            allowed: true,
            methods: ['GET']
        });
    }

    /**
     * Load rules from storage
     */
    async loadRules() {
        try {
            const data = await fs.readFile(this.configPath, 'utf8');
            const parsed = JSON.parse(data);
            
            this.defaultPolicy = parsed.defaultPolicy || 'deny';
            
            for (const rule of parsed.rules || []) {
                await this.addRule(rule);
            }
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error('Error loading isolation rules:', error);
            }
        }
    }

    /**
     * Save rules to storage
     */
    async saveRules() {
        const data = {
            defaultPolicy: this.defaultPolicy,
            rules: Array.from(this.rules.values())
        };

        const dir = path.dirname(this.configPath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(this.configPath, JSON.stringify(data, null, 2));
    }

    /**
     * Generate Docker Compose network configuration
     */
    async generateDockerNetworks() {
        const networks = {
            mcp_isolated: {
                driver: 'bridge',
                internal: true
            },
            mcp_public: {
                driver: 'bridge'
            }
        };

        // Group services by isolation requirements
        const isolated = new Set();
        const public = new Set();

        for (const rule of this.rules.values()) {
            if (rule.allowed) {
                public.add(rule.source);
                public.add(rule.target);
            } else {
                isolated.add(rule.source);
                isolated.add(rule.target);
            }
        }

        return {
            networks,
            serviceNetworks: {
                isolated: Array.from(isolated),
                public: Array.from(public)
            }
        };
    }
}

module.exports = ServiceIsolation;