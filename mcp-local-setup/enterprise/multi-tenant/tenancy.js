/**
 * Multi-Tenancy Module
 * ENTERPRISE-4.1: Tenant isolation, resource quotas, billing
 */

const crypto = require('crypto');
const path = require('path');
const fs = require('fs').promises;

class MultiTenancy {
  constructor() {
    this.tenants = new Map();
    this.quotaLimits = {
      basic: { storage: 1024 * 1024 * 100, // 100MB
               mcpServers: 5,
               apiCalls: 10000 },
      standard: { storage: 1024 * 1024 * 1024, // 1GB
                  mcpServers: 20,
                  apiCalls: 100000 },
      enterprise: { storage: 1024 * 1024 * 1024 * 10, // 10GB
                    mcpServers: 100,
                    apiCalls: -1 } // unlimited
    };
    this.billingProviders = new Map();
    this.isolationPolicies = new Map();
    this.dataDir = path.join(process.cwd(), 'data', 'tenants');
  }

  /**
   * Create tenant isolation
   */
  async createTenantIsolation(tenantId) {
    if (!tenantId || typeof tenantId !== 'string') {
      throw new Error('Invalid tenant ID');
    }

    if (this.tenants.has(tenantId)) {
      throw new Error(`Tenant ${tenantId} already exists`);
    }

    // Create isolated namespace
    const isolation = {
      id: tenantId,
      namespace: `tenant-${tenantId}`,
      dataDir: path.join(this.dataDir, tenantId),
      networkSegment: this._generateNetworkSegment(tenantId),
      encryptionKey: crypto.randomBytes(32).toString('hex'),
      createdAt: new Date().toISOString(),
      status: 'active',
      resourceUsage: {
        storage: 0,
        mcpServers: 0,
        apiCalls: 0
      }
    };

    // Create tenant directory structure
    try {
      await fs.mkdir(isolation.dataDir, { recursive: true });
      await fs.mkdir(path.join(isolation.dataDir, 'config'), { recursive: true });
      await fs.mkdir(path.join(isolation.dataDir, 'data'), { recursive: true });
      await fs.mkdir(path.join(isolation.dataDir, 'logs'), { recursive: true });
    } catch (error) {
      throw new Error(`Failed to create tenant directories: ${error.message}`);
    }

    // Set isolation policies
    const policies = {
      networkIsolation: true,
      dataIsolation: true,
      processIsolation: true,
      resourceIsolation: true,
      crossTenantAccess: false
    };

    this.tenants.set(tenantId, isolation);
    this.isolationPolicies.set(tenantId, policies);

    return {
      tenantId,
      namespace: isolation.namespace,
      dataDir: isolation.dataDir,
      policies,
      status: 'created'
    };
  }

  /**
   * Set resource quotas
   */
  async setResourceQuotas(tenantId, quotas) {
    if (!this.tenants.has(tenantId)) {
      throw new Error(`Tenant ${tenantId} not found`);
    }

    const tenant = this.tenants.get(tenantId);
    
    // Validate quota structure
    const validQuotaKeys = ['storage', 'mcpServers', 'apiCalls', 'bandwidth', 'cpu', 'memory'];
    const providedKeys = Object.keys(quotas);
    
    for (const key of providedKeys) {
      if (!validQuotaKeys.includes(key)) {
        throw new Error(`Invalid quota key: ${key}`);
      }
      if (typeof quotas[key] !== 'number' || quotas[key] < -1) {
        throw new Error(`Invalid quota value for ${key}: must be a positive number or -1 for unlimited`);
      }
    }

    // Apply quotas
    tenant.quotas = {
      ...this.quotaLimits.basic, // default
      ...quotas
    };

    // Set up quota monitoring
    tenant.quotaMonitoring = {
      enabled: true,
      checkInterval: 60000, // 1 minute
      lastCheck: new Date().toISOString(),
      violations: []
    };

    this.tenants.set(tenantId, tenant);

    // Persist quota configuration
    try {
      const quotaFile = path.join(tenant.dataDir, 'config', 'quotas.json');
      await fs.writeFile(quotaFile, JSON.stringify({
        quotas: tenant.quotas,
        monitoring: tenant.quotaMonitoring,
        updatedAt: new Date().toISOString()
      }, null, 2));
    } catch (error) {
      throw new Error(`Failed to persist quota configuration: ${error.message}`);
    }

    return {
      tenantId,
      quotas: tenant.quotas,
      monitoring: tenant.quotaMonitoring
    };
  }

  /**
   * Integrate billing system
   */
  async integrateBilling(billingConfig) {
    if (!billingConfig || !billingConfig.provider) {
      throw new Error('Invalid billing configuration');
    }

    const { provider, apiKey, webhookUrl, plans } = billingConfig;

    // Validate provider
    const supportedProviders = ['stripe', 'paddle', 'chargebee', 'custom'];
    if (!supportedProviders.includes(provider)) {
      throw new Error(`Unsupported billing provider: ${provider}`);
    }

    // Configure billing provider
    const providerConfig = {
      provider,
      apiKey: this._encryptApiKey(apiKey),
      webhookUrl,
      plans: plans || this._getDefaultPlans(),
      features: {
        subscription: true,
        usage_based: true,
        invoicing: true,
        payment_methods: ['card', 'bank_transfer', 'invoice'],
        currencies: ['USD', 'EUR', 'GBP']
      },
      integrationDate: new Date().toISOString(),
      status: 'active'
    };

    this.billingProviders.set(provider, providerConfig);

    // Set up webhook handler
    if (webhookUrl) {
      providerConfig.webhookHandler = this._createWebhookHandler(provider);
    }

    return {
      provider,
      status: 'integrated',
      plans: providerConfig.plans,
      features: providerConfig.features
    };
  }

