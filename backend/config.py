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
    """Application configuration for AgriMandi Flask backend."""
    PORT = int(os.environ.get("PORT", 5000))
    HOST = os.environ.get("HOST", "0.0.0.0")
    # Default DEBUG to False as required
    DEBUG = os.environ.get("DEBUG", "False").lower() in ("true", "1", "yes")

    # Supabase credentials
    SUPABASE_URL = os.environ.get("SUPABASE_URL", "").strip()
    SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "").strip()
    SUPABASE_JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET", "").strip()

    # Explicit in-memory database flag (default False)
    USE_MEMORY_DB = os.environ.get("USE_MEMORY_DB", "False").lower() in ("true", "1", "yes")

    # Allowed CORS origins (comma-separated string, default http://localhost:5500 and http://127.0.0.1:5500)
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
