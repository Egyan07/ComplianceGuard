# Changelog

All notable changes to ComplianceGuard will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [3.0.0] — 2026-04-22

Major hardening release. Lifts the codebase rating from ~7.8 to ~9.0 by
closing the long-tail of security, correctness, and scaling issues that
would have caused incidents at SaaS scale. Contains breaking changes — see
**Upgrade notes** below before deploying.

### Added
- **Filesystem-backed evidence uploads** — Manual uploads now write to
  `EVIDENCE_STORAGE_PATH` (default `./storage`). The DB stores a path only,
  not the bytes. New endpoint `GET /api/v1/evidence/items/{id}/download`
  streams the file back with a path-traversal guard.
- **HTTPS-ready nginx config** — `nginx.conf` ships HTTPS on port 443
  (SSL certs via mounted `./ssl/`), HTTP → HTTPS redirect, HSTS, a locked-
  down Content-Security-Policy, `Permissions-Policy`, and 404 responses for
  `/docs`, `/redoc`, and `/openapi.json`. `nginx.dev.conf` +
  `docker-compose.dev.yml` keep HTTP-only local dev frictionless.
- **SSOT for cross-repo constants** — `backend/app/core/constants.py`,
  `frontend/src/constants.ts`, and `electron/licensing/tier-constants.js`
  all carry `VERSION`, `VALID_LICENSE_TIERS`, `VALID_COMPLIANCE_LEVELS`,
  `MACHINE_LIMITS`, and `FEATURE_GATES` with cross-pointer headers.
- **Enriched `/health`** — Now returns `git_sha` and `started_at` alongside
  the version string, so oncall can map an incident to a specific deploy.
- **`GET /api/v1/machines` pagination** — `?limit=` (default 50, max 200)
  and `?offset=` query params.
- **CHECK constraints** — `users.license_tier` locked to
  `{free, pro, enterprise}` and `machines.compliance_level` locked to
  `{NULL, compliant, at_risk, critical}` at the DB level.
- **Rate limits on auth + credential endpoints** — `/forgot-password`
  (3/min), `/reset-password` (5/min), and every AWS-credential endpoint
  now carry slowapi limits.
- **Domain-separated credential encryption key** — Fernet key derived from
  `SECRET_KEY` via HKDF-SHA256 with label
  `complianceguard:credential-encryption:v1`. Legacy SHA-256 derivation
  retained as a read-only fallback so pre-3.0 rows still decrypt.
- **Multi-worker rate-limit backend** — `RATELIMIT_STORAGE_URI` env var is
  honoured (e.g. `redis://host:6379/0`). Starting under `WORKERS>1` without
  a shared backend logs a WARNING.
- **Ruff lint step in CI** — New `pyproject.toml` with the CI rule set;
  `backend-tests` now runs `ruff check app` before pytest.
- **Pip caching + release-job `build` dependency** — CI's release job was
  able to ship even when the frontend build broke; it now waits on `build`.
- **Alembic migrations `7a1c4f9b2d08` and `8b2e7c1d5a19`** — data-model
  hardening (CHECKs, `Machine.updated_at`, nullable
  `ComplianceFramework.company_id`) and index on
  `evidence_collections.user_id`.

### Changed — breaking
- **Hardcoded docker-compose fallbacks removed.** `SECRET_KEY` and
  `DB_PASSWORD` no longer have silent defaults. An unset value aborts the
  stack at boot with a readable error. Existing deployments relying on the
  published demo values will fail fast — set real values in `.env` before
  upgrading.
- **Manual evidence storage format changed.** Uploads are now written to
  the filesystem; `data.content_base64` on `EvidenceItem` is gone. Any
  automation that reached into that column must switch to the new
  `GET /api/v1/evidence/items/{id}/download` endpoint. (If you have
  existing base64 rows, write a one-time script to extract and rewrite
  them — see `backend/app/api/evidence.py` for the new shape.)
- **`GET /api/v1/machines` is paginated by default.** Old callers that
  assumed an unbounded list now receive at most 50 machines. Pass
  `?limit=200&offset=…` if you need more.
- **Electron `cloudConnect` sends `application/x-www-form-urlencoded`.**
  Fixes silent 422 on every sign-in in ≤2.9.0. No action required — this
  was simply broken before.
