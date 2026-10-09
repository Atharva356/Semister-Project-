-- ==============================================================================
-- AgriMandi Database - Step 03: Atomic RPC Functions
-- ==============================================================================
-- Run this script third in Supabase SQL Editor.
-- Provides transactionally isolated stored procedures:
-- 1. place_order: Atomically creates purchase order and decrements crop inventory
-- 2. cancel_order: Atomically cancels order and restores crop inventory
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. ATOMIC ORDER PLACEMENT
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
        RAISE EXCEPTION 'Not authorized. You must be authenticated to place an order.';
    END IF;

    -- Verify caller has buyer role
    SELECT role INTO v_buyer_role FROM public.profiles WHERE id = v_buyer_id;
    IF v_buyer_role IS NULL OR v_buyer_role != 'buyer' THEN
        RAISE EXCEPTION 'User must have a registered buyer profile to place an order.';
    END IF;

    IF p_quantity <= 0 THEN
        RAISE EXCEPTION 'Order quantity must be greater than zero.';
    END IF;

    -- Lock produce row FOR UPDATE to prevent race conditions & inventory overselling
    SELECT * INTO v_produce
    FROM public.produce
    WHERE id = p_produce_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Produce listing with ID % not found.', p_produce_id;
    END IF;

    -- Stock sufficiency check
    IF v_produce.quantity < p_quantity THEN
        RAISE EXCEPTION 'Insufficient stock. Available: %, Requested: %', v_produce.quantity, p_quantity;
    END IF;

    -- Calculate total price strictly from database unit price
    v_computed_total := ROUND(v_produce.price * p_quantity, 2);

    -- Decrement inventory volume
    UPDATE public.produce
    SET quantity = quantity - p_quantity
    WHERE id = p_produce_id;

    -- Generate order reference code
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
-- 2. ATOMIC ORDER CANCELLATION & INVENTORY RESTORATION
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.cancel_order(TEXT);

CREATE OR REPLACE FUNCTION public.cancel_order(p_order_id TEXT)
RETURNS public.orders AS $$
DECLARE
    v_order public.orders%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authorized. You must be authenticated to cancel an order.';
    END IF;

    -- Lock the target order row FOR UPDATE
    SELECT * INTO v_order
    FROM public.orders
    WHERE order_id = p_order_id OR id::TEXT = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found: %', p_order_id;
    END IF;

    -- Idempotency / state validation
    IF v_order.status = 'Cancelled' THEN
        RAISE EXCEPTION 'Order is already Cancelled.';
    END IF;
    IF v_order.status = 'Delivered' THEN
        RAISE EXCEPTION 'Cannot cancel an order that has already been Delivered.';
    END IF;

    -- Check authorization
    -- Buyer may only cancel if status is 'Pending'
    -- Farmer may cancel if status is 'Pending' or 'Confirmed'
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

    -- Restore stock volume back to produce listing
    IF v_order.produce_id IS NOT NULL THEN
        UPDATE public.produce
        SET quantity = quantity + v_order.quantity
        WHERE id = v_order.produce_id;
    END IF;

    -- Set session flag so trigger allows status change to 'Cancelled'
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
