/**
 * Secret Manager
 * Handles encryption, decryption, and management of secrets
 */

const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

class SecretManager {
    constructor(options = {}) {
        this.algorithm = options.algorithm || 'aes-256-gcm';
        this.keyDerivationIterations = options.keyDerivationIterations || 100000;
        this.saltLength = options.saltLength || 32;
        this.tagLength = options.tagLength || 16;
        this.ivLength = options.ivLength || 16;
        
        // Master key can be provided or will be derived from password
        this.masterKey = options.masterKey;
        this.masterPassword = options.masterPassword;
    }

    /**
     * Initialize the secret manager with a master password
     * @param {string} password - Master password
     * @returns {Promise<void>}
     */
    async initialize(password) {
        if (!password && !this.masterKey) {
            throw new Error('Master password or key required for initialization');
        }
        
        if (password) {
            this.masterPassword = password;
            // Derive key from password
            const salt = crypto.randomBytes(this.saltLength);
            this.masterKey = await this._deriveKey(password, salt);
        }
    }

    /**
     * Encrypt a value
     * @param {string} value - Value to encrypt
     * @param {Object} [metadata] - Additional metadata to store
     * @returns {Promise<Object>} Encrypted data with metadata
     */
    async encrypt(value, metadata = {}) {
        if (!this.masterKey) {
            throw new Error('Secret manager not initialized');
        }

        const iv = crypto.randomBytes(this.ivLength);
        const cipher = crypto.createCipheriv(this.algorithm, this.masterKey, iv);
        
        const encrypted = Buffer.concat([
            cipher.update(value, 'utf8'),
            cipher.final()
        ]);
        
        const tag = cipher.getAuthTag();
        
        return {
            algorithm: this.algorithm,
            iv: iv.toString('base64'),
            tag: tag.toString('base64'),
            data: encrypted.toString('base64'),
            metadata: {
                ...metadata,
                encryptedAt: new Date().toISOString(),
                version: '1.0'
            }
        };
    }

    /**
     * Decrypt a value
     * @param {Object} encryptedData - Encrypted data object
     * @returns {Promise<string>} Decrypted value
     */
    async decrypt(encryptedData) {
        if (!this.masterKey) {
            throw new Error('Secret manager not initialized');
        }

        const iv = Buffer.from(encryptedData.iv, 'base64');
        const tag = Buffer.from(encryptedData.tag, 'base64');
        const data = Buffer.from(encryptedData.data, 'base64');
        
        const decipher = crypto.createDecipheriv(
            encryptedData.algorithm || this.algorithm,
            this.masterKey,
            iv
        );
        
        decipher.setAuthTag(tag);
        
        const decrypted = Buffer.concat([
            decipher.update(data),
            decipher.final()
        ]);
        
        return decrypted.toString('utf8');
    }

    /**
     * Rotate encryption for a secret
     * @param {Object} encryptedData - Current encrypted data
     * @param {Buffer} newKey - New encryption key
     * @returns {Promise<Object>} Re-encrypted data
     */
    async rotateEncryption(encryptedData, newKey) {
        // Decrypt with current key
        const decrypted = await this.decrypt(encryptedData);
        
        // Temporarily store new key
        const oldKey = this.masterKey;
        this.masterKey = newKey;
        
        // Re-encrypt with new key
        const reencrypted = await this.encrypt(decrypted, {
            ...encryptedData.metadata,
            rotatedAt: new Date().toISOString(),
            rotationCount: (encryptedData.metadata.rotationCount || 0) + 1
        });
        
        // Restore old key
        this.masterKey = oldKey;
        
        return reencrypted;
    }

    /**
     * Generate a secure random key
     * @param {number} [length] - Key length in bytes
     * @returns {Buffer} Random key
     */
    generateKey(length = 32) {
        return crypto.randomBytes(length);
    }

