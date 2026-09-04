#!/usr/bin/env bash
# Supply-chain audit gate for npm trees (used by the frontend and electron jobs).
#
# Why this exists: npm's standalone audit falls back to the retired
# /-/npm/v1/security/audits/quick endpoint whenever the bulk advisory endpoint
# hiccups. The quick endpoint now fails with 400/503 (registry-side migration),
# and npm's default fetch retries turn one failed attempt into a ~7-minute
# spiral (observed: 3 attempts x 7 min = 21 min, all red). This script bounds
# every attempt and decides, per run type, whether a registry outage should
# block CI:
#
#   * Genuine findings (high/critical)  -> always fail, never retried.
#   * Tag/release runs                  -> STRICT: fail if the audit cannot
#     complete. A release never ships an un-audited tree. Patient timeout
#     (5 min) so a slow-but-working registry still passes.
#   * Push runs                         -> TOLERANT: if the registry's audit
#     service is down after quick retries, warn and continue. A push ships
#     nothing, and the gate re-applies on the next run.
set -u

strict=0
case "${GITHUB_REF:-}" in
  refs/tags/*) strict=1 ;;
esac

if [ "$strict" -eq 1 ]; then
  attempts=2
  fetch_timeout=300000   # slow-but-working registry: give it time to answer
  mode="STRICT (release)"
else
  attempts=3
  fetch_timeout=45000    # outage: fail each attempt fast, then warn + skip
  mode="tolerant (push)"
fi

echo "npm audit [$mode] ref=${GITHUB_REF:-unknown} (max $attempts attempts, fetch-timeout ${fetch_timeout}ms)"

for attempt in $(seq 1 "$attempts"); do
  if output="$(npm audit --audit-level=high --fetch-retries=0 --fetch-timeout=$fetch_timeout 2>&1)"; then
    printf '%s\n' "$output"
    echo "npm audit: clean (no high/critical findings)"
    exit 0
  fi
  status=$?
  printf '%s\n' "$output"
  # Genuine findings exit 1 without an "npm error" line — never retry those.
  if ! printf '%s\n' "$output" | grep -q 'npm error'; then
    echo "npm audit: high/critical findings detected — failing (exit $status)"
    exit "$status"
  fi
  if [ "$attempt" -lt "$attempts" ]; then
    echo "npm audit attempt $attempt/$attempts failed (registry audit service error) — retrying in 10s"
    sleep 10
  fi
done

if [ "$strict" -eq 1 ]; then
  echo "::error::npm registry audit service unavailable after $attempts attempts — refusing to release an un-audited tree. Re-run this job once the registry audit service recovers."
  exit 1
fi
echo "::warning::npm registry audit service unavailable after $attempts attempts — audit SKIPPED on this push run (a push ships nothing; the gate re-applies on the next run)."
exit 0
