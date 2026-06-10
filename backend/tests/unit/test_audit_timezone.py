"""Reproduction + regression for the audit-chain timezone bug.

log_event hashed a NAIVE datetime.utcnow().isoformat(), but the column is
DateTime(timezone=True). On Postgres the value reads back tz-aware (…+00:00),
so verify_audit_chain recomputes a different hash than was stored and reports
the whole chain as tampered. (SQLite strips tzinfo on read, hiding the bug —
which is why it can't be reproduced through a SQLite round-trip.)

Root cause, demonstrated below: naive vs tz-aware isoformat of the SAME instant
differ. Fix: a canonical_timestamp() normalizer used at both write and verify so
the hash is timezone-stable.
"""
from datetime import datetime, timezone

from app.services.audit_service import canonical_timestamp, compute_entry_hash


def test_root_cause_raw_isoformat_is_not_tz_stable():
    """Documents the bug: the same instant yields different isoformat strings
    depending on whether tzinfo is attached (naive write vs aware Postgres read)."""
    naive = datetime(2026, 6, 8, 10, 0, 0, 123456)
    aware = naive.replace(tzinfo=timezone.utc)
    assert naive.isoformat() != aware.isoformat()  # this difference broke verify on Postgres


def test_canonical_timestamp_is_tz_stable():
    """The fix: canonical_timestamp normalizes naive-UTC and aware-UTC (same
    instant) to an identical string."""
    naive = datetime(2026, 6, 8, 10, 0, 0, 123456)
    aware = naive.replace(tzinfo=timezone.utc)
    assert canonical_timestamp(naive) == canonical_timestamp(aware)


def test_audit_hash_is_tz_stable_via_canonical_timestamp():
    naive = datetime(2026, 6, 8, 10, 0, 0, 123456)
    aware = naive.replace(tzinfo=timezone.utc)
    h_naive = compute_entry_hash(None, "evaluation_run", 1, "soc2", 0.9, {}, canonical_timestamp(naive))
    h_aware = compute_entry_hash(None, "evaluation_run", 1, "soc2", 0.9, {}, canonical_timestamp(aware))
    assert h_naive == h_aware
