"""Tests for the observability layer: Prometheus /metrics, DB-aware health, JSON logging."""

import io
import json
import logging

from fastapi.testclient import TestClient

from app.main import app
from app.core.observability import JsonFormatter, record_request


def _client():
    return TestClient(app)


def test_metrics_endpoint_returns_prometheus_format():
    with _client() as client:
        # Other tests (and the e2e suite) may already have hit "/", so read
        # the counter before and after and assert a monotonic increase.
        before = client.get("/metrics").text
        marker = 'http_requests_total{method="GET",path="/",status="200"} '
        before_count = float(
            next((line.split()[-1] for line in before.splitlines() if line.startswith(marker)), "0")
        )
        client.get("/")
        resp = client.get("/metrics")
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("text/plain")
        body = resp.text
        assert "complianceguard_app_info" in body
        assert "http_requests_total" in body
        after_count = float(
            next((line.split()[-1] for line in body.splitlines() if line.startswith(marker)), "0")
        )
        assert after_count == before_count + 1


def test_metrics_middleware_excludes_self_scrape():
    with _client() as client:
        client.get("/metrics")
        # A scrape of /metrics must not increment /metrics itself.
        body = client.get("/metrics").text
        assert 'path="/metrics"' not in body


def test_health_reports_database_ok():
    with _client() as client:
        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "healthy"
        assert data["database"] == "ok"
        assert data["version"]


def test_record_request_updates_metrics():
    from prometheus_client import REGISTRY

    # Use a fresh registry via the counter directly (existing labels already
    # have values from earlier tests, so assert monotonic increase instead).
    before = REGISTRY.get_sample_value(
        "http_requests_total",
        {"method": "GET", "path": "/test-observe", "status": "200"},
    ) or 0
    record_request("GET", "/test-observe", 200, 0.123)
    after = REGISTRY.get_sample_value(
        "http_requests_total",
        {"method": "GET", "path": "/test-observe", "status": "200"},
    ) or 0
    assert after == before + 1


def test_json_formatter_emits_parseable_object():
    record = logging.LogRecord(
        name="test.logger", level=logging.INFO, pathname=__file__,
        lineno=1, msg="hello %s", args=("world",), exc_info=None,
    )
    out = JsonFormatter().format(record)
    payload = json.loads(out)
    assert payload["level"] == "INFO"
    assert payload["logger"] == "test.logger"
    assert payload["message"] == "hello world"
    assert "ts" in payload


def test_json_formatter_merges_structured_message():
    record = logging.LogRecord(
        name="test.logger", level=logging.WARNING, pathname=__file__,
        lineno=1, msg='{"event": "eval_failed", "score": %d}', args=(42,), exc_info=None,
    )
    payload = json.loads(JsonFormatter().format(record))
    assert payload["event"] == "eval_failed"
    assert payload["score"] == 42


def test_configure_logging_attaches_handler_once():
    import app.core.observability as obs

    obs.configure_logging(log_format="json", level="INFO")
    root = logging.getLogger()
    # Calling twice must not stack duplicate handlers.
    obs.configure_logging(log_format="json", level="INFO")
    json_handlers = [h for h in root.handlers if isinstance(h.formatter, JsonFormatter)]
    assert len(json_handlers) <= 1
