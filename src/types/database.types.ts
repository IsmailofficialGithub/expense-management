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
      conversations: {
        Row: Conversation
        Insert: Omit<Conversation, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Conversation, 'id' | 'created_at'>>
      }
      conversation_participants: {
        Row: ConversationParticipant
        Insert: Omit<ConversationParticipant, 'id' | 'joined_at'>
        Update: Partial<Omit<ConversationParticipant, 'id' | 'joined_at'>>
      }
      messages: {
        Row: Message
        Insert: Omit<Message, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Message, 'id' | 'created_at'>>
      }
      message_reads: {
        Row: MessageRead
        Insert: Omit<MessageRead, 'id' | 'read_at'>
        Update: Partial<Omit<MessageRead, 'id' | 'read_at'>>
      }
      typing_indicators: {
        Row: TypingIndicator
        Insert: Omit<TypingIndicator, 'id' | 'updated_at'>
        Update: Partial<Omit<TypingIndicator, 'id' | 'updated_at'>>
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

// Personal Finance Types
export interface PersonalTransaction {
  id: string;
  user_id: string;
  type: 'income' | 'expense';
  category: string;
  amount: number;
  description: string;
  date: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PersonalCategory {
  id: string;
  name: string;
  type: 'income' | 'expense';
  icon: string;
  color: string;
  is_default: boolean;
}

export interface PersonalTransactionWithCategory extends PersonalTransaction {
  category_details: PersonalCategory;
}

export interface CreatePersonalTransactionRequest {
  type: 'income' | 'expense';
  category: string;
  amount: number;
  description: string;
  date?: string;
  notes?: string;
}

export interface UserCompleteBalance {
  user_id: string;
  total_income: number;
  total_personal_expenses: number;
  total_group_paid: number;
  total_group_owe: number;
  total_group_owed_to_them: number;
  net_balance: number;
}

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
  id: string;
  group_id: string;
  category_id: string;
  description: string;
  amount: number;
  paid_by: string;
  date: string;
  notes: string | null;
  receipt_url: string | null;
  split_type: SplitType;
  payment_method_id: string | null;  // NEW
  payment_method_type: string | null; // NEW
  hotel_id: string | null;            // NEW
  created_at: string;
  updated_at: string;
}

export interface ExpenseSplit {
  user?: Profile | null;
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
  is_bulk: boolean
  bulk_settlement_id: string | null
  created_at: string
}

export interface GroupAdvanceCollection {
  id: string
  group_id: string
  recipient_id: string
  total_amount: number
  per_member_amount: number | null
  status: 'active' | 'completed' | 'cancelled'
  description: string | null
  created_by: string
  created_at: string
  completed_at: string | null
  updated_at: string
  recipient?: Profile
  created_by_user?: Profile
  contributions?: AdvanceCollectionContribution[]
}

export interface AdvanceCollectionContribution {
  id: string
  collection_id: string
  user_id: string
  amount: number
  status: 'pending' | 'pending_approval' | 'paid' | 'cancelled'
  contributed_at: string | null
  approved_by: string | null
  approved_at: string | null
  notes: string | null
  created_at: string
  user?: Profile
}

export interface BulkPaymentStats {
  total: number
  active: number
  completed: number
  totalAmount: number
  pending: number
  balanceLeft: number
}

export interface BulkSettlementSummary {
  recipient_id: string
  recipient_name: string
  total_amount: number
  member_debts: Array<{
    user_id: string
    user_name: string
    total_owed: number
    expense_count: number
  }>
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
  | 'expense_split_assigned'
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
  metadata: {
    expense_id?: string
    group_id?: string
    split_amount?: number
    [key: string]: any
  } | null
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
// HOTELS & MENU SYSTEM
// ============================================

export interface Hotel {
  id: string;
  name: string;
  location: string | null;
  phone: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface HotelMenuItem {
  id: string;
  hotel_id: string;
  item_name: string;
  category: string;
  price: number;
  description: string | null;
  is_available: boolean;
  created_at: string;
  updated_at: string;
}

export interface HotelWithMenu extends Hotel {
  menu_items: HotelMenuItem[];
}

export interface ExpenseFoodItem {
  id: string;
  expense_id: string;
  hotel_id: string | null;
  menu_item_id: string | null;
  item_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  created_at: string;
}

// ============================================
// PAYMENT METHODS
// ============================================

export type PaymentMethodType = 'cash' | 'bank' | 'jazzcash' | 'easypaisa' | 'card' | 'other';

export interface UserPaymentMethod {
  id: string;
  user_id: string;
  method_type: PaymentMethodType;
  is_default: boolean;

  // Bank details
  bank_name: string | null;
  account_title: string | null;
  account_number: string | null;
  iban: string | null;

  // Mobile wallet
  phone_number: string | null;

  // Card details
  card_last_four: string | null;

  // Other
  custom_name: string | null;
  notes: string | null;

  // Privacy
  is_visible_to_groups: boolean;

  created_at: string;
  updated_at: string;
}

// ============================================
// GROUP INVITATIONS
// ============================================

export type InvitationStatus = 'pending' | 'accepted' | 'expired';

export interface GroupInvitation {
  id: string;
  group_id: string;
  invited_by: string;
  invited_email: string;
  invitation_token: string;
  status: InvitationStatus;
  auto_created_user_id: string | null;
  temporary_password: string | null;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

export interface GroupInvitationWithDetails extends GroupInvitation {
  group: Group;
  inviter: Profile;
}

// ============================================
// REQUEST TYPES
// ============================================

export interface CreateHotelRequest {
  name: string;
  location?: string;
  phone?: string;
}

export interface CreateMenuItemRequest {
  hotel_id: string;
  item_name: string;
  category: string;
  price: number;
  description?: string;
}

export interface CreatePaymentMethodRequest {
  method_type: PaymentMethodType;
  is_default?: boolean;
  bank_name?: string;
  account_title?: string;
  account_number?: string;
  iban?: string;
  phone_number?: string;
  card_last_four?: string;
  custom_name?: string;
  notes?: string;
  is_visible_to_groups?: boolean;
}

export interface InviteUserRequest {
  group_id: string;
  invited_email: string;
}

export interface FoodItemInput {
  hotel_id: string;
  menu_item_id: string | null;
  item_name: string;
  quantity: number;
  unit_price: number;
}

export interface CreateFoodExpenseRequest extends Omit<CreateExpenseRequest, 'amount'> {
  hotel_id: string;
  food_items: FoodItemInput[];
  payment_method_id?: string;
}

// ============================================
// EXTENDED TYPES (with relations)
// ============================================

export interface ExpenseWithDetails extends Expense {
  category?: ExpenseCategory;
  paid_by_user?: Profile;
  group?: Group;
  splits?: ExpenseSplit[];
  hotel?: Hotel;                      // NEW
  food_items?: ExpenseFoodItem[];     // NEW
  payment_method?: UserPaymentMethod; // NEW
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
  invitationToken?: string
}

export interface SignInData {
  email: string
  password: string
}

// ============================================
// CHAT TYPES
// ============================================

export type ConversationType = 'group' | 'individual';
export type MessageType = 'text' | 'image' | 'file' | 'expense';

export interface Conversation {
  id: string;
  type: ConversationType;
  group_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
  last_message_text: string | null;
  last_message_sender_id: string | null;
}

export interface ConversationParticipant {
  id: string;
  conversation_id: string;
  user_id: string;
  joined_at: string;
  last_read_at: string | null;
  is_muted: boolean;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  text: string;
  message_type: MessageType;
  created_at: string;
  updated_at: string;
  is_edited: boolean;
  is_deleted: boolean;
  deleted_at: string | null;
  related_expense_id: string | null;
  media_url: string | null;
  media_type: string | null;
}

export interface MessageRead {
  id: string;
  message_id: string;
  user_id: string;
  read_at: string;
}

export interface TypingIndicator {
  id: string;
  conversation_id: string;
  user_id: string;
  is_typing: boolean;
  updated_at: string;
}

// Extended types with relations
export interface ConversationWithDetails extends Conversation {
  group?: Group;
  participants: ConversationParticipantWithProfile[];
  last_message_sender?: Profile;
  unread_count?: number;
}

export interface ConversationParticipantWithProfile extends ConversationParticipant {
  user: Profile;
}

export interface MessageWithStatus extends Message {
  sender: Profile;
  reads: MessageRead[];
  read_count: number;
  total_participants: number;
  status: 'sending' | 'sent'; // Loading, single tick
}

export interface TypingIndicatorWithProfile extends TypingIndicator {
  user: Profile;
}

// Request types
export interface SendMessageRequest {
  conversation_id: string;
  text: string;
  message_type?: MessageType;
  media_url?: string;
  media_type?: string;
  related_expense_id?: string;
}

export interface CreateIndividualConversationRequest {
  other_user_email: string;
}

export interface CreateGroupConversationRequest {
  group_id: string;
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