"""
Configuration management for ComplianceGuard.

This module provides centralized configuration management using Pydantic settings,
handling environment variables, database configuration, and application settings.
"""

# Pydantic v2 only — never import from pydantic.v1 here.
from pydantic_settings import BaseSettings, SettingsConfigDict, NoDecode
from pydantic import Field, field_validator, model_validator
from typing import Annotated, Optional, List
import secrets
import os
from enum import Enum


class Environment(str, Enum):
    """Application environment types."""
    DEVELOPMENT = "development"
    TESTING = "testing"
    PRODUCTION = "production"


class DatabaseType(str, Enum):
    """Supported database types."""
    SQLITE = "sqlite"
    POSTGRESQL = "postgresql"


class Settings(BaseSettings):
    """
    Application settings using Pydantic BaseSettings.

    This class provides centralized configuration management with environment
    variable support and validation.
    """

    # Application settings
    app_name: str = Field("ComplianceGuard SOC 2 API")
    app_version: str = Field("0.1.0")
    debug: bool = Field(False)
    environment: Environment = Field(Environment.DEVELOPMENT)

    # API settings
    api_v1_prefix: str = Field("/api/v1")
    # List fields are annotated NoDecode so pydantic-settings hands the RAW env
    # string to the comma-split validators below instead of JSON-decoding it
    # first. Both forms therefore work: CORS_ORIGINS=["http://localhost:5173"]
    # (JSON) and CORS_ORIGINS=http://localhost:5173,http://localhost:3000
    # (comma string). Without NoDecode, a comma string aborts settings
    # construction with SettingsError before the validators ever run — which
    # made the API unbootable on machines with Windows user-level env vars set.
    cors_origins: Annotated[List[str], NoDecode] = Field(
        ["http://localhost:5173", "http://localhost:3000"]
    )
    allowed_hosts: Annotated[List[str], NoDecode] = Field(
        ["localhost", "127.0.0.1"]
    )

    # Database settings
    database_type: DatabaseType = Field(DatabaseType.SQLITE)
    database_url: Optional[str] = Field(None)
    database_host: Optional[str] = Field(None)
    database_port: Optional[int] = Field(None)
    database_name: Optional[str] = Field(None)
    database_username: Optional[str] = Field(None)
    database_password: Optional[str] = Field(None)
    database_echo: bool = Field(False)
    # Postgres connection pool sizing. Total possible connections = workers ×
    # (db_pool_size + db_max_overflow). Tune to your DB's max_connections.
    db_pool_size: int = Field(5)
    db_max_overflow: int = Field(5)
    db_pool_timeout: int = Field(30)
    db_pool_recycle: int = Field(1800)

    # Test database settings
    test_database_url: Optional[str] = Field(None)

    # Authentication settings
    secret_key: str = Field(default_factory=lambda: secrets.token_urlsafe(32))
    # Domain-separated cryptographic keys (optional). Each of these, when set,
    # replaces SECRET_KEY for a single domain (JWT signing / credential
    # encryption / audit-chain HMAC). When unset the domain falls back to
    # SECRET_KEY, so existing deployments keep working unchanged and a single
    # key rotation no longer has to invalidate sessions, stored credentials,
    # and the audit chain all at once.
    jwt_secret: Optional[str] = Field(None)
    credential_encryption_key: Optional[str] = Field(None)
    audit_hmac_key: Optional[str] = Field(None)
    algorithm: str = Field("HS256")
    access_token_expire_minutes: int = Field(30)
    refresh_token_expire_days: int = Field(7)
    # Refresh-cookie Secure flag. When None (default), it is derived from the
    # ENVIRONMENT (Secure in production, not over plain-HTTP dev). Setting it
    # explicitly always wins — DEBUG has no influence on cookie security.
    cookie_secure: Optional[bool] = Field(None)

    # Interactive API docs (/docs, /redoc, /openapi.json). When None (default),
    # they are served outside production and disabled in production — the
    # public schema enumerates every endpoint, which is attacker recon. Set
    # API_DOCS_ENABLED=true to force them on behind an authenticated proxy.
    api_docs_enabled: Optional[bool] = Field(None)

    @property
    def serve_api_docs(self) -> bool:
        """Whether /docs, /redoc, and /openapi.json should be served."""
        if self.api_docs_enabled is not None:
            return self.api_docs_enabled
        return self.environment != Environment.PRODUCTION

    # Security settings
    password_min_length: int = Field(8)
    password_require_uppercase: bool = Field(True)
    password_require_lowercase: bool = Field(True)
    password_require_digits: bool = Field(True)
    password_require_special: bool = Field(True)

    # AWS Integration settings
    aws_access_key_id: Optional[str] = Field(None)
    aws_secret_access_key: Optional[str] = Field(None)
    aws_region: Optional[str] = Field("us-east-1")
    aws_s3_bucket: Optional[str] = Field(None)

    # Email delivery settings
    # NOTE: When EMAIL_ENABLED=false (default), all email functions are silent no-ops.
    app_base_url: str = Field("http://localhost:8000")
    smtp_host: Optional[str] = Field(None)
    smtp_port: int = Field(587)
    smtp_user: Optional[str] = Field(None)
    smtp_password: Optional[str] = Field(None)
    smtp_from_email: str = Field("noreply@complianceguard.com")
    smtp_from_name: str = Field("ComplianceGuard")
    smtp_tls: bool = Field(True)
    smtp_ssl: bool = Field(False)
    email_enabled: bool = Field(False)

    # Evidence collection settings
    evidence_retention_days: int = Field(2555)  # 7 years for compliance
    max_file_size_mb: int = Field(100)
    # Filesystem root for uploaded evidence. Files are stored under
    # <evidence_storage_path>/evidence/<user_id>/<item_uuid>_<safe_name>. Must
    # be writable by the API process and included in any backup policy.
    evidence_storage_path: str = Field("./storage")
    # NoDecode: accepts ALLOWED_FILE_TYPES=.pdf,.doc (comma string) as well as
    # the JSON array form — see the cors_origins note above.
    allowed_file_types: Annotated[List[str], NoDecode] = Field(
        [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".json", ".csv"]
    )

    # Compliance evaluation settings
    compliance_score_threshold: float = Field(0.8)
    evaluation_history_limit: int = Field(50)

    # Logging settings
    log_level: str = Field("INFO")
    log_format: str = Field(
        "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )

    # Error monitoring
    sentry_dsn: Optional[str] = Field(None)
    sentry_traces_sample_rate: float = Field(0.1)

    # True only on a dedicated/air-gapped Enterprise deployment. Enterprise
    # features (audit log, RBAC, branding, export) are single-tenant and require
    # this — they are NOT served on the shared hosted backend, so multiple
    # customers' enterprise data can never coexist there.
    enterprise_mode: bool = Field(False)

    # Server settings
    host: str = Field("127.0.0.1")
    port: int = Field(8000)
    workers: int = Field(1)

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v):
        """Parse CORS origins from env string — JSON array or comma-separated."""
        if isinstance(v, str):
            # Tolerate a JSON-array-shaped string: NoDecode bypasses the JSON
            # decode, so ["a","b"] arrives here verbatim.
            if v.startswith("["):
                try:
                    import json
                    parsed = json.loads(v)
                    if isinstance(parsed, list):
                        return [str(origin).strip() for origin in parsed]
                except Exception:
                    pass
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    @field_validator("allowed_hosts", mode="before")
    @classmethod
    def parse_allowed_hosts(cls, v):
        """Parse allowed hosts from environment variable string."""
        if isinstance(v, str):
            return [host.strip() for host in v.split(",")]
        return v

    @field_validator("allowed_file_types", mode="before")
    @classmethod
    def parse_allowed_file_types(cls, v):
        """Parse allowed file types from environment variable string.

        Accepts the comma form (``pdf,docx``) and normalizes bare extensions to
        dot-prefixed ones (``pdf`` -> ``.pdf``) so an operator-set Windows env
        var like ``ALLOWED_FILE_TYPES=pdf,doc,docx`` yields extensions that
        match the upload endpoint's ``os.path.splitext`` comparisons.
        """
        if isinstance(v, str):
            stripped = v.strip()
            # JSON-array form stays supported for deployments that used it.
            if stripped.startswith("["):
                try:
                    import json
                    parsed = json.loads(stripped)
                    if isinstance(parsed, list):
                        return [str(t).strip() for t in parsed]
                except Exception:
                    pass
            parsed = [ftype.strip() for ftype in stripped.split(",") if ftype.strip()]
            return [t if t.startswith(".") else f".{t}" for t in parsed]
        return v

    @field_validator("database_url")
    @classmethod
    def validate_database_url(cls, v, info):
        """Validate and construct database URL if not provided."""
        if v:
            return v

        # Construct database URL from components
        data = info.data
        db_type = data.get("database_type", DatabaseType.SQLITE)

        if db_type == DatabaseType.SQLITE:
            db_name = data.get("database_name") or "complianceguard.db"
            return f"sqlite:///./{db_name}"

        elif db_type == DatabaseType.POSTGRESQL:
            host = data.get("database_host") or "localhost"
            port = data.get("database_port") or 5432
            db_name = data.get("database_name") or "complianceguard"
            username = data.get("database_username")
            password = data.get("database_password")

            if not all([username, password]):
                raise ValueError("PostgreSQL requires username and password")

            return f"postgresql://{username}:{password}@{host}:{port}/{db_name}"

        return v

    @field_validator("test_database_url")
    @classmethod
    def validate_test_database_url(cls, v, info):
        """Set default test database URL if not provided."""
        if v:
            return v

        data = info.data
        environment = data.get("environment", Environment.DEVELOPMENT)
        if environment == Environment.TESTING:
            return "sqlite:///:memory:"

        return v

    @field_validator("secret_key")
    @classmethod
    def validate_secret_key(cls, v, info):
        """Validate secret key is explicitly set via env in production.

        The default_factory generates a random key at module load time, which
        causes each worker process to receive a different key and makes JWTs
        randomly invalid in multi-worker deployments.  In production the key
        MUST come from the SECRET_KEY environment variable.
        """
        data = info.data
        environment = data.get("environment", Environment.DEVELOPMENT)
        if environment == Environment.PRODUCTION and not os.getenv("SECRET_KEY"):
            raise ValueError(
                "SECRET_KEY must be set via env in production. "
                "A random default cannot be used because each worker would "
                "generate a different key, making JWTs randomly invalid."
            )
        return v

    @field_validator("aws_access_key_id", "aws_secret_access_key")
    @classmethod
    def validate_aws_credentials(cls, v, info):
        """Clean placeholder values from a single AWS credential field.

        Placeholder values (``your-aws-secret-access-key``-style, as found in
        copied .env templates or stray machine-level env vars) are treated as
        unset — otherwise a template placeholder aborts the entire settings
        construction and the API cannot boot at all.

        The set-together PAIRING check lives in the ``_validate_aws_pair``
        model validator below: per-field validators run per field in
        declaration order and the second field's ``info.data`` does not
        reliably contain the first, so a REAL credential pair would have
        tripped a false "must be set together" error here (latent boot
        blocker this fix removes).
        """
        placeholders = {"your-aws-access-key-id", "your-aws-secret-access-key", "changeme", ""}

        if v is None:
            return None
        cleaned = v.strip()
        return None if cleaned.lower() in placeholders else cleaned

    @model_validator(mode="after")
    def _validate_aws_pair(self) -> "Settings":
        """Enforce the both-keys-together invariant on the CLEANED values."""
        if bool(self.aws_access_key_id) != bool(self.aws_secret_access_key):
            raise ValueError("Both AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set together")
        return self

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    @model_validator(mode="after")
    def _apply_environment_overrides(self) -> "Settings":
        """
        Apply environment-specific defaults (debug flag, log level, DB echo).

        Lives on the model instead of running at module import time so that
        pydantic tracks the mutation properly and test env overrides aren't
        stomped on. Only applies when the matching env var is NOT explicitly
        set, so user intent wins over our convention.
        """
        env_defaults = {
            Environment.DEVELOPMENT: {"debug": True, "log_level": "DEBUG", "database_echo": True},
            Environment.TESTING: {"debug": True, "log_level": "INFO", "database_echo": False},
            Environment.PRODUCTION: {"debug": False, "log_level": "WARNING", "database_echo": False},
        }.get(self.environment, {})

        for key, value in env_defaults.items():
            if os.getenv(key.upper()) is None:
                setattr(self, key, value)
        return self


