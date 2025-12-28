-- Storage Policies for Receipts Bucket
-- Run this in your Supabase SQL Editor to fix the receipt upload issue

-- First, ensure the receipts bucket exists (if not, create it via Supabase Dashboard)
-- Bucket name: 'receipts'
-- Public: false (recommended for privacy)

-- Step 1: Create the receipts bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'receipts',
  'receipts',
  false,  -- Private bucket (use RLS policies for access control)
  10485760,  -- 10MB file size limit
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Step 2: Drop existing policies if any (to avoid conflicts)
DROP POLICY IF EXISTS "Users can upload receipts" ON storage.objects;
DROP POLICY IF EXISTS "Users can view receipts" ON storage.objects;
DROP POLICY IF EXISTS "Users can update receipts" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete receipts" ON storage.objects;

-- Policy 1: Allow authenticated users to upload receipts
-- Receipts should be stored with user ID in the path for security
CREATE POLICY "Users can upload receipts"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'receipts' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy 2: Allow users to view their own receipts and receipts from their groups
CREATE POLICY "Users can view receipts"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'receipts' AND
  (
    -- User can view their own receipts
    (storage.foldername(name))[1] = auth.uid()::text
    OR
    -- User can view receipts from expenses in their groups
    EXISTS (
      SELECT 1 FROM expenses e
      INNER JOIN group_members gm ON gm.group_id = e.group_id
      WHERE gm.user_id = auth.uid()
      AND e.receipt_url LIKE '%' || name || '%'
    )
  )
);

-- Policy 3: Allow users to update their own receipts
CREATE POLICY "Users can update receipts"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'receipts' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy 4: Allow users to delete their own receipts
CREATE POLICY "Users can delete receipts"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'receipts' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- IMPORTANT: Make sure your receipt upload code stores files with the user ID in the path
-- Example path format: receipts/{user_id}/{expense_id}.jpg
-- This ensures the RLS policies work correctly
