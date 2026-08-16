/**
 * Navigation allowlist for the Electron main process.
 *
 * The packaged renderer loads the built app from `file://`. In development
 * the renderer is served by the Vite dev server at exactly
 * `http://localhost:5173`. Everything else must be blocked — including
 * lookalike origins such as `http://localhost:5173.evil.com`, which a naive
 * `href.startsWith('http://localhost:5173')` prefix check would let through.
 *
 * Matching is exact-origin: protocol + hostname + port must match, and the
 * URL must parse successfully (malformed input is denied).
 */

const DEV_ORIGIN = 'http://localhost:5173';

function parseUrl(rawUrl) {
  try {
    return new URL(rawUrl);
  } catch {
    return null;
  }
}

/**
 * @param {string} rawUrl
 * @returns {boolean} true when navigation to the URL is allowed
 */
function isAllowedNavigationUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return false;
  const parsed = parseUrl(rawUrl.trim());
  if (!parsed) return false;

  // Packaged renderer — the app's own local content.
  if (parsed.protocol === 'file:') return true;

  // Dev renderer — exact origin only. hostname/port are compared separately
  // so `localhost:5173.evil.com`, `127.0.0.1:5173`, and `:5174` all fail.
  return (
    parsed.protocol === 'http:' &&
    parsed.hostname === 'localhost' &&
    parsed.port === '5173'
  );
}

module.exports = { isAllowedNavigationUrl, DEV_ORIGIN };
