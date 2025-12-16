-- database/update_bulk_payments_approval.sql
-- Update advance_collection_contributions table to support approval workflow

-- 1. Add approval fields
ALTER TABLE advance_collection_contributions
ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES profiles(id);

ALTER TABLE advance_collection_contributions
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE;

-- 2. Drop existing status constraint
ALTER TABLE advance_collection_contributions
DROP CONSTRAINT IF EXISTS advance_collection_contributions_status_check;

-- 3. Add new status constraint with pending_approval
ALTER TABLE advance_collection_contributions
ADD CONSTRAINT advance_collection_contributions_status_check
CHECK (status IN ('pending', 'pending_approval', 'paid', 'cancelled'));

-- 4. Create index for approval queries
CREATE INDEX IF NOT EXISTS idx_contributions_status_approval 
ON advance_collection_contributions(status) 
WHERE status IN ('pending_approval', 'paid');

-- 5. Add RLS policy for recipients to update contributions (for approval)
-- This allows recipients to approve/reject contributions
-- Drop policy if it exists first
DROP POLICY IF EXISTS "Recipients can approve contributions" ON advance_collection_contributions;

CREATE POLICY "Recipients can approve contributions"
ON advance_collection_contributions
FOR UPDATE
USING (
  -- User can approve if they are the recipient of the collection
  EXISTS (
    SELECT 1 FROM group_advance_collections
    WHERE group_advance_collections.id = advance_collection_contributions.collection_id
    AND group_advance_collections.recipient_id = auth.uid()
  )
);
