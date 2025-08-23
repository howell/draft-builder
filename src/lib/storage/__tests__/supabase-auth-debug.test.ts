/**
 * Debug test for Supabase auth storage issue
 */

import { SupabaseStorageAdapter } from '../supabase';
import { EspnLeague } from '@/platforms/common';

// Mock the encryption utils
jest.mock('../../encryption/utils', () => ({
  encryptEspnAuth: jest.fn((auth) => Promise.resolve(Buffer.from(`encrypted-${auth.cookies}`))),
  decryptEspnAuth: jest.fn((encrypted) => Promise.resolve({ cookies: encrypted.toString().replace('encrypted-', '') }))
}));

// Mock Supabase
const mockSupabase = {
  from: jest.fn(() => ({
    upsert: jest.fn(() => ({
      select: jest.fn(() => ({
        maybeSingle: jest.fn(() => Promise.resolve({ data: { id: 1 }, error: null }))
      }))
    })),
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(() => Promise.resolve({
            data: {
              league_id: '999999',
              platform: 'espn',
              auth_data_encrypted: Buffer.from('encrypted-espn_s2=test-s2; SWID=test-swid').toString('base64')
            },
            error: null
          }))
        }))
      }))
    }))
  }))
};

describe('SupabaseStorageAdapter Auth Debug', () => {
  let adapter: SupabaseStorageAdapter;

  beforeEach(() => {
    // Restore console for debugging - override Jest setup suppression
    jest.restoreAllMocks();
    
    // Create adapter with mocked Supabase
    adapter = new SupabaseStorageAdapter(mockSupabase as any, 'test-user-id');
  });

  test('should handle ESPN league with auth correctly', async () => {
    const espnLeague: EspnLeague = {
      platform: 'espn',
      id: '999999',
      auth: {
        espnS2: 'test-espn-s2-cookie',
        swid: 'test-swid-cookie'
      }
    };

    console.log('Test league object:', JSON.stringify(espnLeague, null, 2));
    console.log('Auth property check:', {
      hasAuth: 'auth' in espnLeague,
      authValue: espnLeague.auth,
      authTruthy: !!espnLeague.auth
    });

    // Test saving
    await adapter.saveLeague('999999', espnLeague);

    // Test loading
    const loadedLeague = await adapter.loadLeague('999999');
    console.log('Loaded league:', JSON.stringify(loadedLeague, null, 2));

    expect(loadedLeague).toBeDefined();
    expect(loadedLeague?.platform).toBe('espn');
    expect((loadedLeague as EspnLeague)?.auth).toBeDefined();
  });
});