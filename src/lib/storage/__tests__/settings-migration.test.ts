/**
 * @jest-environment jsdom
 */

import 'fake-indexeddb/auto';
import { db } from '../database-schema';
import {
  ANONYMOUS_USER_ID,
  countMigratableAnonymousSettings,
  isSubstantiveSetting,
  loadMigratableAnonymousSettings,
  migrateAnonymousSettings,
} from '../settings-migration';
import { INGEST_SETTING_KEY } from '@/lib/live-draft/ingestToken';

const USER = 'user-1';

type UpsertCall = { payload: any[]; options: any };

/**
 * Minimal stand-in for the Supabase client. Only the two calls this module makes
 * are modelled, so a change in call shape shows up as a test failure rather than
 * being silently absorbed by a permissive mock.
 */
function makeSupabase(options: {
  existing?: Array<{ type: string; key: string }>;
  readError?: { message: string };
  upsertError?: { message: string } | ((call: number) => { message: string } | null);
} = {}) {
  const upserts: UpsertCall[] = [];
  let upsertCount = 0;

  const client = {
    upserts,
    from(table: string) {
      expect(table).toBe('user_settings');
      return {
        select: (_columns: string) => ({
          eq: async (_column: string, _value: string) => ({
            data: options.readError ? null : (options.existing ?? []),
            error: options.readError ?? null,
          }),
        }),
        upsert: async (payload: any[], upsertOptions: any) => {
          upserts.push({ payload, options: upsertOptions });
          upsertCount += 1;
          const err = typeof options.upsertError === 'function'
            ? options.upsertError(upsertCount)
            : options.upsertError;
          return { error: err ?? null };
        },
      };
    },
  };
  return client as any;
}

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

async function seed(key: string, data: unknown, userId = ANONYMOUS_USER_ID, type = 'app') {
  await db.settings.put({ userId, type: type as any, key, data, updatedAt: new Date(1) });
}

beforeEach(async () => {
  if (!db.isOpen()) await db.open();
  await db.settings.clear();
});

afterAll(() => {
  db.close();
});

describe('isSubstantiveSetting', () => {
  it('accepts a board with players and a populated map', () => {
    expect(isSubstantiveSetting({ type: 'app', key: 'k', data: board(['a']) })).toBe(true);
    expect(isSubstantiveSetting({ type: 'app', key: 'k', data: { 'lg-1': 1.2 } })).toBe(true);
  });

  it('rejects empty husks that would otherwise trigger the migration prompt', () => {
    expect(isSubstantiveSetting({ type: 'app', key: 'k', data: {} })).toBe(false);
    expect(isSubstantiveSetting({ type: 'app', key: 'k', data: board([]) })).toBe(false);
    expect(isSubstantiveSetting({ type: 'app', key: 'k', data: null })).toBe(false);
    expect(isSubstantiveSetting({ type: 'app', key: 'k', data: [] })).toBe(false);
  });

  it('rejects the ingest credential and unknown types', () => {
    expect(isSubstantiveSetting({ type: 'app', key: INGEST_SETTING_KEY, data: { s: 'x' } })).toBe(false);
    expect(isSubstantiveSetting({ type: 'nonsense' as any, key: 'k', data: { a: 1 } })).toBe(false);
  });
});

describe('loadMigratableAnonymousSettings', () => {
  it('returns only substantive anonymous rows', async () => {
    await seed('customRankings:1:2026', board(['a']));
    await seed('empty', {});
    await seed(INGEST_SETTING_KEY, { secret: 'x' });
    await seed('someoneElse', board(['b']), 'other-user');

    const rows = await loadMigratableAnonymousSettings();

    expect(rows.map(r => r.key)).toEqual(['customRankings:1:2026']);
    expect(await countMigratableAnonymousSettings()).toBe(1);
  });
});

