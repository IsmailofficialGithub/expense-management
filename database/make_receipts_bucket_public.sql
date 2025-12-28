-- Make Receipts Bucket Public
-- Run this in your Supabase SQL Editor

-- Update the receipts bucket to be public
UPDATE storage.buckets
SET public = true
WHERE id = 'receipts';

-- Verify the change
SELECT id, name, public FROM storage.buckets WHERE id = 'receipts';

-- Note: After making the bucket public, you don't need RLS policies for viewing
-- The public URLs will work directly
