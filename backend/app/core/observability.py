"""
Observability: structured logging + Prometheus metrics.

Structured logging uses only the stdlib ``logging`` module — a JSON formatter
is applied to the root handler. Enable with ``LOG_FORMAT=json``; the default
``LOG_FORMAT=text`` keeps the familiar human-readable lines for local dev.

Prometheus metrics are exposed on ``/metrics`` (see app.main) via
``prometheus-client``. The metrics below are registered at import time, so
they exist even before the first request (Grafana dashboards won't complain
about missing series).
"""

import json
import logging
import os
import sys
import time
from typing import Any, Dict

from prometheus_client import Counter, Gauge, Histogram

# ---------------------------------------------------------------------------
# Prometheus metrics
# ---------------------------------------------------------------------------

# Total HTTP requests, labelled by method, path template, and status class.
# Using the Starlette route path template (e.g. /api/v1/auth/login) instead of
# the raw URL keeps cardinality bounded — /users/123 and /users/456 collapse
# into /users/{user_id}.
HTTP_REQUESTS_TOTAL = Counter(
    "http_requests_total",
    "Total HTTP requests served",
    ["method", "path", "status"],
)

# Request latency histogram (seconds).
HTTP_REQUEST_DURATION = Histogram(
    "http_request_duration_seconds",
    "HTTP request latency in seconds",
    ["method", "path"],
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0),
)

# Longest single request observed (useful for alerting without histogram math).
HTTP_REQUEST_MAX_DURATION = Gauge(
    "http_request_max_duration_seconds",
    "Slowest HTTP request observed since process start",
    ["method", "path"],
)

# Uptime + version so dashboards can label instances and spot stale deploys.
APP_INFO = Gauge(
    "complianceguard_app_info",
    "Static build info for the running backend",
    ["version", "git_sha"],
)


def record_request(method: str, path_template: str, status_code: int, duration_s: float) -> None:
    """Record one completed request into the Prometheus metrics."""
    status = str(status_code)
    HTTP_REQUESTS_TOTAL.labels(method, path_template, status).inc()
    HTTP_REQUEST_DURATION.labels(method, path_template).observe(duration_s)
    # Gauge is last-observation-wins; keep the max seen.
    current = HTTP_REQUEST_MAX_DURATION.labels(method, path_template)._value.get()
    if current is None or duration_s > current:
        HTTP_REQUEST_MAX_DURATION.labels(method, path_template).set(duration_s)


# ---------------------------------------------------------------------------
# Structured JSON logging
# ---------------------------------------------------------------------------

_JSON_FIELDS = ("asctime", "levelname", "name", "message")


class JsonFormatter(logging.Formatter):
    """Emit one JSON object per log line."""

    def format(self, record: logging.LogRecord) -> str:
        payload: Dict[str, Any] = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
        }
        message = record.getMessage()
        # If the message is already a dict/JSON (structured callers), merge it
        # so the object is the top-level payload rather than a string.
        # Use record.msg (unformatted) to avoid double-formatting args.
        if isinstance(record.msg, str) and record.msg.startswith("{") and record.args:
            try:
                payload.update(json.loads(message))
            except (ValueError, TypeError):
                payload["message"] = message
        else:
            payload["message"] = message
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


def configure_logging(log_format: str | None = None, level: str | None = None) -> None:
    """Configure root logging with an optional JSON formatter.

    ``LOG_FORMAT=json`` enables structured output; anything else (or unset)
    keeps the standard text format. ``level`` defaults to the app setting.
    """
    fmt = (log_format or os.getenv("LOG_FORMAT", "text")).lower()
    level = (level or os.getenv("LOG_LEVEL", "INFO")).upper()

    root = logging.getLogger()
    # force=True replaces whatever handler uvicorn installed at the root —
    # otherwise its text handler wins and JSON is silently dropped. uvicorn's
    # own loggers (error/access) keep their handlers, which is fine: app-level
    # logs propagate to the root and get our format.
    logging.basicConfig(
        level=level,
        format=None,
        force=True,
    )
    if fmt == "json":
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(JsonFormatter())
        root.handlers = [handler]
    else:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(
            logging.Formatter("%(asctime)s %(levelname)s [%(name)s] %(message)s")
        )
        root.handlers = [handler]

    # uvicorn's access log is noisy and duplicates request-level metrics we
    # already capture via Prometheus — keep it at WARNING unless debugging.
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)


def now_ms() -> float:
    """Monotonic clock for request timing (not wall-clock, immune to NTP jumps)."""
    return time.monotonic()
