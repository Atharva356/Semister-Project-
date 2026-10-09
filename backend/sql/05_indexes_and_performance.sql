-- ==============================================================================
-- AgriMandi Database - Step 05: Performance Indexes & Query Patterns Review
-- ==============================================================================
-- Run this script fifth in Supabase SQL Editor.
-- Optimized B-Tree and text-search indexes designed specifically for AgriMandi's
-- marketplace querying patterns, dashboard filters, and transactional joins.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. PRODUCE TABLE INDEXES
-- ------------------------------------------------------------------------------

-- Query Pattern 1: Farmer Dashboard Inventory Query
-- Accelerated query: SELECT * FROM produce WHERE farmer_id = $1 ORDER BY created_at DESC;
-- Rationale: A farmer viewing their active crops filters strictly by their auth UUID.
-- An index on farmer_id allows an index scan instead of a full table scan.
CREATE INDEX IF NOT EXISTS idx_produce_farmer_id
    ON public.produce(farmer_id);

-- Query Pattern 2: Category Filter in Marketplace
-- Accelerated query: SELECT * FROM produce WHERE category = $1;
-- Rationale: Buyers frequently filter crops by category ('Grains', 'Vegetables', 'Fruits', etc.).
-- High selectivity allows instantaneous lookups across tens of thousands of listings.
CREATE INDEX IF NOT EXISTS idx_produce_category
    ON public.produce(category);

-- Query Pattern 3: Location / Mandi Region Searches
-- Accelerated query: SELECT * FROM produce WHERE location ILIKE '%' || $1 || '%';
-- Rationale: Buyers search for nearby produce in specific districts or states (e.g., 'Nashik', 'Punjab').
CREATE INDEX IF NOT EXISTS idx_produce_location
    ON public.produce(location);

-- Query Pattern 4: Marketplace Feed & Pagination
-- Accelerated query: SELECT * FROM produce ORDER BY created_at DESC LIMIT 12 OFFSET 0;
-- Rationale: The landing page and marketplace display the freshest crop arrivals.
-- Sorting by created_at DESC with a B-Tree index avoids expensive in-memory sort operations.
CREATE INDEX IF NOT EXISTS idx_produce_created_at
    ON public.produce(created_at DESC);

-- Composite Index for Category + Created At
-- Accelerated query: SELECT * FROM produce WHERE category = $1 ORDER BY created_at DESC;
-- Rationale: Directly powers category-filtered pagination queries.
CREATE INDEX IF NOT EXISTS idx_produce_category_created_at
    ON public.produce(category, created_at DESC);


-- ------------------------------------------------------------------------------
-- 2. ORDERS TABLE INDEXES
-- ------------------------------------------------------------------------------

-- Query Pattern 5: Foreign Key Cascade & Stock Audit
-- Accelerated query: SELECT * FROM orders WHERE produce_id = $1;
-- Rationale: When checking orders for a specific produce item or handling ON DELETE SET NULL,
-- Postgres checks foreign keys against produce_id.
CREATE INDEX IF NOT EXISTS idx_orders_produce_id
    ON public.orders(produce_id);

-- Query Pattern 6: Farmer Incoming Orders & Fulfillment Dashboard
-- Accelerated query: SELECT * FROM orders WHERE farmer_id = $1 ORDER BY created_at DESC;
-- Rationale: Farmers need instant access to incoming orders needing dispatch/delivery.
CREATE INDEX IF NOT EXISTS idx_orders_farmer_id
    ON public.orders(farmer_id, created_at DESC);

-- Query Pattern 7: Buyer Order History Dashboard
-- Accelerated query: SELECT * FROM orders WHERE buyer_id = $1 ORDER BY created_at DESC;
-- Rationale: Buyers check their historical purchases and tracking statuses.
CREATE INDEX IF NOT EXISTS idx_orders_buyer_id
    ON public.orders(buyer_id, created_at DESC);

-- Query Pattern 8: Tracking by Reference Code
-- Accelerated query: SELECT * FROM orders WHERE order_id = 'AGRI-XXXXXX';
-- Rationale: Buyers, farmers, or logistics coordinators lookup orders by human-readable ID.
CREATE INDEX IF NOT EXISTS idx_orders_order_id
    ON public.orders(order_id);

-- Query Pattern 9: Status State-Machine Filtering
-- Accelerated query: SELECT * FROM orders WHERE status = 'Pending';
-- Rationale: Fast discovery of orders pending confirmation or in transit.
CREATE INDEX IF NOT EXISTS idx_orders_status
    ON public.orders(status);


-- ------------------------------------------------------------------------------
-- 3. PROFILES TABLE INDEXES
-- ------------------------------------------------------------------------------

-- Query Pattern 10: Role Verification
-- Accelerated query: SELECT * FROM profiles WHERE role = 'farmer';
-- Rationale: Quick role checks and directory listings.
CREATE INDEX IF NOT EXISTS idx_profiles_role
    ON public.profiles(role);
