/**
 * Draft-Archive Integration Tests
 *
 * Exercises the real client-side archive write path (createLiveDraftArchive)
 * against local Supabase (migration 008): authenticated INSERT grants on all
 * four archive tables, WITH CHECK ownership enforcement, the copy-then-delete
 * watermark, unique constraints, cascade delete, and the updated_at trigger.
 * These are the schema-level behaviors mocked unit tests cannot see.
 *
 * Setup:
 * - Local Supabase running (localhost:54321) with migrations applied
 * - NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 *   SUPABASE_SERVICE_ROLE_KEY (loaded from .env.test.local / .env.local)
 *
 * Run with: npm run test:integration
 */

import { config as loadEnv } from 'dotenv';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import type { IngestedFrame } from '@/hooks/queries/useLiveDraftFrames';
import { extractArchive } from '@/lib/models/live-draft/archiveExtract';
import type { BoardPlayer, LiveBoardConfig } from '@/lib/models/live-draft/liveBoard';
import { backfillArchiveValues, createLiveDraftArchive, fetchArchiveDetail } from '../archive';

// Integration jest config does not auto-load env files.
loadEnv({ path: '.env.test.local' });
loadEnv({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_AVAILABLE = !!(SUPABASE_URL?.includes('localhost:54321') && ANON_KEY && SERVICE_ROLE_KEY);

const LEAGUE_ID = '999000222';

const maybeDescribe = SUPABASE_AVAILABLE ? describe : describe.skip;
if (!SUPABASE_AVAILABLE) {
    console.warn('Skipping draft-archive integration tests - local Supabase not available');
}

const pool: BoardPlayer[] = [
    { id: '101', name: 'Alpha One', defaultPosition: 'WR', positionRank: 0, overallRank: 0 },
    { id: '102', name: 'Bravo Two', defaultPosition: 'RB', positionRank: 0, overallRank: 1 },
];

const boardConfig: LiveBoardConfig = {
    leagueId: Number(LEAGUE_ID),
    totalBudgetPerTeam: 200,
    rosterNeeds: { RB: 2, WR: 2 },
    knownTeamIds: ['1', '2', '3'],
};

/** A realistic single-lot auction plus one send-direction echo. */
const BUFFER_FRAMES = [
    { seq: 0, dir: 'receive', data: 'NOMINATION 1 25000' },
    { seq: 1, dir: 'receive', data: 'BID 1 101 1 25000 24000' },
    { seq: 2, dir: 'receive', data: 'PASSED 3 101 false' },
    { seq: 3, dir: 'receive', data: 'BID 2 101 9 25000 20000' },
    { seq: 4, dir: 'receive', data: 'SOLD 2 101 10 9 0' },
    { seq: 5, dir: 'send', data: 'PING 1' },
] as const;

maybeDescribe('draft archive integration', () => {
    let service: SupabaseClient<Database>;
    const createdUserIds: string[] = [];

    async function makeUser(): Promise<{ id: string; email: string; password: string }> {
        const email = `archive-${Date.now()}-${Math.random().toString(36).slice(2)}@integration.local`;
        const password = 'integration-test-password-123';
        const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
        if (error || !data.user) throw error ?? new Error('No user from admin.createUser');
        const id = data.user.id;
        // Migration 006's auth.users trigger creates public.users; upsert to be safe.
        const { error: userErr } = await service.from('users').upsert({ id, email });
        if (userErr) throw userErr;
        createdUserIds.push(id);
        return { id, email, password };
    }

    async function authedClient(user: { email: string; password: string }): Promise<SupabaseClient<Database>> {
        const client = createClient<Database>(SUPABASE_URL!, ANON_KEY!, { auth: { persistSession: false } });
        const { error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
        if (error) throw error;
        return client;
    }

    /** Seed the ingest buffer via the service client (the route's write path). */
    async function seedBuffer(userId: string, captureId = 'cap-int-a'): Promise<IngestedFrame[]> {
        const { data, error } = await service
            .from('live_draft_frames')
            .insert(BUFFER_FRAMES.map(f => ({
                user_id: userId,
                league_id: LEAGUE_ID,
                capture_id: captureId,
                seq: f.seq,
                ts: new Date(1756500000000 + f.seq * 1000).toISOString(),
                dir: f.dir,
                data: f.data,
            })))
            .select('id, capture_id, seq, ts, dir, data')
            .order('id');
        if (error || !data) throw error ?? new Error('seed failed');
        return data.map(row => ({
            id: row.id,
            captureId: row.capture_id,
            seq: row.seq,
            ts: row.ts,
            dir: row.dir as IngestedFrame['dir'],
            data: row.data,
        }));
    }

    beforeAll(() => {
        service = createClient<Database>(SUPABASE_URL!, SERVICE_ROLE_KEY!);
    });

    afterEach(async () => {
        for (const id of createdUserIds) {
            await service.from('live_draft_archives').delete().eq('user_id', id);
            await service.from('live_draft_frames').delete().eq('user_id', id);
            await service.from('users').delete().eq('id', id);
            await service.auth.admin.deleteUser(id).catch(() => {});
        }
        createdUserIds.length = 0;
    });

    it('archives the buffer end-to-end: header complete, children copied, buffer cleared', async () => {
        const user = await makeUser();
        const frames = await seedBuffer(user.id);
        const extract = extractArchive(frames, pool, boardConfig);
        const client = await authedClient(user);

        const progress: [number, number][] = [];
        const { archiveId, deletedThroughId } = await createLiveDraftArchive(client, {
            userId: user.id,
            leagueId: LEAGUE_ID,
            name: '2026 integration draft',
            kind: 'test',
            season: '2026',
            frames,
            extract,
            valuesSnapshotDate: '2026-08-01',
            onProgress: (done, total) => progress.push([done, total]),
        });

        expect(deletedThroughId).toBe(frames[frames.length - 1].id);
        expect(progress.length).toBeGreaterThan(0);
        expect(progress[progress.length - 1][0]).toBe(progress[progress.length - 1][1]);

        const { data: header } = await service
            .from('live_draft_archives').select('*').eq('id', archiveId).single();
        expect(header).toMatchObject({
            user_id: user.id,
            league_id: LEAGUE_ID,
            name: '2026 integration draft',
            kind: 'test',
            season: '2026',
            status: 'complete',
            frame_count: 6,
            capture_count: 1,
            pick_count: 1,
            bid_count: 3,
            value_count: 2,
            values_snapshot_date: '2026-08-01',
            total_spent: 9,
        });

        const { data: copiedFrames } = await service
            .from('live_draft_archive_frames')
            .select('source_frame_id, capture_id, seq, dir, data')
            .eq('archive_id', archiveId)
            .order('source_frame_id');
        expect(copiedFrames).toHaveLength(6);
        expect(copiedFrames!.map(f => f.data)).toEqual(BUFFER_FRAMES.map(f => f.data));
        expect(copiedFrames!.map(f => f.source_frame_id)).toEqual(frames.map(f => f.id));

        const { data: picks } = await service
            .from('live_draft_archive_picks').select('*').eq('archive_id', archiveId);
        expect(picks).toHaveLength(1);
        expect(picks![0]).toMatchObject({
            pick_number: 1,
            team_id: 2,
            player_id: 101,
            player_name: 'Alpha One',
            position: 'WR',
            price: 9,
            nominating_team_id: 1,
            observed_bid_count: 2,
            distinct_bidders: 2,
        });

        const { data: bids } = await service
            .from('live_draft_archive_bids')
            .select('kind, team_id, amount, seq')
            .eq('archive_id', archiveId)
            .order('seq');
        expect(bids).toEqual([
            { kind: 'open', team_id: 1, amount: 1, seq: 0 },
            { kind: 'pass', team_id: 3, amount: null, seq: 1 },
            { kind: 'bid', team_id: 2, amount: 9, seq: 2 },
        ]);

        const { data: values } = await service
            .from('live_draft_archive_values')
            .select('player_id, player_name, position, overall_rank, position_rank, platform_value')
            .eq('archive_id', archiveId)
            .order('overall_rank');
        expect(values).toEqual([
            { player_id: 101, player_name: 'Alpha One', position: 'WR', overall_rank: 0, position_rank: 0, platform_value: null },
            { player_id: 102, player_name: 'Bravo Two', position: 'RB', overall_rank: 1, position_rank: 0, platform_value: null },
        ]);

        const detail = await fetchArchiveDetail(client, archiveId);
        expect(detail.archive.valueCount).toBe(2);
        expect(detail.archive.valuesSnapshotDate).toBe('2026-08-01');
        expect(detail.values.map(v => v.playerId)).toEqual([101, 102]);

        const { count: remaining } = await service
            .from('live_draft_frames')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id);
        expect(remaining).toBe(0);
    });

    it('backfills values onto a pre-capture archive exactly once', async () => {
        const user = await makeUser();
        const frames = await seedBuffer(user.id);
        const client = await authedClient(user);
        // Simulate an archive created before values capture existed.
        const extract = { ...extractArchive(frames, pool, boardConfig), values: [] };
        const { archiveId } = await createLiveDraftArchive(client, {
            userId: user.id,
            leagueId: LEAGUE_ID,
            name: 'pre-capture draft',
            kind: 'test',
            season: '2026',
            frames,
            extract,
        });

        const { data: before } = await service
            .from('live_draft_archives').select('value_count').eq('id', archiveId).single();
        expect(before!.value_count).toBe(0);

        const values = [
            { playerId: 101, playerName: 'Alpha One', position: 'WR', overallRank: 0, positionRank: 0, platformValue: 41.5 },
            { playerId: 102, playerName: 'Bravo Two', position: 'RB', overallRank: 1, positionRank: 0, platformValue: null },
        ];
        const result = await backfillArchiveValues(client, {
            archiveId,
            userId: user.id,
            values,
            valuesSnapshotDate: '2026-08-02',
        });
        expect(result.valueCount).toBe(2);

        const detail = await fetchArchiveDetail(client, archiveId);
        expect(detail.archive.valueCount).toBe(2);
        expect(detail.archive.valuesSnapshotDate).toBe('2026-08-02');
        // Fractional league-scaled prices survive the round trip.
        expect(detail.values[0].platformValue).toBe(41.5);

        // A second backfill must refuse rather than blend eras.
        await expect(
            backfillArchiveValues(client, { archiveId, userId: user.id, values })
        ).rejects.toThrow(/already has a values snapshot/);
    });

    it('watermark-bounds the buffer delete: frames arriving mid-archive survive', async () => {
        const user = await makeUser();
        const frames = await seedBuffer(user.id);
        const extract = extractArchive(frames, pool, boardConfig);
        const client = await authedClient(user);

        // A frame lands after the extract was computed (mid-archive arrival).
        const { error: lateErr } = await service.from('live_draft_frames').insert({
            user_id: user.id,
            league_id: LEAGUE_ID,
            capture_id: 'cap-int-a',
            seq: 6,
            ts: new Date().toISOString(),
            dir: 'receive',
            data: 'CLOCK 2 20000 1 102 1',
        });
        expect(lateErr).toBeNull();

        await createLiveDraftArchive(client, {
            userId: user.id,
            leagueId: LEAGUE_ID,
            name: 'watermark draft',
            kind: 'test',
            season: '2026',
            frames,
            extract,
        });

        const { data: survivors } = await service
            .from('live_draft_frames').select('data').eq('user_id', user.id);
        expect(survivors).toEqual([{ data: 'CLOCK 2 20000 1 102 1' }]);
    });

    it('rejects archive rows written for another user (WITH CHECK)', async () => {
        const owner = await makeUser();
        const victim = await makeUser();
        const client = await authedClient(owner);

        const { error: headerErr } = await client.from('live_draft_archives').insert({
            user_id: victim.id,
            league_id: LEAGUE_ID,
            name: 'spoofed',
            kind: 'test',
            season: '2026',
        });
        expect(headerErr).not.toBeNull();

        // Children too: a real archive for the owner, then child rows claiming the victim.
        const { data: ownHeader, error: ownErr } = await client
            .from('live_draft_archives')
            .insert({ user_id: owner.id, league_id: LEAGUE_ID, name: 'own', kind: 'test', season: '2026' })
            .select('id')
            .single();
        expect(ownErr).toBeNull();
        const { error: childErr } = await client.from('live_draft_archive_picks').insert({
            archive_id: ownHeader!.id,
            user_id: victim.id,
            pick_number: 1,
            team_id: 1,
            player_id: 101,
            price: 1,
        });
        expect(childErr).not.toBeNull();
    });

    it('isolates archives between users under RLS', async () => {
        const owner = await makeUser();
        const other = await makeUser();
        const frames = await seedBuffer(owner.id);
        const ownerClient = await authedClient(owner);
        await createLiveDraftArchive(ownerClient, {
            userId: owner.id,
            leagueId: LEAGUE_ID,
            name: 'isolation draft',
            kind: 'test',
            season: '2026',
            frames,
            extract: extractArchive(frames, pool, boardConfig),
        });

        const otherClient = await authedClient(other);
        for (const table of [
            'live_draft_archives',
            'live_draft_archive_frames',
            'live_draft_archive_picks',
            'live_draft_archive_bids',
        ] as const) {
            const { data } = await otherClient.from(table).select('id');
            expect(data).toEqual([]);
        }
    });

    it('enforces unique constraints on archive names and frame identity', async () => {
        const user = await makeUser();
        const client = await authedClient(user);
        const header = { user_id: user.id, league_id: LEAGUE_ID, kind: 'test', season: '2026' };

        const { data: first, error: firstErr } = await client
            .from('live_draft_archives')
            .insert({ ...header, name: 'dupe me' })
            .select('id')
            .single();
        expect(firstErr).toBeNull();
        const { error: dupeName } = await client
            .from('live_draft_archives')
            .insert({ ...header, name: 'dupe me' });
        expect(dupeName?.code).toBe('23505');

        const frameRow = {
            archive_id: first!.id,
            user_id: user.id,
            source_frame_id: 1,
            capture_id: 'cap-x',
            seq: 0,
            ts: new Date().toISOString(),
            dir: 'receive',
            data: 'PING 1',
        };
        expect((await client.from('live_draft_archive_frames').insert(frameRow)).error).toBeNull();
        const { error: dupeFrame } = await client.from('live_draft_archive_frames').insert(frameRow);
        expect(dupeFrame?.code).toBe('23505');
    });

    it('cascades archive deletion to frames, picks, bids, and values', async () => {
        const user = await makeUser();
        const frames = await seedBuffer(user.id);
        const client = await authedClient(user);
        const { archiveId } = await createLiveDraftArchive(client, {
            userId: user.id,
            leagueId: LEAGUE_ID,
            name: 'cascade draft',
            kind: 'test',
            season: '2026',
            frames,
            extract: extractArchive(frames, pool, boardConfig),
        });

        const { error: deleteErr } = await client.from('live_draft_archives').delete().eq('id', archiveId);
        expect(deleteErr).toBeNull();

        for (const table of [
            'live_draft_archive_frames',
            'live_draft_archive_picks',
            'live_draft_archive_bids',
            'live_draft_archive_values',
        ] as const) {
            const { count } = await service
                .from(table).select('*', { count: 'exact', head: true }).eq('archive_id', archiveId);
            expect(count).toBe(0);
        }
    });

    it('allows renames and fires the updated_at trigger', async () => {
        const user = await makeUser();
        const client = await authedClient(user);
        const { data: created } = await client
            .from('live_draft_archives')
            .insert({ user_id: user.id, league_id: LEAGUE_ID, name: 'old name', kind: 'real', season: '2026' })
            .select('id, updated_at')
            .single();

        // updated_at has second-level visibility in comparisons; ensure a gap.
        await new Promise(resolve => setTimeout(resolve, 1100));
        const { error: renameErr } = await client
            .from('live_draft_archives')
            .update({ name: 'new name' })
            .eq('id', created!.id);
        expect(renameErr).toBeNull();

        const { data: after } = await service
            .from('live_draft_archives').select('name, updated_at').eq('id', created!.id).single();
        expect(after!.name).toBe('new name');
        expect(new Date(after!.updated_at!).getTime()).toBeGreaterThan(new Date(created!.updated_at!).getTime());
    });
});
