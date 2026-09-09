/*
In-memory access-token store for web mode (H-1 remediation).

The access token lives ONLY in JS module memory:
  - XSS can no longer read it from localStorage/sessionStorage/IndexedDB,
    because nothing is ever written there.
  - A page reload clears it; the session is silently restored via the
    HttpOnly refresh cookie (POST /auth/refresh, then GET /auth/me).

The refresh token is never handled in JS at all — it lives in the HttpOnly,
SameSite=Lax, Secure cookie set by the backend and is rotated server-side.
*/

let accessToken: string | null = null;
const listeners = new Set<(token: string | null) => void>();

/** Current access token, or null when logged out / not yet restored. */
export function getAccessToken(): string | null {
  return accessToken;
}

/** Store the access token in memory (and nowhere else). */
export function setAccessToken(token: string | null): void {
  accessToken = token;
  listeners.forEach((fn) => fn(token));
}

/** Drop the in-memory token (logout or failed refresh). */
export function clearAccessToken(): void {
  setAccessToken(null);
}

/** Subscribe to token changes; returns an unsubscribe function. */
export function onAccessTokenChange(fn: (token: string | null) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
