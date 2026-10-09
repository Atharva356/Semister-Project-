"""
Application Configuration for AgriMandi Flask Backend.
Reads all configuration from environment variables with fail-fast validation.
"""

import os
from pathlib import Path

# Load .env file if python-dotenv is available
try:
    from dotenv import load_dotenv
    env_path = Path(__file__).resolve().parent / ".env"
    load_dotenv(dotenv_path=env_path)
except ImportError:
    pass


class Config:
    """Application configuration loaded from environment variables."""

    # Server settings
    PORT = int(os.environ.get("PORT", 5000))
    HOST = os.environ.get("HOST", "0.0.0.0")
    ENVIRONMENT = os.environ.get("FLASK_ENV") or os.environ.get("ENVIRONMENT", "development")

    # Debug flag: strictly parse boolean, default False for security
    DEBUG = os.environ.get("DEBUG", "False").lower() in ("true", "1", "yes")

    # Flask application secret key
    SECRET_KEY = os.environ.get("SECRET_KEY", "agrimandi-dev-secret-key-change-in-prod").strip()

    # Supabase credentials & JWT settings
    SUPABASE_URL = os.environ.get("SUPABASE_URL", "").strip()
    SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "").strip()
    SUPABASE_JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET", "").strip()

    # Explicit in-memory database flag (default False)
    USE_MEMORY_DB = os.environ.get("USE_MEMORY_DB", "False").lower() in ("true", "1", "yes")

    # Allowed CORS origins (comma-separated string)
    raw_cors = os.environ.get(
        "CORS_ORIGINS",
        "http://localhost:5500,http://127.0.0.1:5500,http://localhost:5000,http://127.0.0.1:5000,http://localhost:3000,http://127.0.0.1:3000"
    )
    CORS_ORIGINS = [orig.strip() for orig in raw_cors.split(",") if orig.strip()]

    @classmethod
    def is_supabase_configured(cls) -> bool:
        """Returns True only if Supabase URL and Key are set and not placeholder strings."""
        if cls.USE_MEMORY_DB:
            return False
        return bool(
            cls.SUPABASE_URL
            and cls.SUPABASE_KEY
            and "your-project-id" not in cls.SUPABASE_URL
            and "your-anon" not in cls.SUPABASE_KEY
        )

    @classmethod
    def validate(cls):
        """
        Validates environment configuration. Fails fast with clear, human-friendly
        error messages if required variables are missing or misconfigured.
        """
        is_testing = (
            os.environ.get("TESTING", "").lower() in ("true", "1")
            or "PYTEST_CURRENT_TEST" in os.environ
        )
        is_production = (
            cls.ENVIRONMENT.lower() == "production"
            or os.environ.get("FLASK_ENV", "").lower() == "production"
            or "RENDER" in os.environ
        )

        missing = []

        if is_production:
            if cls.USE_MEMORY_DB:
                raise RuntimeError(
                    "USE_MEMORY_DB cannot be enabled in production environments. "
                    "You must connect to a production Supabase database."
                )
            if not cls.SECRET_KEY or cls.SECRET_KEY == "agrimandi-dev-secret-key-change-in-prod":
                missing.append("SECRET_KEY (must be set to a secure, random string in production)")

        if not cls.USE_MEMORY_DB and not is_testing:
            if not cls.SUPABASE_URL or "your-project-id" in cls.SUPABASE_URL:
                missing.append("SUPABASE_URL (e.g. https://xyz.supabase.co)")
            if not cls.SUPABASE_KEY or "your-anon" in cls.SUPABASE_KEY:
                missing.append("SUPABASE_KEY (Supabase Anon or Service Role key)")

        if missing:
            missing_list = "\n  - " + "\n  - ".join(missing)
            raise ValueError(
                f"\n=================================================================\n"
                f" AgriMandi Startup Error: Missing Required Environment Variables\n"
                f"=================================================================\n"
                f"The following required configuration values are missing or unset:{missing_list}\n\n"
                f"How to fix:\n"
                f"1. Copy backend/.env.example to backend/.env\n"
                f"2. Fill in the required Supabase credentials\n"
                f"3. Or, for local offline development without Supabase, set USE_MEMORY_DB=true in backend/.env\n"
                f"=================================================================\n"
            )