- **`fleet_stats` and `get_machines` no longer load the full machines
  table into Python.** Same API shape; only the query plan changed.

### Fixed
- **Grace-period lockout.** `electron/licensing/license-crypto.js` now
  returns `valid: true` during the 7-day renewal grace window. Paid
  desktop users were previously kicked off on the day of expiry.
- **`datetime.utcnow()` deprecation.** Replaced with
  `datetime.now(timezone.utc)` in all production code.
- **Module-load side effects on tests.** `run_migrations()` now runs from
  the FastAPI lifespan handler, so importing `app.main` in tests does not
  hit the DB.
- **Unbounded in-memory eval cache.** `ComplianceService.evaluations` is
  now a `collections.OrderedDict` capped at 100 entries (FIFO).
- **Mutating a Pydantic v2 model post-construction.** `Settings`
  environment overrides are now applied via `@model_validator(mode="after")`
  instead of a module-level `setattr` loop.
- **`SECRET_KEY` captured at module import.** JWT helpers now resolve the
  key lazily, so pytest env-var overrides are honoured.
- **`pydantic.v1.ConfigDict` import** in `config.py` removed; three
  `class Config:` blocks migrated to `ConfigDict(...)`.
- **Cloud-sync plaintext fallback.** `secure-storage.js` fallback path now
  AES-256-GCM-encrypts values with a machine-derived key and logs a loud
  warning, instead of storing plaintext. `decryptString` throws a
  descriptive error on failure instead of returning an empty string.
- **Windows evidence collection sequential loop.** Ten `exec` calls now
  run concurrently via `Promise.allSettled`, each with a 30s default
  timeout. Fixed a pre-existing `log` variable shadow in `collectEventLogs`.
- **Web-mode license activation.** `LicenseContext.activateLicense` now
  calls `POST /api/auth/activate-license` instead of returning
  "Requires desktop app".
- **Release CI gap.** `release` job now `needs: [..., build]`.

### Security
- **CSRF invariant documented.** `backend/app/api/auth.py` now carries a
  top-of-file comment spelling out that auth state rides in the
  `Authorization` header only — the API is CSRF-safe as long as no
  cookie-based auth path is ever introduced without explicit CSRF
  protection.

### Upgrade notes
1. Set `SECRET_KEY` and `DB_PASSWORD` in your `.env` (generate with
   `openssl rand -hex 32` for the former). The stack will refuse to start
   otherwise.
2. Provide TLS certificates at `./ssl/cert.pem` and `./ssl/key.pem` for the
   production `nginx` service, or run the dev stack via
   `docker-compose -f docker-compose.yml -f docker-compose.dev.yml up`.
3. If you run `uvicorn` with `WORKERS>1`, set
   `RATELIMIT_STORAGE_URI=redis://…` — otherwise rate limits silently
   multiply by worker count.
4. Expose `GIT_SHA` (usually via CI) in your deploy env to get meaningful
   `git_sha` values in `/health`.
5. Run Alembic: `alembic upgrade head` applies `7a1c4f9b2d08` and
   `8b2e7c1d5a19`. Existing rows whose `license_tier` is outside
   `{free, pro, enterprise}` — or `compliance_level` outside
   `{compliant, at_risk, critical}` — will fail the new CHECK. Fix the
   data first.

### Developer experience
- Backend test DB now runs Alembic migrations (via `create_test_database`
  → `alembic upgrade head`) instead of `Base.metadata.create_all`. New
  migrations are exercised by every pytest run.
- `requirements.txt` and `requirements-test.txt` ranges relaxed so Python
  3.13 contributors don't need a Rust toolchain.
- `frontend/src/types/electron.d.ts` replaces the `(window as any)` casts
  in `LicenseContext` with a typed surface.

---

## [2.9.0] — 2026-04-17

