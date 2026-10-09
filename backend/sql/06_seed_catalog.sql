-- ==============================================================================
-- AgriMandi Database - Step 06: Optional Seed Produce Catalogue
-- ==============================================================================
-- Run this script sixth in Supabase SQL Editor AFTER creating your first farmer account.
-- Automatically associates seed crops with the first registered farmer in public.profiles.
-- ==============================================================================

DO $$
DECLARE
    v_farmer_id UUID;
    v_farmer_name TEXT;
BEGIN
    -- Locate the first registered farmer
    SELECT id, full_name INTO v_farmer_id, v_farmer_name
    FROM public.profiles
    WHERE role = 'farmer'
    LIMIT 1;

    IF v_farmer_id IS NOT NULL THEN
        INSERT INTO public.produce (
            id, name, category, quantity, unit, price, location, farmer_name, image, date_added, farmer_id
        )
        VALUES
            ('prod-1', 'Sharbati Wheat (Grade A)', 'Grains', 50, 'Quintal', 3200, 'Sehore, Madhya Pradesh', COALESCE(v_farmer_name, 'Rameshwar Patel'), 'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?auto=format&fit=crop&w=600&q=80', CURRENT_DATE, v_farmer_id),
            ('prod-2', 'Organic Red Hybrid Tomatoes', 'Vegetables', 250, 'Kg', 28, 'Nashik, Maharashtra', COALESCE(v_farmer_name, 'Sanjay Deshmukh'), 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&w=600&q=80', CURRENT_DATE, v_farmer_id),
            ('prod-3', 'Royal Delicious Shimla Apples', 'Fruits', 120, 'Crates', 1450, 'Shimla, Himachal Pradesh', COALESCE(v_farmer_name, 'Baldev Chauhan'), 'https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?auto=format&fit=crop&w=600&q=80', CURRENT_DATE, v_farmer_id),
            ('prod-4', 'Kolar Fresh Red Onions', 'Vegetables', 400, 'Kg', 34, 'Kolar, Karnataka', COALESCE(v_farmer_name, 'Narayana Gowda'), 'https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?auto=format&fit=crop&w=600&q=80', CURRENT_DATE, v_farmer_id),
            ('prod-5', 'Traditional Basmati Rice (Pusa 1121)', 'Grains', 35, 'Quintal', 4600, 'Karnal, Haryana', COALESCE(v_farmer_name, 'Gurpreet Singh'), 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=600&q=80', CURRENT_DATE, v_farmer_id)
        ON CONFLICT (id) DO UPDATE SET
            farmer_id = EXCLUDED.farmer_id,
            farmer_name = EXCLUDED.farmer_name;

        RAISE NOTICE 'Seed produce catalogue successfully inserted for farmer ID: %', v_farmer_id;
    ELSE
        RAISE NOTICE 'No farmer account found in public.profiles. Create a farmer account first before running seed script.';
    END IF;
END $$;
