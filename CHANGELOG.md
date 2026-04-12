# Changelog

All notable changes to ComplianceGuard will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
