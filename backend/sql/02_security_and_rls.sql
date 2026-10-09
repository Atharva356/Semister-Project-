-- ==============================================================================
-- AgriMandi Database - Step 02: Row Level Security (RLS) Policies
-- ==============================================================================
-- Run this script second in Supabase SQL Editor.
-- Enforces zero-trust database security so users can only access their authorized records.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. PROFILES RLS
-- ------------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

-- Users can only view their own profile row
CREATE POLICY "Users can view their own profile"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (auth.uid() = id);

-- Users can update their own profile row (role column protected by trigger)
CREATE POLICY "Users can update their own profile"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);


-- ------------------------------------------------------------------------------
-- 2. PRODUCE RLS
-- ------------------------------------------------------------------------------
ALTER TABLE public.produce ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public produce listings viewable by all" ON public.produce;
DROP POLICY IF EXISTS "Farmers can insert their own produce" ON public.produce;
DROP POLICY IF EXISTS "Farmers can update their own produce" ON public.produce;
DROP POLICY IF EXISTS "Farmers can delete their own produce" ON public.produce;

-- Any visitor or buyer can browse produce listings
CREATE POLICY "Public produce listings viewable by all"
    ON public.produce FOR SELECT
    USING (true);

-- Only authenticated users with farmer role can insert produce listings
CREATE POLICY "Farmers can insert their own produce"
    ON public.produce FOR INSERT
    TO authenticated
    WITH CHECK (
        farmer_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'farmer'
        )
    );

-- Only the farmer who created the listing can update it
CREATE POLICY "Farmers can update their own produce"
    ON public.produce FOR UPDATE
    TO authenticated
    USING (farmer_id = auth.uid())
    WITH CHECK (farmer_id = auth.uid());

-- Only the farmer who created the listing can delete it
CREATE POLICY "Farmers can delete their own produce"
    ON public.produce FOR DELETE
    TO authenticated
    USING (farmer_id = auth.uid());


-- ------------------------------------------------------------------------------
-- 3. ORDERS RLS
-- ------------------------------------------------------------------------------
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Orders viewable by buyer or farmer" ON public.orders;
DROP POLICY IF EXISTS "Buyers can insert their own orders" ON public.orders;
DROP POLICY IF EXISTS "Farmers can update status of their orders" ON public.orders;

-- Orders are strictly private between the buyer who placed it and the farmer who grows it
CREATE POLICY "Orders viewable by buyer or farmer"
    ON public.orders FOR SELECT
    TO authenticated
    USING (
        buyer_id = auth.uid() OR farmer_id = auth.uid()
    );

-- Buyers can insert orders for themselves (or use place_order RPC)
CREATE POLICY "Buyers can insert their own orders"
    ON public.orders FOR INSERT
    TO authenticated
    WITH CHECK (
        buyer_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'buyer'
        )
    );

-- Farmers can advance order status for orders assigned to them
CREATE POLICY "Farmers can update status of their orders"
    ON public.orders FOR UPDATE
    TO authenticated
    USING (farmer_id = auth.uid())
    WITH CHECK (farmer_id = auth.uid());
