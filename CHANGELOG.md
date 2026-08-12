# Changelog

All notable changes to ComplianceGuard will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

---

## [3.5.1] — 2026-08-12

### Fixed

- **SOC 2 control count consistency** — README, desktop tier constants, the web evidence-to-control map, and the remediation scripts now match the actual 54-control framework in `soc2_controls.yaml`. Previously the README and `ALL_CONTROL_IDS` claimed 29 controls, so Pro/Enterprise desktop users were only scored against 29 of 54 controls, and several evidence types mapped to control IDs that no longer exist.
- **Pricing updated in README** to match the website (Pro $149/mo, Enterprise $599/mo).

---

## [3.5.0] — 2026-07-14

### Changed

- **Premium report redesign** — the exported report is now a polished "SOC 2 Readiness Assessment" PDF with a clean, light Apple-style design: a spacious cover with the ComplianceGuard mark and a minimal readiness emblem, an assessment-statement page with a scope summary, methodology, and a plain readiness-vs-attestation disclaimer, and a recomputable SHA-256 report fingerprint for integrity.
- **Auditor-grade control detail** — the report now presents each control in full: its objective, the specific evidence collected against it (with dates), the evidence still required, and prioritized remediation — plus a complete evidence register.
- **Trust Services Criteria** — the report now maps controls to their SOC 2 Trust Services Criteria (Security, Availability, Confidentiality, Processing Integrity, Privacy), lists the criteria in scope, and titles itself from the framework being assessed.
- **System Description** — you can now enter a system description (infrastructure, software, people, data, subservice organizations) in report settings; it renders as a dedicated SOC 2-style section in the report.
- **Remediation ownership** — assign an owner and target date to any control; the report now shows them per control and in a prioritized Remediation Roadmap.
- **Engagement type & period** — choose SOC 2 Type I or Type II with an assessment period in report settings; the report reflects the engagement type, shows the period, and frames evidence for operating-effectiveness readiness.

---

## [3.4.0] — 2026-07-05

### Added

- **Email verification & password reset pages** — the links in verification and password-reset emails now open in-app pages (`#/verify-email`, `#/reset-password`) that complete the action, instead of pointing at a non-functional URL. Both are public (no sign-in required). Email delivery remains opt-in via `EMAIL_ENABLED`.

---

## [3.3.1] — 2026-06-04

### Added

- **macOS download now available** — unsigned DMGs for both Intel (x64) and Apple Silicon (arm64) are now built automatically and attached to each release. Gatekeeper bypass on first launch: `xattr -cr /Applications/ComplianceGuard.app` or right-click → Open. (The macOS app itself shipped in 3.3.0; this release makes it downloadable.)

---

## [3.3.0] — 2026-06-04

### Added

**macOS Support — Windows and Apple Silicon / Intel**
- Native macOS evidence collection across all 8 categories: system info (`sw_vers`, `uname`), security settings (`pwpolicy`, `fdesetup`, `csrutil`), event logs (Unified Log via `log show --style compact`), services (Gatekeeper, auto-update), firewall (`/usr/libexec/ApplicationFirewall/socketfilterfw`), user accounts (`dscl`), network (`ifconfig`, `netstat`), software (`/Applications` + `~/Applications` + `system_profiler`), and file permissions on critical paths.
- Platform-aware dispatcher (`electron/system/collector.js`) — `collectEvidence()` routes to the correct OS collector at runtime; compliance engine and evidence processor require zero changes.
- Full parity with Windows: same 8 evidence bucket keys, same `Promise.allSettled` error isolation, same scoring output. A macOS evaluation produces the same compliance score structure as a Windows evaluation.
- `pwpolicy` empty response stored as `{ warning }` not `{ error }` — FileVault and SIP data in the same bucket remains valid evidence.
- SIP parsed to structured `{ sipStatus: "enabled"|"disabled"|"unknown" }` — never raw text.
- Unsigned DMG distribution (Intel + Apple Silicon) — no Apple Developer Program required. Gatekeeper bypass: `xattr -cr /Applications/ComplianceGuard.app` or right-click → Open.
- macOS Quick Start section added to README with step-by-step Gatekeeper bypass instructions.

