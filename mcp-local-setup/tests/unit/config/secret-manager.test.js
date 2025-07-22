/**
 * Unit tests for SecretManager
 */

const SecretManager = require('../../../config/advanced/secret-manager');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

// Mock fs module
jest.mock('fs').promises;

describe('SecretManager', () => {
    let secretManager;
    let masterKey;
    
    beforeEach(() => {
        masterKey = crypto.randomBytes(32);
        secretManager = new SecretManager({
            masterKey: masterKey
        });
        
        jest.clearAllMocks();
    });
    
    describe('initialization', () => {
        it('should initialize with master key', () => {
            expect(secretManager.masterKey).toBe(masterKey);
        });
        
        it('should initialize with password', async () => {
            const manager = new SecretManager();
            await manager.initialize('test-password');
            
            expect(manager.masterPassword).toBe('test-password');
            expect(manager.masterKey).toBeDefined();
            expect(Buffer.isBuffer(manager.masterKey)).toBe(true);
        });
        
        it('should throw error if not initialized', async () => {
            const manager = new SecretManager();
            
            await expect(manager.encrypt('test'))
                .rejects.toThrow('Secret manager not initialized');
        });
    });
    
    describe('encrypt/decrypt', () => {
        it('should encrypt and decrypt values correctly', async () => {
            const plaintext = 'sensitive-data-12345';
            
            const encrypted = await secretManager.encrypt(plaintext);
            
            expect(encrypted.algorithm).toBe('aes-256-gcm');
            expect(encrypted.iv).toBeDefined();
            expect(encrypted.tag).toBeDefined();
            expect(encrypted.data).toBeDefined();
            expect(encrypted.metadata.encryptedAt).toBeDefined();
            
            const decrypted = await secretManager.decrypt(encrypted);
            expect(decrypted).toBe(plaintext);
        });
        
        it('should include metadata in encrypted data', async () => {
            const metadata = {
                description: 'API key for service',
                service: 'weather-api'
            };
            
            const encrypted = await secretManager.encrypt('api-key-value', metadata);
            
            expect(encrypted.metadata.description).toBe('API key for service');
            expect(encrypted.metadata.service).toBe('weather-api');
            expect(encrypted.metadata.version).toBe('1.0');
        });
        
        it('should handle empty strings', async () => {
            const encrypted = await secretManager.encrypt('');
            const decrypted = await secretManager.decrypt(encrypted);
            
            expect(decrypted).toBe('');
        });
        
        it('should handle special characters', async () => {
            const specialChars = '!@#$%^&*()_+-=[]{}|;:,.<>?/~`"\'\\';
            
            const encrypted = await secretManager.encrypt(specialChars);
            const decrypted = await secretManager.decrypt(encrypted);
            
            expect(decrypted).toBe(specialChars);
        });
    });
    
    describe('rotateEncryption', () => {
        it('should rotate encryption with new key', async () => {
            const originalData = 'secret-data';
            const encrypted = await secretManager.encrypt(originalData);
            
            const newKey = crypto.randomBytes(32);
            const rotated = await secretManager.rotateEncryption(encrypted, newKey);
            
            expect(rotated.metadata.rotatedAt).toBeDefined();
            expect(rotated.metadata.rotationCount).toBe(1);
            
            // Decrypt with new key
            const newManager = new SecretManager({ masterKey: newKey });
            const decrypted = await newManager.decrypt(rotated);
            
            expect(decrypted).toBe(originalData);
        });
        
        it('should increment rotation count', async () => {
            const encrypted = await secretManager.encrypt('data');
            
            const newKey1 = crypto.randomBytes(32);
            const rotated1 = await secretManager.rotateEncryption(encrypted, newKey1);
            
            const newKey2 = crypto.randomBytes(32);
            const manager2 = new SecretManager({ masterKey: newKey1 });
            const rotated2 = await manager2.rotateEncryption(rotated1, newKey2);
            
            expect(rotated2.metadata.rotationCount).toBe(2);
        });
    });
    
    describe('validateEncryptedData', () => {
        it('should validate correct encrypted data structure', () => {
            const validData = {
                algorithm: 'aes-256-gcm',
                iv: 'base64string',
                tag: 'base64string',
                data: 'base64string'
            };
            
            expect(secretManager.validateEncryptedData(validData)).toBe(true);
        });
        
        it('should reject invalid encrypted data', () => {
            const invalidData = {
                iv: 'base64string',
                data: 'base64string'
                // Missing algorithm and tag
            };
            
            expect(secretManager.validateEncryptedData(invalidData)).toBe(false);
        });
    });
    
    describe('generateKey', () => {
        it('should generate random key of specified length', () => {
            const key = secretManager.generateKey(16);
            
            expect(Buffer.isBuffer(key)).toBe(true);
            expect(key.length).toBe(16);
        });
        
        it('should generate 32-byte key by default', () => {
            const key = secretManager.generateKey();
            
            expect(key.length).toBe(32);
        });
        
        it('should generate different keys each time', () => {
            const key1 = secretManager.generateKey();
            const key2 = secretManager.generateKey();
            
            expect(key1.equals(key2)).toBe(false);
        });
    });
    
    describe('generatePassword', () => {
        it('should generate password with default options', () => {
            const password = secretManager.generatePassword();
            
            expect(password).toHaveLength(32);
            expect(password).toMatch(/[a-z]/); // Has lowercase
            expect(password).toMatch(/[A-Z]/); // Has uppercase
            expect(password).toMatch(/[0-9]/); // Has numbers
            expect(password).toMatch(/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/); // Has symbols
        });
        
        it('should generate password with custom length', () => {
            const password = secretManager.generatePassword({ length: 16 });
            
            expect(password).toHaveLength(16);
        });
        
        it('should exclude character types when requested', () => {
            const password = secretManager.generatePassword({
                includeSymbols: false,
                includeNumbers: false,
                includeUppercase: false
            });
            
            expect(password).toMatch(/^[a-z]+$/);
        });
        
        it('should throw error if no character types included', () => {
            expect(() => {
                secretManager.generatePassword({
                    includeLowercase: false,
                    includeUppercase: false,
                    includeNumbers: false,
                    includeSymbols: false
                });
            }).toThrow('At least one character type must be included');
        });
    });
    
    describe('backupSecrets', () => {
        it('should create backup of secrets directory', async () => {
            const mockFiles = ['secret1.enc', 'secret2.enc', '_metadata.json'];
            fs.readdir.mockResolvedValue(mockFiles);
            fs.stat.mockResolvedValue({ isFile: () => true });
            fs.mkdir.mockResolvedValue(undefined);
            fs.copyFile.mockResolvedValue(undefined);
            fs.writeFile.mockResolvedValue(undefined);
            
            const result = await secretManager.backupSecrets('/secrets', '/backups');
            
            expect(result.files).toEqual(mockFiles);
            expect(result.count).toBe(3);
            expect(result.location).toMatch(/secrets-backup-/);
            expect(fs.copyFile).toHaveBeenCalledTimes(3);
        });
        
        it('should skip directories when backing up', async () => {
            fs.readdir.mockResolvedValue(['file.enc', 'subdir']);
            fs.stat
                .mockResolvedValueOnce({ isFile: () => true })
                .mockResolvedValueOnce({ isFile: () => false });
            fs.mkdir.mockResolvedValue(undefined);
            fs.copyFile.mockResolvedValue(undefined);
            fs.writeFile.mockResolvedValue(undefined);
            
            const result = await secretManager.backupSecrets('/secrets', '/backups');
            
            expect(result.files).toEqual(['file.enc']);
            expect(fs.copyFile).toHaveBeenCalledTimes(1);
        });
    });
    
    describe('auditAccess', () => {
        it('should create audit entry', async () => {
            const entry = await secretManager.auditAccess('read', 'API_KEY', {
                user: 'john.doe',
                environment: 'production',
                ip: '192.168.1.1'
            });
            
            expect(entry.action).toBe('read');
            expect(entry.secretKey).toBe('API_KEY');
            expect(entry.user).toBe('john.doe');
            expect(entry.timestamp).toBeDefined();
        });
        
        it('should use default values for missing context', async () => {
            const entry = await secretManager.auditAccess('write', 'SECRET');
            
            expect(entry.user).toBe('system');
            expect(entry.environment).toBeUndefined();
        });
    });
    
    describe('isExpired', () => {
        it('should detect expired secrets', () => {
            const oldDate = new Date();
            oldDate.setDate(oldDate.getDate() - 100); // 100 days ago
            
            const metadata = {
                createdAt: oldDate.toISOString()
            };
            
            expect(secretManager.isExpired(metadata)).toBe(true);
        });
        
        it('should not mark recent secrets as expired', () => {
            const metadata = {
                createdAt: new Date().toISOString()
            };
            
            expect(secretManager.isExpired(metadata)).toBe(false);
        });
        
        it('should use custom max age', () => {
            const oldDate = new Date();
            oldDate.setHours(oldDate.getHours() - 2); // 2 hours ago
            
            const metadata = {
                createdAt: oldDate.toISOString()
            };
            
            expect(secretManager.isExpired(metadata, 60 * 60 * 1000)).toBe(true); // 1 hour max
        });
        
        it('should handle missing createdAt', () => {
            const metadata = {};
            
            expect(secretManager.isExpired(metadata)).toBe(false);
        });
    });
    
    describe('key derivation', () => {
        it('should derive consistent key from password', async () => {
            const password = 'test-password';
            const salt = crypto.randomBytes(32);
            
            const key1 = await secretManager._deriveKey(password, salt);
            const key2 = await secretManager._deriveKey(password, salt);
            
            expect(key1.equals(key2)).toBe(true);
        });
        
        it('should derive different keys with different salts', async () => {
            const password = 'test-password';
            const salt1 = crypto.randomBytes(32);
            const salt2 = crypto.randomBytes(32);
            
            const key1 = await secretManager._deriveKey(password, salt1);
            const key2 = await secretManager._deriveKey(password, salt2);
            
            expect(key1.equals(key2)).toBe(false);
        });
    });
});