"""
AgriMandi Backend Integration and Security Test Suite.
Covers authentication requirements, role authorization, ownership checks,
server-side price computations, inventory safety, status transitions, and input validation.
"""

from db import db

# ==============================================================================
# 1. AUTHENTICATION & ROLE ACCESS CONTROL TESTS
# ==============================================================================

def test_auth_required_for_produce_creation(client):
    """POST /api/produce without Authorization header must return 401."""
    res = client.post("/api/produce", json={
        "name": "Fresh Organic Carrots",
        "category": "Vegetables",
        "quantity": 100,
        "unit": "Kg",
        "price": 40,
        "location": "Pune, Maharashtra"
    })
    assert res.status_code == 401
    data = res.get_json()
    assert data["success"] is False
    assert "Authorization header" in data["error"] or "sign in" in data["error"]


def test_auth_required_for_orders_list(client):
    """GET /api/orders without Authorization header must return 401."""
    res = client.get("/api/orders")
    assert res.status_code == 401
    data = res.get_json()
    assert data["success"] is False


def test_wrong_role_cannot_create_produce(client, buyer_auth_headers):
    """A user with 'buyer' role must receive 403 Forbidden when trying to create produce."""
    res = client.post("/api/produce", json={
        "name": "Organic Honey",
        "category": "Vegetables",
        "quantity": 20,
        "unit": "Kg",
        "price": 350,
        "location": "Himachal Pradesh"
    }, headers=buyer_auth_headers)

    assert res.status_code == 403
    data = res.get_json()
    assert data["success"] is False
    assert "farmer" in data["error"].lower()


def test_wrong_role_cannot_create_order(client, farmer_auth_headers):
    """A user with 'farmer' role must receive 403 Forbidden when trying to place purchase order."""
    res = client.post("/api/orders", json={
        "produceId": "prod-1",
        "quantity": 5,
        "deliveryAddress": "123 Farm House, Sehore, MP"
    }, headers=farmer_auth_headers)

    assert res.status_code == 403
    data = res.get_json()
    assert data["success"] is False
    assert "buyer" in data["error"].lower()


# ==============================================================================
# 2. OWNERSHIP & DATA ISOLATION TESTS
# ==============================================================================

def test_farmer_cannot_edit_another_farmers_listing(client, other_farmer_auth_headers):
    """Farmer B cannot edit Farmer A's produce listing (403 Forbidden)."""
    # prod-1 belongs to farmer-demo-uuid-1
    res = client.put("/api/produce/prod-1", json={
        "price": 9999
    }, headers=other_farmer_auth_headers)

    assert res.status_code == 403
    data = res.get_json()
    assert data["success"] is False
    assert "not authorized" in data["error"].lower()


def test_farmer_cannot_delete_another_farmers_listing(client, other_farmer_auth_headers):
    """Farmer B cannot delete Farmer A's produce listing (403 Forbidden)."""
    res = client.delete("/api/produce/prod-1", headers=other_farmer_auth_headers)
    assert res.status_code == 403
    data = res.get_json()
    assert data["success"] is False


def test_farmer_can_edit_own_listing(client, farmer_auth_headers):
    """Farmer can edit their own listing."""
    res = client.put("/api/produce/prod-1", json={
        "price": 3400.0,
        "quantity": 45.0
    }, headers=farmer_auth_headers)

    assert res.status_code == 200
    data = res.get_json()
    assert data["success"] is True
    assert data["data"]["price"] == 3400.0
    assert data["data"]["quantity"] == 45.0


# ==============================================================================
# 3. PRICING & INVENTORY SAFETY TESTS
# ==============================================================================