**Compliance Score Trend — Track Your Progress Over Time**
- New `ScoreTrend` component on the History page replaces the previous basic bar chart with an Apple-quality analytics view.
- 80px score hero with negative letter-spacing and `tabular-nums` — the current score is the visual centrepiece.
- Pure SVG line chart with **monotone cubic Bézier interpolation** (Fritsch-Carlson algorithm) — guarantees the curve never overshoots and never implies scores that didn't exist. Critical for audit-grade data visualisation.
- Compliance zone bands: "Good (≥85%)", "On Track (≥70%)", "Needs Attention (<70%)" shown as subtle horizontal guide lines matching the app's existing status vocabulary.
- Framework tabs (SOC 2 / ISO 27001 / HIPAA) — switches the chart and evaluation list to the selected framework.
- Hero stat row: overall improvement delta (↑ +N pts since first evaluation) + evaluation count.
- Evaluation table in Apple two-column style — date · score bar · percentage · delta · status — sorted latest-first.
- Empty state when no evaluations: "Run your first evaluation to begin tracking compliance progression over time."
- Loading skeleton while data is fetching.
- `TrendPoint` and `TrendDisplayPoint` types added to `api.ts` with `getScoreTrend(frameworkId)` helper for both Electron (IPC) and web (REST) modes.
- No new backend endpoint — reuses existing `GET /compliance/evaluations/history` and `get-evaluation-history` IPC.
- Apple design tokens throughout: `#f5f5f7` fog canvas, `#1d1d1f` ink, 28px border-radius cards, zero box-shadow, `#34c759`/`#ff9f0a`/`#b64400` for status colours.



**Control Heatmap — See Your Gaps**
- New `ControlHeatmap` component mounted on the Dashboard below ScoreHero — shows all 29 SOC 2 controls as detail rows with score bars, status pills (Pass / Partial / Fail), and category groupings (CC, A, C, PI).
- Filter chips: All / Failing / Partial — instantly narrows the view to actionable controls.
- Failing rows highlighted with a subtle red background; passing rows are neutral. Empty state when no evaluation has been run.
- Pro gate: free-tier users see a locked view with an Upgrade to Pro prompt — same pattern as Evaluation History.
- `ControlResult` type added to `frontend/src/services/api.ts` and `frontend/src/types/electron.d.ts` — `control_results` is now fully typed across both Electron and web modes.
- Web mode: heatmap renders with empty state (per-control data requires a future backend `evaluation_id` addition — deferred to v3.3).

**Remediation Scripts — Fix Your Gaps**
- `electron/processing/remediation-scripts.js` — static map of all 29 SOC 2 controls. Six automatable via PowerShell (CC6.1 Windows Firewall, CC6.2 Password Policy, CC6.3 Audit Policy, CC6.5 Network Firewall Rules, CC7.1 Security Event Log, CC7.2 Defender + Windows Update). Twenty-three guidance-only controls with step-by-step remediation instructions.
- "Fix script" button (blue) on automatable failing controls in Electron mode. "How to fix" button (amber) on all other failing/partial controls. No colorful emojis — clean text labels only.
- Inline accordion expand: evidence gaps list + light-theme script preview + accordion footer with risk metadata ("Reversible · Requires Admin").
- `download-remediation-script` IPC handler writes the chosen script to a user-chosen `.ps1` path via `dialog.showSaveDialog`. Path injection prevented — path comes from the dialog, not renderer input.
- Audit event `remediation_script_downloaded` fires with `{ control_id, file_name }` (basename only — full path never logged; may contain username/machine name). Enterprise-only (gated behind `enterprise_audit_log` feature).
- Post-download re-scan flow: "Downloaded — run the script, then re-scan" + "Re-scan now" button. On successful re-scan, accordion auto-closes and the row transitions to green.
- `RemediationState` lifecycle: `idle → downloaded → rescanning → verified | verification_failed`. State is transient (React component state, not persisted).
- `downloadRemediationScript` typed in `ElectronAPI` interface in `electron.d.ts`.

