# ComplianceGuard

<div align="center">

[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)](https://github.com/Egyan07/complianceguard)
[![Platform](https://img.shields.io/badge/platform-Windows-lightgrey.svg)](https://github.com/Egyan07/complianceguard)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](https://github.com/Egyan07/complianceguard/blob/master/LICENSE)
[![SOC 2](https://img.shields.io/badge/compliance-SOC%202-orange.svg)](https://github.com/Egyan07/complianceguard)
[![Electron](https://img.shields.io/badge/electron-28.0.0-blue.svg)](https://electronjs.org/)

**Desktop-first SOC 2 Compliance Automation**

A standalone Windows application that collects compliance evidence directly from your machine - no cloud dependencies, no data leaving your infrastructure.

</div>

---

## What is ComplianceGuard?

ComplianceGuard is a desktop compliance tool that automates SOC 2 evidence collection from Windows systems. Unlike cloud-based tools (Vanta, Drata, etc.) that scan your cloud accounts, ComplianceGuard inspects the actual machines - event logs, firewall rules, services, user accounts, registry settings - and scores them against SOC 2 controls.

**Why desktop-first?**
- Your compliance data never leaves your machine
- Works in air-gapped and high-security environments
- Scans what cloud tools can't see (local OS configuration, endpoint security)
- Zero hosting costs, zero subscription required for basic use

## Features

**Working now:**
- Windows evidence collection (event logs, services, firewall, user accounts, network, registry, installed software)
- SOC 2 Type II framework with 21 controls across Common Criteria and Availability
- Compliance scoring engine with weighted evaluation
- Evidence storage in local SQLite database
- Dashboard with compliance score visualization
- Evidence list with filtering and search
- Manual evidence upload (documents, text)
- Compliance report generation (JSON)
- System tray integration
- Audit logging

**Planned:**
- Additional frameworks (ISO 27001, HIPAA, PCI DSS)
- Optional cloud sync for multi-machine management
- PDF report export
- Scheduled evidence collection
- macOS and Linux support

## Quick Start

### Prerequisites
- Windows 10/11 (64-bit)
- Node.js 18+
- npm

### Development Setup

```bash
# Clone repository
git clone https://github.com/Egyan07/complianceguard.git
cd complianceguard

# Install root dependencies (Electron + SQLite)
npm install

# Install frontend dependencies
cd frontend && npm install && cd ..

# Start development mode (React dev server + Electron)
npm run dev
```

### Build for Production

```bash
# Build frontend and package Electron app
npm run package
```

The built application will be in the `dist/` directory.

## Architecture

```
ComplianceGuard Desktop
├── Electron Main Process
│   ├── SQLite Database (local, no server)
│   ├── Evidence Processor (collects + stores evidence)
│   ├── Compliance Engine (evaluates controls, generates scores)
│   └── Windows Integration (event logs, registry, services, firewall)
├── Secure IPC Bridge (preload.js with input validation)
└── React Frontend (Material UI dashboard)
    ├── Compliance Score (real-time scoring display)
    ├── Evidence List (filterable evidence browser)
    └── Dashboard (collection summary + evaluation controls)
```

**How it works:**
1. User clicks "Collect Evidence" - Electron collects data from Windows APIs
2. Evidence Processor categorizes and stores data in SQLite, mapped to SOC 2 controls
3. User clicks "Evaluate Compliance" - Compliance Engine scores each control based on evidence coverage
4. Dashboard displays scores, gaps, and recommendations

## SOC 2 Controls Implemented

### Common Criteria (CC)
| Control | Title | Evidence Types |
|---------|-------|---------------|
| CC1.1 | Integrity and Ethical Values | Policy documents, training records, security policies |
| CC1.2 | Board Independence | Governance documents, board charter |
| CC2.1 | Internal Communication | Communication policies, training materials |
| CC3.1 | Risk Assessment | Risk assessments, business objectives |
| CC4.1 | Monitoring | Audit reports, monitoring logs |
| CC5.1 | Control Activities | Control procedures, workflow documentation |
| CC6.1-6.7 | Logical & Physical Access | Access logs, user accounts, firewall configs, network diagrams |
| CC7.1-7.2 | System Operations | Event logs, vulnerability scans, patch management |
| CC8.1 | Change Management | Change requests, deployment logs |
| CC9.1 | Risk Mitigation | Risk register, mitigation plans |

### Availability (A)
| Control | Title | Evidence Types |
|---------|-------|---------------|
| A1.1 | System Availability | Uptime logs, backup logs, incident reports |
| A1.2 | Environmental Protection | Environmental logs, disaster recovery |
| A1.3 | Capacity Management | Capacity reports, performance logs |
| A1.4 | Backup and Recovery | Backup logs, recovery plans, test results |

## Project Structure

```
complianceguard/
├── electron/                    # Electron main process
│   ├── main.js                 # App entry point + IPC handlers
│   ├── preload.js              # Secure IPC bridge
│   ├── database/
│   │   └── sqlite.js           # SQLite database operations
│   ├── processing/
│   │   ├── compliance-engine.js # SOC 2 evaluation engine
│   │   └── evidence-processor.js # Evidence collection + storage
│   └── system/
│       └── windows.js          # Windows system evidence collector
├── frontend/                    # React frontend
│   ├── src/
│   │   ├── App.tsx             # Root component
│   │   ├── components/
│   │   │   ├── Dashboard.tsx   # Main dashboard
│   │   │   ├── ComplianceScore.tsx
│   │   │   └── EvidenceList.tsx
│   │   └── services/
│   │       └── api.ts          # Unified API (IPC in desktop, HTTP in web)
│   └── package.json
├── backend/                     # FastAPI backend (for future cloud/SaaS mode)
├── resources/icons/             # App icons
├── package.json                 # Root Electron config
└── docker-compose.yml           # Docker setup for backend dev
```

## Business Model

### Free (Current - Desktop Standalone)
- Full SOC 2 framework
- Local evidence collection and scoring
- Unlimited evidence storage
- Report generation
- Single machine

### Pro (Coming - $49-99/month)
- Cloud dashboard for multi-machine management
- All compliance frameworks (ISO 27001, HIPAA, PCI DSS)
- PDF audit-ready reports
- Up to 10 users
- Email alerts

### Enterprise (Coming - $299/month + per machine)
- Unlimited machines and users
- SSO/SAML
- Custom frameworks
- Central policy deployment
- Dedicated support

## Contributing

Contributions are welcome. To get started:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Make your changes
4. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) for details.

## Author

**Egyan07** - [GitHub](https://github.com/Egyan07)

---

<div align="center">

**ComplianceGuard** - Desktop-first SOC 2 compliance automation

[Report Issues](https://github.com/Egyan07/complianceguard/issues)

</div>
