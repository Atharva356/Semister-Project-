"""
Database Access Layer for AgriMandi Backend.
Connects to Supabase with per-request user JWTs so Row Level Security (RLS) applies,
or runs an explicit in-memory data store when Config.USE_MEMORY_DB=True.
"""

import datetime
import logging
import uuid
from typing import Any, Dict, List, Optional, Tuple
from config import Config

logger = logging.getLogger("agrimandi.db")

class DatabaseError(Exception):
    """Raised when an operation against the underlying database fails."""
    pass


# ------------------------------------------------------------------------------
# Default Seed Catalog (used by in-memory dev mode)
# ------------------------------------------------------------------------------
DEMO_FARMER_ID = "farmer-demo-uuid-1"
DEMO_BUYER_ID = "buyer-demo-uuid-1"

INITIAL_PROFILES: List[Dict[str, Any]] = [
    {
        "id": DEMO_FARMER_ID,
        "email": "farmer@example.com",
        "full_name": "Rameshwar Patel",
        "role": "farmer",
        "phone": "+91 98765 43210",
        "location": "Sehore, Madhya Pradesh"
    },
    {
        "id": DEMO_BUYER_ID,
        "email": "buyer@example.com",
        "full_name": "Ananya Sharma",
        "role": "buyer",
        "phone": "+91 98765 12345",
        "location": "Pune, Maharashtra"
    }
]

INITIAL_PRODUCE: List[Dict[str, Any]] = [
    {
        "id": "prod-1",
        "name": "Sharbati Wheat",
        "category": "Grains",
        "quantity": 50.0,
        "unit": "Quintal",
        "price": 3200.0,
        "location": "Sehore, Madhya Pradesh",
        "farmer_name": "Rameshwar Patel",
        "farmer_id": DEMO_FARMER_ID,
        "image": "https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?auto=format&fit=crop&w=600&q=80",
        "date_added": "2026-09-08"
    },
    {
        "id": "prod-2",
        "name": "Organic Red Hybrid Tomatoes",
        "category": "Vegetables",
        "quantity": 250.0,
        "unit": "Kg",
        "price": 28.0,
        "location": "Nashik, Maharashtra",
        "farmer_name": "Sanjay Deshmukh",
        "farmer_id": DEMO_FARMER_ID,
        "image": "https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&w=600&q=80",
        "date_added": "2026-09-09"
    },
    {
        "id": "prod-3",
        "name": "Royal Delicious Shimla Apples",
        "category": "Fruits",
        "quantity": 120.0,
        "unit": "Crates",
        "price": 1450.0,
        "location": "Shimla, Himachal Pradesh",
        "farmer_name": "Baldev Chauhan",
        "farmer_id": DEMO_FARMER_ID,
        "image": "https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?auto=format&fit=crop&w=600&q=80",
        "date_added": "2026-09-07"
    },
    {
        "id": "prod-4",
        "name": "Kolar Fresh Red Onions",
        "category": "Vegetables",
        "quantity": 400.0,
        "unit": "Kg",
        "price": 34.0,
        "location": "Kolar, Karnataka",
        "farmer_name": "Narayana Gowda",
        "farmer_id": DEMO_FARMER_ID,
        "image": "https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?auto=format&fit=crop&w=600&q=80",
        "date_added": "2026-09-09"
    },
    {
        "id": "prod-5",
        "name": "Traditional Basmati Rice (Pusa 1121)",
        "category": "Grains",
        "quantity": 35.0,
        "unit": "Quintal",
        "price": 4600.0,
        "location": "Karnal, Haryana",
        "farmer_name": "Gurpreet Singh",
        "farmer_id": DEMO_FARMER_ID,
        "image": "https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=600&q=80",
        "date_added": "2026-09-06"
    }
]


# ------------------------------------------------------------------------------
# Serializers: Map DB snake_case columns to CamelCase API response format
# ------------------------------------------------------------------------------
def serialize_produce(item: Dict[str, Any]) -> Dict[str, Any]:
    """Converts produce DB record (snake_case) to client JSON schema (camelCase)."""
    if not item:
        return {}
    return {
        "id": item.get("id"),
        "name": item.get("name"),
        "category": item.get("category"),
        "quantity": float(item.get("quantity", 0)),
        "unit": item.get("unit", "Kg"),
        "price": float(item.get("price", 0)),
        "location": item.get("location"),
        "farmerName": item.get("farmer_name") or item.get("farmerName"),
        "farmerId": item.get("farmer_id") or item.get("farmerId"),
        "image": item.get("image"),
        "dateAdded": str(item.get("date_added") or item.get("dateAdded") or ""),
        "createdAt": str(item.get("created_at") or "")
    }