---

## [3.2.0] — 2026-05-17

Multi-framework scoring (desktop + web), full UI overhaul to premium design quality, multiple backend/frontend features, and **Air-Gapped Enterprise tier**. No breaking changes. Alembic migration adds three Enterprise tables.

### Added

**Enterprise Tier — Air-Gapped Deployment**
- **Enterprise feature gates** — Five new gates (`enterprise_audit_log`, `enterprise_rbac`, `enterprise_pdf_branding`, `enterprise_data_export`, `enterprise_no_telemetry`) added to all three constants mirrors (Python/JS/TS). Free and Pro tiers are completely unaffected — all gates evaluate `false` for non-enterprise licenses.
- **Tamper-evident audit log** — `audit_log` table with SHA-256 hash chain (`prev_hash` + `entry_hash`). Each entry's hash covers all seven fields including score, framework, and user_id — no field can be altered without breaking the chain. `GET /api/v1/enterprise/audit-log/verify` walks the full chain from genesis and returns `{ valid, entries_checked, first_broken_at }`. Append-only at the API layer; Postgres app user is REVOKEd DELETE and UPDATE.
- **Self-audit events** — `evaluation_run`, `evidence_collected`, `enterprise_config_updated`, `role_assigned`, and `export_generated` events are automatically injected at service call sites, so every compliance-relevant action has an audit trail.
- **Custom PDF branding** — Enterprise admins can set a company name, logo (PNG/JPEG only — SVG rejected at both MIME and magic-byte layers, 512 KB cap), and report footer via `PUT /api/v1/enterprise/branding`. The Electron PDF generator reads branding from `enterprise_config` and applies it to HTML reports. Free/Pro output is byte-identical to before.
- **NDJSON streaming data export** — `GET /api/v1/enterprise/export` streams evidence, evaluations, and audit log as newline-delimited JSON (`application/x-ndjson`). Scoped to the authenticated user — no cross-tenant leakage. Electron `export-data` IPC handler saves to a file path chosen via system dialog (no renderer-controlled paths).
- **RBAC (admin + auditor roles)** — Web-only. `GET /api/v1/enterprise/users` lists all users with roles; `PUT /api/v1/enterprise/users/{user_id}/role` assigns `admin` or `auditor`. Last-admin lockout guard prevents demotion when only one admin exists (HTTP 409). First registered user is seeded as admin by the Alembic migration.
- **`require_enterprise` and `require_admin` FastAPI deps** — Single chokepoints for Enterprise and admin-role access. All Enterprise endpoints declare one of these; Free/Pro endpoints never reference them.
- **ENTERPRISE_MODE Sentry guard** — Setting `ENTERPRISE_MODE=true` disables Sentry telemetry at startup. Logged via `logger.info`. Air-gapped deployments never make outbound calls from the application layer.
- **Docker Enterprise deployment bundle** — `docker-compose.enterprise.yml` uses locally loaded image tags (zero Docker Hub pulls at runtime). `scripts/enterprise-bundle.sh` saves all images to tarballs on an internet-connected machine. `scripts/enterprise-install.sh` loads tarballs, bootstraps `.env`, starts services, and waits for health. `scripts/enterprise-update.sh` does a rolling `--force-recreate` with no registry interaction.
- **Hardened Nginx config** (`nginx.enterprise.conf`) — TLS 1.2+, strong ECDHE cipher suite, HSTS, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, server version hidden.
- **Electron Enterprise IPC** — Four new handlers (`get-enterprise-config`, `set-enterprise-config`, `get-audit-log`, `export-data`) with zod schema validation. All payloads validated; the export path comes from the system dialog, never from renderer input. Exposed to the renderer via `preload.js` contextBridge.
- **`useEnterpriseFeature(gate)` React hook** — Reads from `LicenseContext` and `FEATURE_GATES`. Returns `false` for Free/Pro; Enterprise UI components simply do not render. No conditional logic added to existing components.
- **`EnterprisePanel` Settings component** — Rendered below the License section when tier is `enterprise`. Contains four sub-sections: Branding (company name + report footer), Audit Log (paginated read-only table), Users & Roles (web only), and Data Export. Invisible to Free and Pro users.
- **ENTERPRISE chip** — License section in Settings now shows an indigo `ENTERPRISE` chip alongside `PRO` and `FREE`.
- **Alembic migration `3cef531bbe2e`** — Creates `audit_log`, `enterprise_config`, and `user_roles` tables. Seeds first admin from earliest-created user. Revokes DELETE/UPDATE on `audit_log` for Postgres. Fully idempotent on SQLite (test environments).

