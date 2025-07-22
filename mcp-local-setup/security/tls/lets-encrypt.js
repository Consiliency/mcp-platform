/**
 * Let's Encrypt Integration
 * Handles Let's Encrypt certificate generation and renewal
 */

const acme = require('acme-client');
const fs = require('fs').promises;
const path = require('path');

class LetsEncryptIntegration {
    constructor() {
        this.accountKeyPath = path.join(__dirname, '../../data/lets-encrypt/account.key');
        this.client = null;
        this.account = null;
    }

    async initialize() {
        // Ensure data directory exists
        const dataDir = path.dirname(this.accountKeyPath);
        await fs.mkdir(dataDir, { recursive: true });

        // Load or create account key
        await this.loadOrCreateAccountKey();
    }

    /**
     * Load or create ACME account key
     */
    async loadOrCreateAccountKey() {
        try {
            const keyPem = await fs.readFile(this.accountKeyPath, 'utf8');
            this.accountKey = keyPem;
        } catch (error) {
            if (error.code === 'ENOENT') {
                // Generate new account key
                const key = await acme.forge.createPrivateKey();
                this.accountKey = key;
                await fs.writeFile(this.accountKeyPath, key);
            } else {
                throw error;
            }
        }
    }

    /**
     * Get ACME client
     */
    async getClient(staging = false) {
        if (!this.client) {
            const directoryUrl = staging
                ? acme.directory.letsencrypt.staging
                : acme.directory.letsencrypt.production;

            this.client = new acme.Client({
                directoryUrl,
                accountKey: this.accountKey
            });
        }

        return this.client;
    }

    /**
     * Create or get ACME account
     */
    async getAccount(email) {
        if (!this.account) {
            const client = await this.getClient();
            
            try {
                // Try to find existing account
                this.account = await client.getAccount();
            } catch (error) {
                // Create new account
                this.account = await client.createAccount({
                    termsOfServiceAgreed: true,
                    contact: [`mailto:${email}`]
                });
            }
        }

        return this.account;
    }

    /**
     * Obtain certificate from Let's Encrypt
     */
    async obtainCertificate(domain, options = {}) {
        const { email, staging = false } = options;

        if (!email) {
            throw new Error('Email is required for Let\'s Encrypt');
        }

        try {
            const client = await this.getClient(staging);
            const account = await this.getAccount(email);

            // Create CSR
            const [key, csr] = await acme.forge.createCsr({
                commonName: domain,
                altNames: [domain, `*.${domain}`]
            });

            // Create certificate order
            const order = await client.createOrder({
                identifiers: [
                    { type: 'dns', value: domain },
                    { type: 'dns', value: `*.${domain}` }
                ]
            });

            // Get authorizations
            const authorizations = await client.getAuthorizations(order);

            // Complete challenges
            for (const authz of authorizations) {
                const challenges = authz.challenges;
                
                // Prefer HTTP-01 challenge for simplicity
                const httpChallenge = challenges.find(c => c.type === 'http-01');
                if (httpChallenge) {
                    await this.completeHttpChallenge(httpChallenge, authz, client);
                } else {
                    // Fall back to DNS-01 challenge
                    const dnsChallenge = challenges.find(c => c.type === 'dns-01');
                    if (dnsChallenge) {
                        await this.completeDnsChallenge(dnsChallenge, authz, client);
                    }
                }
            }

            // Finalize order
            const finalized = await client.finalizeOrder(order, csr);
            const cert = await client.getCertificate(finalized);

            // Parse certificate to get expiry date
            const certInfo = await this.parseCertificate(cert);

            return {
                certificate: cert,
                privateKey: key,
                expiresAt: certInfo.expiresAt
            };
        } catch (error) {
            console.error('Let\'s Encrypt error:', error);
            throw new Error(`Failed to obtain certificate: ${error.message}`);
        }
    }

    /**
     * Complete HTTP-01 challenge
     */
    async completeHttpChallenge(challenge, authorization, client) {
        const keyAuthorization = await client.getChallengeKeyAuthorization(challenge);
        
        // Create challenge response file
        const challengePath = path.join(__dirname, '../../.well-known/acme-challenge', challenge.token);
        await fs.mkdir(path.dirname(challengePath), { recursive: true });
        await fs.writeFile(challengePath, keyAuthorization);

        // Notify ACME server
        await client.completeChallenge(challenge);
        
        // Wait for validation
        await client.waitForValidStatus(challenge);
        
        // Clean up challenge file
        await fs.unlink(challengePath);
    }

    /**
     * Complete DNS-01 challenge
     */
    async completeDnsChallenge(challenge, authorization, client) {
        const keyAuthorization = await client.getChallengeKeyAuthorization(challenge);
        const dnsRecord = await acme.forge.keyAuthorizationDigest(keyAuthorization);

        console.log('Please create the following DNS TXT record:');
        console.log(`_acme-challenge.${authorization.identifier.value} TXT ${dnsRecord}`);
        console.log('Press Enter when DNS record is created...');

        // In production, this would integrate with DNS provider API
        // For now, we'll wait for manual confirmation
        await new Promise(resolve => {
            if (process.env.NODE_ENV === 'test') {
                // Skip in test environment
                resolve();
            } else {
                process.stdin.once('data', resolve);
            }
        });

        // Notify ACME server
        await client.completeChallenge(challenge);
        
        // Wait for validation
        await client.waitForValidStatus(challenge);
    }

    /**
     * Renew certificate
     */
    async renewCertificate(domain, options = {}) {
        // Renewal is the same as obtaining a new certificate
        return this.obtainCertificate(domain, options);
    }

    /**
     * Parse certificate to extract information
     */
    async parseCertificate(certPem) {
        // Simple parsing - in production, use a proper X.509 parser
        const lines = certPem.split('\n');
        const certStart = lines.findIndex(l => l.includes('BEGIN CERTIFICATE'));
        const certEnd = lines.findIndex(l => l.includes('END CERTIFICATE'));
        
        if (certStart === -1 || certEnd === -1) {
            throw new Error('Invalid certificate format');
        }

        // For now, assume 90-day validity (Let's Encrypt standard)
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 90);

        return {
            expiresAt
        };
    }

    /**
     * Revoke certificate
     */
    async revokeCertificate(certPem, reason = 0) {
        const client = await this.getClient();
        await client.revokeCertificate(certPem, reason);
    }
}

module.exports = LetsEncryptIntegration;