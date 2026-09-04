# Release & Code Signing Runbook

This document describes how ComplianceGuard desktop releases are built, signed,
published, and auto-updated. It is the operational companion to the `release`
jobs in `.github/workflows/ci.yml` and the auto-update manager in
`electron/update-manager.js`.

---

## 1. Update lifecycle (what ships in the app)

A packaged ComplianceGuard build:

1. Checks for updates **10 s after startup**, then **every 4 hours** while running,
   and on demand via the renderer (`window.electronAPI.checkForUpdates()`).
2. When a newer version exists in the GitHub **draft release**, the update is
   **downloaded automatically** (resumable; cached between attempts).
3. When the download completes, a notification says the update is ready and will
   **install on quit** (`autoInstallOnAppQuit`). No forced restart.
4. On the next quit, the NSIS installer applies the update and relaunches.

Disabled entirely in development (unpackaged) runs.

**Integrity:** every installer published by electron-builder is accompanied by
`latest.yml` (Windows), `latest-mac.yml`, and `latest-linux.yml` (sha512 +
size). electron-updater verifies the checksum before installing, and — once
code signing is configured — the Windows installer's Authenticode signature is
verified against `publisherName: ComplianceGuard LLC`
(`verifyUpdateCodeSignature: true`). A signed update that fails verification is
rejected.

**Linux:** the AppImage auto-updates on quit exactly like the Windows Setup
build (electron-updater reads `latest-linux.yml`). The `.deb` installer is a
fixed install — reinstall the new `.deb` from each release to upgrade.

**Portable builds** (`ComplianceGuard-Portable-*.exe`) are single-file and **do
not** support auto-update. They are a distribution convenience, not the
auto-updated artifact.

---

## 2. Tagging a release

The release jobs run only on tag pushes matching `v*`:

```bash
# 1. Bump "version" in package.json (root). The version here drives the
#    installer name, latest.yml, and the update check.
# 2. Commit, then tag and push:
git tag v3.9.2
git push origin v3.9.2
```

CI then: runs all suites → builds the Windows installer (signed if credentials
are configured) → publishes to a **draft** GitHub release → builds + publishes
the macOS DMG to the same draft → builds + publishes the Linux AppImage + `.deb`
to the same draft → the `release-integrity` job verifies the artifacts and
uploads `SHA256SUMS.txt`.

**The draft is never auto-published.** Review the draft (attachments,
`SHA256SUMS.txt`, release notes) and click **Publish release** when ready.
Published drafts are what installed apps see on their next update check.

---

## 3. Windows code signing

electron-builder signs automatically when credentials are present. Two routes:

### 3a. Classic PKCS#12 certificate (simplest)

| Secret | Value |
|---|---|
| `WIN_CSC_LINK` | **Base64** of your `.pfx` (e.g. `base64 -w0 cert.pfx`) |
| `WIN_CSC_KEY_PASSWORD` | The `.pfx` password |

### 3b. Azure Trusted Signing (no EV hardware token)

| Secret | Value |
|---|---|
| `AZURE_TENANT_ID` | Directory (tenant) ID |
| `AZURE_CLIENT_ID` | Service principal app ID |
| `AZURE_CLIENT_SECRET` | Service principal secret |
| `AZURE_KEY_VAULT_NAME` | Key vault name |
| `AZURE_CERT_NAME` | Certificate profile name |

Azure Trusted Signing requires the `trusted-signing` Azure extension; see
[electron-builder's Azure Trusted Signing docs](https://www.electron.build/code-signing#azure-trusted-signing).

### What happens when signing credentials are NOT configured

- The installer builds **unsigned**.
- CI prints a loud **warning** ("Installer is UNSIGNED — this release will not
  support verified auto-updates").
- `verifyUpdateCodeSignature: true` means **auto-update will refuse unsigned
  updates**, so an unsigned release cannot silently push updates to installed
  apps. An unsigned release is therefore a manual-install release.
- For customer releases, configure the secrets above. The CI job fails if
  credentials were provided but the resulting installer is not actually signed
  (`Get-AuthenticodeSignature` status != `Valid`).

### Verifying a signature locally (Windows)

```powershell
Get-AuthenticodeSignature .\dist\ComplianceGuard-Setup-3.9.2.exe
# Status: Valid
# SignerCertificate.Subject: CN=…, O=ComplianceGuard LLC, …
```

---

## 4. macOS signing & notarization

| Secret | Value |
|---|---|
| `MAC_CSC_LINK` | Base64 of the `.p12` (Developer ID Application) |
| `MAC_CSC_KEY_PASSWORD` | `.p12` password |
| `APPLE_ID` | Apple ID used for notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password (not the Apple ID password) |
| `APPLE_TEAM_ID` | Apple Developer Team ID |

Notarization is automatic when the `APPLE_*` secrets are set (electron-builder
+ `notarytool`). Without them the DMG builds but is **not** notarized and will
trigger Gatekeeper warnings.

---

## 5. Manual release (no CI)

```bash
# Windows (from the repo root, on a Windows machine):
npm ci && cd frontend && npm ci && cd ..
npm run publish            # --publish always → draft GitHub release

# macOS (on a Mac):
npm run publish:mac

# Linux (AppImage + .deb, no signing needed):
npm run package:linux
gh release upload v3.9.2 dist/*.AppImage dist/*.deb dist/latest-linux.yml --clobber

# Add checksums:
(cd dist && sha256sum *.exe *.dmg *.AppImage *.deb *.yml > SHA256SUMS.txt)
gh release upload v3.9.2 dist/SHA256SUMS.txt --clobber
```

`npm run package` builds locally without publishing (`--publish never`).

---

## 6. Rollback & failure handling

- **Failed install:** NSIS installs are transactional — an interrupted or failed
  install leaves the previous version intact.
- **Interrupted download:** electron-updater caches partial downloads in
  `app.getPath('userData')` and resumes them on the next check.
- **Update check failure (offline/host unreachable):** logged, retried on the
  next 4-hour cycle; the app keeps running on the current version.
- **Rollback-on-crash is NOT automatic** (electron-updater limitation). If a new
  build crashes on startup:
  1. Download the previous installer from the GitHub release.
  2. Reinstall it (in-place; the app data directory is untouched).
  3. Prevent the crash-looping version from being re-picked-up by checking what
     version marker it wrote on launch (see `update-manager.js` — a startup
     version marker is the recommended hook point if this becomes a need).
- **Draft hygiene:** because releases start as drafts, a bad build can be
  deleted from the draft before any customer sees it.

---

## 7. Release checklist

- [ ] Version bumped in root `package.json`
- [ ] `CHANGELOG.md` updated
- [ ] All CI suites green on the tag push
- [ ] Signing secrets configured (Windows; macOS if shipping DMGs)
- [ ] Draft release contains: `ComplianceGuard-Setup-<ver>.exe` (+`.blockmap`),
      `ComplianceGuard-Portable-<ver>.exe`, `latest.yml`,
      `ComplianceGuard-<ver>.dmg`, `latest-mac.yml`,
      `ComplianceGuard-<ver>.AppImage`, `ComplianceGuard_<ver>_amd64.deb`,
      `latest-linux.yml`, `SHA256SUMS.txt`
- [ ] `release-integrity` job passed (artifacts present + checksums uploaded)
- [ ] Draft reviewed and **manually published**
