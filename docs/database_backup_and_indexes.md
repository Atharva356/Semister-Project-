# AgriMandi Database Backup Strategy & Index Review

This document provides a comprehensive operational guide for database backups, disaster recovery, and an in-depth review of database indexes and the specific query patterns they accelerate.

---

## Part 1: Database Backup Strategy

### 1. Supabase Native Backups
- **Free Plan**: Supabase provides automatic daily database backups with a retention window of 7 days.
- **Pro Plan**: Supabase offers Point-In-Time Recovery (PITR) with continuous write-ahead logging (WAL), allowing recovery to any specific second within the last 7 to 30 days.

### 2. Manual Backup Procedures (pg_dump)

To take an on-demand, self-contained snapshot of your AgriMandi database:

1. Obtain your PostgreSQL Connection URI from **Supabase Dashboard -> Project Settings -> Database -> Connection String (URI)**:
   ```bash
   export DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres"
   ```

2. Generate a compressed database dump:
   ```bash
   pg_dump \
     --format=custom \
     --clean \
     --if-exists \
     --no-owner \
     --no-privileges \
     --dbname="$DATABASE_URL" \
     --file="agrimandi_backup_$(date +%Y%m%d_%H%M%S).dump"
   ```
   *(Or for plain SQL format: `pg_dump "$DATABASE_URL" > agrimandi_backup.sql`)*

### 3. Disaster Recovery & Restoration

To restore your database from a backup file:

```bash
# For custom format (.dump):
pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --dbname="$DATABASE_URL" \
  agrimandi_backup_20261009.dump

# For plain SQL (.sql):
psql "$DATABASE_URL" < agrimandi_backup_20261009.sql
```

> **Safety Warning**: Before restoring in production, ensure all active web services are temporarily placed in maintenance mode to avoid concurrent transactional writes.

---

## Part 2: Database Index Review & Query Patterns

Indexes in AgriMandi are explicitly tailored to the marketplace search behaviors, transactional joins, and dashboard views. Below is a detailed breakdown of each index and the exact query pattern it serves:

```
+----------------------------------------------------------------------------------------------------+
|                                    AGRIMANDI INDEX REGISTRY                                        |
+------------------------------------+-----------+-----------------------------------+---------------+
| Index Name                         | Table     | Indexed Columns                   | Type          |
+------------------------------------+-----------+-----------------------------------+---------------+
| idx_produce_farmer_id              | produce   | (farmer_id)                       | B-Tree        |
| idx_produce_category               | produce   | (category)                        | B-Tree        |
| idx_produce_location               | produce   | (location)                        | B-Tree        |
| idx_produce_created_at             | produce   | (created_at DESC)                 | B-Tree        |
| idx_produce_category_created_at    | produce   | (category, created_at DESC)       | Composite     |
| idx_orders_produce_id              | orders    | (produce_id)                      | B-Tree (FK)   |
| idx_orders_farmer_id               | orders    | (farmer_id, created_at DESC)      | Composite     |
| idx_orders_buyer_id                | orders    | (buyer_id, created_at DESC)       | Composite     |
| idx_orders_order_id                | orders    | (order_id)                        | B-Tree Unique |
| idx_orders_status                  | orders    | (status)                          | B-Tree        |
| idx_profiles_role                  | profiles  | (role)                            | B-Tree        |
+------------------------------------+-----------+-----------------------------------+---------------+
```

---

### In-Depth Index Breakdown

#### 1. `idx_produce_farmer_id` (`produce(farmer_id)`)
- **Query Pattern**:
  ```sql
  SELECT * FROM public.produce 
  WHERE farmer_id = $1 
  ORDER BY created_at DESC;
  ```
- **UI / Business Flow**: **Farmer Dashboard -> My Listings Tab**.
- **Performance Impact**: A farmer with 20 listings in a catalog of 500,000 crops avoids a full table scan (`Seq Scan`). Postgres performs an `Index Scan` in under 1ms.

#### 2. `idx_produce_category` (`produce(category)`)
- **Query Pattern**:
  ```sql
  SELECT * FROM public.produce 
  WHERE category = 'Grains';
  ```