### Added
- **Cloud Dashboard** — Pro/Enterprise web page showing fleet overview (total machines, compliant, at risk, critical, avg score) and per-machine table with hostname, score, last sync time, and status badge; stale machines (no sync in 7+ days) flagged with a warning
- **Machine sync API** — `POST /api/v1/machines/sync` for Electron apps to register and update machine compliance snapshots; enforces tier limits (Free=1, Pro=10, Enterprise=unlimited)
- **Fleet stats API** — `GET /api/v1/machines/fleet-stats` and `GET /api/v1/machines` (both Pro-gated)
- **Sync to Cloud button** — Electron Dashboard gains a "Sync to Cloud" button when cloud sync is configured, posting current score, compliance level, and evidence count to the web server
- **Cloud Sync settings** — New section in Electron Settings for entering server URL and credentials; JWT tokens stored in SQLite
- **Machine model** — New `machines` table with Alembic migration (`2b7e3f4a9c1d`)
- 17 new tests (11 backend + 6 frontend) — total now 311

### Changed
- Version bumped to 2.9.0
- README: cloud dashboard promoted from "Coming soon" to ✅ in pricing table; limitations and FAQ updated; roadmap updated; test count updated to 311

---

## [2.8.0] - 2026-04-16

### Added
- **Email delivery** — `app/core/email.py` with `send_verification_email` and `send_password_reset_email` using `aiosmtplib`; SMTP configured via `SMTP_*` env vars; silent no-op when `EMAIL_ENABLED=false` (default); verification and reset links use configurable `APP_BASE_URL`
- **JWT refresh tokens** — `create_refresh_token` / `verify_refresh_token` in `app/core/auth.py`; `POST /api/auth/refresh` exchanges a 7-day refresh token for a new access token; login and register responses now include `refresh_token`
- **Frontend auto-refresh** — `api.ts` response interceptor retries 401 requests after refreshing the access token; parallel 401s are queued and replayed with the new token; failed refresh rejects all queued requests and clears auth state
- **Web mode license enforcement** — `app/core/license.py` ports Ed25519 signature verification from `electron/licensing/license-crypto.js` to Python (`cryptography` library); `User` model gains `license_tier` (default `"free"`) and `license_key` columns; `require_pro` FastAPI dependency returns HTTP 402 for free-tier users
- **License endpoints** — `POST /api/auth/activate-license` verifies key signature, validates license email matches the authenticated user, and stores the tier; `GET /api/auth/license-info` decodes the stored key for live expiry/grace-period data
- **Pro-gated compliance endpoints** — `/evaluations/history`, `/evaluations/{id}/control-assessments`, `/evaluations/{id}/report`, and `/controls/{id}/trend` now require `require_pro`
- **Sentry error monitoring** — `sentry-sdk[fastapi]` integrated in backend (FastAPI + SQLAlchemy integrations, `send_default_pii=False`); `@sentry/react` with `browserTracingIntegration` integrated in frontend; both are silent no-ops when `SENTRY_DSN` / `VITE_SENTRY_DSN` are unset
- **Alembic migration** — Adds `license_tier` (server_default `"free"`) and `license_key` to the `users` table

### Fixed
- **CORS hardcoded** — `main.py` now reads `allow_origins` from `settings.cors_origins` instead of a hardcoded list; `docker-compose.yml` updated to `CORS_ORIGINS`; `.env.example` updated to JSON array format required by pydantic-settings v2
- **PDF render timing** — Electron `export-pdf-report` handler replaces `setTimeout(1000)` with `did-finish-load` event; `reportWindow.destroy()` called on `did-fail-load` to prevent resource leak
- **SMTP failures silenced** — Email send errors are caught and logged in the auth endpoints; registration and password reset succeed even when SMTP is unavailable
- **Pending request hang** — `api.ts` interceptor now stores both `onSuccess` and `onFailure` callbacks per queued request; on refresh failure all queued requests are properly rejected instead of hanging indefinitely
- **License sharing** — `activate-license` endpoint validates the license `email` field matches the authenticated user's email before activating
- **`get_license_info` stale data** — Endpoint now calls `verify_license_key` on the stored key to return live expiry and grace-period data

### Changed
- New dependencies: `aiosmtplib>=3.0.0`, `cryptography>=42.0.0`, `sentry-sdk[fastapi]>=2.0.0` in `backend/requirements.txt`; `@sentry/react` in frontend
- New env vars: `APP_BASE_URL`, `SMTP_HOST/PORT/USER/PASSWORD/FROM_EMAIL/FROM_NAME/TLS/SSL`, `EMAIL_ENABLED`, `CORS_ORIGINS` (JSON array), `SENTRY_DSN`, `SENTRY_TRACES_SAMPLE_RATE`, `VITE_SENTRY_DSN` — all documented in `.env.example`
- Test count: **175 backend + 114 frontend unit + 5 frontend e2e = 294 tests**

