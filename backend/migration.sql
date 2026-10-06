-- ==============================================================================
-- AgriMandi - Database Migration Script (v1 -> v2)
-- ==============================================================================
-- Run this in the Supabase SQL Editor if you already have v1 tables created.
-- Safely renames camelCase columns to lowercase snake_case, adds required foreign keys,
-- updates indexes, creates place_order function, and establishes strict RLS policies.
-- ==============================================================================

BEGIN;

-- 1. PROFILES UPDATES
ALTER TABLE IF EXISTS public.profiles 
    ALTER COLUMN role SET NOT NULL,
    ALTER COLUMN role SET DEFAULT 'buyer';

-- Trigger: Enforce role immutability
CREATE OR REPLACE FUNCTION public.prevent_profile_role_update()
RETURNS TRIGGER AS $$
BEGIN
    -- Allow role changes when auth.uid() IS NULL (service role / dashboard / migrations)
    IF NEW.role IS DISTINCT FROM OLD.role THEN
        IF auth.uid() IS NOT NULL THEN
            RAISE EXCEPTION 'Modifying the profile role is not permitted.';
        END IF;
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


-- 2. PRODUCE TABLE MIGRATION
-- Safely rename camelCase columns if they exist
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'produce' AND column_name = 'farmerName'
    ) THEN
        ALTER TABLE public.produce RENAME COLUMN "farmerName" TO farmer_name;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'produce' AND column_name = 'dateAdded'
    ) THEN
        ALTER TABLE public.produce RENAME COLUMN "dateAdded" TO date_added;
    END IF;
END $$;

-- If existing produce records have null farmer_id, assign to first farmer profile or fallback
DO $$
DECLARE
    v_first_farmer UUID;
BEGIN
    SELECT id INTO v_first_farmer FROM public.profiles WHERE role = 'farmer' LIMIT 1;
    IF v_first_farmer IS NOT NULL THEN
        UPDATE public.produce SET farmer_id = v_first_farmer WHERE farmer_id IS NULL;
    END IF;
END $$;

-- Add foreign key constraint and NOT NULL on farmer_id if safe
DO $$
BEGIN
    -- Only set NOT NULL if all rows have farmer_id
    IF NOT EXISTS (SELECT 1 FROM public.produce WHERE farmer_id IS NULL) THEN
        ALTER TABLE public.produce ALTER COLUMN farmer_id SET NOT NULL;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Skipping farmer_id NOT NULL constraint until all produce rows have a valid farmer_id';
END $$;

-- Indexes for produce
CREATE INDEX IF NOT EXISTS idx_produce_farmer_id ON public.produce(farmer_id);
CREATE INDEX IF NOT EXISTS idx_produce_category ON public.produce(category);
CREATE INDEX IF NOT EXISTS idx_produce_location ON public.produce(location);
CREATE INDEX IF NOT EXISTS idx_produce_created_at ON public.produce(created_at DESC);


-- 3. ORDERS TABLE MIGRATION
-- Rename camelCase columns to snake_case if they exist
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orders' AND column_name='orderId') THEN
        ALTER TABLE public.orders RENAME COLUMN "orderId" TO order_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orders' AND column_name='orderDate') THEN
        ALTER TABLE public.orders RENAME COLUMN "orderDate" TO order_date;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orders' AND column_name='produceName') THEN
        ALTER TABLE public.orders RENAME COLUMN "produceName" TO produce_name;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orders' AND column_name='unitPrice') THEN
        ALTER TABLE public.orders RENAME COLUMN "unitPrice" TO unit_price;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orders' AND column_name='totalPrice') THEN
        ALTER TABLE public.orders RENAME COLUMN "totalPrice" TO total_price;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orders' AND column_name='farmerName') THEN
        ALTER TABLE public.orders RENAME COLUMN "farmerName" TO farmer_name;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orders' AND column_name='farmerLocation') THEN
        ALTER TABLE public.orders RENAME COLUMN "farmerLocation" TO farmer_location;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orders' AND column_name='buyerName') THEN
        ALTER TABLE public.orders RENAME COLUMN "buyerName" TO buyer_name;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orders' AND column_name='buyerEmail') THEN
        ALTER TABLE public.orders RENAME COLUMN "buyerEmail" TO buyer_email;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orders' AND column_name='deliveryAddress') THEN
        ALTER TABLE public.orders RENAME COLUMN "deliveryAddress" TO delivery_address;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orders' AND column_name='estimatedDelivery') THEN
        ALTER TABLE public.orders RENAME COLUMN "estimatedDelivery" TO estimated_delivery;
    END IF;
END $$;

