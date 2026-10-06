"""
Centralized Input Validation for AgriMandi API.
Enforces data types, lengths, and valid enumeration values.
"""

from typing import Any, Dict, Optional, Tuple

VALID_CATEGORIES = {"Vegetables", "Fruits", "Grains", "Pulses", "Spices"}
VALID_UNITS = {"Kg", "Quintal", "Crates", "Ton"}
VALID_ORDER_STATUSES = {"Pending", "Confirmed", "Dispatched", "Delivered", "Cancelled"}

# State machine transitions
VALID_STATUS_TRANSITIONS = {
    "Pending": {"Confirmed", "Cancelled"},
    "Confirmed": {"Dispatched", "Cancelled"},
    "Dispatched": {"Delivered"},
    "Delivered": set(),
    "Cancelled": set()
}

def validate_produce_create(data: Dict[str, Any]) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
    """Validates payload for creating new produce listing."""
    if not isinstance(data, dict):
        return False, "Payload must be a JSON object", None

    name = str(data.get("name", "")).strip()
    if not name or len(name) < 2 or len(name) > 100:
        return False, "Name is required and must be between 2 and 100 characters", None

    category = str(data.get("category", "")).strip()
    if category not in VALID_CATEGORIES:
        return False, f"Invalid category. Must be one of: {', '.join(sorted(VALID_CATEGORIES))}", None

    try:
        quantity = float(data.get("quantity", 0))
        if quantity <= 0:
            return False, "Quantity must be a positive number greater than 0", None
        if quantity > 1000000:
            return False, "Quantity exceeds realistic maximum limit", None
    except (ValueError, TypeError):
        return False, "Quantity must be a valid numeric value", None

    unit = str(data.get("unit", "Kg")).strip()
    if unit not in VALID_UNITS:
        return False, f"Invalid unit. Must be one of: {', '.join(sorted(VALID_UNITS))}", None

    try:
        price = float(data.get("price", 0))
        if price <= 0:
            return False, "Price must be a positive number greater than 0", None
        if price > 10000000:
            return False, "Price exceeds realistic maximum limit", None
    except (ValueError, TypeError):
        return False, "Price must be a valid numeric value", None

    location = str(data.get("location", "")).strip()
    if not location or len(location) < 2 or len(location) > 200:
        return False, "Harvest location is required (between 2 and 200 characters)", None

    image = data.get("image")
    if image is not None:
        image = str(image).strip()
        if image and not (image.startswith("http://") or image.startswith("https://") or image.startswith("data:image/")):
            return False, "Image must be a valid http/https URL or base64 data URI", None

    validated = {
        "name": name,
        "category": category,
        "quantity": round(quantity, 2),
        "unit": unit,
        "price": round(price, 2),
        "location": location,
        "image": image or None
    }
    return True, None, validated


def validate_produce_update(data: Dict[str, Any]) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
    """Validates payload for updating existing produce listing."""
    if not isinstance(data, dict) or not data:
        return False, "No update fields provided", None

    allowed_fields = {"name", "category", "quantity", "unit", "price", "location", "image"}
    updates = {}

    for key, value in data.items():
        if key not in allowed_fields:
            continue

        if key == "name":
            name = str(value).strip()
            if not name or len(name) < 2 or len(name) > 100:
                return False, "Name must be between 2 and 100 characters", None
            updates["name"] = name

        elif key == "category":
            category = str(value).strip()
            if category not in VALID_CATEGORIES:
                return False, f"Invalid category. Must be one of: {', '.join(sorted(VALID_CATEGORIES))}", None
            updates["category"] = category

        elif key == "quantity":
            try:
                qty = float(value)
                if qty <= 0:
                    return False, "Quantity must be greater than 0", None
                updates["quantity"] = round(qty, 2)
            except (ValueError, TypeError):
                return False, "Quantity must be a valid number", None

        elif key == "unit":
            unit = str(value).strip()
            if unit not in VALID_UNITS:
                return False, f"Invalid unit. Must be one of: {', '.join(sorted(VALID_UNITS))}", None
            updates["unit"] = unit

        elif key == "price":
            try:
                pr = float(value)
                if pr <= 0:
                    return False, "Price must be greater than 0", None
                updates["price"] = round(pr, 2)
            except (ValueError, TypeError):
                return False, "Price must be a valid number", None

        elif key == "location":
            loc = str(value).strip()
            if not loc or len(loc) < 2 or len(loc) > 200:
                return False, "Location must be between 2 and 200 characters", None
            updates["location"] = loc

        elif key == "image":
            img = str(value).strip() if value else None
            if img and not (img.startswith("http://") or img.startswith("https://") or img.startswith("data:image/")):
                return False, "Image must be a valid URL", None
            updates["image"] = img

    if not updates:
        return False, "No valid updatable fields provided", None

    return True, None, updates


def validate_order_create(data: Dict[str, Any]) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
    """Validates payload for creating an order."""
    if not isinstance(data, dict):
        return False, "Payload must be a JSON object", None

    produce_id = str(data.get("produceId") or data.get("produce_id") or "").strip()
    if not produce_id:
        return False, "Produce ID (produceId) is required", None

    try:
        quantity = float(data.get("quantity", 0))
        if quantity <= 0:
            return False, "Order quantity must be greater than 0", None
    except (ValueError, TypeError):
        return False, "Quantity must be a valid numeric value", None

    delivery_address = str(data.get("deliveryAddress") or data.get("delivery_address") or "").strip()
    if not delivery_address or len(delivery_address) < 5 or len(delivery_address) > 300:
        return False, "Delivery address is required (between 5 and 300 characters)", None

    validated = {
        "produce_id": produce_id,
        "quantity": round(quantity, 2),
        "delivery_address": delivery_address
    }
    return True, None, validated


def validate_status_transition(current_status: str, new_status: str, role: str) -> Tuple[bool, Optional[str]]:
    """Validates if status change is permitted according to role and state machine."""
    if new_status not in VALID_ORDER_STATUSES:
        return False, f"Invalid status: {new_status}. Allowed values: {', '.join(sorted(VALID_ORDER_STATUSES))}"

    if current_status == new_status:
        return True, None

    allowed_next = VALID_STATUS_TRANSITIONS.get(current_status, set())
    if new_status not in allowed_next:
        return False, f"Cannot transition order status from '{current_status}' to '{new_status}'"

    if role == "buyer" and new_status != "Cancelled":
        return False, "Buyers are only allowed to cancel their orders"

    return True, None
