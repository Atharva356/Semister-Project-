"""
AgriMandi Flask Backend Server.
Direct Farmer-to-Buyer Marketplace REST API.
"""

import logging
import sys
from flask import Flask, jsonify, request
from flask_cors import CORS
from werkzeug.exceptions import HTTPException
from config import Config
from logger import configure_logging
from routes.produce import produce_bp
from routes.orders import orders_bp

# Configure structured JSON logging
logger = configure_logging(debug=Config.DEBUG)


def create_app(config_class=Config) -> Flask:
    """Application factory for AgriMandi Flask backend."""
    # Fail-fast validation of required environment variables
    if hasattr(config_class, "validate"):
        config_class.validate()

    app = Flask(__name__)
    app.config.from_object(config_class)
    app.config["SECRET_KEY"] = getattr(config_class, "SECRET_KEY", "agrimandi-dev-secret-key-change-in-prod")

    # Restrict CORS to configured origins
    origins = config_class.CORS_ORIGINS
    logger.info(f"Configuring CORS for origins: {origins}")
    CORS(
        app,
        resources={r"/api/*": {"origins": origins}},
        supports_credentials=True,
        allow_headers=["Content-Type", "Authorization"],
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    )

    # Register Blueprints
    app.register_blueprint(produce_bp, url_prefix="/api/produce")
    app.register_blueprint(orders_bp, url_prefix="/api/orders")

    # --------------------------------------------------------------------------
    # Request Logging
    # --------------------------------------------------------------------------
    @app.after_request
    def log_request_outcome(response):
        # Avoid flooding logs with frequent health check polls
        if request.path != "/api/health":
            logger.info(
                f"{request.method} {request.path} {response.status_code}",
                extra={
                    "method": request.method,
                    "path": request.path,
                    "status_code": response.status_code,
                    "ip": request.headers.get("X-Forwarded-For", request.remote_addr),
                }
            )
        return response

    # --------------------------------------------------------------------------
    # Health and Info Endpoints
    # --------------------------------------------------------------------------
    @app.route("/")
    def index():
        mode = "In-Memory Datastore" if config_class.USE_MEMORY_DB else (
            "Connected to Supabase Postgres" if config_class.is_supabase_configured() else "Local Fallback (Supabase Unconfigured)"
        )
        return jsonify({
            "service": "AgriMandi REST API",
            "version": "2.0.0",
            "status": "online",
            "database_mode": mode,
            "endpoints": {
                "health": "/api/health",
                "produce": "/api/produce",
                "orders": "/api/orders"
            }
        }), 200

    @app.route("/api/health")
    def health():
        from db import db
        is_connected, msg, details = db.check_connection()
        status_code = 200 if is_connected else 503
        return jsonify({
            "status": "healthy" if is_connected else "unhealthy",
            "service": "AgriMandi Backend",
            "version": "2.0.0",
            "database_configured": config_class.is_supabase_configured(),
            "use_memory_db": config_class.USE_MEMORY_DB,
            "database": {
                "connected": is_connected,
                "message": msg,
                **details
            }
        }), status_code

    # --------------------------------------------------------------------------
    # Global Error Handlers (Return consistent JSON, never leak stack traces)
    # --------------------------------------------------------------------------
    @app.errorhandler(400)
    def handle_bad_request(err):
        return jsonify({
            "success": False,
            "error": getattr(err, "description", "Bad request")
        }), 400

    @app.errorhandler(401)
    def handle_unauthorized(err):
        return jsonify({
            "success": False,
            "error": getattr(err, "description", "Unauthorized")
        }), 401

    @app.errorhandler(403)
    def handle_forbidden(err):
        return jsonify({
            "success": False,
            "error": getattr(err, "description", "Forbidden")
        }), 403

    @app.errorhandler(404)
    def handle_not_found(err):
        return jsonify({
            "success": False,
            "error": getattr(err, "description", "Endpoint or resource not found")
        }), 404

    @app.errorhandler(405)
    def handle_method_not_allowed(err):
        return jsonify({
            "success": False,
            "error": "HTTP method not allowed for this endpoint"
        }), 405

    @app.errorhandler(HTTPException)
    def handle_http_exception(err):
        return jsonify({
            "success": False,
            "error": getattr(err, "description", "An HTTP error occurred")
        }), getattr(err, "code", 500)

    @app.errorhandler(Exception)
    def handle_unhandled_exception(exc):
        # Log stack trace to structured JSON log for server debugging
        logger.error(f"Unhandled server error: {exc}", exc_info=True)
        # Return generic safe JSON response without stack traces or sensitive internal details
        return jsonify({
            "success": False,
            "error": "An internal server error occurred. Please try again later."
        }), 500

    return app


# Default app instance
app = create_app()

if __name__ == "__main__":
    app.run(
        host=Config.HOST,
        port=Config.PORT,
        debug=Config.DEBUG
    )
