-- Chat System Database Schema
-- Run this in Supabase SQL Editor

-- ============================================
-- CONVERSATIONS TABLE
-- ============================================
-- Stores both group and individual conversations
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('group', 'individual')),
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE, -- For group chats
  created_by UUID REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ, -- For sorting conversations
  last_message_text TEXT, -- Preview of last message
  last_message_sender_id UUID REFERENCES profiles(id),
  
  -- Constraints
  CONSTRAINT group_conversation_check CHECK (
    (type = 'group' AND group_id IS NOT NULL) OR
    (type = 'individual' AND group_id IS NULL)
  ),
  CONSTRAINT unique_group_conversation UNIQUE (group_id) -- One conversation per group
);

-- ============================================
-- CONVERSATION_PARTICIPANTS TABLE
-- ============================================
-- Links users to conversations (for individual chats, both users are participants)
CREATE TABLE IF NOT EXISTS conversation_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  last_read_at TIMESTAMPTZ, -- For read receipts
  is_muted BOOLEAN DEFAULT FALSE,
  
  -- Constraints
  CONSTRAINT unique_participant UNIQUE (conversation_id, user_id)
);

-- ============================================
-- MESSAGES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'file', 'expense')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_edited BOOLEAN DEFAULT FALSE,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  
  -- For expense messages (optional)
  related_expense_id UUID REFERENCES expenses(id) ON DELETE SET NULL,
  
  -- For media messages (optional)
  media_url TEXT,
  media_type TEXT
);

-- ============================================
-- MESSAGE_READS TABLE
-- ============================================
-- Tracks read receipts for messages
CREATE TABLE IF NOT EXISTS message_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT unique_message_read UNIQUE (message_id, user_id)
);

-- ============================================
-- TYPING_INDICATORS TABLE
-- ============================================
-- Tracks who is currently typing in a conversation
CREATE TABLE IF NOT EXISTS typing_indicators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  is_typing BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT unique_typing_indicator UNIQUE (conversation_id, user_id)
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_conversations_group_id ON conversations(group_id);
CREATE INDEX IF NOT EXISTS idx_conversations_type ON conversations(type);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_conversation_id ON conversation_participants(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_user_id ON conversation_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_message_reads_message_id ON message_reads(message_id);
CREATE INDEX IF NOT EXISTS idx_message_reads_user_id ON message_reads(user_id);
CREATE INDEX IF NOT EXISTS idx_typing_indicators_conversation_id ON typing_indicators(conversation_id);

-- ============================================
-- FUNCTIONS AND TRIGGERS
-- ============================================

-- Function to update conversation's last_message_at and last_message_text
CREATE OR REPLACE FUNCTION update_conversation_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations
  SET 
    last_message_at = NEW.created_at,
    last_message_text = CASE 
      WHEN NEW.is_deleted THEN '[Message deleted]'
      WHEN NEW.message_type = 'image' THEN '📷 Image'
      WHEN NEW.message_type = 'file' THEN '📎 File'
      WHEN NEW.message_type = 'expense' THEN '💰 Expense'
      ELSE LEFT(NEW.text, 100)
    END,
    last_message_sender_id = NEW.sender_id,
    updated_at = NOW()
  WHERE id = NEW.conversation_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update conversation when message is created
CREATE TRIGGER on_message_created
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_last_message();

-- Function to auto-create conversation participants for group chats
CREATE OR REPLACE FUNCTION auto_add_group_members_to_conversation()
RETURNS TRIGGER AS $$
BEGIN
  -- When a group conversation is created, add all group members as participants
  IF NEW.type = 'group' AND NEW.group_id IS NOT NULL THEN
    INSERT INTO conversation_participants (conversation_id, user_id)
    SELECT NEW.id, user_id
    FROM group_members
    WHERE group_id = NEW.group_id
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-add group members when conversation is created
CREATE TRIGGER on_group_conversation_created
  AFTER INSERT ON conversations
  FOR EACH ROW
  WHEN (NEW.type = 'group')
  EXECUTE FUNCTION auto_add_group_members_to_conversation();

-- Function to auto-add new group members to conversation
CREATE OR REPLACE FUNCTION add_new_member_to_group_conversation()
RETURNS TRIGGER AS $$
BEGIN
  -- When someone joins a group, add them to the group's conversation
  INSERT INTO conversation_participants (conversation_id, user_id)
  SELECT id, NEW.user_id
  FROM conversations
  WHERE type = 'group' AND group_id = NEW.group_id
  ON CONFLICT (conversation_id, user_id) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to add new group members to conversation
CREATE TRIGGER on_group_member_added
  AFTER INSERT ON group_members
  FOR EACH ROW
  EXECUTE FUNCTION add_new_member_to_group_conversation();

-- ============================================
-- ENABLE REALTIME
-- ============================================
-- Enable Realtime for all chat tables
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE message_reads;
ALTER PUBLICATION supabase_realtime ADD TABLE typing_indicators;
ALTER PUBLICATION supabase_realtime ADD TABLE conversation_participants;

-- ============================================
-- RLS POLICIES (Basic - can be customized)
-- ============================================

-- Create a security definer function to check participation (bypasses RLS to avoid recursion)
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

-- Enable RLS
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE typing_indicators ENABLE ROW LEVEL SECURITY;

-- Conversations: Users can only see conversations they're part of
-- Fixed: Use security definer function to avoid infinite recursion
CREATE POLICY "Users can view their conversations"
  ON conversations FOR SELECT
  USING (
    is_conversation_participant(id, auth.uid())
  );

-- Conversation Participants: Users can view participants of their conversations
-- Fixed: Use security definer function to avoid infinite recursion
CREATE POLICY "Users can view participants of their conversations"
  ON conversation_participants FOR SELECT
  USING (
    is_conversation_participant(conversation_id, auth.uid())
  );

-- Messages: Users can view messages in their conversations
-- Fixed: Use security definer function to avoid infinite recursion
CREATE POLICY "Users can view messages in their conversations"
  ON messages FOR SELECT
  USING (
    is_conversation_participant(conversation_id, auth.uid())
  );

-- Messages: Users can insert messages in their conversations
-- Fixed: Use security definer function to avoid infinite recursion
CREATE POLICY "Users can send messages in their conversations"
  ON messages FOR INSERT
  WITH CHECK (
    is_conversation_participant(conversation_id, auth.uid())
    AND sender_id = auth.uid()
  );

-- Messages: Users can update their own messages
CREATE POLICY "Users can update their own messages"
  ON messages FOR UPDATE
  USING (sender_id = auth.uid())
  WITH CHECK (sender_id = auth.uid());

-- Message Reads: Users can view and insert their own read receipts
CREATE POLICY "Users can manage their read receipts"
  ON message_reads FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Typing Indicators: Users can view and manage typing indicators in their conversations
-- Fixed: Use security definer function to avoid infinite recursion
CREATE POLICY "Users can manage typing indicators"
  ON typing_indicators FOR ALL
  USING (
    is_conversation_participant(conversation_id, auth.uid())
  )
  WITH CHECK (
    is_conversation_participant(conversation_id, auth.uid())
    AND user_id = auth.uid()
  );

