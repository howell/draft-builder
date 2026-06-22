/**
 * User Settings Supabase Integration Tests
 *
 * Exercises the real `user_settings` table (migration 005) through
 * SupabaseStorageAdapter: get/set round-trip, upsert-not-duplicate, and RLS
 * isolation between users. Requires a local Supabase instance.
 *
 * Setup:
 * - Local Supabase running (localhost:54321) with migrations applied
 * - NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 *   (loaded here from .env.test.local / .env.local)
 *
 * Run with: npm run test:integration
 */

import { config as loadEnv } from 'dotenv';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SupabaseStorageAdapter } from '../supabase';
import type { Database } from '@/lib/database.types';

// Integration jest config does not auto-load env files.
loadEnv({ path: '.env.test.local' });
loadEnv({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_AVAILABLE = !!(SUPABASE_URL?.includes('localhost:54321') && ANON_KEY && SERVICE_ROLE_KEY);

const TYPE = 'app';
const KEY = 'leaguePriceMultipliers';

describe('user_settings Supabase integration', () => {
  let service: SupabaseClient<Database>;
  const createdUserIds: string[] = [];

  // Create a confirmed auth user + matching public.users row; returns credentials.
  async function makeUser(): Promise<{ id: string; email: string; password: string }> {
    const email = `usersettings-${Date.now()}-${Math.random().toString(36).slice(2)}@integration.local`;
    const password = 'integration-test-password-123';
    const { data, error } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user) throw error ?? new Error('No user from admin.createUser');
    const id = data.user.id;
    const { error: userErr } = await service.from('users').upsert({ id, email });
    if (userErr) throw userErr;
    createdUserIds.push(id);
    return { id, email, password };
  }

  beforeAll(() => {
    if (!SUPABASE_AVAILABLE) {
      console.warn('Skipping user_settings integration tests - local Supabase not available');
      return;
    }
    service = createClient<Database>(SUPABASE_URL!, SERVICE_ROLE_KEY!);
  });

  afterEach(async () => {
    if (!SUPABASE_AVAILABLE) return;
    for (const id of createdUserIds) {
      await service.from('user_settings').delete().eq('user_id', id);
      await service.from('users').delete().eq('id', id);
      await service.auth.admin.deleteUser(id).catch(() => {});
    }
    createdUserIds.length = 0;
  });

  if (!SUPABASE_AVAILABLE) {
    it('skips integration tests (Supabase not available)', () => {
      expect(true).toBe(true);
    });
    return;
  }

  it('round-trips a setting and returns undefined when unset', async () => {
    const user = await makeUser();
    const adapter = new SupabaseStorageAdapter(service, user.id, {
      retryConfig: { maxRetries: 1, backoffMs: 50 },
    });

    expect(await adapter.getUserSetting(TYPE, KEY)).toBeUndefined();

    const value = { 'lg-a': 1.333, 'lg-b': 1 };
    await adapter.setUserSetting(TYPE, KEY, value);

    expect(await adapter.getUserSetting(TYPE, KEY)).toEqual(value);
  });

  it('upserts in place (one row per user/type/key) instead of duplicating', async () => {
    const user = await makeUser();
    const adapter = new SupabaseStorageAdapter(service, user.id, {
      retryConfig: { maxRetries: 1, backoffMs: 50 },
    });

    await adapter.setUserSetting(TYPE, KEY, { 'lg-a': 1.333 });
    await adapter.setUserSetting(TYPE, KEY, { 'lg-a': 1.2 });

    expect(await adapter.getUserSetting(TYPE, KEY)).toEqual({ 'lg-a': 1.2 });

    const { data, error } = await service
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .eq('type', TYPE)
      .eq('key', KEY);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it('enforces RLS: a user cannot read or write another user\'s settings', async () => {
    const userA = await makeUser();
    const userB = await makeUser();

    // Seed a row for B via the service role (bypasses RLS).
    const { error: seedErr } = await service.from('user_settings').insert({
      user_id: userB.id,
      type: TYPE,
      key: KEY,
      data: { 'lg-secret': 9 },
    });
    expect(seedErr).toBeNull();

    // Sign in as A on an anon-key client (RLS in force).
    const anonA = createClient<Database>(SUPABASE_URL!, ANON_KEY!);
    const { error: signInErr } = await anonA.auth.signInWithPassword({
      email: userA.email,
      password: userA.password,
    });
    expect(signInErr).toBeNull();

    // (a) Read of B's row is blocked → empty result.
    const { data: readB } = await anonA.from('user_settings').select('*').eq('user_id', userB.id);
    expect(readB).toEqual([]);

    // (b) Write targeting B's user_id is blocked by the WITH CHECK policy.
    const { error: writeErr } = await anonA
      .from('user_settings')
      .insert({ user_id: userB.id, type: TYPE, key: 'evil', data: { x: 1 } });
    expect(writeErr).not.toBeNull();

    // (c) A's own settings round-trip fine through an adapter bound to A.
    const adapterA = new SupabaseStorageAdapter(anonA, userA.id, {
      retryConfig: { maxRetries: 1, backoffMs: 50 },
    });
    await adapterA.setUserSetting(TYPE, KEY, { 'lg-a': 1.5 });
    expect(await adapterA.getUserSetting(TYPE, KEY)).toEqual({ 'lg-a': 1.5 });

    await anonA.auth.signOut();
  });
});
