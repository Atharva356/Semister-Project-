"""
Unit tests for AgriMandi Configuration and Environment Handling.
Verifies fail-fast validation and environment variable parsing.
"""

import pytest
from config import Config


def test_config_valid_in_memory_mode():
    """In memory DB mode, validate() should succeed without Supabase credentials."""
    class TestConf(Config):
        USE_MEMORY_DB = True
        ENVIRONMENT = "development"

    # Should not raise
    TestConf.validate()


def test_config_fails_when_supabase_missing_in_live_mode(monkeypatch):
    """When USE_MEMORY_DB=False and not testing, missing Supabase credentials must raise ValueError."""
    # Temporarily remove PYTEST_CURRENT_TEST to simulate non-test startup check
    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
    monkeypatch.delenv("TESTING", raising=False)

    class InvalidConf(Config):
        USE_MEMORY_DB = False
        ENVIRONMENT = "development"
        SUPABASE_URL = ""
        SUPABASE_KEY = ""

    with pytest.raises(ValueError) as excinfo:
        InvalidConf.validate()

    assert "Missing Required Environment Variables" in str(excinfo.value)
    assert "SUPABASE_URL" in str(excinfo.value)
    assert "SUPABASE_KEY" in str(excinfo.value)


def test_config_fails_in_production_with_memory_db():
    """USE_MEMORY_DB=true must fail fast in production."""
    class ProdMemoryConf(Config):
        ENVIRONMENT = "production"
        USE_MEMORY_DB = True
        SECRET_KEY = "super-secret-custom-key"

    with pytest.raises(RuntimeError) as excinfo:
        ProdMemoryConf.validate()

    assert "USE_MEMORY_DB cannot be enabled in production" in str(excinfo.value)


def test_config_fails_in_production_with_default_secret_key():
    """Default dev SECRET_KEY must fail fast in production."""
    class ProdDefaultSecretConf(Config):
        ENVIRONMENT = "production"
        USE_MEMORY_DB = False
        SUPABASE_URL = "https://prod.supabase.co"
        SUPABASE_KEY = "valid-prod-key"
        SECRET_KEY = "agrimandi-dev-secret-key-change-in-prod"

    with pytest.raises(ValueError) as excinfo:
        ProdDefaultSecretConf.validate()

    assert "SECRET_KEY" in str(excinfo.value)
    assert "must be set to a secure, random string in production" in str(excinfo.value)


def test_cors_origins_parsing(monkeypatch):
    """CORS origins should be parsed as trimmed list of URLs."""
    raw = "https://app.example.com, https://buyer.example.com "
    parsed = [orig.strip() for orig in raw.split(",") if orig.strip()]
    assert parsed == ["https://app.example.com", "https://buyer.example.com"]
