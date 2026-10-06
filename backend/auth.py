"""
Authentication and Role-Based Access Control Middleware for AgriMandi API.
Validates Supabase JWT Bearer tokens and attaches authenticated user context to flask.g.
"""

import functools
import logging
from typing import Callable, Optional
from flask import g, jsonify, request
from config import Config

logger = logging.getLogger("agrimandi.auth")

# Lazy reference to Supabase client for auth verification
_auth_client = None

def get_auth_client():
    """Initializes or returns Supabase admin/anon client for auth verification."""
    global _auth_client
    if _auth_client is not None:
        return _auth_client

    if Config.is_supabase_configured():
        try:
            from supabase import create_client
            _auth_client = create_client(Config.SUPABASE_URL, Config.SUPABASE_KEY)
        except Exception as e:
            logger.warning(f"Failed to initialize Supabase client for auth: {e}")
            _auth_client = None

    return _auth_client


def extract_bearer_token() -> Optional[str]:
    """Extracts JWT Bearer token from the HTTP Authorization header."""
    auth_header = request.headers.get("Authorization", "").strip()
    if not auth_header:
        return None
    parts = auth_header.split(" ")
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1].strip()
    return None


def verify_token(token: str):
    """
    Validates token via Supabase Auth or test tokens.
    Returns (user_id, role, name, email) or raises ValueError.
    """
    # 1. Dev / Test Mock Token Handler (Only honoured when USE_MEMORY_DB is True)
    if Config.USE_MEMORY_DB:
        from db import db
        # Formats: test-farmer-<id>, test-buyer-<id>, mock-farmer, mock-buyer
        token_lower = token.lower()
        if "farmer" in token_lower:
            role = "farmer"
            if token in ("test-farmer", "mock-farmer", "test-farmer-demo-uuid-1", "mock-farmer-demo-uuid-1"):
                uid = "farmer-demo-uuid-1"
            elif token.startswith("test-farmer-"):
                uid = token[len("test-farmer-"):]
            elif token.startswith("mock-farmer-"):
                uid = token[len("mock-farmer-"):]
            else:
                uid = "farmer-demo-uuid-1"
            name = "Rameshwar Patel"
            email = "farmer@example.com"
        elif "buyer" in token_lower:
            role = "buyer"
            if token in ("test-buyer", "mock-buyer", "test-buyer-demo-uuid-1", "mock-buyer-demo-uuid-1"):
                uid = "buyer-demo-uuid-1"
            elif token.startswith("test-buyer-"):
                uid = token[len("test-buyer-"):]
            elif token.startswith("mock-buyer-"):
                uid = token[len("mock-buyer-"):]
            else:
                uid = "buyer-demo-uuid-1"
            name = "Ananya Sharma"
            email = "buyer@example.com"
        else:
            # Generic test user
            role = "buyer"
            uid = f"user-{token[:8]}"
            name = "Test User"
            email = "test@example.com"

        # Check if profile exists in memory db
        profile = db.get_profile_by_id(uid)
        if profile:
            role = profile.get("role", role)
            name = profile.get("full_name", name)
            email = profile.get("email", email)

        return uid, role, name, email

    # 2. Production Supabase Token Verification
    client = get_auth_client()
    if not client:
        raise ValueError("Supabase authentication service is unavailable")

    try:
        user_response = client.auth.get_user(token)
        if not user_response or not user_response.user:
            raise ValueError("Token is invalid or expired")

        user = user_response.user
        uid = str(user.id)
        email = str(user.email or "")

        # Retrieve authoritative role from profiles table (not user_metadata)
        from db import db
        profile = db.get_profile_by_id(uid)
        if profile and profile.get("role"):
            role = profile["role"]
            name = profile.get("full_name") or email.split("@")[0]
        else:
            # Fallback if profile trigger is still executing
            meta = user.user_metadata or {}
            role = meta.get("role", "buyer")
            name = meta.get("full_name") or meta.get("name") or email.split("@")[0]

        return uid, role, name, email
    except Exception as e:
        logger.warning(f"Token verification failed: {e}")
        raise ValueError(f"Invalid authentication token: {e}")


def require_auth(fn: Callable) -> Callable:
    """Decorator ensuring that request contains a valid Supabase JWT Bearer token."""
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        token = extract_bearer_token()
        if not token:
            return jsonify({
                "success": False,
                "error": "Missing Authorization header. Please sign in to continue."
            }), 401

        try:
            uid, role, name, email = verify_token(token)
            g.user_id = uid
            g.role = role
            g.user_name = name
            g.user_email = email
            g.token = token
        except ValueError as e:
            return jsonify({
                "success": False,
                "error": str(e)
            }), 401
        except Exception as e:
            logger.error(f"Unexpected auth error: {e}", exc_info=True)
            return jsonify({
                "success": False,
                "error": "Authentication verification failed"
            }), 401

        return fn(*args, **kwargs)
    return wrapper


def require_role(expected_role: str) -> Callable:
    """Decorator ensuring that caller has a specific verified role ('farmer' or 'buyer')."""
    def decorator(fn: Callable) -> Callable:
        @functools.wraps(fn)
        @require_auth
        def wrapper(*args, **kwargs):
            if g.role != expected_role:
                return jsonify({
                    "success": False,
                    "error": f"Forbidden: Only registered {expected_role} accounts can access this resource."
                }), 403
            return fn(*args, **kwargs)
        return wrapper
    return decorator
