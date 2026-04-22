"""
Configuration management for ComplianceGuard.

This module provides centralized configuration management using Pydantic settings,
handling environment variables, database configuration, and application settings.
"""

# Pydantic v2 only — never import from pydantic.v1 here.
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, field_validator, model_validator
from typing import Optional, List
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
    # NOTE: When set via env var, use JSON array format (pydantic-settings v2 requirement):
    # CORS_ORIGINS=["http://localhost:5173","http://localhost:3000"]
    cors_origins: List[str] = Field(
        ["http://localhost:5173", "http://localhost:3000"]
    )
    # NOTE: When set via env var, use JSON array format (pydantic-settings v2 requirement):
    # ALLOWED_HOSTS=["localhost","127.0.0.1"]
    allowed_hosts: List[str] = Field(
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

    # Test database settings
    test_database_url: Optional[str] = Field(None)

    # Authentication settings
    secret_key: str = Field(default_factory=lambda: secrets.token_urlsafe(32))
    algorithm: str = Field("HS256")
    access_token_expire_minutes: int = Field(30)
    refresh_token_expire_days: int = Field(7)

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
    # NOTE: When set via env var, use JSON array format (pydantic-settings v2 requirement):
    # ALLOWED_FILE_TYPES=[".pdf",".doc",".docx",".xls",".xlsx",".ppt",".pptx",".txt",".json",".csv"]
    allowed_file_types: List[str] = Field(
        [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".json", ".csv"]
    )

    # Compliance evaluation settings
    # NOTE: When set via env var, use JSON array format (pydantic-settings v2 requirement):
    # DEFAULT_EVALUATION_SCOPE=["CC","A","C","PI","CA"]
    default_evaluation_scope: List[str] = Field(
        ["CC", "A", "C", "PI", "CA"]
    )
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

    # Server settings
    host: str = Field("127.0.0.1")
    port: int = Field(8000)
    workers: int = Field(1)

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v):
        """Parse CORS origins from environment variable string."""
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",")]
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
        """Parse allowed file types from environment variable string."""
        if isinstance(v, str):
            return [ftype.strip() for ftype in v.split(",")]
        return v

    @field_validator("default_evaluation_scope", mode="before")
    @classmethod
    def parse_evaluation_scope(cls, v):
        """Parse evaluation scope from environment variable string."""
        if isinstance(v, str):
            return [scope.strip() for scope in v.split(",")]
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
        """Validate AWS credentials are set together."""
        data = info.data
        aws_key_id = data.get("aws_access_key_id")
        aws_secret = data.get("aws_secret_access_key")

        # If one is set, both should be set
        if bool(aws_key_id) != bool(aws_secret):
            raise ValueError("Both AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set together")

        return v

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


# Environment-specific overrides are applied inside Settings._apply_environment_overrides
# at construction time — no post-init mutation here.

# Validate production settings in production environment
if settings.environment == Environment.PRODUCTION:
    production_warnings = validate_production_settings()
    if production_warnings:
        import warnings
        for warning in production_warnings:
            warnings.warn(warning, UserWarning)