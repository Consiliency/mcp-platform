/**
 * API Key Store
 * Manages API keys with persistent storage
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class ApiKeyStore {
    constructor() {
        this.keys = new Map();
        this.storePath = path.join(__dirname, '../../data/api-keys.json');
    }

    async initialize() {
        // Ensure data directory exists
        const dataDir = path.dirname(this.storePath);
        await fs.mkdir(dataDir, { recursive: true });

        // Load existing keys
        await this.loadKeys();
    }

    async cleanup() {
        await this.saveKeys();
        this.keys.clear();
    }

    /**
     * Store an API key
     */
    async store(key, keyInfo) {
        // Hash the key for storage
        const hashedKey = this.hashKey(key);
        
        this.keys.set(hashedKey, {
            ...keyInfo,
            id: hashedKey,
            key: key.substring(0, 8) + '...' // Store partial key for identification
        });

        await this.saveKeys();
    }

    /**
     * Validate an API key
     */
    async validate(key) {
        const hashedKey = this.hashKey(key);
        const keyInfo = this.keys.get(hashedKey);
        
        if (!keyInfo) {
            return null;
        }

        return {
            ...keyInfo,
            key // Return the actual key
        };
    }

    /**
     * Update last used timestamp
     */
    async updateLastUsed(key) {
        const hashedKey = this.hashKey(key);
        const keyInfo = this.keys.get(hashedKey);
        
        if (keyInfo) {
            keyInfo.lastUsed = new Date();
            await this.saveKeys();
        }
    }

    /**
     * Revoke an API key
     */
    async revoke(key) {
        const hashedKey = this.hashKey(key);
        const deleted = this.keys.delete(hashedKey);
        
        if (deleted) {
            await this.saveKeys();
        }
        
        return deleted;
    }

    /**
     * Get all API keys (for admin purposes)
     */
    async getAllKeys() {
        return Array.from(this.keys.values());
    }

    /**
     * Hash an API key for secure storage
     */
    hashKey(key) {
        return crypto.createHash('sha256').update(key).digest('hex');
    }

    /**
     * Load keys from storage
     */
    async loadKeys() {
        try {
            const data = await fs.readFile(this.storePath, 'utf8');
            const parsed = JSON.parse(data);
            
            for (const [hashedKey, keyInfo] of Object.entries(parsed)) {
                this.keys.set(hashedKey, {
                    ...keyInfo,
                    createdAt: new Date(keyInfo.createdAt),
                    lastUsed: keyInfo.lastUsed ? new Date(keyInfo.lastUsed) : null
                });
            }
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error('Error loading API keys:', error);
            }
            // File doesn't exist yet, which is fine
        }
    }

    /**
     * Save keys to storage
     */
    async saveKeys() {
        const data = {};
        
        for (const [hashedKey, keyInfo] of this.keys.entries()) {
            data[hashedKey] = {
                ...keyInfo,
                createdAt: keyInfo.createdAt.toISOString(),
                lastUsed: keyInfo.lastUsed ? keyInfo.lastUsed.toISOString() : null
            };
        }

        await fs.writeFile(this.storePath, JSON.stringify(data, null, 2));
    }
}

module.exports = ApiKeyStore;