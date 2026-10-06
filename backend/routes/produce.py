from flask import Blueprint, request, jsonify
from db import db

produce_bp = Blueprint("produce", __name__)

@produce_bp.route("", methods=["GET"])
def get_produce_list():
    """
    GET /api/produce
    Query parameters:
      - search: string to match crop name, location, or farmer name
      - category: filter by category (e.g., Vegetables, Fruits, Grains, Pulses, Spices)
      - location: filter by state or district
    """
    search = request.args.get("search") or request.args.get("q")
    category = request.args.get("category")
    location = request.args.get("location")

    produce = db.get_all_produce(search=search, category=category, location=location)
    return jsonify({
        "success": True,
        "count": len(produce),
        "data": produce
    }), 200

@produce_bp.route("/stats", methods=["GET"])
def get_produce_statistics():
    """
    GET /api/produce/stats
    Returns aggregated metrics for farmer listings & total inventory.
    """
    stats = db.get_produce_stats()
    return jsonify({
        "success": True,
        "data": stats
    }), 200

@produce_bp.route("/<produce_id>", methods=["GET"])
def get_single_produce(produce_id):
    """
    GET /api/produce/<produce_id>
    Returns detail of a single produce item.
    """
    item = db.get_produce_by_id(produce_id)
    if not item:
        return jsonify({
            "success": False,
            "error": "Produce listing not found"
        }), 404

    return jsonify({
        "success": True,
        "data": item
    }), 200

@produce_bp.route("", methods=["POST"])
def create_produce():
    """
    POST /api/produce
    Creates a new produce listing.
    Required fields: name, category, quantity, unit, price, location
    Optional fields: farmerName, image
    """
    data = request.get_json(silent=True) or {}
    
    # Validation
    required_fields = ["name", "category", "quantity", "unit", "price", "location"]
    missing = [f for f in required_fields if f not in data or data[f] == ""]
    if missing:
        return jsonify({
            "success": False,
            "error": f"Missing required fields: {', '.join(missing)}"
        }), 400

    try:
        quantity = float(data.get("quantity", 0))
        price = float(data.get("price", 0))
        if quantity <= 0:
            return jsonify({"success": False, "error": "Quantity must be greater than 0"}), 400
        if price <= 0:
            return jsonify({"success": False, "error": "Price must be greater than 0"}), 400
    except (ValueError, TypeError):
        return jsonify({"success": False, "error": "Quantity and price must be valid numbers"}), 400

    created = db.create_produce(data)
    return jsonify({
        "success": True,
        "message": "Produce listing published successfully",
        "data": created
    }), 201

@produce_bp.route("/<produce_id>", methods=["PUT"])
def update_produce(produce_id):
    """
    PUT /api/produce/<produce_id>
    Updates an existing produce listing.
    """
    data = request.get_json(silent=True) or {}
    if not data:
        return jsonify({"success": False, "error": "No update fields provided"}), 400

    updated = db.update_produce(produce_id, data)
    if not updated:
        return jsonify({"success": False, "error": "Produce item not found"}), 404

    return jsonify({
        "success": True,
        "message": "Produce listing updated successfully",
        "data": updated
    }), 200

@produce_bp.route("/<produce_id>", methods=["DELETE"])
def delete_produce(produce_id):
    """
    DELETE /api/produce/<produce_id>
    Removes a produce listing from the marketplace.
    """
    deleted = db.delete_produce(produce_id)
    if not deleted:
        return jsonify({"success": False, "error": "Produce item not found"}), 404

    return jsonify({
        "success": True,
        "message": "Produce listing removed successfully"
    }), 200
