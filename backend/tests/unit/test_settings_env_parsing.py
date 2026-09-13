"""Settings env-parsing regression tests (web-mode boot blocker).

pydantic-settings v2 JSON-decodes list fields BEFORE field validators run, so
a machine-level env var like ``ALLOWED_FILE_TYPES=pdf,doc`` (comma string — the
shape every README/dotenv example implies) aborted Settings construction with a
SettingsError and the API could not boot at all. The NoDecode annotations now
route the raw string to the comma-split validators; these tests pin both
accepted forms plus the AWS placeholder handling.
"""

import pytest

from app.core.config import Settings


@pytest.fixture
def clear_env(monkeypatch):
    """Remove machine-level overrides so defaults are observable."""
    for var in (
        "ALLOWED_FILE_TYPES",
        "CORS_ORIGINS",
        "ALLOWED_HOSTS",
        "DATABASE_URL",
        "AWS_ACCESS_KEY_ID",
        "AWS_SECRET_ACCESS_KEY",
    ):
        monkeypatch.delenv(var, raising=False)
    return monkeypatch


class TestListEnvParsing:
    def test_comma_separated_file_types(self, clear_env):
        clear_env.setenv("ALLOWED_FILE_TYPES", "pdf,doc,docx")
        s = Settings()
        assert s.allowed_file_types == [".pdf", ".doc", ".docx"]

    def test_json_array_file_types_still_accepted(self, clear_env):
        clear_env.setenv("ALLOWED_FILE_TYPES", '[".pdf", ".json"]')
        s = Settings()
        assert s.allowed_file_types == [".pdf", ".json"]

    def test_comma_separated_cors_origins(self, clear_env):
        clear_env.setenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000")
        s = Settings()
        assert s.cors_origins == ["http://localhost:5173", "http://localhost:3000"]

    def test_json_array_cors_origins_still_accepted(self, clear_env):
        clear_env.setenv("CORS_ORIGINS", '["https://app.example.com"]')
        s = Settings()
        assert s.cors_origins == ["https://app.example.com"]

    def test_dot_prefixed_file_types_pass_through(self, clear_env):
        clear_env.setenv("ALLOWED_FILE_TYPES", ".csv,.xlsx")
        s = Settings()
        assert s.allowed_file_types == [".csv", ".xlsx"]


class TestAwsPlaceholderHandling:
    def test_placeholder_pair_is_treated_as_unset(self, clear_env):
        clear_env.setenv("AWS_ACCESS_KEY_ID", "your-aws-access-key-id")
        clear_env.setenv("AWS_SECRET_ACCESS_KEY", "your-aws-secret-access-key")
        s = Settings()
        assert s.aws_access_key_id is None
        assert s.aws_secret_access_key is None

    def test_one_placeholder_one_real_still_rejected(self, clear_env):
        clear_env.setenv("AWS_ACCESS_KEY_ID", "your-aws-access-key-id")
        clear_env.setenv("AWS_SECRET_ACCESS_KEY", "AKIARealSecret")
        with pytest.raises(Exception, match="must be set together"):
            Settings()

    def test_real_pair_is_preserved(self, clear_env):
        clear_env.setenv("AWS_ACCESS_KEY_ID", "AKIATEST")
        clear_env.setenv("AWS_SECRET_ACCESS_KEY", "secretvalue")
        s = Settings()
        assert s.aws_access_key_id == "AKIATEST"
        assert s.aws_secret_access_key == "secretvalue"
