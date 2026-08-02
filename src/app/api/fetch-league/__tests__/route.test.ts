/**
 * The gate wiring, tested on one representative platform-data route: a
 * guardProtectedLeague denial is returned verbatim (the platform API is
 * never consulted), a pass-through proceeds, and malformed bodies 400
 * before the gate runs. The other five league-carrying routes wire the
 * guard identically.
 */

import { POST } from '../route';
import { guardProtectedLeague } from '@/app/api/leagueGate';
import { apiFor } from '@/platforms/ApiClient';

jest.mock('@/app/api/leagueGate', () => ({
    guardProtectedLeague: jest.fn(),
}));

jest.mock('@/platforms/ApiClient', () => ({
    apiFor: jest.fn(),
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

const mockGuard = guardProtectedLeague as jest.Mock;
const mockApiFor = apiFor as jest.Mock;

const LEAGUE = { platform: 'espn', id: '781060' };

const request = (body: unknown) =>
    ({
        json: async () => body,
        headers: { get: () => null },
    }) as never;

beforeEach(() => {
    jest.clearAllMocks();
});

describe('fetch-league POST protected-league gate', () => {
    it('returns the gate denial verbatim and never calls the platform', async () => {
        const denial = new Response(JSON.stringify({ status: 'protected league' }), {
            status: 403,
        });
        mockGuard.mockResolvedValue(denial);

        const res = await POST(request({ league: LEAGUE, season: '2026' }));

        expect(res).toBe(denial);
        expect(mockGuard).toHaveBeenCalledWith(expect.anything(), LEAGUE);
        expect(mockApiFor).not.toHaveBeenCalled();
    });

    it('proceeds to the platform fetch when the gate passes', async () => {
        mockGuard.mockResolvedValue(null);
        const leagueInfo = { name: 'KPG', drafted: true };
        mockApiFor.mockReturnValue({ fetchLeague: jest.fn().mockResolvedValue(leagueInfo) });

        const res = await POST(request({ league: LEAGUE, season: '2026' }));

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ status: 'ok', data: leagueInfo });
    });

    it('rejects malformed bodies before the gate runs', async () => {
        const res = await POST(request({ season: '2026' }));

        expect(res.status).toBe(400);
        expect(mockGuard).not.toHaveBeenCalled();
    });
});