def serialize_order(order: Dict[str, Any]) -> Dict[str, Any]:
    """Converts order DB record (snake_case) to client JSON schema (camelCase)."""
    if not order:
        return {}
    return {
        "id": str(order.get("id", "")),
        "orderId": order.get("order_id") or order.get("orderId"),
        "orderDate": order.get("order_date") or order.get("orderDate"),
        "produceId": order.get("produce_id") or order.get("produceId"),
        "produceName": order.get("produce_name") or order.get("produceName"),
        "category": order.get("category"),
        "quantity": float(order.get("quantity", 0)),
        "unit": order.get("unit", "Kg"),
        "unitPrice": float(order.get("unit_price") or order.get("unitPrice") or 0),
        "totalPrice": float(order.get("total_price") or order.get("totalPrice") or 0),
        "farmerId": str(order.get("farmer_id") or order.get("farmerId") or ""),
        "farmerName": order.get("farmer_name") or order.get("farmerName"),
        "farmerLocation": order.get("farmer_location") or order.get("farmerLocation"),
        "buyerId": str(order.get("buyer_id") or order.get("buyerId") or ""),
        "buyerName": order.get("buyer_name") or order.get("buyerName"),
        "buyerEmail": order.get("buyer_email") or order.get("buyerEmail"),
        "deliveryAddress": order.get("delivery_address") or order.get("deliveryAddress"),
        "estimatedDelivery": order.get("estimated_delivery") or order.get("estimatedDelivery"),
        "status": order.get("status"),
        "createdAt": str(order.get("created_at") or "")
    }