---

## [2.3.1] - 2026-04-13

### Fixed
- **Password validation deduplication** — Extracted shared `validate_password_strength()` helper in `auth.py`; removes duplicated 10-line validation block from both `register` and `reset_password` endpoints
- **timezone.utc in compliance health** — `compliance_health_check()` now uses `datetime.now(timezone.utc)` consistently with the rest of the backend; eliminates naive datetime in the one place it was missed
- **execSync → async** — All `execSync` calls in `electron/system/windows.js` replaced with `promisify(exec)`; evidence collection no longer blocks the Electron main thread during collection

### Added
- **test_compliance_service.py** — 49 unit tests covering `ComplianceService` evaluate logic, scoring, status determination, compliance level, recommendations, risk assessment, next review date, trend, and report export
- **test_auth_helpers.py** — 29 unit tests covering `validate_password_strength`, register edge cases, email verification flow, and full forgot/reset password cycle
- **test_models.py** — 22 unit tests covering `EvidenceCollection`, `EvidenceItem`, `ComplianceEvaluationRecord`, and `ControlAssessmentRecord` model creation, defaults, JSON fields, and cascade deletes

### Changed
- **e2e tests wired into CI** — `tests/e2e/` now runs in the `backend-tests` CI job via `--run-e2e` flag
- **UpgradePrompt.test.tsx** — 14 tests covering rendering (open/closed), feature name display, button interactions, onGoToSettings callback, and missing prop safety
- **EvidenceUpload.test.tsx** — 22 tests covering rendering, upload mode toggle, validation, field interactions, file picker in electron mode, and file auto-fill behaviour
- **EvaluationHistory.test.tsx** — 8 tests covering free tier upgrade prompt, onNavigate callback, electron mode, and no-crash rendering
- Total test count: **142 backend + 119 frontend unit + 5 frontend e2e = 266 tests**

---

## [2.3.0] - 2026-04-12

### Added
- **Email verification** — Registration generates a verification token; `/verify-email` endpoint validates it; `/verification-status` checks current state
- **Password reset flow** — `/forgot-password` generates a 1-hour reset token; `/reset-password` validates token, expiry, and password complexity; returns 200 on nonexistent email to prevent user enumeration
- **Playwright e2e tests** — 5 tests covering login page rendering, tab switching, invalid login error display, tagline, and logo; `npm run test:e2e` script
- **Alembic migration** — New migration for `is_verified`, `verification_token`, `reset_token`, `reset_token_expires` on users table

### Fixed
- **datetime deprecation** — Replaced all `datetime.utcnow()` with `datetime.now(timezone.utc)` across backend (auth, evidence collector, AWS integration); eliminates Python 3.12 deprecation warnings

### Changed
- Total test count: **34 backend + 37 frontend + 5 e2e = 76 tests**

---

## [2.2.0] - 2026-04-12

### Added
- **Password complexity enforcement** — Register endpoint validates min 8 chars, uppercase, lowercase, digit, and special character per app config
- **Rate limiting** — Login capped at 5 req/min, register at 3 req/min per IP via slowapi; auto-disabled in test environment
- **Compliance evaluation persistence** — New `ComplianceEvaluationRecord` and `ControlAssessmentRecord` models; evaluate and history endpoints now read/write to DB instead of in-memory dict
- **Nginx reverse proxy** — `nginx.conf` with security headers (X-Frame-Options, X-Content-Type-Options, XSS), rate limiting zone, and SSL-ready config; uncommented in docker-compose
- **LoginPage tests** — 6 Vitest tests covering form rendering, tab switching, error display, and tagline
- **Weak password test** — Integration test verifying short/simple passwords are rejected
- **Alembic evaluation migration** — Auto-generated migration for compliance_evaluations and control_assessments tables

### Changed
- App startup runs `alembic upgrade head` instead of `Base.metadata.create_all` (fallback for tests without alembic.ini)
- Compliance evaluate and history endpoints now require JWT auth
- App version bumped to `2.1.0` in FastAPI metadata
- Total test count: **29 backend + 37 frontend = 66 tests**

