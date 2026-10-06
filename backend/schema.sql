-- ==============================================================================
-- AgriMandi - Supabase Database Schema & Policies (Version 2.0)
-- ==============================================================================
-- Idempotent schema definition for user profiles, crop listings, and purchase orders.
-- Designed for PostgreSQL on Supabase with strict Row Level Security (RLS).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. PROFILES TABLE (Extends auth.users)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    role TEXT NOT NULL CHECK (role IN ('farmer', 'buyer')) DEFAULT 'buyer',
    phone TEXT,
    location TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Trigger: Automatically create profile on new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    user_role TEXT;
BEGIN
    user_role := COALESCE(NEW.raw_user_meta_data->>'role', 'buyer');
    -- Enforce strict role: must be 'farmer' or 'buyer'
    IF user_role NOT IN ('farmer', 'buyer') THEN
        RAISE EXCEPTION 'Invalid role: %. Role must be either farmer or buyer.', user_role;
    END IF;

    INSERT INTO public.profiles (id, email, full_name, role, location)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        user_role,
        COALESCE(NEW.raw_user_meta_data->>'location', 'India')
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        location = EXCLUDED.location,
        updated_at = NOW();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger: Prevent users from updating their own role column
CREATE OR REPLACE FUNCTION public.prevent_profile_role_update()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
        RAISE EXCEPTION 'Modifying the profile role is not permitted.';
    END IF;
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.prevent_profile_role_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_prevent_profile_role_update ON public.profiles;
CREATE TRIGGER trg_prevent_profile_role_update
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_role_update();

-- Profiles RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Public profiles are viewable by everyone"
    ON public.profiles FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);


-- ------------------------------------------------------------------------------
-- 2. PRODUCE TABLE (Farmer Crop Listings)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.produce (
    id TEXT PRIMARY KEY DEFAULT ('prod-' || FLOOR(EXTRACT(EPOCH FROM NOW()) * 1000)::TEXT),
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('Vegetables', 'Fruits', 'Grains', 'Pulses', 'Spices')),
    quantity NUMERIC NOT NULL CHECK (quantity > 0),
    unit TEXT NOT NULL DEFAULT 'Kg' CHECK (unit IN ('Kg', 'Quintal', 'Crates', 'Ton')),
    price NUMERIC NOT NULL CHECK (price > 0),
    location TEXT NOT NULL,
    farmer_name TEXT NOT NULL,
    image TEXT,
    date_added DATE DEFAULT CURRENT_DATE,
    farmer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Indexes on foreign keys and search columns
CREATE INDEX IF NOT EXISTS idx_produce_farmer_id ON public.produce(farmer_id);
CREATE INDEX IF NOT EXISTS idx_produce_category ON public.produce(category);
CREATE INDEX IF NOT EXISTS idx_produce_location ON public.produce(location);
CREATE INDEX IF NOT EXISTS idx_produce_created_at ON public.produce(created_at DESC);

-- Produce RLS Policies
ALTER TABLE public.produce ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view produce listings" ON public.produce;
DROP POLICY IF EXISTS "Authenticated users can create produce listings" ON public.produce;
DROP POLICY IF EXISTS "Farmers can update produce listings" ON public.produce;
DROP POLICY IF EXISTS "Farmers can delete produce listings" ON public.produce;
DROP POLICY IF EXISTS "Public produce listings viewable by all" ON public.produce;
DROP POLICY IF EXISTS "Farmers can insert their own produce" ON public.produce;
DROP POLICY IF EXISTS "Farmers can update their own produce" ON public.produce;
DROP POLICY IF EXISTS "Farmers can delete their own produce" ON public.produce;

-- produce: SELECT public
CREATE POLICY "Public produce listings viewable by all"
    ON public.produce FOR SELECT
    USING (true);

-- INSERT only if authenticated AND profile role = 'farmer' AND farmer_id = auth.uid()
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

-- UPDATE only where farmer_id = auth.uid()
CREATE POLICY "Farmers can update their own produce"
    ON public.produce FOR UPDATE
    TO authenticated
    USING (farmer_id = auth.uid())
    WITH CHECK (farmer_id = auth.uid());

-- DELETE only where farmer_id = auth.uid()
CREATE POLICY "Farmers can delete their own produce"
    ON public.produce FOR DELETE
    TO authenticated
    USING (farmer_id = auth.uid());