**UI Overhaul — Premium Design System**
- **Global design system rewrite** (`theme.ts`) — Precise Inter typography scale (h4–overline), full light/dark palettes using Slate/Indigo tokens (text `#0F172A`/`#E2E8F0`, paper `#FFFFFF`/`#1C1F2E`, divider `#E2E8F0`/`rgba(255,255,255,0.08)`), and component overrides for MuiPaper (flat border, no shadow in light mode), MuiButton (gradient contained, consistent 34px height), MuiChip, MuiOutlinedInput, and MuiDivider.
- **Topbar polish** — Gradient logo box with Apple-style inset highlight, breathing PRO badge glow animation (3s heartbeat via Framer Motion), indigo/violet user avatar gradient, frosted glass topbar with a 1px shadow strip to separate it from content.
- **Global navigation** — `ContextSidebar` now has a permanent Navigation section (Dashboard / History / Cloud / Frameworks / Settings with MUI icons) always visible on every route. Framer Motion `layoutId="sidebar-active-bg"` creates a sliding active pill that animates smoothly between routes. Sidebar background is now differentiated (`#F1F5F9` light / `#13161F` dark) from the main content area. Version stamp at the bottom.
- **Section label style** — Sidebar section labels use 0.58rem, 1.8px letter-spacing, uppercase, `text.disabled` — exact Apple sidebar label treatment.
- **Dashboard header** — Title shortened to "Dashboard" (app name is already in Topbar). Button row restructured into three visual clusters: ghost Refresh / outlined ButtonGroup (Upload · Evaluate · Export PDF) / contained primary Collect Evidence.
- **ScoreHero** — Score number enlarged to 5rem / 800 weight / `-3px` letter-spacing. Color animates via Framer Motion `animate={{ color }}` from neutral → green/amber/red as the count-up spring settles (0.6s easeOut). Empty state replaced with a purposeful dashed-border call-to-action. Blue `borderTop: 3px solid primary.main` accent stripe anchors the card visually.
- **CollectionSummary** — Dot-grid texture in light mode via CSS `::before` pseudo-element. Metric numbers at 2.2rem / tight tracking. Metric labels use ALL-CAPS, 0.65rem, 0.8px letter-spacing — Apple/Linear small stat style. Last collection timestamp whispers at `text.disabled`.
- **Framework mini-cards** — Consistent `borderLeft: 3px solid` (transparent inactive, primary active) to prevent layout shift. Active card tinted with `rgba(37,99,235,0.04)`.
- **PageTransition** — Tuned to 0.14s with cubic-bezier `[0.25, 0.1, 0.25, 1]` (CSS `ease`) for instant feel on entry.
- **MotionCard** — Hover lift reduced from `-2px` to `-1px`, spring tuned to stiffness 400 / damping 30 for tighter feel.
- **EvidenceList** — Row padding tightened to `py: 0.875`. Staggered entry capped at 8 items (max 0.24s delay) so long lists don't animate fully.
- **EvaluationHistory** — Left border timeline accent (`borderLeft: 2px solid divider`) on each entry. Trend icons scale in on mount via `motion.div`.
- **FrameworkBrowser** — Tab indicator thinned to 2px with border-radius via `slotProps.indicator`. AccordionSummary gets `borderRadius: 6px`.
- **Settings** — All section headers use overline typography style (0.6rem, 1.6px letter-spacing, 700 weight, `text.disabled`, uppercase) matching the sidebar section labels — coherent visual language. License key input uses `fontSize: '0.8rem'` monospace.
- 2 new ContextSidebar tests (global nav items always visible, cloud context section). Total: **~458**.