# Create global settings instance
settings = Settings()


def get_settings() -> Settings:
    """
    Get the application settings instance.

    Returns:
        Settings: The application settings
    """
    return settings


def get_database_url(testing: bool = False) -> str:
    """
    Get the appropriate database URL based on environment and testing flag.

    Args:
        testing: Whether to get the test database URL

    Returns:
        str: Database URL
    """
    if testing and settings.test_database_url:
        return settings.test_database_url
    return settings.database_url


def get_environment_config() -> dict:
    """
    Get environment-specific configuration.

    Returns:
        dict: Environment-specific configuration
    """
    env_configs = {
        Environment.DEVELOPMENT: {
            "debug": True,
            "log_level": "DEBUG",
            "database_echo": True,
        },
        Environment.TESTING: {
            "debug": True,
            "log_level": "INFO",
            "database_echo": False,
        },
        Environment.PRODUCTION: {
            "debug": False,
            "log_level": "WARNING",
            "database_echo": False,
        }
    }

    return env_configs.get(settings.environment, env_configs[Environment.DEVELOPMENT])


def validate_production_settings() -> List[str]:
    """
    Validate production settings and return list of warnings.

    Returns:
        List[str]: List of configuration warnings
    """
    warnings = []

    if settings.environment == Environment.PRODUCTION:
        if settings.debug:
            warnings.append("Debug mode is enabled in production")

        if not settings.aws_access_key_id or not settings.aws_secret_access_key:
            warnings.append("AWS credentials are not configured")

        if settings.database_type == DatabaseType.SQLITE:
            warnings.append("SQLite is not recommended for production use")

        if settings.workers < 2:
            warnings.append("Consider increasing the number of workers for production")

    return warnings


