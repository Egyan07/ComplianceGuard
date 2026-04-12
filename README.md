<p align="center">
  <img src="assets/banner.svg" alt="ComplianceGuard — Collect. Evaluate. Comply." width="100%">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.1.0--beta-blue" alt="Version">
  <img src="https://img.shields.io/badge/platform-Windows%2010%2F11-lightgrey?logo=windows&logoColor=white" alt="Platform">
  <img src="https://img.shields.io/badge/SOC%202-Type%20II-orange?logo=shield&logoColor=white" alt="SOC 2">
  <img src="https://img.shields.io/badge/controls-29%20implemented-brightgreen" alt="Controls">
  <img src="https://img.shields.io/github/license/Egyan07/complianceguard" alt="License">
  <img src="https://img.shields.io/badge/electron-28.0.0-191970?logo=electron&logoColor=white" alt="Electron">
  <img src="https://img.shields.io/badge/react-18-61DAFB?logo=react&logoColor=white" alt="React">
  <img src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/database-SQLite-07405E?logo=sqlite&logoColor=white" alt="SQLite">
</p>

<p align="center">
  <strong>29 SOC 2 controls</strong> · <strong>Local evidence collection</strong> · <strong>Weighted compliance scoring</strong> · <strong>Zero cloud dependencies</strong>
</p>

<p align="center">
  <strong>Author: <a href="https://github.com/Egyan07">Egyan07</a></strong>
</p>

> **Windows Only** — Collects evidence from Windows Event Logs, Registry, Services, Firewall, and User Accounts. macOS and Linux support planned.

ComplianceGuard runs on your Windows machine, collects compliance evidence directly from the operating system, scores it against SOC 2 Type II controls, and gives you a clear picture of where you stand — **without sending a single byte to the cloud.**

---

## How It Works

```
Windows System ──> Collect Evidence ──> Store Locally ──> Evaluate ──> Report
     |                   |                   |               |            |
  Event logs       Shell commands        SQLite DB      Weighted      JSON +
  Registry         + Windows APIs        with audit     scoring per   Dashboard
  Services                               logging        SOC 2 control  export
  Firewall
  User accounts
```

**1. Collect** — Click "Collect Evidence" or use the system tray. ComplianceGuard pulls data from Windows event logs, security settings, services, firewall rules, user accounts, network config, and installed software.

**2. Store** — Evidence is categorized by SOC 2 control, hashed for integrity (SHA-256), and stored in a local SQLite database. Large items (event logs) are saved as files.

**3. Evaluate** — Click "Evaluate Compliance". The engine checks evidence coverage for each of the 21 controls, applies weights, and calculates per-category and overall compliance scores.

**4. Report** — Dashboard shows real-time scores, gaps, and prioritized recommendations. Export detailed reports as JSON.

---

## Tech Stack

<p align="center">