### Fixed (UI)
- **Duplicate framework selector** — Removed the `ToggleButtonGroup` (SOC 2 / ISO 27001 / HIPAA tabs) from `Dashboard.tsx`. Framework selection now lives exclusively in the sidebar URL-param flow, eliminating the two-control redundancy.
- **Dashboard tests** — Rewrote `Dashboard.test.tsx` to reflect URL-param framework sync instead of ToggleButton clicks.
- **ScoreHero empty state** — Replaced `--` placeholder with a purposeful dashed-border empty state message.

**Auth**
- **`GET /api/v1/auth/me`** — Returns the authenticated user's profile. Useful for frontends that need to re-hydrate user state without re-logging in.
- **`POST /api/v1/auth/resend-verification`** — Issues a fresh email verification token and re-sends the verification email. Rate-limited to 3/minute. Returns 400 if the email is already verified.
- **`PATCH /api/v1/auth/profile`** — Update `first_name` and/or `last_name`. Only provided (non-None) fields are written. Rate-limited to 10/minute. Returns `UserResponse`.
- **`DELETE /api/v1/auth/account`** — Permanently hard-deletes the authenticated user's account and all associated data (GDPR Article 17). Requires password confirmation. Cascades through control assessments → evaluations → evidence → machines → AWS credentials → refresh tokens → user in FK-safe order. Rate-limited to 3/minute.

**Evidence**
- **Evidence search and status filter** — `GET /api/v1/evidence/items` now accepts optional `?status=` (exact match) and `?search=` (case-insensitive substring on `evidence_type`) query params. Frontend `getEvidenceItems(status?, search?)` forwards the params automatically.
- **`GET /api/v1/evidence/items/{id}/controls`** — Returns the SOC 2 controls an evidence item contributes to, with base scores, using the shared `EVIDENCE_CONTROL_MAP`. Returns `{}` for unmapped types (e.g. `manual_upload`).

**Compliance**
- **Web-mode evaluation** — New `POST /api/v1/compliance/evaluate-from-evidence` endpoint auto-builds scored evidence data from the user's stored evidence items via `EVIDENCE_CONTROL_MAP`, runs the standard evaluation, and persists the result. Frontend `evaluateComplianceWeb()` calls this endpoint; `useDashboard.handleEvaluateCompliance` now works in both Electron and web mode.

**Frameworks**
- **ISO 27001:2013** — `iso27001_controls.yaml` (47 controls, all 14 Annex A domains A.5–A.18) + `ISO27001Framework` loader + read-only API at `/api/v1/iso27001`.
- **HIPAA Security Rule** — `hipaa_controls.yaml` (47 safeguards, all five 45 CFR Part 164 sections: 164.308–164.316) + `HIPAAFramework` loader + read-only API at `/api/v1/hipaa`. Includes `specification_type` (required/addressable) on every control.

**Deployment**
- **Railway one-click deploy** — `railway.toml` at repo root. README deploy button points to the template URL.