---

## [2.1.0] - 2026-04-12

### Added
- **Login / Register UI** — Tabbed auth page for web mode with email + password; Electron mode skips login
- **AuthContext** — React context managing JWT token, user state, login/register/logout across the app
- **Logout button** — AppBar shows sign-out icon with user email on hover
- **Evidence persistence** — `EvidenceCollection` and `EvidenceItem` SQLAlchemy models; evidence endpoints now write to and read from the database
- **Evidence list endpoints** — New `/evidence/items` and `/evidence/collections` endpoints with pagination
- **Alembic migrations** — Initialized with auto-generated initial migration covering all 5 tables (users, companies, compliance_frameworks, evidence_collections, evidence_items)
- **API integration tests** — 14 tests covering full auth flow, evidence CRUD, compliance endpoints, and health checks
- **Shared auth dependency** — `deps.py` with `get_current_user` using real JWT verification + DB user lookup

### Fixed
- **Backend auth** — Replaced fake `get_current_user` (accepted any bearer token) with proper JWT verification
- **Evidence collect crash** — Fixed `**None` dict unpacking when AWS credentials not provided
- **Docker Compose paths** — Changed `./complianceguard/backend` → `./backend` to work from repo root
- **Backend Dockerfile** — Updated to Python 3.12, fixed `migrations/` copy path, added `curl` for healthcheck
- **Frontend Dockerfile** — Updated to Node 20 to match CI
- **conftest.py** — Removed duplicate `pytest_configure` and `pytest_collection_modifyitems`
- **Auth API tests** — Rewrote with proper `dependency_overrides` and in-memory SQLite instead of broken mocks
- **bcrypt compatibility** — Pinned `bcrypt==4.0.1` to fix `passlib` AttributeError on CI

### Changed
- Backend CI now runs both unit tests and integration tests
- Evidence summary endpoint returns real aggregated data from user's collections
- Health endpoint returns real timestamp and version `2.0.0`
- CORS origins include `localhost:3000` for Docker mode
- `Base.metadata.create_all` called on startup to auto-create tables

---

## [2.0.1] - 2026-04-12

### Fixed
- **CI pipeline** — Added missing `vite-env.d.ts` type reference that caused `import.meta.env` TypeScript error on CI
- **TypeScript errors** — Fixed `Page` type mismatch on `onNavigate` props in App.tsx, removed unused `tier` variable in ComplianceScore
- **Test alignment** — Updated ComplianceScore test to match free-tier gating behavior (upgrade prompt instead of category breakdown)

### Changed
- README rewritten to reflect dual-mode architecture (Desktop + Web/Docker), updated file tree, architecture diagram, and roadmap

---

## [2.0.0] - 2026-04-12

### Added
- **Pro tier licensing system** — Ed25519 signed license keys, offline verification, no server dependency
- **License key management UI** — Activate/deactivate Pro license from Settings page with key input field
- **Feature gating** — Free tier limited to 12 of 29 SOC 2 controls with overall score only; Pro unlocks full breakdown, recommendations, PDF reports, evidence upload, and evaluation history
- **Upgrade prompts** — Contextual dialogs when free users click gated features (Upload Evidence, Export PDF) with path to activation
- **LicenseContext** — React context providing tier state, feature checks, and license management to all components
- **UpgradePrompt component** — Reusable upgrade dialog with feature description and "Enter License Key" action
- **License key generator** — Dev-only CLI tool for generating Ed25519 keypairs and signed license keys for testing
- **Tier-aware compliance engine** — Evaluates only allowed controls per tier, redacts per-control details for free users
- **IPC gating** — Main process rejects gated IPC calls (evidence upload, PDF export, evaluation history) for free tier with `upgrade_required` flag
- **Tier indicator in AppBar** — Shows FREE or PRO badge next to app name

### Changed
- Compliance engine constructor now accepts optional `licenseManager` parameter
- Dashboard buttons (Upload Evidence, Export PDF) check license tier before executing
- EvaluationHistory page shows upgrade prompt instead of empty state for free users
- ComplianceScore hides per-control breakdown for free tier with upgrade messaging
- Version bump `1.1.0` → `2.0.0` across all files

---

## [1.1.0] - 2026-04-12

