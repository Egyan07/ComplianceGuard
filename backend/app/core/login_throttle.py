"""Account-aware login throttling (Phase 11, J).

Complements the IP-based rate limiter (slowapi) with per-account protection so
a distributed attack can't spray one account from many IPs.

Design constraints (from the Phase 11 spec):
  - NO username-enumeration side channel: a throttled attempt returns the SAME
    generic 401 ("Incorrect email or password") as a wrong password.
  - No permanent lockout: a sliding 15-minute window; once the max failed
    attempts is hit within the window, the account is throttled until the
    window slides out. Legitimate users recover by waiting or by a successful
    login (which clears the counter).
  - Does not weaken the existing IP limiter.

Storage is in-memory per-process — consistent with the single-worker default
deployment (see rate_limit.py: scaling out requires RATELIMIT_STORAGE_URI).
"""

import time
from collections import defaultdict, deque
from threading import Lock

MAX_FAILED_ATTEMPTS = 5
WINDOW_SECONDS = 15 * 60  # failures must occur within this window to count

_failures: dict[str, deque] = defaultdict(deque)  # email -> recent failure times
_lock = Lock()
_now = time.monotonic


def _normalize(email: str) -> str:
    return (email or "").strip().lower()


def _recent_failures(email: str) -> deque:
    now = _now()
    q = _failures[email]
    while q and now - q[0] > WINDOW_SECONDS:
        q.popleft()
    return q


def record_failure(email: str) -> None:
    """Record a failed login attempt for an account (windowed)."""
    key = _normalize(email)
    with _lock:
        _failures[key].append(_now())
        # Opportunistically prune so the dict can't grow unbounded.
        if len(_failures) > 10_000:
            for k in [k for k, q in _failures.items() if not q]:
                del _failures[k]


def clear_failures(email: str) -> None:
    """Reset the counter after a successful login."""
    key = _normalize(email)
    with _lock:
        _failures.pop(key, None)


def is_throttled(email: str) -> bool:
    """True when the account has exceeded MAX_FAILED_ATTEMPTS within the window.

    Temporary by design: once the oldest failure ages out of the 15-minute
    window the account recovers automatically — no permanent lockout.
    """
    key = _normalize(email)
    with _lock:
        q = _recent_failures(key)
        return len(q) >= MAX_FAILED_ATTEMPTS