def assert_email_configuration_allows_onboarding(cfg: "Settings | None" = None) -> None:
    """Fail fast when a production deployment cannot onboard users.

    Every web account must verify an email address before it can use any
    protected endpoint (see ``app.api.deps.get_current_user``). When
    ``EMAIL_ENABLED=false`` no verification email is ever sent, so in
    production the platform would silently dead-end every registration (all
    new accounts stuck at 403 "Email address not verified").

    Development/testing environments are exempt: when email is disabled there,
    ``app.core.email`` logs the verification link instead, so local
    development stays usable.

    Raised at module import time (app.core.config import) in production, so
    the backend refuses to boot under a broken configuration.
    """
    cfg = cfg or settings
    if cfg.environment == Environment.PRODUCTION and not cfg.email_enabled:
        raise RuntimeError(
            "EMAIL_ENABLED=false in a production environment: no user can ever "
            "complete registration, because verification emails are not sent and "
            "the verification token is never surfaced to the user (all protected "
            "endpoints return 403). Set EMAIL_ENABLED=true and configure "
            "SMTP_HOST/SMTP_USER/SMTP_PASSWORD/APP_BASE_URL (see .env.example)."
        )


# Environment-specific overrides are applied inside Settings._apply_environment_overrides
# at construction time — no post-init mutation here.

# Validate production settings in production environment
if settings.environment == Environment.PRODUCTION:
    production_warnings = validate_production_settings()
    if production_warnings:
        import warnings
        for warning in production_warnings:
            warnings.warn(warning, UserWarning)
    # CG-H1: refuse to boot a production backend that cannot verify emails.
    assert_email_configuration_allows_onboarding(settings)
