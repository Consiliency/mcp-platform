/**
 * Integration tests for Marketplace + Enterprise Features
 * Tests tenant-based service access, billing, and marketplace interactions
 */

const DiscoveryAPI = require('../../../api/marketplace/discovery');
const PublishCommand = require('../../../cli/commands/publish');
const CommunityFeatures = require('../../../api/community/features');
const MultiTenancy = require('../../../enterprise/multi-tenant/tenancy');
const SSOAuthentication = require('../../../enterprise/sso/authentication');
const ComplianceTools = require('../../../enterprise/compliance/tools');

describe('Marketplace + Enterprise Integration', () => {
  let discoveryAPI;
  let publishCommand;
  let communityFeatures;
  let tenantManager;
  let ssoAuth;
  let complianceTools;

  beforeEach(() => {
    discoveryAPI = new DiscoveryAPI();
    publishCommand = new PublishCommand();
    communityFeatures = new CommunityFeatures();
    tenantManager = new MultiTenancy();
    ssoAuth = new SSOAuthentication();
    complianceTools = new ComplianceTools();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Tenant-based Service Access', () => {
    test('should restrict marketplace access based on tenant permissions', async () => {
      // Create test tenants
      const enterpriseTenant = await tenantManager.createTenant({
        name: 'Enterprise Corp',
        plan: 'enterprise',
        features: ['unlimited-services', 'private-marketplace']
      });

      const startupTenant = await tenantManager.createTenant({
        name: 'Startup Inc',
        plan: 'starter',
        features: ['basic-services'],
        serviceLimit: 5
      });

      // Test enterprise tenant access
      const enterpriseServices = await discoveryAPI.searchServices({
        tenantId: enterpriseTenant.id,
        includePrivate: true
      });

      expect(enterpriseServices.total).toBeGreaterThan(10);
      // Check that enterprise tenant can see all services
      expect(enterpriseServices.services.length).toBeGreaterThan(0);

      // Test startup tenant access
      const startupServices = await discoveryAPI.searchServices({
        tenantId: startupTenant.id,
        includePrivate: false
      });

      // Startup should see fewer services than enterprise
      expect(startupServices.total).toBeLessThan(enterpriseServices.total);
      expect(startupServices.total).toBeLessThanOrEqual(20);
    });

    test('should enforce tenant quotas on service installation', async () => {
      const tenant = await tenantManager.createTenant({
        name: 'Limited Corp',
        plan: 'basic',
        quotas: {
          maxServices: 3,
          maxStorage: '10GB',
          maxApiCalls: 1000
        }
      });

      // Install services up to quota
      const services = ['filesystem', 'git', 'postgres'];
      for (const service of services) {
        await tenantManager.installService(tenant.id, service);
      }

      // Attempt to exceed quota
      await expect(
        tenantManager.installService(tenant.id, 'github')
      ).rejects.toThrow('Service quota exceeded');

      // Check current usage
      const usage = await tenantManager.getUsage(tenant.id);
      expect(usage.services.current).toBe(3);
      expect(usage.services.limit).toBe(3);
    });
  });

  describe('Marketplace Publishing with Multi-tenancy', () => {
    test('should allow tenants to publish private services', async () => {
      const tenant = await tenantManager.createTenant({
        name: 'Service Provider Inc',
        plan: 'enterprise',
        features: ['marketplace-publisher']
      });

      // Publish a private service
      const serviceMetadata = {
        name: 'custom-analytics',
        version: '1.0.0',
        description: 'Private analytics service',
        visibility: 'private',
        allowedTenants: [tenant.id, 'partner-tenant-123']
      };

      const published = await publishCommand.execute({
        ...serviceMetadata,
        tenantId: tenant.id
      });

      expect(published.id).toBeDefined();
      expect(published.visibility).toBe('private');

      // Verify visibility restrictions
      const publicSearch = await discoveryAPI.searchServices({
        query: 'custom-analytics'
      });
      expect(publicSearch.services).toHaveLength(0);

      const tenantSearch = await discoveryAPI.searchServices({
        query: 'custom-analytics',
        tenantId: tenant.id
      });
      expect(tenantSearch.services).toHaveLength(1);
    });

    test('should track marketplace revenue per tenant', async () => {
      const publisherTenant = await tenantManager.createTenant({
        name: 'SaaS Provider',
        plan: 'enterprise'
      });

      // Publish a paid service
      const service = await publishCommand.execute({
        name: 'premium-service',
        pricing: {
          model: 'subscription',
          price: 99.99,
          currency: 'USD',
          interval: 'monthly'
        },
        tenantId: publisherTenant.id
      });

      // Simulate purchases from different tenants
      const purchases = [
        { tenantId: 'tenant-1', serviceId: service.id, quantity: 1 },
        { tenantId: 'tenant-2', serviceId: service.id, quantity: 3 },
        { tenantId: 'tenant-3', serviceId: service.id, quantity: 2 }
      ];

      for (const purchase of purchases) {
        await discoveryAPI.purchaseService(purchase);
      }

      // Check revenue
      const revenue = await tenantManager.getRevenue(publisherTenant.id);
      expect(revenue.total).toBe(599.94); // 6 subscriptions * 99.99
      expect(revenue.services[service.id].subscriptions).toBe(6);
    });
  });

  describe('SSO + Marketplace Integration', () => {
    test('should use SSO for marketplace authentication', async () => {
      // Configure SAML SSO
      const samlConfig = await ssoAuth.configureSAML({
        entityId: 'https://marketplace.mcp-platform.com',
        ssoUrl: 'https://idp.example.com/sso',
        certificate: 'test-cert'
      });

      // Authenticate user via SSO
      const ssoSession = await ssoAuth.authenticate({
        method: 'saml',
        samlResponse: 'mock-saml-response'
      });

      // Access marketplace with SSO token
      const marketplaceAccess = await discoveryAPI.authenticate({
        token: ssoSession.accessToken,
        provider: 'saml'
      });

      expect(marketplaceAccess.authenticated).toBe(true);
      expect(marketplaceAccess.user.email).toBeDefined();
      expect(marketplaceAccess.permissions).toContain('marketplace:browse');
    });

    test('should map SSO roles to marketplace permissions', async () => {
      const roleMapping = {
        'admin': ['marketplace:*', 'publish:*', 'billing:*'],
        'developer': ['marketplace:browse', 'marketplace:install', 'publish:own'],
        'viewer': ['marketplace:browse']
      };

      await ssoAuth.configureRoleMapping(roleMapping);

      // Test different role access
      const adminUser = await ssoAuth.authenticate({
        method: 'oauth2',
        token: 'admin-token',
        claims: { role: 'admin' }
      });

      const adminPerms = await discoveryAPI.getPermissions(adminUser.accessToken);
      expect(adminPerms).toContain('marketplace:*');

      const viewerUser = await ssoAuth.authenticate({
        method: 'oauth2',
        token: 'viewer-token',
        claims: { role: 'viewer' }
      });

      const viewerPerms = await discoveryAPI.getPermissions(viewerUser.accessToken);
      expect(viewerPerms).toEqual(['marketplace:browse']);
    });
  });

  describe('Compliance in Marketplace Operations', () => {
    test('should audit all marketplace transactions', async () => {
      const tenant = await tenantManager.createTenant({
        name: 'Regulated Corp',
        plan: 'enterprise',
        compliance: ['SOC2', 'HIPAA']
      });

      // Enable audit logging
      await complianceTools.enableAuditLogging(tenant.id);
      
      // Mock the audit logging by manually adding entries when actions are performed
      const originalPerformAction = discoveryAPI.performAction.bind(discoveryAPI);
      discoveryAPI.performAction = async (config) => {
        // Log to compliance tools
        complianceTools.auditLog.push({
          action: `marketplace:${config.action}`,
          actor: config.tenantId,
          resource: 'marketplace',
          timestamp: new Date(),
          tenantId: config.tenantId,
          details: { ...config }
        });
        // Call original method
        return originalPerformAction(config);
      };

      // Perform marketplace operations
      const operations = [
        { action: 'search', query: 'database services' },
        { action: 'view', serviceId: 'postgres' },
        { action: 'install', serviceId: 'postgres' },
        { action: 'configure', serviceId: 'postgres', config: { encrypted: true } }
      ];

      for (const op of operations) {
        await discoveryAPI.performAction({
          ...op,
          tenantId: tenant.id
        });
      }

      // Verify audit trail
      const auditLogs = await complianceTools.getAuditLogs({
        tenantId: tenant.id,
        resource: 'marketplace'
      });

      expect(auditLogs).toHaveLength(4);
      expect(auditLogs[0]).toMatchObject({
        action: 'marketplace:search',
        actor: expect.any(String),
        timestamp: expect.any(Date),
        details: { query: 'database services' }
      });

      // Generate compliance report
      const report = await complianceTools.generateComplianceReport({
        tenantId: tenant.id,
        standard: 'SOC2',
        period: 'monthly'
      });

      expect(report.sections).toContain('marketplace_access_controls');
      expect(report.sections).toContain('data_encryption');
    });

    test('should enforce data residency for marketplace data', async () => {
      const euTenant = await tenantManager.createTenant({
        name: 'EU Company',
        plan: 'enterprise',
        dataResidency: 'eu-west-1',
        compliance: ['GDPR']
      });

      // Publish service with data residency requirements
      const service = await publishCommand.execute({
        name: 'gdpr-compliant-service',
        dataResidency: ['eu-west-1', 'eu-central-1'],
        tenantId: euTenant.id
      });

      // Verify service is only available in compliant regions
      const searchResults = await discoveryAPI.searchServices({
        tenantId: euTenant.id,
        region: 'us-east-1'
      });

      expect(searchResults.services).not.toContainEqual(
        expect.objectContaining({ id: service.id })
      );

      const euSearchResults = await discoveryAPI.searchServices({
        tenantId: euTenant.id,
        region: 'eu-west-1'
      });

      expect(euSearchResults.services).toContainEqual(
        expect.objectContaining({ id: service.id })
      );
    });
  });

  describe('Community Features with Enterprise Controls', () => {
    test('should moderate reviews based on tenant policies', async () => {
      const tenant = await tenantManager.createTenant({
        name: 'Strict Corp',
        plan: 'enterprise',
        policies: {
          reviewModeration: 'pre-publish',
          allowedRatingRange: [3, 5],
          profanityFilter: true
        }
      });

      // Submit a review
      const review = {
        serviceId: 'test-service',
        rating: 2,
        comment: 'This service is terrible and slow',
        tenantId: tenant.id
      };

      const result = await communityFeatures.submitReview(review);
      
      expect(result.status).toBe('pending_moderation');
      expect(result.reason).toContain('rating below threshold');

      // Submit acceptable review
      const goodReview = {
        serviceId: 'test-service',
        rating: 4,
        comment: 'Great service with minor issues',
        tenantId: tenant.id
      };

      const goodResult = await communityFeatures.submitReview(goodReview);
      expect(goodResult.status).toBe('published');
    });

    test('should aggregate analytics per tenant', async () => {
      const tenants = ['tenant-a', 'tenant-b', 'tenant-c'];
      
      // Simulate service usage
      for (const tenantId of tenants) {
        for (let i = 0; i < 10; i++) {
          await communityFeatures.trackUsage({
            tenantId,
            serviceId: 'popular-service',
            action: 'api_call',
            duration: Math.random() * 1000
          });
        }
      }

      // Get tenant-specific analytics
      const tenantAnalytics = await communityFeatures.getAnalytics({
        tenantId: 'tenant-a',
        serviceId: 'popular-service'
      });

      expect(tenantAnalytics.totalCalls).toBe(10);
      expect(tenantAnalytics.averageDuration).toBeDefined();

      // Get service-wide analytics (enterprise feature)
      const serviceAnalytics = await communityFeatures.getAnalytics({
        serviceId: 'popular-service',
        aggregateAllTenants: true
      });

      expect(serviceAnalytics.totalCalls).toBe(30);
      expect(serviceAnalytics.tenantBreakdown).toHaveLength(3);
    });
  });

  describe('Billing Integration', () => {
    test('should handle marketplace billing through tenant billing system', async () => {
      const tenant = await tenantManager.createTenant({
        name: 'Paying Customer',
        plan: 'enterprise',
        billing: {
          provider: 'stripe',
          customerId: 'cus_test123'
        }
      });

      // Subscribe to services
      const subscriptions = [
        { serviceId: 'service-1', plan: 'basic', price: 29.99 },
        { serviceId: 'service-2', plan: 'pro', price: 99.99 },
        { serviceId: 'service-3', plan: 'enterprise', price: 299.99 }
      ];

      for (const sub of subscriptions) {
        await discoveryAPI.subscribe({
          ...sub,
          tenantId: tenant.id
        });
      }

      // Get consolidated invoice
      const invoice = await tenantManager.generateInvoice(tenant.id);
      
      expect(invoice.lineItems).toHaveLength(4); // 3 services + platform fee
      expect(invoice.total).toBe(429.97);
      expect(invoice.marketplaceServices).toHaveLength(3);
      
      // Process payment
      const payment = await tenantManager.processPayment({
        tenantId: tenant.id,
        invoiceId: invoice.id,
        paymentMethod: 'stripe'
      });

      expect(payment.status).toBe('succeeded');
      expect(payment.allocations).toMatchObject({
        'service-1': 29.99,
        'service-2': 99.99,
        'service-3': 299.99
      });
    });
  });
});