describe('migrateAnonymousSettings', () => {
  it('sends only keys the account does not already have', async () => {
    await seed('customRankings:1:2026', board(['a']));
    await seed('leaguePriceMultipliers', { 'lg-1': 1.2 });
    const supabase = makeSupabase({ existing: [{ type: 'app', key: 'leaguePriceMultipliers' }] });

    const result = await migrateAnonymousSettings(supabase, USER);

    expect(result.migrated).toEqual(['app/customRankings:1:2026']);
    expect(result.skippedServerWins).toEqual(['app/leaguePriceMultipliers']);
    expect(supabase.upserts).toHaveLength(1);
    expect(supabase.upserts[0].payload.map((r: any) => r.key)).toEqual(['customRankings:1:2026']);
  });

  it('stamps user_id on every row', async () => {
    // RLS evaluates WITH CHECK per row and the generated Insert type marks
    // user_id optional, so only a test can catch an omission.
    await seed('a', board(['1']));
    await seed('b', board(['2']));
    const supabase = makeSupabase();

    await migrateAnonymousSettings(supabase, USER);

    const rows = supabase.upserts.flatMap((c: UpsertCall) => c.payload);
    expect(rows).toHaveLength(2);
    expect(rows.every((r: any) => r.user_id === USER)).toBe(true);
  });

  it('lets the database enforce server-wins', async () => {
    await seed('a', board(['1']));
    const supabase = makeSupabase();

    await migrateAnonymousSettings(supabase, USER);

    // DO NOTHING, so a row inserted by another device between the read and the
    // write is preserved rather than overwritten.
    expect(supabase.upserts[0].options).toEqual({
      onConflict: 'user_id,type,key',
      ignoreDuplicates: true,
    });
  });

  it('never sends the ingest credential', async () => {
    await seed(INGEST_SETTING_KEY, { secret: 'x' });
    await seed('customRankings:1:2026', board(['a']));
    const supabase = makeSupabase();

    const result = await migrateAnonymousSettings(supabase, USER);

    const keys = supabase.upserts.flatMap((c: UpsertCall) => c.payload.map((r: any) => r.key));
    expect(keys).not.toContain(INGEST_SETTING_KEY);
    expect(result.skippedByPolicy).toContain(`app/${INGEST_SETTING_KEY}`);
  });

  it('chunks large migrations', async () => {
    for (let i = 0; i < 45; i++) {
      await seed(`customRankings:${i}:2026`, board(['a']));
    }
    const supabase = makeSupabase();

    await migrateAnonymousSettings(supabase, USER);

    expect(supabase.upserts).toHaveLength(3);
    expect(supabase.upserts[0].payload).toHaveLength(20);
    expect(supabase.upserts[2].payload).toHaveLength(5);
  });

  it('clears the local rows once everything is stored', async () => {
    await seed('customRankings:1:2026', board(['a']));

    await migrateAnonymousSettings(makeSupabase(), USER);

    // Otherwise hasMigratableData stays true and /migrate re-redirects forever.
    expect(await db.settings.where('userId').equals(ANONYMOUS_USER_ID).count()).toBe(0);
  });

  it('keeps the local rows when a chunk fails', async () => {
    await seed('customRankings:1:2026', board(['a']));
    const supabase = makeSupabase({ upsertError: { message: 'boom' } });

    const result = await migrateAnonymousSettings(supabase, USER);

    expect(result.failed).toEqual([{ key: 'app/customRankings:1:2026', error: 'boom' }]);
    expect(await db.settings.where('userId').equals(ANONYMOUS_USER_ID).count()).toBe(1);
  });

  it('reports a partial failure without losing the rows that did land', async () => {
    for (let i = 0; i < 25; i++) {
      await seed(`customRankings:${i}:2026`, board(['a']));
    }
    const supabase = makeSupabase({ upsertError: call => (call === 2 ? { message: 'boom' } : null) });

    const result = await migrateAnonymousSettings(supabase, USER);

    expect(result.migrated).toHaveLength(20);
    expect(result.failed).toHaveLength(5);
    expect(await db.settings.where('userId').equals(ANONYMOUS_USER_ID).count()).toBe(25);
  });

  it('writes nothing when the existing-keys read fails', async () => {
    await seed('customRankings:1:2026', board(['a']));
    const supabase = makeSupabase({ readError: { message: 'offline' } });

    const result = await migrateAnonymousSettings(supabase, USER);

    // A failed read must not be mistaken for an empty account.
    expect(supabase.upserts).toHaveLength(0);
    expect(result.failed).toEqual([{ key: 'app/customRankings:1:2026', error: 'offline' }]);
    expect(await db.settings.where('userId').equals(ANONYMOUS_USER_ID).count()).toBe(1);
  });

  it('retains local rows when asked to', async () => {
    await seed('customRankings:1:2026', board(['a']));

    await migrateAnonymousSettings(makeSupabase(), USER, { clearLocalAfterMigration: false });

    expect(await db.settings.where('userId').equals(ANONYMOUS_USER_ID).count()).toBe(1);
  });

  it('is a no-op when there is nothing substantive to migrate', async () => {
    await seed('empty', {});
    const supabase = makeSupabase();

    const result = await migrateAnonymousSettings(supabase, USER);

    expect(supabase.upserts).toHaveLength(0);
    expect(result.migrated).toEqual([]);
    expect(result.skippedByPolicy).toEqual(['app/empty']);
  });

  it('re-running after success migrates nothing further', async () => {
    await seed('customRankings:1:2026', board(['a']));
    await migrateAnonymousSettings(makeSupabase(), USER);

    const second = await migrateAnonymousSettings(makeSupabase(), USER);

    expect(second.migrated).toEqual([]);
  });
});
