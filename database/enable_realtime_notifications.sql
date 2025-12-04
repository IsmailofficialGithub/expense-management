-- database/enable_realtime_notifications.sql
-- Enable Realtime for notifications table and verify RLS policies

-- 1. Enable Realtime for notifications table
-- This is usually done via Supabase Dashboard > Database > Replication
-- Or via SQL:
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- 2. Verify RLS policies allow users to read their own notifications
-- Check existing policies
SELECT * FROM pg_policies WHERE tablename = 'notifications';

-- 3. Create/Update RLS policy if needed (users should be able to read their own notifications)
-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Users can read their own notifications" ON notifications;

-- Create policy for reading own notifications
CREATE POLICY "Users can read their own notifications"
ON notifications
FOR SELECT
USING (auth.uid() = user_id);

-- 4. Create policy for inserting notifications (if needed for service role)
-- This is usually handled by service role, but verify it exists
DROP POLICY IF EXISTS "Service role can insert notifications" ON notifications;

CREATE POLICY "Service role can insert notifications"
ON notifications
FOR INSERT
WITH CHECK (true);  -- Adjust based on your security requirements

-- 5. Verify the table has the correct structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'notifications'
ORDER BY ordinal_position;

