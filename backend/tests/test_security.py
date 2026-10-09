"""
Security Test Suite for AgriMandi Backend.
Tests critical security boundaries, token bypass prevention, authorization spoofing checks,
and cancellation stock restoration across roles.
"""

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


def test_place_order_ignores_client_supplied_buyer_id(client, buyer_auth_headers):
    """
    Assert that client-supplied buyerId/buyer_id in the payload is ignored
    and the order is strictly associated with the authenticated user's ID.
    """
    spoofed_buyer_id = "attacker-evil-uuid-999"
    payload = {
        "produceId": "prod-1",
        "quantity": 2,
        "deliveryAddress": "456 Cyber St, Pune",
        "buyerId": spoofed_buyer_id,
        "buyer_id": spoofed_buyer_id
    }
    res = client.post("/api/orders", json=payload, headers=buyer_auth_headers)
    assert res.status_code == 201
    data = res.get_json()["data"]

    # Order must NOT be placed under the spoofed buyer ID
    assert data["buyerId"] != spoofed_buyer_id
    assert data["buyerId"] == "buyer-demo-uuid-1"

    # Verify db record
    placed_order = db.get_order_by_id(data["orderId"])
    assert placed_order["buyer_id"] == "buyer-demo-uuid-1"
    assert placed_order["buyer_id"] != spoofed_buyer_id


def test_order_cancellation_restores_stock_buyer(client, buyer_auth_headers):
    """
    Cancelling an order as a buyer (in Pending status) must restore the produce stock.
    """
    initial_prod = db.get_produce_by_id("prod-1")
    initial_stock = float(initial_prod["quantity"])
    order_qty = 5.0

    # Place order
    res = client.post("/api/orders", json={
        "produceId": "prod-1",
        "quantity": order_qty,
        "deliveryAddress": "Buyer Address, Pune"
    }, headers=buyer_auth_headers)
    assert res.status_code == 201
    order_id = res.get_json()["data"]["orderId"]

    # Produce stock is reduced
    prod_after_order = db.get_produce_by_id("prod-1")
    assert float(prod_after_order["quantity"]) == initial_stock - order_qty

    # Ensure status is Pending for buyer cancellation
    for o in db._orders_store:
        if o.get("order_id") == order_id:
            o["status"] = "Pending"

    # Buyer cancels
    cancel_res = client.patch(
        f"/api/orders/{order_id}/status",
        json={"status": "Cancelled"},
        headers=buyer_auth_headers
    )
    assert cancel_res.status_code == 200
    assert cancel_res.get_json()["data"]["status"] == "Cancelled"

    # Stock is fully restored
    prod_after_cancel = db.get_produce_by_id("prod-1")
    assert float(prod_after_cancel["quantity"]) == initial_stock


def test_order_cancellation_restores_stock_farmer(client, buyer_auth_headers, farmer_auth_headers):
    """
    Cancelling an order as a farmer (in Pending or Confirmed status) must restore the produce stock.
    """
    initial_prod = db.get_produce_by_id("prod-1")
    initial_stock = float(initial_prod["quantity"])
    order_qty = 7.0

    # Place order by buyer
    res = client.post("/api/orders", json={
        "produceId": "prod-1",
        "quantity": order_qty,
        "deliveryAddress": "Buyer Farm Road, Pune"
    }, headers=buyer_auth_headers)
    assert res.status_code == 201
    order_id = res.get_json()["data"]["orderId"]

    # Stock decremented
    prod_after_order = db.get_produce_by_id("prod-1")
    assert float(prod_after_order["quantity"]) == initial_stock - order_qty

    # Farmer cancels the Confirmed order
    cancel_res = client.patch(
        f"/api/orders/{order_id}/status",
        json={"status": "Cancelled"},
        headers=farmer_auth_headers
    )
    assert cancel_res.status_code == 200
    assert cancel_res.get_json()["data"]["status"] == "Cancelled"

    # Stock restored back to initial level
    prod_after_cancel = db.get_produce_by_id("prod-1")
    assert float(prod_after_cancel["quantity"]) == initial_stock