-- ------------------------------------------------------------------------------
-- 3. ORDERS TABLE (Purchase & Delivery Transactions)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id TEXT UNIQUE NOT NULL,
    order_date TEXT NOT NULL,
    produce_id TEXT REFERENCES public.produce(id) ON DELETE SET NULL,
    produce_name TEXT NOT NULL,
    category TEXT,
    quantity NUMERIC NOT NULL CHECK (quantity > 0),
    unit TEXT NOT NULL DEFAULT 'Kg',
    unit_price NUMERIC NOT NULL CHECK (unit_price > 0),
    total_price NUMERIC NOT NULL CHECK (total_price > 0 AND total_price = ROUND(quantity * unit_price, 2)),
    farmer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    farmer_name TEXT NOT NULL,
    farmer_location TEXT,
    buyer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    buyer_name TEXT NOT NULL,
    buyer_email TEXT NOT NULL,
    delivery_address TEXT NOT NULL,
    estimated_delivery TEXT DEFAULT '3-5 Business Days',
    status TEXT DEFAULT 'Confirmed' CHECK (status IN ('Pending', 'Confirmed', 'Dispatched', 'Delivered', 'Cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Foreign key indexes
CREATE INDEX IF NOT EXISTS idx_orders_produce_id ON public.orders(produce_id);
CREATE INDEX IF NOT EXISTS idx_orders_farmer_id ON public.orders(farmer_id);
CREATE INDEX IF NOT EXISTS idx_orders_buyer_id ON public.orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_orders_order_id ON public.orders(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);

-- Trigger: Enforce order update business rules (only status can change, status transition rules)
CREATE OR REPLACE FUNCTION public.check_order_update()
RETURNS TRIGGER AS $$
BEGIN
    -- Prevent modification of immutable order fields
    IF NEW.id != OLD.id OR NEW.order_id != OLD.order_id OR NEW.produce_id IS DISTINCT FROM OLD.produce_id
       OR NEW.quantity != OLD.quantity OR NEW.unit_price != OLD.unit_price OR NEW.total_price != OLD.total_price
       OR NEW.farmer_id != OLD.farmer_id OR NEW.buyer_id != OLD.buyer_id THEN
        RAISE EXCEPTION 'Only order status can be updated.';
    END IF;

    -- If status hasn't changed, allow
    IF NEW.status = OLD.status THEN
        RETURN NEW;
    END IF;

    -- Cancellation rule: only allowed via cancel_order function
    IF NEW.status = 'Cancelled' THEN
        IF current_setting('agrimandi.in_cancel_order', true) IS DISTINCT FROM 'on' THEN
            RAISE EXCEPTION 'Direct cancellation is not permitted. Orders must be cancelled via cancel_order.';
        END IF;
        RETURN NEW;
    END IF;

    -- Status transition rules: Pending -> Confirmed -> Dispatched -> Delivered
    IF (OLD.status = 'Pending' AND NEW.status = 'Confirmed')
       OR (OLD.status = 'Confirmed' AND NEW.status = 'Dispatched')
       OR (OLD.status = 'Dispatched' AND NEW.status = 'Delivered') THEN
        IF auth.uid() IS NOT NULL AND auth.uid() != OLD.farmer_id THEN
            RAISE EXCEPTION 'Only the assigned farmer can advance order status.';
        END IF;
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Invalid status transition from % to %.', OLD.status, NEW.status;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.check_order_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_check_order_update ON public.orders;
CREATE TRIGGER trg_check_order_update
    BEFORE UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.check_order_update();

-- Orders RLS Policies
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can create purchase orders" ON public.orders;
DROP POLICY IF EXISTS "Users can view their orders" ON public.orders;
DROP POLICY IF EXISTS "Authorized users can update order status" ON public.orders;
DROP POLICY IF EXISTS "Orders viewable by buyer or farmer" ON public.orders;
DROP POLICY IF EXISTS "Buyers can insert their own orders" ON public.orders;
DROP POLICY IF EXISTS "Farmers can update status of their orders" ON public.orders;
DROP POLICY IF EXISTS "Buyers can cancel their own pending orders" ON public.orders;

-- SELECT: Only buyer or farmer of that order
CREATE POLICY "Orders viewable by buyer or farmer"
    ON public.orders FOR SELECT
    TO authenticated
    USING (
        buyer_id = auth.uid() OR farmer_id = auth.uid()
    );

-- INSERT: Only authenticated buyer creating order for themselves
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

-- UPDATE: Farmer can update status of their orders (Pending -> Confirmed -> Dispatched -> Delivered)
-- Note: Cancellation must go through cancel_order() SECURITY DEFINER function.
CREATE POLICY "Farmers can update status of their orders"
    ON public.orders FOR UPDATE
    TO authenticated
    USING (farmer_id = auth.uid())
    WITH CHECK (farmer_id = auth.uid());


-- ------------------------------------------------------------------------------
-- 4. POSTGRES ATOMIC ORDER PLACEMENT FUNCTION
-- ------------------------------------------------------------------------------
-- Executes order creation and inventory decrement in ONE transaction.
-- Locks produce row with FOR UPDATE to prevent race conditions & stock overselling.
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.place_order(TEXT, NUMERIC, UUID, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.place_order(TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.place_order(
    p_produce_id TEXT,
    p_quantity NUMERIC,
    p_buyer_name TEXT,
    p_buyer_email TEXT,
    p_delivery_address TEXT,
    p_order_id TEXT DEFAULT NULL,
    p_estimated_delivery TEXT DEFAULT '3-5 Business Days'
)
RETURNS public.orders AS $$
DECLARE
    v_buyer_id UUID := auth.uid();
    v_produce public.produce%ROWTYPE;
    v_computed_total NUMERIC;
    v_order_id TEXT;
    v_order_date TEXT;
    v_order public.orders%ROWTYPE;
    v_buyer_role TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    -- Verify buyer exists and has 'buyer' role
    SELECT role INTO v_buyer_role FROM public.profiles WHERE id = v_buyer_id;
    IF v_buyer_role IS NULL OR v_buyer_role != 'buyer' THEN
        RAISE EXCEPTION 'User must have a registered buyer profile to place an order.';
    END IF;

    IF p_quantity <= 0 THEN
        RAISE EXCEPTION 'Order quantity must be greater than zero.';
    END IF;

    -- Lock produce row for update to guarantee concurrency safety
    SELECT * INTO v_produce
    FROM public.produce
    WHERE id = p_produce_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Produce item with ID % not found.', p_produce_id;
    END IF;

    -- Verify stock
    IF v_produce.quantity < p_quantity THEN
        RAISE EXCEPTION 'Insufficient stock. Available: %, Requested: %', v_produce.quantity, p_quantity;
    END IF;

    -- Calculate total price strictly from database unit price
    v_computed_total := ROUND(v_produce.price * p_quantity, 2);

    -- Decrement stock volume
    UPDATE public.produce
    SET quantity = quantity - p_quantity
    WHERE id = p_produce_id;

    -- Prepare order identifiers
    v_order_id := COALESCE(p_order_id, 'AGRI-' || UPPER(SUBSTRING(gen_random_uuid()::TEXT, 1, 6)));
    v_order_date := TO_CHAR(NOW(), 'DD Mon YYYY');

    -- Insert order record
    INSERT INTO public.orders (
        order_id,
        order_date,
        produce_id,
        produce_name,
        category,
        quantity,
        unit,
        unit_price,
        total_price,
        farmer_id,
        farmer_name,
        farmer_location,
        buyer_id,
        buyer_name,
        buyer_email,
        delivery_address,
        estimated_delivery,
        status
    )
    VALUES (
        v_order_id,
        v_order_date,
        v_produce.id,
        v_produce.name,
        v_produce.category,
        p_quantity,
        v_produce.unit,
        v_produce.price,
        v_computed_total,
        v_produce.farmer_id,
        v_produce.farmer_name,
        v_produce.location,
        v_buyer_id,
        p_buyer_name,
        p_buyer_email,
        p_delivery_address,
        p_estimated_delivery,
        'Confirmed'
    )
    RETURNING * INTO v_order;

    RETURN v_order;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.place_order(TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.place_order(TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;


-- ------------------------------------------------------------------------------
-- 5. POSTGRES ATOMIC ORDER CANCELLATION FUNCTION
-- ------------------------------------------------------------------------------
-- Cancels order and restores produce quantity in ONE atomic transaction.
-- Locks order row FOR UPDATE.
-- Verifies caller is buyer (for Pending orders) or farmer (for Pending/Confirmed orders).
-- No-op error if already Cancelled or Delivered.
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.cancel_order(TEXT);

CREATE OR REPLACE FUNCTION public.cancel_order(p_order_id TEXT)
RETURNS public.orders AS $$
DECLARE
    v_order public.orders%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    -- Lock the order row FOR UPDATE
    SELECT * INTO v_order
    FROM public.orders
    WHERE order_id = p_order_id OR id::TEXT = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found: %', p_order_id;
    END IF;

    -- Make it a no-op error if already Cancelled/Delivered
    IF v_order.status = 'Cancelled' THEN
        RAISE EXCEPTION 'Order is already Cancelled.';
    END IF;
    IF v_order.status = 'Delivered' THEN
        RAISE EXCEPTION 'Cannot cancel an order that has already been Delivered.';
    END IF;

    -- Verify auth.uid() is the order's buyer (only if status is Pending) or its farmer (if status is Pending/Confirmed)
    IF auth.uid() = v_order.buyer_id THEN
        IF v_order.status != 'Pending' THEN
            RAISE EXCEPTION 'Buyers can only cancel orders in Pending status.';
        END IF;
    ELSIF auth.uid() = v_order.farmer_id THEN
        IF v_order.status NOT IN ('Pending', 'Confirmed') THEN
            RAISE EXCEPTION 'Farmers can only cancel orders in Pending or Confirmed status.';
        END IF;
    ELSE
        RAISE EXCEPTION 'Not authorized to cancel this order.';
    END IF;

    -- Add the quantity back to produce.quantity
    IF v_order.produce_id IS NOT NULL THEN
        UPDATE public.produce
        SET quantity = quantity + v_order.quantity
        WHERE id = v_order.produce_id;
    END IF;

    -- Signal trigger that this cancellation comes through cancel_order
    PERFORM set_config('agrimandi.in_cancel_order', 'on', true);

    -- Update order status to Cancelled
    UPDATE public.orders
    SET status = 'Cancelled'
    WHERE id = v_order.id
    RETURNING * INTO v_order;

    RETURN v_order;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.cancel_order(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_order(TEXT) TO authenticated;


-- ------------------------------------------------------------------------------
-- 6. CONDITIONAL SEED PRODUCE DATA
-- ------------------------------------------------------------------------------
-- Seeds initial catalogue items only if at least one farmer user exists in profiles.
-- Prevents foreign key constraint violations on clean installations.
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_farmer_id UUID;
BEGIN
    SELECT id INTO v_farmer_id FROM public.profiles WHERE role = 'farmer' LIMIT 1;
    IF v_farmer_id IS NOT NULL THEN
        INSERT INTO public.produce (
            id, name, category, quantity, unit, price, location, farmer_name, image, date_added, farmer_id
        )
        VALUES
            ('prod-1', 'Sharbati Wheat', 'Grains', 50, 'Quintal', 3200, 'Sehore, Madhya Pradesh', 'Rameshwar Patel', 'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?auto=format&fit=crop&w=600&q=80', '2026-09-08', v_farmer_id),
            ('prod-2', 'Organic Red Hybrid Tomatoes', 'Vegetables', 250, 'Kg', 28, 'Nashik, Maharashtra', 'Sanjay Deshmukh', 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&w=600&q=80', '2026-09-09', v_farmer_id),
            ('prod-3', 'Royal Delicious Shimla Apples', 'Fruits', 120, 'Crates', 1450, 'Shimla, Himachal Pradesh', 'Baldev Chauhan', 'https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?auto=format&fit=crop&w=600&q=80', '2026-09-07', v_farmer_id),
            ('prod-4', 'Kolar Fresh Red Onions', 'Vegetables', 400, 'Kg', 34, 'Kolar, Karnataka', 'Narayana Gowda', 'https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?auto=format&fit=crop&w=600&q=80', '2026-09-09', v_farmer_id),
            ('prod-5', 'Traditional Basmati Rice (Pusa 1121)', 'Grains', 35, 'Quintal', 4600, 'Karnal, Haryana', 'Gurpreet Singh', 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=600&q=80', '2026-09-06', v_farmer_id)
        ON CONFLICT (id) DO NOTHING;
    END IF;
END $$;
