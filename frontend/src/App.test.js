import { getValidClaims } from './utils/auth';
const token = claims => `e30.${btoa(JSON.stringify(claims))}.test-signature`;

test('rejects missing and malformed sessions', () => {
    expect(getValidClaims(null)).toBeNull();
    expect(getValidClaims('invalid')).toBeNull();
});

test('rejects expired tokens, missing expiry and missing user identity', () => {
    expect(getValidClaims(token({ id: 'alice', exp: 1 }))).toBeNull();
    expect(getValidClaims(token({ id: 'alice' }))).toBeNull();
    expect(getValidClaims(token({ exp: Date.now() / 1000 + 3600 }))).toBeNull();
});

test('accepts unexpired claims for client routing only', () => {
    const claims = { id: 'alice', exp: Date.now() / 1000 + 3600 };
    expect(getValidClaims(token(claims))).toEqual(claims);
});