  /**
   * Manage tenant lifecycle
   */
  async manageTenantLifecycle(tenantId, action) {
    if (!this.tenants.has(tenantId)) {
      throw new Error(`Tenant ${tenantId} not found`);
    }

    const tenant = this.tenants.get(tenantId);
    const validActions = ['create', 'suspend', 'resume', 'delete', 'upgrade', 'downgrade'];

    if (!validActions.includes(action)) {
      throw new Error(`Invalid lifecycle action: ${action}`);
    }

    let result;

    switch (action) {
      case 'create':
        // Already handled by createTenantIsolation
        throw new Error('Use createTenantIsolation for creating new tenants');

      case 'suspend':
        tenant.status = 'suspended';
        tenant.suspendedAt = new Date().toISOString();
        // Disable all tenant services
        await this._disableTenantServices(tenantId);
        result = { status: 'suspended', suspendedAt: tenant.suspendedAt };
        break;

      case 'resume':
        if (tenant.status !== 'suspended') {
          throw new Error('Tenant is not suspended');
        }
        tenant.status = 'active';
        tenant.resumedAt = new Date().toISOString();
        delete tenant.suspendedAt;
        // Re-enable tenant services
        await this._enableTenantServices(tenantId);
        result = { status: 'active', resumedAt: tenant.resumedAt };
        break;

      case 'delete':
        // Backup tenant data before deletion
        await this._backupTenantData(tenantId);
        
        // Remove from active tenants
        this.tenants.delete(tenantId);
        this.isolationPolicies.delete(tenantId);
        
        // Schedule data deletion (grace period)
        const deletionDate = new Date();
        deletionDate.setDate(deletionDate.getDate() + 30); // 30-day grace period
        
        result = {
          status: 'scheduled_for_deletion',
          backupLocation: path.join(this.dataDir, 'backups', tenantId),
          deletionDate: deletionDate.toISOString()
        };
        break;

      case 'upgrade':
      case 'downgrade':
        // Handle plan changes
        const newPlan = action === 'upgrade' ? 'enterprise' : 'standard';
        tenant.plan = newPlan;
        tenant.quotas = this.quotaLimits[newPlan];
        tenant.planChangedAt = new Date().toISOString();
        result = {
          status: action === 'upgrade' ? 'upgraded' : 'downgraded',
          newPlan,
          quotas: tenant.quotas
        };
        break;
    }

    // Update tenant record
    if (this.tenants.has(tenantId)) {
      this.tenants.set(tenantId, tenant);
    }

    // Log lifecycle event
    await this._logLifecycleEvent(tenantId, action, result);

    return {
      tenantId,
      action,
      result,
      timestamp: new Date().toISOString()
    };
  }

  // Helper methods
  _generateNetworkSegment(tenantId) {
    // Generate unique network segment for tenant
    const hash = crypto.createHash('md5').update(tenantId).digest('hex');
    const segment = parseInt(hash.substring(0, 2), 16);
    return `10.${segment}.0.0/24`;
  }

  _encryptApiKey(apiKey) {
    const secret = process.env.ENCRYPTION_KEY || 'default-key';
    // Create a deterministic key and IV from the secret
    const key = crypto.createHash('sha256').update(secret).digest();
    const iv = crypto.createHash('md5').update(secret).digest();
    
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(apiKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  }

  _getDefaultPlans() {
    return {
      basic: {
        price: 29,
        currency: 'USD',
        interval: 'monthly',
        features: this.quotaLimits.basic
      },
      standard: {
        price: 99,
        currency: 'USD',
        interval: 'monthly',
        features: this.quotaLimits.standard
      },
      enterprise: {
        price: 'custom',
        currency: 'USD',
        interval: 'annual',
        features: this.quotaLimits.enterprise
      }
    };
  }

  _createWebhookHandler(provider) {
    return async (event) => {
      // Handle billing webhooks
      console.log(`Received ${provider} webhook:`, event.type);
      
      switch (event.type) {
        case 'payment_succeeded':
        case 'subscription_created':
        case 'subscription_updated':
        case 'subscription_cancelled':
          // Process billing events
          await this._processBillingEvent(event);
          break;
      }
    };
  }

  async _disableTenantServices(tenantId) {
    // Disable tenant's MCP servers, APIs, etc.
    console.log(`Disabling services for tenant ${tenantId}`);
    // Implementation would interact with service registry
  }

  async _enableTenantServices(tenantId) {
    // Re-enable tenant's services
    console.log(`Enabling services for tenant ${tenantId}`);
    // Implementation would interact with service registry
  }

  async _backupTenantData(tenantId) {
    const tenant = this.tenants.get(tenantId);
    const backupDir = path.join(this.dataDir, 'backups', tenantId);
    
    try {
      await fs.mkdir(backupDir, { recursive: true });
      // Copy tenant data to backup location
      // In production, this would use proper backup mechanisms
      console.log(`Backing up tenant ${tenantId} to ${backupDir}`);
    } catch (error) {
      throw new Error(`Backup failed: ${error.message}`);
    }
  }

  async _logLifecycleEvent(tenantId, action, result) {
    const logEntry = {
      tenantId,
      action,
      result,
      timestamp: new Date().toISOString()
    };
    
    const logFile = path.join(this.dataDir, 'lifecycle.log');
    try {
      await fs.appendFile(logFile, JSON.stringify(logEntry) + '\n');
    } catch (error) {
      console.error('Failed to log lifecycle event:', error);
    }
  }

  async _processBillingEvent(event) {
    // Process billing events and update tenant status
    console.log('Processing billing event:', event);
    // Implementation would update tenant billing status
  }
}

module.exports = MultiTenancy;