**Electron — Framework Reference Browser**
- **Browse Frameworks tab** — New read-only reference library in the Electron desktop app. Three-tab view (SOC 2 / ISO 27001 / HIPAA) with live search, risk-level filter, and controls grouped by category in collapsible accordions. Expands each control to show description, objective, implementation guidance, and (for HIPAA) specification type badge.
- **YAML bundled with desktop app** — `electron/data/` ships the three control YAML files independently of the backend, so the desktop app works fully offline.
- **IPC bridge** — `get-framework-controls` handler in the main process lazy-loads and caches each framework on first request. Strips `evidence_mapping` and defaults `risk_level` to `medium` at the boundary.

**UI Polish — Sub-project 3: Micro-interactions**
- **MotionCard** — drop-in `Card` replacement with hover lift (`y: -2px`, subtle shadow spring).
- **MotionButton** — drop-in `Button` replacement with scale press/hover spring (`scale: 1.02` hover, `0.97` tap).
- **Staggered list entry** — Evidence rows and Framework Browser accordions animate in with 40–50ms stagger on mount.
- 4 new frontend tests. Total: **~456**.

**UI Polish — Sub-project 2: Score Hero + Skeleton Loading**
- **ScoreHero card** — animated count-up score (Framer Motion spring), status badge (GOOD STANDING / ON TRACK / NEEDS ATTENTION), and three framework mini-cards for quick switching.
- **Skeleton loading** — MUI Skeleton shimmer replaces all spinners and text placeholders in Dashboard, EvidenceList, and CollectionSummary.
- 5 new frontend tests. Total: **~452**.

**UI Polish — Sub-project 1: Design Foundation + Hybrid Layout**
- **Dual theme system** — Clean Enterprise light mode and Dark Professional dark mode, switching via system preference or manual toggle (persisted to localStorage). Inter font throughout.
- **Hybrid layout shell** — 44px sticky frosted-glass topbar (logo, dark mode toggle, tier chip) + 200px context-aware sidebar that shows different nav groups per route.
- **Page transitions** — Framer Motion `opacity + y` fade on every route change (0.18s, non-distracting).
- **Framework sidebar nav** — Clicking SOC 2 / ISO 27001 / HIPAA in the sidebar sets `?fw=` URL param, synced into Dashboard's framework picker.
- 12 new frontend Vitest tests. Total: **~447**.

**Web Mode — ISO 27001 & HIPAA Scoring**
- **`POST /api/v1/iso27001/evaluate-from-evidence`** — auto-scores ISO 27001:2013 compliance from the user's stored evidence items via a 14-type evidence-to-control map. Persists result to `compliance_evaluations` with `framework_id="iso27001_v2013"`.
- **`POST /api/v1/hipaa/evaluate-from-evidence`** — same for HIPAA Security Rule (`framework_id="hipaa_security_rule"`).
- **`evaluateComplianceWeb(frameworkId)`** — frontend now routes to the correct endpoint based on the selected framework; `framework_name` in the result is also dynamic.
- Shared `score_from_map` + `derive_overall` helpers in `backend/app/core/framework_scoring.py` — reused by both new endpoints.
- 16 new tests (10 backend unit + 6 map validation). Total: **~435**.

**Electron — Multi-Framework Scoring**
- **ISO 27001 and HIPAA scoring in the desktop app** — The compliance engine now evaluates against all three frameworks (SOC 2, ISO 27001:2013, HIPAA Security Rule). Previously it silently scored SOC 2 controls regardless of which framework was requested.
- **Framework picker on the Dashboard** — A SOC 2 / ISO 27001 / HIPAA toggle sits above the compliance score card. Select a framework and click Evaluate to score it. Evidence collected in a single Windows pass contributes to all three frameworks automatically.
- **YAML as single source of truth** — All three control YAML files now carry `evidence_types` arrays, making them the authoritative input for both the read-only Framework Browser and the scoring engine. No duplicate control definitions in JS.
- **ISO 27001 and HIPAA framework rows** seeded into the local SQLite database automatically on first launch (idempotent, safe on existing databases).
- 24 new tests (13 engine unit + 6 sqlite unit + 5 Dashboard UI). Total: **404**.