# ------------------------------------------------------------------------------
# Database Class
# ------------------------------------------------------------------------------
class Database:
    """
    AgriMandi Database abstraction.
    Supports Supabase PostgreSQL with per-request JWT authorization (for RLS enforcement)
    or explicit in-memory store for local testing/development.
    """
    def __init__(self):
        # In-memory storage stores (only used when Config.USE_MEMORY_DB is True)
        self._profiles_store: Dict[str, Dict[str, Any]] = {p["id"]: dict(p) for p in INITIAL_PROFILES}
        self._produce_store: List[Dict[str, Any]] = [dict(item) for item in INITIAL_PRODUCE]
        self._orders_store: List[Dict[str, Any]] = []

    def get_client(self, token: Optional[str] = None):
        """
        Builds a per-request Supabase client authenticated with the user's JWT so RLS applies.
        """
        if not Config.is_supabase_configured():
            return None

        try:
            from supabase import create_client, ClientOptions
            if token:
                opts = ClientOptions(headers={"Authorization": f"Bearer {token}"})
                return create_client(Config.SUPABASE_URL, Config.SUPABASE_KEY, options=opts)
            return create_client(Config.SUPABASE_URL, Config.SUPABASE_KEY)
        except Exception as e:
            logger.error(f"Failed to create Supabase client: {e}", exc_info=True)
            raise DatabaseError(f"Database connection error: {e}")

    # =========================================================================
    # USER PROFILES
    # =========================================================================

    def get_profile_by_id(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves profile from Supabase or memory store."""
        if Config.is_supabase_configured():
            try:
                client = self.get_client()
                response = client.table("profiles").select("*").eq("id", user_id).execute()
                if response.data:
                    return response.data[0]
                return None
            except Exception as e:
                logger.error(f"Failed to retrieve profile for {user_id}: {e}", exc_info=True)
                raise DatabaseError(f"Database error loading profile: {e}")

        # Memory store lookup
        return self._profiles_store.get(user_id)

    # =========================================================================
    # PRODUCE OPERATIONS
    # =========================================================================

    def get_all_produce(
        self,
        search: Optional[str] = None,
        category: Optional[str] = None,
        location: Optional[str] = None,
        min_price: Optional[float] = None,
        max_price: Optional[float] = None,
        farmer_id: Optional[str] = None,
        page: int = 1,
        limit: int = 20
    ) -> Tuple[List[Dict[str, Any]], int]:
        """
        Fetches produce listings with search across name, location, and farmer_name,
        filters for category and price range, and pagination.
        """
        limit = min(max(1, limit), 50)
        page = max(1, page)
        offset = (page - 1) * limit

        if Config.is_supabase_configured():
            try:
                client = self.get_client()
                query = client.table("produce").select("*", count="exact")

                if category:
                    query = query.eq("category", category)
                if location:
                    query = query.ilike("location", f"%{location}%")
                if min_price is not None:
                    query = query.gte("price", min_price)
                if max_price is not None:
                    query = query.lte("price", max_price)
                if farmer_id:
                    query = query.eq("farmer_id", farmer_id)

                if search:
                    s = search.strip()
                    # Search across name, location, and farmer_name
                    query = query.or_(f"name.ilike.%{s}%,location.ilike.%{s}%,farmer_name.ilike.%{s}%")

                query = query.order("created_at", desc=True).range(offset, offset + limit - 1)
                response = query.execute()

                items = [serialize_produce(item) for item in (response.data or [])]
                total_count = response.count if response.count is not None else len(items)
                return items, total_count
            except Exception as e:
                logger.error(f"Failed to query produce from Supabase: {e}", exc_info=True)
                raise DatabaseError(f"Database error querying produce: {e}")

        # ----------------------------------------------------------------------
        # Memory DB (Dev / Test Mode)
        # ----------------------------------------------------------------------
        results = list(self._produce_store)

        if search:
            s = search.lower().strip()
            results = [
                p for p in results
                if s in p.get("name", "").lower()
                or s in p.get("location", "").lower()
                or s in p.get("farmer_name", "").lower()
            ]

        if category:
            results = [p for p in results if p.get("category") == category]

        if location:
            loc = location.lower().strip()
            results = [p for p in results if loc in p.get("location", "").lower()]

        if min_price is not None:
            results = [p for p in results if float(p.get("price", 0)) >= min_price]

        if max_price is not None:
            results = [p for p in results if float(p.get("price", 0)) <= max_price]

        if farmer_id:
            results = [p for p in results if p.get("farmer_id") == farmer_id]

        total_count = len(results)
        paged = results[offset:offset + limit]
        return [serialize_produce(p) for p in paged], total_count

    def get_produce_by_id(self, produce_id: str) -> Optional[Dict[str, Any]]:
        """Fetches raw produce item by ID."""
        if Config.is_supabase_configured():
            try:
                client = self.get_client()
                response = client.table("produce").select("*").eq("id", produce_id).execute()
                if response.data:
                    return response.data[0]
                return None
            except Exception as e:
                logger.error(f"Failed to fetch produce by id {produce_id}: {e}", exc_info=True)
                raise DatabaseError(f"Database error fetching produce: {e}")

        for item in self._produce_store:
            if item.get("id") == produce_id:
                return dict(item)
        return None

    def create_produce(self, data: Dict[str, Any], token: Optional[str] = None) -> Dict[str, Any]:
        """Creates new produce listing using snake_case columns."""
        new_item = {
            "id": data.get("id") or f"prod-{int(datetime.datetime.now().timestamp() * 1000)}",
            "name": data["name"],
            "category": data["category"],
            "quantity": float(data["quantity"]),
            "unit": data.get("unit", "Kg"),
            "price": float(data["price"]),
            "location": data["location"],
            "farmer_name": data["farmer_name"],
            "farmer_id": data["farmer_id"],
            "image": data.get("image") or "https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=600&q=80",
            "date_added": datetime.date.today().isoformat()
        }

        if Config.is_supabase_configured():
            try:
                client = self.get_client(token)
                response = client.table("produce").insert(new_item).execute()
                if response.data:
                    return serialize_produce(response.data[0])
                raise DatabaseError("Supabase insert returned no data")
            except Exception as e:
                logger.error(f"Failed to insert produce in Supabase: {e}", exc_info=True)
                raise DatabaseError(f"Database error creating produce: {e}")

        self._produce_store.insert(0, new_item)
        return serialize_produce(new_item)

    def update_produce(
        self, produce_id: str, updates: Dict[str, Any], token: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """Updates produce listing. Whitelisted fields only."""
        if Config.is_supabase_configured():
            try:
                client = self.get_client(token)
                response = client.table("produce").update(updates).eq("id", produce_id).execute()
                if response.data:
                    return serialize_produce(response.data[0])
                return None
            except Exception as e:
                logger.error(f"Failed to update produce {produce_id} in Supabase: {e}", exc_info=True)
                raise DatabaseError(f"Database error updating produce: {e}")

        for idx, item in enumerate(self._produce_store):
            if item.get("id") == produce_id:
                self._produce_store[idx].update(updates)
                return serialize_produce(self._produce_store[idx])
        return None

    def delete_produce(self, produce_id: str, token: Optional[str] = None) -> bool:
        """Deletes produce listing."""
        if Config.is_supabase_configured():
            try:
                client = self.get_client(token)
                response = client.table("produce").delete().eq("id", produce_id).execute()
                return len(response.data or []) > 0
            except Exception as e:
                logger.error(f"Failed to delete produce {produce_id} in Supabase: {e}", exc_info=True)
                raise DatabaseError(f"Database error deleting produce: {e}")

        initial_len = len(self._produce_store)
        self._produce_store = [p for p in self._produce_store if p.get("id") != produce_id]
        return len(self._produce_store) < initial_len

    def get_produce_stats(self) -> Dict[str, Any]:
        """Calculates produce inventory metrics."""
        if Config.is_supabase_configured():
            try:
                client = self.get_client()
                response = client.table("produce").select("quantity").execute()
                items = response.data or []
                total_qty = sum(float(it.get("quantity", 0)) for it in items)
                return {
                    "totalListings": len(items),
                    "totalQuantity": round(total_qty, 2)
                }
            except Exception as e:
                logger.error(f"Failed to load produce stats: {e}", exc_info=True)
                raise DatabaseError(f"Database error calculating stats: {e}")

        total_qty = sum(float(p.get("quantity", 0)) for p in self._produce_store)
        return {
            "totalListings": len(self._produce_store),
            "totalQuantity": round(total_qty, 2)
        }

    # =========================================================================
    # ORDERS OPERATIONS
    # =========================================================================

    def place_order(
        self,
        produce_id: str,
        quantity: float,
        buyer_id: str,
        buyer_name: str,
        buyer_email: str,
        delivery_address: str,
        token: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Executes atomic order placement.
        In Supabase: executes place_order stored procedure with row locking & stock reduction.
        In Memory: executes validated atomic stock decrement and order creation.
        """
        if Config.is_supabase_configured():
            try:
                client = self.get_client(token)
                rpc_params = {
                    "p_produce_id": produce_id,
                    "p_quantity": quantity,
                    "p_buyer_name": buyer_name,
                    "p_buyer_email": buyer_email,
                    "p_delivery_address": delivery_address
                }
                response = client.rpc("place_order", rpc_params).execute()
                if response.data:
                    # In Postgres RPC, data could be the row or a single result
                    order_row = response.data
                    if isinstance(order_row, list) and len(order_row) > 0:
                        order_row = order_row[0]
                    return serialize_order(order_row)
                raise DatabaseError("place_order RPC returned no data")
            except Exception as e:
                logger.error(f"Supabase place_order RPC failed: {e}", exc_info=True)
                raise DatabaseError(str(e))

        # ----------------------------------------------------------------------
        # Memory DB (Dev / Test Mode)
        # ----------------------------------------------------------------------
        produce_item = None
        for item in self._produce_store:
            if item.get("id") == produce_id:
                produce_item = item
                break

        if not produce_item:
            raise ValueError(f"Produce with ID '{produce_id}' not found")

        available_stock = float(produce_item.get("quantity", 0))
        if available_stock < quantity:
            raise ValueError(f"Insufficient stock. Available: {available_stock}, Requested: {quantity}")

        # Compute price strictly from database record
        unit_price = float(produce_item["price"])
        total_price = round(unit_price * quantity, 2)

        # Decrement stock atomically
        produce_item["quantity"] = round(available_stock - quantity, 2)

        random_suffix = uuid.uuid4().hex[:6].upper()
        order_record = {
            "id": str(uuid.uuid4()),
            "order_id": f"AGRI-{random_suffix}",
            "order_date": datetime.date.today().strftime("%d %b %Y"),
            "produce_id": produce_item["id"],
            "produce_name": produce_item["name"],
            "category": produce_item.get("category"),
            "quantity": quantity,
            "unit": produce_item.get("unit", "Kg"),
            "unit_price": unit_price,
            "total_price": total_price,
            "farmer_id": produce_item.get("farmer_id", DEMO_FARMER_ID),
            "farmer_name": produce_item.get("farmer_name", "Verified Grower"),
            "farmer_location": produce_item.get("location", "India"),
            "buyer_id": buyer_id,
            "buyer_name": buyer_name,
            "buyer_email": buyer_email,
            "delivery_address": delivery_address,
            "estimated_delivery": "3-5 Business Days",
            "status": "Confirmed",
            "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
        }

        self._orders_store.insert(0, order_record)
        return serialize_order(order_record)

    def get_orders_for_user(
        self, user_id: str, role: str, token: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Fetches orders scoped to user role:
        - buyer: orders where buyer_id == user_id
        - farmer: orders where farmer_id == user_id
        """
        if Config.is_supabase_configured():
            try:
                client = self.get_client(token)
                query = client.table("orders").select("*").order("created_at", desc=True)
                if role == "buyer":
                    query = query.eq("buyer_id", user_id)
                elif role == "farmer":
                    query = query.eq("farmer_id", user_id)
                else:
                    return []

                response = query.execute()
                return [serialize_order(row) for row in (response.data or [])]
            except Exception as e:
                logger.error(f"Failed to query orders for user {user_id}: {e}", exc_info=True)
                raise DatabaseError(f"Database error fetching orders: {e}")

        # Memory store
        if role == "buyer":
            matches = [o for o in self._orders_store if o.get("buyer_id") == user_id]
        elif role == "farmer":
            matches = [o for o in self._orders_store if o.get("farmer_id") == user_id]
        else:
            matches = []

        return [serialize_order(o) for o in matches]

    def get_order_by_id(self, order_id: str, token: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Retrieves raw order record by order_id or UUID id."""
        if Config.is_supabase_configured():
            try:
                client = self.get_client(token)
                # Check by order_id first
                response = client.table("orders").select("*").eq("order_id", order_id).execute()
                if response.data:
                    return response.data[0]
                # Fallback to UUID id
                response = client.table("orders").select("*").eq("id", order_id).execute()
                if response.data:
                    return response.data[0]
                return None
            except Exception as e:
                logger.error(f"Failed to fetch order {order_id}: {e}", exc_info=True)
                raise DatabaseError(f"Database error fetching order: {e}")

        for o in self._orders_store:
            if o.get("order_id") == order_id or o.get("id") == order_id:
                return dict(o)
        return None

    def update_order_status(
        self, order_id: str, new_status: str, token: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """Updates status of order and restores stock if transitioning to Cancelled."""
        target_order = self.get_order_by_id(order_id, token)
        if not target_order:
            return None

        produce_id = target_order.get("produce_id")
        order_qty = float(target_order.get("quantity", 0))
        previous_status = target_order.get("status")

        if Config.is_supabase_configured():
            try:
                client = self.get_client(token)
                if new_status == "Cancelled":
                    # Call cancel_order RPC (atomic cancellation, permission check, and stock restore)
                    response = client.rpc("cancel_order", {"p_order_id": order_id}).execute()
                    if response.data:
                        order_row = response.data
                        if isinstance(order_row, list) and len(order_row) > 0:
                            order_row = order_row[0]
                        return serialize_order(order_row)
                    return None
                else:
                    order_key = "order_id" if target_order.get("order_id") == order_id else "id"
                    response = client.table("orders").update({"status": new_status}).eq(order_key, order_id).execute()
                    if not response.data:
                        return None
                    return serialize_order(response.data[0])
            except Exception as e:
                logger.error(f"Failed to update order status: {e}", exc_info=True)
                raise DatabaseError(f"Database error updating order status: {e}")

        # Memory store
        for idx, o in enumerate(self._orders_store):
            if o.get("order_id") == order_id or o.get("id") == order_id:
                if new_status == "Cancelled" and previous_status in ("Cancelled", "Delivered"):
                    raise ValueError(f"Cannot cancel order with status {previous_status}")
                self._orders_store[idx]["status"] = new_status
                # Restore stock on cancellation
                if new_status == "Cancelled" and previous_status != "Cancelled" and produce_id:
                    for p_idx, prod in enumerate(self._produce_store):
                        if prod.get("id") == produce_id:
                            self._produce_store[p_idx]["quantity"] = round(
                                float(prod.get("quantity", 0)) + order_qty, 2
                            )
                            break
                return serialize_order(self._orders_store[idx])

        return None


# Global singleton instance
db = Database()
