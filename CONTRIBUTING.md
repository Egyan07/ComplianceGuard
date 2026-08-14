# Contributing to ComplianceGuard

Thanks for contributing! This project spans three codebases — an Electron desktop app, a React frontend, and a FastAPI backend — so a few conventions keep the whole thing consistent.

## Development Setup

See [README → Quick Start](README.md#quick-start) for one-click (Windows) and manual setup.

## Code Style

- **Backend (Python)** — lint with [ruff](https://docs.astral.sh/ruff/) (config in `backend/pyproject.toml`). Run `ruff check app` from `backend/`. CI runs the same command, so keep black/isort/flake8 out of new code.
- **Frontend (TypeScript/React)** — ESLint + Prettier (configs in `frontend/`). Run `npm run lint` and `npm run format:check` from `frontend/`.
- **Electron (Node)** — CommonJS, same style as the rest of the JS.

## Tests

Run the suites before opening a PR (CI runs all of them):

```bash
# Frontend unit (Vitest)
cd frontend && npm test -- --run

# Frontend e2e (Playwright)
cd frontend && npm run test:e2e

# Electron unit (Vitest, run from repo root)
npm run test:scheduler

# Backend (pytest)
cd backend
python -m pytest tests/unit/ -v
python -m pytest tests/integration/ -v
python -m pytest tests/e2e/ -v --run-e2e
```

- Add tests for any new functionality.
- Keep the full suite green — the Electron suite gates releases.

## Shared Constants — Single Source of Truth

Version, tier gates, and machine limits live **only** in `shared/constants.json`. The Python (`backend/app/core/constants.py`), Electron (`electron/licensing/tier-constants.js`), and React (`frontend/src/constants.ts`) mirrors load from it — never hardcode one of these values in a mirror.

- To change a shared value, edit `shared/constants.json` only.
- If `VERSION` changes, also bump `package.json` and `frontend/package.json`.
- `backend/tests/unit/test_ssot_drift.py` verifies the mirrors still load the JSON.

## Framework Data (SOC 2 / ISO 27001 / HIPAA)

Controls are defined in YAML (`backend/app/core/*.yaml` and `electron/data/*.yaml`) and rendered from metadata, not hardcoded. The desktop control lists (`FREE_TIER_CONTROL_IDS`, `ALL_CONTROL_IDS` in `electron/licensing/tier-constants.js`) must stay in sync with `backend/app/core/soc2_controls.yaml`.

## Docs

- Update the README if you change user-facing behaviour.
- Add a CHANGELOG entry under `## [Unreleased]` for notable changes.

## Reporting Bugs / Security Issues

Open a [GitHub issue](https://github.com/Egyan07/ComplianceGuard/issues) for bugs. For security vulnerabilities, follow [SECURITY.md](SECURITY.md) — do not open a public issue.
