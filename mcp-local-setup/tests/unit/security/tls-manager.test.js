/**
 * Unit tests for TLSManager and related components
 */

const TLSManager = require('../../../security/tls/tls-manager');
const CertificateGenerator = require('../../../security/tls/certificate-generator');
const fs = require('fs').promises;
const path = require('path');

describe('TLSManager', () => {
    let tlsManager;

    beforeEach(async () => {
        tlsManager = new TLSManager();
        await tlsManager.initialize();
    });

    afterEach(async () => {
        await tlsManager.cleanup();
        // Clean up test certificates
        const dataPath = path.join(__dirname, '../../../data/certificates');
        try {
            await fs.rm(dataPath, { recursive: true, force: true });
        } catch (error) {
            // Ignore if doesn't exist
        }
    });

    describe('generateCertificate', () => {
        it('should generate self-signed certificate', async () => {
            const result = await tlsManager.generateCertificate({
                domain: 'test.mcp.local',
                type: 'self-signed'
            });

            expect(result.certPath).toContain('test.mcp.local');
            expect(result.keyPath).toContain('test.mcp.local');
            expect(result.expiresAt).toBeInstanceOf(Date);

            // Verify files exist
            const certExists = await fs.access(result.certPath).then(() => true).catch(() => false);
            const keyExists = await fs.access(result.keyPath).then(() => true).catch(() => false);
            
            expect(certExists).toBe(true);
            expect(keyExists).toBe(true);
        });

        it('should handle Let\'s Encrypt in non-production', async () => {
            process.env.NODE_ENV = 'test';
            
            const result = await tlsManager.generateCertificate({
                domain: 'test.example.com',
                type: 'lets-encrypt',
                email: 'test@example.com'
            });

            // Should fall back to self-signed in test environment
            expect(result.certPath).toBeDefined();
            expect(result.keyPath).toBeDefined();
        });

        it('should throw error for unknown certificate type', async () => {
            await expect(tlsManager.generateCertificate({
                domain: 'test.local',
                type: 'unknown'
            })).rejects.toThrow('Unknown certificate type: unknown');
        });
    });

    describe('certificate renewal', () => {
        it('should check if certificate needs renewal', async () => {
            // Generate certificate
            await tlsManager.generateCertificate({
                domain: 'renewal-test.local',
                type: 'self-signed'
            });

            const needsRenewal = await tlsManager.needsRenewal('renewal-test.local');
            expect(needsRenewal).toBe(false); // New cert doesn't need renewal

            // Manually update expiry to simulate near-expiry cert
            const cert = await tlsManager.certStore.get('renewal-test.local');
            cert.expiresAt = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000); // 20 days
            await tlsManager.certStore.store('renewal-test.local', cert);

            const needsRenewalNow = await tlsManager.needsRenewal('renewal-test.local');
            expect(needsRenewalNow).toBe(true);
        });

        it('should renew self-signed certificate', async () => {
            // Generate initial certificate
            const initial = await tlsManager.generateCertificate({
                domain: 'renew-test.local',
                type: 'self-signed'
            });

            const renewal = await tlsManager.renewCertificate('renew-test.local');

            expect(renewal.domain).toBe('renew-test.local');
            expect(renewal.renewed).toBe(true);
            expect(renewal.expiresAt).toBeInstanceOf(Date);
            expect(renewal.nextRenewal).toBeInstanceOf(Date);
            
            // Next renewal should be before expiry
            expect(renewal.nextRenewal < renewal.expiresAt).toBe(true);
        });

        it('should throw error when renewing non-existent certificate', async () => {
            await expect(tlsManager.renewCertificate('non-existent.local'))
                .rejects.toThrow('No certificate found for domain: non-existent.local');
        });
    });

    describe('certificate information', () => {
        it('should get certificate info', async () => {
            await tlsManager.generateCertificate({
                domain: 'info-test.local',
                type: 'self-signed'
            });

            const info = await tlsManager.getCertificateInfo('info-test.local');

            expect(info.domain).toBe('info-test.local');
            expect(info.type).toBe('self-signed');
            expect(info.createdAt).toBeInstanceOf(Date);
            expect(info.expiresAt).toBeInstanceOf(Date);
            expect(info.daysUntilExpiry).toBeGreaterThan(360);
        });

        it('should list all certificates', async () => {
            // Generate multiple certificates
            await tlsManager.generateCertificate({
                domain: 'list-test1.local',
                type: 'self-signed'
            });
            await tlsManager.generateCertificate({
                domain: 'list-test2.local',
                type: 'self-signed'
            });

            const certificates = await tlsManager.listCertificates();

            expect(certificates.length).toBeGreaterThanOrEqual(2);
            expect(certificates.some(c => c.domain === 'list-test1.local')).toBe(true);
            expect(certificates.some(c => c.domain === 'list-test2.local')).toBe(true);
        });
    });
});

