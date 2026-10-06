from flask import Blueprint, request, jsonify
from db import db

orders_bp = Blueprint("orders", __name__)

VALID_STATUSES = ["Pending", "Confirmed", "Dispatched", "Delivered", "Cancelled"]

@orders_bp.route("", methods=["GET"])
def get_orders():
    """
    GET /api/orders
    Query parameters:
      - buyer_email: filter orders placed by a specific buyer
      - farmer_name: filter orders for a specific farmer's produce
    """
    buyer_email = request.args.get("buyer_email")
    farmer_name = request.args.get("farmer_name")

    orders = db.get_all_orders(buyer_email=buyer_email, farmer_name=farmer_name)
    return jsonify({
        "success": True,
        "count": len(orders),
        "data": orders
    }), 200

@orders_bp.route("/<order_id>", methods=["GET"])
def get_single_order(order_id):
    """
    GET /api/orders/<order_id>
    Retrieve summary details of a specific order.
    """
    order = db.get_order_by_id(order_id)
    if not order:
        return jsonify({
            "success": False,
            "error": "Order not found"
        }), 404

    return jsonify({
        "success": True,
        "data": order
    }), 200

@orders_bp.route("", methods=["POST"])
def create_order():
    """
    POST /api/orders
    Places a new purchase order.
    Expected payload fields:
      produceName, quantity, unit, unitPrice, totalPrice,
      farmerName, farmerLocation, buyerName, buyerEmail, deliveryAddress
    """
    data = request.get_json(silent=True) or {}
    
    required_fields = ["produceName", "quantity", "unitPrice", "totalPrice"]
    missing = [f for f in required_fields if f not in data]
    if missing:
        return jsonify({
            "success": False,
            "error": f"Missing required fields: {', '.join(missing)}"
        }), 400

    try:
        qty = float(data.get("quantity", 0))
        unit_price = float(data.get("unitPrice", 0))
        total_price = float(data.get("totalPrice", 0))
        if qty <= 0 or unit_price < 0 or total_price < 0:
            return jsonify({"success": False, "error": "Quantities and prices must be positive numbers"}), 400
    except (ValueError, TypeError):
        return jsonify({"success": False, "error": "Invalid quantity or price values"}), 400

    order = db.create_order(data)
    return jsonify({
        "success": True,
        "message": "Order placed successfully",
        "data": order
    }), 201

@orders_bp.route("/<order_id>/status", methods=["PATCH", "PUT"])
def update_order_status(order_id):
    """
    PATCH/PUT /api/orders/<order_id>/status
    Payload: { "status": "Dispatched" }
    """
    data = request.get_json(silent=True) or {}
    status = data.get("status")

    if not status or status not in VALID_STATUSES:
        return jsonify({
            "success": False,
            "error": f"Invalid status. Must be one of: {', '.join(VALID_STATUSES)}"
        }), 400

    updated = db.update_order_status(order_id, status)
    if not updated:
        return jsonify({"success": False, "error": "Order not found"}), 404

    return jsonify({
        "success": True,
        "message": f"Order status updated to {status}",
        "data": updated
    }), 200
