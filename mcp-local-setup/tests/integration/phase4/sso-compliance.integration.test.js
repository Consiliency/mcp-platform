/**
 * Integration tests for SSO + Compliance
 * Tests authentication audit trails, compliance reporting, and security controls
 */

const SSOAuthentication = require('../../../enterprise/sso/authentication');
const ComplianceTools = require('../../../enterprise/compliance/tools');
const TenantManager = require('../../../enterprise/multi-tenant/tenancy');
const LoggingService = require('../../../monitoring/logging/service');
const AlertingSystem = require('../../../monitoring/alerts/alerting');

describe('SSO + Compliance Integration', () => {
  let ssoAuth;
  let complianceTools;
  let tenantManager;
  let loggingService;
  let alertingSystem;

  beforeEach(() => {
    ssoAuth = new SSOAuthentication();
    complianceTools = new ComplianceTools();
    tenantManager = new TenantManager();
    loggingService = new LoggingService();
    alertingSystem = new AlertingSystem();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Authentication Audit Trail', () => {
    test('should create comprehensive audit logs for all authentication events', async () => {
      const tenant = await tenantManager.createTenant({
        name: 'Secure Corp',
        plan: 'enterprise',
        compliance: ['SOC2', 'ISO27001']
      });

      // Enable compliance logging
      await complianceTools.enableAuditLogging(tenant.id);

      // Configure SAML SSO
      await ssoAuth.configureSAML({
        tenantId: tenant.id,
        entityId: 'https://secure-corp.example.com',
        ssoUrl: 'https://idp.secure-corp.com/sso',
        certificate: 'test-cert'
      });

      // Perform authentication attempts
      const authEvents = [
        { success: true, method: 'saml', user: 'john.doe@secure-corp.com' },
        { success: false, method: 'saml', user: 'invalid@secure-corp.com', reason: 'invalid_credentials' },
        { success: true, method: 'oauth2', user: 'jane.smith@secure-corp.com' },
        { success: false, method: 'oauth2', user: 'blocked@secure-corp.com', reason: 'account_locked' }
      ];

      for (const event of authEvents) {
        if (event.success) {
          await ssoAuth.authenticate({
            method: event.method,
            email: event.user,
            tenantId: tenant.id
          });
        } else {
          await expect(ssoAuth.authenticate({
            method: event.method,
            email: event.user,
            tenantId: tenant.id
          })).rejects.toThrow();
        }
      }

      // Verify audit logs
      const auditLogs = await complianceTools.getAuditLogs({
        tenantId: tenant.id,
        resource: 'authentication',
        timeRange: { minutes: 5 }
      });

      expect(auditLogs).toHaveLength(4);
      
      // Check successful login audit
      const successLog = auditLogs.find(log => 
        log.action === 'auth:login:success' && 
        log.details.user === 'john.doe@secure-corp.com'
      );
      expect(successLog).toMatchObject({
        action: 'auth:login:success',
        actor: 'john.doe@secure-corp.com',
        resource: 'sso:saml',
        ip_address: expect.any(String),
        user_agent: expect.any(String),
        session_id: expect.any(String)
      });

      // Check failed login audit
      const failedLog = auditLogs.find(log => 
        log.action === 'auth:login:failed' && 
        log.details.reason === 'invalid_credentials'
      );
      expect(failedLog).toBeDefined();
      expect(failedLog.risk_score).toBeGreaterThan(0);
    });

    test('should detect and alert on suspicious authentication patterns', async () => {
      const tenant = await tenantManager.createTenant({
        name: 'Alert Corp',
        compliance: ['SOC2']
      });

      // Setup alert rules for authentication
      await alertingSystem.createRule({
        name: 'multiple-failed-logins',
        type: 'authentication',
        condition: 'failed_login_count > 5',
        window: '5m',
        action: 'alert',
        channels: ['security-team']
      });

      const alertChannel = {
        type: 'email',
        send: jest.fn()
      };
      await alertingSystem.addChannel('security-team', alertChannel);

      // Simulate brute force attempt
      const attacker = 'attacker@example.com';
      for (let i = 0; i < 6; i++) {
        try {
          await ssoAuth.authenticate({
            method: 'oauth2',
            email: attacker,
            password: `wrong-password-${i}`,
            tenantId: tenant.id
          });
        } catch (e) {
          // Expected failures
        }
      }

      // Check if alert was triggered
      expect(alertChannel.send).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'critical',
          title: 'Multiple Failed Login Attempts',
          details: expect.objectContaining({
            user: attacker,
            attempts: 6
          })
        })
      );

      // Verify security event in audit log
      const securityEvents = await complianceTools.getSecurityEvents({
        tenantId: tenant.id,
        severity: 'critical'
      });

      expect(securityEvents).toContainEqual(
        expect.objectContaining({
          type: 'brute_force_attempt',
          actor: attacker
        })
      );
    });
  });

  describe('Compliance Reporting for Authentication', () => {
    test('should generate SOC2 authentication controls report', async () => {
      const tenant = await tenantManager.createTenant({
        name: 'SOC2 Company',
        compliance: ['SOC2']
      });

      // Configure authentication methods
      await ssoAuth.configureSAML({ tenantId: tenant.id });
      await ssoAuth.configureOAuth2({ tenantId: tenant.id });
      await ssoAuth.configureMFA({
        tenantId: tenant.id,
        required: true,
        methods: ['totp', 'sms']
      });

      // Generate SOC2 report section
      const report = await complianceTools.generateComplianceReport({
        tenantId: tenant.id,
        standard: 'SOC2',
        sections: ['CC6.1_logical_access_controls']
      });

      expect(report.sections.CC6_1).toMatchObject({
        title: 'Logical and Physical Access Controls',
        controls: expect.arrayContaining([
          expect.objectContaining({
            id: 'CC6.1.1',
            description: 'Multi-factor authentication',
            status: 'implemented',
            evidence: expect.arrayContaining(['MFA required for all users'])
          }),
          expect.objectContaining({
            id: 'CC6.1.2',
            description: 'Single Sign-On (SSO)',
            status: 'implemented',
            evidence: expect.arrayContaining(['SAML 2.0', 'OAuth 2.0'])
          })
        ])
      });

      expect(report.overall_compliance).toBeGreaterThan(90);
    });

    test('should track authentication metrics for compliance', async () => {
      const tenant = await tenantManager.createTenant({
        name: 'Metrics Corp',
        compliance: ['ISO27001']
      });

      // Simulate various authentication events over time
      const now = Date.now();
      const events = [
        { time: now - 86400000, success: true, mfa: true },
        { time: now - 82800000, success: true, mfa: false },
        { time: now - 79200000, success: false, mfa: false },
        { time: now - 75600000, success: true, mfa: true },
        { time: now - 72000000, success: true, mfa: true }
      ];

      for (const event of events) {
        jest.spyOn(Date, 'now').mockReturnValue(event.time);
        
        if (event.success) {
          await ssoAuth.authenticate({
            tenantId: tenant.id,
            method: 'saml',
            mfaUsed: event.mfa
          });
        }
      }

      // Get compliance metrics
      const metrics = await complianceTools.getAuthenticationMetrics({
        tenantId: tenant.id,
        period: '24h'
      });

      expect(metrics).toMatchObject({
        total_authentications: 4,
        successful_authentications: 4,
        failed_authentications: 0,
        mfa_adoption_rate: 75, // 3 out of 4 successful auths used MFA
        unique_users: expect.any(Number),
        average_session_duration: expect.any(Number)
      });

      // Check compliance status
      const complianceStatus = await complianceTools.checkCompliance({
        tenantId: tenant.id,
        requirements: {
          mfa_adoption_threshold: 70,
          max_failed_login_rate: 20
        }
      });

      expect(complianceStatus.compliant).toBe(true);
      expect(complianceStatus.metrics.mfa_adoption).toMatchObject({
        current: 75,
        required: 70,
        status: 'pass'
      });
    });
  });

  describe('Data Privacy and Authentication', () => {
    test('should handle GDPR-compliant authentication logging', async () => {
      const tenant = await tenantManager.createTenant({
        name: 'EU Company',
        compliance: ['GDPR'],
        dataResidency: 'eu-west-1'
      });

      // Configure GDPR-compliant logging
      await complianceTools.configurePrivacy({
        tenantId: tenant.id,
        settings: {
          anonymize_ip: true,
          retention_days: 90,
          encrypt_pii: true,
          user_consent_required: true
        }
      });

      // Authenticate with user consent
      const authResult = await ssoAuth.authenticate({
        tenantId: tenant.id,
        method: 'oauth2',
        email: 'user@eu-company.com',
        consent: {
          logging: true,
          analytics: false
        }
      });

      // Verify anonymized logging
      const logs = await complianceTools.getAuditLogs({
        tenantId: tenant.id,
        userId: authResult.userId
      });

      const authLog = logs[0];
      expect(authLog.ip_address).toMatch(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.xxx$/); // IP anonymized
      expect(authLog.email_hash).toBeDefined();
      expect(authLog.email).toBeUndefined(); // PII removed
      expect(authLog.gdpr_consent).toBe(true);

      // Test right to erasure
      await complianceTools.eraseUserData({
        tenantId: tenant.id,
        userId: authResult.userId,
        reason: 'user_request'
      });

      const erasedLogs = await complianceTools.getAuditLogs({
        tenantId: tenant.id,
        userId: authResult.userId
      });

      expect(erasedLogs).toHaveLength(0);
    });

    test('should enforce data residency for authentication data', async () => {
      const tenants = [
        { name: 'US Corp', region: 'us-east-1', compliance: ['HIPAA'] },
        { name: 'EU Corp', region: 'eu-west-1', compliance: ['GDPR'] },
        { name: 'APAC Corp', region: 'ap-southeast-1', compliance: ['PDPA'] }
      ];

      for (const config of tenants) {
        const tenant = await tenantManager.createTenant({
          ...config,
          dataResidency: config.region
        });

        // Verify authentication data storage location
        const authData = await ssoAuth.authenticate({
          tenantId: tenant.id,
          method: 'saml'
        });

        const dataLocation = await complianceTools.getDataLocation({
          tenantId: tenant.id,
          dataType: 'authentication',
          recordId: authData.sessionId
        });

        expect(dataLocation.region).toBe(config.region);
        expect(dataLocation.encrypted).toBe(true);
      }
    });
  });

  describe('Security Scanning and Authentication', () => {
    test('should perform security scans on authentication configuration', async () => {
      const tenant = await tenantManager.createTenant({
        name: 'Security Focused',
        compliance: ['SOC2', 'ISO27001']
      });

      // Configure authentication with various security levels
      await ssoAuth.configureSAML({
        tenantId: tenant.id,
        signatureAlgorithm: 'sha1', // Weak algorithm
        encryptAssertions: false
      });

      await ssoAuth.configureOAuth2({
        tenantId: tenant.id,
        allowImplicitFlow: true, // Security risk
        tokenExpiry: 86400 // 24 hours - too long
      });

      // Run security scan
      const scanResults = await complianceTools.runSecurityScan({
        tenantId: tenant.id,
        scanType: 'authentication'
      });

      expect(scanResults.vulnerabilities).toContainEqual(
        expect.objectContaining({
          severity: 'high',
          type: 'weak_signature_algorithm',
          resource: 'saml_configuration',
          recommendation: 'Use SHA-256 or stronger'
        })
      );

      expect(scanResults.vulnerabilities).toContainEqual(
        expect.objectContaining({
          severity: 'medium',
          type: 'implicit_flow_enabled',
          resource: 'oauth2_configuration',
          recommendation: 'Disable implicit flow, use PKCE'
        })
      );

      expect(scanResults.score).toBeLessThan(70); // Poor security score
    });

    test('should enforce authentication best practices', async () => {
      const tenant = await tenantManager.createTenant({
        name: 'Best Practices Inc',
        compliance: ['SOC2'],
        securityLevel: 'high'
      });

      // Try to configure weak authentication
      await expect(ssoAuth.configureSAML({
        tenantId: tenant.id,
        signatureAlgorithm: 'sha1'
      })).rejects.toThrow('SHA-1 not allowed for high security tenants');

      // Configure strong authentication
      const strongConfig = await ssoAuth.configureSAML({
        tenantId: tenant.id,
        signatureAlgorithm: 'sha256',
        encryptAssertions: true,
        requireSignedRequests: true
      });

      expect(strongConfig.securityScore).toBeGreaterThan(90);

      // Verify password policy enforcement
      const passwordPolicy = await ssoAuth.getPasswordPolicy(tenant.id);
      expect(passwordPolicy).toMatchObject({
        minLength: 12,
        requireUppercase: true,
        requireNumbers: true,
        requireSpecialChars: true,
        preventReuse: 12,
        maxAge: 90
      });
    });
  });

  describe('Incident Response Integration', () => {
    test('should trigger incident response for authentication breaches', async () => {
      const tenant = await tenantManager.createTenant({
        name: 'Incident Ready Corp',
        compliance: ['SOC2', 'ISO27001']
      });

      // Configure incident response
      const incidentHandlers = {
        email: jest.fn(),
        slack: jest.fn(),
        pagerduty: jest.fn()
      };

      await complianceTools.configureIncidentResponse({
        tenantId: tenant.id,
        handlers: incidentHandlers,
        escalationPolicy: {
          critical: ['pagerduty', 'email', 'slack'],
          high: ['email', 'slack'],
          medium: ['email']
        }
      });

      // Simulate security incident - credential stuffing attack
      const stolenCredentials = [
        { email: 'user1@company.com', password: 'stolen123' },
        { email: 'user2@company.com', password: 'leaked456' },
        { email: 'user3@company.com', password: 'breach789' }
      ];

      // Multiple successful logins from different IPs
      for (const cred of stolenCredentials) {
        for (let i = 0; i < 3; i++) {
          await ssoAuth.authenticate({
            ...cred,
            tenantId: tenant.id,
            ip: `192.168.${i}.${Math.floor(Math.random() * 255)}`
          });
        }
      }

      // Check incident creation
      expect(incidentHandlers.pagerduty).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'critical',
          type: 'credential_stuffing_detected',
          affected_users: 3,
          suspicious_ips: expect.any(Array)
        })
      );

      // Verify automated response
      const response = await complianceTools.getIncidentResponse(tenant.id);
      expect(response.actions_taken).toContain('force_password_reset');
      expect(response.actions_taken).toContain('revoke_all_sessions');
      expect(response.actions_taken).toContain('enable_mfa_requirement');
    });
  });
});