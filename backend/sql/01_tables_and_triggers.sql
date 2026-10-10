-- ==============================================================================
-- AgriMandi Database - Step 01: Tables and Triggers
-- ==============================================================================
-- Run this script first in Supabase SQL Editor.
-- Sets up the core relational schema, foreign key constraints, and integrity triggers.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. PROFILES TABLE (Extends Supabase auth.users)
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

-- Trigger Function: Automatically create profile on user registration
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

-- Trigger Function: Prevent non-admin users from changing their own role column
CREATE OR REPLACE FUNCTION public.prevent_profile_role_update()
RETURNS TRIGGER AS $$
BEGIN
    -- Allow role changes when auth.uid() IS NULL (service role / Supabase dashboard / migrations)
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


-- ------------------------------------------------------------------------------
-- 2. PRODUCE TABLE (Farmer Crop Listings)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.produce (
    id TEXT PRIMARY KEY DEFAULT ('prod-' || FLOOR(EXTRACT(EPOCH FROM NOW()) * 1000)::TEXT),
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('Vegetables', 'Fruits', 'Grains', 'Pulses', 'Spices')),
    quantity NUMERIC NOT NULL CHECK (quantity >= 0),
    unit TEXT NOT NULL DEFAULT 'Kg' CHECK (unit IN ('Kg', 'Quintal', 'Crates', 'Ton')),
    price NUMERIC NOT NULL CHECK (price > 0),
    location TEXT NOT NULL,
    farmer_name TEXT NOT NULL,
    image TEXT,
    date_added DATE DEFAULT CURRENT_DATE,
    farmer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);


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

-- Ensure all columns exist even if tables already existed previously from earlier prototype
DO $$
BEGIN
    -- Produce table renames
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='produce' AND column_name='farmerName') THEN
        ALTER TABLE public.produce RENAME COLUMN "farmerName" TO farmer_name;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='produce' AND column_name='farmerId') THEN
        ALTER TABLE public.produce RENAME COLUMN "farmerId" TO farmer_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='produce' AND column_name='dateAdded') THEN
        ALTER TABLE public.produce RENAME COLUMN "dateAdded" TO date_added;
    END IF;

    -- Orders table renames
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orders' AND column_name='orderId') THEN
        ALTER TABLE public.orders RENAME COLUMN "orderId" TO order_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orders' AND column_name='orderDate') THEN
        ALTER TABLE public.orders RENAME COLUMN "orderDate" TO order_date;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orders' AND column_name='produceId') THEN
        ALTER TABLE public.orders RENAME COLUMN "produceId" TO produce_id;
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
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orders' AND column_name='farmerId') THEN
        ALTER TABLE public.orders RENAME COLUMN "farmerId" TO farmer_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orders' AND column_name='farmerName') THEN
        ALTER TABLE public.orders RENAME COLUMN "farmerName" TO farmer_name;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orders' AND column_name='farmerLocation') THEN
        ALTER TABLE public.orders RENAME COLUMN "farmerLocation" TO farmer_location;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orders' AND column_name='buyerId') THEN
        ALTER TABLE public.orders RENAME COLUMN "buyerId" TO buyer_id;
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

-- Guarantee required foreign key and identity columns exist
ALTER TABLE public.produce ADD COLUMN IF NOT EXISTS farmer_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS produce_id TEXT REFERENCES public.produce(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS farmer_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS buyer_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS farmer_name TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS farmer_location TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS buyer_name TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS buyer_email TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_address TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS estimated_delivery TEXT DEFAULT '3-5 Business Days';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Confirmed';

-- Trigger Function: Enforce immutable fields and state transitions on orders
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
