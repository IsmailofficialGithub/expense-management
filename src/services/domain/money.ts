// src/services/domain/money.ts
import { supabase } from '../supabase';
import * as SecureStore from 'expo-secure-store';
import { api, AuthUser, clearSession, getStoredUser, setSession } from '../api';
import { Platform } from 'react-native';
import { sendWhatsAppMessageFromHtml } from '../whatsapp.service';
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
  PersonalTransaction,
  UserCompleteBalance,
  PersonalCategory,
  CreatePersonalTransactionRequest,
  ExpenseFoodItem,
  InviteUserRequest,
  GroupInvitation,
  GroupInvitationWithDetails,
  UserPaymentMethod,
  CreatePaymentMethodRequest,
  HotelMenuItem,
  CreateMenuItemRequest,
  GroupAdvanceCollection,
  AdvanceCollectionContribution,
  BulkSettlementSummary,
  Hotel,
  CreateHotelRequest,
  HotelWithMenu,
  CreateFoodExpenseRequest,
} from '../../types/database.types';
import { authService, groupService, notificationService } from '../supabase.service';

// ============================================
// FOOD EXPENSE SERVICE
// ============================================

export const foodExpenseService = {
  /**
   * Create food expense with items
   */
  async createFoodExpense(request: CreateFoodExpenseRequest): Promise<ExpenseWithDetails> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Calculate total amount from food items
    const totalAmount = request.food_items.reduce(
      (sum, item) => sum + (item.quantity * item.unit_price),
      0
    );

    // Create expense
    const { data: expense, error: expenseError } = await supabase
      .from('expenses')
      .insert({
        group_id: request.group_id,
        category_id: request.category_id,
        description: request.description,
        amount: totalAmount,
        paid_by: request.paid_by || user.id,
        date: request.date || new Date().toISOString().split('T')[0],
        notes: request.notes || null,
        split_type: request.split_type,
        hotel_id: request.hotel_id,
        payment_method_id: request.payment_method_id || null,
      })
      .select()
      .single();

    if (expenseError) throw expenseError;

    // Create food items
    const foodItemsData = request.food_items.map(item => ({
      expense_id: expense.id,
      hotel_id: request.hotel_id,
      menu_item_id: item.menu_item_id,
      item_name: item.item_name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total_price: item.quantity * item.unit_price,
    }));

    const { error: foodItemsError } = await supabase
      .from('expense_food_items')
      .insert(foodItemsData);

    if (foodItemsError) throw foodItemsError;

    // Create splits
    const splitsData = request.splits.map(split => ({
      expense_id: expense.id,
      user_id: split.user_id,
      amount: split.amount,
      percentage: split.percentage || null,
      shares: split.shares || null,
    }));

    const { error: splitsError } = await supabase
      .from('expense_splits')
      .insert(splitsData);

    if (splitsError) throw splitsError;

    // Trigger notifications for group members (non-blocking)
    // Trigger notifications (including WhatsApp)
    console.log('[Create Expense] 📢 Triggering expense notifications', {
      expenseId: expense.id,
      groupId: request.group_id,
    });
    notificationService.triggerExpenseNotifications(expense.id, request.group_id)
      .catch(err => console.error('[Create Expense] ❌ Notification trigger failed:', err))
      .catch(error => console.error('Failed to trigger notifications:', error));

    // Fetch complete expense with details
    return expenseService.getExpense(expense.id);
  },

  /**
   * Get food items for expense
   */
  async getFoodItems(expenseId: string): Promise<ExpenseFoodItem[]> {
    const { data, error } = await supabase
      .from('expense_food_items')
      .select('*')
      .eq('expense_id', expenseId)
      .order('created_at');

    if (error) throw error;
    return data || [];
  },
};

// ============================================
// PERSONAL FINANCE
// ============================================

