"""
API load benchmark for ComplianceGuard.

Hits the hot endpoints against a running backend (see README "Run backend
locally") and reports latency percentiles. Run from the backend directory:

    ENVIRONMENT=testing DATABASE_NAME=bench.db python -m uvicorn app.main:app --port 8000
    python scripts/benchmark.py --requests 200

Endpoints exercised (the hot paths):
    POST /api/v1/auth/register   — one-time, excluded from the timed loop
    POST /api/v1/auth/login      — auth path every request would pay
    GET  /api/v1/framework/controls — framework browsing
    POST /api/v1/evaluate        — the core scoring path
    GET  /api/v1/evaluations/history — dashboard history

Exits non-zero if p95 on any endpoint exceeds the --max-p95-ms threshold,
so it can gate CI/performance regressions.
"""

import argparse
import asyncio
import os
import statistics
import time
import sys

import httpx

# Allow running from the repo root or the backend/ directory.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.core.database import SessionLocal  # noqa: E402
from app.models.user import User  # noqa: E402

BASE = "http://127.0.0.1:8000/api/v1"
EMAIL = "bench@example.com"
PASSWORD = "Bench!pass1234"


def _ensure_privileged_user() -> None:
    """Mark the bench user verified + pro so gated endpoints (evaluate,
    history) are reachable — mirroring tests/conftest.py."""
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == EMAIL).first()
        if user:
            user.is_verified = True
            user.license_tier = "pro"
            db.commit()
            print(f"  [setup] promoted {EMAIL} to verified pro")
    finally:
        db.close()


async def _time_calls(client: httpx.AsyncClient, method: str, url: str, *, n: int, **kwargs):
    latencies = []
    errors = 0
    for _ in range(n):
        start = time.perf_counter()
        try:
            resp = await getattr(client, method)(url, **kwargs)
            latency = (time.perf_counter() - start) * 1000
            latencies.append(latency)
            if resp.status_code >= 400:
                errors += 1
                print(f"  !! {method.upper()} {url} -> {resp.status_code}: {resp.text[:120]}")
        except Exception as exc:  # noqa: BLE001 — report and continue
            errors += 1
            latencies.append((time.perf_counter() - start) * 1000)
            print(f"  !! {method.upper()} {url} -> {type(exc).__name__}: {exc}")
    return latencies, errors


