<p align="center">
  <img src="assets/banner.svg" alt="ComplianceGuard" width="100%">
</p>

<p align="center">
  <a href="#quick-start"><img src="https://img.shields.io/badge/version-1.1.0-2563EB" alt="Version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Egyan07/complianceguard" alt="License"></a>
  <a href="#soc-2-controls"><img src="https://img.shields.io/badge/SOC%202-29%20controls-10B981" alt="Controls"></a>
  <img src="https://img.shields.io/badge/platform-Windows%2010%2F11-6B7280?logo=windows&logoColor=white" alt="Platform">
  <img src="https://img.shields.io/badge/CI-passing-10B981?logo=githubactions&logoColor=white" alt="CI">
</p>

---

Compliance tools like Vanta, Drata, and Sprinto scan your cloud infrastructure. That's useful — but they can't see what's happening **on the machines themselves**. Password policies, firewall rules, event logs, running services, local user accounts — that evidence lives on the endpoint, not in AWS.

ComplianceGuard lives on the endpoint too. It collects evidence directly from Windows, scores it against 29 SOC 2 Type II controls, and tells you exactly where the gaps are. Everything stays local. No cloud account, no subscription, no data leaving your machine.

```
                    ┌─────────────┐
  Windows OS ──────>│ Collect     │──────> SQLite DB
  Event logs        │ Evidence    │        (local, hashed)
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

## Quick Start

```bash
git clone https://github.com/Egyan07/complianceguard.git
cd complianceguard
npm install && cd frontend && npm install && cd ..
npm run dev
```

> Requires Windows 10/11, Node.js 18+. The app opens in Electron. Click **Collect Evidence** → **Evaluate Compliance** → see your score.

To build a standalone installer:

```bash
npm run package    # outputs to dist/
```

## What Makes This Different

| | ComplianceGuard | Vanta / Drata / Sprinto |
|---|---|---|
| **Where it runs** | On your machine | In the cloud |
| **What it scans** | OS-level: event logs, registry, services, firewall, users | Cloud infra: AWS, GCP, Azure |
| **Data residency** | Never leaves your device | Stored on vendor servers |
| **Air-gapped networks** | Works completely offline | Requires internet |
| **Cost** | Free and open source | $8k–$10k/year |
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

Each evidence item is SHA-256 hashed for integrity and stored in a local SQLite database with full audit logging.

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

```
┌──────────────────────────────────────────────────────────┐
│  ELECTRON MAIN PROCESS                                    │
│                                                           │
│  ┌─────────────────┐  ┌──────────────────────────────┐   │
│  │ Evidence        │  │ Compliance Engine             │   │
│  │ Processor       │  │ 29 controls · weighted scoring│   │
│  │ Collect · Store │  │ gap analysis · recommendations│   │
│  └────────┬────────┘  └──────────────┬───────────────┘   │
│           └──────────┬───────────────┘                    │
│                      ▼                                    │
│           ┌─────────────────────┐                         │
│           │  SQLite + Audit Log │                         │
│           └─────────────────────┘                         │
│                      ▲                                    │
│           ┌──────────┴──────────┐                         │
│           │ Windows Collector   │                         │
│           │ PowerShell + WMI    │                         │
│           └─────────────────────┘                         │
└──────────────────────┬────────────────────────────────────┘
                       │ IPC (context-isolated, validated)
                       ▼
┌──────────────────────────────────────────────────────────┐
│  REACT FRONTEND                                           │
│  Dashboard · Score · Evidence List · History · Settings   │
│  Auto-detects Electron (IPC) vs Web (HTTP) mode           │
└──────────────────────────────────────────────────────────┘
```

**Key files:**

```
complianceguard/
├── electron/
│   ├── main.js                     # Window mgmt, IPC handlers, tray
│   ├── preload.js                  # Secure IPC bridge with validation
│   ├── database/sqlite.js          # SQLite operations, backup
│   ├── processing/
│   │   ├── compliance-engine.js    # SOC 2 scoring engine
│   │   ├── evidence-processor.js   # Evidence collection + storage
│   │   └── report-generator.js     # HTML → PDF report generation
│   └── system/windows.js           # Windows evidence collector
├── frontend/src/
│   ├── App.tsx                     # Theme, nav, error boundary
│   ├── components/                 # Dashboard, Score, Evidence, History, Settings
│   ├── services/api.ts             # Unified API (IPC or HTTP)
│   └── test/                       # Vitest test suite
├── .github/workflows/ci.yml       # Lint, test, build pipeline
└── package.json                    # Electron + build config
```

</details>

## Security Model

All data stays local. Zero external API calls. Zero telemetry.

| Layer | How |
|-------|-----|
| IPC | Context isolation. Every exposed method validates input types and uses allowlists. |
| Evidence | SHA-256 hashing on all stored files. Full audit trail with timestamps. |
| Database | Parameterized queries. Foreign key constraints. |
| Navigation | External URLs blocked. `window.open` denied. |

## Development

```bash
npm run dev              # Electron + React dev server
npm run build            # Build frontend
npm run package          # Windows installer (.msi + .nsis)
```

```bash
cd frontend
npm test                 # Run Vitest test suite
npm run lint             # ESLint
npm run format:check     # Prettier
```

CI runs automatically on every push via GitHub Actions.

## Pricing

Free gets you hooked. Pro makes you audit-ready.

| | **Free** | **Pro** | **Enterprise** |
|---|---|---|---|
| **Price** | $0 forever | $49–99/mo | $299/mo + $15/machine |
| Evidence collection (all 8 categories) | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| SOC 2 controls | 12 core controls | All 29 controls | All 29 controls |
| Overall compliance score | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| Per-control scoring + gap details | — | :white_check_mark: | :white_check_mark: |
| Remediation recommendations | — | :white_check_mark: | :white_check_mark: |
| Upload manual evidence (policies, docs) | — | :white_check_mark: | :white_check_mark: |
| Evaluation history + trends | — | :white_check_mark: | :white_check_mark: |
| PDF audit-ready reports | — | :white_check_mark: | :white_check_mark: |
| Machines | 1 | Up to 10 | Unlimited |
| ISO 27001, HIPAA, PCI DSS | — | :white_check_mark: | :white_check_mark: |
| Cloud dashboard (multi-machine) | — | :white_check_mark: | :white_check_mark: |
| Users | 1 | Up to 10 | Unlimited |
| SSO / SAML | — | — | :white_check_mark: |
| Custom compliance frameworks | — | — | :white_check_mark: |
| Central policy deployment | — | — | :white_check_mark: |
| Support | Community | Email | Dedicated |

> **Free tier** collects evidence and shows your overall score — enough to know where you stand. **Pro** unlocks the full 29-control breakdown, tells you exactly what to fix, and generates the PDF reports your auditor will ask for. That's the difference between knowing your score and passing the audit.

## Roadmap

- [x] Evidence collection from Windows OS
- [x] 29 SOC 2 controls with weighted scoring
- [x] Evidence upload UI (manual documents)
- [x] PDF compliance reports
- [x] Evaluation history with trend tracking
- [ ] Scheduled automatic collection
- [ ] ISO 27001 framework
- [ ] HIPAA framework
- [ ] Cloud sync + multi-machine dashboard
- [ ] macOS and Linux support

## License

MIT — see [LICENSE](LICENSE).

---

<p align="center">
  Built by <a href="https://github.com/Egyan07">Egyan07</a>
  <br>
  <a href="https://github.com/Egyan07/complianceguard/issues">Report a bug</a> · <a href="https://github.com/Egyan07/complianceguard/issues/new">Request a feature</a>
</p>