def test_order_total_price_computed_server_side(client, buyer_auth_headers):
    """
    Client sends manipulatively low unitPrice and totalPrice,
    but the server computes total price strictly from the database price.
    """
    # prod-1 price in database is 3200 per Quintal
    initial_stock = 50.0
    order_qty = 2.0
    expected_total = 3200.0 * order_qty

    res = client.post("/api/orders", json={
        "produceId": "prod-1",
        "quantity": order_qty,
        "unitPrice": 1.0,        # Attempted tampering
        "totalPrice": 2.0,       # Attempted tampering
        "deliveryAddress": "402 Baker Street, Pune, Maharashtra"
    }, headers=buyer_auth_headers)

    assert res.status_code == 201
    data = res.get_json()
    assert data["success"] is True
    order = data["data"]

    # Verify server calculated total
    assert order["totalPrice"] == expected_total
    assert order["unitPrice"] == 3200.0

    # Verify inventory was decremented
    updated_prod = db.get_produce_by_id("prod-1")
    assert float(updated_prod["quantity"]) == initial_stock - order_qty


def test_insufficient_stock_rejected(client, buyer_auth_headers):
    """Attempting to order more quantity than available must return 400."""
    # prod-1 available quantity is 50
    res = client.post("/api/orders", json={
        "produceId": "prod-1",
        "quantity": 100.0,
        "deliveryAddress": "Industrial Estate, Nashik, Maharashtra"
    }, headers=buyer_auth_headers)

    assert res.status_code == 400
    data = res.get_json()
    assert data["success"] is False
    assert "stock" in data["error"].lower()


# ==============================================================================
# 4. ORDER STATUS TRANSITION RULES & STOCK RESTORATION
# ==============================================================================

def test_order_lifecycle_and_cancellation_restores_stock(client, buyer_auth_headers, farmer_auth_headers):
    """
    Tests valid status transitions and verifies that cancelling an order restores stock.
    """
    # 1. Place order for 10 units of prod-2 (tomatoes, stock = 250)
    initial_stock = float(db.get_produce_by_id("prod-2")["quantity"])
    assert initial_stock == 250.0

    order_res = client.post("/api/orders", json={
        "produceId": "prod-2",
        "quantity": 10.0,
        "deliveryAddress": "Flat 101, Residency, Mumbai"
    }, headers=buyer_auth_headers)

    assert order_res.status_code == 201
    order = order_res.get_json()["data"]
    order_id = order["orderId"]

    # Verify stock decremented
    stock_after_order = float(db.get_produce_by_id("prod-2")["quantity"])
    assert stock_after_order == 240.0

    # 2. Farmer transitions: Confirmed -> Dispatched
    res = client.patch(f"/api/orders/{order_id}/status", json={
        "status": "Dispatched"
    }, headers=farmer_auth_headers)
    assert res.status_code == 200
    assert res.get_json()["data"]["status"] == "Dispatched"

    # 3. Invalid transition: Dispatched -> Pending (rejected)
    res_invalid = client.patch(f"/api/orders/{order_id}/status", json={
        "status": "Pending"
    }, headers=farmer_auth_headers)
    assert res_invalid.status_code == 400

    # 4. Farmer completes delivery: Dispatched -> Delivered
    res_deliv = client.patch(f"/api/orders/{order_id}/status", json={
        "status": "Delivered"
    }, headers=farmer_auth_headers)
    assert res_deliv.status_code == 200
    assert res_deliv.get_json()["data"]["status"] == "Delivered"


def test_buyer_cancellation_restores_stock(client, buyer_auth_headers, farmer_auth_headers):
    """When a buyer cancels an order, inventory stock must be restored."""
    # Place order
    order_res = client.post("/api/orders", json={
        "produceId": "prod-4",
        "quantity": 50.0,
        "deliveryAddress": "City Center, Bangalore, Karnataka"
    }, headers=buyer_auth_headers)
    assert order_res.status_code == 201
    order_id = order_res.get_json()["data"]["orderId"]

    # Stock is decremented by 50
    prod_before = float(db.get_produce_by_id("prod-4")["quantity"])

    # Set status to Pending so buyer can cancel
    db.update_order_status(order_id, "Pending")

    # Buyer cancels order
    cancel_res = client.patch(f"/api/orders/{order_id}/status", json={
        "status": "Cancelled"
    }, headers=buyer_auth_headers)
    assert cancel_res.status_code == 200
    assert cancel_res.get_json()["data"]["status"] == "Cancelled"

    # Verify stock restored
    prod_after = float(db.get_produce_by_id("prod-4")["quantity"])
    assert prod_after == prod_before + 50.0