![Electron](https://img.shields.io/badge/Electron_28-191970?style=for-the-badge&logo=electron&logoColor=white)
![React](https://img.shields.io/badge/React_18-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Material UI](https://img.shields.io/badge/Material_UI-007FFF?style=for-the-badge&logo=mui&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-07405E?style=for-the-badge&logo=sqlite&logoColor=white)
![Vite](https://img.shields.io/badge/Vite_5-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js_18+-339933?style=for-the-badge&logo=node.js&logoColor=white)

</p>

---

## Comparison

| Feature | ComplianceGuard | Vanta | Drata | Sprinto |
|---------|:--------------:|:-----:|:-----:|:-------:|
| Local evidence collection (OS-level) | :white_check_mark: | :x: | :x: | :x: |
| No cloud / no vendor lock-in | :white_check_mark: | :x: | :x: | :x: |
| No subscription required (free tier) | :white_check_mark: | :x: | :x: | :x: |
| Works in air-gapped environments | :white_check_mark: | :x: | :x: | :x: |
| Data never leaves your machine | :white_check_mark: | :x: | :x: | :x: |
| Cloud infrastructure scanning | Planned | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| SOC 2 Type II controls | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| Multi-framework (ISO 27001, HIPAA) | Planned | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| GUI dashboard | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| Audit trail | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| Open source | :white_check_mark: | :x: | :x: | :x: |
| Starting price | **Free** | ~$10k/yr | ~$10k/yr | ~$8k/yr |

**ComplianceGuard fills the gap that cloud tools miss** — endpoint-level compliance evidence that SaaS scanners can't collect.

---

## Features

### Evidence Collection
- **Windows Event Logs** — Security, System, and Application log monitoring
- **Security Settings** — Password policies, audit policies, registry security options
- **Services Monitoring** — Critical service status (Defender, Windows Update, Event Log, Firewall)
- **Firewall Analysis** — Domain, Private, and Public profile status
- **User Account Auditing** — Local accounts, administrator group membership
- **Network Configuration** — Interfaces, open ports, routing tables
- **Installed Software** — Registry-based software inventory
- **File Permissions** — Critical system path permission auditing

### Compliance Engine
- **29 SOC 2 controls** across Common Criteria (CC1-CC9), Availability (A1), Confidentiality (C1), and Processing Integrity (PI1)
- **Weighted scoring** — Each control has a configurable weight for accurate scoring
- **Gap analysis** — Identifies exactly which evidence types are missing per control
- **Prioritized recommendations** — High/medium priority remediation guidance
- **Evaluation history** — All evaluations persisted to SQLite for trend tracking

### Desktop Experience
- **System tray integration** — Runs in background, one-click evidence collection
- **Native notifications** — Windows toast notifications for collection/evaluation results
- **File dialogs** — Save reports, select evidence folders via native OS dialogs
- **Offline operation** — Complete functionality without internet
- **Automatic database backup** — One-click backup of compliance database

### Security & Audit
- **Context isolation** — Secure Electron IPC with input validation on every call
- **SHA-256 file hashing** — Evidence integrity verification
- **Complete audit trail** — Every action logged with timestamps
- **Local-only storage** — Zero external API calls, zero telemetry
- **No admin data collection** — We never see your compliance data

---

## SOC 2 Controls

### Common Criteria (CC) — 17 Controls

| ID | Control | Evidence Types | Weight |
|----|---------|---------------|--------|
| CC1.1 | Integrity and Ethical Values | Policy docs, training records, security policies | 15% |
| CC1.2 | Board Independence | Governance docs, board charter, meeting minutes | 10% |
| CC2.1 | Internal Communication | Communication policies, training materials | 10% |
| CC3.1 | Risk Assessment | Risk assessments, business objectives | 12% |
| CC4.1 | Monitoring | Audit reports, monitoring logs, checklists | 13% |
| CC5.1 | Control Activities | Control procedures, workflow documentation | 15% |
| CC6.1 | Logical Access Controls | Access logs, user accounts, system configs | 20% |
| CC6.2 | Authentication | User provisioning, access requests, identity mgmt | 18% |
| CC6.3 | Authorization | Role definitions, access matrices, policies | 18% |
| CC6.4 | Segregation of Duties | Segregation matrix, conflict analysis | 15% |
| CC6.5 | Network Security | Firewall configs, network diagrams, scans | 17% |
| CC6.6 | Physical Access | Access logs, visitor logs, security badges | 12% |
| CC6.7 | Data Transmission | Encryption policies, SSL certificates | 15% |
| CC7.1 | Event Logging | Event logs, monitoring tools, incident reports | 18% |
| CC7.2 | Vulnerability Management | Vuln scans, patch management, assessments | 16% |
| CC8.1 | Change Management | Change requests, deployment logs, approvals | 14% |
| CC9.1 | Risk Mitigation | Risk register, mitigation plans, insurance | 12% |

### Availability (A) — 4 Controls

| ID | Control | Evidence Types | Weight |
|----|---------|---------------|--------|
| A1.1 | System Availability | Uptime logs, backup logs, incident reports | 25% |
| A1.2 | Environmental Protection | Environmental logs, disaster recovery | 20% |
| A1.3 | Capacity Management | Capacity reports, performance logs | 20% |
| A1.4 | Backup and Recovery | Backup logs, recovery plans, test results | 35% |

### Confidentiality (C) — 4 Controls

| ID | Control | Evidence Types | Weight |
|----|---------|---------------|--------|
| C1.1 | Data Classification | Classification policy, data inventory, handling procedures | 25% |
| C1.2 | Data Protection | Encryption policies, access controls, DLP config | 30% |
| C1.3 | Data Disposal | Retention policy, disposal procedures, disposal records | 20% |
| C1.4 | Disclosure Controls | NDA agreements, disclosure policies, third-party agreements | 25% |

### Processing Integrity (PI) — 4 Controls

| ID | Control | Evidence Types | Weight |
|----|---------|---------------|--------|
| PI1.1 | Processing Accuracy | Processing procedures, quality controls, validation rules | 25% |
| PI1.2 | Input Controls | Input validation, data quality checks, error handling | 25% |
| PI1.3 | Error Detection | Error logs, monitoring alerts, correction procedures | 25% |
| PI1.4 | Output Review | Output validation, reconciliation reports, review procedures | 25% |

---

## Quick Start

### Option A — Development Setup

**Requirements:** Windows 10/11, Node.js 18+, npm

```bash
git clone https://github.com/Egyan07/complianceguard.git
cd complianceguard

# Install dependencies
npm install
cd frontend && npm install && cd ..

# Start development mode (React dev server + Electron)
npm run dev
```

### Option B — Production Build

```bash
# Build frontend and package Electron app for Windows
npm run package
```

The installer will be in the `dist/` directory.

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  ELECTRON MAIN PROCESS (main.js)                         │
│  Window management · System tray · IPC handlers          │
│  Database lifecycle · Native dialogs · Notifications     │
└──────────────────────┬───────────────────────────────────┘
                       │ Secure IPC (preload.js)
                       │ Input validation on every call
                       ▼
┌──────────────────────────────────────────────────────────┐
│  PROCESSING ENGINES                                      │
│  ┌─────────────────┐  ┌──────────────────────────────┐  │
│  │ Evidence        │  │ Compliance Engine             │  │
│  │ Processor       │  │ 21 controls · weighted scoring│  │
│  │ Collect · Store │  │ gap analysis · recommendations│  │
│  │ Search · Export │  │ report generation             │  │
│  └────────┬────────┘  └──────────────┬───────────────┘  │
│           │                          │                   │
│  ┌────────▼──────────────────────────▼───────────────┐  │
│  │  SQLite Database (complianceguard.db)             │  │
│  │  8 tables · indexed · FK constraints · audit log  │  │
│  └───────────────────────────────────────────────────┘  │
│                                                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Windows Evidence Collector (windows.js)          │  │
│  │  Event logs · Registry · Services · Firewall      │  │
│  │  User accounts · Network · Software · Permissions │  │
│  └───────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
                       ▲
                       │ IPC bridge
┌──────────────────────┴───────────────────────────────────┐
│  REACT FRONTEND (Material UI · TypeScript)               │
│  Dashboard · Compliance Score · Evidence List             │
│  Auto-detects Electron (IPC) vs Web (HTTP) mode          │
└──────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
complianceguard/
├── electron/                        # Electron main process
│   ├── main.js                     # Entry point + IPC handlers
│   ├── preload.js                  # Secure IPC bridge with validation
│   ├── database/
│   │   └── sqlite.js               # SQLite ops (8 tables, CRUD, backup)
│   ├── processing/
│   │   ├── compliance-engine.js    # SOC 2 evaluation engine
│   │   └── evidence-processor.js   # Evidence collection + storage
│   └── system/
│       └── windows.js              # Windows system evidence collector
├── frontend/                        # React frontend
│   ├── src/
│   │   ├── App.tsx                 # Root component (Material UI theme)
│   │   ├── components/
│   │   │   ├── Dashboard.tsx       # Main dashboard
│   │   │   ├── ComplianceScore.tsx # Score visualization
│   │   │   └── EvidenceList.tsx    # Filterable evidence browser
│   │   └── services/
│   │       └── api.ts              # Unified API (IPC / HTTP)
│   └── package.json
├── backend/                         # FastAPI backend (future cloud sync)
├── resources/icons/                 # App icons (shield + checkmark)
├── assets/                          # Banner and branding
├── package.json                     # Electron + build config
└── docker-compose.yml               # Backend dev environment
```

---

## Business Model

| | Free (Current) | Pro (Coming) | Enterprise (Coming) |
|---|---|---|---|
| **Price** | **$0** | **$49-99/mo** | **$299/mo + $15/machine** |
| SOC 2 framework | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| ISO 27001, HIPAA, PCI DSS | :x: | :white_check_mark: | :white_check_mark: |
| Local evidence collection | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| Compliance scoring + reports | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| Machines | 1 | Up to 10 | Unlimited |
| Cloud dashboard (multi-machine) | :x: | :white_check_mark: | :white_check_mark: |
| PDF audit-ready reports | :x: | :white_check_mark: | :white_check_mark: |
| Users | 1 | Up to 10 | Unlimited |
| SSO / SAML | :x: | :x: | :white_check_mark: |
| Custom frameworks | :x: | :x: | :white_check_mark: |
| Central policy deployment | :x: | :x: | :white_check_mark: |
| Support | Community | Email | Dedicated |

---

## Roadmap

| Target | Status |
|--------|--------|
| Evidence upload UI (manual docs) | In progress |
| PDF report export | Planned |
| Scheduled evidence collection | Planned |
| ISO 27001 framework | Planned |
| HIPAA framework | Planned |
| Cloud sync + web dashboard | Planned |
| macOS support | Future |
| Linux support | Future |
| AI-powered evidence classification | Future |

---

## Limitations

| Limitation | Detail |
|------------|--------|
| Windows only | Windows 10/11 required for evidence collection |
| Local only | No cloud sync yet — single machine operation |
| SOC 2 only | Additional frameworks coming soon |
| No encryption at rest | SQLite database is not encrypted (planned) |
| Single user | No multi-user access control yet |
| No auto-scheduling | Manual evidence collection (scheduling planned) |

---

## Security

| Layer | Implementation |
|-------|----------------|
| Electron | Context isolation, nodeIntegration disabled, controlled IPC |
| IPC Bridge | Input validation on every exposed method (type checks, allowlists) |
| Evidence Integrity | SHA-256 file hashing on all stored evidence files |
| Database | Foreign key constraints, parameterized queries, audit logging |
| Navigation | External navigation blocked, window.open denied |
| Data | All data local, zero external API calls, zero telemetry |

---

## Contributing

```bash
git clone https://github.com/Egyan07/complianceguard.git
cd complianceguard
npm install
cd frontend && npm install && cd ..
npm run dev
```

Contributions welcome. Please open an issue first for major changes.

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

<p align="center">
  <strong>ComplianceGuard</strong> — Collect. Evaluate. Comply.
  <br>
  <a href="https://github.com/Egyan07/complianceguard/issues">Report Issues</a> · <a href="https://github.com/Egyan07/complianceguard/issues/new">Request Feature</a>
</p>
