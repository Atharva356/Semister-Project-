-- ==============================================================================
-- AgriMandi - Demo Produce Seed Script
-- ==============================================================================
-- Use this script to populate sample produce listings.
-- It links all sample produce to the first available registered 'farmer' user in profiles.
-- If you want to associate listings with a specific farmer, replace v_farmer_id with their UUID.
-- ==============================================================================

DO $$
DECLARE
    v_farmer_id UUID;
    v_farmer_name TEXT;
BEGIN
    SELECT id, COALESCE(full_name, 'Verified Grower') 
    INTO v_farmer_id, v_farmer_name 
    FROM public.profiles 
    WHERE role = 'farmer' 
    LIMIT 1;

    IF v_farmer_id IS NULL THEN
        RAISE NOTICE 'No farmer account found in profiles. Please register a farmer user first, then re-run seed.sql.';
    ELSE
        INSERT INTO public.produce (
            id, name, category, quantity, unit, price, location, farmer_name, image, date_added, farmer_id
        )
        VALUES
            ('prod-1', 'Sharbati Wheat', 'Grains', 50, 'Quintal', 3200, 'Sehore, Madhya Pradesh', 'Rameshwar Patel', 'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?auto=format&fit=crop&w=600&q=80', '2026-09-08', v_farmer_id),
            ('prod-2', 'Organic Red Hybrid Tomatoes', 'Vegetables', 250, 'Kg', 28, 'Nashik, Maharashtra', 'Sanjay Deshmukh', 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&w=600&q=80', '2026-09-09', v_farmer_id),
            ('prod-3', 'Royal Delicious Shimla Apples', 'Fruits', 120, 'Crates', 1450, 'Shimla, Himachal Pradesh', 'Baldev Chauhan', 'https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?auto=format&fit=crop&w=600&q=80', '2026-09-07', v_farmer_id),
            ('prod-4', 'Kolar Fresh Red Onions', 'Vegetables', 400, 'Kg', 34, 'Kolar, Karnataka', 'Narayana Gowda', 'https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?auto=format&fit=crop&w=600&q=80', '2026-09-09', v_farmer_id),
            ('prod-5', 'Traditional Basmati Rice (Pusa 1121)', 'Grains', 35, 'Quintal', 4600, 'Karnal, Haryana', 'Gurpreet Singh', 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=600&q=80', '2026-09-06', v_farmer_id)
        ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            category = EXCLUDED.category,
            quantity = EXCLUDED.quantity,
            unit = EXCLUDED.unit,
            price = EXCLUDED.price,
            location = EXCLUDED.location,
            farmer_name = EXCLUDED.farmer_name,
            image = EXCLUDED.image,
            farmer_id = EXCLUDED.farmer_id;
            
        RAISE NOTICE 'Successfully seeded 5 demo produce listings for farmer ID: %', v_farmer_id;
    END IF;
END $$;
