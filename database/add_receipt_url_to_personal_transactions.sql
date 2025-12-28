-- Migration: Add receipt_url column to personal_transactions
-- This column is required to store the URL of uploaded receipts for personal finance items

ALTER TABLE public.personal_transactions 
ADD COLUMN IF NOT EXISTS receipt_url TEXT;

-- Add a comment for clarity
COMMENT ON COLUMN public.personal_transactions.receipt_url IS 'Signed URL for the transaction receipt image stored in Supabase storage';
