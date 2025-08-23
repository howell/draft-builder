/**
 * Encryption utilities for securing sensitive data like ESPN authentication cookies
 * Uses Node.js crypto module for AES-256-GCM encryption
 */

import * as crypto from 'crypto';

/**
 * ESPN authentication data that needs to be encrypted before storage
 */
export interface EspnAuth {
  espnS2: string;
  swid: string;
  // Future: could include other auth tokens or session data
}

/**
 * Encrypted data structure stored in the database
 */
export interface EncryptedData {
  data: Buffer;
  iv: Buffer;
  authTag: Buffer;
}

/**
 * Encryption configuration
 */
const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16; // CBC IV length

/**
 * Validate encryption setup - server-side only
 */
function validateEncryptionSetup(): void {
  // Only allow encryption on server side
  if (typeof window !== 'undefined') {
    throw new Error('Encryption utilities should only be used server-side');
  }
  
  if (!process.env.ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY environment variable is required for server-side encryption');
  }
}

// Run validation when module is imported
validateEncryptionSetup();

/**
 * Get encryption key from environment variable (server-side only)
 * Fails fast if key is not available - no fallbacks
 */
function getEncryptionKey(): Buffer {
  const envKey = process.env.ENCRYPTION_KEY;
  if (!envKey) {
    throw new Error('ENCRYPTION_KEY environment variable is required');
  }
  
  // If provided as hex string, convert to buffer
  if (envKey.length === 64) {
    return Buffer.from(envKey, 'hex');
  }
  // If provided as base64, convert to buffer
  if (envKey.length === 44) {
    return Buffer.from(envKey, 'base64');
  }
  // Otherwise, hash the string to get consistent 32-byte key
  return crypto.createHash('sha256').update(envKey).digest();
}

/**
 * Encrypt ESPN authentication data for secure storage
 * Returns base64-encoded string suitable for TEXT database fields
 */
export async function encryptEspnAuth(auth: EspnAuth): Promise<string> {
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    // Serialize the auth data as JSON
    const plaintext = JSON.stringify(auth);
    
    // Encrypt the data
    let encrypted = cipher.update(plaintext, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    
    // Combine iv and encrypted data into a single buffer
    const result = Buffer.concat([
      Buffer.from([IV_LENGTH]), // 1 byte: IV length
      iv, // IV bytes
      encrypted // remaining bytes: encrypted data
    ]);
    
    // Return as base64 string for TEXT storage
    return result.toString('base64');
  } catch (error) {
    console.error('[Encryption] Failed to encrypt ESPN auth:', error);
    throw new Error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Decrypt ESPN authentication data from storage
 * Accepts base64-encoded string from TEXT database fields
 */
export async function decryptEspnAuth(encryptedBase64: string): Promise<EspnAuth> {
  try {
    const key = getEncryptionKey();
    
    // Convert base64 string back to buffer
    const encryptedBuffer = Buffer.from(encryptedBase64, 'base64');
    
    // Parse the buffer structure
    let offset = 0;
    
    // Read IV length and IV
    const ivLength = encryptedBuffer.readUInt8(offset);
    offset += 1;
    
    // Validate IV length
    if (ivLength !== IV_LENGTH) {
      throw new Error(`Invalid IV length: expected ${IV_LENGTH}, got ${ivLength}`);
    }
    
    const iv = encryptedBuffer.subarray(offset, offset + ivLength);
    offset += ivLength;
    
    // Read encrypted data
    const encryptedData = encryptedBuffer.subarray(offset);
    
    // Create decipher and decrypt
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    
    let decrypted = decipher.update(encryptedData);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    // Parse the JSON
    const plaintext = decrypted.toString('utf8');
    const auth = JSON.parse(plaintext) as EspnAuth;
    
    return auth;
  } catch (error) {
    console.error('[Encryption] Failed to decrypt ESPN auth:', error);
    throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Test encryption/decryption round-trip
 * Useful for validating the encryption setup
 */
export async function testEncryption(): Promise<boolean> {
  try {
    const testAuth: EspnAuth = {
      espnS2: 'test-espn-s2-cookie-value',
      swid: '{test-swid-guid-value}'
    };
    
    const encrypted = await encryptEspnAuth(testAuth);
    const decrypted = await decryptEspnAuth(encrypted);
    
    return JSON.stringify(testAuth) === JSON.stringify(decrypted);
  } catch (error) {
    console.error('[Encryption] Test failed:', error);
    return false;
  }
}

/**
 * Utility to generate a new random encryption key (for setup/rotation)
 * Returns a base64-encoded key suitable for environment variables
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('base64');
}