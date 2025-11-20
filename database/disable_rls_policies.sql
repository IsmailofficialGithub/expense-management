-- Temporarily disable RLS (Row Level Security) policies on all tables
-- Run this in Supabase SQL Editor if policies are causing issues

-- Disable RLS on profiles table
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;

-- Disable RLS on groups table
ALTER TABLE groups DISABLE ROW LEVEL SECURITY;

-- Disable RLS on group_members table
ALTER TABLE group_members DISABLE ROW LEVEL SECURITY;

-- Disable RLS on group_invitations table
ALTER TABLE group_invitations DISABLE ROW LEVEL SECURITY;

-- Disable RLS on expenses table
ALTER TABLE expenses DISABLE ROW LEVEL SECURITY;

-- Disable RLS on expense_splits table
ALTER TABLE expense_splits DISABLE ROW LEVEL SECURITY;

-- Disable RLS on settlements table
ALTER TABLE settlements DISABLE ROW LEVEL SECURITY;

-- Disable RLS on personal_debts table
ALTER TABLE personal_debts DISABLE ROW LEVEL SECURITY;

-- Disable RLS on notifications table
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;

-- Disable RLS on personal_transactions table
ALTER TABLE personal_transactions DISABLE ROW LEVEL SECURITY;

-- Disable RLS on personal_categories table
ALTER TABLE personal_categories DISABLE ROW LEVEL SECURITY;

-- Disable RLS on user_payment_methods table
ALTER TABLE user_payment_methods DISABLE ROW LEVEL SECURITY;

-- Disable RLS on hotels table
ALTER TABLE hotels DISABLE ROW LEVEL SECURITY;

-- Disable RLS on hotel_menu_items table
ALTER TABLE hotel_menu_items DISABLE ROW LEVEL SECURITY;

-- Disable RLS on expense_food_items table (if exists)
ALTER TABLE expense_food_items DISABLE ROW LEVEL SECURITY;

-- Verify RLS is disabled (optional - run to check)
SELECT 
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'profiles',
    'groups',
    'group_members',
    'group_invitations',
    'expenses',
    'expense_splits',
    'settlements',
    'personal_debts',
    'notifications',
    'personal_transactions',
    'personal_categories',
    'user_payment_methods',
    'hotels',
    'hotel_menu_items',
    'expense_food_items'
  )
ORDER BY tablename;