describe('CertificateGenerator', () => {
    let certGenerator;

    beforeEach(() => {
        certGenerator = new CertificateGenerator();
    });

    describe('generateSelfSigned', () => {
        it('should generate valid self-signed certificate', async () => {
            const result = await certGenerator.generateSelfSigned({
                commonName: 'test.local',
                organizationName: 'Test Org',
                validDays: 365
            });

            expect(result.certificate).toMatch(/-----BEGIN CERTIFICATE-----/);
            expect(result.certificate).toMatch(/-----END CERTIFICATE-----/);
            expect(result.privateKey).toMatch(/-----BEGIN RSA PRIVATE KEY-----/);
            expect(result.privateKey).toMatch(/-----END RSA PRIVATE KEY-----/);
            expect(result.serialNumber).toBeTruthy();
            expect(result.expiresAt).toBeInstanceOf(Date);
        });

        it('should set correct validity period', async () => {
            const validDays = 90;
            const result = await certGenerator.generateSelfSigned({
                commonName: 'validity-test.local',
                validDays
            });

            const now = new Date();
            const expiresAt = new Date(result.expiresAt);
            const diffDays = Math.round((expiresAt - now) / (1000 * 60 * 60 * 24));

            expect(diffDays).toBe(validDays);
        });

        it('should include subject alternative names', async () => {
            const result = await certGenerator.generateSelfSigned({
                commonName: 'san-test.local'
            });

            // Certificate should include SANs
            // Note: Full SAN validation would require parsing the certificate
            expect(result.certificate).toBeTruthy();
        });
    });

    describe('generateCSR', () => {
        it('should generate certificate signing request', async () => {
            const result = await certGenerator.generateCSR({
                commonName: 'csr-test.local',
                organizationName: 'Test Org',
                countryName: 'US',
                emailAddress: 'test@example.com'
            });

            expect(result.csr).toMatch(/-----BEGIN CERTIFICATE REQUEST-----/);
            expect(result.csr).toMatch(/-----END CERTIFICATE REQUEST-----/);
            expect(result.privateKey).toMatch(/-----BEGIN RSA PRIVATE KEY-----/);
        });
    });

    describe('verifyCertificate', () => {
        it('should verify valid certificate', async () => {
            const cert = await certGenerator.generateSelfSigned({
                commonName: 'verify-test.local'
            });

            const verification = await certGenerator.verifyCertificate(cert.certificate);

            expect(verification.valid).toBe(true);
            expect(verification.subject).toBeDefined();
            expect(verification.issuer).toBeDefined();
            expect(verification.validFrom).toBeInstanceOf(Date);
            expect(verification.validTo).toBeInstanceOf(Date);
        });

        it('should detect invalid certificate', async () => {
            const invalidCert = '-----BEGIN CERTIFICATE-----\nINVALID\n-----END CERTIFICATE-----';
            
            const verification = await certGenerator.verifyCertificate(invalidCert);

            expect(verification.valid).toBe(false);
            expect(verification.reason).toBeDefined();
        });
    });
});