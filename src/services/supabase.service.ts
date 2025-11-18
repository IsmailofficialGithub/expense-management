// src/services/supabase.service.ts
import { supabase } from './supabase';
import {
  Profile,
  Group,
  Expense,
  ExpenseSplit,
  Settlement,
  PersonalDebt,
  Notification,
  CreateExpenseRequest,
  CreateGroupRequest,
  SettleUpRequest,
  CreatePersonalDebtRequest,
  ExpenseWithDetails,
  GroupWithMembers,
  ExpenseFilters,
  UserGroupBalance,
} from '../types/database.types';

// ============================================
// AUTHENTICATION
// ============================================

export const authService = {
  signUp: async (email: string, password: string, fullName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });
    if (error) throw error;
    return data;
  },

  signIn: async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    return data;
  },

  signOut: async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  getCurrentUser: async () => {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) throw error;
    return user;
  },

  resetPassword: async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) throw error;
  },

  updatePassword: async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });
    if (error) throw error;
  },
};

// ============================================
// PROFILE
// ============================================

export const profileService = {
  getProfile: async (userId: string): Promise<Profile> => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (error) throw error;
    return data;
  },

  updateProfile: async (userId: string, updates: Partial<Profile>) => {
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  uploadAvatar: async (userId: string, file: File) => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}.${fileExt}`;
    const filePath = `avatars/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, { upsert: true });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath);

    await profileService.updateProfile(userId, { avatar_url: publicUrl });
    return publicUrl;
  },

  searchProfiles: async (query: string): Promise<Profile[]> => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .or(`full_name.ilike.%${query}%,email.ilike.%${query}%`)
      .limit(10);
    if (error) throw error;
    return data;
  },
};

// ============================================
// GROUPS
// ============================================

