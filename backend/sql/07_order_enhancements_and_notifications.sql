-- ==============================================================================
-- AgriMandi Database - Step 07: Order Fulfillment, Status Tracking & Notifications
-- ==============================================================================
-- Run this script in the Supabase SQL Editor.
-- This script:
-- 1. Adds 'Rejected' status and fulfillment timestamp columns to public.orders
-- 2. Updates default new order status to 'Pending'
-- 3. Updates check_order_update trigger to allow:
--    - 'Rejected' transitions by farmers (with rejection_reason)
--    - 'Delivered' transitions by either the fulfilling farmer or receiving buyer
--    - Automatic timestamp recording on each stage transition
-- 4. Creates an atomic reject_order RPC function with inventory restoration
-- 5. Updates place_order RPC to create orders in 'Pending' status
-- 6. Creates public.notifications table with Row Level Security (RLS)
-- 7. Adds database trigger to automatically push notifications on order state changes
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. ORDERS TABLE ENHANCEMENTS
-- ------------------------------------------------------------------------------

-- Update status check constraint on orders table to include 'Rejected'
DO $$
BEGIN
    ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
    ALTER TABLE public.orders ADD CONSTRAINT orders_status_check
        CHECK (status IN ('Pending', 'Confirmed', 'Dispatched', 'Delivered', 'Cancelled', 'Rejected'));
EXCEPTION
    WHEN OTHERS THEN
        NULL;
END $$;

-- Set default order status for new orders to 'Pending'
ALTER TABLE public.orders ALTER COLUMN status SET DEFAULT 'Pending';

