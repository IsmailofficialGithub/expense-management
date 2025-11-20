-- ============================================
-- FIX INFINITE RECURSION IN CHAT RLS POLICIES
-- ============================================
-- Copy and paste this entire script into Supabase SQL Editor
-- This fixes the "infinite recursion detected in policy" error (42P17)

-- Step 1: Create security definer function (bypasses RLS to avoid recursion)
CREATE OR REPLACE FUNCTION is_conversation_participant(conv_id UUID, user_uuid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM conversation_participants
    WHERE conversation_id = conv_id
    AND user_id = user_uuid
  );
END;
$$;

-- Step 2: Drop existing problematic policies
DROP POLICY IF EXISTS "Users can view participants of their conversations" ON conversation_participants;
DROP POLICY IF EXISTS "Users can view their conversations" ON conversations;
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON messages;
DROP POLICY IF EXISTS "Users can send messages in their conversations" ON messages;
DROP POLICY IF EXISTS "Users can insert messages in their conversations" ON messages;
DROP POLICY IF EXISTS "Users can manage typing indicators" ON typing_indicators;

-- Step 3: Recreate policies using the security definer function

-- Conversation Participants: Users can view participants of their conversations
CREATE POLICY "Users can view participants of their conversations"
  ON conversation_participants FOR SELECT
  USING (
    is_conversation_participant(conversation_id, auth.uid())
  );

-- Conversations: Users can only see conversations they're part of
CREATE POLICY "Users can view their conversations"
  ON conversations FOR SELECT
  USING (
    is_conversation_participant(id, auth.uid())
  );

-- Messages: Users can view messages in their conversations
CREATE POLICY "Users can view messages in their conversations"
  ON messages FOR SELECT
  USING (
    is_conversation_participant(conversation_id, auth.uid())
  );

-- Messages: Users can insert messages in their conversations
CREATE POLICY "Users can send messages in their conversations"
  ON messages FOR INSERT
  WITH CHECK (
    is_conversation_participant(conversation_id, auth.uid())
    AND sender_id = auth.uid()
  );

-- Typing Indicators: Users can view and manage typing indicators in their conversations
CREATE POLICY "Users can manage typing indicators"
  ON typing_indicators FOR ALL
  USING (
    is_conversation_participant(conversation_id, auth.uid())
  )
  WITH CHECK (
    is_conversation_participant(conversation_id, auth.uid())
    AND user_id = auth.uid()
  );

-- Done! The recursion error should now be fixed.