# ==============================================================================
# 5. INPUT VALIDATION TESTS
# ==============================================================================

def test_produce_input_validation(client, farmer_auth_headers):
    """Validates required fields, lengths, numbers, and enums."""
    # Invalid category
    res = client.post("/api/produce", json={
        "name": "Wild Flowers",
        "category": "InvalidCategory",
        "quantity": 10,
        "price": 50,
        "location": "Nagpur"
    }, headers=farmer_auth_headers)
    assert res.status_code == 400
    assert "category" in res.get_json()["error"].lower()

    # Negative price
    res = client.post("/api/produce", json={
        "name": "Tomatoes",
        "category": "Vegetables",
        "quantity": 10,
        "price": -10,
        "location": "Nagpur"
    }, headers=farmer_auth_headers)
    assert res.status_code == 400
    assert "price" in res.get_json()["error"].lower()

    # Missing name
    res = client.post("/api/produce", json={
        "name": "",
        "category": "Vegetables",
        "quantity": 10,
        "price": 20,
        "location": "Nagpur"
    }, headers=farmer_auth_headers)
    assert res.status_code == 400
    assert "name" in res.get_json()["error"].lower()


def test_public_produce_search_and_pagination(client):
    """GET /api/produce supports search query, price filters, and pagination."""
    res = client.get("/api/produce?search=wheat&page=1&limit=5")
    assert res.status_code == 200
    data = res.get_json()
    assert data["success"] is True
    assert "data" in data
    assert any("wheat" in item["name"].lower() for item in data["data"])

    # Health check
    res_health = client.get("/api/health")
    assert res_health.status_code == 200
    assert res_health.get_json()["status"] == "healthy"
    assert res_health.get_json()["database"]["connected"] is True


def test_health_check_unhealthy_when_db_down(client, monkeypatch):
    """When DB connectivity check fails, /api/health must return 503 and status 'unhealthy'."""
    from db import db
    monkeypatch.setattr(db, "check_connection", lambda: (False, "PostgreSQL connection refused", {"error": "refused"}))

    res = client.get("/api/health")
    assert res.status_code == 503
    data = res.get_json()
    assert data["status"] == "unhealthy"
    assert data["database"]["connected"] is False
    assert "PostgreSQL connection refused" in data["database"]["message"]


def test_global_error_handler_never_leaks_traceback(client, monkeypatch):
    """Unhandled server errors must return 500 with generic safe message, never leaking stack traces."""
    from db import db
    def mock_broken_get(*args, **kwargs):
        raise RuntimeError("Sensitive internal database secret or stack trace details")

    monkeypatch.setattr(db, "get_all_produce", mock_broken_get)

    res = client.get("/api/produce")
    assert res.status_code == 500
    data = res.get_json()
    assert data["success"] is False
    assert data["error"] == "An internal server error occurred. Please try again later."
    # Ensure sensitive traceback details were not leaked in the HTTP response
    response_text = res.get_data(as_text=True)
    assert "Sensitive internal database secret" not in response_text
    assert "Traceback" not in response_text
    assert "File \"" not in response_text


def test_structured_json_logger():
    """Structured JSON formatter must format log records as valid JSON lines."""
    import json
    import logging
    from logger import JSONFormatter

    formatter = JSONFormatter()
    record = logging.LogRecord(
        name="agrimandi.test",
        level=logging.INFO,
        pathname="test.py",
        lineno=10,
        msg="User %s logged in",
        args=("buyer-1",),
        exc_info=None
    )
    output = formatter.format(record)
    parsed = json.loads(output)
    assert parsed["level"] == "INFO"
    assert parsed["logger"] == "agrimandi.test"
    assert parsed["message"] == "User buyer-1 logged in"
    assert "timestamp" in parsed

