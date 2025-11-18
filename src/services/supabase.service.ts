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
  PersonalTransaction,
  UserCompleteBalance,
  PersonalCategory,
  CreatePersonalTransactionRequest,
  ExpenseFoodItem,
  InviteUserRequest,
  GroupInvitation,
  UserPaymentMethod,
  CreatePaymentMethodRequest,
  HotelMenuItem,
  CreateMenuItemRequest,
  Hotel,
  CreateHotelRequest,
  HotelWithMenu,
  CreateFoodExpenseRequest,
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
uploadAvatar: async (imageUri: string): Promise<string> => {
  const user = await authService.getCurrentUser();
  if (!user) throw new Error('Not authenticated');

  // Get current profile to check for existing avatar
  const { data: profile } = await supabase
    .from('profiles')
    .select('avatar_url')
    .eq('id', user.id)
    .single();

  // Delete old avatar if exists
  if (profile?.avatar_url) {
    try {
      const urlParts = profile.avatar_url.split('/avatars/');
      if (urlParts.length > 1) {
        const oldFileName = urlParts[1];
        
        const { error: deleteError } = await supabase.storage
          .from('avatars')
          .remove([oldFileName]);

        if (deleteError) {
          console.warn('Failed to delete old avatar:', deleteError);
        } else {
          console.log('Old avatar deleted successfully');
        }
      }
    } catch (error) {
      console.warn('Error processing old avatar:', error);
    }
  }

  // Generate unique filename
  const fileExt = 'jpg';
  const fileName = `${user.id}-${Date.now()}.${fileExt}`;
  
  // Fetch image and convert to Uint8Array
  const response = await fetch(imageUri);
  
  if (!response.ok) {
    throw new Error('Failed to fetch image');
  }
  
  const arrayBuffer = await response.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);

  // Upload to Supabase Storage (no 'avatars/' prefix in path)
  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(fileName, uint8Array, {
      contentType: 'image/jpeg',
      cacheControl: '3600',
      upsert: false,
    });

  if (uploadError) {
    console.error('Avatar upload error:', uploadError);
    throw uploadError;
  }

  // Get public URL
  const { data: { publicUrl } } = supabase.storage
    .from('avatars')
    .getPublicUrl(fileName);

  console.log('Generated public URL:', publicUrl);

  // Update profile with new avatar URL
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ avatar_url: publicUrl })
    .eq('id', user.id);

  if (updateError) {
    console.error('Profile update error:', updateError);
    throw updateError;
  }

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
// HOTELS SERVICE
// ============================================

