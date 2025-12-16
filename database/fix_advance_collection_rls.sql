-- ============================================
-- FIX RLS POLICY FOR advance_collection_contributions
-- ============================================
-- This fixes the "new row violates row-level security policy" error
-- when creating advance collections with contributions for multiple users
--
-- Issue: The original policy only allowed users to create their own contributions,
-- but when creating a collection, we need to create contributions for all group members.
--
-- Solution: Allow group members to create contributions for other group members
-- in the same group as the collection.

-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Users can create their own contributions" ON advance_collection_contributions;

-- Create a new policy that allows group members to create contributions
-- for any user in the same group as the collection
CREATE POLICY "Group members can create contributions in their groups"
ON advance_collection_contributions
FOR INSERT
WITH CHECK (
  -- Check that the collection exists and belongs to a group
  EXISTS (
    SELECT 1 FROM group_advance_collections
    WHERE group_advance_collections.id = advance_collection_contributions.collection_id
  )
  AND
  -- Check that the current user is a member of the group
  EXISTS (
    SELECT 1 FROM group_advance_collections
    JOIN group_members ON group_members.group_id = group_advance_collections.group_id
    WHERE group_advance_collections.id = advance_collection_contributions.collection_id
    AND group_members.user_id = auth.uid()
  )
  AND
  -- Check that the user being contributed for is also a member of the group
  EXISTS (
    SELECT 1 FROM group_advance_collections
    JOIN group_members ON group_members.group_id = group_advance_collections.group_id
    WHERE group_advance_collections.id = advance_collection_contributions.collection_id
    AND group_members.user_id = advance_collection_contributions.user_id
  )
);

-- Also update the UPDATE policy to allow group members to update contributions
-- in their groups (not just their own)
DROP POLICY IF EXISTS "Users can update their own contributions" ON advance_collection_contributions;

CREATE POLICY "Group members can update contributions in their groups"
ON advance_collection_contributions
FOR UPDATE
USING (
  -- User can update if they're a member of the group
  EXISTS (
    SELECT 1 FROM group_advance_collections
    JOIN group_members ON group_members.group_id = group_advance_collections.group_id
    WHERE group_advance_collections.id = advance_collection_contributions.collection_id
    AND group_members.user_id = auth.uid()
  )
);
