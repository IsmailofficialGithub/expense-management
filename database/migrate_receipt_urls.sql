-- Update Existing Receipt URLs to Signed URLs
-- This script helps migrate old public URLs to signed URLs
-- Run this AFTER updating the code to use signed URLs

-- Note: This is a manual process because we need to generate signed URLs
-- You have two options:

-- OPTION 1: Make the bucket public (easiest)
-- Run this to make all existing URLs work:
UPDATE storage.buckets
SET public = true
WHERE id = 'receipts';

-- OPTION 2: Regenerate signed URLs for existing receipts
-- This requires running a script in your app to:
-- 1. Fetch all expenses with receipt_url
-- 2. Extract the file path from the URL
-- 3. Generate a new signed URL
-- 4. Update the expense with the new URL

-- Here's a query to see all expenses with receipts:
SELECT id, description, receipt_url
FROM expenses
WHERE receipt_url IS NOT NULL
ORDER BY created_at DESC;

-- After making the bucket public, verify the URLs work:
-- The URLs should change from:
-- https://[project].supabase.co/storage/v1/object/public/receipts/...
-- To (if bucket is private):
-- https://[project].supabase.co/storage/v1/object/sign/receipts/...?token=...

-- Note: For new uploads, the code will automatically generate signed URLs
