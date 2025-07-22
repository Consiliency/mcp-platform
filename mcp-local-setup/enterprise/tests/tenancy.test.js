/**
 * Tests for Multi-Tenancy Module
 */

const MultiTenancy = require('../multi-tenant/tenancy');
const fs = require('fs').promises;
const path = require('path');

describe('MultiTenancy', () => {
  let multiTenancy;

  beforeEach(() => {
    multiTenancy = new MultiTenancy();
  });

  afterEach(async () => {
    // Clean up test data directories
    const testDataDir = path.join(process.cwd(), 'data', 'tenants');
    try {
      await fs.rm(testDataDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore errors if directory doesn't exist
    }
  });

  describe('createTenantIsolation', () => {
    it('should create a new tenant with proper isolation', async () => {
      const tenantId = 'test-tenant-001';
      const result = await multiTenancy.createTenantIsolation(tenantId);

      expect(result).toBeDefined();
      expect(result.tenantId).toBe(tenantId);
      expect(result.namespace).toBe(`tenant-${tenantId}`);
      expect(result.policies).toEqual({
        networkIsolation: true,
        dataIsolation: true,
        processIsolation: true,
        resourceIsolation: true,
        crossTenantAccess: false
      });
      expect(result.status).toBe('created');
    });

    it('should throw error for invalid tenant ID', async () => {
      await expect(multiTenancy.createTenantIsolation(null)).rejects.toThrow('Invalid tenant ID');
      await expect(multiTenancy.createTenantIsolation('')).rejects.toThrow('Invalid tenant ID');
      await expect(multiTenancy.createTenantIsolation(123)).rejects.toThrow('Invalid tenant ID');
    });

    it('should throw error if tenant already exists', async () => {
      const tenantId = 'test-tenant-002';
      await multiTenancy.createTenantIsolation(tenantId);
      
      await expect(multiTenancy.createTenantIsolation(tenantId))
        .rejects.toThrow(`Tenant ${tenantId} already exists`);
    });

    it('should create tenant directory structure', async () => {
      const tenantId = 'test-tenant-003';
      const result = await multiTenancy.createTenantIsolation(tenantId);
      
      const expectedDirs = ['config', 'data', 'logs'];
      for (const dir of expectedDirs) {
        const dirPath = path.join(result.dataDir, dir);
        const stats = await fs.stat(dirPath);
        expect(stats.isDirectory()).toBe(true);
      }
    });
  });

  describe('setResourceQuotas', () => {
    beforeEach(async () => {
      await multiTenancy.createTenantIsolation('quota-test-tenant');
    });

    it('should set resource quotas for a tenant', async () => {
      const quotas = {
        storage: 1024 * 1024 * 500, // 500MB
        mcpServers: 10,
        apiCalls: 50000
      };
      
      const result = await multiTenancy.setResourceQuotas('quota-test-tenant', quotas);
      
      expect(result).toBeDefined();
      expect(result.tenantId).toBe('quota-test-tenant');
      expect(result.quotas).toMatchObject(quotas);
      expect(result.monitoring.enabled).toBe(true);
    });

    it('should throw error for non-existent tenant', async () => {
      await expect(multiTenancy.setResourceQuotas('non-existent', {}))
        .rejects.toThrow('Tenant non-existent not found');
    });

    it('should validate quota keys', async () => {
      const invalidQuotas = {
        invalidKey: 100
      };
      
      await expect(multiTenancy.setResourceQuotas('quota-test-tenant', invalidQuotas))
        .rejects.toThrow('Invalid quota key: invalidKey');
    });

    it('should validate quota values', async () => {
      const invalidQuotas = {
        storage: -5
      };
      
      await expect(multiTenancy.setResourceQuotas('quota-test-tenant', invalidQuotas))
        .rejects.toThrow('Invalid quota value for storage');
    });

    it('should persist quota configuration', async () => {
      const quotas = { storage: 1024 * 1024 * 1024 };
      await multiTenancy.setResourceQuotas('quota-test-tenant', quotas);
      
      const tenant = multiTenancy.tenants.get('quota-test-tenant');
      const quotaFile = path.join(tenant.dataDir, 'config', 'quotas.json');
      const fileContent = await fs.readFile(quotaFile, 'utf8');
      const savedConfig = JSON.parse(fileContent);
      
      expect(savedConfig.quotas.storage).toBe(quotas.storage);
    });
  });

  describe('integrateBilling', () => {
    it('should integrate with supported billing providers', async () => {
      const billingConfig = {
        provider: 'stripe',
        apiKey: 'sk_test_123456789',
        webhookUrl: 'https://example.com/webhook'
      };
      
      const result = await multiTenancy.integrateBilling(billingConfig);
      
      expect(result).toBeDefined();
      expect(result.provider).toBe('stripe');
      expect(result.status).toBe('integrated');
      expect(result.features).toBeDefined();
      expect(result.features.subscription).toBe(true);
    });

    it('should throw error for unsupported provider', async () => {
      const invalidConfig = {
        provider: 'unsupported-provider',
        apiKey: 'test'
      };
      
      await expect(multiTenancy.integrateBilling(invalidConfig))
        .rejects.toThrow('Unsupported billing provider: unsupported-provider');
    });

    it('should encrypt API keys', async () => {
      const billingConfig = {
        provider: 'stripe',
        apiKey: 'sk_test_secret_key'
      };
      
      await multiTenancy.integrateBilling(billingConfig);
      
      const provider = multiTenancy.billingProviders.get('stripe');
      expect(provider.apiKey).not.toBe(billingConfig.apiKey);
      expect(provider.apiKey).toBeTruthy();
    });

    it('should use default plans if not provided', async () => {
      const billingConfig = {
        provider: 'paddle',
        apiKey: 'test_key'
      };
      
      const result = await multiTenancy.integrateBilling(billingConfig);
      
      expect(result.plans).toBeDefined();
      expect(result.plans.basic).toBeDefined();
      expect(result.plans.basic.price).toBe(29);
    });
  });

  describe('manageTenantLifecycle', () => {
    beforeEach(async () => {
      await multiTenancy.createTenantIsolation('lifecycle-tenant');
    });

    it('should suspend a tenant', async () => {
      const result = await multiTenancy.manageTenantLifecycle('lifecycle-tenant', 'suspend');
      
      expect(result.action).toBe('suspend');
      expect(result.result.status).toBe('suspended');
      expect(result.result.suspendedAt).toBeDefined();
      
      const tenant = multiTenancy.tenants.get('lifecycle-tenant');
      expect(tenant.status).toBe('suspended');
    });

    it('should resume a suspended tenant', async () => {
      await multiTenancy.manageTenantLifecycle('lifecycle-tenant', 'suspend');
      const result = await multiTenancy.manageTenantLifecycle('lifecycle-tenant', 'resume');
      
      expect(result.action).toBe('resume');
      expect(result.result.status).toBe('active');
      expect(result.result.resumedAt).toBeDefined();
      
      const tenant = multiTenancy.tenants.get('lifecycle-tenant');
      expect(tenant.status).toBe('active');
    });

    it('should throw error when resuming non-suspended tenant', async () => {
      await expect(multiTenancy.manageTenantLifecycle('lifecycle-tenant', 'resume'))
        .rejects.toThrow('Tenant is not suspended');
    });

    it('should schedule tenant for deletion with grace period', async () => {
      const result = await multiTenancy.manageTenantLifecycle('lifecycle-tenant', 'delete');
      
      expect(result.action).toBe('delete');
      expect(result.result.status).toBe('scheduled_for_deletion');
      expect(result.result.backupLocation).toBeDefined();
      expect(result.result.deletionDate).toBeDefined();
      
      // Verify tenant is removed from active tenants
      expect(multiTenancy.tenants.has('lifecycle-tenant')).toBe(false);
    });

    it('should upgrade tenant plan', async () => {
      const result = await multiTenancy.manageTenantLifecycle('lifecycle-tenant', 'upgrade');
      
      expect(result.action).toBe('upgrade');
      expect(result.result.status).toBe('upgraded');
      expect(result.result.newPlan).toBe('enterprise');
      expect(result.result.quotas.mcpServers).toBe(100);
    });

    it('should downgrade tenant plan', async () => {
      const result = await multiTenancy.manageTenantLifecycle('lifecycle-tenant', 'downgrade');
      
      expect(result.action).toBe('downgrade');
      expect(result.result.status).toBe('downgraded');
      expect(result.result.newPlan).toBe('standard');
      expect(result.result.quotas.mcpServers).toBe(20);
    });

    it('should throw error for invalid action', async () => {
      await expect(multiTenancy.manageTenantLifecycle('lifecycle-tenant', 'invalid-action'))
        .rejects.toThrow('Invalid lifecycle action: invalid-action');
    });

    it('should throw error for non-existent tenant', async () => {
      await expect(multiTenancy.manageTenantLifecycle('non-existent', 'suspend'))
        .rejects.toThrow('Tenant non-existent not found');
    });
  });

  describe('Helper methods', () => {
    it('should generate unique network segments', () => {
      const segment1 = multiTenancy._generateNetworkSegment('tenant-1');
      const segment2 = multiTenancy._generateNetworkSegment('tenant-2');
      
      expect(segment1).toMatch(/^10\.\d+\.0\.0\/24$/);
      expect(segment2).toMatch(/^10\.\d+\.0\.0\/24$/);
      expect(segment1).not.toBe(segment2);
    });

    it('should generate consistent network segments for same tenant', () => {
      const segment1 = multiTenancy._generateNetworkSegment('same-tenant');
      const segment2 = multiTenancy._generateNetworkSegment('same-tenant');
      
      expect(segment1).toBe(segment2);
    });
  });
});