def _summarize(name: str, latencies: list[float], errors: int, max_p95_ms: float) -> bool:
    if not latencies:
        print(f"  {name}: NO SAMPLES")
        return False
    latencies.sort()
    p50 = latencies[len(latencies) // 2]
    p95 = latencies[int(len(latencies) * 0.95) - 1]
    p99 = latencies[int(len(latencies) * 0.99) - 1]
    ok = p95 <= max_p95_ms
    flag = "OK " if ok else "SLOW"
    print(
        f"  [{flag}] {name:<38} p50={p50:7.1f}ms  p95={p95:7.1f}ms  "
        f"p99={p99:7.1f}ms  errors={errors}"
    )
    return ok


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--requests", type=int, default=100, help="requests per endpoint")
    parser.add_argument("--max-p95-ms", type=float, default=500.0, help="p95 ceiling (ms)")
    parser.add_argument("--evaluations", type=int, default=20, help="evaluations to seed")
    parser.add_argument("--concurrency", type=int, default=1, help="parallel workers (default 1 = serial)")
    args = parser.parse_args()

    async with httpx.AsyncClient(timeout=30.0) as client:
        if args.concurrency > 1:
            sem = asyncio.Semaphore(args.concurrency)

            async def _run(method: str, url: str, *, n: int, **kwargs):
                async def _one():
                    async with sem:
                        return await _time_calls(client, method, url, n=1, **kwargs)

                batches = await asyncio.gather(*(_one() for _ in range(n)))
                return [lat for lats, _ in batches for lat in lats], sum(errs for _, errs in batches)

            print(f"  concurrency={args.concurrency} workers")
        else:
            async def _run(method: str, url: str, *, n: int, **kwargs):
                return await _time_calls(client, method, url, n=n, **kwargs)
        # One-time setup: register the bench user (idempotent-ish; a 400 from a
        # duplicate email is fine) and seed some evaluations so history/trend
        # have data to serve.
        reg = await client.post(
            f"{BASE}/auth/register",
            json={"email": EMAIL, "password": PASSWORD, "first_name": "Bench", "last_name": "User"},
        )
        if reg.status_code >= 400 and "already exists" not in reg.text:
            print(f"register failed: {reg.status_code} {reg.text[:200]}")
            return 1
        token = reg.json().get("access_token", "")
        if not token:
            # Already registered — log in to get a fresh token.
            login = await client.post(
                f"{BASE}/auth/login",
                data={"username": EMAIL, "password": PASSWORD},
            )
            if login.status_code >= 400:
                print(f"login failed: {login.status_code} {login.text[:200]}")
                return 1
            token = login.json()["access_token"]

        headers = {"Authorization": f"Bearer {token}"}

        _ensure_privileged_user()

        # Seed evaluations so /evaluations/history serves real data.
        # Compliance routes live under /compliance (router prefix) — see app/api/compliance.py.
        controls_resp = await client.get(f"{BASE}/compliance/framework/controls", headers=headers)
        if controls_resp.status_code >= 400:
            print(f"framework/controls failed: {controls_resp.status_code} {controls_resp.text[:200]}")
            return 1
        controls = controls_resp.json()
        if not isinstance(controls, list):
            print(f"framework/controls returned unexpected shape: {type(controls).__name__}")
            return 1
        seed_ids = [c["id"] for c in controls[:12]]
        for _ in range(args.evaluations):
            evidence = {
                cid: {"evidence_provided": [f"ev-{cid}"], "status": "compliant", "score": 0.9, "comments": "seeded"}
                for cid in seed_ids
            }
            await client.post(
                f"{BASE}/compliance/evaluate",
                headers=headers,
                json={"evidence_data": evidence, "scope": ["SOC 2"], "evaluated_by": "bench"},
            )

        results: dict[str, tuple[list[float], int]] = {}
        n = args.requests

        print(f"\nBenchmarking {n} requests/endpoint (p95 ceiling {args.max_p95_ms}ms)\n")

        lat, errs = await _run(
            "post", f"{BASE}/auth/login", n=n,
            data={"username": EMAIL, "password": PASSWORD},
        )
        results["POST /auth/login"] = (lat, errs)

        lat, errs = await _run(
            "get", f"{BASE}/compliance/framework/controls", n=n, headers=headers
        )
        results["GET /compliance/framework/controls"] = (lat, errs)

        lat, errs = await _run(
            "get", f"{BASE}/compliance/evaluations/history", n=n, headers=headers
        )
        results["GET /compliance/evaluations/history"] = (lat, errs)

        # Evaluate with a realistic subset of controls.
        evidence = {
            cid: {"evidence_provided": [f"ev-{cid}"], "status": "compliant", "score": 0.9, "comments": ""}
            for cid in seed_ids[:6]
        }
        lat, errs = await _run(
            "post", f"{BASE}/compliance/evaluate", n=n,
            headers=headers, json={"evidence_data": evidence, "scope": ["SOC 2"], "evaluated_by": "bench"},
        )
        results["POST /compliance/evaluate"] = (lat, errs)

        print()
        all_ok = True
        for name, (lats, errs) in results.items():
            all_ok = _summarize(name, lats, errs, args.max_p95_ms) and all_ok

        overall = [lat for lats, _ in results.values() for lat in lats]
        if overall:
            print(
                f"\n  Overall: {len(overall)} samples, "
                f"mean {statistics.mean(overall):.1f}ms, "
                f"p95 {sorted(overall)[int(len(overall) * 0.95) - 1]:.1f}ms"
            )
        return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
