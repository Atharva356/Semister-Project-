-- ==============================================================================
-- AgriMandi Database - Step 04: Storage Bucket Configuration
-- ==============================================================================
-- Run this script fourth in Supabase SQL Editor.
-- Provisions the public 'produce-images' storage bucket with strict RLS policies.
-- ==============================================================================

-- 1. Create the bucket if it does not already exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'produce-images',
    'produce-images',
    true,
    2097152, -- 2 Megabytes limit
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg']::text[]
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 2097152,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg']::text[];

-- 2. Storage RLS Policies on storage.objects

-- Allow public read access to all images in produce-images
DROP POLICY IF EXISTS "Public produce images are viewable by anyone" ON storage.objects;
CREATE POLICY "Public produce images are viewable by anyone"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'produce-images');

-- Allow authenticated users to upload produce images
DROP POLICY IF EXISTS "Authenticated users can upload produce images" ON storage.objects;
CREATE POLICY "Authenticated users can upload produce images"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'produce-images'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- Allow users to update their own uploaded images
DROP POLICY IF EXISTS "Users can update their own produce images" ON storage.objects;
CREATE POLICY "Users can update their own produce images"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (
        bucket_id = 'produce-images'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- Allow users to delete their own uploaded images
DROP POLICY IF EXISTS "Users can delete their own produce images" ON storage.objects;
CREATE POLICY "Users can delete their own produce images"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'produce-images'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );
