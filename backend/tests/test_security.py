"""
Security Test Suite for AgriMandi Backend.
Tests critical security boundaries, token bypass prevention, authorization spoofing checks,
and cancellation stock restoration across roles.
"""

import os
from unittest.mock import patch
import pytest
from app import create_app
from config import Config
from db import db


def test_mock_token_rejected_when_use_memory_db_false(monkeypatch):
    """
    With USE_MEMORY_DB=False, 'Bearer mock-farmer' must return 401
    and never reach the database.
    """
    monkeypatch.setattr(Config, "USE_MEMORY_DB", False)

    app = create_app()
    app.config["TESTING"] = True
    test_client = app.test_client()

    # Spy on db functions to ensure database is NEVER reached
    with patch.object(db, "get_orders_for_user") as mock_get_orders, \
         patch.object(db, "place_order") as mock_place_order, \
         patch.object(db, "create_produce") as mock_create_prod:

        res = test_client.get(
            "/api/orders",
            headers={"Authorization": "Bearer mock-farmer"}
        )

        assert res.status_code == 401
        data = res.get_json()
        assert data["success"] is False
        assert mock_get_orders.call_count == 0
        assert mock_place_order.call_count == 0
        assert mock_create_prod.call_count == 0


def test_startup_check_raises_in_production(monkeypatch):
    """create_app() must raise RuntimeError if USE_MEMORY_DB is True in a production environment."""
    monkeypatch.setattr(Config, "USE_MEMORY_DB", True)

    # Test FLASK_ENV=production
    monkeypatch.setenv("FLASK_ENV", "production")
    with pytest.raises(RuntimeError, match="USE_MEMORY_DB cannot be enabled in production"):
        create_app()

    monkeypatch.delenv("FLASK_ENV", raising=False)

    # Test RENDER env var
    monkeypatch.setenv("RENDER", "true")
    with pytest.raises(RuntimeError, match="USE_MEMORY_DB cannot be enabled in production"):
        create_app()
