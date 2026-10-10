"""
Notifications Routes for AgriMandi API.
Provides endpoints for retrieving user alerts and marking notifications read.
"""

import logging
from flask import Blueprint, g, jsonify
from auth import require_auth
from db import DatabaseError, db

logger = logging.getLogger("agrimandi.routes.notifications")
notifications_bp = Blueprint("notifications", __name__)


@notifications_bp.route("", methods=["GET"])
@require_auth
def get_notifications():
    """
    GET /api/notifications
    Returns all notifications for the authenticated user, plus unread count.
    """
    try:
        items, unread_count = db.get_notifications_for_user(
            user_id=g.user_id,
            token=getattr(g, "token", None)
        )
        return jsonify({
            "success": True,
            "count": len(items),
            "unreadCount": unread_count,
            "data": items
        }), 200
    except DatabaseError as e:
        logger.error(f"Error fetching notifications for {g.user_id}: {e}")
        return jsonify({"success": False, "error": "Failed to fetch notifications"}), 500


@notifications_bp.route("/<notification_id>/read", methods=["PATCH", "PUT"])
@require_auth
def mark_read(notification_id):
    """
    PATCH /api/notifications/<notification_id>/read
    Marks a single notification as read.
    """
    try:
        success = db.mark_notification_read(
            notification_id=notification_id,
            user_id=g.user_id,
            token=getattr(g, "token", None)
        )
        return jsonify({
            "success": success,
            "message": "Notification marked as read" if success else "Notification not found"
        }), 200 if success else 404
    except DatabaseError as e:
        logger.error(f"Error marking notification {notification_id} read: {e}")
        return jsonify({"success": False, "error": "Failed to update notification"}), 500


@notifications_bp.route("/mark-all-read", methods=["POST", "PATCH"])
@require_auth
def mark_all_read():
    """
    POST /api/notifications/mark-all-read
    Marks all notifications for authenticated user as read.
    """
    try:
        success = db.mark_all_notifications_read(
            user_id=g.user_id,
            token=getattr(g, "token", None)
        )
        return jsonify({
            "success": True,
            "message": "All notifications marked as read"
        }), 200
    except DatabaseError as e:
        logger.error(f"Error marking all notifications read: {e}")
        return jsonify({"success": False, "error": "Failed to update notifications"}), 500
