/**
 * Settings Migration Supabase Integration Tests
 *
 * Exercises `migrateAnonymousSettings` against the real `user_settings` table,
 * covering the parts a mocked client cannot prove: that the server-wins rule is
 * actually enforced by the ON CONFLICT clause, that RLS accepts the payload
 * shape, and that re-running converges.
 *
 * Requires a local Supabase instance. Run with: npm run test:integration
 */

import 'fake-indexeddb/auto';
import { config as loadEnv } from 'dotenv';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { db } from '../database-schema';
import { ANONYMOUS_USER_ID, migrateAnonymousSettings } from '../settings-migration';
import type { Database } from '@/lib/database.types';

// Integration jest config does not auto-load env files.
loadEnv({ path: '.env.test.local' });
loadEnv({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_AVAILABLE = !!(SUPABASE_URL?.includes('localhost:54321') && ANON_KEY && SERVICE_ROLE_KEY);

const RANKINGS_KEY = 'customRankings:1:2026';

function board(playerIds: string[]) {
  return {
    schemaVersion: 1,
    leagueId: '1',
    platform: 'espn',
    season: '2026',
    updated: 1,
    positions: { QB: playerIds.map(playerId => ({ kind: 'player', playerId })) },
  };
}

describe('settings migration integration', () => {
  let service: SupabaseClient<Database>;
  const createdUserIds: string[] = [];

  async function makeUser(): Promise<{ id: string; email: string; password: string }> {
    const email = `settingsmig-${Date.now()}-${Math.random().toString(36).slice(2)}@integration.local`;
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

  async function seedLocal(key: string, data: unknown) {
    await db.settings.put({
      userId: ANONYMOUS_USER_ID,
      type: 'app',
      key,
      data,
      updatedAt: new Date(1),
    });
  }

  async function readServer(userId: string, key: string) {
    const { data } = await service
      .from('user_settings')
      .select('data')
      .eq('user_id', userId)
      .eq('type', 'app')
      .eq('key', key)
      .maybeSingle();
    return data?.data;
  }

  beforeAll(() => {
    if (!SUPABASE_AVAILABLE) {
      console.warn('Skipping settings migration integration tests - local Supabase not available');
      return;
    }
    service = createClient<Database>(SUPABASE_URL!, SERVICE_ROLE_KEY!);
  });

  beforeEach(async () => {
    if (!SUPABASE_AVAILABLE) return;
    if (!db.isOpen()) await db.open();
    await db.settings.clear();
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

  afterAll(() => {
    if (db.isOpen()) db.close();
  });

  if (!SUPABASE_AVAILABLE) {
    it('skips integration tests (Supabase not available)', () => {
      expect(true).toBe(true);
    });
    return;
  }

  it('lands every anonymous setting on a fresh account', async () => {
    const user = await makeUser();
    await seedLocal(RANKINGS_KEY, board(['p1', 'p2']));
    await seedLocal('leaguePriceMultipliers', { 'lg-1': 1.25 });

    const result = await migrateAnonymousSettings(service, user.id);

    expect(result.failed).toEqual([]);
    expect(result.migrated).toHaveLength(2);
    expect(await readServer(user.id, RANKINGS_KEY)).toEqual(board(['p1', 'p2']));
    expect(await readServer(user.id, 'leaguePriceMultipliers')).toEqual({ 'lg-1': 1.25 });
    // Local copies are swept once they are safely stored.
    expect(await db.settings.where('userId').equals(ANONYMOUS_USER_ID).count()).toBe(0);
  });

  it('leaves an existing server board untouched while migrating the rest', async () => {
    // The server-wins rule. Signing in on a second device must never replace
    // work done on the first.
    const user = await makeUser();
    const serverBoard = board(['server-a', 'server-b']);
    const { error: seedErr } = await service.from('user_settings').insert({
      user_id: user.id,
      type: 'app',
      key: RANKINGS_KEY,
      data: serverBoard,
    });
    expect(seedErr).toBeNull();

    await seedLocal(RANKINGS_KEY, board(['local-only']));
    await seedLocal('leaguePriceMultipliers', { 'lg-1': 2 });

    const result = await migrateAnonymousSettings(service, user.id);

    expect(await readServer(user.id, RANKINGS_KEY)).toEqual(serverBoard);
    expect(result.skippedServerWins).toEqual(['app/customRankings:1:2026']);
    // The non-conflicting key still migrates.
    expect(await readServer(user.id, 'leaguePriceMultipliers')).toEqual({ 'lg-1': 2 });
  });

  it('does not overwrite a row inserted between the read and the write', async () => {
    // ON CONFLICT DO NOTHING is what actually enforces server-wins; the
    // pre-read is only an optimisation and cannot close this window.
    const user = await makeUser();
    const raced = board(['inserted-by-another-device']);

    const { error } = await service
      .from('user_settings')
      .upsert(
        [{ user_id: user.id, type: 'app', key: RANKINGS_KEY, data: raced }],
        { onConflict: 'user_id,type,key', ignoreDuplicates: true }
      );
    expect(error).toBeNull();

    const { error: secondErr } = await service
      .from('user_settings')
      .upsert(
        [{ user_id: user.id, type: 'app', key: RANKINGS_KEY, data: board(['loser']) }],
        { onConflict: 'user_id,type,key', ignoreDuplicates: true }
      );
    expect(secondErr).toBeNull();

    expect(await readServer(user.id, RANKINGS_KEY)).toEqual(raced);
  });

  it('is safe to re-run', async () => {
    const user = await makeUser();
    await seedLocal(RANKINGS_KEY, board(['p1']));

    await migrateAnonymousSettings(service, user.id);
    // Local rows are gone, so a second run has nothing to do and must not throw.
    const second = await migrateAnonymousSettings(service, user.id);

    expect(second.migrated).toEqual([]);
    expect(second.failed).toEqual([]);
    const { data } = await service
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .eq('key', RANKINGS_KEY);
    expect(data).toHaveLength(1);
  });

  it('is rejected by RLS when a row carries someone else\'s user_id', async () => {
    // The payload must stamp user_id on every row; RLS evaluates WITH CHECK per
    // row, and the generated Insert type marks it optional.
    const userA = await makeUser();
    const userB = await makeUser();

    const anonA = createClient<Database>(SUPABASE_URL!, ANON_KEY!);
    const { error: signInErr } = await anonA.auth.signInWithPassword({
      email: userA.email,
      password: userA.password,
    });
    expect(signInErr).toBeNull();

    const { error } = await anonA.from('user_settings').upsert(
      [
        { user_id: userA.id, type: 'app', key: 'ok', data: { a: 1 } },
        { user_id: userB.id, type: 'app', key: 'evil', data: { a: 1 } },
      ],
      { onConflict: 'user_id,type,key', ignoreDuplicates: true }
    );

    // One bad row fails the whole statement, which is why chunks are all-or-nothing.
    expect(error).not.toBeNull();
    expect(await readServer(userA.id, 'ok')).toBeUndefined();
  });
});