export const personalFinanceService = {
  // Get all personal transactions
  getTransactions: async (): Promise<PersonalTransaction[]> => {
    const user = await authService.getCurrentUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('personal_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('date', { ascending: false });

    if (error) throw error;
    return data;
  },

  // Create personal transaction
  createTransaction: async (
    request: CreatePersonalTransactionRequest
  ): Promise<PersonalTransaction> => {
    const user = await authService.getCurrentUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('personal_transactions')
      .insert({
        user_id: user.id,
        type: request.type,
        category: request.category,
        amount: request.amount,
        description: request.description,
        date: request.date || new Date().toISOString().split('T')[0],
        notes: request.notes,
        receipt_url: request.receipt_url,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Update personal transaction
  updateTransaction: async (
    transactionId: string,
    updates: Partial<PersonalTransaction>
  ): Promise<PersonalTransaction> => {
    const { data, error } = await supabase
      .from('personal_transactions')
      .update(updates)
      .eq('id', transactionId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Delete personal transaction
  deleteTransaction: async (transactionId: string): Promise<void> => {
    const user = await authService.getCurrentUser();
    if (!user) throw new Error('Not authenticated');

    // First, get the transaction to check if it has a receipt
    const { data: transaction, error: fetchError } = await supabase
      .from('personal_transactions')
      .select('receipt_url')
      .eq('id', transactionId)
      .eq('user_id', user.id)
      .single();

    if (!fetchError && transaction?.receipt_url) {
      // Delete receipt from storage
      try {
        await expenseService.deleteReceipt(transaction.receipt_url);
      } catch (error) {
        console.error('Failed to delete transaction receipt:', error);
      }
    }

    const { error } = await supabase
      .from('personal_transactions')
      .delete()
      .eq('id', transactionId)
      .eq('user_id', user.id);

    if (error) throw error;
  },

  // Get personal categories
  getCategories: async (): Promise<PersonalCategory[]> => {
    const { data, error } = await supabase
      .from('personal_categories')
      .select('*')
      .order('name');

    if (error) throw error;
    return data;
  },

  // Get complete user balance
  getCompleteBalance: async (): Promise<UserCompleteBalance> => {
    const user = await authService.getCurrentUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('user_complete_balance')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (error) throw error;
    return data;
  },

  // Get transactions by date range
  getTransactionsByDateRange: async (
    startDate: string,
    endDate: string
  ): Promise<PersonalTransaction[]> => {
    const user = await authService.getCurrentUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('personal_transactions')
      .select('*')
      .eq('user_id', user.id)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: false });

    if (error) throw error;
    return data;
  },

  // Get monthly summary
  getMonthlySummary: async (year: number, month: number) => {
    const user = await authService.getCurrentUser();
    if (!user) throw new Error('Not authenticated');

    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month).padStart(2, '0')}-31`;

    const { data, error } = await supabase
      .from('personal_transactions')
      .select('*')
      .eq('user_id', user.id)
      .gte('date', startDate)
      .lte('date', endDate);

    if (error) throw error;

    const income = data
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const expenses = data
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + Number(t.amount), 0);

    return {
      income,
      expenses,
      balance: income - expenses,
      transactions: data,
    };
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
        // Include user ID in path for RLS policy compliance
        const filePath = `${request.paid_by}/${fileName}`;

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
          .upload(filePath, uint8Array, {
            contentType: request.receipt.type || 'image/jpeg',
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) {
          console.error('Receipt upload error:', uploadError);
          throw uploadError;
        }

        // Get signed URL (works with private buckets)
        // Signed URL expires in 1 year (31536000 seconds)
        const { data: signedUrlData, error: signedUrlError } = await supabase.storage
          .from('receipts')
          .createSignedUrl(filePath, 31536000); // 1 year expiry

        if (signedUrlError) {
          console.error('Failed to create signed URL:', signedUrlError);
          throw signedUrlError;
        }

        receiptUrl = signedUrlData.signedUrl;
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

    // Trigger notifications for group members (non-blocking)
    // Trigger notifications (including WhatsApp)
    console.log('[Create Expense] 📢 Triggering expense notifications', {
      expenseId: expense.id,
      groupId: request.group_id,
    });
    notificationService.triggerExpenseNotifications(expense.id, request.group_id)
      .catch(err => console.error('[Create Expense] ❌ Notification trigger failed:', err))
      .catch(error => console.error('Failed to trigger notifications:', error));

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

  async getExpense(expenseId: string): Promise<ExpenseWithDetails> {
    const { data, error } = await supabase
      .from('expenses')
      .select(`
      *,
      category:expense_categories(*),
      paid_by_user:profiles!expenses_paid_by_fkey(*),
      group:groups(*),
      splits:expense_splits(
        *,
        user:profiles(*)
      ),
      hotel:hotels(*),
      food_items:expense_food_items(*),
      payment_method:user_payment_methods(*)
    `)
      .eq('id', expenseId)
      .single();

    if (error) throw error;
    return data;
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
  async getReceiptUrl(filePath: string) {
    const { data, error } = await supabase.storage
      .from("receipts")
      .createSignedUrl(filePath, 31536000); // 1 year expiry

    if (error) {
      console.error('Failed to create signed URL:', error);
      return null;
    }

    return data.signedUrl;
  },

  async deleteReceipt(receiptUrl: string) {
    try {
      // Extract file path from URL
      // URL format: https://[project].supabase.co/storage/v1/object/[public|sign]/receipts/[userId]/[filename]
      const urlParts = receiptUrl.split('/receipts/');
      if (urlParts.length > 1) {
        // Remove query parameters if it's a signed URL
        const pathWithQuery = urlParts[1];
        const filePath = pathWithQuery.split('?')[0];

        // Delete from storage
        const { error } = await supabase.storage
          .from('receipts')
          .remove([filePath]);

        if (error) {
          console.error('Failed to delete receipt from storage:', error);
          return false;
        }

        console.log('Receipt deleted successfully from storage:', filePath);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error deleting receipt:', error);
      return false;
    }
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
    // 1. First, get the expense to check if it has a receipt
    const { data: expense, error: fetchError } = await supabase
      .from('expenses')
      .select('receipt_url')
      .eq('id', expenseId)
      .single();

    if (fetchError) throw fetchError;

    // 2. Delete the receipt from storage if it exists
    if (expense?.receipt_url) {
      await expenseService.deleteReceipt(expense.receipt_url);
    }

    // 3. Delete related food items first (foreign key dependency)
    await supabase
      .from('expense_food_items')
      .delete()
      .eq('expense_id', expenseId);

    // 4. Delete splits first (foreign key dependency)
    await supabase
      .from('expense_splits')
      .delete()
      .eq('expense_id', expenseId);

    // 5. Finally, delete the expense from database
    const { error } = await supabase
      .from('expenses')
      .delete()
      .eq('id', expenseId);

    if (error) throw error;
  },

  markSplitAsSettled: async (splitId: string) => {
    const { data, error } = await supabase
      .from('expense_splits')
      .update({ is_settled: true, settled_at: new Date().toISOString() })
      .eq('id', splitId)
      .select()
      .single();
    if (error) throw error;
    return data;
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
// BULK PAYMENTS
// ============================================

export const bulkPaymentService = {
  /**
   * Create advance collection
   */
  createAdvanceCollection: async (request: {
    group_id: string;
    recipient_id: string;
    total_amount?: number;
    per_member_amount?: number;
    description?: string;
  }): Promise<GroupAdvanceCollection> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Get group members count
    const { data: members, error: membersError } = await supabase
      .from('group_members')
      .select('user_id')
      .eq('group_id', request.group_id);

    if (membersError || !members) throw new Error('Failed to fetch group members');

    const memberCount = members.length;
    if (memberCount === 0) throw new Error('Group has no members');

    // Calculate amounts
    let totalAmount = request.total_amount;
    let perMemberAmount = request.per_member_amount;

    if (totalAmount && !perMemberAmount) {
      perMemberAmount = totalAmount / memberCount;
    } else if (perMemberAmount && !totalAmount) {
      totalAmount = perMemberAmount * memberCount;
    } else if (!totalAmount && !perMemberAmount) {
      throw new Error('Either total_amount or per_member_amount must be provided');
    }

    // Create collection
    const { data: collection, error: collectionError } = await supabase
      .from('group_advance_collections')
      .insert({
        group_id: request.group_id,
        recipient_id: request.recipient_id,
        total_amount: totalAmount!,
        per_member_amount: perMemberAmount!,
        description: request.description || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (collectionError) throw collectionError;

    // Create contribution records for all members (except recipient if they're a member)
    const contributions = members
      .filter(m => m.user_id !== request.recipient_id || !members.some(mem => mem.user_id === request.recipient_id))
      .map(member => ({
        collection_id: collection.id,
        user_id: member.user_id,
        amount: perMemberAmount!,
        status: 'pending' as const,
      }));

    // Also add recipient if they're a member
    if (members.some(m => m.user_id === request.recipient_id)) {
      contributions.push({
        collection_id: collection.id,
        user_id: request.recipient_id,
        amount: perMemberAmount!,
        status: 'pending' as const,
      });
    }

    if (contributions.length > 0) {
      const { error: contributionsError } = await supabase
        .from('advance_collection_contributions')
        .insert(contributions);

      if (contributionsError) throw contributionsError;
    }

    // Fetch complete collection with relations
    const { data: completeCollection, error: fetchError } = await supabase
      .from('group_advance_collections')
      .select(`
        *,
        recipient:profiles!group_advance_collections_recipient_id_fkey(*),
        created_by_user:profiles!group_advance_collections_created_by_fkey(*),
        contributions:advance_collection_contributions(
          *,
          user:profiles!advance_collection_contributions_user_id_fkey(*)
        )
      `)
      .eq('id', collection.id)
      .single();

    if (fetchError) throw fetchError;

    // Get group and recipient info for emails
    const { data: group } = await supabase
      .from('groups')
      .select('name')
      .eq('id', request.group_id)
      .single();

    const { data: recipient } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', request.recipient_id)
      .single();

    const { data: creator } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single();

    const recipientName = recipient?.full_name || 'Someone';
    const groupName = group?.name || 'the group';
    const creatorName = creator?.full_name || 'A member';

    // Send notifications and emails to all group members
    try {
      const { data: members } = await supabase
        .from('group_members')
        .select('user_id, user:profiles(email, full_name, phone)')
        .eq('group_id', request.group_id);

      if (members) {
        for (const member of members) {
          const memberProfile = member.user as any;

          // Send in-app notification
          if (member.user_id !== user.id) {
            try {
              await notificationService.createNotification({
                user_id: member.user_id,
                title: 'New Advance Collection',
                message: `A new advance collection of ₹${perMemberAmount!.toFixed(2)} per member has been created. Recipient: ${recipientName}`,
                type: 'payment_received',
                related_id: collection.id,
                metadata: {
                  collection_id: collection.id,
                  group_id: request.group_id,
                  recipient_id: request.recipient_id,
                  per_member_amount: perMemberAmount,
                },
              });
            } catch (error) {
              console.error('Error sending notification:', error);
            }
          }

          // Send email to all members
          if (memberProfile?.email) {
            try {
              const emailHtml = `
                <!DOCTYPE html>
                <html>
                <head>
                  <meta charset="UTF-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                </head>
                <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
                  <table role="presentation" style="width: 100%; border-collapse: collapse;">
                    <tr>
                      <td style="padding: 40px 20px; text-align: center;">
                        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                          <!-- Header -->
                          <tr>
                            <td style="background-color: #6200EE; padding: 30px 20px; text-align: center;">
                              <h1 style="color: #ffffff; margin: 0; font-size: 24px;">💰 New Advance Collection</h1>
                            </td>
                          </tr>
                          
                          <!-- Content -->
                          <tr>
                            <td style="padding: 30px 20px;">
                              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">Hi ${memberProfile.full_name || 'there'},</p>
                              
                              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                                <strong>${creatorName}</strong> has created a new advance collection in <strong>"${groupName}"</strong>.
                              </p>
                              
                              <div style="background-color: #f5f5f5; border-left: 4px solid #6200EE; padding: 15px; margin: 20px 0; border-radius: 4px;">
                                <p style="color: #333333; font-size: 14px; margin: 5px 0; font-weight: bold;">Collection Details:</p>
                                <p style="color: #333333; font-size: 14px; margin: 5px 0;"><strong>Recipient:</strong> ${recipientName}</p>
                                <p style="color: #333333; font-size: 14px; margin: 5px 0;"><strong>Amount per Member:</strong> ₹${perMemberAmount!.toFixed(2)}</p>
                                <p style="color: #333333; font-size: 14px; margin: 5px 0;"><strong>Total Amount:</strong> ₹${totalAmount!.toFixed(2)}</p>
                                ${request.description ? `<p style="color: #333333; font-size: 14px; margin: 5px 0;"><strong>Description:</strong> ${request.description}</p>` : ''}
                              </div>
                              
                              <div style="background-color: #e3f2fd; border-left: 4px solid #2196F3; padding: 15px; margin: 20px 0; border-radius: 4px;">
                                <p style="color: #1565c0; font-size: 14px; margin: 0 0 10px 0; line-height: 1.6; font-weight: bold;">
                                  📱 Next Steps:
                                </p>
                                <ol style="color: #1565c0; font-size: 14px; margin: 0; padding-left: 20px; line-height: 1.8;">
                                  <li>Open the Flatmates Expense Tracker app</li>
                                  <li>Go to the group "${groupName}"</li>
                                  <li>Navigate to Advance Collections</li>
                                  <li>Mark your contribution as paid (₹${perMemberAmount!.toFixed(2)})</li>
                                  <li>Wait for ${recipientName} to approve your payment</li>
                                </ol>
                              </div>
                            </td>
                          </tr>
                          
                          <!-- Footer -->
                          <tr>
                            <td style="padding: 20px; text-align: center; border-top: 1px solid #eeeeee;">
                              <p style="color: #999999; font-size: 12px; margin: 0;">
                                This is an automated notification from Flatmates Expense Tracker.
                              </p>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </body>
                </html>
              `;

              // Skip email on web (CORS issues - mobile only)
              if (Platform.OS !== 'web') {
                fetch('https://send-email-nu-five.vercel.app/api/send-email', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    to: memberProfile.email,
                    subject: `New Advance Collection in "${groupName}" - ₹${perMemberAmount!.toFixed(2)} per member`,
                    html: emailHtml,
                  }),
                }).catch(error => console.log('Email send skipped (mobile-only feature)'));
              }

              // Send WhatsApp message if phone number is available
              if (memberProfile?.phone) {
                try {
                  await sendWhatsAppMessageFromHtml(
                    memberProfile.phone,
                    emailHtml,
                    `New Advance Collection in "${groupName}". Amount per member: ₹${perMemberAmount!.toFixed(2)}. Recipient: ${recipientName}. Open the app to mark your contribution as paid.`
                  );
                } catch (whatsappError: any) {
                  // Log but don't throw - WhatsApp is optional
                  console.error('WhatsApp sending failed for advance collection:', whatsappError.message);
                }
              }
            } catch (error) {
              console.error('Error sending email to member:', error);
              // Don't throw - continue with other members
            }
          }
        }
      }
    } catch (error) {
      console.error('Error sending advance collection notifications/emails:', error);
      // Don't throw - collection is already created
    }

    return completeCollection;
  },

  /**
   * Get advance collection by ID
   */
  getAdvanceCollection: async (collectionId: string): Promise<GroupAdvanceCollection> => {
    const { data, error } = await supabase
      .from('group_advance_collections')
      .select(`
        *,
        recipient:profiles!group_advance_collections_recipient_id_fkey(*),
        created_by_user:profiles!group_advance_collections_created_by_fkey(*),
        contributions:advance_collection_contributions(
          *,
          user:profiles!advance_collection_contributions_user_id_fkey(*)
        )
      `)
      .eq('id', collectionId)
      .single();

    if (error) throw error;
    return data as any;
  },

  /**
   * Get all advance collections for a group with optional filtering and pagination
   */
  getAdvanceCollections: async (
    groupId: string,
    options?: {
      page?: number;
      limit?: number;
      status?: 'active' | 'completed' | 'all';
      dateFrom?: string;
      dateTo?: string;
    }
  ): Promise<GroupAdvanceCollection[]> => {
    let query = supabase
      .from('group_advance_collections')
      .select(`
        *,
        recipient:profiles!group_advance_collections_recipient_id_fkey(*),
        created_by_user:profiles!group_advance_collections_created_by_fkey(*),
        contributions:advance_collection_contributions(
          *,
          user:profiles!advance_collection_contributions_user_id_fkey(*)
        )
      `)
      .eq('group_id', groupId)
      .order('created_at', { ascending: false });

    // Apply filters
    if (options?.status && options.status !== 'all') {
      query = query.eq('status', options.status);
    }

    if (options?.dateFrom) {
      query = query.gte('created_at', options.dateFrom);
    }

    if (options?.dateTo) {
      // Add one day to dateTo to include the whole day
      const nextDay = new Date(options.dateTo);
      nextDay.setDate(nextDay.getDate() + 1);
      query = query.lt('created_at', nextDay.toISOString());
    }

    // Apply pagination
    if (options?.page !== undefined && options?.limit !== undefined) {
      const from = (options.page - 1) * options.limit;
      const to = from + options.limit - 1;
      query = query.range(from, to);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data as any;
  },

  /**
   * Contribute to advance collection (marks as pending_approval, requires recipient approval)
   */
  contributeToCollection: async (contributionId: string, notes?: string): Promise<AdvanceCollectionContribution> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // 1. Mark as PAID immediately (auto-approval)
    const { data, error } = await supabase
      .from('advance_collection_contributions')
      .update({
        status: 'paid', // Changed from 'pending_approval' to 'paid'
        contributed_at: new Date().toISOString(),
        approved_at: new Date().toISOString(), // Auto-approved
        approved_by: user.id, // Auto-approved by self/system
        notes: notes || null,
      })
      .eq('id', contributionId)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) throw error;

    // Get collection details
    const { data: collection } = await supabase
      .from('group_advance_collections')
      .select('id, recipient_id, total_amount')
      .eq('id', data.collection_id)
      .single();

    if (collection) {
      // Get contributor info
      const { data: contributor } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single();

      // Notify recipient that payment was received (instead of pending approval)
      if (user.id !== collection.recipient_id) {
        try {
          await notificationService.createNotification({
            user_id: collection.recipient_id,
            title: 'Payment Received',
            message: `${contributor?.full_name || 'A member'} has paid their contribution (₹${data.amount.toFixed(2)}).`,
            type: 'payment_received',
            related_id: collection.id,
            metadata: {
              collection_id: collection.id,
              contribution_id: contributionId,
              amount: data.amount,
            },
          });
        } catch (error) {
          console.error('Error sending payment notification:', error);
        }
      }

      // 2. Check if collection is COMPLETED
      const { data: allContributions } = await supabase
        .from('advance_collection_contributions')
        .select('status')
        .eq('collection_id', collection.id);

      const allPaid = allContributions?.every(c => c.status === 'paid');

      if (allPaid) {
        await supabase
          .from('group_advance_collections')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
          })
          .eq('id', collection.id);

        // Notify recipient of completion
        if (user.id !== collection.recipient_id) {
          try {
            await notificationService.createNotification({
              user_id: collection.recipient_id,
              title: 'Advance Collection Completed',
              message: `All members have contributed. Total received: ₹${collection.total_amount?.toFixed(2) || '0.00'}`,
              type: 'payment_received',
              related_id: collection.id,
              metadata: {
                collection_id: collection.id,
                total_amount: collection.total_amount,
              },
            });
          } catch (error) {
            console.error('Error sending completion notification:', error);
          }
        }
      }
    }

    return data;
  },

  /**
   * Approve a contribution (recipient only)
   */
  approveContribution: async (contributionId: string): Promise<AdvanceCollectionContribution> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Get contribution and collection to verify recipient
    const { data: contribution, error: contribError } = await supabase
      .from('advance_collection_contributions')
      .select('*, collection:group_advance_collections!inner(recipient_id)')
      .eq('id', contributionId)
      .single();

    if (contribError || !contribution) throw new Error('Contribution not found');

    const collection = contribution.collection as any;
    if (collection.recipient_id !== user.id) {
      throw new Error('Only the recipient can approve contributions');
    }

    // Update contribution to paid
    const { data: updated, error: updateError } = await supabase
      .from('advance_collection_contributions')
      .update({
        status: 'paid',
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      })
      .eq('id', contributionId)
      .select()
      .single();

    if (updateError) throw updateError;

    // Check if all contributions are paid, then mark collection as completed
    const { data: allContributions } = await supabase
      .from('advance_collection_contributions')
      .select('status')
      .eq('collection_id', collection.id);

    const allPaid = allContributions?.every(c => c.status === 'paid');
    if (allPaid) {
      await supabase
        .from('group_advance_collections')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', collection.id);

      // Notify recipient that collection is complete
      try {
        await notificationService.createNotification({
          user_id: collection.recipient_id,
          title: 'Advance Collection Completed',
          message: `All members have contributed. Total received: ₹${collection.total_amount?.toFixed(2) || '0.00'}`,
          type: 'payment_received',
          related_id: collection.id,
          metadata: {
            collection_id: collection.id,
            total_amount: collection.total_amount,
          },
        });
      } catch (error) {
        console.error('Error sending collection completion notification:', error);
      }
    }

    return updated;
  },

  /**
   * Reject a contribution (recipient only)
   */
  rejectContribution: async (contributionId: string, reason?: string): Promise<AdvanceCollectionContribution> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Get contribution and collection to verify recipient
    const { data: contribution, error: contribError } = await supabase
      .from('advance_collection_contributions')
      .select('*, collection:group_advance_collections!inner(recipient_id)')
      .eq('id', contributionId)
      .single();

    if (contribError || !contribution) throw new Error('Contribution not found');

    const collection = contribution.collection as any;
    if (collection.recipient_id !== user.id) {
      throw new Error('Only the recipient can reject contributions');
    }

    // Update contribution back to pending
    const { data: updated, error: updateError } = await supabase
      .from('advance_collection_contributions')
      .update({
        status: 'pending',
        contributed_at: null,
        notes: reason ? `Rejected: ${reason}` : 'Rejected by recipient',
      })
      .eq('id', contributionId)
      .select()
      .single();

    if (updateError) throw updateError;

    // Notify contributor that their contribution was rejected
    try {
      await notificationService.createNotification({
        user_id: contribution.user_id,
        title: 'Contribution Rejected',
        message: reason || 'Your contribution was rejected. Please contact the recipient.',
        type: 'payment_received',
        related_id: collection.id,
        metadata: {
          collection_id: collection.id,
          contribution_id: contributionId,
        },
      });
    } catch (error) {
      console.error('Error sending rejection notification:', error);
    }

    return updated;
  },

  /**
   * Get bulk payment statistics for a group
   */
  getBulkPaymentStats: async (groupId: string): Promise<{
    activeCount: number;
    totalCount: number;
    completedCount: number;
    pendingCount: number;
    totalAmount: number;
    pendingAmount: number;
    activeAmount: number;
  }> => {
    // Get all collections for the group
    const { data: collections, error: collectionsError } = await supabase
      .from('group_advance_collections')
      .select('id, status, total_amount, contributions:advance_collection_contributions(status, amount)')
      .eq('group_id', groupId);

    if (collectionsError) throw collectionsError;

    const stats = {
      activeCount: 0,
      totalCount: collections?.length || 0,
      completedCount: 0,
      pendingCount: 0,
      totalAmount: 0,
      pendingAmount: 0,
      activeAmount: 0,
    };

    collections?.forEach(collection => {
      const contributions = collection.contributions as any[] || [];

      if (collection.status === 'active') {
        stats.activeCount++;
        stats.activeAmount += Number(collection.total_amount || 0);
      } else if (collection.status === 'completed') {
        stats.completedCount++;
      }

      stats.totalAmount += Number(collection.total_amount || 0);

      // Count pending contributions
      contributions.forEach(contrib => {
        if (contrib.status === 'pending' || contrib.status === 'pending_approval') {
          stats.pendingCount++;
          stats.pendingAmount += Number(contrib.amount || 0);
        }
      });
    });

    return stats;
  },

  /**
   * Get bulk settlement summary
   */
  getBulkSettlementSummary: async (groupId: string, recipientId: string): Promise<BulkSettlementSummary> => {
    // Get all group balances
    const balances = await groupService.getGroupBalances(groupId);

    // Get recipient info
    const { data: recipient } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('id', recipientId)
      .single();

    if (!recipient) throw new Error('Recipient not found');

    // Get all expenses with splits for this group
    const { data: expenses } = await supabase
      .from('expenses')
      .select(`
        id,
        splits:expense_splits(
          user_id,
          is_settled
        )
      `)
      .eq('group_id', groupId);

    // Calculate debts owed to recipient
    const memberDebts = balances
      .filter(b => b.user_id !== recipientId && b.balance < 0)
      .map((balance: any) => {
        // Get expense count for this user (unsettled splits)
        const expenseCount = expenses?.filter((e: any) =>
          e.splits?.some((s: any) => s.user_id === balance.user_id && !s.is_settled)
        ).length || 0;

        return {
          user_id: balance.user_id,
          user_name: '', // Will be populated from members
          total_owed: Math.abs(balance.balance),
          expense_count: expenseCount,
        };
      });

    // Get user names
    const userIds = memberDebts.map(d => d.user_id);
    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds);

      memberDebts.forEach(debt => {
        const user = users?.find(u => u.id === debt.user_id);
        debt.user_name = user?.full_name || 'Unknown';
      });
    }

    const totalAmount = memberDebts.reduce((sum, debt) => sum + debt.total_owed, 0);

    return {
      recipient_id: recipientId,
      recipient_name: recipient.full_name || 'Unknown',
      total_amount: totalAmount,
      member_debts: memberDebts,
    };
  },

  /**
   * Create bulk settlement
   */
  createBulkSettlement: async (request: {
    group_id: string;
    recipient_id: string;
    notes?: string;
  }): Promise<Settlement[]> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Get settlement summary using the method (it's defined earlier in the object)
    // We'll use a workaround to avoid circular reference
    const getSummary = async () => {
      const balances = await groupService.getGroupBalances(request.group_id);
      const { data: recipient } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('id', request.recipient_id)
        .single();
      if (!recipient) throw new Error('Recipient not found');

      const { data: expensesData } = await supabase
        .from('expenses')
        .select(`
          id,
          splits:expense_splits(
            user_id,
            is_settled
          )
        `)
        .eq('group_id', request.group_id);

      const memberDebts = balances
        .filter((b: any) => b.user_id !== request.recipient_id && b.balance < 0)
        .map((balance: any) => {
          const expenseCount = expensesData?.filter((e: any) =>
            e.splits?.some((s: any) => s.user_id === balance.user_id && !s.is_settled)
          ).length || 0;
          return {
            user_id: balance.user_id,
            user_name: '',
            total_owed: Math.abs(balance.balance),
            expense_count: expenseCount,
          };
        });

      const userIds = memberDebts.map((d: any) => d.user_id);
      if (userIds.length > 0) {
        const { data: users } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', userIds);
        memberDebts.forEach((debt: any) => {
          const user = users?.find((u: any) => u.id === debt.user_id);
          debt.user_name = user?.full_name || 'Unknown';
        });
      }

      return {
        recipient_id: request.recipient_id,
        recipient_name: recipient.full_name || 'Unknown',
        total_amount: memberDebts.reduce((sum: number, debt: any) => sum + debt.total_owed, 0),
        member_debts: memberDebts,
      };
    };

    const summary = await getSummary();

    if (!summary || !summary.member_debts || summary.member_debts.length === 0) {
      throw new Error('No debts to settle');
    }

    // Generate bulk settlement ID
    const bulkSettlementId = `bulk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Create settlements for each member
    const settlements = summary.member_debts.map((debt: any) => ({
      group_id: request.group_id,
      from_user: debt.user_id,
      to_user: request.recipient_id,
      amount: debt.total_owed,
      notes: request.notes || `Bulk settlement - ${debt.expense_count} expenses`,
      is_bulk: true,
      bulk_settlement_id: bulkSettlementId,
      settled_at: new Date().toISOString(),
    }));

    const { data: createdSettlements, error: settlementsError } = await supabase
      .from('settlements')
      .insert(settlements)
      .select();

    if (settlementsError) throw settlementsError;

    // Mark all expense splits as settled for these users
    const userIds = summary.member_debts.map((d: any) => d.user_id);
    const { data: expensesData } = await supabase
      .from('expenses')
      .select('id')
      .eq('group_id', request.group_id);

    const expenseIds = expensesData?.map((e: any) => e.id) || [];

    if (expenseIds.length > 0) {
      await supabase
        .from('expense_splits')
        .update({
          is_settled: true,
          settled_at: new Date().toISOString(),
        })
        .in('expense_id', expenseIds)
        .in('user_id', userIds)
        .eq('is_settled', false);
    }

    // Create notifications for all members
    try {
      // Notify recipient
      await notificationService.createNotification({
        user_id: request.recipient_id,
        title: 'Bulk Settlement Received',
        message: `You received ₹${summary.total_amount.toFixed(2)} from ${summary.member_debts.length} member(s)`,
        type: 'payment_received',
        related_id: null,
        metadata: {
          group_id: request.group_id,
          total_amount: summary.total_amount,
          is_bulk: true,
        },
      });

      // Notify each member who paid
      for (const debt of summary.member_debts) {
        await notificationService.createNotification({
          user_id: debt.user_id,
          title: 'Bulk Settlement',
          message: `You paid ₹${debt.total_owed.toFixed(2)} to ${summary.recipient_name} (${debt.expense_count} expenses)`,
          type: 'payment_received',
          related_id: null,
          metadata: {
            group_id: request.group_id,
            recipient_id: request.recipient_id,
            amount: debt.total_owed,
            is_bulk: true,
          },
        });
      }
    } catch (error) {
      console.error('Error creating bulk settlement notifications:', error);
    }

    return createdSettlements || [];
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
