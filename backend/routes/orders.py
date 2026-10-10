"""
Orders Routes for AgriMandi API.
Handles secure order placement, role-based order queries, and status fulfillment transitions.
"""

import logging
from flask import Blueprint, g, jsonify, request
from auth import require_auth, require_role
from db import DatabaseError, db, serialize_order
from validation import validate_checkout_create, validate_order_create, validate_status_transition

logger = logging.getLogger("agrimandi.routes.orders")
orders_bp = Blueprint("orders", __name__)


@orders_bp.route("", methods=["GET"])
@require_auth
def get_orders():
    """
    GET /api/orders
    Returns orders scoped to the authenticated caller's identity:
      - Buyers receive orders they placed (buyer_id == g.user_id)
      - Farmers receive orders placed for their produce (farmer_id == g.user_id)
    """
    try:
        orders = db.get_orders_for_user(
            user_id=g.user_id,
            role=g.role,
            token=getattr(g, "token", None)
        )
        return jsonify({
            "success": True,
            "count": len(orders),
            "data": orders
        }), 200
    except DatabaseError as e:
        logger.error(f"Error fetching orders: {e}")
        return jsonify({"success": False, "error": "Failed to fetch orders"}), 500


@orders_bp.route("/<order_id>", methods=["GET"])
@require_auth
def get_single_order(order_id):
    """
    GET /api/orders/<order_id>
    Retrieves summary detail of an order.
    Caller must be either the ordering buyer or the fulfilling farmer.
    """
    try:
        order = db.get_order_by_id(order_id, token=getattr(g, "token", None))
        if not order:
            return jsonify({
                "success": False,
                "error": f"Order '{order_id}' not found"
            }), 404

        # Scope enforcement
        buyer_id = str(order.get("buyer_id") or order.get("buyerId") or "")
        farmer_id = str(order.get("farmer_id") or order.get("farmerId") or "")

        if g.user_id not in (buyer_id, farmer_id):
            return jsonify({
                "success": False,
                "error": "Forbidden: You are not authorized to view this order"
            }), 403

        return jsonify({
            "success": True,
            "data": serialize_order(order)
        }), 200
    except DatabaseError as e:
        logger.error(f"Error loading order {order_id}: {e}")
        return jsonify({"success": False, "error": "Failed to retrieve order"}), 500


@orders_bp.route("", methods=["POST"])
@require_role("buyer")
def create_order():
    """
    POST /api/orders
    Places a new purchase order.
    Requires authenticated 'buyer' role.
    Unit price and total price are calculated server-side from current database stock;
    any client-sent prices are strictly ignored to prevent manipulation.
    """
    data = request.get_json(silent=True) or {}
    is_valid, err_msg, validated = validate_order_create(data)
    if not is_valid:
        return jsonify({"success": False, "error": err_msg}), 400

    try:
        order = db.place_order(
            produce_id=validated["produce_id"],
            quantity=validated["quantity"],
            buyer_id=g.user_id,
            buyer_name=g.user_name,
            buyer_email=g.user_email,
            delivery_address=validated["delivery_address"],
            token=getattr(g, "token", None)
        )
        return jsonify({
            "success": True,
            "message": "Order placed successfully",
            "data": order
        }), 201
    except ValueError as e:
        # Business logic validation errors (e.g. Insufficient stock)
        return jsonify({"success": False, "error": str(e)}), 400
    except DatabaseError as e:
        logger.error(f"Database error during order creation: {e}")
        error_text = str(e)
        if "Insufficient stock" in error_text:
            return jsonify({"success": False, "error": "Insufficient stock available for this order"}), 400
        return jsonify({"success": False, "error": f"Failed to place order: {error_text}"}), 500


