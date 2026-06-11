import hashlib
import json
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.enterprise import AuditLog


def canonical_json(obj: dict) -> str:
    return json.dumps(obj, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def canonical_timestamp(dt: datetime) -> str:
    """Normalize a datetime to a timezone-stable UTC ISO string for hashing.

    Naive values are assumed UTC. This guarantees the audit hash is identical
    whether created_at is read back naive (SQLite) or tz-aware (Postgres
    timestamptz) — without it, verify_audit_chain falsely reports tampering on
    Postgres.
    """
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat()


def compute_entry_hash(
    prev_hash: Optional[str],
    event_type: str,
    user_id: Optional[int],
    framework: Optional[str],
    score: Optional[float],
    detail: dict,
    created_at: str,
) -> str:
    payload_obj = {
        "prev_hash": prev_hash,
        "event_type": event_type,
        "user_id": user_id,
        "framework": framework,
        "score": score,
        "detail": detail if detail else {},
        "created_at": created_at,
    }
    payload = canonical_json(payload_obj).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def log_event(
    db: Session,
    event_type: str,
    user_id: Optional[int] = None,
    framework: Optional[str] = None,
    score: Optional[float] = None,
    detail: Optional[dict] = None,
) -> None:
    # Retry on the prev_hash unique-constraint conflict: if a concurrent append
    # claimed the same predecessor first, re-read the new chain head and append
    # again, keeping the chain linear instead of forking (or 500-ing).
    last_exc = None
    for _attempt in range(3):
        last = db.query(AuditLog).order_by(AuditLog.id.desc()).first()
        prev_hash = last.entry_hash if last else None
        created_at = datetime.now(timezone.utc)
        # Hash a timezone-canonical string so verify recomputes the same hash whether
        # the DB returns created_at naive (SQLite) or tz-aware (Postgres timestamptz).
        created_at_str = canonical_timestamp(created_at)
        entry_hash = compute_entry_hash(prev_hash, event_type, user_id, framework, score, detail or {}, created_at_str)
        db.add(AuditLog(
            event_type=event_type,
            user_id=user_id,
            framework=framework,
            score=score,
            detail_json=detail or {},
            prev_hash=prev_hash,
            entry_hash=entry_hash,
            created_at=created_at,
        ))
        try:
            db.commit()
            return
        except IntegrityError as exc:
            db.rollback()
            last_exc = exc
    raise last_exc
