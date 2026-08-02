import { guardProtectedLeague } from '../leagueGate';
import { PROTECTED_LEAGUE_STATUS } from '../interface';
import { createSupabaseServerClient } from '@/lib/supabase';
import type { PlatformLeague } from '@/platforms/common';

jest.mock('@/lib/supabase', () => ({
    createSupabaseServerClient: jest.fn(),
}));

// The global next/server mock (jest.setup.ts) only provides NextResponse.json;
// makeResponse constructs NextResponse directly, so give it a real class
// backed by the whatwg-fetch Response that jest.setup installs globally.
jest.mock('next/server', () => ({
    NextResponse: class NextResponseMock extends Response {
        static json(data: unknown, init?: ResponseInit) {
            return new NextResponseMock(JSON.stringify(data), init);
        }
    },
}));

const mockCreateClient = createSupabaseServerClient as jest.Mock;

const league = (id: string): PlatformLeague => ({ platform: 'espn', id });

const request = (authHeader?: string) => ({
    headers: {
        get: (name: string) => (name.toLowerCase() === 'authorization' ? authHeader ?? null : null),
    },
});

/** getUser resolving to the given email, or an auth error when null. */
const mockGetUser = (email: string | null) => {
    const getUser = jest.fn().mockResolvedValue(
        email === null
            ? { data: { user: null }, error: { message: 'invalid JWT' } }
            : { data: { user: { email } }, error: null }
    );
    mockCreateClient.mockReturnValue({ auth: { getUser } });
    return getUser;
};

const ENV_KEYS = ['PROTECTED_LEAGUE_IDS', 'PROTECTED_LEAGUE_EMAILS'] as const;
const savedEnv: Record<string, string | undefined> = {};

beforeAll(() => {
    for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
});
beforeEach(() => {
    jest.clearAllMocks();
    for (const key of ENV_KEYS) delete process.env[key];
});
afterAll(() => {
    for (const key of ENV_KEYS) {
        if (savedEnv[key] === undefined) delete process.env[key];
        else process.env[key] = savedEnv[key];
    }
});

const expectDenied = async (result: Response | null) => {
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
    expect(await result!.json()).toEqual({ status: PROTECTED_LEAGUE_STATUS });
    // Denials are per-user decisions — they must never enter shared caches.
    expect(result!.headers.get('Cache-Control')).toBe('no-store');
};

describe('guardProtectedLeague', () => {
    it('lets every league through when no protected ids are configured', async () => {
        const getUser = mockGetUser('anyone@example.com');
        expect(await guardProtectedLeague(request(), league('781060'))).toBeNull();
        expect(getUser).not.toHaveBeenCalled();
    });

    it('lets unlisted leagues through without touching auth', async () => {
        process.env.PROTECTED_LEAGUE_IDS = '781060';
        const getUser = mockGetUser('anyone@example.com');
        expect(await guardProtectedLeague(request(), league('123456'))).toBeNull();
        expect(getUser).not.toHaveBeenCalled();
    });

    it('denies a protected league with no Authorization header', async () => {
        process.env.PROTECTED_LEAGUE_IDS = '781060';
        process.env.PROTECTED_LEAGUE_EMAILS = 'sam@example.com';
        mockGetUser('sam@example.com');
        await expectDenied(await guardProtectedLeague(request(), league('781060')));
        expect(mockCreateClient).not.toHaveBeenCalled();
    });

    it('denies when the token does not verify', async () => {
        process.env.PROTECTED_LEAGUE_IDS = '781060';
        process.env.PROTECTED_LEAGUE_EMAILS = 'sam@example.com';
        const getUser = mockGetUser(null);
        await expectDenied(
            await guardProtectedLeague(request('Bearer bad-token'), league('781060'))
        );
        expect(getUser).toHaveBeenCalledWith('bad-token');
    });

    it('denies a verified user whose email is not allowed', async () => {
        process.env.PROTECTED_LEAGUE_IDS = '781060';
        process.env.PROTECTED_LEAGUE_EMAILS = 'sam@example.com';
        mockGetUser('leaguemate@example.com');
        await expectDenied(
            await guardProtectedLeague(request('Bearer their-token'), league('781060'))
        );
    });

    it('denies everyone when ids are set but no emails are', async () => {
        process.env.PROTECTED_LEAGUE_IDS = '781060';
        mockGetUser('sam@example.com');
        await expectDenied(
            await guardProtectedLeague(request('Bearer sam-token'), league('781060'))
        );
    });

    it('allows an allowed email, case-insensitively, from a padded list', async () => {
        process.env.PROTECTED_LEAGUE_IDS = ' 781060 , 999 ';
        process.env.PROTECTED_LEAGUE_EMAILS = ' Sam@Example.com , other@example.com ';
        const getUser = mockGetUser('sam@example.COM');
        expect(
            await guardProtectedLeague(request('Bearer sam-token'), league('781060'))
        ).toBeNull();
        expect(getUser).toHaveBeenCalledWith('sam-token');
    });
});
