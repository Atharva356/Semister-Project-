"""
Pytest Fixtures for AgriMandi Backend Test Suite.
Configures Flask app in USE_MEMORY_DB mode with fresh state for each test.
"""

import os
import sys
from pathlib import Path
import pytest

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

# Force memory DB mode for tests
os.environ["USE_MEMORY_DB"] = "true"
os.environ["DEBUG"] = "false"

from config import Config
Config.USE_MEMORY_DB = True

from app import create_app
from db import db, INITIAL_PRODUCE, INITIAL_PROFILES

@pytest.fixture
def app():
    """Provides test Flask application."""
    test_app = create_app()
    test_app.config["TESTING"] = True
    return test_app

@pytest.fixture
def client(app):
    """Provides Flask test client."""
    return app.test_client()

@pytest.fixture(autouse=True)
def reset_db_state():
    """Resets in-memory database to seed state before each test."""
    db._produce_store = [dict(p) for p in INITIAL_PRODUCE]
    db._profiles_store = {p["id"]: dict(p) for p in INITIAL_PROFILES}
    db._orders_store = []
    yield

@pytest.fixture
def farmer_auth_headers():
    """Returns headers for authenticated farmer (demo farmer)."""
    return {"Authorization": "Bearer test-farmer-demo-uuid-1"}

@pytest.fixture
def other_farmer_auth_headers():
    """Returns headers for a different farmer."""
    db._profiles_store["farmer-other-2"] = {
        "id": "farmer-other-2",
        "email": "farmer2@example.com",
        "full_name": "Baldev Chauhan",
        "role": "farmer"
    }
    return {"Authorization": "Bearer test-farmer-other-2"}

@pytest.fixture
def buyer_auth_headers():
    """Returns headers for authenticated buyer (demo buyer)."""
    return {"Authorization": "Bearer test-buyer-demo-uuid-1"}
