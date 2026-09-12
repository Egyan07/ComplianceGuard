# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 4.2.x   | ✅ |
| 4.1.x   | ✅ (security fixes only) |
| < 4.1   | ❌ |

## Reporting a Vulnerability

If you discover a security vulnerability in ComplianceGuard, please do **not** open a public GitHub issue.

Instead, report it privately by opening a [GitHub Security Advisory](https://github.com/Egyan07/ComplianceGuard/security/advisories/new) or by contacting [getcomplianceguard@gmail.com](mailto:getcomplianceguard@gmail.com).

Please include:
- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fix if you have one

You can expect an acknowledgement within 48 hours and a resolution timeline within 7 days for critical issues.

## Security Model

ComplianceGuard is designed with the following security principles:

- **Zero telemetry** — no data leaves your machine or self-hosted infrastructure
- **Context isolation** — Electron IPC bridge uses `contextIsolation: true` with `nodeIntegration: false`
- **Input validation** — every IPC method validates input types using allowlists
- **Web session security** — browser access tokens are held in memory only (never localStorage/sessionStorage); the persistent session is an HttpOnly, SameSite=Strict refresh cookie (Secure in production) that rotates on every use with family reuse detection. Desktop clients receive the refresh token in the response body instead
- **Password handling** — bcrypt hashing with the real 72-byte input limit enforced; complexity rules configurable; password reset revokes all refresh tokens
- **One-time email tokens hashed** — password-reset and email-verification tokens are stored as SHA-256 hashes, never plaintext
- **Offline licensing** — Ed25519 signed keys verified locally; no license server required
- **Rate limiting** — 5 req/min on login, 3 req/min on register, enforced at the application and nginx proxy layers. Scaled-out production (WORKERS>1 or REPLICAS>1) refuses to start without a shared limiter backend (`RATELIMIT_STORAGE_URI`), so limits cannot silently weaken per process
- **Non-public internals** — `/metrics` serves loopback and `METRICS_ALLOWED_IPS` only; API docs and the OpenAPI schema are disabled in production (`API_DOCS_ENABLED` overrides); nginx additionally 404s all of these on the public internet
- **SHA-256 evidence integrity** — all collected evidence files are hashed and stored with full audit trails
- **Tamper-evident enterprise audit log** — HMAC-SHA256 keyed hash chain, append-only at the API layer
- **Alembic migrations** — all schema changes are versioned and applied safely

For the full security model, see the [Security Model section](README.md#security-model) in the README.
