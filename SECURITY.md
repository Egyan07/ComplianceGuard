# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 2.3.x   | ✅ |
| < 2.3   | ❌ |

## Reporting a Vulnerability

If you discover a security vulnerability in ComplianceGuard, please do **not** open a public GitHub issue.

Instead, report it privately by opening a [GitHub Security Advisory](https://github.com/Egyan07/ComplianceGuard/security/advisories/new) or by contacting [Egyan07](https://github.com/Egyan07) directly.

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
- **JWT authentication** — tokens use configurable expiry, bcrypt password hashing, and complexity enforcement
- **Offline licensing** — Ed25519 signed keys verified locally; no license server required
- **Rate limiting** — 5 req/min on login, 3 req/min on register; enforced at both application and Nginx proxy layers
- **SHA-256 evidence integrity** — all collected evidence files are hashed and stored with full audit trails
- **Alembic migrations** — all schema changes are versioned and applied safely

For the full security model, see the [Security Model section](README.md#security-model) in the README.
