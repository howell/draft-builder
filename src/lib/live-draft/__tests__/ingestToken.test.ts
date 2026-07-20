import { formatIngestToken, mintIngestSecret, parseIngestToken } from '../ingestToken';

const USER_ID = 'adcf21b2-a16b-4053-884e-b486186310d2';

describe('ingest token helpers', () => {
    it('round-trips a minted token', () => {
        const secret = mintIngestSecret();
        expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes, base64url, unpadded
        const parsed = parseIngestToken(formatIngestToken(USER_ID, secret));
        expect(parsed).toEqual({ userId: USER_ID, secret });
    });

    it('mints distinct secrets', () => {
        expect(mintIngestSecret()).not.toEqual(mintIngestSecret());
    });

    it('splits at the first dot only', () => {
        // base64url of a UUID contains no dots, but be robust anyway
        const secret = mintIngestSecret();
        const token = formatIngestToken(USER_ID, secret);
        expect(parseIngestToken(token)!.secret).toBe(secret);
    });

    it('rejects malformed tokens', () => {
        const secret = mintIngestSecret();
        expect(parseIngestToken('')).toBeNull();
        expect(parseIngestToken('no-dot')).toBeNull();
        expect(parseIngestToken(`.${secret}`)).toBeNull();
        expect(parseIngestToken('!!!not-base64url!!!.' + secret)).toBeNull();
        // decodes but is not a UUID
        expect(parseIngestToken(`${btoa('not-a-uuid')}.${secret}`)).toBeNull();
        // bad secret charset / length
        expect(parseIngestToken(formatIngestToken(USER_ID, 'short'))).toBeNull();
        expect(parseIngestToken(formatIngestToken(USER_ID, 'has spaces in it which is not allowed'))).toBeNull();
    });

    it('normalizes userId casing', () => {
        const secret = mintIngestSecret();
        const parsed = parseIngestToken(formatIngestToken(USER_ID.toUpperCase(), secret));
        expect(parsed!.userId).toBe(USER_ID);
    });
});
