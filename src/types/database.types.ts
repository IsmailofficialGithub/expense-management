// src/types/database.types.ts
// TypeScript types matching the Supabase database schema

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: Omit<Profile, 'created_at' | 'updated_at'>
        Update: Partial<Omit<Profile, 'id' | 'created_at'>>
      }
      groups: {
        Row: Group
        Insert: Omit<Group, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Group, 'id' | 'created_at'>>
      }
      group_members: {
        Row: GroupMember
        Insert: Omit<GroupMember, 'id' | 'joined_at'>
        Update: Partial<Omit<GroupMember, 'id' | 'joined_at'>>
      }
      expense_categories: {
        Row: ExpenseCategory
        Insert: Omit<ExpenseCategory, 'id'>
        Update: Partial<Omit<ExpenseCategory, 'id'>>
      }
      expenses: {
        Row: Expense
        Insert: Omit<Expense, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Expense, 'id' | 'created_at'>>
      }
      expense_splits: {
        Row: ExpenseSplit
        Insert: Omit<ExpenseSplit, 'id' | 'created_at'>
        Update: Partial<Omit<ExpenseSplit, 'id' | 'created_at'>>
      }
      settlements: {
        Row: Settlement
        Insert: Omit<Settlement, 'id' | 'created_at' | 'settled_at'>
        Update: Partial<Omit<Settlement, 'id' | 'created_at'>>
      }
      personal_debts: {
        Row: PersonalDebt
        Insert: Omit<PersonalDebt, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<PersonalDebt, 'id' | 'created_at'>>
      }
      notifications: {
        Row: Notification
        Insert: Omit<Notification, 'id' | 'created_at'>
        Update: Partial<Omit<Notification, 'id' | 'created_at'>>
      }
    }
    Views: {
      user_group_balances: {
        Row: UserGroupBalance
      }
    }
  }
}

// ============================================
// CORE TYPES
// ============================================

export interface Profile {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  phone: string | null
  created_at: string
  updated_at: string
}

