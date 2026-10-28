import { jwtDecode } from 'jwt-decode';

// Client-side routing convenience only; the server must verify the signature.
export function getValidClaims(token) {
    try {
        const claims = jwtDecode(token);
        if (!claims.id || !Number.isFinite(claims.exp) || claims.exp * 1000 <= Date.now()) return null;
        return claims;
    } catch {
        return null;
    }
}
