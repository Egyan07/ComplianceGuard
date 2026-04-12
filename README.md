<p align="center">
  <img src="assets/banner.svg" alt="ComplianceGuard" width="100%">
</p>

<p align="center">
  <a href="#quick-start"><img src="https://img.shields.io/badge/version-2.3.0-2563EB" alt="Version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-BSL%201.1-orange" alt="License">
  <a href="#soc-2-controls"><img src="https://img.shields.io/badge/SOC%202-29%20controls-10B981" alt="Controls"></a>
  <img src="https://img.shields.io/badge/tests-76%20passing-10B981?logo=vitest&logoColor=white" alt="Tests">
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20Web%20%7C%20Docker-6B7280" alt="Platform">
  <a href="https://github.com/Egyan07/ComplianceGuard/actions"><img src="https://img.shields.io/github/actions/workflow/status/Egyan07/ComplianceGuard/ci.yml?label=CI&logo=githubactions&logoColor=white" alt="CI"></a>
</p>

---

Compliance tools like Vanta, Drata, and Sprinto scan your cloud infrastructure. That's useful — but they can't see what's happening **on the machines themselves**. Password policies, firewall rules, event logs, running services, local user accounts — that evidence lives on the endpoint, not in AWS.

ComplianceGuard lives on the endpoint too. It collects evidence directly from Windows, scores it against 29 SOC 2 Type II controls, and tells you exactly where the gaps are. Run it as a desktop app or deploy the web version with Docker — everything stays under your control.

```
                    ┌─────────────┐
  Windows OS ──────>│ Collect     │──────> SQLite / PostgreSQL
  Event logs        │ Evidence    │        (local or hosted)
  Registry          └──────┬──────┘
  Services                 │
  Firewall                 ▼
  Users            ┌─────────────┐
  Network          │ Evaluate    │──────> Score + Gaps
  Software         │ Compliance  │        per SOC 2 control
                   └──────┬──────┘
                          │
                          ▼
                   ┌─────────────┐
                   │ Report      │──────> PDF / Dashboard
                   └─────────────┘
```

## Screenshots

### Dashboard

![ComplianceGuard Dashboard](assets/screenshots/Dashboard.png)

The dashboard shows your real-time compliance score, per-category breakdowns, and one-click access to collect evidence, run an evaluation, upload manual evidence, and export a PDF report.

### Evidence List

![Evidence List](assets/screenshots/EvidenceCollection.png)

All collected evidence items in one place — searchable and filterable by status and source. Each item shows its compliance status, collection date, and can be expanded for full details.

## Quick Start

### One-Click (Windows)

```
git clone https://github.com/Egyan07/ComplianceGuard.git
```

1. Double-click **`install.bat`** — installs all dependencies, sets up the database, and creates `start.bat`
2. Double-click **`start.bat`** — choose Desktop or Web mode and you're running