**Electron — Scheduled Automatic Evidence Collection**
- **Automatic Collection** — Evidence collection now runs on a user-configured Daily or Weekly schedule while the desktop app is open. Collection sweeps all three frameworks (SOC 2, ISO 27001, HIPAA) in one pass.
- **Power-resume handling** — A `powerMonitor.resume` hook fires an immediate check when the machine wakes from sleep, preventing missed runs on laptops.
- **Tray notifications** — Success and failure both notify via the system tray. Success shows evidence count; failure shows the error message.
- **Settings UI** — New "Automatic Collection" section in Settings: enable/disable toggle, frequency (Daily/Weekly), time-of-day picker, last run status, and "Run Now" button.

- 22 new backend tests + 15 new tests (5 frontend Settings + 10 scheduler unit). Total: **231 backend** (197 unit + 26 integration + 8 e2e) + 134 frontend Vitest + 10 scheduler unit + 5 Playwright = **380 total**.

### Changed
- **`EVIDENCE_CONTROL_MAP` extracted** to `backend/app/core/evidence_mapping.py` — shared by both `compliance.py` and `evidence.py` without circular imports.

### Fixed
- **Auth API routing** — Seven call sites in `AuthContext.tsx`, `api.ts`, and `cloud-sync.js` used pre-3.1.0 `/api/auth/*` paths; corrected to `/api/v1/auth/*`.
- **Naive datetime in compliance service** — Four `datetime.now()` calls replaced with `datetime.now(timezone.utc)` in `compliance_service.py`; three corresponding test assertions updated.
- **App footer version** — Hardcoded `v3.0.0` in `App.tsx` replaced with `v{VERSION}` from `constants.ts`.

---

## [3.1.0]

Security hardening and architecture completion release. Closes all residual
production blockers identified after 3.0.0. No breaking changes.

### Added
- **Refresh token cleanup background task** — FastAPI lifespan now spawns an
  async task that runs hourly and deletes expired rows from `refresh_tokens`.
  Prevents unbounded table growth without requiring a separate cron job or
  database trigger.
- **Rate-limit Redis connectivity check at startup** — If `RATELIMIT_STORAGE_URI`
  is configured, the lifespan handler pings the backend before accepting traffic.
  Unreachable URI logs `ERROR` (with credentials stripped) instead of silently
  falling back to in-memory counters.
- **Evidence upload security tests** — New `tests/unit/test_evidence_security.py`
  covers: disallowed extension → 415, oversized streaming upload → 413,
  path-traversal `storage_path` → 404, missing file in storage root → 404.
- **SSOT version drift CI check** — `tests/unit/test_ssot_drift.py` asserts
  that `backend/app/core/constants.py`, `frontend/src/constants.ts`, and
  `electron/licensing/tier-constants.js` all carry identical `VERSION` strings.
  Fails loudly if someone bumps only one file.
- **react-query full integration** — `useDashboard` hook migrated from manual
  `useEffect`/`setState` fetching to `useQuery` (`staleTime: 30 s`,
  `refetchOnWindowFocus: true`). Mutations call
  `queryClient.invalidateQueries({ queryKey: ['dashboard'] })` so the cache
  invalidates automatically after evidence collection or compliance evaluation.
  Previously `QueryClientProvider` was wired but unused; it is now the actual
  data layer for the Dashboard.

### Changed
- **Routing** — All API routers now define only resource-level paths
  (`/auth`, `/evidence`, `/compliance`, `/machines`, `/aws-credentials`).
  The shared `/api/v1` prefix is applied exclusively in `main.py`. Auth
  moved from `/api/auth` → `/api/v1/auth` for consistency.
- **Dependency injection** — `soc2_framework` / `compliance_service`
  module-level singletons in `compliance.py` replaced with FastAPI `Depends`
  functions. Framework stays a read-only singleton; service is created fresh
  per request, eliminating cross-request in-memory cache leakage risk.
