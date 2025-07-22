/**
 * Certificate Generator
 * Generates self-signed SSL certificates
 */

const forge = require('node-forge');
const { pki } = forge;

class CertificateGenerator {
    /**
     * Generate a self-signed certificate
     */
    async generateSelfSigned(options) {
        const {
            commonName,
            organizationName = 'MCP Platform',
            countryName = 'US',
            stateName = 'CA',
            localityName = 'San Francisco',
            validDays = 365,
            keySize = 2048
        } = options;

        // Generate key pair
        const keys = pki.rsa.generateKeyPair(keySize);

        // Create certificate
        const cert = pki.createCertificate();
        cert.publicKey = keys.publicKey;
        cert.serialNumber = this.generateSerialNumber();
        
        // Set validity period
        cert.validity.notBefore = new Date();
        cert.validity.notAfter = new Date();
        cert.validity.notAfter.setDate(cert.validity.notBefore.getDate() + validDays);

        // Set subject
        const subject = [
            { name: 'commonName', value: commonName },
            { name: 'countryName', value: countryName },
            { shortName: 'ST', value: stateName },
            { name: 'localityName', value: localityName },
            { name: 'organizationName', value: organizationName }
        ];
        cert.setSubject(subject);

        // Set issuer (same as subject for self-signed)
        cert.setIssuer(subject);

        // Set extensions
        cert.setExtensions([
            {
                name: 'basicConstraints',
                cA: true
            },
            {
                name: 'keyUsage',
                keyCertSign: true,
                digitalSignature: true,
                nonRepudiation: true,
                keyEncipherment: true,
                dataEncipherment: true
            },
            {
                name: 'extKeyUsage',
                serverAuth: true,
                clientAuth: true,
                codeSigning: true,
                emailProtection: true,
                timeStamping: true
            },
            {
                name: 'nsCertType',
                client: true,
                server: true,
                email: true,
                objsign: true,
                sslCA: true,
                emailCA: true,
                objCA: true
            },
            {
                name: 'subjectAltName',
                altNames: [
                    {
                        type: 2, // DNS
                        value: commonName
                    },
                    {
                        type: 2, // DNS
                        value: `*.${commonName}`
                    },
                    {
                        type: 7, // IP
                        ip: '127.0.0.1'
                    },
                    {
                        type: 7, // IP
                        ip: '::1'
                    }
                ]
            },
            {
                name: 'subjectKeyIdentifier'
            }
        ]);

        // Sign certificate
        cert.sign(keys.privateKey, forge.md.sha256.create());

        // Convert to PEM format
        const pemCert = pki.certificateToPem(cert);
        const pemKey = pki.privateKeyToPem(keys.privateKey);

        return {
            certificate: pemCert,
            privateKey: pemKey,
            publicKey: pki.publicKeyToPem(keys.publicKey),
            serialNumber: cert.serialNumber,
            expiresAt: cert.validity.notAfter
        };
    }

    /**
     * Generate a certificate signing request (CSR)
     */
    async generateCSR(options) {
        const {
            commonName,
            organizationName,
            countryName,
            stateName,
            localityName,
            emailAddress,
            keySize = 2048
        } = options;

        // Generate key pair
        const keys = pki.rsa.generateKeyPair(keySize);

        // Create CSR
        const csr = pki.createCertificationRequest();
        csr.publicKey = keys.publicKey;

        // Set subject
        const subject = [
            { name: 'commonName', value: commonName }
        ];

        if (countryName) subject.push({ name: 'countryName', value: countryName });
        if (stateName) subject.push({ shortName: 'ST', value: stateName });
        if (localityName) subject.push({ name: 'localityName', value: localityName });
        if (organizationName) subject.push({ name: 'organizationName', value: organizationName });
        if (emailAddress) subject.push({ name: 'emailAddress', value: emailAddress });

        csr.setSubject(subject);

        // Set attributes
        csr.setAttributes([
            {
                name: 'extensionRequest',
                extensions: [
                    {
                        name: 'subjectAltName',
                        altNames: [
                            {
                                type: 2, // DNS
                                value: commonName
                            },
                            {
                                type: 2, // DNS
                                value: `*.${commonName}`
                            }
                        ]
                    }
                ]
            }
        ]);

        // Sign CSR
        csr.sign(keys.privateKey, forge.md.sha256.create());

        // Convert to PEM format
        const pemCSR = pki.certificationRequestToPem(csr);
        const pemKey = pki.privateKeyToPem(keys.privateKey);

        return {
            csr: pemCSR,
            privateKey: pemKey
        };
    }

    /**
     * Generate a unique serial number
     */
    generateSerialNumber() {
        const bytes = forge.random.getBytesSync(16);
        return forge.util.bytesToHex(bytes);
    }

    /**
     * Verify certificate chain
     */
    async verifyCertificate(certPem, caPem = null) {
        try {
            const cert = pki.certificateFromPem(certPem);
            
            // Check validity period
            const now = new Date();
            if (now < cert.validity.notBefore || now > cert.validity.notAfter) {
                return {
                    valid: false,
                    reason: 'Certificate is not within validity period'
                };
            }

            // If CA certificate provided, verify against it
            if (caPem) {
                const caCert = pki.certificateFromPem(caPem);
                const verified = caCert.verify(cert);
                
                if (!verified) {
                    return {
                        valid: false,
                        reason: 'Certificate signature verification failed'
                    };
                }
            }

            return {
                valid: true,
                subject: cert.subject.attributes.map(attr => ({
                    name: attr.name,
                    value: attr.value
                })),
                issuer: cert.issuer.attributes.map(attr => ({
                    name: attr.name,
                    value: attr.value
                })),
                validFrom: cert.validity.notBefore,
                validTo: cert.validity.notAfter
            };
        } catch (error) {
            return {
                valid: false,
                reason: error.message
            };
        }
    }
}

module.exports = CertificateGenerator;