> **Prerequisites:** Windows 10/11, [Node.js 18+](https://nodejs.org/), [Python 3.10+](https://www.python.org/downloads/)

### Manual Setup

<details>
<summary>Desktop (Electron)</summary>

```bash
git clone https://github.com/Egyan07/ComplianceGuard.git
cd ComplianceGuard
npm install && cd frontend && npm install && cd ..
npm run dev
```

</details>

<details>
<summary>Web (Docker)</summary>

```bash
git clone https://github.com/Egyan07/ComplianceGuard.git
cd ComplianceGuard
cp .env.example .env          # configure your settings
docker-compose up -d
```

App at `http://localhost` (nginx proxy), API docs at `http://localhost:8000/docs`. Requires [Docker](https://docs.docker.com/get-docker/).

</details>

<details>
<summary>Build Windows Installer</summary>

```bash
npm run package    # outputs to dist/
```

</details>

## What Makes This Different

| | ComplianceGuard | Vanta / Drata / Sprinto |
|---|---|---|
| **Where it runs** | On your machine or self-hosted | In the cloud |
| **What it scans** | OS-level: event logs, registry, services, firewall, users | Cloud infra: AWS, GCP, Azure |
| **Data residency** | Never leaves your control | Stored on vendor servers |
| **Air-gapped networks** | Desktop works completely offline | Requires internet |
| **Cost** | Free tier available, Pro from $49/mo | $8k–$10k/year |
| **SOC 2 controls** | 29 implemented | Varies |

They scan the cloud. We scan the machine. Use both and you've covered the full stack.

## What It Collects

ComplianceGuard pulls 8 categories of evidence from Windows:

| Category | What's Collected | Maps To |
|----------|-----------------|---------| 
| Event Logs | Security, System, Application logs | CC7.1, CC4.1 |
| Security Settings | Password policies, audit policies, registry options | CC6.1, CC6.2, CC6.3 |
| Services | Defender, Windows Update, Firewall, Event Log status | A1.1, CC7.2 |
| Firewall | Domain, Private, Public profile configuration | CC6.5 |
| User Accounts | Local accounts, admin group membership | CC6.2, CC6.4 |
| Network | Interfaces, open ports, routing tables | CC6.5, CC6.7 |
| Software | Registry-based inventory of installed programs | CC7.2, CC8.1 |
| File Permissions | ACLs on critical system paths | CC6.1, CC6.3 |

Each evidence item is SHA-256 hashed for integrity and stored with full audit logging.

## SOC 2 Controls

29 controls across 4 categories. Each is scored by evidence coverage with configurable weights.

<details>
<summary><strong>Common Criteria (CC) — 17 controls</strong></summary>

| ID | Control | Weight |
|----|---------|--------|
| CC1.1 | Integrity and Ethical Values | 15% |
| CC1.2 | Board Independence | 10% |
| CC2.1 | Internal Communication | 10% |
| CC3.1 | Risk Assessment | 12% |
| CC4.1 | Monitoring | 13% |
| CC5.1 | Control Activities | 15% |
| CC6.1 | Logical Access Controls | 20% |
| CC6.2 | Authentication | 18% |
| CC6.3 | Authorization | 18% |
| CC6.4 | Segregation of Duties | 15% |
| CC6.5 | Network Security | 17% |
| CC6.6 | Physical Access | 12% |
| CC6.7 | Data Transmission | 15% |
| CC7.1 | Event Logging | 18% |
| CC7.2 | Vulnerability Management | 16% |
| CC8.1 | Change Management | 14% |
| CC9.1 | Risk Mitigation | 12% |

</details>

<details>
<summary><strong>Availability (A) — 4 controls</strong></summary>

| ID | Control | Weight |
|----|---------|--------|
| A1.1 | System Availability | 25% |
| A1.2 | Environmental Protection | 20% |
| A1.3 | Capacity Management | 20% |
| A1.4 | Backup and Recovery | 35% |

</details>

<details>
<summary><strong>Confidentiality (C) — 4 controls</strong></summary>

| ID | Control | Weight |
|----|---------|--------|
| C1.1 | Data Classification | 25% |
| C1.2 | Data Protection | 30% |
| C1.3 | Data Disposal | 20% |
| C1.4 | Disclosure Controls | 25% |

</details>

<details>
<summary><strong>Processing Integrity (PI) — 4 controls</strong></summary>

| ID | Control | Weight |
|----|---------|--------|
| PI1.1 | Processing Accuracy | 25% |
| PI1.2 | Input Controls | 25% |
| PI1.3 | Error Detection | 25% |
| PI1.4 | Output Review | 25% |

</details>

## Architecture

<details>
<summary><strong>Click to expand</strong></summary>

ComplianceGuard runs in two modes: **Desktop** (Electron + SQLite) for offline use, and **Web** (FastAPI + PostgreSQL + React) for hosted deployments. The frontend auto-detects which mode it's in.

```
┌──────────────────────────────────────────────────────────────┐
│  DESKTOP MODE (Electron)                                      │
│                                                               │
│  ┌─────────────────┐  ┌───────────────────────────────────┐  │
│  │ Evidence        │  │ Compliance Engine                  │  │
│  │ Processor       │  │ 29 controls · weighted scoring     │  │
│  │ Collect · Store │  │ gap analysis · recommendations     │  │
│  └────────┬────────┘  └───────────────┬───────────────────┘  │
│           └──────────┬────────────────┘                       │
│                      ▼                                        │
│           ┌─────────────────────┐                             │
│           │  SQLite + Audit Log │                             │
│           └─────────────────────┘                             │
│                      ▲                                        │
│           ┌──────────┴──────────┐  ┌────────────────────┐    │
│           │ Windows Collector   │  │ License Manager     │    │
│           │ PowerShell + WMI    │  │ Ed25519 · Offline   │    │
│           └─────────────────────┘  └────────────────────┘    │
└──────────────────────┬────────────────────────────────────────┘
                       │ IPC (context-isolated, validated)
                       ▼
┌──────────────────────────────────────────────────────────────┐
│  REACT FRONTEND                                               │
│  Dashboard · Score · Evidence · History · Settings · License  │
│  Auto-detects Electron (IPC) vs Web (HTTP) mode               │
└──────────────────────────────────────────────────────────────┘
                       ▲
                       │ HTTP / REST API
                       ▼
┌──────────────────────────────────────────────────────────────┐
│  WEB MODE (Docker / Self-Hosted)                              │
│                                                               │
│  ┌─────────────────┐  ┌───────────────────────────────────┐  │
│  │ FastAPI Backend  │  │ PostgreSQL                        │  │
│  │ Auth · Evidence  │  │ Users · Companies · Compliance    │  │
│  │ Compliance API   │  │ Evidence · Frameworks             │  │
│  └─────────────────┘  └───────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

**Key files:**

```
ComplianceGuard/
├── backend/
│   ├── app/
│   │   ├── main.py                     # FastAPI app, CORS, routes
│   │   ├── api/                        # Auth, evidence, compliance endpoints
│   │   ├── core/                       # Config, database, SOC 2 controls, auth
│   │   ├── models/                     # SQLAlchemy models (user, company, compliance, evidence)
│   │   ├── services/                   # Compliance service, evidence collector
│   │   └── integrations/aws.py         # AWS evidence collection
│   ├── migrations/                     # Alembic database migrations
│   ├── tests/                          # Unit (14) + integration (20) tests
│   ├── requirements.txt
│   └── Dockerfile
├── electron/
│   ├── main.js                         # Window mgmt, IPC handlers, tray
│   ├── preload.js                      # Secure IPC bridge with validation
│   ├── database/sqlite.js              # SQLite operations, backup
│   ├── licensing/
│   │   ├── generate-key.js             # Ed25519 keypair + license key generator
│   │   ├── license-crypto.js           # Signature verification (public key only)
│   │   ├── license-manager.js          # License state, feature gates, persistence
│   │   └── tier-constants.js           # Free vs Pro feature definitions
│   ├── processing/
│   │   ├── compliance-engine.js        # SOC 2 scoring engine (tier-aware)
│   │   ├── evidence-processor.js       # Evidence collection + storage
│   │   └── report-generator.js         # HTML → PDF report generation
│   └── system/windows.js               # Windows evidence collector
├── frontend/
│   ├── src/
│   │   ├── App.tsx                     # Theme, nav, auth gate, error boundary
│   │   ├── components/                 # Dashboard, Score, Evidence, History, Settings, Login
│   │   ├── contexts/AuthContext.tsx    # JWT auth state, login/register/logout
│   │   ├── contexts/LicenseContext.tsx # React context for tier state + feature checks
│   │   ├── services/api.ts             # Unified API (IPC or HTTP)
│   │   └── test/                       # Vitest test suite (37 tests)
│   ├── e2e/                            # Playwright e2e tests (5 tests)
│   ├── .eslintrc.cjs
│   ├── .prettierrc
│   └── Dockerfile
├── assets/
│   ├── banner.svg
│   └── screenshots/                    # Dashboard.png, EvidenceCollection.png
├── resources/icons/                    # App icons (ico, png, svg, tray)
├── install.bat                         # One-click setup (installs deps, creates start.bat)
├── .github/workflows/ci.yml            # Backend Tests → Lint & Test → Build
├── docker-compose.yml                  # PostgreSQL + Backend + Frontend + Nginx
├── nginx.conf                          # Reverse proxy, rate limiting, security headers
├── .env.example                        # Environment config template
└── package.json                        # Electron + build config
```

</details>

## Pricing

Free gets you hooked. Pro makes you audit-ready.

| | **Free** | **Pro** | **Enterprise** |
|---|---|---|---|
| **Price** | $0 forever | $49–99/mo | $299/mo + $15/machine |
| Evidence collection (all 8 categories) | ✅ | ✅ | ✅ |
| SOC 2 controls | 12 core controls | All 29 controls | All 29 controls |
| Overall compliance score | ✅ | ✅ | ✅ |
| Per-control scoring + gap details | — | ✅ | ✅ |
| Remediation recommendations | — | ✅ | ✅ |
| Upload manual evidence (policies, docs) | — | ✅ | ✅ |
| Evaluation history + trends | — | ✅ | ✅ |
| PDF audit-ready reports | — | ✅ | ✅ |
| Machines | 1 | Up to 10 | Unlimited |
| ISO 27001, HIPAA, PCI DSS | — | *Coming soon* | *Coming soon* |
| Cloud dashboard (multi-machine) | — | *Coming soon* | *Coming soon* |
| Users | 1 | Up to 10 | Unlimited |
| SSO / SAML | — | — | *Coming soon* |
| Custom compliance frameworks | — | — | *Coming soon* |
| Central policy deployment | — | — | *Coming soon* |
| Support | Community | Email | Dedicated |

> **Free tier** collects evidence and shows your overall score — enough to know where you stand. **Pro** unlocks the full 29-control breakdown, tells you exactly what to fix, and generates the PDF reports your auditor will ask for. That's the difference between knowing your score and passing the audit.

License keys use Ed25519 cryptographic signatures — verified offline, no license server required.

## Security Model

All data stays under your control. Zero telemetry.

| Layer | How |
|-------|-----|
| IPC | Context isolation. Every exposed method validates input types and uses allowlists. |
| Evidence | SHA-256 hashing on all stored files. Full audit trail with timestamps. |
| Database | Parameterized queries. Foreign key constraints. Alembic-managed migrations. |
| Navigation | External URLs blocked. `window.open` denied. |
| Licensing | Ed25519 signed keys. Only the public key ships with the app. |
| Auth (Web) | JWT tokens with configurable expiry. Bcrypt hashing. Password complexity enforced. Email verification. Password reset with expiring tokens. |
| Rate Limiting | 5 requests/min on login, 3/min on register. Nginx rate limiting at proxy layer. |
| Proxy | Nginx reverse proxy with security headers (X-Frame-Options, X-Content-Type-Options, XSS protection). |

## Development

### Desktop

```bash
npm run dev              # Electron + React dev server
npm run build            # Build frontend
npm run package          # Windows installer (.msi + .nsis)
```

### Web / Backend

```bash
docker-compose up -d     # Start all services
docker-compose down      # Stop all services
```

```bash
cd backend
pip install -r requirements.txt
alembic upgrade head                 # Run database migrations
uvicorn app.main:app --reload        # Run backend locally
```

### Tests

```bash
# Frontend (37 unit + 5 e2e)
cd frontend
npm test                 # Vitest unit tests
npm run test:e2e         # Playwright e2e tests
npm run lint             # ESLint
npm run format:check     # Prettier

# Backend (34 tests)
cd backend
python -m pytest tests/unit/ -v              # Unit tests (14)
python -m pytest tests/integration/ -v       # Integration tests (20)
```

CI runs backend tests (unit + integration), frontend lint + type check + tests, and build on every push via GitHub Actions. Total: **76 tests**.

## Roadmap

| Done | Up Next |
|------|---------|
| Evidence collection (8 categories) | Scheduled automatic collection |
| 29 SOC 2 controls with weighted scoring | ISO 27001 framework |
| PDF reports + evaluation history | HIPAA framework |
| Free / Pro licensing (Ed25519) | Cloud sync + multi-machine dashboard |
| JWT auth + login UI | macOS and Linux support |
| FastAPI + PostgreSQL + Docker + Nginx | |
| Email verification + password reset | |
| CI/CD with 76 tests (unit + integration + e2e) | |
| Alembic migrations + rate limiting | |

## License

Business Source License — see [LICENSE](LICENSE).

---

<p align="center">
  <strong>ComplianceGuard</strong> — Collect. Evaluate. Comply.
  <br><br>
  Built by <a href="https://github.com/Egyan07">Egyan07</a>
  <br>
  <a href="https://github.com/Egyan07/ComplianceGuard/issues">Report a bug</a> · <a href="https://github.com/Egyan07/ComplianceGuard/issues/new">Request a feature</a>
</p>