export const groupService = {
  createGroup: async (request: CreateGroupRequest): Promise<Group> => {
    const user = await authService.getCurrentUser();
    if (!user) throw new Error('Not authenticated');

    // Create group
    const { data: group, error: groupError } = await supabase
      .from('groups')
      .insert({
        name: request.name,
        description: request.description,
        created_by: user.id,
      })
      .select()
      .single();

    if (groupError) throw groupError;

    // Add creator as admin
    const members = [
      { group_id: group.id, user_id: user.id, role: 'admin' as const },
      ...request.member_ids.map(id => ({
        group_id: group.id,
        user_id: id,
        role: 'member' as const,
      })),
    ];

    const { error: membersError } = await supabase
      .from('group_members')
      .insert(members);

    if (membersError) throw membersError;

    return group;
  },

  getGroups: async (): Promise<GroupWithMembers[]> => {
    const { data, error } = await supabase
      .from('groups')
      .select(`
        *,
        created_by_profile:profiles!groups_created_by_fkey(*),
        members:group_members(
          *,
          user:profiles(*)
        )
      `);

    if (error) throw error;
    return data as any;
  },

  getGroup: async (groupId: string): Promise<GroupWithMembers> => {
    const { data, error } = await supabase
      .from('groups')
      .select(`
        *,
        created_by_profile:profiles!groups_created_by_fkey(*),
        members:group_members(
          *,
          user:profiles(*)
        )
      `)
      .eq('id', groupId)
      .single();

    if (error) throw error;
    return data as any;
  },

  updateGroup: async (groupId: string, updates: Partial<Group>) => {
    const { data, error } = await supabase
      .from('groups')
      .update(updates)
      .eq('id', groupId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  deleteGroup: async (groupId: string) => {
    const { error } = await supabase
      .from('groups')
      .delete()
      .eq('id', groupId);
    if (error) throw error;
  },

  addMember: async (groupId: string, userId: string, role: 'admin' | 'member' = 'member') => {
    const { data, error } = await supabase
      .from('group_members')
      .insert({ group_id: groupId, user_id: userId, role })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  removeMember: async (groupId: string, userId: string) => {
    const { error } = await supabase
      .from('group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', userId);
    if (error) throw error;
  },

  getGroupBalances: async (groupId: string): Promise<UserGroupBalance[]> => {
    const { data, error } = await supabase
      .from('user_group_balances')
      .select('*')
      .eq('group_id', groupId);
    if (error) throw error;
    return data;
  },
};

// ============================================
// EXPENSES
// ============================================

export const expenseService = {

createExpense: async (request: CreateExpenseRequest): Promise<Expense> => {
  // Upload receipt if provided
  let receiptUrl = null;
  if (request.receipt) {
    try {
      const fileName = `${Date.now()}_${request.receipt.name || 'receipt.jpg'}`;
      
      // Simpler method - use fetch with arrayBuffer
      const response = await fetch(request.receipt.uri);
      
      if (!response.ok) {
        throw new Error('Failed to fetch image');
      }
      
      const arrayBuffer = await response.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      
      // Upload to Supabase storage
      const { error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(fileName, uint8Array, {
          contentType: request.receipt.type || 'image/jpeg',
          cacheControl: '3600',
          upsert: false
        });
      
      if (uploadError) {
        console.error('Receipt upload error:', uploadError);
        throw uploadError;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('receipts')
        .getPublicUrl(fileName);
      
      receiptUrl = publicUrl;
    } catch (error) {
      console.error('Failed to process receipt:', error);
      receiptUrl = null;
    }
  }

  // Create expense
  const { data: expense, error: expenseError } = await supabase
    .from('expenses')
    .insert({
      group_id: request.group_id,
      category_id: request.category_id,
      description: request.description,
      amount: request.amount,
      paid_by: request.paid_by,
      date: request.date || new Date().toISOString().split('T')[0],
      notes: request.notes,
      receipt_url: receiptUrl,
      split_type: request.split_type,
    })
    .select()
    .single();

  if (expenseError) throw expenseError;

  // Create splits
  const splits = request.splits.map(split => ({
    expense_id: expense.id,
    user_id: split.user_id,
    amount: split.amount || 0,
    percentage: split.percentage,
    shares: split.shares,
  }));

  const { error: splitsError } = await supabase
    .from('expense_splits')
    .insert(splits);

  if (splitsError) throw splitsError;

  return expense;
},
  getExpenses: async (filters?: ExpenseFilters): Promise<ExpenseWithDetails[]> => {
    let query = supabase
      .from('expenses')
      .select(`
        *,
        category:expense_categories(*),
        paid_by_user:profiles!expenses_paid_by_fkey(*),
        splits:expense_splits(
          *,
          user:profiles(*)
        )
      `)
      .order('date', { ascending: false });

    if (filters?.group_id) {
      query = query.eq('group_id', filters.group_id);
    }
    if (filters?.category_id) {
      query = query.eq('category_id', filters.category_id);
    }
    if (filters?.paid_by) {
      query = query.eq('paid_by', filters.paid_by);
    }
    if (filters?.date_from) {
      query = query.gte('date', filters.date_from);
    }
    if (filters?.date_to) {
      query = query.lte('date', filters.date_to);
    }
    if (filters?.min_amount) {
      query = query.gte('amount', filters.min_amount);
    }
    if (filters?.max_amount) {
      query = query.lte('amount', filters.max_amount);
    }
    if (filters?.search) {
      query = query.ilike('description', `%${filters.search}%`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data as any;
  },

  getExpense: async (expenseId: string): Promise<ExpenseWithDetails> => {
    const { data, error } = await supabase
      .from('expenses')
      .select(`
        *,
        category:expense_categories(*),
        paid_by_user:profiles!expenses_paid_by_fkey(*),
        splits:expense_splits(
          *,
          user:profiles(*)
        )
      `)
      .eq('id', expenseId)
      .single();

    if (error) throw error;
    return data as any;
  },

  updateExpense: async (expenseId: string, updates: Partial<Expense>) => {
    const { data, error } = await supabase
      .from('expenses')
      .update(updates)
      .eq('id', expenseId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async uploadReceipt(filePath: string, file: File) {
  return await supabase.storage
    .from("receipts")
    .upload(filePath, file, { upsert: true });
},
getReceiptUrl(filePath: string) {
  return supabase.storage.from("receipts").getPublicUrl(filePath).data.publicUrl;
}
,
async replaceSplits(expenseId: string, splits: { user_id: string; amount: number }[]) {
  // Delete old splits
  await supabase
    .from("expense_splits")
    .delete()
    .eq("expense_id", expenseId);

  // Insert new splits
  if (splits.length > 0) {
    await supabase.from("expense_splits").insert(
      splits.map((s) => ({
        expense_id: expenseId,
        user_id: s.user_id,
        amount: s.amount,
      }))
    );
  }
}
,
  deleteExpense: async (expenseId: string) => {
    const { error } = await supabase
      .from('expenses')
      .delete()
      .eq('id', expenseId);
    if (error) throw error;
  },
};



// ============================================
// SETTLEMENTS
// ============================================

export const settlementService = {
  settleUp: async (request: SettleUpRequest): Promise<Settlement> => {
    const { data, error } = await supabase
      .from('settlements')
      .insert({
        group_id: request.group_id,
        from_user: request.from_user,
        to_user: request.to_user,
        amount: request.amount,
        notes: request.notes,
        related_expense_ids: request.related_expense_ids,
      })
      .select()
      .single();

    if (error) throw error;

    // Mark related splits as settled
    if (request.related_expense_ids && request.related_expense_ids.length > 0) {
      await supabase
        .from('expense_splits')
        .update({ is_settled: true, settled_at: new Date().toISOString() })
        .in('expense_id', request.related_expense_ids)
        .eq('user_id', request.from_user);
    }

    return data;
  },

  getSettlements: async (groupId?: string): Promise<Settlement[]> => {
    let query = supabase
      .from('settlements')
      .select('*')
      .order('settled_at', { ascending: false });

    if (groupId) {
      query = query.eq('group_id', groupId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },
};

// ============================================
// PERSONAL DEBTS
// ============================================

export const personalDebtService = {
  createDebt: async (request: CreatePersonalDebtRequest): Promise<PersonalDebt> => {
    const user = await authService.getCurrentUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('personal_debts')
      .insert({
        user_id: user.id,
        creditor_id: request.creditor_id,
        amount: request.amount,
        description: request.description,
        due_date: request.due_date,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  getDebts: async (): Promise<PersonalDebt[]> => {
    const user = await authService.getCurrentUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('personal_debts')
      .select('*')
      .or(`user_id.eq.${user.id},creditor_id.eq.${user.id}`)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  },

  settleDebt: async (debtId: string) => {
    const { data, error } = await supabase
      .from('personal_debts')
      .update({ is_settled: true, settled_at: new Date().toISOString() })
      .eq('id', debtId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  deleteDebt: async (debtId: string) => {
    const { error } = await supabase
      .from('personal_debts')
      .delete()
      .eq('id', debtId);
    if (error) throw error;
  },
};

// ============================================
// NOTIFICATIONS
// ============================================

export const notificationService = {
  getNotifications: async (): Promise<Notification[]> => {
    const user = await authService.getCurrentUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  },

  markAsRead: async (notificationId: string) => {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId);
    if (error) throw error;
  },

  markAllAsRead: async () => {
    const user = await authService.getCurrentUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false);
    if (error) throw error;
  },

  deleteNotification: async (notificationId: string) => {
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', notificationId);
    if (error) throw error;
  },
};

// ============================================
// CATEGORIES
// ============================================

export const categoryService = {
  getCategories: async () => {
    const { data, error } = await supabase
      .from('expense_categories')
      .select('*')
      .order('name');
    if (error) throw error;
    return data;
  },
};

// ============================================
// REALTIME SUBSCRIPTIONS
// ============================================

export const realtimeService = {
  subscribeToExpenses: (groupId: string, callback: (payload: any) => void) => {
    return supabase
      .channel(`expenses:${groupId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'expenses',
          filter: `group_id=eq.${groupId}`,
        },
        callback
      )
      .subscribe();
  },

  subscribeToNotifications: (userId: string, callback: (payload: any) => void) => {
    return supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        callback
      )
      .subscribe();
  },

  unsubscribe: (channel: any) => {
    supabase.removeChannel(channel);
  },
};