-- Add produce_id and farmer_id columns to orders if not existing
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orders' AND column_name='produce_id') THEN
        ALTER TABLE public.orders ADD COLUMN produce_id TEXT REFERENCES public.produce(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orders' AND column_name='farmer_id') THEN
        ALTER TABLE public.orders ADD COLUMN farmer_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Backfill orders farmer_id from produce table where available
UPDATE public.orders o
SET farmer_id = p.farmer_id
FROM public.produce p
WHERE o.produce_id = p.id AND o.farmer_id IS NULL AND p.farmer_id IS NOT NULL;

-- Indexes for orders foreign keys
CREATE INDEX IF NOT EXISTS idx_orders_produce_id ON public.orders(produce_id);
CREATE INDEX IF NOT EXISTS idx_orders_farmer_id ON public.orders(farmer_id);
CREATE INDEX IF NOT EXISTS idx_orders_buyer_id ON public.orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_orders_order_id ON public.orders(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);


-- 4. FUNCTION & TRIGGER UPDATES
CREATE OR REPLACE FUNCTION public.check_order_update()
RETURNS TRIGGER AS $$
BEGIN
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

-- Atomic place_order function
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

    SELECT role INTO v_buyer_role FROM public.profiles WHERE id = v_buyer_id;
    IF v_buyer_role IS NULL OR v_buyer_role != 'buyer' THEN
        RAISE EXCEPTION 'User must have a registered buyer profile to place an order.';
    END IF;

    IF p_quantity <= 0 THEN
        RAISE EXCEPTION 'Order quantity must be greater than zero.';
    END IF;

    SELECT * INTO v_produce
    FROM public.produce
    WHERE id = p_produce_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Produce item with ID % not found.', p_produce_id;
    END IF;

    IF v_produce.quantity < p_quantity THEN
        RAISE EXCEPTION 'Insufficient stock. Available: %, Requested: %', v_produce.quantity, p_quantity;
    END IF;

    v_computed_total := ROUND(v_produce.price * p_quantity, 2);

    UPDATE public.produce
    SET quantity = quantity - p_quantity
    WHERE id = p_produce_id;

    v_order_id := COALESCE(p_order_id, 'AGRI-' || UPPER(SUBSTRING(gen_random_uuid()::TEXT, 1, 6)));
    v_order_date := TO_CHAR(NOW(), 'DD Mon YYYY');

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

-- Atomic cancel_order function
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


-- 5. ROW LEVEL SECURITY POLICIES RESET
-- Reset Profiles policies
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Reset Produce policies
ALTER TABLE public.produce ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view produce listings" ON public.produce;
DROP POLICY IF EXISTS "Authenticated users can create produce listings" ON public.produce;
DROP POLICY IF EXISTS "Farmers can update produce listings" ON public.produce;
DROP POLICY IF EXISTS "Farmers can delete produce listings" ON public.produce;
DROP POLICY IF EXISTS "Public produce listings viewable by all" ON public.produce;
DROP POLICY IF EXISTS "Farmers can insert their own produce" ON public.produce;
DROP POLICY IF EXISTS "Farmers can update their own produce" ON public.produce;
DROP POLICY IF EXISTS "Farmers can delete their own produce" ON public.produce;

CREATE POLICY "Public produce listings viewable by all"
    ON public.produce FOR SELECT
    USING (true);

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

CREATE POLICY "Farmers can update their own produce"
    ON public.produce FOR UPDATE
    TO authenticated
    USING (farmer_id = auth.uid())
    WITH CHECK (farmer_id = auth.uid());

CREATE POLICY "Farmers can delete their own produce"
    ON public.produce FOR DELETE
    TO authenticated
    USING (farmer_id = auth.uid());

-- Reset Orders policies
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can create purchase orders" ON public.orders;
DROP POLICY IF EXISTS "Users can view their orders" ON public.orders;
DROP POLICY IF EXISTS "Authorized users can update order status" ON public.orders;
DROP POLICY IF EXISTS "Orders viewable by buyer or farmer" ON public.orders;
DROP POLICY IF EXISTS "Buyers can insert their own orders" ON public.orders;
DROP POLICY IF EXISTS "Farmers can update status of their orders" ON public.orders;
DROP POLICY IF EXISTS "Buyers can cancel their own pending orders" ON public.orders;

CREATE POLICY "Orders viewable by buyer or farmer"
    ON public.orders FOR SELECT
    TO authenticated
    USING (
        buyer_id = auth.uid() OR farmer_id = auth.uid()
    );

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

CREATE POLICY "Farmers can update status of their orders"
    ON public.orders FOR UPDATE
    TO authenticated
    USING (farmer_id = auth.uid())
    WITH CHECK (farmer_id = auth.uid());

DROP POLICY IF EXISTS "Buyers can cancel their own pending orders" ON public.orders;

COMMIT;
