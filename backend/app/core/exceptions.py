"""
Application exception hierarchy for ComplianceGuard.

Centralises error responses so endpoint handlers never leak internal
exception messages to clients. Each exception carries:

- ``status_code``  — the HTTP status returned to the client
- ``detail``       — a safe, user-facing message (no internals)
- ``log_message``  — optional richer context for server-side logs

Handlers raise a subclass; ``app.main`` installs a global exception handler
that logs the full traceback server-side (with the request ID when present)
and returns only ``{"detail": <safe message>}`` to the client.
"""

from typing import Optional


class ComplianceAppError(Exception):
    """Base class for all application-level errors surfaced over the API."""

    status_code: int = 500
    detail: str = "An unexpected error occurred. Please try again later."
    log_message: Optional[str] = None

    def __init__(
        self,
        detail: Optional[str] = None,
        log_message: Optional[str] = None,
        status_code: Optional[int] = None,
    ) -> None:
        self.detail = detail or self.detail
        self.log_message = log_message or self.log_message
        if status_code is not None:
            self.status_code = status_code
        super().__init__(self.detail)


class EvaluationError(ComplianceAppError):
    """Compliance evaluation could not be completed."""

    detail = "Evaluation failed. Please try again later."


class EvidenceCollectionError(ComplianceAppError):
    """Evidence collection could not be completed."""

    detail = "Evidence collection failed. Please try again later."