-- Add timestamp tracking and reason columns to orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- ------------------------------------------------------------------------------
-- 2. UPDATE check_order_update TRIGGER FUNCTION
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_order_update()
RETURNS TRIGGER AS $$
BEGIN
    -- Prevent modification of immutable order fields
    IF NEW.id != OLD.id OR NEW.order_id != OLD.order_id OR NEW.produce_id IS DISTINCT FROM OLD.produce_id
       OR NEW.quantity != OLD.quantity OR NEW.unit_price != OLD.unit_price OR NEW.total_price != OLD.total_price
       OR NEW.farmer_id != OLD.farmer_id OR NEW.buyer_id != OLD.buyer_id THEN
        RAISE EXCEPTION 'Only order status, fulfillment timestamps, and rejection details can be updated.';
    END IF;

    -- If status hasn't changed, allow timestamp or reason update
    IF NEW.status = OLD.status THEN
        RETURN NEW;
    END IF;

    -- Direct cancellation rule: only allowed via cancel_order function or service role
    IF NEW.status = 'Cancelled' THEN
        IF current_setting('agrimandi.in_cancel_order', true) IS DISTINCT FROM 'on' AND auth.uid() IS NOT NULL THEN
            RAISE EXCEPTION 'Orders must be cancelled via cancel_order to ensure inventory restoration.';
        END IF;
        NEW.cancelled_at = COALESCE(NEW.cancelled_at, NOW());
        RETURN NEW;
    END IF;

    -- Rejection rule: only allowed via reject_order function or service role
    IF NEW.status = 'Rejected' THEN
        IF current_setting('agrimandi.in_reject_order', true) IS DISTINCT FROM 'on' AND auth.uid() IS NOT NULL THEN
            RAISE EXCEPTION 'Orders must be rejected via reject_order to ensure inventory restoration.';
        END IF;
        NEW.rejected_at = COALESCE(NEW.rejected_at, NOW());
        RETURN NEW;
    END IF;

    -- Farmer confirmation: Pending -> Confirmed
    IF OLD.status = 'Pending' AND NEW.status = 'Confirmed' THEN
        IF auth.uid() IS NOT NULL AND auth.uid() != OLD.farmer_id THEN
            RAISE EXCEPTION 'Only the assigned farmer can accept and confirm this order.';
        END IF;
        NEW.confirmed_at = COALESCE(NEW.confirmed_at, NOW());
        RETURN NEW;
    END IF;

    -- Farmer dispatch: Confirmed -> Dispatched
    IF OLD.status = 'Confirmed' AND NEW.status = 'Dispatched' THEN
        IF auth.uid() IS NOT NULL AND auth.uid() != OLD.farmer_id THEN
            RAISE EXCEPTION 'Only the assigned farmer can dispatch this order.';
        END IF;
        NEW.dispatched_at = COALESCE(NEW.dispatched_at, NOW());
        RETURN NEW;
    END IF;

    -- Delivery completion: Dispatched -> Delivered
    -- Both the fulfilling farmer AND the ordering buyer are allowed to confirm delivery!
    IF OLD.status = 'Dispatched' AND NEW.status = 'Delivered' THEN
        IF auth.uid() IS NOT NULL AND auth.uid() != OLD.farmer_id AND auth.uid() != OLD.buyer_id THEN
            RAISE EXCEPTION 'Only the assigned farmer or buyer can mark the order as delivered.';
        END IF;
        NEW.delivered_at = COALESCE(NEW.delivered_at, NOW());
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Invalid status transition from % to %.', OLD.status, NEW.status;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.check_order_update() FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 3. ATOMIC ORDER REJECTION & INVENTORY RESTORATION RPC
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.reject_order(TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.reject_order(
    p_order_id TEXT,
    p_reason TEXT DEFAULT 'Unable to fulfill at this time'
)
RETURNS public.orders AS $$
DECLARE
    v_order public.orders%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authorized. You must be authenticated to reject an order.';
    END IF;

    -- Lock the target order row FOR UPDATE
    SELECT * INTO v_order
    FROM public.orders
    WHERE order_id = p_order_id OR id::TEXT = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found: %', p_order_id;
    END IF;

    -- Authorization check: only fulfilling farmer can reject
    IF auth.uid() != v_order.farmer_id THEN
        RAISE EXCEPTION 'Only the assigned farmer can reject this order.';
    END IF;

    -- Status validation: only Pending orders can be rejected
    IF v_order.status != 'Pending' THEN
        RAISE EXCEPTION 'Only pending orders can be rejected. Current status: %', v_order.status;
    END IF;

    -- Restore stock volume back to produce listing
    IF v_order.produce_id IS NOT NULL THEN
        UPDATE public.produce
        SET quantity = quantity + v_order.quantity
        WHERE id = v_order.produce_id;
    END IF;

    -- Set session flag so trigger allows status change to 'Rejected'
    PERFORM set_config('agrimandi.in_reject_order', 'on', true);

    -- Update order status to Rejected and store reason
    UPDATE public.orders
    SET status = 'Rejected',
        rejection_reason = TRIM(p_reason),
        rejected_at = NOW()
    WHERE id = v_order.id
    RETURNING * INTO v_order;

    RETURN v_order;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.reject_order(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_order(TEXT, TEXT) TO authenticated;

-- ------------------------------------------------------------------------------
-- 4. UPDATE place_order RPC TO INITIALIZE AS 'Pending'
-- ------------------------------------------------------------------------------
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

    -- Insert order record in 'Pending' status
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
        'Pending'
    )
    RETURNING * INTO v_order;

    RETURN v_order;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.place_order(TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.place_order(TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ------------------------------------------------------------------------------
-- 5. NOTIFICATIONS TABLE & ROW LEVEL SECURITY
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    order_id TEXT,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, is_read) WHERE is_read = FALSE;

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
CREATE POLICY "Users can view their own notifications"
    ON public.notifications FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
CREATE POLICY "Users can update their own notifications"
    ON public.notifications FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Authenticated users or service can insert notifications" ON public.notifications;
CREATE POLICY "Authenticated users or service can insert notifications"
    ON public.notifications FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 6. AUTOMATIC ORDER NOTIFICATION TRIGGER
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_order_notification()
RETURNS TRIGGER AS $$
BEGIN
    -- On New Order Created: Notify Farmer
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.notifications (user_id, title, message, order_id)
        VALUES (
            NEW.farmer_id,
            'New Order Received',
            'Order #' || NEW.order_id || ' placed by ' || NEW.buyer_name || ' for ' || NEW.quantity || ' ' || NEW.unit || ' of ' || NEW.produce_name || '.',
            NEW.order_id
        );
        RETURN NEW;
    END IF;

    -- On Status Update: Notify Buyer / Farmer
    IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
        IF NEW.status = 'Confirmed' THEN
            INSERT INTO public.notifications (user_id, title, message, order_id)
            VALUES (
                NEW.buyer_id,
                'Order Accepted',
                'Your order #' || NEW.order_id || ' for ' || NEW.produce_name || ' was accepted by the farmer.',
                NEW.order_id
            );
        ELSIF NEW.status = 'Rejected' THEN
            INSERT INTO public.notifications (user_id, title, message, order_id)
            VALUES (
                NEW.buyer_id,
                'Order Rejected',
                'Your order #' || NEW.order_id || ' was rejected. Reason: ' || COALESCE(NEW.rejection_reason, 'Unable to fulfill') || '.',
                NEW.order_id
            );
        ELSIF NEW.status = 'Dispatched' THEN
            INSERT INTO public.notifications (user_id, title, message, order_id)
            VALUES (
                NEW.buyer_id,
                'Order Dispatched',
                'Your order #' || NEW.order_id || ' has been dispatched! Track your fresh delivery.',
                NEW.order_id
            );
        ELSIF NEW.status = 'Delivered' THEN
            INSERT INTO public.notifications (user_id, title, message, order_id)
            VALUES (
                NEW.farmer_id,
                'Order Delivered',
                'Order #' || NEW.order_id || ' has been marked as delivered.',
                NEW.order_id
            );
            INSERT INTO public.notifications (user_id, title, message, order_id)
            VALUES (
                NEW.buyer_id,
                'Order Delivered',
                'Your order #' || NEW.order_id || ' has been delivered. Thank you for choosing AgriMandi!',
                NEW.order_id
            );
        ELSIF NEW.status = 'Cancelled' THEN
            INSERT INTO public.notifications (user_id, title, message, order_id)
            VALUES (
                NEW.farmer_id,
                'Order Cancelled',
                'Order #' || NEW.order_id || ' was cancelled by the buyer. Crop inventory has been restored.',
                NEW.order_id
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.handle_order_notification() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_order_notification ON public.orders;
CREATE TRIGGER trg_order_notification
    AFTER INSERT OR UPDATE OF status ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.handle_order_notification();
