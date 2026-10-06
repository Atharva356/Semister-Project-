import datetime
import uuid
from typing import Any, Dict, List, Optional
from config import Config

# Default Seed Produce Data (mirrors AgriMandi marketplace catalogue)
INITIAL_PRODUCE: List[Dict[str, Any]] = [
    {
        "id": "prod-1",
        "name": "Sharbati Wheat",
        "category": "Grains",
        "quantity": 50.0,
        "unit": "Quintal",
        "price": 3200.0,
        "location": "Sehore, Madhya Pradesh",
        "farmerName": "Rameshwar Patel",
        "image": "https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?auto=format&fit=crop&w=600&q=80",
        "dateAdded": "2026-09-08"
    },
    {
        "id": "prod-2",
        "name": "Organic Red Hybrid Tomatoes",
        "category": "Vegetables",
        "quantity": 250.0,
        "unit": "Kg",
        "price": 28.0,
        "location": "Nashik, Maharashtra",
        "farmerName": "Sanjay Deshmukh",
        "image": "https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&w=600&q=80",
        "dateAdded": "2026-09-09"
    },
    {
        "id": "prod-3",
        "name": "Royal Delicious Shimla Apples",
        "category": "Fruits",
        "quantity": 120.0,
        "unit": "Crates",
        "price": 1450.0,
        "location": "Shimla, Himachal Pradesh",
        "farmerName": "Baldev Chauhan",
        "image": "https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?auto=format&fit=crop&w=600&q=80",
        "dateAdded": "2026-09-07"
    },
    {
        "id": "prod-4",
        "name": "Kolar Fresh Red Onions",
        "category": "Vegetables",
        "quantity": 400.0,
        "unit": "Kg",
        "price": 34.0,
        "location": "Kolar, Karnataka",
        "farmerName": "Narayana Gowda",
        "image": "https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?auto=format&fit=crop&w=600&q=80",
        "dateAdded": "2026-09-09"
    },
    {
        "id": "prod-5",
        "name": "Traditional Basmati Rice (Pusa 1121)",
        "category": "Grains",
        "quantity": 35.0,
        "unit": "Quintal",
        "price": 4600.0,
        "location": "Karnal, Haryana",
        "farmerName": "Gurpreet Singh",
        "image": "https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=600&q=80",
        "dateAdded": "2026-09-06"
    }
]

