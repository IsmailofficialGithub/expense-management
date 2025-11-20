-- Re-enable RLS (Row Level Security) policies on all tables
-- Run this when you want to re-enable security

-- Enable RLS on profiles table
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Enable RLS on groups table
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;

-- Enable RLS on group_members table
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;

-- Enable RLS on group_invitations table
ALTER TABLE group_invitations ENABLE ROW LEVEL SECURITY;

-- Enable RLS on expenses table
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- Enable RLS on expense_splits table
ALTER TABLE expense_splits ENABLE ROW LEVEL SECURITY;

-- Enable RLS on settlements table
ALTER TABLE settlements ENABLE ROW LEVEL SECURITY;

-- Enable RLS on personal_debts table
ALTER TABLE personal_debts ENABLE ROW LEVEL SECURITY;

-- Enable RLS on notifications table
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Enable RLS on personal_transactions table
ALTER TABLE personal_transactions ENABLE ROW LEVEL SECURITY;

-- Enable RLS on personal_categories table
ALTER TABLE personal_categories ENABLE ROW LEVEL SECURITY;

-- Enable RLS on user_payment_methods table
ALTER TABLE user_payment_methods ENABLE ROW LEVEL SECURITY;

-- Enable RLS on hotels table
ALTER TABLE hotels ENABLE ROW LEVEL SECURITY;

-- Enable RLS on hotel_menu_items table
ALTER TABLE hotel_menu_items ENABLE ROW LEVEL SECURITY;

-- Enable RLS on expense_food_items table (if exists)
ALTER TABLE expense_food_items ENABLE ROW LEVEL SECURITY;