- **SOC2 controls** — Hardcoded 1 200-line Python constructor replaced by
  `soc2_controls.yaml`. Content changes (add/remove/edit a control) no longer
  require a Python deployment.
- **Dashboard decomposition** — `Dashboard.tsx` (506 lines) split into
  `useDashboard.ts` (hook), `DashboardHeader.tsx`, and `CollectionSummary.tsx`.
- **Frontend routing** — `useState<Page>` replaced by `react-router-dom`
  `HashRouter` + `Routes`/`Route` (works for both Electron `file://` and web).
- **Version string** — `Settings.tsx` footer now reads `VERSION` from
  `constants.ts` instead of the hardcoded `'2.9.0'` literal.

### Fixed
- **Email verification enforcement** — `get_current_user` now raises HTTP 403
  for unverified accounts. `get_current_user_unverified` added for
  verification-flow endpoints (`/verification-status`).
- **Refresh token revocation** — `POST /api/v1/auth/logout` marks the supplied
  refresh token's jti revoked in `refresh_tokens`; `/refresh` validates the jti
  against the DB before issuing a new access token. Stolen tokens can no longer
  be used after logout.
- **Streaming upload** — File extension checked before reading; content read in
  1 MB chunks with early abort on size exceeded. Previously the entire file was
  buffered before the size check, creating an OOM risk for large uploads.
- **N+1 query** — `selectinload(EvidenceCollection.items)` added to the
  `get_collection_status` query.
- **Log path sanitisation** — Upload and download handlers log
  `os.path.basename(stored_path)` instead of the full host path.
- **Stale TODO** — `api/__init__.py` "Task 2" stub comment removed.

### Security
- `refresh_tokens` table: every issued token now has a DB record keyed by JTI.
  `POST /api/v1/auth/logout` revokes it; `/refresh` rejects revoked/expired JTIs.
- Email verification enforced on all authenticated endpoints.
- Streaming upload rejects disallowed extensions and oversized files without
  loading the complete payload into memory.
- Path-traversal guard on evidence download now covered by automated tests.
- Rate-limit Redis backend connectivity validated at boot.

---

## [3.0.0]

Major hardening release. Lifts the codebase by closing the long-tail of security, correctness, and scaling issues that
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

## [2.9.0]

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

## [2.8.0]

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

## [2.3.1]

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

## [2.3.0]

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

## [2.2.0]

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

## [2.1.0]

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

## [2.0.1]

### Fixed
- **CI pipeline** — Added missing `vite-env.d.ts` type reference that caused `import.meta.env` TypeScript error on CI
- **TypeScript errors** — Fixed `Page` type mismatch on `onNavigate` props in App.tsx, removed unused `tier` variable in ComplianceScore
- **Test alignment** — Updated ComplianceScore test to match free-tier gating behavior (upgrade prompt instead of category breakdown)

### Changed
- README rewritten to reflect dual-mode architecture (Desktop + Web/Docker), updated file tree, architecture diagram, and roadmap

---

## [2.0.0]

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

## [1.1.0]

### Added
- **React ErrorBoundary** — Wraps all page content to prevent white-screen crashes, shows recovery UI
- **Frontend test suite** — 25+ Vitest tests covering ComplianceScore, EvidenceList, Settings, ErrorBoundary, and API service layer using @testing-library/react
- **CI/CD pipeline** — GitHub Actions workflow (`ci.yml`) runs lint, format check, type check, tests, and build on every push/PR
- **Prettier config** — `.prettierrc` with `format` and `format:check` scripts for consistent code style
- **Vitest configuration** — Added test config to `vite.config.ts` with jsdom environment and test setup file

### Changed
- **Complete brand redesign** — Replaced dark/glow/shield/circuit aesthetic with clean, flat SaaS brand identity
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

## [0.1.0-beta]

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