class Database:
    """
    Database adapter that connects to Supabase when configured,
    or falls back to an in-memory datastore for instant offline local development.
    """
    def __init__(self):
        self.supabase_client = None
        self._init_supabase()
        # In-memory storage fallback
        self._produce_store: List[Dict[str, Any]] = [dict(item) for item in INITIAL_PRODUCE]
        self._orders_store: List[Dict[str, Any]] = []

    def _init_supabase(self):
        if Config.is_supabase_configured():
            try:
                from supabase import create_client
                self.supabase_client = create_client(Config.SUPABASE_URL, Config.SUPABASE_KEY)
                print("[Database] Successfully connected to Supabase client.")
            except ImportError:
                print("[Database] 'supabase' package not installed. Running in local fallback mode.")
            except Exception as e:
                print(f"[Database] Failed to initialize Supabase client: {e}. Running in local fallback mode.")

    @property
    def is_using_supabase(self) -> bool:
        return self.supabase_client is not None

    # =========================================================================
    # PRODUCE OPERATIONS
    # =========================================================================

    def get_all_produce(
        self,
        search: Optional[str] = None,
        category: Optional[str] = None,
        location: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Fetch all produce listings with optional search & filter criteria."""
        if self.is_using_supabase:
            try:
                query = self.supabase_client.table("produce").select("*").order("created_at", desc=True)
                if category:
                    query = query.eq("category", category)
                if location:
                    query = query.ilike("location", f"%{location}%")
                if search:
                    # In Supabase/PostgREST, we can use ilike on name
                    query = query.ilike("name", f"%{search}%")
                response = query.execute()
                return response.data or []
            except Exception as e:
                print(f"[Supabase Error] get_all_produce failed: {e}. Falling back to memory.")

        # Local fallback filter
        results = list(self._produce_store)
        if search:
            s = search.lower().strip()
            results = [
                p for p in results
                if s in p.get("name", "").lower()
                or s in p.get("location", "").lower()
                or s in p.get("farmerName", "").lower()
            ]
        if category:
            c = category.strip()
            results = [p for p in results if p.get("category", "") == c]
        if location:
            loc = location.lower().strip()
            results = [p for p in results if loc in p.get("location", "").lower()]

        return results

    def get_produce_by_id(self, produce_id: str) -> Optional[Dict[str, Any]]:
        """Fetch a single produce listing by its unique identifier."""
        if self.is_using_supabase:
            try:
                response = self.supabase_client.table("produce").select("*").eq("id", produce_id).execute()
                if response.data:
                    return response.data[0]
                return None
            except Exception as e:
                print(f"[Supabase Error] get_produce_by_id failed: {e}")

        for item in self._produce_store:
            if item.get("id") == produce_id:
                return dict(item)
        return None

    def create_produce(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new produce harvest listing."""
        new_item = {
            "id": data.get("id") or f"prod-{int(datetime.datetime.now().timestamp() * 1000)}",
            "name": data.get("name", "").strip(),
            "category": data.get("category", "Vegetables"),
            "quantity": float(data.get("quantity", 0)),
            "unit": data.get("unit", "Kg"),
            "price": float(data.get("price", 0)),
            "location": data.get("location", "").strip(),
            "farmerName": data.get("farmerName", "Verified Grower").strip(),
            "image": data.get("image") or "https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=600&q=80",
            "dateAdded": data.get("dateAdded") or datetime.date.today().isoformat()
        }

        if self.is_using_supabase:
            try:
                response = self.supabase_client.table("produce").insert(new_item).execute()
                if response.data:
                    return response.data[0]
            except Exception as e:
                print(f"[Supabase Error] create_produce failed: {e}. Saving in memory.")

        self._produce_store.insert(0, new_item)
        return new_item

    def update_produce(self, produce_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Update an existing produce listing."""
        update_fields = {}
        for key in ["name", "category", "quantity", "unit", "price", "location", "image"]:
            if key in data:
                if key in ("quantity", "price"):
                    update_fields[key] = float(data[key])
                else:
                    update_fields[key] = data[key]

        if self.is_using_supabase:
            try:
                response = self.supabase_client.table("produce").update(update_fields).eq("id", produce_id).execute()
                if response.data:
                    return response.data[0]
                return None
            except Exception as e:
                print(f"[Supabase Error] update_produce failed: {e}. Updating memory.")

        for idx, item in enumerate(self._produce_store):
            if item.get("id") == produce_id:
                self._produce_store[idx].update(update_fields)
                return dict(self._produce_store[idx])
        return None

    def delete_produce(self, produce_id: str) -> bool:
        """Delete a produce listing."""
        if self.is_using_supabase:
            try:
                response = self.supabase_client.table("produce").delete().eq("id", produce_id).execute()
                return len(response.data or []) > 0
            except Exception as e:
                print(f"[Supabase Error] delete_produce failed: {e}. Deleting from memory.")

        initial_len = len(self._produce_store)
        self._produce_store = [p for p in self._produce_store if p.get("id") != produce_id]
        return len(self._produce_store) < initial_len

    def get_produce_stats(self) -> Dict[str, Any]:
        """Aggregate stats for listings and stock quantity."""
        items = self.get_all_produce()
        total_quantity = sum(float(it.get("quantity", 0)) for it in items)
        return {
            "totalListings": len(items),
            "totalQuantity": round(total_quantity, 2)
        }

    # =========================================================================
    # ORDERS OPERATIONS
    # =========================================================================

    def get_all_orders(
        self,
        buyer_email: Optional[str] = None,
        farmer_name: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Fetch all orders with optional filter for buyer or farmer."""
        if self.is_using_supabase:
            try:
                query = self.supabase_client.table("orders").select("*").order("created_at", desc=True)
                if buyer_email:
                    query = query.eq("buyerEmail", buyer_email)
                if farmer_name:
                    query = query.eq("farmerName", farmer_name)
                response = query.execute()
                return response.data or []
            except Exception as e:
                print(f"[Supabase Error] get_all_orders failed: {e}. Falling back to memory.")

        results = list(self._orders_store)
        if buyer_email:
            results = [o for o in results if o.get("buyerEmail", "").lower() == buyer_email.lower()]
        if farmer_name:
            results = [o for o in results if o.get("farmerName", "").lower() == farmer_name.lower()]
        return results

    def get_order_by_id(self, order_id: str) -> Optional[Dict[str, Any]]:
        """Fetch a single order by order ID."""
        if self.is_using_supabase:
            try:
                response = self.supabase_client.table("orders").select("*").eq("orderId", order_id).execute()
                if response.data:
                    return response.data[0]
                return None
            except Exception as e:
                print(f"[Supabase Error] get_order_by_id failed: {e}")

        for order in self._orders_store:
            if order.get("orderId") == order_id:
                return dict(order)
        return None

    def create_order(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new purchase order."""
        random_suffix = uuid.uuid4().hex[:6].upper()
        new_order = {
            "orderId": data.get("orderId") or f"AGRI-{random_suffix}",
            "orderDate": data.get("orderDate") or datetime.date.today().strftime("%d %b %Y"),
            "produceName": data.get("produceName", "Farm Produce"),
            "category": data.get("category", "General"),
            "quantity": float(data.get("quantity", 1)),
            "unit": data.get("unit", "Kg"),
            "unitPrice": float(data.get("unitPrice", 0)),
            "totalPrice": float(data.get("totalPrice", 0)),
            "farmerName": data.get("farmerName", "Verified Grower"),
            "farmerLocation": data.get("farmerLocation", "India"),
            "buyerName": data.get("buyerName", "Guest Buyer"),
            "buyerEmail": data.get("buyerEmail", "buyer@example.com"),
            "deliveryAddress": data.get("deliveryAddress", "Standard Delivery Address"),
            "estimatedDelivery": data.get("estimatedDelivery", "3-5 Business Days"),
            "status": data.get("status", "Confirmed")
        }

        if self.is_using_supabase:
            try:
                response = self.supabase_client.table("orders").insert(new_order).execute()
                if response.data:
                    return response.data[0]
            except Exception as e:
                print(f"[Supabase Error] create_order failed: {e}. Saving in memory.")

        self._orders_store.insert(0, new_order)
        return new_order

    def update_order_status(self, order_id: str, status: str) -> Optional[Dict[str, Any]]:
        """Update an order's fulfillment status (e.g., Pending, Confirmed, Dispatched, Delivered)."""
        if self.is_using_supabase:
            try:
                response = self.supabase_client.table("orders").update({"status": status}).eq("orderId", order_id).execute()
                if response.data:
                    return response.data[0]
                return None
            except Exception as e:
                print(f"[Supabase Error] update_order_status failed: {e}. Updating memory.")

        for idx, order in enumerate(self._orders_store):
            if order.get("orderId") == order_id:
                self._orders_store[idx]["status"] = status
                return dict(self._orders_store[idx])
        return None

# Singleton database instance
db = Database()
