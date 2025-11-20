-- Add table to track message deletions for individual users
-- This allows "Delete for me" functionality

CREATE TABLE IF NOT EXISTS message_deletions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  deleted_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT unique_message_user_deletion UNIQUE (message_id, user_id)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_message_deletions_message_id ON message_deletions(message_id);
CREATE INDEX IF NOT EXISTS idx_message_deletions_user_id ON message_deletions(user_id);

-- Enable RLS
ALTER TABLE message_deletions ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own deletions
CREATE POLICY "Users can view their own message deletions"
  ON message_deletions FOR SELECT
  USING (user_id = auth.uid());

-- RLS Policy: Users can insert their own deletions
CREATE POLICY "Users can delete messages for themselves"
  ON message_deletions FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- RLS Policy: Users can delete their own deletion records (undo)
CREATE POLICY "Users can remove their own deletions"
  ON message_deletions FOR DELETE
  USING (user_id = auth.uid());