export const hotelService = {
  /**
   * Get all active hotels with menu items
   */
  async getHotels(): Promise<HotelWithMenu[]> {
    const { data, error } = await supabase
      .from('hotels')
      .select(`
        *,
        menu_items:hotel_menu_items(*)
      `)
      .eq('is_active', true)
      .order('name');

    if (error) throw error;
    return data || [];
  },

  /**
   * Get single hotel with menu
   */
  async getHotel(hotelId: string): Promise<HotelWithMenu> {
    const { data, error } = await supabase
      .from('hotels')
      .select(`
        *,
        menu_items:hotel_menu_items(*)
      `)
      .eq('id', hotelId)
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Create new hotel (group admin only)
   */
  async createHotel(request: CreateHotelRequest): Promise<Hotel> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('hotels')
      .insert({
        name: request.name,
        location: request.location || null,
        phone: request.phone || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Add menu item to hotel
   */
  async createMenuItem(request: CreateMenuItemRequest): Promise<HotelMenuItem> {
    const { data, error } = await supabase
      .from('hotel_menu_items')
      .insert(request)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Get menu items for a hotel
   */
  async getMenuItems(hotelId: string): Promise<HotelMenuItem[]> {
    const { data, error } = await supabase
      .from('hotel_menu_items')
      .select('*')
      .eq('hotel_id', hotelId)
      .eq('is_available', true)
      .order('category')
      .order('item_name');

    if (error) throw error;
    return data || [];
  },

  /**
   * Update menu item
   */
  async updateMenuItem(itemId: string, updates: Partial<HotelMenuItem>): Promise<HotelMenuItem> {
    const { data, error } = await supabase
      .from('hotel_menu_items')
      .update(updates)
      .eq('id', itemId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Delete menu item
   */
  async deleteMenuItem(itemId: string): Promise<void> {
    const { error } = await supabase
      .from('hotel_menu_items')
      .delete()
      .eq('id', itemId);

    if (error) throw error;
  },
};

// ============================================
// PAYMENT METHODS SERVICE
// ============================================

export const paymentMethodService = {
  /**
   * Get user's payment methods
   */
  async getPaymentMethods(userId: string): Promise<UserPaymentMethod[]> {
    const { data, error } = await supabase
      .from('user_payment_methods')
      .select('*')
      .eq('user_id', userId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  /**
   * Get default payment method
   */
  async getDefaultPaymentMethod(userId: string): Promise<UserPaymentMethod | null> {
    const { data, error } = await supabase
      .from('user_payment_methods')
      .select('*')
      .eq('user_id', userId)
      .eq('is_default', true)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data || null;
  },

  /**
   * Create payment method
   */
  async createPaymentMethod(request: CreatePaymentMethodRequest): Promise<UserPaymentMethod> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('user_payment_methods')
      .insert({
        user_id: user.id,
        ...request,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Update payment method
   */
  async updatePaymentMethod(
    methodId: string,
    updates: Partial<CreatePaymentMethodRequest>
  ): Promise<UserPaymentMethod> {
    const { data, error } = await supabase
      .from('user_payment_methods')
      .update(updates)
      .eq('id', methodId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Set as default payment method
   */
  async setDefaultPaymentMethod(methodId: string): Promise<UserPaymentMethod> {
    const { data, error } = await supabase
      .from('user_payment_methods')
      .update({ is_default: true })
      .eq('id', methodId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Delete payment method
   */
  async deletePaymentMethod(methodId: string): Promise<void> {
    const { error } = await supabase
      .from('user_payment_methods')
      .delete()
      .eq('id', methodId);

    if (error) throw error;
  },

  /**
   * Get visible payment methods in group
   */
  async getGroupMembersPaymentMethods(groupId: string): Promise<UserPaymentMethod[]> {
    const { data, error } = await supabase
      .from('user_payment_methods')
      .select(`
        *,
        user:profiles(id, full_name, email)
      `)
      .eq('is_visible_to_groups', true);

    if (error) throw error;
    return data || [];
  },
};

// ============================================
// INVITATION SERVICE
// ============================================

export const invitationService = {
  /**
   * Generate random password
   */
  generateRandomPassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let password = '';
    for (let i = 0; i < 8; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  },

  /**
   * Generate invitation token
   */
  generateInvitationToken(): string {
    return `inv_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
  },

  /**
   * Send invitation email via Nodemailer
   */
  async sendInvitationEmail(
    recipientEmail: string,
    inviterName: string,
    groupName: string,
    password: string,
    appLink: string
  ): Promise<void> {
    // This will be called from your backend/edge function
    // For now, we'll create the email template structure
    const emailTemplate = {
      to: recipientEmail,
      subject: `You're invited to join "${groupName}" on Flatmates Expense Tracker`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #6200EE;">🎉 You've been invited!</h2>
          
          <p>Hi there,</p>
          
          <p><strong>${inviterName}</strong> has invited you to join the group <strong>"${groupName}"</strong> on Flatmates Expense Tracker.</p>
          
          <p>An account has been created for you with these credentials:</p>
          
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Email:</strong> ${recipientEmail}</p>
            <p style="margin: 5px 0;"><strong>Temporary Password:</strong> <code style="background-color: #e0e0e0; padding: 2px 6px; border-radius: 3px;">${password}</code></p>
          </div>
          
          <p style="color: #F44336;"><strong>⚠️ Important:</strong> Please change your password after your first login for security.</p>
          
          <a href="${appLink}" style="display: inline-block; background-color: #6200EE; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 20px 0;">
            Open App & Login
          </a>
          
          <p style="color: #666; font-size: 12px; margin-top: 30px;">
            If you didn't expect this invitation, you can safely ignore this email.
          </p>
        </div>
      `,
    };

    // TODO: Send via Nodemailer from backend
    console.log('Email to send:', emailTemplate);
    
    // For now, just log it
    // In production, you'll make API call to your backend that uses nodemailer
  },

  /**
   * Invite user to group
   */
  async inviteUser(request: InviteUserRequest): Promise<GroupInvitation> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Check if user is group admin
    const { data: group } = await supabase
      .from('groups')
      .select('*')
      .eq('id', request.group_id)
      .eq('created_by', user.id)
      .single();

    if (!group) throw new Error('Only group admin can invite users');

    // Check if email already exists
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', request.invited_email)
      .single();

    if (existingProfile) {
      // User already exists, just add to group
      const { error: memberError } = await supabase
        .from('group_members')
        .insert({
          group_id: request.group_id,
          user_id: existingProfile.id,
          role: 'member',
        });

      if (memberError) throw memberError;
      
      throw new Error('User already exists and has been added to the group');
    }

    // Generate password and token
    const password = this.generateRandomPassword();
    const token = this.generateInvitationToken();

    // Create new user account via Supabase Admin API
    // Note: This requires service_role key, should be done on backend
    const { data: newUser, error: signupError } = await supabase.auth.admin.createUser({
      email: request.invited_email,
      password: password,
      email_confirm: true,
    });

    if (signupError) throw signupError;

    // Create invitation record
    const { data: invitation, error: invError } = await supabase
      .from('group_invitations')
      .insert({
        group_id: request.group_id,
        invited_by: user.id,
        invited_email: request.invited_email,
        invitation_token: token,
        auto_created_user_id: newUser.user.id,
        temporary_password: password, // In production, encrypt this
        status: 'pending',
      })
      .select()
      .single();

    if (invError) throw invError;

    // Add user to group
    await supabase
      .from('group_members')
      .insert({
        group_id: request.group_id,
        user_id: newUser.user.id,
        role: 'member',
      });

    // Get inviter profile
    const { data: inviterProfile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single();

    // Send email
    await this.sendInvitationEmail(
      request.invited_email,
      inviterProfile?.full_name || 'Someone',
      group.name,
      password,
      'flatmates://login' // Deep link to app
    );

    return invitation;
  },

  /**
   * Get invitations sent by user
   */
  async getMyInvitations(groupId: string): Promise<GroupInvitation[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('group_invitations')
      .select('*')
      .eq('group_id', groupId)
      .eq('invited_by', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },
};

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
        paid_by: user.id,
        date: request.date,
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
    const { error } = await supabase
      .from('personal_transactions')
      .delete()
      .eq('id', transactionId);

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