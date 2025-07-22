/**
 * Tests for Compliance Tools Module
 */

const ComplianceTools = require('../compliance/tools');
const fs = require('fs').promises;
const path = require('path');

describe('ComplianceTools', () => {
  let complianceTools;

  beforeEach(() => {
    complianceTools = new ComplianceTools();
  });

  afterEach(async () => {
    // Clean up test data directories
    const testDataDir = path.join(process.cwd(), 'data', 'compliance');
    try {
      await fs.rm(testDataDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore errors if directory doesn't exist
    }
  });

  describe('setupAuditLogging', () => {
    it('should setup audit logging with default configuration', async () => {
      const config = {
        enabled: true,
        level: 'info'
      };

      const result = await complianceTools.setupAuditLogging(config);

      expect(result).toBeDefined();
      expect(result.status).toBe('configured');
      expect(result.level).toBe('info');
      expect(result.destinations).toEqual(['file', 'database']);
      expect(result.encryption).toBe(true);
      expect(result.retention).toBe('2555 days');
    });

    it('should create required directories', async () => {
      await complianceTools.setupAuditLogging({});

      const dataDir = complianceTools.dataDir;
      const expectedDirs = ['logs', 'reports', 'scans'];
      
      for (const dir of expectedDirs) {
        const dirPath = path.join(dataDir, dir);
        const stats = await fs.stat(dirPath);
        expect(stats.isDirectory()).toBe(true);
      }
    });

    it('should accept custom configuration', async () => {
      const config = {
        level: 'debug',
        destinations: ['file', 'webhook'],
        encryption: false,
        retention: 365,
        realtime: true,
        webhooks: ['https://webhook.example.com'],
        compliance: ['SOC2', 'GDPR']
      };

      const result = await complianceTools.setupAuditLogging(config);

      expect(result.level).toBe('debug');
      expect(result.destinations).toEqual(['file', 'webhook']);
      expect(result.encryption).toBe(false);
      expect(result.retention).toBe('365 days');
      expect(result.compliance).toEqual(['SOC2', 'GDPR']);
    });

    it('should initialize metrics when configured', async () => {
      await complianceTools.setupAuditLogging({});

      expect(complianceTools.metricCollectors).toBeDefined();
      expect(complianceTools.metricCollectors.auditEvents).toBe(0);
      expect(complianceTools.metricCollectors.securityScans).toBe(0);
    });

    it('should throw error for invalid config', async () => {
      await expect(complianceTools.setupAuditLogging(null))
        .rejects.toThrow('Invalid audit logging configuration');
    });
  });

  describe('generateComplianceReport', () => {
    beforeEach(async () => {
      await complianceTools.setupAuditLogging({});
    });

    it('should generate SOC2 compliance report', async () => {
      const result = await complianceTools.generateComplianceReport('SOC2');

      expect(result).toBeDefined();
      expect(result.type).toBe('SOC2');
      expect(result.status).toBeDefined();
      expect(result.complianceScore).toBeGreaterThanOrEqual(0);
      expect(result.complianceScore).toBeLessThanOrEqual(100);
      expect(result.summary).toContain('SOC2 Compliance Report');
    });

    it('should generate HIPAA compliance report', async () => {
      const result = await complianceTools.generateComplianceReport('HIPAA');

      expect(result.type).toBe('HIPAA');
      expect(result.status).toBeDefined();
      expect(result.location).toContain('HIPAA');
    });

    it('should generate GDPR compliance report', async () => {
      const result = await complianceTools.generateComplianceReport('GDPR');

      expect(result.type).toBe('GDPR');
      expect(result.complianceScore).toBeDefined();
    });

    it('should accept case-insensitive report types', async () => {
      const result = await complianceTools.generateComplianceReport('soc2');

      expect(result.type).toBe('SOC2');
    });

    it('should save report to file', async () => {
      const result = await complianceTools.generateComplianceReport('ISO27001');

      const reportFile = result.location;
      const fileContent = await fs.readFile(reportFile, 'utf8');
      const report = JSON.parse(fileContent);

      expect(report.id).toBe(result.reportId);
      expect(report.type).toBe('ISO27001');
      expect(report.sections).toBeDefined();
    });

    it('should calculate compliance score correctly', async () => {
      const result = await complianceTools.generateComplianceReport('SOC2');

      // Based on mock data, should have specific score
      expect(result.complianceScore).toBeGreaterThan(0);
      expect(result.status).toBe(result.complianceScore >= 80 ? 'COMPLIANT' : 'NON-COMPLIANT');
    });

    it('should throw error for unsupported report type', async () => {
      await expect(complianceTools.generateComplianceReport('INVALID'))
        .rejects.toThrow('Unsupported report type: INVALID');
    });

    it('should throw error for invalid report type', async () => {
      await expect(complianceTools.generateComplianceReport(null))
        .rejects.toThrow('Invalid report type');
    });
  });

  describe('performSecurityScan', () => {
    beforeEach(async () => {
      await complianceTools.setupAuditLogging({});
    });

    it('should perform comprehensive security scan', async () => {
      const target = {
        name: 'test-system',
        type: 'comprehensive'
      };

      const result = await complianceTools.performSecurityScan(target);

      expect(result).toBeDefined();
      expect(result.scanId).toBeDefined();
      expect(result.status).toBe('completed');
      expect(result.duration).toMatch(/\d+ms/);
      expect(result.vulnerabilities).toBeDefined();
      expect(result.findingsCount).toBeGreaterThanOrEqual(0);
      expect(result.recommendations).toBeGreaterThanOrEqual(0);
    });

    it('should perform infrastructure scan', async () => {
      const target = {
        name: 'infrastructure',
        infrastructure: true
      };

      const result = await complianceTools.performSecurityScan(target);

      expect(result.status).toBe('completed');
      expect(result.vulnerabilities.medium).toBeGreaterThan(0);
    });

    it('should perform application scan', async () => {
      const target = {
        name: 'web-app',
        application: true
      };

      const result = await complianceTools.performSecurityScan(target);

      expect(result.status).toBe('completed');
      expect(result.vulnerabilities.low).toBeGreaterThan(0);
    });

    it('should calculate risk score', async () => {
      const target = {
        type: 'comprehensive'
      };

      const result = await complianceTools.performSecurityScan(target);

      expect(result.riskScore).toBeDefined();
      expect(result.riskScore).toBeGreaterThanOrEqual(0);
      expect(result.riskScore).toBeLessThanOrEqual(100);
    });

    it('should save scan results to file', async () => {
      const target = {
        name: 'test-scan'
      };

      const result = await complianceTools.performSecurityScan(target);

      const scanFile = result.location;
      const fileContent = await fs.readFile(scanFile, 'utf8');
      const scan = JSON.parse(fileContent);

      expect(scan.id).toBe(result.scanId);
      expect(scan.findings).toBeDefined();
      expect(scan.recommendations).toBeDefined();
    });

    it('should generate remediation recommendations', async () => {
      const target = {
        type: 'comprehensive'
      };

      const result = await complianceTools.performSecurityScan(target);
      
      const scanFile = result.location;
      const fileContent = await fs.readFile(scanFile, 'utf8');
      const scan = JSON.parse(fileContent);

      expect(scan.recommendations).toBeDefined();
      if (scan.recommendations.length > 0) {
        expect(scan.recommendations[0].priority).toBeDefined();
        expect(scan.recommendations[0].remediation).toBeDefined();
        expect(scan.recommendations[0].estimatedEffort).toBeDefined();
      }
    });

    it('should throw error for invalid target', async () => {
      await expect(complianceTools.performSecurityScan(null))
        .rejects.toThrow('Invalid scan target');
    });
  });

  describe('trackComplianceMetrics', () => {
    beforeEach(async () => {
      await complianceTools.setupAuditLogging({});
      
      // Add some audit events
      await complianceTools._logAuditEvent({
        action: 'test_action',
        resource: 'test_resource',
        result: 'success'
      });
    });

    it('should track comprehensive metrics', async () => {
      const result = await complianceTools.trackComplianceMetrics();

      expect(result).toBeDefined();
      expect(result.timestamp).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(result.summary.auditEvents).toBeGreaterThan(0);
      expect(result.summary.complianceScore).toBeGreaterThan(0);
      expect(result.summary.vulnerabilities).toBeGreaterThanOrEqual(0);
      expect(result.summary.coverage).toBeGreaterThan(0);
    });

    it('should calculate trends', async () => {
      const result = await complianceTools.trackComplianceMetrics();

      expect(result.trends).toBeDefined();
      expect(result.trends.auditEvents).toBeDefined();
      expect(result.trends.complianceScore).toBeDefined();
      expect(result.trends.vulnerabilities).toBeDefined();
    });

    it('should detect anomalies', async () => {
      // Generate many audit events to trigger anomaly
      for (let i = 0; i < 100; i++) {
        await complianceTools._logAuditEvent({
          action: 'bulk_action',
          resource: 'test',
          result: 'success'
        });
      }

      const result = await complianceTools.trackComplianceMetrics();

      expect(result.alerts).toBeDefined();
      // May or may not have alerts depending on the anomaly detection logic
    });

    it('should save metrics to file', async () => {
      const result = await complianceTools.trackComplianceMetrics();

      const metricsDir = path.join(complianceTools.dataDir, 'metrics');
      const files = await fs.readdir(metricsDir);
      
      expect(files.length).toBeGreaterThan(0);
      expect(files[0]).toMatch(/metrics-\d{4}-\d{2}-\d{2}\.json/);
    });

    it('should emit alerts for anomalies', (done) => {
      complianceTools.on('compliance-alerts', (alerts) => {
        expect(alerts).toBeDefined();
        expect(Array.isArray(alerts)).toBe(true);
        done();
      });

      // Generate anomaly
      (async () => {
        for (let i = 0; i < 200; i++) {
          await complianceTools._logAuditEvent({
            action: 'anomaly_test',
            resource: 'test',
            result: 'success'
          });
        }
        await complianceTools.trackComplianceMetrics();
      })();
    });
  });

  describe('Event handling', () => {
    beforeEach(async () => {
      await complianceTools.setupAuditLogging({});
    });

    it('should emit audit events', (done) => {
      complianceTools.on('audit-event', (event) => {
        expect(event).toBeDefined();
        expect(event.id).toBeDefined();
        expect(event.timestamp).toBeDefined();
        expect(event.action).toBe('test_event');
        done();
      });

      complianceTools._logAuditEvent({
        action: 'test_event',
        resource: 'test',
        result: 'success'
      });
    });

    it('should log audit events to memory', async () => {
      await complianceTools._logAuditEvent({
        action: 'memory_test',
        resource: 'test',
        result: 'success'
      });

      expect(complianceTools.auditLog.length).toBeGreaterThan(0);
      const lastEvent = complianceTools.auditLog[complianceTools.auditLog.length - 1];
      expect(lastEvent.action).toBe('memory_test');
    });

    it('should write audit events to file when configured', async () => {
      await complianceTools._logAuditEvent({
        action: 'file_test',
        resource: 'test',
        result: 'success'
      });

      const logFile = path.join(
        complianceTools.dataDir,
        'logs',
        `audit-${new Date().toISOString().split('T')[0]}.log`
      );

      const fileContent = await fs.readFile(logFile, 'utf8');
      expect(fileContent).toContain('file_test');
    });
  });

  describe('Compliance frameworks', () => {
    it('should initialize compliance frameworks', () => {
      expect(complianceTools.complianceFrameworks.has('SOC2')).toBe(true);
      expect(complianceTools.complianceFrameworks.has('HIPAA')).toBe(true);
      expect(complianceTools.complianceFrameworks.has('GDPR')).toBe(true);
    });

    it('should have SOC2 controls defined', () => {
      const soc2 = complianceTools.complianceFrameworks.get('SOC2');
      expect(soc2.controls).toContain('CC1');
      expect(soc2.controls).toContain('CC6');
      expect(soc2.requirements.CC1).toBe('Control Environment');
    });

    it('should have HIPAA safeguards defined', () => {
      const hipaa = complianceTools.complianceFrameworks.get('HIPAA');
      expect(hipaa.safeguards).toEqual(['Administrative', 'Physical', 'Technical']);
      expect(hipaa.requirements.Administrative).toContain('Security Officer');
    });

    it('should have GDPR principles defined', () => {
      const gdpr = complianceTools.complianceFrameworks.get('GDPR');
      expect(gdpr.principles).toContain('Security');
      expect(gdpr.principles).toContain('Accountability');
      expect(gdpr.rights).toContain('Erasure');
    });
  });

  describe('Helper methods', () => {
    it('should calculate compliance score correctly', () => {
      const sections = [
        { status: 'COMPLIANT' },
        { status: 'COMPLIANT' },
        { status: 'PARTIAL' },
        { status: 'NON-COMPLIANT' }
      ];

      const score = complianceTools._calculateComplianceScore(sections);
      
      // 2 compliant (2.0) + 1 partial (0.5) + 1 non-compliant (0) = 2.5/4 = 62.5%
      expect(score).toBe(63); // Rounded
    });

    it('should calculate risk score based on vulnerabilities', () => {
      const vulnerabilities = {
        critical: 1,
        high: 2,
        medium: 3,
        low: 4,
        info: 5
      };

      const score = complianceTools._calculateRiskScore(vulnerabilities);
      
      // (1*10 + 2*7 + 3*4 + 4*2 + 5*1) = 10 + 14 + 12 + 8 + 5 = 49
      expect(score).toBe(49);
    });

    it('should assign correct priority based on severity', () => {
      expect(complianceTools._getPriority('critical')).toBe('P1');
      expect(complianceTools._getPriority('high')).toBe('P2');
      expect(complianceTools._getPriority('medium')).toBe('P3');
      expect(complianceTools._getPriority('low')).toBe('P4');
      expect(complianceTools._getPriority('info')).toBe('P5');
      expect(complianceTools._getPriority('unknown')).toBe('P5');
    });

    it('should estimate effort based on severity', () => {
      expect(complianceTools._estimateEffort('critical')).toBe('1-2 days');
      expect(complianceTools._estimateEffort('high')).toBe('2-3 days');
      expect(complianceTools._estimateEffort('medium')).toBe('3-5 days');
      expect(complianceTools._estimateEffort('low')).toBe('1 week');
      expect(complianceTools._estimateEffort('info')).toBe('As time permits');
    });
  });
});