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
        "confirmedAt": str(order.get("confirmed_at") or order.get("confirmedAt") or ""),
        "dispatchedAt": str(order.get("dispatched_at") or order.get("dispatchedAt") or ""),
        "deliveredAt": str(order.get("delivered_at") or order.get("deliveredAt") or ""),
        "cancelledAt": str(order.get("cancelled_at") or order.get("cancelledAt") or ""),
        "rejectedAt": str(order.get("rejected_at") or order.get("rejectedAt") or ""),
        "rejectionReason": order.get("rejection_reason") or order.get("rejectionReason") or "",
        "createdAt": str(order.get("created_at") or "")
    }


def serialize_notification(item: Dict[str, Any]) -> Dict[str, Any]:
    """Converts notification DB record (snake_case) to client JSON schema (camelCase)."""
    if not item:
        return {}
    return {
        "id": str(item.get("id", "")),
        "userId": str(item.get("user_id") or item.get("userId") or ""),
        "title": item.get("title", ""),
        "message": item.get("message", ""),
        "orderId": item.get("order_id") or item.get("orderId"),
        "isRead": bool(item.get("is_read") if item.get("is_read") is not None else item.get("isRead", False)),
        "createdAt": str(item.get("created_at") or item.get("createdAt") or "")
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
        self._notifications_store: List[Dict[str, Any]] = []

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

    def check_connection(self) -> Tuple[bool, str, Dict[str, Any]]:
        """
        Verifies database connectivity for /api/health endpoint.
        Returns (is_connected, status_message, details_dict).
        """
        if Config.USE_MEMORY_DB:
            return True, "In-memory datastore active", {
                "mode": "in_memory",
                "produce_count": len(self._produce_store),
                "profiles_count": len(self._profiles_store),
                "orders_count": len(self._orders_store)
            }

        if not Config.is_supabase_configured():
            return False, "Supabase credentials are not configured", {
                "mode": "unconfigured"
            }

        try:
            import time
            start = time.time()
            client = self.get_client()
            if not client:
                return False, "Supabase client initialization failed", {"mode": "supabase"}
            # Lightweight ping query against produce table
            client.table("produce").select("id").limit(1).execute()
            latency_ms = round((time.time() - start) * 1000, 2)
            return True, "Connected to Supabase PostgreSQL", {
                "mode": "supabase_postgres",
                "latency_ms": latency_ms
            }
        except Exception as e:
            logger.error(f"Database ping check failed: {e}", exc_info=True)
            return False, f"Database connectivity check failed: {str(e)}", {
                "mode": "supabase_postgres",
                "error": str(e)
            }

    # =========================================================================
    # USER PROFILES
    # =========================================================================

    def get_profile_by_id(self, user_id: str, token: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Retrieves profile from Supabase or memory store."""
        if Config.is_supabase_configured():
            try:
                client = self.get_client(token)
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
                    try:
                        search_query = query.or_(f"name.ilike.%{s}%,location.ilike.%{s}%,farmer_name.ilike.%{s}%")
                        response = search_query.order("created_at", desc=True).range(offset, offset + limit - 1).execute()
                    except Exception as search_err:
                        if "farmer_name" in str(search_err) or "42703" in str(search_err):
                            response = query.or_(f"name.ilike.%{s}%,location.ilike.%{s}%,farmerName.ilike.%{s}%").order("created_at", desc=True).range(offset, offset + limit - 1).execute()
                        else:
                            raise search_err
                else:
                    response = query.order("created_at", desc=True).range(offset, offset + limit - 1).execute()

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
                try:
                    response = client.table("produce").insert(new_item).execute()
                except Exception as insert_err:
                    err_str = str(insert_err)
                    if "date_added" in err_str or "farmer_name" in err_str or "PGRST204" in err_str or "42703" in err_str:
                        # Fallback for schemas with legacy columns (dateAdded / farmerName)
                        legacy_item = dict(new_item)
                        legacy_item["dateAdded"] = legacy_item.pop("date_added", None)
                        legacy_item["farmerName"] = legacy_item.pop("farmer_name", None)
                        response = client.table("produce").insert(legacy_item).execute()
                    else:
                        raise insert_err

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
                try:
                    response = client.rpc("place_order", rpc_params).execute()
                    if response.data:
                        order_row = response.data
                        if isinstance(order_row, list) and len(order_row) > 0:
                            order_row = order_row[0]
                        return serialize_order(order_row)
                    raise DatabaseError("place_order RPC returned no data")
                except Exception as rpc_err:
                    err_str = str(rpc_err)
                    if "PGRST202" in err_str or "place_order" in err_str:
                        logger.warning("place_order stored procedure not found in Supabase (PGRST202). Falling back to direct table operations.")
                        # Direct table operations fallback
                        prod_res = client.table("produce").select("*").eq("id", produce_id).execute()
                        if not prod_res.data:
                            raise ValueError(f"Produce with ID '{produce_id}' not found")
                        prod_item = prod_res.data[0]
                        available_stock = float(prod_item.get("quantity", 0))
                        if available_stock < quantity:
                            raise ValueError(f"Insufficient stock. Available: {available_stock}, Requested: {quantity}")

                        unit_price = float(prod_item["price"])
                        total_price = round(unit_price * quantity, 2)
                        new_stock = round(available_stock - quantity, 2)

                        # Decrement stock in produce table
                        client.table("produce").update({"quantity": new_stock}).eq("id", produce_id).execute()

                        random_suffix = uuid.uuid4().hex[:6].upper()
                        order_code = f"AGRI-{random_suffix}"
                        order_date_str = datetime.date.today().strftime("%d %b %Y")
                        f_name = prod_item.get("farmer_name") or prod_item.get("farmerName") or "Verified Grower"
                        f_loc = prod_item.get("location") or "India"
                        f_id = prod_item.get("farmer_id") or prod_item.get("farmerId")

                        order_payload = {
                            "order_id": order_code,
                            "order_date": order_date_str,
                            "produce_id": produce_id,
                            "produce_name": prod_item["name"],
                            "category": prod_item.get("category"),
                            "quantity": quantity,
                            "unit": prod_item.get("unit", "Kg"),
                            "unit_price": unit_price,
                            "total_price": total_price,
                            "farmer_name": f_name,
                            "farmer_location": f_loc,
                            "buyer_id": buyer_id,
                            "buyer_name": buyer_name,
                            "buyer_email": buyer_email,
                            "delivery_address": delivery_address,
                            "estimated_delivery": "3-5 Business Days",
                            "status": "Pending"
                        }
                        if f_id:
                            order_payload["farmer_id"] = f_id

                        try:
                            order_res = client.table("orders").insert(order_payload).execute()
                        except Exception as ins_err:
                            if "PGRST204" in str(ins_err) or "column" in str(ins_err) or "42703" in str(ins_err):
                                # Fallback to legacy camelCase columns
                                legacy_payload = {
                                    "orderId": order_code,
                                    "orderDate": order_date_str,
                                    "produceName": prod_item["name"],
                                    "category": prod_item.get("category"),
                                    "quantity": quantity,
                                    "unit": prod_item.get("unit", "Kg"),
                                    "unitPrice": unit_price,
                                    "totalPrice": total_price,
                                    "farmerName": f_name,
                                    "farmerLocation": f_loc,
                                    "buyer_id": buyer_id,
                                    "buyerName": buyer_name,
                                    "buyerEmail": buyer_email,
                                    "deliveryAddress": delivery_address,
                                    "estimatedDelivery": "3-5 Business Days",
                                    "status": "Pending"
                                }
                                order_res = client.table("orders").insert(legacy_payload).execute()
                            else:
                                raise ins_err

                        if order_res.data:
                            created_order = order_res.data[0]
                            # Create notification for farmer
                            target_farmer_id = f_id or created_order.get("farmer_id")
                            if target_farmer_id:
                                try:
                                    self.create_notification(
                                        user_id=target_farmer_id,
                                        title="New Order Received",
                                        message=f"Order #{order_code} placed by {buyer_name} for {quantity} {prod_item.get('unit', 'Kg')} of {prod_item['name']}.",
                                        order_id=order_code,
                                        token=token
                                    )
                                except Exception:
                                    pass
                            return serialize_order(created_order)
                        raise DatabaseError("Supabase orders insert returned no data")
                    else:
                        raise rpc_err
            except (ValueError, DatabaseError):
                raise
            except Exception as e:
                logger.error(f"Supabase place_order failed: {e}", exc_info=True)
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
            "status": "Pending",
            "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
        }

        self._orders_store.insert(0, order_record)

        # Send notification to farmer
        self.create_notification(
            user_id=order_record["farmer_id"],
            title="New Order Received",
            message=f"Order #{order_record['order_id']} placed by {buyer_name} for {quantity} {order_record['unit']} of {order_record['produce_name']}.",
            order_id=order_record["order_id"]
        )

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
                    response = query.execute()
                    return [serialize_order(row) for row in (response.data or [])]
                elif role == "farmer":
                    try:
                        query = query.eq("farmer_id", user_id)
                        response = query.execute()
                        return [serialize_order(row) for row in (response.data or [])]
                    except Exception as f_err:
                        err_str = str(f_err)
                        if "farmer_id" in err_str or "42703" in err_str or "PGRST204" in err_str:
                            # In legacy schemas without farmer_id on orders, match by farmer's profile full_name
                            try:
                                prof_res = client.table("profiles").select("full_name").eq("id", user_id).execute()
                                fname = prof_res.data[0].get("full_name") if prof_res.data else None
                                if fname:
                                    legacy_q = client.table("orders").select("*").eq("farmerName", fname).order("created_at", desc=True)
                                    response = legacy_q.execute()
                                    return [serialize_order(row) for row in (response.data or [])]
                            except Exception:
                                pass
                            return []
                        raise f_err
                else:
                    return []
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
        self, order_id: str, new_status: str, reason: Optional[str] = None, token: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """Updates status of order, manages timestamp tracking, rejection reasons, stock restoration, and notifications."""
        target_order = self.get_order_by_id(order_id, token)
        if not target_order:
            return None

        produce_id = target_order.get("produce_id")
        order_qty = float(target_order.get("quantity", 0))
        previous_status = target_order.get("status")
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        buyer_id = str(target_order.get("buyer_id") or target_order.get("buyerId") or "")
        farmer_id = str(target_order.get("farmer_id") or target_order.get("farmerId") or "")
        order_code = target_order.get("order_id") or order_id
        crop_name = target_order.get("produce_name") or "produce"

        if Config.is_supabase_configured():
            try:
                client = self.get_client(token)
                order_key = "order_id" if target_order.get("order_id") == order_id else "id"

                if new_status == "Cancelled":
                    try:
                        response = client.rpc("cancel_order", {"p_order_id": order_id}).execute()
                        if response.data:
                            order_row = response.data[0] if isinstance(response.data, list) else response.data
                            updated_order = serialize_order(order_row)
                        else:
                            updated_order = None
                    except Exception as cancel_rpc_err:
                        logger.warning(f"cancel_order RPC failed: {cancel_rpc_err}. Falling back to direct update.")
                        # Restore stock
                        if produce_id:
                            try:
                                prod_res = client.table("produce").select("quantity").eq("id", produce_id).execute()
                                if prod_res.data:
                                    current_q = float(prod_res.data[0].get("quantity", 0))
                                    client.table("produce").update({"quantity": current_q + order_qty}).eq("id", produce_id).execute()
                            except Exception:
                                pass
                        up_res = client.table("orders").update({"status": "Cancelled", "cancelled_at": now_iso}).eq(order_key, order_id).execute()
                        updated_order = serialize_order(up_res.data[0]) if up_res.data else None

                    if updated_order and farmer_id:
                        self.create_notification(
                            user_id=farmer_id,
                            title="Order Cancelled",
                            message=f"Order #{order_code} was cancelled. Inventory of {crop_name} has been restored.",
                            order_id=order_code,
                            token=token
                        )
                    return updated_order

                elif new_status == "Rejected":
                    try:
                        response = client.rpc("reject_order", {"p_order_id": order_id, "p_reason": reason or "Unable to fulfill"}).execute()
                        if response.data:
                            order_row = response.data[0] if isinstance(response.data, list) else response.data
                            updated_order = serialize_order(order_row)
                        else:
                            updated_order = None
                    except Exception as reject_rpc_err:
                        logger.warning(f"reject_order RPC failed: {reject_rpc_err}. Falling back to direct update.")
                        # Restore stock
                        if produce_id:
                            try:
                                prod_res = client.table("produce").select("quantity").eq("id", produce_id).execute()
                                if prod_res.data:
                                    current_q = float(prod_res.data[0].get("quantity", 0))
                                    client.table("produce").update({"quantity": current_q + order_qty}).eq("id", produce_id).execute()
                            except Exception:
                                pass
                        up_res = client.table("orders").update({
                            "status": "Rejected",
                            "rejection_reason": reason or "Unable to fulfill",
                            "rejected_at": now_iso
                        }).eq(order_key, order_id).execute()
                        updated_order = serialize_order(up_res.data[0]) if up_res.data else None

                    if updated_order and buyer_id:
                        self.create_notification(
                            user_id=buyer_id,
                            title="Order Rejected",
                            message=f"Your order #{order_code} was rejected. Reason: {reason or 'Unable to fulfill at this time'}.",
                            order_id=order_code,
                            token=token
                        )
                    return updated_order

                else:
                    update_data = {"status": new_status}
                    if new_status == "Confirmed":
                        update_data["confirmed_at"] = now_iso
                    elif new_status == "Dispatched":
                        update_data["dispatched_at"] = now_iso
                    elif new_status == "Delivered":
                        update_data["delivered_at"] = now_iso

                    response = client.table("orders").update(update_data).eq(order_key, order_id).execute()
                    if not response.data:
                        return None
                    updated_order = serialize_order(response.data[0])

                    # Trigger notifications
                    if new_status == "Confirmed" and buyer_id:
                        self.create_notification(
                            user_id=buyer_id,
                            title="Order Accepted",
                            message=f"Your order #{order_code} for {crop_name} was accepted by the farmer.",
                            order_id=order_code,
                            token=token
                        )
                    elif new_status == "Dispatched" and buyer_id:
                        self.create_notification(
                            user_id=buyer_id,
                            title="Order Dispatched",
                            message=f"Your order #{order_code} has been dispatched! Track your delivery.",
                            order_id=order_code,
                            token=token
                        )
                    elif new_status == "Delivered":
                        if farmer_id:
                            self.create_notification(
                                user_id=farmer_id,
                                title="Order Delivered",
                                message=f"Order #{order_code} for {crop_name} has been marked as delivered.",
                                order_id=order_code,
                                token=token
                            )
                        if buyer_id:
                            self.create_notification(
                                user_id=buyer_id,
                                title="Order Delivered",
                                message=f"Your order #{order_code} has been marked as delivered. Enjoy your farm-fresh harvest!",
                                order_id=order_code,
                                token=token
                            )

                    return updated_order

            except Exception as e:
                logger.error(f"Failed to update order status: {e}", exc_info=True)
                raise DatabaseError(f"Database error updating order status: {e}")

        # Memory store (Dev / Tests)
        for idx, o in enumerate(self._orders_store):
            if o.get("order_id") == order_id or o.get("id") == order_id:
                if new_status in ("Cancelled", "Rejected") and previous_status in ("Cancelled", "Rejected", "Delivered"):
                    raise ValueError(f"Cannot update order with status {previous_status}")

                self._orders_store[idx]["status"] = new_status

                if new_status == "Cancelled":
                    self._orders_store[idx]["cancelled_at"] = now_iso
                    if previous_status != "Cancelled" and produce_id:
                        for p_idx, prod in enumerate(self._produce_store):
                            if prod.get("id") == produce_id:
                                self._produce_store[p_idx]["quantity"] = round(
                                    float(prod.get("quantity", 0)) + order_qty, 2
                                )
                                break
                    if farmer_id:
                        self.create_notification(
                            user_id=farmer_id,
                            title="Order Cancelled",
                            message=f"Order #{order_code} was cancelled by buyer. Crop inventory has been restored.",
                            order_id=order_code
                        )

                elif new_status == "Rejected":
                    self._orders_store[idx]["rejected_at"] = now_iso
                    self._orders_store[idx]["rejection_reason"] = reason or "Unable to fulfill"
                    if previous_status != "Rejected" and produce_id:
                        for p_idx, prod in enumerate(self._produce_store):
                            if prod.get("id") == produce_id:
                                self._produce_store[p_idx]["quantity"] = round(
                                    float(prod.get("quantity", 0)) + order_qty, 2
                                )
                                break
                    if buyer_id:
                        self.create_notification(
                            user_id=buyer_id,
                            title="Order Rejected",
                            message=f"Your order #{order_code} was rejected. Reason: {reason or 'Unable to fulfill at this time'}.",
                            order_id=order_code
                        )

                elif new_status == "Confirmed":
                    self._orders_store[idx]["confirmed_at"] = now_iso
                    if buyer_id:
                        self.create_notification(
                            user_id=buyer_id,
                            title="Order Accepted",
                            message=f"Your order #{order_code} for {crop_name} was accepted by the farmer.",
                            order_id=order_code
                        )

                elif new_status == "Dispatched":
                    self._orders_store[idx]["dispatched_at"] = now_iso
                    if buyer_id:
                        self.create_notification(
                            user_id=buyer_id,
                            title="Order Dispatched",
                            message=f"Your order #{order_code} has been dispatched! Track your delivery.",
                            order_id=order_code
                        )

                elif new_status == "Delivered":
                    self._orders_store[idx]["delivered_at"] = now_iso
                    if farmer_id:
                        self.create_notification(
                            user_id=farmer_id,
                            title="Order Delivered",
                            message=f"Order #{order_code} has been marked as delivered.",
                            order_id=order_code
                        )
                    if buyer_id:
                        self.create_notification(
                            user_id=buyer_id,
                            title="Order Delivered",
                            message=f"Your order #{order_code} has been marked as delivered. Enjoy your harvest!",
                            order_id=order_code
                        )

                return serialize_order(self._orders_store[idx])

        return None

    # =========================================================================
    # NOTIFICATIONS OPERATIONS
    # =========================================================================

    def get_notifications_for_user(
        self, user_id: str, token: Optional[str] = None
    ) -> Tuple[List[Dict[str, Any]], int]:
        """Fetches notifications for a user, returning (items, unread_count)."""
        if Config.is_supabase_configured():
            try:
                client = self.get_client(token)
                res = client.table("notifications").select("*").eq("user_id", user_id).order("created_at", desc=True).limit(50).execute()
                items = [serialize_notification(row) for row in (res.data or [])]
                unread = sum(1 for n in items if not n.get("isRead"))
                return items, unread
            except Exception as e:
                logger.warning(f"Failed to fetch notifications from Supabase: {e}")
                # Fallback to memory store if table not yet migrated
                matches = [n for n in self._notifications_store if n.get("user_id") == user_id]
                matches.sort(key=lambda x: str(x.get("created_at", "")), reverse=True)
                items = [serialize_notification(n) for n in matches[:50]]
                unread = sum(1 for n in items if not n.get("isRead"))
                return items, unread

        matches = [n for n in self._notifications_store if n.get("user_id") == user_id]
        matches.sort(key=lambda x: str(x.get("created_at", "")), reverse=True)
        items = [serialize_notification(n) for n in matches[:50]]
        unread = sum(1 for n in items if not n.get("isRead"))
        return items, unread

    def mark_notification_read(
        self, notification_id: str, user_id: str, token: Optional[str] = None
    ) -> bool:
        """Marks a single notification as read."""
        if Config.is_supabase_configured():
            try:
                client = self.get_client(token)
                client.table("notifications").update({"is_read": True}).eq("id", notification_id).eq("user_id", user_id).execute()
                return True
            except Exception as e:
                logger.warning(f"Supabase mark_notification_read failed: {e}")

        for n in self._notifications_store:
            if n.get("id") == notification_id and n.get("user_id") == user_id:
                n["is_read"] = True
                return True
        return False

    def mark_all_notifications_read(
        self, user_id: str, token: Optional[str] = None
    ) -> bool:
        """Marks all notifications for user as read."""
        if Config.is_supabase_configured():
            try:
                client = self.get_client(token)
                client.table("notifications").update({"is_read": True}).eq("user_id", user_id).execute()
                return True
            except Exception as e:
                logger.warning(f"Supabase mark_all_notifications_read failed: {e}")

        for n in self._notifications_store:
            if n.get("user_id") == user_id:
                n["is_read"] = True
        return True

    def create_notification(
        self, user_id: str, title: str, message: str, order_id: Optional[str] = None, token: Optional[str] = None
    ) -> Dict[str, Any]:
        """Creates a notification record."""
        record = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "title": title,
            "message": message,
            "order_id": order_id,
            "is_read": False,
            "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
        }
        if Config.is_supabase_configured():
            try:
                client = self.get_client(token)
                res = client.table("notifications").insert({
                    "id": record["id"],
                    "user_id": user_id,
                    "title": title,
                    "message": message,
                    "order_id": order_id,
                    "is_read": False
                }).execute()
                if res.data:
                    return serialize_notification(res.data[0])
            except Exception as e:
                logger.warning(f"Could not insert notification into Supabase: {e}")

        self._notifications_store.insert(0, record)
        return serialize_notification(record)


# Global singleton instance
db = Database()
