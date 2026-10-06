# Supabase Manual Security & RLS Verification Guide

This document contains manual SQL test cases to run in the **Supabase SQL Editor** of a **TEST project** to verify security policies, database triggers, and RPC procedures.

> **IMPORTANT**: Run these tests in a test/staging Supabase project, never in live production.

---

## 0. Initial Setup: Create Two Test Users

In your Supabase Dashboard under **Authentication > Users**, create two test users:
1. **User A (Farmer)**: `farmer_test@agrimandi.local` (Note UUID as `UUID_A`)
2. **User B (Buyer)**: `buyer_test@agrimandi.local` (Note UUID as `UUID_B`)

Ensure their `public.profiles` records exist with correct roles:

```sql
-- Ensure profiles are configured
INSERT INTO public.profiles (id, email, full_name, role, location)
VALUES 
    ('<UUID_A>', 'farmer_test@agrimandi.local', 'Test Farmer A', 'farmer', 'Nashik, Maharashtra'),
    ('<UUID_B>', 'buyer_test@agrimandi.local', 'Test Buyer B', 'buyer', 'Pune, Maharashtra')
ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
```

Also ensure a produce item belongs to Farmer A:
```sql
INSERT INTO public.produce (id, name, category, quantity, unit, price, location, farmer_name, farmer_id)
VALUES ('prod-test-1', 'Organic Onions', 'Vegetables', 100, 'Kg', 30, 'Nashik, Maharashtra', 'Test Farmer A', '<UUID_A>')
ON CONFLICT (id) DO NOTHING;
```

---

## 1. Test: User A Cannot Read User B's Orders or Profile

### 1.1 Verify Profile Privacy
Simulate User A (Farmer) querying User B's (Buyer) profile:

```sql
BEGIN;
-- Impersonate User A
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "<UUID_A>", "role": "authenticated"}';

-- Attempt to read User B's profile
SELECT * FROM public.profiles WHERE id = '<UUID_B>';
-- EXPECTED: 0 rows returned (blocked by USING (auth.uid() = id))

-- Attempt to read own profile
SELECT * FROM public.profiles WHERE id = '<UUID_A>';
-- EXPECTED: Exactly 1 row returned (User A's profile)
ROLLBACK;
```

### 1.2 Verify Order Privacy
Create an order belonging exclusively to Buyer B and Farmer X (not Farmer A):

```sql
-- Setup order for Buyer B with a different farmer
INSERT INTO public.orders (
    order_id, order_date, produce_id, produce_name, category,
    quantity, unit, unit_price, total_price,
    farmer_id, farmer_name, farmer_location,
    buyer_id, buyer_name, buyer_email, delivery_address, status
) VALUES (
    'AGRI-TEST-B', '06 Oct 2026', 'prod-test-1', 'Organic Onions', 'Vegetables',
    10, 'Kg', 30, 300,
    gen_random_uuid(), 'Other Farmer', 'Other Place',
    '<UUID_B>', 'Test Buyer B', 'buyer_test@agrimandi.local', 'Test Address', 'Pending'
);
```

Now simulate User A attempting to read Buyer B's order:

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "<UUID_A>", "role": "authenticated"}';

-- Attempt to read Buyer B's order
SELECT * FROM public.orders WHERE order_id = 'AGRI-TEST-B';
-- EXPECTED: 0 rows returned (blocked by USING (buyer_id = auth.uid() OR farmer_id = auth.uid()))
ROLLBACK;
```

---

## 2. Test: User A Cannot Call place_order as User B

The `place_order` stored procedure drops `p_buyer_id` and derives the buyer directly from `auth.uid()`.

```sql
BEGIN;
-- Impersonate User A (who is a farmer, not buyer)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "<UUID_A>", "role": "authenticated"}';

-- User A attempts to place an order
SELECT public.place_order(
    'prod-test-1',
    5,
    'Test Buyer B',
    'buyer_test@agrimandi.local',
    'Fake Delivery Street'
);
-- EXPECTED ERROR: "User must have a registered buyer profile to place an order."
ROLLBACK;
```

If an authenticated Buyer B calls `place_order`, the resulting row will strictly record `buyer_id = <UUID_B>`:

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "<UUID_B>", "role": "authenticated"}';

SELECT id, order_id, buyer_id, quantity, total_price, status 
FROM public.place_order(
    'prod-test-1',
    5,
    'Test Buyer B',
    'buyer_test@agrimandi.local',
    'Buyer Address'
);
-- EXPECTED: 1 row returned with buyer_id = '<UUID_B>' and status = 'Confirmed'
ROLLBACK;
```

