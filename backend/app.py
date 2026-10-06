"""
AgriMandi Flask Backend Server.
Direct Farmer-to-Buyer Marketplace REST API.
"""

import logging
import sys
from flask import Flask, jsonify, request
from flask_cors import CORS
from config import Config
from routes.produce import produce_bp
from routes.orders import orders_bp

# Configure logging
logging.basicConfig(
    level=logging.DEBUG if Config.DEBUG else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("agrimandi.app")


def create_app(config_class=Config) -> Flask:
    """Application factory for AgriMandi Flask backend."""
    import os
    is_production = (
        os.environ.get("FLASK_ENV", "").lower() == "production"
        or "RENDER" in os.environ
    )
    if getattr(config_class, "USE_MEMORY_DB", False) and is_production:
        raise RuntimeError("USE_MEMORY_DB cannot be enabled in production environments")

    app = Flask(__name__)
    app.config.from_object(config_class)

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
        return jsonify({
            "status": "healthy",
            "service": "AgriMandi Backend",
            "version": "2.0.0",
            "database_configured": config_class.is_supabase_configured(),
            "use_memory_db": config_class.USE_MEMORY_DB
        }), 200

    # --------------------------------------------------------------------------
    # Global Error Handlers (Return consistent JSON, no stack traces leak)
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

    @app.errorhandler(500)
    def handle_internal_server_error(err):
        logger.error(f"Internal server error: {err}", exc_info=True)
        return jsonify({
            "success": False,
            "error": "An internal server error occurred. Please try again later."
        }), 500

    @app.errorhandler(Exception)
    def handle_unhandled_exception(exc):
        logger.error(f"Unhandled exception caught: {exc}", exc_info=True)
        return jsonify({
            "success": False,
            "error": "An unexpected error occurred. Please try again later."
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
