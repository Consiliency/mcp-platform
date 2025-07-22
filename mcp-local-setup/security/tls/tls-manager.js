/**
 * TLS Manager
 * Handles SSL/TLS certificate generation and management
 */

const CertificateGenerator = require('./certificate-generator');
const LetsEncryptIntegration = require('./lets-encrypt');
const CertificateStore = require('./certificate-store');

class TLSManager {
    constructor() {
        this.certGenerator = new CertificateGenerator();
        this.letsEncrypt = new LetsEncryptIntegration();
        this.certStore = new CertificateStore();
        this.renewalInterval = null;
    }

    async initialize() {
        await Promise.all([
            this.certStore.initialize(),
            this.letsEncrypt.initialize()
        ]);

        // Start certificate renewal check
        this.startRenewalCheck();
    }

    async cleanup() {
        if (this.renewalInterval) {
            clearInterval(this.renewalInterval);
            this.renewalInterval = null;
        }

        await this.certStore.cleanup();
    }

    /**
     * Generate SSL certificate
     */
    async generateCertificate(options) {
        const { domain, type } = options;

        if (type === 'self-signed') {
            return this.generateSelfSigned(domain, options);
        } else if (type === 'lets-encrypt') {
            return this.generateLetsEncrypt(domain, options);
        } else {
            throw new Error(`Unknown certificate type: ${type}`);
        }
    }

    /**
     * Generate self-signed certificate
     */
    async generateSelfSigned(domain, options) {
        const cert = await this.certGenerator.generateSelfSigned({
            commonName: domain,
            organizationName: options.organization || 'MCP Platform',
            countryName: options.country || 'US',
            stateName: options.state || 'CA',
            localityName: options.locality || 'San Francisco',
            validDays: options.validDays || 365
        });

        // Store certificate
        await this.certStore.store(domain, {
            type: 'self-signed',
            cert: cert.certificate,
            key: cert.privateKey,
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + (options.validDays || 365) * 24 * 60 * 60 * 1000)
        });

        return {
            certPath: await this.certStore.getCertPath(domain),
            keyPath: await this.certStore.getKeyPath(domain),
            expiresAt: cert.expiresAt
        };
    }

    /**
     * Generate Let's Encrypt certificate
     */
    async generateLetsEncrypt(domain, options) {
        // Check if we're in production environment
        if (process.env.NODE_ENV !== 'production') {
            console.warn('Let\'s Encrypt requires production environment. Generating self-signed certificate instead.');
            return this.generateSelfSigned(domain, options);
        }

        try {
            const cert = await this.letsEncrypt.obtainCertificate(domain, {
                email: options.email || process.env.LETSENCRYPT_EMAIL,
                staging: options.staging || false
            });

            // Store certificate
            await this.certStore.store(domain, {
                type: 'lets-encrypt',
                cert: cert.certificate,
                key: cert.privateKey,
                createdAt: new Date(),
                expiresAt: cert.expiresAt
            });

            return {
                certPath: await this.certStore.getCertPath(domain),
                keyPath: await this.certStore.getKeyPath(domain),
                expiresAt: cert.expiresAt
            };
        } catch (error) {
            console.error('Let\'s Encrypt certificate generation failed:', error);
            throw error;
        }
    }

    /**
     * Renew SSL certificate
     */
    async renewCertificate(domain) {
        const existing = await this.certStore.get(domain);
        if (!existing) {
            throw new Error(`No certificate found for domain: ${domain}`);
        }

        let newCert;
        if (existing.type === 'self-signed') {
            // Generate new self-signed certificate
            newCert = await this.generateSelfSigned(domain, {
                validDays: 365
            });
        } else if (existing.type === 'lets-encrypt') {
            // Renew Let's Encrypt certificate
            newCert = await this.letsEncrypt.renewCertificate(domain);
            
            // Store renewed certificate
            await this.certStore.store(domain, {
                type: 'lets-encrypt',
                cert: newCert.certificate,
                key: newCert.privateKey,
                createdAt: new Date(),
                expiresAt: newCert.expiresAt
            });
        }

        // Calculate next renewal date (30 days before expiry)
        const expiresAt = new Date(newCert.expiresAt);
        const nextRenewal = new Date(expiresAt.getTime() - 30 * 24 * 60 * 60 * 1000);

        return {
            domain,
            expiresAt,
            nextRenewal,
            renewed: true
        };
    }

    /**
     * Check if certificate needs renewal
     */
    async needsRenewal(domain) {
        const cert = await this.certStore.get(domain);
        if (!cert) {
            return false;
        }

        const now = new Date();
        const expiresAt = new Date(cert.expiresAt);
        const daysUntilExpiry = (expiresAt - now) / (1000 * 60 * 60 * 24);

        // Renew if less than 30 days until expiry
        return daysUntilExpiry < 30;
    }

    /**
     * Start certificate renewal check
     */
    startRenewalCheck() {
        // Check every 24 hours
        this.renewalInterval = setInterval(async () => {
            await this.checkAndRenewCertificates();
        }, 24 * 60 * 60 * 1000);

        // Also run initial check
        this.checkAndRenewCertificates();
    }

    /**
     * Check and renew certificates
     */
    async checkAndRenewCertificates() {
        const domains = await this.certStore.getAllDomains();

        for (const domain of domains) {
            try {
                if (await this.needsRenewal(domain)) {
                    console.log(`Renewing certificate for ${domain}`);
                    await this.renewCertificate(domain);
                }
            } catch (error) {
                console.error(`Failed to renew certificate for ${domain}:`, error);
            }
        }
    }

    /**
     * Get certificate info
     */
    async getCertificateInfo(domain) {
        const cert = await this.certStore.get(domain);
        if (!cert) {
            return null;
        }

        return {
            domain,
            type: cert.type,
            createdAt: cert.createdAt,
            expiresAt: cert.expiresAt,
            daysUntilExpiry: Math.ceil((new Date(cert.expiresAt) - new Date()) / (1000 * 60 * 60 * 24))
        };
    }

    /**
     * List all certificates
     */
    async listCertificates() {
        const domains = await this.certStore.getAllDomains();
        const certificates = [];

        for (const domain of domains) {
            const info = await this.getCertificateInfo(domain);
            if (info) {
                certificates.push(info);
            }
        }

        return certificates;
    }
}

module.exports = TLSManager;