import axios from 'axios';
import { isProtectedLeagueDenial, makeApiRequest } from '../utils';
import { PROTECTED_LEAGUE_STATUS } from '../interface';
import { supabase } from '@/lib/supabase';

jest.mock('axios', () => ({
    __esModule: true,
    default: {
        get: jest.fn(),
        request: jest.fn(),
        isAxiosError: (e: unknown) => (e as { isAxiosError?: boolean } | null)?.isAxiosError === true,
    },
}));

jest.mock('@/lib/supabase', () => ({
    supabase: { auth: { getSession: jest.fn() } },
}));

const mockRequest = axios.request as jest.Mock;
const mockGetSession = supabase.auth.getSession as jest.Mock;

const session = (token: string | null) =>
    mockGetSession.mockResolvedValue({
        data: { session: token ? { access_token: token } : null },
    });

beforeEach(() => {
    jest.clearAllMocks();
});

describe('isProtectedLeagueDenial', () => {
    it('matches only a 403 carrying the gate marker', () => {
        expect(isProtectedLeagueDenial(403, { status: PROTECTED_LEAGUE_STATUS })).toBe(true);
        expect(isProtectedLeagueDenial(403, { status: 'something else' })).toBe(false);
        expect(isProtectedLeagueDenial(200, { status: PROTECTED_LEAGUE_STATUS })).toBe(false);
        expect(isProtectedLeagueDenial(403, null)).toBe(false);
        expect(isProtectedLeagueDenial(403, 'protected league')).toBe(false);
        expect(isProtectedLeagueDenial(undefined, { status: PROTECTED_LEAGUE_STATUS })).toBe(false);
    });
});

describe('makeApiRequest auth + protected-league handling', () => {
    it('attaches the Supabase access token as a Bearer header', async () => {
        session('tok-123');
        mockRequest.mockResolvedValue({ data: { status: 'ok' } });

        await makeApiRequest('/api/fetch-league', 'POST', { league: { id: '1' } });

        expect(mockRequest).toHaveBeenCalledWith(
            expect.objectContaining({
                headers: expect.objectContaining({ Authorization: 'Bearer tok-123' }),
            })
        );
    });

    it('sends no Authorization header when signed out', async () => {
        session(null);
        mockRequest.mockResolvedValue({ data: { status: 'ok' } });

        await makeApiRequest('/api/fetch-league', 'POST', { league: { id: '1' } });

        const headers = mockRequest.mock.calls[0][0].headers;
        expect(headers).not.toHaveProperty('Authorization');
    });

    it('redirects to the newman gif on a protected-league denial', async () => {
        const assign = jest.fn();
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            value: { ...originalLocation, assign },
            writable: true,
            configurable: true,
        });
        try {
            session(null);
            mockRequest.mockRejectedValue({
                isAxiosError: true,
                message: 'Request failed with status code 403',
                response: { status: 403, data: { status: PROTECTED_LEAGUE_STATUS } },
            });

            const result = await makeApiRequest('/api/fetch-league', 'POST', {});

            expect(assign).toHaveBeenCalledWith('/newman.gif');
            expect(result).toBe('Request failed with status code 403');
        } finally {
            Object.defineProperty(window, 'location', {
                value: originalLocation,
                writable: true,
                configurable: true,
            });
        }
    });

    it('does not redirect on ordinary failures', async () => {
        const assign = jest.fn();
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            value: { ...originalLocation, assign },
            writable: true,
            configurable: true,
        });
        try {
            session(null);
            mockRequest.mockRejectedValue({
                isAxiosError: true,
                message: 'Request failed with status code 404',
                response: { status: 404, data: { status: 'Failed to find league' } },
            });

            const result = await makeApiRequest('/api/fetch-league', 'POST', {});

            expect(assign).not.toHaveBeenCalled();
            expect(result).toBe('Request failed with status code 404');
        } finally {
            Object.defineProperty(window, 'location', {
                value: originalLocation,
                writable: true,
                configurable: true,
            });
        }
    });
});
