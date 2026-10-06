"""
Produce Routes for AgriMandi API.
Provides public marketplace exploration and protected farmer catalogue management.
"""

import logging
from flask import Blueprint, g, jsonify, request
from auth import require_role
from db import DatabaseError, db
from validation import validate_produce_create, validate_produce_update

logger = logging.getLogger("agrimandi.routes.produce")
produce_bp = Blueprint("produce", __name__)


@produce_bp.route("", methods=["GET"])
def get_produce_list():
    """
    GET /api/produce
    Public marketplace query endpoint.
    Query parameters:
      - search / q: Substring match across crop name, harvest location, or farmer name
      - category: Filter by exact category (e.g. Vegetables, Fruits, Grains)
      - location: Filter by region/location substring
      - min_price: Minimum price filter (numeric)
      - max_price: Maximum price filter (numeric)
      - farmer_id: Filter listings by specific farmer UUID
      - page: Page number (1-indexed, default 1)
      - limit: Items per page (default 20, max 50)
    """
    search = request.args.get("search") or request.args.get("q")
    category = request.args.get("category")
    location = request.args.get("location")
    farmer_id = request.args.get("farmer_id")

    min_price = None
    max_price = None
    try:
        if request.args.get("min_price"):
            min_price = float(request.args.get("min_price"))
        if request.args.get("max_price"):
            max_price = float(request.args.get("max_price"))
    except ValueError:
        return jsonify({
            "success": False,
            "error": "min_price and max_price query parameters must be numeric"
        }), 400

    try:
        page = int(request.args.get("page", 1))
        limit = int(request.args.get("limit", 20))
    except ValueError:
        return jsonify({
            "success": False,
            "error": "page and limit query parameters must be integers"
        }), 400

    try:
        items, total_count = db.get_all_produce(
            search=search,
            category=category,
            location=location,
            min_price=min_price,
            max_price=max_price,
            farmer_id=farmer_id,
            page=page,
            limit=limit
        )
        return jsonify({
            "success": True,
            "count": len(items),
            "total": total_count,
            "page": page,
            "limit": limit,
            "data": items
        }), 200
    except DatabaseError as e:
        logger.error(f"Error querying produce: {e}")
        return jsonify({"success": False, "error": "Failed to retrieve produce listings"}), 500


@produce_bp.route("/stats", methods=["GET"])
def get_produce_statistics():
    """
    GET /api/produce/stats
    Returns aggregated metrics for available listings and inventory volume.
    """
    try:
        stats = db.get_produce_stats()
        return jsonify({
            "success": True,
            "data": stats
        }), 200
    except DatabaseError as e:
        logger.error(f"Error calculating stats: {e}")
        return jsonify({"success": False, "error": "Failed to calculate marketplace statistics"}), 500


@produce_bp.route("/<produce_id>", methods=["GET"])
def get_single_produce(produce_id):
    """
    GET /api/produce/<produce_id>
    Public detail of a single produce item.
    """
    try:
        raw_item = db.get_produce_by_id(produce_id)
        if not raw_item:
            return jsonify({
                "success": False,
                "error": f"Produce listing '{produce_id}' not found"
            }), 404

        from db import serialize_produce
        return jsonify({
            "success": True,
            "data": serialize_produce(raw_item)
        }), 200
    except DatabaseError as e:
        logger.error(f"Error retrieving produce {produce_id}: {e}")
        return jsonify({"success": False, "error": "Failed to retrieve produce item"}), 500


@produce_bp.route("", methods=["POST"])
@require_role("farmer")
def create_produce():
    """
    POST /api/produce
    Authenticated farmer endpoint to publish a new harvest listing.
    Farmer ID and Farmer Name are strictly derived from the authenticated token context.
    """
    data = request.get_json(silent=True) or {}
    is_valid, err_msg, validated = validate_produce_create(data)
    if not is_valid:
        return jsonify({"success": False, "error": err_msg}), 400

    # Enforce authenticated farmer identity (never trust client payload)
    validated["farmer_id"] = g.user_id
    validated["farmer_name"] = g.user_name

    try:
        created = db.create_produce(validated, token=getattr(g, "token", None))
        return jsonify({
            "success": True,
            "message": "Produce listing published successfully",
            "data": created
        }), 201
    except DatabaseError as e:
        logger.error(f"Failed to create produce: {e}")
        return jsonify({"success": False, "error": f"Could not publish produce listing: {e}"}), 500


@produce_bp.route("/<produce_id>", methods=["PUT"])
@require_role("farmer")
def update_produce(produce_id):
    """
    PUT /api/produce/<produce_id>
    Authenticated farmer endpoint to edit an existing harvest listing.
    Verifies that the caller owns the listing.
    """
    existing = db.get_produce_by_id(produce_id)
    if not existing:
        return jsonify({"success": False, "error": f"Produce listing '{produce_id}' not found"}), 404

    # Ownership check
    owner_id = str(existing.get("farmer_id") or existing.get("farmerId") or "")
    if owner_id and owner_id != g.user_id:
        return jsonify({
            "success": False,
            "error": "Forbidden: You are not authorized to edit another farmer's produce listing."
        }), 403

    data = request.get_json(silent=True) or {}
    is_valid, err_msg, updates = validate_produce_update(data)
    if not is_valid:
        return jsonify({"success": False, "error": err_msg}), 400

    try:
        updated = db.update_produce(produce_id, updates, token=getattr(g, "token", None))
        if not updated:
            return jsonify({"success": False, "error": "Produce listing not found"}), 404

        return jsonify({
            "success": True,
            "message": "Produce listing updated successfully",
            "data": updated
        }), 200
    except DatabaseError as e:
        logger.error(f"Failed to update produce {produce_id}: {e}")
        return jsonify({"success": False, "error": f"Could not update produce listing: {e}"}), 500


@produce_bp.route("/<produce_id>", methods=["DELETE"])
@require_role("farmer")
def delete_produce(produce_id):
    """
    DELETE /api/produce/<produce_id>
    Authenticated farmer endpoint to remove a listing.
    Verifies that the caller owns the listing.
    """
    existing = db.get_produce_by_id(produce_id)
    if not existing:
        return jsonify({"success": False, "error": f"Produce listing '{produce_id}' not found"}), 404

    # Ownership check
    owner_id = str(existing.get("farmer_id") or existing.get("farmerId") or "")
    if owner_id and owner_id != g.user_id:
        return jsonify({
            "success": False,
            "error": "Forbidden: You are not authorized to delete another farmer's produce listing."
        }), 403

    try:
        deleted = db.delete_produce(produce_id, token=getattr(g, "token", None))
        if not deleted:
            return jsonify({"success": False, "error": "Produce listing not found or already deleted"}), 404

        return jsonify({
            "success": True,
            "message": "Produce listing removed successfully"
        }), 200
    except DatabaseError as e:
        logger.error(f"Failed to delete produce {produce_id}: {e}")
        return jsonify({"success": False, "error": f"Could not delete produce listing: {e}"}), 500