@orders_bp.route("/checkout", methods=["POST"])
@require_role("buyer")
def checkout_orders():
    """
    POST /api/orders/checkout
    Places multiple orders from the buyer's shopping cart.
    Requires authenticated 'buyer' role.
    """
    data = request.get_json(silent=True) or {}
    is_valid, err_msg, validated = validate_checkout_create(data)
    if not is_valid:
        return jsonify({"success": False, "error": err_msg}), 400

    created_orders = []
    delivery_address = validated["delivery_address"]
    items = validated["items"]

    try:
        for item in items:
            order = db.place_order(
                produce_id=item["produce_id"],
                quantity=item["quantity"],
                buyer_id=g.user_id,
                buyer_name=g.user_name,
                buyer_email=g.user_email,
                delivery_address=delivery_address,
                token=getattr(g, "token", None)
            )
            created_orders.append(order)

        return jsonify({
            "success": True,
            "message": f"Successfully placed {len(created_orders)} order(s)",
            "data": created_orders,
            "orderIds": [o.get("orderId") or o.get("id") for o in created_orders]
        }), 201
    except ValueError as e:
        return jsonify({"success": False, "error": str(e)}), 400
    except DatabaseError as e:
        logger.error(f"Database error during checkout: {e}")
        return jsonify({"success": False, "error": f"Failed to place order: {e}"}), 500


@orders_bp.route("/<order_id>/status", methods=["PATCH", "PUT"])
@require_auth
def update_order_status(order_id):
    """
    PATCH/PUT /api/orders/<order_id>/status
    Updates fulfillment status of an order.
    Rules:
      - Farmers can transition: Pending -> Confirmed, Rejected, or Cancelled; Confirmed -> Dispatched; Dispatched -> Delivered.
      - Buyers can Cancel their own order while Pending, or confirm receipt (Dispatched -> Delivered).
      - Stock is restored on cancellation and rejection.
    Payload: { "status": "Dispatched", "reason": "Optional rejection reason" }
    """
    data = request.get_json(silent=True) or {}
    new_status = data.get("status")
    reason = data.get("reason")

    if not new_status:
        return jsonify({"success": False, "error": "Status field is required"}), 400

    target_order = db.get_order_by_id(order_id, token=getattr(g, "token", None))
    if not target_order:
        return jsonify({"success": False, "error": f"Order '{order_id}' not found"}), 404

    current_status = target_order.get("status", "Pending")
    buyer_id = str(target_order.get("buyer_id") or target_order.get("buyerId") or "")
    farmer_id = str(target_order.get("farmer_id") or target_order.get("farmerId") or "")

    # Role and authorization validation
    if g.role == "farmer":
        if farmer_id and farmer_id != g.user_id:
            return jsonify({
                "success": False,
                "error": "Forbidden: You can only update orders for your own produce"
            }), 403
    elif g.role == "buyer":
        if buyer_id and buyer_id != g.user_id:
            return jsonify({
                "success": False,
                "error": "Forbidden: You can only update your own orders"
            }), 403
        if new_status == "Cancelled" and current_status != "Pending":
            return jsonify({
                "success": False,
                "error": "Buyers can only cancel orders that are currently in 'Pending' status"
            }), 400
        if new_status == "Delivered" and current_status != "Dispatched":
            return jsonify({
                "success": False,
                "error": "Buyers can only confirm receipt of orders that are currently 'Dispatched'"
            }), 400
        if new_status not in ("Cancelled", "Delivered"):
            return jsonify({
                "success": False,
                "error": "Buyers can only cancel pending orders or mark dispatched orders as delivered"
            }), 400
    else:
        return jsonify({"success": False, "error": "Forbidden: Unrecognized role"}), 403

    # State transition check
    is_valid_transition, transition_err = validate_status_transition(current_status, new_status, g.role)
    if not is_valid_transition:
        return jsonify({"success": False, "error": transition_err}), 400

    try:
        updated = db.update_order_status(order_id, new_status, reason=reason, token=getattr(g, "token", None))
        if not updated:
            return jsonify({"success": False, "error": "Order status could not be updated"}), 404

        return jsonify({
            "success": True,
            "message": f"Order status updated to '{new_status}'",
            "data": updated
        }), 200
    except DatabaseError as e:
        logger.error(f"Error updating order status for {order_id}: {e}")
        return jsonify({"success": False, "error": f"Could not update status: {e}"}), 500
