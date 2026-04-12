# Changelog

All notable changes to ComplianceGuard will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [0.1.0-beta] - 2026-04-12

### Added
- **Evidence Upload UI** — Dialog form to manually upload policy documents, screenshots, and text evidence mapped to SOC 2 controls
- **File picker** — Native OS file dialog for selecting evidence files (PDF, DOC, images, etc.)
- **Professional app icons** — Shield + checkmark design (ICO multi-size, PNG, SVG, tray, notification, favicon)
- **Premium README** — Banner, badges, comparison table, architecture diagram, business model, roadmap

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

### Security
- Added root `.gitignore` (Python, Node, IDE, .env, .db files)
- Context isolation enforced in Electron with input validation on every IPC call
- External navigation blocked, `window.open` denied
- SHA-256 file hashing on all stored evidence files
