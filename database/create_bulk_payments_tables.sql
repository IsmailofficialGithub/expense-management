-- database/create_bulk_payments_tables.sql
-- Create tables for bulk payment features: Advance Collection and Bulk Settlement

-- 1. Group Advance Collections Table
CREATE TABLE IF NOT EXISTS group_advance_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES profiles(id),
  total_amount DECIMAL(10,2) NOT NULL CHECK (total_amount > 0),
  per_member_amount DECIMAL(10,2),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  description TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Advance Collection Contributions Table
CREATE TABLE IF NOT EXISTS advance_collection_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES group_advance_collections(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id),
  amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
  contributed_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(collection_id, user_id) -- One contribution per user per collection
);

-- 3. Update settlements table to support bulk settlements
ALTER TABLE settlements 
ADD COLUMN IF NOT EXISTS is_bulk BOOLEAN DEFAULT FALSE;

ALTER TABLE settlements 
ADD COLUMN IF NOT EXISTS bulk_settlement_id UUID; -- Group related bulk settlements

-- 4. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_advance_collections_group ON group_advance_collections(group_id);
CREATE INDEX IF NOT EXISTS idx_advance_collections_status ON group_advance_collections(status);
CREATE INDEX IF NOT EXISTS idx_advance_collections_recipient ON group_advance_collections(recipient_id);
CREATE INDEX IF NOT EXISTS idx_contributions_collection ON advance_collection_contributions(collection_id);
CREATE INDEX IF NOT EXISTS idx_contributions_user ON advance_collection_contributions(user_id);
CREATE INDEX IF NOT EXISTS idx_contributions_status ON advance_collection_contributions(status);
CREATE INDEX IF NOT EXISTS idx_settlements_bulk ON settlements(is_bulk) WHERE is_bulk = true;

-- 5. Enable RLS (Row Level Security)
ALTER TABLE group_advance_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE advance_collection_contributions ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies for group_advance_collections
-- Users can view collections for groups they belong to
CREATE POLICY "Users can view collections in their groups"
ON group_advance_collections
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM group_members
    WHERE group_members.group_id = group_advance_collections.group_id
    AND group_members.user_id = auth.uid()
  )
);

-- Users can create collections in groups they belong to
CREATE POLICY "Users can create collections in their groups"
ON group_advance_collections
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM group_members
    WHERE group_members.group_id = group_advance_collections.group_id
    AND group_members.user_id = auth.uid()
  )
  AND created_by = auth.uid()
);

-- Users can update collections they created
CREATE POLICY "Users can update collections they created"
ON group_advance_collections
FOR UPDATE
USING (created_by = auth.uid());

-- 7. RLS Policies for advance_collection_contributions
-- Users can view contributions for collections in their groups
CREATE POLICY "Users can view contributions in their groups"
ON advance_collection_contributions
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM group_advance_collections
    JOIN group_members ON group_members.group_id = group_advance_collections.group_id
    WHERE group_advance_collections.id = advance_collection_contributions.collection_id
    AND group_members.user_id = auth.uid()
  )
);

-- Users can create their own contributions
CREATE POLICY "Users can create their own contributions"
ON advance_collection_contributions
FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Users can update their own contributions
CREATE POLICY "Users can update their own contributions"
ON advance_collection_contributions
FOR UPDATE
USING (user_id = auth.uid());