    /**
     * Derive a key from password
     * @param {string} password - Password to derive from
     * @param {Buffer} salt - Salt for key derivation
     * @returns {Promise<Buffer>} Derived key
     */
    async _deriveKey(password, salt) {
        return new Promise((resolve, reject) => {
            crypto.pbkdf2(
                password,
                salt,
                this.keyDerivationIterations,
                32,
                'sha256',
                (err, derivedKey) => {
                    if (err) reject(err);
                    else resolve(derivedKey);
                }
            );
        });
    }

    /**
     * Validate encrypted data structure
     * @param {Object} encryptedData - Data to validate
     * @returns {boolean} Whether data is valid
     */
    validateEncryptedData(encryptedData) {
        const required = ['algorithm', 'iv', 'tag', 'data'];
        return required.every(field => field in encryptedData);
    }

    /**
     * Create a backup of secrets
     * @param {string} secretsPath - Path to secrets directory
     * @param {string} backupPath - Path to backup location
     * @returns {Promise<Object>} Backup metadata
     */
    async backupSecrets(secretsPath, backupPath) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupDir = path.join(backupPath, `secrets-backup-${timestamp}`);
        
        await fs.mkdir(backupDir, { recursive: true });
        
        const files = await fs.readdir(secretsPath);
        const backedUp = [];
        
        for (const file of files) {
            const sourcePath = path.join(secretsPath, file);
            const destPath = path.join(backupDir, file);
            
            const stat = await fs.stat(sourcePath);
            if (stat.isFile()) {
                await fs.copyFile(sourcePath, destPath);
                backedUp.push(file);
            }
        }
        
        const metadata = {
            timestamp,
            location: backupDir,
            files: backedUp,
            count: backedUp.length
        };
        
        await fs.writeFile(
            path.join(backupDir, 'backup-metadata.json'),
            JSON.stringify(metadata, null, 2)
        );
        
        return metadata;
    }

    /**
     * Audit secret access
     * @param {string} action - Action performed
     * @param {string} secretKey - Secret key accessed
     * @param {Object} context - Additional context
     * @returns {Promise<void>}
     */
    async auditAccess(action, secretKey, context = {}) {
        const auditEntry = {
            timestamp: new Date().toISOString(),
            action,
            secretKey,
            user: context.user || 'system',
            environment: context.environment,
            ip: context.ip,
            userAgent: context.userAgent
        };
        
        // In a real implementation, this would write to an audit log
        // For now, we'll just return the entry
        return auditEntry;
    }

    /**
     * Check if a secret has expired
     * @param {Object} metadata - Secret metadata
     * @param {number} [maxAge] - Maximum age in milliseconds
     * @returns {boolean} Whether secret has expired
     */
    isExpired(metadata, maxAge = 90 * 24 * 60 * 60 * 1000) { // 90 days default
        if (!metadata.createdAt) return false;
        
        const created = new Date(metadata.createdAt);
        const age = Date.now() - created.getTime();
        
        return age > maxAge;
    }

    /**
     * Generate secure password
     * @param {Object} options - Password generation options
     * @returns {string} Generated password
     */
    generatePassword(options = {}) {
        const length = options.length || 32;
        const includeSymbols = options.includeSymbols !== false;
        const includeNumbers = options.includeNumbers !== false;
        const includeUppercase = options.includeUppercase !== false;
        const includeLowercase = options.includeLowercase !== false;
        
        let charset = '';
        if (includeLowercase) charset += 'abcdefghijklmnopqrstuvwxyz';
        if (includeUppercase) charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        if (includeNumbers) charset += '0123456789';
        if (includeSymbols) charset += '!@#$%^&*()_+-=[]{}|;:,.<>?';
        
        if (!charset) {
            throw new Error('At least one character type must be included');
        }
        
        const password = [];
        const randomBytes = crypto.randomBytes(length);
        
        for (let i = 0; i < length; i++) {
            password.push(charset[randomBytes[i] % charset.length]);
        }
        
        return password.join('');
    }
}

module.exports = SecretManager;