### Added
- **React ErrorBoundary** — Wraps all page content to prevent white-screen crashes, shows recovery UI
- **Frontend test suite** — 25+ Vitest tests covering ComplianceScore, EvidenceList, Settings, ErrorBoundary, and API service layer using @testing-library/react
- **CI/CD pipeline** — GitHub Actions workflow (`ci.yml`) runs lint, format check, type check, tests, and build on every push/PR
- **Prettier config** — `.prettierrc` with `format` and `format:check` scripts for consistent code style
- **Vitest configuration** — Added test config to `vite.config.ts` with jsdom environment and test setup file

### Changed
- **Complete brand redesign** — Replaced AI-generated dark/glow/shield/circuit aesthetic with clean, flat SaaS brand identity
  - New logo: Blue (#2563EB) rounded square with white "CG" lettermark (like Notion, Linear, Slack)
  - New banner: White background, clean typography, blue accent lines — no glow, no circuits, no dark backgrounds
  - New favicon: Blue square with white "C" — readable at 16x16
  - Tray icons: Clean blue (normal) and green (active) variants
  - All raster icons regenerated (ICO, PNG at all sizes)
- **App theme overhaul** — Updated Material UI theme to match new brand
  - Primary color: `#0091EA` → `#2563EB` (professional blue)
  - Secondary color: `#00E5FF` → `#10B981` (emerald green)
  - AppBar: Dark navy gradient → clean white with subtle border
  - Footer: Dark `#0A0E1A` → light `#F8FAFC` with border
  - Navigation buttons: Cyan highlights → blue highlights on light blue
  - BETA badge: White-on-dark → blue-on-light-blue
- **Version bump** — `0.1.0-beta` → `1.1.0` across package.json, README, Settings, banner, and footer

### Removed
- Shield + checkmark icon (replaced by CG lettermark)
- Dark gradient backgrounds from AppBar and footer
- Neon cyan accent color (`#00E5FF`)
- Circuit trace patterns, hexagonal nodes, glow filters from all SVGs
- `Shield` icon import from App.tsx

---

## [0.1.0-beta] - 2026-04-12

### Added
- **Evidence Upload UI** — Dialog form to manually upload policy documents, screenshots, and text evidence mapped to SOC 2 controls
- **File picker** — Native OS file dialog for selecting evidence files (PDF, DOC, images, etc.)
- **Evaluation History** — Timeline view with score trend chart, status indicators, and control breakdowns for all past evaluations
- **Settings page** — App info, database backup, dark mode toggle (placeholder), compliance framework list
- **PDF report export** — Styled HTML-to-PDF compliance reports via Electron's printToPDF (cover page, score breakdown, recommendations)
- **29 SOC 2 controls** — Expanded from 21 to 29 with Confidentiality (C1.1–C1.4) and Processing Integrity (PI1.1–PI1.4) categories
- **App navigation** — Dashboard, Evaluation History, and Settings pages with icon buttons in AppBar
- **Premium README** — Banner, badges, comparison table, architecture diagram, business model, roadmap
- **CHANGELOG.md** — This file
- **LICENSE** — MIT License

### Fixed
- **Electron main process** — Fixed dev server port mismatch (3000 → 5173), production build path (build → dist), added missing IPC handlers
- **SQLite database** — Removed broken `require('remote')`, replaced `setTimeout` race condition with proper async/await, added missing CRUD methods
- **Preload security** — Input validation on all exposed IPC methods, removed unvalidated registry access
- **Compliance engine** — Queries database for frameworks instead of hardcoded return, proper report generation
- **Evidence processor** — Working delete flow, correct SOC 2 control mappings, audit logging
- **Frontend ↔ Electron** — Auto-detects desktop vs web mode, uses IPC in Electron and HTTP in web

### Removed
- Tracked `.pyc`, `__pycache__`, and `.db` files from git
- Placeholder icon README
- Deprecated Electron APIs (`enableRemoteModule`, `worldSafeExecuteJavaScript`)
- Dangerous unvalidated `readRegistryKey` IPC exposure

### Security
- Added root `.gitignore` (Python, Node, IDE, .env, .db files)
- Context isolation enforced in Electron with input validation on every IPC call
- External navigation blocked, `window.open` denied
- SHA-256 file hashing on all stored evidence files
