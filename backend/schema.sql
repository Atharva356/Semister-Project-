-- ==============================================================================
-- AgriMandi - Supabase Database Schema & Policies
-- ==============================================================================
-- Run this script in the Supabase SQL Editor (Dashboard -> SQL Editor -> New Query)
--
-- Notice:
-- Supabase automatically manages user authentication via the `auth.users` table.
-- This schema establishes tables for user profiles, crop listings (produce), and
-- purchase orders, complete with Row Level Security (RLS) policies.
-- ==============================================================================

-- 1. PROFILES TABLE (Extensions to Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    role TEXT CHECK (role IN ('farmer', 'buyer')) DEFAULT 'buyer',
    phone TEXT,
    location TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Automatic Profile Creation Trigger on Auth Signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, role, location)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        COALESCE(NEW.raw_user_meta_data->>'role', 'buyer'),
        COALESCE(NEW.raw_user_meta_data->>'location', 'India')
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public profiles are viewable by everyone" 
    ON public.profiles FOR SELECT 
    USING (true);

CREATE POLICY "Users can update their own profile" 
    ON public.profiles FOR UPDATE 
    USING (auth.uid() = id);


-- ==============================================================================
-- 2. PRODUCE TABLE (Farmer Crop Listings)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.produce (
    id TEXT PRIMARY KEY DEFAULT ('prod-' || FLOOR(EXTRACT(EPOCH FROM NOW()) * 1000)::TEXT),
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('Vegetables', 'Fruits', 'Grains', 'Pulses', 'Spices')),
    quantity NUMERIC NOT NULL CHECK (quantity > 0),
    unit TEXT NOT NULL DEFAULT 'Kg',
    price NUMERIC NOT NULL CHECK (price > 0),
    location TEXT NOT NULL,
    "farmerName" TEXT NOT NULL,
    image TEXT,
    "dateAdded" DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    farmer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Indexes for lightning fast searching and filtering
CREATE INDEX IF NOT EXISTS idx_produce_category ON public.produce(category);
CREATE INDEX IF NOT EXISTS idx_produce_location ON public.produce(location);
CREATE INDEX IF NOT EXISTS idx_produce_created_at ON public.produce(created_at DESC);

-- Enable RLS on produce
ALTER TABLE public.produce ENABLE ROW LEVEL SECURITY;

-- Allow everyone (including guests & buyers) to browse produce
CREATE POLICY "Anyone can view produce listings" 
    ON public.produce FOR SELECT 
    USING (true);

-- Allow authenticated users or API to insert produce listings
CREATE POLICY "Authenticated users can create produce listings" 
    ON public.produce FOR INSERT 
    WITH CHECK (true);

-- Allow farmers to edit their produce listings
CREATE POLICY "Farmers can update produce listings" 
    ON public.produce FOR UPDATE 
    USING (true);

-- Allow farmers to delete their produce listings
CREATE POLICY "Farmers can delete produce listings" 
    ON public.produce FOR DELETE 
    USING (true);


-- ==============================================================================
-- 3. ORDERS TABLE (Purchase & Delivery Transactions)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "orderId" TEXT UNIQUE NOT NULL,
    "orderDate" TEXT NOT NULL,
    "produceName" TEXT NOT NULL,
    category TEXT,
    quantity NUMERIC NOT NULL CHECK (quantity > 0),
    unit TEXT NOT NULL DEFAULT 'Kg',
    "unitPrice" NUMERIC NOT NULL,
    "totalPrice" NUMERIC NOT NULL,
    "farmerName" TEXT NOT NULL,
    "farmerLocation" TEXT,
    "buyerName" TEXT NOT NULL,
    "buyerEmail" TEXT NOT NULL,
    "deliveryAddress" TEXT NOT NULL,
    "estimatedDelivery" TEXT DEFAULT '3-5 Business Days',
    status TEXT DEFAULT 'Confirmed' CHECK (status IN ('Pending', 'Confirmed', 'Dispatched', 'Delivered', 'Cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    buyer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_order_id ON public.orders("orderId");
CREATE INDEX IF NOT EXISTS idx_orders_buyer_email ON public.orders("buyerEmail");
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);

-- Enable RLS on orders
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can create purchase orders" 
    ON public.orders FOR INSERT 
    WITH CHECK (true);

CREATE POLICY "Users can view their orders" 
    ON public.orders FOR SELECT 
    USING (true);

CREATE POLICY "Authorized users can update order status" 
    ON public.orders FOR UPDATE 
    USING (true);


-- ==============================================================================
-- 4. INITIAL SEED PRODUCE DATA
-- ==============================================================================
INSERT INTO public.produce (id, name, category, quantity, unit, price, location, "farmerName", image, "dateAdded")
VALUES
    ('prod-1', 'Sharbati Wheat', 'Grains', 50, 'Quintal', 3200, 'Sehore, Madhya Pradesh', 'Rameshwar Patel', 'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?auto=format&fit=crop&w=600&q=80', '2026-09-08'),
    ('prod-2', 'Organic Red Hybrid Tomatoes', 'Vegetables', 250, 'Kg', 28, 'Nashik, Maharashtra', 'Sanjay Deshmukh', 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&w=600&q=80', '2026-09-09'),
    ('prod-3', 'Royal Delicious Shimla Apples', 'Fruits', 120, 'Crates', 1450, 'Shimla, Himachal Pradesh', 'Baldev Chauhan', 'https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?auto=format&fit=crop&w=600&q=80', '2026-09-07'),
    ('prod-4', 'Kolar Fresh Red Onions', 'Vegetables', 400, 'Kg', 34, 'Kolar, Karnataka', 'Narayana Gowda', 'https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?auto=format&fit=crop&w=600&q=80', '2026-09-09'),
    ('prod-5', 'Traditional Basmati Rice (Pusa 1121)', 'Grains', 35, 'Quintal', 4600, 'Karnal, Haryana', 'Gurpreet Singh', 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=600&q=80', '2026-09-06')
ON CONFLICT (id) DO NOTHING;
