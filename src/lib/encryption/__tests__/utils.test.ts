/**
 * Tests for encryption utilities used to secure ESPN authentication data
 */

import * as crypto from 'crypto';
import { 
  encryptEspnAuth, 
  decryptEspnAuth, 
  testEncryption, 
  generateEncryptionKey,
  type EspnAuth 
} from '../utils';

describe('Encryption Utils', () => {
  const mockEspnAuth: EspnAuth = {
    cookies: 'espn_s2=AEB123456789; SWID={ABC-DEF-123-456}'
  };

  const complexEspnAuth: EspnAuth = {
    cookies: 'espn_s2=AEB123456789; SWID={ABC-DEF-123-456}; session=xyz789; other=value'
  };

  beforeEach(() => {
    // Clear any cached encryption keys
    delete process.env.ENCRYPTION_KEY;
  });

  describe('encryptEspnAuth', () => {
    it('should encrypt ESPN auth data successfully', async () => {
      const encrypted = await encryptEspnAuth(mockEspnAuth);
      
      expect(encrypted).toBeInstanceOf(Buffer);
      expect(encrypted.length).toBeGreaterThan(0);
      // Should be longer than original due to IV and encryption overhead
      expect(encrypted.length).toBeGreaterThan(JSON.stringify(mockEspnAuth).length);
    });

    it('should handle complex cookie strings', async () => {
      const encrypted = await encryptEspnAuth(complexEspnAuth);
      
      expect(encrypted).toBeInstanceOf(Buffer);
      expect(encrypted.length).toBeGreaterThan(0);
    });

    it('should produce different output for the same input (due to random IV)', async () => {
      const encrypted1 = await encryptEspnAuth(mockEspnAuth);
      const encrypted2 = await encryptEspnAuth(mockEspnAuth);
      
      // Should be different due to different random IVs
      expect(encrypted1.equals(encrypted2)).toBe(false);
    });

    it('should handle empty cookies', async () => {
      const emptyAuth: EspnAuth = { cookies: '' };
      const encrypted = await encryptEspnAuth(emptyAuth);
      
      expect(encrypted).toBeInstanceOf(Buffer);
      expect(encrypted.length).toBeGreaterThan(0);
    });

    it('should throw error for invalid input', async () => {
      // Test with circular reference that would break JSON.stringify
      const circular: any = { cookies: 'test' };
      circular.self = circular;
      await expect(encryptEspnAuth(circular)).rejects.toThrow();
    });
  });

  describe('decryptEspnAuth', () => {
    it('should decrypt previously encrypted data', async () => {
      const encrypted = await encryptEspnAuth(mockEspnAuth);
      const decrypted = await decryptEspnAuth(encrypted);
      
      expect(decrypted).toEqual(mockEspnAuth);
    });

    it('should handle complex cookie strings round-trip', async () => {
      const encrypted = await encryptEspnAuth(complexEspnAuth);
      const decrypted = await decryptEspnAuth(encrypted);
      
      expect(decrypted).toEqual(complexEspnAuth);
    });

    it('should handle empty cookies round-trip', async () => {
      const emptyAuth: EspnAuth = { cookies: '' };
      const encrypted = await encryptEspnAuth(emptyAuth);
      const decrypted = await decryptEspnAuth(encrypted);
      
      expect(decrypted).toEqual(emptyAuth);
    });

    it('should throw error for corrupted data', async () => {
      const corruptedBuffer = Buffer.from('invalid-encrypted-data');
      
      await expect(decryptEspnAuth(corruptedBuffer)).rejects.toThrow();
    });

    it('should throw error for truncated data', async () => {
      const encrypted = await encryptEspnAuth(mockEspnAuth);
      const truncated = encrypted.subarray(0, 10); // Truncate to invalid length
      
      await expect(decryptEspnAuth(truncated)).rejects.toThrow();
    });

    it('should throw error for empty buffer', async () => {
      const emptyBuffer = Buffer.alloc(0);
      
      await expect(decryptEspnAuth(emptyBuffer)).rejects.toThrow();
    });
  });

  describe('Round-trip encryption', () => {
    const testCases = [
      { name: 'simple cookies', auth: mockEspnAuth },
      { name: 'complex cookies', auth: complexEspnAuth },
      { name: 'empty cookies', auth: { cookies: '' } },
      { name: 'special characters', auth: { cookies: 'test=value%20with%20encoding; other=special!@#$%^&*()' } },
      { name: 'unicode characters', auth: { cookies: 'test=café; emoji=😀' } }
    ];

    testCases.forEach(({ name, auth }) => {
      it(`should maintain data integrity for ${name}`, async () => {
        const encrypted = await encryptEspnAuth(auth);
        const decrypted = await decryptEspnAuth(encrypted);
        
        expect(decrypted).toEqual(auth);
        expect(JSON.stringify(decrypted)).toBe(JSON.stringify(auth));
      });
    });
  });

  describe('testEncryption', () => {
    it('should return true for successful encryption test', async () => {
      const result = await testEncryption();
      
      expect(result).toBe(true);
    });

    it('should validate encryption works with current configuration', async () => {
      // This test ensures our encryption setup is working
      const isValid = await testEncryption();
      expect(isValid).toBe(true);
    });
  });

  describe('generateEncryptionKey', () => {
    it('should generate a valid base64 key', () => {
      const key = generateEncryptionKey();
      
      expect(typeof key).toBe('string');
      expect(key.length).toBe(44); // 32 bytes in base64 = 44 chars
      
      // Should be valid base64
      const buffer = Buffer.from(key, 'base64');
      expect(buffer.length).toBe(32);
    });

    it('should generate different keys each time', () => {
      const key1 = generateEncryptionKey();
      const key2 = generateEncryptionKey();
      
      expect(key1).not.toBe(key2);
    });
  });

  describe('Environment key handling', () => {
    it('should use environment key when provided as hex', async () => {
      const testKey = 'a'.repeat(64); // 64 char hex string = 32 bytes
      process.env.ENCRYPTION_KEY = testKey;
      
      const encrypted = await encryptEspnAuth(mockEspnAuth);
      const decrypted = await decryptEspnAuth(encrypted);
      
      expect(decrypted).toEqual(mockEspnAuth);
    });

    it('should use environment key when provided as base64', async () => {
      const testKey = crypto.randomBytes(32).toString('base64'); // 44 chars
      process.env.ENCRYPTION_KEY = testKey;
      
      const encrypted = await encryptEspnAuth(mockEspnAuth);
      const decrypted = await decryptEspnAuth(encrypted);
      
      expect(decrypted).toEqual(mockEspnAuth);
    });

    it('should hash arbitrary string keys', async () => {
      process.env.ENCRYPTION_KEY = 'my-custom-password-string';
      
      const encrypted = await encryptEspnAuth(mockEspnAuth);
      const decrypted = await decryptEspnAuth(encrypted);
      
      expect(decrypted).toEqual(mockEspnAuth);
    });

    it('should warn about development key usage', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      // No environment key set, should use development fallback
      delete process.env.ENCRYPTION_KEY;
      
      await encryptEspnAuth(mockEspnAuth);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Using default key for development')
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('Error scenarios', () => {
    it('should provide meaningful error messages for encryption failures', async () => {
      // Test with data that would cause JSON.stringify to throw
      const problematicData: any = { cookies: 'test' };
      problematicData.self = problematicData; // Circular reference
      
      await expect(encryptEspnAuth(problematicData)).rejects.toThrow(/Encryption failed/);
    });

    it('should provide meaningful error messages for decryption failures', async () => {
      // Test with malformed encrypted data that would cause decryption to fail
      const invalidBuffer = Buffer.concat([
        Buffer.from([16]), // Valid IV length
        Buffer.alloc(16),  // Valid IV
        Buffer.from('invalid-encrypted-data-that-will-fail') // Invalid encrypted data
      ]);
      
      await expect(decryptEspnAuth(invalidBuffer)).rejects.toThrow(/Decryption failed/);
    });

    it('should handle JSON parsing errors gracefully', async () => {
      // We can't easily test this without mocking the entire encryption process
      // But we can test with corrupted data that would fail JSON parsing
      const invalidJsonBuffer = Buffer.concat([
        Buffer.from([16]), // IV length
        Buffer.alloc(16), // Mock IV
        Buffer.from('invalid-json-data') // This won't decrypt to valid JSON
      ]);
      
      await expect(decryptEspnAuth(invalidJsonBuffer)).rejects.toThrow(/Decryption failed/);
    });
  });

  describe('Performance', () => {
    it('should encrypt and decrypt efficiently', async () => {
      const start = Date.now();
      
      for (let i = 0; i < 10; i++) {
        const encrypted = await encryptEspnAuth(mockEspnAuth);
        await decryptEspnAuth(encrypted);
      }
      
      const duration = Date.now() - start;
      
      // Should complete 10 round-trips in reasonable time (< 1 second)
      expect(duration).toBeLessThan(1000);
    });
  });
});