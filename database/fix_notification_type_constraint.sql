-- database/fix_notification_type_constraint.sql
-- Fix the notification type check constraint to include 'expense_split_assigned'

-- First, drop the existing constraint
ALTER TABLE notifications 
DROP CONSTRAINT IF EXISTS notifications_type_check;

-- Add the updated constraint with all notification types
ALTER TABLE notifications 
ADD CONSTRAINT notifications_type_check 
CHECK (type IN (
  'expense_added',
  'expense_split_assigned',
  'payment_received',
  'reminder',
  'group_invite'
));