If unauthenticated (anon):
```sql
BEGIN;
SET LOCAL ROLE anon;
SELECT public.place_order('prod-test-1', 5, 'Anon', 'anon@test.com', 'Street');
-- EXPECTED ERROR: "permission denied for function place_order" (REVOKE from anon)
ROLLBACK;
```

---

## 3. Test: A Buyer Cannot UPDATE Produce

Buyers must never be able to alter crop inventory, prices, or listings:

```sql
BEGIN;
-- Impersonate User B (Buyer)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "<UUID_B>", "role": "authenticated"}';

-- Attempt to tamper with produce price or stock
UPDATE public.produce 
SET price = 1.00, quantity = 9999
WHERE id = 'prod-test-1';

-- Check affected rows
-- EXPECTED: UPDATE 0 (RLS policy "Farmers can update their own produce" permits only farmer_id = auth.uid())
SELECT price, quantity FROM public.produce WHERE id = 'prod-test-1';
-- EXPECTED: Price and quantity remain unchanged (30 and 100)
ROLLBACK;
```

---

## 4. Test: A Farmer Cannot Set an Order to Cancelled via REST (Plain UPDATE)

Direct `UPDATE` on orders cannot set `status = 'Cancelled'`. Plain `UPDATE` is strictly restricted to valid status progression (`Pending -> Confirmed -> Dispatched -> Delivered`). Cancellation must go through `cancel_order`.

```sql
-- Ensure test order exists linked to Farmer A
INSERT INTO public.orders (
    order_id, order_date, produce_id, produce_name, category,
    quantity, unit, unit_price, total_price,
    farmer_id, farmer_name, farmer_location,
    buyer_id, buyer_name, buyer_email, delivery_address, status
) VALUES (
    'AGRI-TEST-FARMER-1', '06 Oct 2026', 'prod-test-1', 'Organic Onions', 'Vegetables',
    5, 'Kg', 30, 150,
    '<UUID_A>', 'Test Farmer A', 'Nashik, Maharashtra',
    '<UUID_B>', 'Test Buyer B', 'buyer_test@agrimandi.local', 'Pune Address', 'Confirmed'
) ON CONFLICT (order_id) DO UPDATE SET status = 'Confirmed';

BEGIN;
-- Impersonate Farmer A
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "<UUID_A>", "role": "authenticated"}';

-- Attempt plain UPDATE setting Cancelled
UPDATE public.orders 
SET status = 'Cancelled' 
WHERE order_id = 'AGRI-TEST-FARMER-1';
-- EXPECTED ERROR: "Direct cancellation is not permitted. Orders must be cancelled via cancel_order."
ROLLBACK;
```

### 4.1 Verify Proper Cancellation via `cancel_order`
```sql
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "<UUID_A>", "role": "authenticated"}';

-- Proper cancellation via cancel_order RPC
SELECT id, order_id, status FROM public.cancel_order('AGRI-TEST-FARMER-1');
-- EXPECTED: Returns order row with status = 'Cancelled'

-- Verify produce stock was restored
SELECT quantity FROM public.produce WHERE id = 'prod-test-1';
-- EXPECTED: Stock increased by 5
ROLLBACK;
```

---

## 5. Test: Role Change by a User Fails

Regular authenticated users must be prevented from modifying their `role` column via UPDATE:

```sql
BEGIN;
-- Impersonate Buyer B
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "<UUID_B>", "role": "authenticated"}';

-- Attempt to elevate role to 'farmer'
UPDATE public.profiles 
SET role = 'farmer' 
WHERE id = '<UUID_B>';
-- EXPECTED ERROR: "Modifying the profile role is not permitted."
ROLLBACK;
```

### 5.1 Verify Admin / Service Role / Dashboard Can Modify Roles
When executed directly in the SQL Editor without impersonation (where `auth.uid()` IS NULL):

```sql
BEGIN;
-- auth.uid() is NULL in superuser / dashboard environment
UPDATE public.profiles 
SET location = 'Updated Location'
WHERE id = '<UUID_B>';
-- EXPECTED: UPDATE 1 (allowed because auth.uid() IS NULL)
ROLLBACK;
```
