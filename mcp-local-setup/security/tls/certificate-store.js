/**
 * Certificate Store
 * Manages storage and retrieval of SSL certificates
 */

const fs = require('fs').promises;
const path = require('path');

class CertificateStore {
    constructor() {
        this.basePath = path.join(__dirname, '../../data/certificates');
        this.metadata = new Map();
        this.metadataPath = path.join(this.basePath, 'metadata.json');
    }

    async initialize() {
        // Ensure certificate directory exists
        await fs.mkdir(this.basePath, { recursive: true });

        // Load metadata
        await this.loadMetadata();
    }

    async cleanup() {
        await this.saveMetadata();
    }

    /**
     * Store certificate and key
     */
    async store(domain, certData) {
        const domainPath = path.join(this.basePath, domain);
        await fs.mkdir(domainPath, { recursive: true });

        // Write certificate
        const certPath = path.join(domainPath, 'cert.pem');
        await fs.writeFile(certPath, certData.cert);

        // Write private key
        const keyPath = path.join(domainPath, 'privkey.pem');
        await fs.writeFile(keyPath, certData.key, { mode: 0o600 }); // Restrict permissions

        // Update metadata
        this.metadata.set(domain, {
            type: certData.type,
            createdAt: certData.createdAt,
            expiresAt: certData.expiresAt,
            certPath,
            keyPath
        });

        await this.saveMetadata();
    }

    /**
     * Get certificate data
     */
    async get(domain) {
        const metadata = this.metadata.get(domain);
        if (!metadata) {
            return null;
        }

        try {
            const cert = await fs.readFile(metadata.certPath, 'utf8');
            const key = await fs.readFile(metadata.keyPath, 'utf8');

            return {
                ...metadata,
                cert,
                key
            };
        } catch (error) {
            if (error.code === 'ENOENT') {
                // Certificate files missing, remove from metadata
                this.metadata.delete(domain);
                await this.saveMetadata();
                return null;
            }
            throw error;
        }
    }

    /**
     * Get certificate path
     */
    async getCertPath(domain) {
        const metadata = this.metadata.get(domain);
        return metadata ? metadata.certPath : null;
    }

    /**
     * Get private key path
     */
    async getKeyPath(domain) {
        const metadata = this.metadata.get(domain);
        return metadata ? metadata.keyPath : null;
    }

    /**
     * Remove certificate
     */
    async remove(domain) {
        const metadata = this.metadata.get(domain);
        if (!metadata) {
            return false;
        }

        try {
            // Remove certificate files
            await fs.unlink(metadata.certPath);
            await fs.unlink(metadata.keyPath);

            // Remove domain directory if empty
            const domainPath = path.dirname(metadata.certPath);
            await fs.rmdir(domainPath);
        } catch (error) {
            // Ignore errors if files already deleted
        }

        // Remove from metadata
        this.metadata.delete(domain);
        await this.saveMetadata();

        return true;
    }

    /**
     * Get all domains
     */
    async getAllDomains() {
        return Array.from(this.metadata.keys());
    }

    /**
     * Load metadata
     */
    async loadMetadata() {
        try {
            const data = await fs.readFile(this.metadataPath, 'utf8');
            const parsed = JSON.parse(data);

            for (const [domain, info] of Object.entries(parsed)) {
                this.metadata.set(domain, {
                    ...info,
                    createdAt: new Date(info.createdAt),
                    expiresAt: new Date(info.expiresAt)
                });
            }
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error('Error loading certificate metadata:', error);
            }
        }
    }

    /**
     * Save metadata
     */
    async saveMetadata() {
        const data = {};

        for (const [domain, info] of this.metadata.entries()) {
            data[domain] = {
                ...info,
                createdAt: info.createdAt.toISOString(),
                expiresAt: info.expiresAt.toISOString()
            };
        }

        await fs.writeFile(this.metadataPath, JSON.stringify(data, null, 2));
    }

    /**
     * Create certificate bundle
     */
    async createBundle(domain, chainPem = null) {
        const cert = await this.get(domain);
        if (!cert) {
            throw new Error(`Certificate not found for domain: ${domain}`);
        }

        let bundle = cert.cert;
        if (chainPem) {
            bundle += '\n' + chainPem;
        }

        const bundlePath = path.join(path.dirname(cert.certPath), 'fullchain.pem');
        await fs.writeFile(bundlePath, bundle);

        return bundlePath;
    }

    /**
     * Export certificate
     */
    async export(domain, format = 'pem') {
        const cert = await this.get(domain);
        if (!cert) {
            throw new Error(`Certificate not found for domain: ${domain}`);
        }

        if (format === 'pem') {
            return {
                certificate: cert.cert,
                privateKey: cert.key
            };
        } else if (format === 'pfx' || format === 'p12') {
            // Would need to convert to PKCS#12 format
            // This requires additional libraries like node-forge
            throw new Error('PFX/P12 export not yet implemented');
        } else {
            throw new Error(`Unsupported export format: ${format}`);
        }
    }
}

module.exports = CertificateStore;