export interface Group {
  id: string
  name: string
  description: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface GroupMember {
  id: string
  group_id: string
  user_id: string
  role: 'admin' | 'member'
  joined_at: string
}

export interface ExpenseCategory {
  id: string
  name: string
  icon: string
  color: string
  is_default: boolean
}

export type SplitType = 'equal' | 'unequal' | 'percentage' | 'shares'

export interface Expense {
  id: string
  group_id: string
  category_id: string
  description: string
  amount: number
  paid_by: string
  date: string
  notes: string | null
  receipt_url: string | null
  split_type: SplitType
  created_at: string
  updated_at: string
}

export interface ExpenseSplit {
  id: string
  expense_id: string
  user_id: string
  amount: number
  percentage: number | null
  shares: number | null
  is_settled: boolean
  settled_at: string | null
  created_at: string
}

export interface Settlement {
  id: string
  group_id: string
  from_user: string
  to_user: string
  amount: number
  settled_at: string
  notes: string | null
  related_expense_ids: string[] | null
  created_at: string
}

export interface PersonalDebt {
  id: string
  user_id: string
  creditor_id: string
  amount: number
  description: string
  due_date: string | null
  is_settled: boolean
  settled_at: string | null
  created_at: string
  updated_at: string
}

export type NotificationType = 
  | 'expense_added' 
  | 'payment_received' 
  | 'reminder' 
  | 'group_invite'

export interface Notification {
  id: string
  user_id: string
  title: string
  message: string
  type: NotificationType
  is_read: boolean
  related_id: string | null
  created_at: string
}

export interface UserGroupBalance {
  group_id: string
  user_id: string
  total_paid: number
  total_owed: number
  balance: number
}

// ============================================
// EXTENDED TYPES (with relations)
// ============================================

export interface ExpenseWithDetails extends Expense {
  category: ExpenseCategory
  paid_by_user: Profile
  splits: (ExpenseSplit & { user: Profile })[]
}

export interface GroupWithMembers extends Group {
  members: (GroupMember & { user: Profile })[]
  creator: Profile
}

export interface SettlementWithUsers extends Settlement {
  from_user_profile: Profile
  to_user_profile: Profile
}

export interface PersonalDebtWithUsers extends PersonalDebt {
  debtor: Profile
  creditor: Profile
}

// ============================================
// REQUEST/RESPONSE TYPES
// ============================================

export interface CreateExpenseRequest {
  group_id: string;
  category_id: string;
  description: string;
  amount: number;
  paid_by: string;
  date?: string;
  notes?: string;
  split_type: SplitType;
  splits: {
    user_id: string;
    amount?: number;
    percentage?: number;
    shares?: number;
  }[];
  receipt?: {
    uri: string;
    name: string;
    type: string;
  }; // Updated to match React Native format
}
export interface CreateGroupRequest {
  name: string
  description?: string
  member_ids: string[]
}

export interface SettleUpRequest {
  group_id: string
  from_user: string
  to_user: string
  amount: number
  notes?: string
  related_expense_ids?: string[]
}

export interface CreatePersonalDebtRequest {
  creditor_id: string
  amount: number
  description: string
  due_date?: string
}

// ============================================
// UTILITY TYPES
// ============================================

export interface GroupBalance {
  group: Group
  total_expenses: number
  your_share: number
  your_paid: number
  balance: number
  members: {
    user: Profile
    total_paid: number
    total_owed: number
    balance: number
  }[]
}

export interface DebtSummary {
  user: Profile
  you_owe: number
  owes_you: number
  net_balance: number
}

export interface MonthlyStats {
  month: string
  total_spent: number
  your_share: number
  by_category: {
    category: ExpenseCategory
    amount: number
    percentage: number
  }[]
  top_spender: Profile
}

export interface SimplifiedDebt {
  from_user: Profile
  to_user: Profile
  amount: number
}

// ============================================
// FILTER & SORT TYPES
// ============================================

export interface ExpenseFilters {
  group_id?: string
  category_id?: string
  paid_by?: string
  date_from?: string
  date_to?: string
  min_amount?: number
  max_amount?: number
  search?: string
}

export type ExpenseSortBy = 
  | 'date_desc' 
  | 'date_asc' 
  | 'amount_desc' 
  | 'amount_asc' 
  | 'created_desc'

export interface PaginationParams {
  page: number
  limit: number
}

export interface PaginatedResponse<T> {
  data: T[]
  page: number
  limit: number
  total: number
  total_pages: number
}

// ============================================
// AUTH TYPES
// ============================================

export interface SignUpData {
  email: string
  password: string
  full_name: string
  phone?: string
}

export interface SignInData {
  email: string
  password: string
}

export interface AuthUser {
  id: string
  email: string
  profile: Profile
}

// ============================================
// ERROR TYPES
// ============================================

export interface AppError {
  message: string
  code?: string
  details?: any
}

export type AsyncState<T> = {
  data: T | null
  loading: boolean
  error: AppError | null
}

// ============================================
// FORM TYPES
// ============================================

export interface ExpenseFormData {
  description: string
  amount: string
  category_id: string
  date: Date
  notes?: string
  split_type: SplitType
  selected_members: string[]
  custom_splits?: {
    user_id: string
    amount?: string
    percentage?: string
    shares?: string
  }[]
}

export interface GroupFormData {
  name: string
  description?: string
  member_emails: string[]
}

export interface SettlementFormData {
  to_user: string
  amount: string
  notes?: string
}

// ============================================
// REALTIME TYPES
// ============================================

export type RealtimeEventType = 'INSERT' | 'UPDATE' | 'DELETE'

export interface RealtimeExpenseEvent {
  type: RealtimeEventType
  expense: Expense
}

export interface RealtimeNotificationEvent {
  type: RealtimeEventType
  notification: Notification
}