- **UI / Business Flow**: **Marketplace Filter Pills** (Grains, Vegetables, Fruits, Pulses, Spices).
- **Performance Impact**: Fast categorical lookups across high-cardinality crop sets.

#### 3. `idx_produce_location` (`produce(location)`)
- **Query Pattern**:
  ```sql
  SELECT * FROM public.produce 
  WHERE location ILIKE '%' || $1 || '%';
  ```
- **UI / Business Flow**: **Regional & District Search** (e.g. buyers searching for "Nashik" or "Punjab").
- **Performance Impact**: Accelerates prefix and pattern scans on location strings.

#### 4. `idx_produce_created_at` (`produce(created_at DESC)`)
- **Query Pattern**:
  ```sql
  SELECT * FROM public.produce 
  ORDER BY created_at DESC 
  LIMIT 12 OFFSET 0;
  ```
- **UI / Business Flow**: **Home Page & Marketplace Default Feed**.
- **Performance Impact**: B-Tree stores rows in pre-sorted order. Eliminates memory-intensive `Sort` operations in PostgreSQL, delivering sub-millisecond response times for paginated browsing.

#### 5. `idx_produce_category_created_at` (`produce(category, created_at DESC)`)
- **Query Pattern**:
  ```sql
  SELECT * FROM public.produce 
  WHERE category = $1 
  ORDER BY created_at DESC 
  LIMIT 12;
  ```
- **UI / Business Flow**: **Filtered Pagination Feed**.
- **Performance Impact**: A composite index satisfies both the `WHERE category = ...` equality filter and the `ORDER BY created_at DESC` sorting clause in a single index scan pass.

#### 6. `idx_orders_produce_id` (`orders(produce_id)`)
- **Query Pattern**:
  ```sql
  SELECT * FROM public.orders 
  WHERE produce_id = $1;
  ```
- **UI / Business Flow**: **Foreign Key Constraints & Inventory Auditing**.
- **Performance Impact**: Foreign key columns without indexes can cause table locks on parent deletions. This index ensures `ON DELETE SET NULL` operations execute cleanly without locking the `orders` table.

#### 7. `idx_orders_farmer_id` (`orders(farmer_id, created_at DESC)`)
- **Query Pattern**:
  ```sql
  SELECT * FROM public.orders 
  WHERE farmer_id = $1 
  ORDER BY created_at DESC;
  ```
- **UI / Business Flow**: **Farmer Dashboard -> Incoming Orders Tab**.
- **Performance Impact**: Instantly fetches orders needing dispatch without sorting or scanning other farmers' transactions. Satisfies Row Level Security (RLS) check `farmer_id = auth.uid()` efficiently.

#### 8. `idx_orders_buyer_id` (`orders(buyer_id, created_at DESC)`)
- **Query Pattern**:
  ```sql
  SELECT * FROM public.orders 
  WHERE buyer_id = $1 
  ORDER BY created_at DESC;
  ```
- **UI / Business Flow**: **Buyer Dashboard -> My Orders Tab**.
- **Performance Impact**: Provides instant order history loading for buyers, filtered by buyer UUID and sorted with newest orders first.

#### 9. `idx_orders_order_id` (`orders(order_id)`)
- **Query Pattern**:
  ```sql
  SELECT * FROM public.orders 
  WHERE order_id = 'AGRI-ABC123';
  ```
- **UI / Business Flow**: **Order Confirmation Page & Package Tracking**.
- **Performance Impact**: Unique B-Tree lookup for direct order code resolution (`O(log N)` complexity).

#### 10. `idx_orders_status` (`orders(status)`)
- **Query Pattern**:
  ```sql
  SELECT * FROM public.orders 
  WHERE status IN ('Pending', 'Confirmed');
  ```
- **UI / Business Flow**: **Fulfillment Pipeline & State-Machine Validation**.
- **Performance Impact**: Speeds up filtering for orders awaiting farmer dispatch or delivery confirmation.

#### 11. `idx_profiles_role` (`profiles(role)`)
- **Query Pattern**:
  ```sql
  SELECT * FROM public.profiles 
  WHERE role = 'farmer';
  ```
- **UI / Business Flow**: **Role Verification & Farmer Directory**.
- **Performance Impact**: Supports internal trigger checks and administrative queries.
