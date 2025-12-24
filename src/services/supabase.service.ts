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
} from '../types/database.types';

// ============================================
// AUTHENTICATION
// ============================================

// Helper to process invitations
const processPendingInvitations = async (email: string, userId: string) => {
  try {
    // Check for invitations by email (invitation token is stored in group_invitations table)
    const { data: invitations } = await supabase
      .from('group_invitations')
      .select('*, group:groups(*)')
      .eq('invited_email', email.toLowerCase())
      .eq('status', 'pending');

    if (invitations && invitations.length > 0) {
      // Add user to all groups they were invited to
      const memberInserts = invitations.map(inv => ({
        group_id: inv.group_id,
        user_id: userId,
        role: 'member' as const,
      }));

      await supabase
        .from('group_members')
        .insert(memberInserts);

      // Update all invitations to accepted
      const invitationIds = invitations.map(inv => inv.id);
      await supabase
        .from('group_invitations')
        .update({ status: 'accepted' })
        .in('id', invitationIds);

      console.log(`Processed ${invitations.length} invitations for ${email}`);
    }
  } catch (inviteError) {
    console.error('Failed to process invitations:', inviteError);
  }
};

export const authService = {
  signUp: async (email: string, password: string, fullName: string, invitationToken?: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
        emailRedirectTo: undefined, // Don't auto-confirm
      },
    });
    if (error) throw error;

    // Note: Invitation token is already stored in group_invitations table
    // We don't need to store it in user metadata - we'll look it up by email when user logs in

    // Sign out immediately after signup to prevent auto-login
    // User must verify email and then manually log in
    await supabase.auth.signOut();

    // Note: We don't process invitations here because user needs to verify email first
    // Invitations will be processed when user logs in after verification
    // (handled in signIn flow - looks up invitations by email)

    return data;
  },

  signIn: async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;

    // After successful login, check for pending invitations and process them
    // Done in background to prevent blocking login
    if (data.user) {
      processPendingInvitations(email, data.user.id).catch(err =>
        console.error('Background invitation processing failed:', err)
      );
    }

    return data;
  },

  signOut: async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  getCurrentUser: async () => {
    try {
      // getSession() reads from local storage and is offline-friendly
      const { data: { session }, error } = await supabase.auth.getSession();

      // If we have a session (even if expired/refresh failed), use it for offline access
      if (session?.user) {
        if (error) {
          console.warn('getSession had error but returned session (ignoring for offline support):', error);
        }
        return session.user;
      }

      if (error) {
        console.warn('getSession failed:', error);
        // Fallback to getUser only if we have working network, but here we just try-catch it
        // If we are offline, getUser will throw, so we catch it
        try {
          const { data: { user }, error: userError } = await supabase.auth.getUser();
          if (userError) throw userError;
          return user;
        } catch (e) {
          console.warn('getUser fallback failed (likely offline):', e);
          return null; // Return null instead of throwing to prevent app crash/logout loop
        }
      }

      return null;
    } catch (err) {
      console.error('getCurrentUser unexpected error:', err);
      return null;
    }
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
  verifyOtp: async (email: string, token: string) => {
    const { data, error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: token.trim(),
      type: 'recovery',
    });
    if (error) throw error;
    return data;
  },

  sendOtp: async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) throw error;
  },
};

// ============================================
// PROFILE
// ============================================

export const profileService = {
  getProfile: async (userId: string): Promise<Profile | null> => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    // Handle case where profile doesn't exist (PGRST116)
    if (error) {
      if (error.code === 'PGRST116') {
        // Profile doesn't exist yet - return null instead of throwing
        console.warn(`Profile not found for user ${userId}. This may happen if the profile trigger hasn't run yet.`);
        return null;
      }
      throw error;
    }
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
    // First, get the method to get user_id
    const { data: method, error: fetchError } = await supabase
      .from('user_payment_methods')
      .select('user_id')
      .eq('id', methodId)
      .single();

    if (fetchError) throw fetchError;

    // Unset all other defaults for this user
    await supabase
      .from('user_payment_methods')
      .update({ is_default: false })
      .eq('user_id', method.user_id)
      .neq('id', methodId);

    // Set this one as default
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
   * Send invitation email via external email API
   */
  async sendInvitationEmail(
    recipientEmail: string,
    inviterName: string,
    groupName: string,
    password: string | null,
    appLink: string,
    webLink: string
  ): Promise<void> {
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
                    <h1 style="color: #ffffff; margin: 0; font-size: 24px;">🎉 You've been invited!</h1>
                  </td>
                </tr>
                
                <!-- Content -->
                <tr>
                  <td style="padding: 30px 20px;">
                    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">Hi there,</p>
                    
                    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                      <strong>${inviterName}</strong> has invited you to join the group <strong>"${groupName}"</strong> on Flatmates Expense Tracker.
                    </p>
                    
                    ${password ? `
                    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
                      Use the credentials below to create your account and join the group:
                    </p>
                    
                    <!-- Credentials Box -->
                    <table role="presentation" style="width: 100%; background-color: #f8f9fa; border-radius: 6px; padding: 20px; margin: 0 0 30px 0; border: 1px solid #e0e0e0;">
                      <tr>
                        <td style="padding: 0 0 10px 0;">
                          <p style="color: #666666; font-size: 14px; margin: 0; font-weight: bold;">Email:</p>
                          <p style="color: #333333; font-size: 16px; margin: 5px 0 0 0; font-family: monospace;">${recipientEmail}</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 10px 0 0 0;">
                          <p style="color: #666666; font-size: 14px; margin: 0; font-weight: bold;">Password:</p>
                          <p style="color: #333333; font-size: 18px; margin: 5px 0 0 0; font-family: monospace; font-weight: bold; letter-spacing: 2px;">${password}</p>
                        </td>
                      </tr>
                    </table>
                    ` : `
                    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
                      Open the app to view and accept this invitation.
                    </p>
                    `}
                    
                    <!-- Button -->
                    <table role="presentation" style="width: 100%; margin: 0 0 20px 0;">
                      <tr>
                        <td style="text-align: center; padding: 0;">
                          <a href="${appLink}" style="display: inline-block; background-color: #6200EE; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: bold; font-size: 16px; text-align: center; min-width: 200px;">
                            ${password ? 'Open App & Sign Up' : 'Open App & View Invitation'}
                          </a>
                        </td>
                      </tr>
                    </table>
                    
                    ${password ? `
                    <!-- Instructions for New Users -->
                    <div style="background-color: #e3f2fd; border-left: 4px solid #2196F3; padding: 15px; margin: 20px 0; border-radius: 4px;">
                      <p style="color: #1565c0; font-size: 14px; margin: 0 0 10px 0; line-height: 1.6; font-weight: bold;">
                        📱 How to Sign Up:
                      </p>
                      <ol style="color: #1565c0; font-size: 14px; margin: 0; padding-left: 20px; line-height: 1.8;">
                        <li>Click the button above to open the app (or install it if needed)</li>
                        <li>Go to the Sign Up screen and use the email and password shown above</li>
                        <li>You'll automatically be added to the group &quot;${groupName}&quot; after signup</li>
                      </ol>
                    </div>
                    
                    <!-- Manual Sign Up Option -->
                    <div style="background-color: #f5f5f5; border: 1px solid #e0e0e0; padding: 15px; margin: 20px 0; border-radius: 4px;">
                      <p style="color: #666666; font-size: 13px; margin: 0 0 8px 0; font-weight: bold;">
                        Can't open the app? Sign up manually:
                      </p>
                      <p style="color: #333333; font-size: 13px; margin: 0; line-height: 1.6;">
                        Open the Flatmates Expense Tracker app and sign up with these credentials:<br/>
                        <strong>Email:</strong> ${recipientEmail}<br/>
                        <strong>Password:</strong> ${password}<br/>
                        <em style="color: #666;">(You'll be automatically added to the group after signup)</em>
                      </p>
                    </div>
                    ` : `
                    <!-- Instructions for Existing Users -->
                    <div style="background-color: #e3f2fd; border-left: 4px solid #2196F3; padding: 15px; margin: 20px 0; border-radius: 4px;">
                      <p style="color: #1565c0; font-size: 14px; margin: 0 0 10px 0; line-height: 1.6; font-weight: bold;">
                        📱 How to Accept:
                      </p>
                      <ol style="color: #1565c0; font-size: 14px; margin: 0; padding-left: 20px; line-height: 1.8;">
                        <li>Click the button above to open the app</li>
                        <li>Go to Profile → Group Invitations</li>
                        <li>Accept the invitation to join &quot;${groupName}&quot;</li>
                      </ol>
                    </div>
                    `}
                  </td>
                </tr>
                
                <!-- Footer -->
                <tr>
                  <td style="padding: 20px; text-align: center; border-top: 1px solid #eeeeee;">
                    <p style="color: #999999; font-size: 12px; margin: 0;">
                      If you didn't expect this invitation, you can safely ignore this email.
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

    try {
      // Call external email API directly
      const response = await fetch('https://send-email-nu-five.vercel.app/api/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: recipientEmail,
          subject: `You're invited to join "${groupName}" on Flatmates Expense Tracker`,
          html: emailHtml,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Email API error response:', errorText);
        throw new Error(`Email API returned status ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      console.log('Email sent successfully:', result);
    } catch (error: any) {
      console.error('Email sending failed:', error);
      // Log the full error for debugging
      console.error('Full error object:', JSON.stringify(error, null, 2));

      // Don't throw - invitation is still created even if email fails
      // This allows the invitation to work even if email service is down
      // But we still log it for debugging
      throw error;
    }
  },

  /**
   * Invite user to group
   */

  async inviteUser(request: InviteUserRequest): Promise<GroupInvitation> {
    const logContext = {
      action: "inviteUser",
      groupId: request.group_id,
      invitedEmail: request.invited_email,
      timestamp: new Date().toISOString(),
    };

    try {
      // Get current user
      const { data: { user }, error: authError } = await supabase.auth.getUser();

      if (authError) {
        console.error("Auth error:", { ...logContext, authError });
        throw new Error("Authentication failed. Please log in again.");
      }

      if (!user) {
        console.warn("Unauthorized access attempt:", logContext);
        throw new Error("Not authenticated.");
      }

      // Check admin permission
      const { data: group, error: groupError } = await supabase
        .from("groups")
        .select("*")
        .eq("id", request.group_id)
        .eq("created_by", user.id)
        .single();

      if (groupError || !group) {
        console.warn("Permission denied:", { ...logContext, groupError });
        throw new Error("Only the group admin can invite users.");
      }
      console.log("request.invited_email", request.invited_email);
      // Check if user already exists
      const { data: existingProfile, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", request.invited_email)
        // .maybeSingle();
        .single();
      console.log("existingProfile", existingProfile);
      console.log("profileError", profileError);

      if (profileError && profileError.code !== "PGRST116") {
        console.error("Profile lookup failed:", { ...logContext, profileError });
        throw new Error("Failed to check existing user profile.");
      }

      // If user exists already, just create invitation (no password, no user creation)
      if (existingProfile) {
        console.log("User exists, creating simple invitation:", logContext);

        // Check if user is already a member
        const { data: existingMember } = await supabase
          .from("group_members")
          .select("id")
          .eq("group_id", request.group_id)
          .eq("user_id", existingProfile.id)
          .single();

        if (existingMember) {
          throw new Error("User is already a member of this group.");
        }

        // Check if invitation already exists
        const { data: existingInvitation } = await supabase
          .from("group_invitations")
          .select("id, status")
          .eq("group_id", request.group_id)
          .eq("invited_email", request.invited_email)
          .single();

        if (existingInvitation) {
          if (existingInvitation.status === "pending") {
            throw new Error("Invitation already sent to this user.");
          }
          // If expired or rejected, create a new one
        }

        // Generate invitation token
        const token = this.generateInvitationToken();

        // Create invitation for existing user (no password field)
        const { data: invitation, error: invError } = await supabase
          .from("group_invitations")
          .insert({
            group_id: request.group_id,
            invited_by: user.id,
            invited_email: request.invited_email,
            invitation_token: token,
            status: "pending",
          })
          .select()
          .single();

        if (invError) {
          console.error("Failed to create invitation for existing user:", { ...logContext, invError });
          throw new Error("Failed to create invitation.");
        }

        // Get inviter profile for email
        const { data: inviterProfile, error: inviterError } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .single();

        if (inviterError) {
          console.warn("Could not fetch inviter profile:", { ...logContext, inviterError });
        }

        // Send simple invitation email (no password, no credentials)
        try {
          const appLink = `flatmates://invitations`;

          await this.sendInvitationEmail(
            request.invited_email,
            inviterProfile?.full_name || "Someone",
            group.name,
            null, // No password for existing users
            appLink,
            appLink
          );
        } catch (emailError) {
          console.error("Email sending failed for existing user:", { ...logContext, emailError });
          // Don't fail invitation if email fails
        }

        return invitation;
      }
      // User doesn't exist - send download email
      try {
        const { data: inviterProfile } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
        const downloadUrl = process.env.DOWNLOAD_URL || 'https://github.com/IsmailofficialGithub/expense-management';
        const html = `<!DOCTYPE html><html><body style="font-family: Arial; max-width: 600px; margin: 0 auto; padding: 20px;"><h2>🎉 You've been invited!</h2><p>Hi there,</p><p><strong>${inviterProfile?.full_name || "Someone"}</strong> invited you to use Flatmates Expense Tracker to join the group <strong>"${group.name}"</strong>.</p><p>Download the app to get started:</p><a href="${downloadUrl}" style="display: inline-block; background: #6200EE; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 10px 0;">Download App</a></body></html>`;
        await fetch('https://send-email-nu-five.vercel.app/api/send-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: request.invited_email, subject: "You're invited to use Flatmates Expense Tracker", html }) });
        return { id: 'email-sent', group_id: request.group_id, invited_by: user.id, invited_email: request.invited_email, invitation_token: null, status: 'email_sent', created_at: new Date().toISOString() } as any;
      } catch (emailError) {
        throw new Error("Failed to send download email.");
      }
    } catch (err: any) {
      console.error("Unhandled error in inviteUser:", { ...logContext, error: err });
      throw new Error(err.message || "Something went wrong while inviting the user.");
    }
  },

  /**
   * Get invitations sent by user (for a specific group)
   */
  async getMyInvitations(groupId: string): Promise<GroupInvitation[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data, error } = await supabase
      .from("group_invitations")
      .select("*")
      .eq("group_id", groupId)
      .eq("invited_by", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  },

  /**
   * Get pending invitations for current user (invitations received)
   */
  async getPendingInvitations(): Promise<GroupInvitationWithDetails[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    // Get user's email
    const userEmail = user.email?.toLowerCase();
    if (!userEmail) throw new Error("User email not found");

    const { data, error } = await supabase
      .from("group_invitations")
      .select(`
        *,
        group:groups(*)
      `)
      .eq("invited_email", userEmail)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data || []) as GroupInvitationWithDetails[];
  },

  /**
   * Accept a group invitation
   */
  async acceptInvitation(invitationId: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    // Get the invitation
    const { data: invitation, error: invError } = await supabase
      .from("group_invitations")
      .select("*")
      .eq("id", invitationId)
      .eq("status", "pending")
      .single();

    if (invError || !invitation) {
      throw new Error("Invitation not found or already processed");
    }

    // Verify the invitation is for this user
    const userEmail = user.email?.toLowerCase();
    if (invitation.invited_email.toLowerCase() !== userEmail) {
      throw new Error("This invitation is not for you");
    }

    // Add user to group
    const { error: memberError } = await supabase
      .from("group_members")
      .insert({
        group_id: invitation.group_id,
        user_id: user.id,
        role: "member",
      });

    if (memberError) {
      // Check if already a member
      if (memberError.code === "23505") {
        // User is already a member, just update invitation status
        await supabase
          .from("group_invitations")
          .update({ status: "accepted", accepted_at: new Date().toISOString() })
          .eq("id", invitationId);
        return;
      }
      throw memberError;
    }

    // Update invitation status
    await supabase
      .from("group_invitations")
      .update({ status: "accepted", accepted_at: new Date().toISOString() })
      .eq("id", invitationId);
  },

  /**
   * Reject a group invitation
   */
  async rejectInvitation(invitationId: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    // Get the invitation
    const { data: invitation, error: invError } = await supabase
      .from("group_invitations")
      .select("*")
      .eq("id", invitationId)
      .eq("status", "pending")
      .single();

    if (invError || !invitation) {
      throw new Error("Invitation not found or already processed");
    }

    // Verify the invitation is for this user
    const userEmail = user.email?.toLowerCase();
    if (invitation.invited_email.toLowerCase() !== userEmail) {
      throw new Error("This invitation is not for you");
    }

    // Update invitation status to expired (we use expired as rejected)
    await supabase
      .from("group_invitations")
      .update({ status: "expired" })
      .eq("id", invitationId);
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

    // Trigger notifications for group members
    try {
      await notificationService.triggerExpenseNotifications(expense.id, request.group_id);
    } catch (error) {
      console.error('Failed to trigger notifications:', error);
      // Don't fail expense creation if notifications fail
    }

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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // First, get all group IDs where user is a member
    const { data: memberGroups, error: memberError } = await supabase
      .from('group_members')
      .select('group_id')
      .eq('user_id', user.id);

    if (memberError) throw memberError;
    if (!memberGroups || memberGroups.length === 0) return [];

    // Extract group IDs
    const groupIds = memberGroups.map((m: any) => m.group_id);

    // Fetch groups where current user is a member
    // RLS policies should also filter this, but we filter explicitly for safety
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
      .in('id', groupIds);

    if (error) throw error;

    // Additional client-side filter to ensure only groups with current user as member
    const filtered = (data || []).filter((group: any) => {
      return group.members?.some((member: any) => member.user_id === user.id);
    });

    return filtered as any;
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

    // Trigger notifications for group members
    try {
      await notificationService.triggerExpenseNotifications(expense.id, request.group_id);
    } catch (error) {
      console.error('Failed to trigger notifications:', error);
      // Don't fail expense creation if notifications fail
    }

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
        .select('user_id, user:profiles(email, full_name)')
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

              const response = await fetch('https://send-email-nu-five.vercel.app/api/send-email', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  to: memberProfile.email,
                  subject: `New Advance Collection in "${groupName}" - ₹${perMemberAmount!.toFixed(2)} per member`,
                  html: emailHtml,
                }),
              });

              if (!response.ok) {
                console.error('Email API error:', await response.text());
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

// ============================================
// NOTIFICATIONS
// ============================================

export const notificationService = {
  getNotifications: async (limit?: number, offset?: number): Promise<Notification[]> => {
    const user = await authService.getCurrentUser();
    if (!user) throw new Error('Not authenticated');

    let query = supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (limit) {
      query = query.limit(limit);
    }
    if (offset) {
      query = query.range(offset, offset + (limit || 50) - 1);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  getUnreadCount: async (): Promise<number> => {
    const user = await authService.getCurrentUser();
    if (!user) throw new Error('Not authenticated');

    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false);

    if (error) throw error;
    return count || 0;
  },

  createNotification: async (notification: {
    user_id: string;
    title: string;
    message: string;
    type: string;
    related_id?: string | null;
    metadata?: any;
  }): Promise<Notification> => {
    const { data, error } = await supabase
      .from('notifications')
      .insert({
        ...notification,
        is_read: false,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  triggerExpenseNotifications: async (expenseId: string, groupId: string): Promise<void> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Fetch expense details with splits and paid_by user
      const { data: expense, error: expenseError } = await supabase
        .from('expenses')
        .select(`
          *,
          paid_by_user:profiles!expenses_paid_by_fkey(id, full_name),
          splits:expense_splits(user_id, amount)
        `)
        .eq('id', expenseId)
        .single();

      if (expenseError || !expense) {
        console.error('Error fetching expense:', expenseError);
        return;
      }

      // Fetch all group members
      const { data: groupMembers, error: membersError } = await supabase
        .from('group_members')
        .select('user_id')
        .eq('group_id', groupId);

      if (membersError || !groupMembers) {
        console.error('Error fetching group members:', membersError);
        return;
      }

      const notifications = [];
      const paidByName = (expense.paid_by_user as any)?.full_name || 'Someone';

      // Create notifications for all group members (except the creator)
      for (const member of groupMembers) {
        if (member.user_id === expense.paid_by) {
          continue; // Skip the expense creator
        }

        // Find split for this user
        const userSplit = Array.isArray(expense.splits)
          ? (expense.splits as any[]).find((s: any) => s.user_id === member.user_id)
          : null;

        // Notification 1: New expense added to group
        notifications.push({
          user_id: member.user_id,
          title: 'New Expense Added',
          message: `${paidByName} added "${expense.description}" - ₹${Number(expense.amount).toFixed(2)}`,
          type: 'expense_added',
          is_read: false,
          related_id: expenseId,
          metadata: {
            expense_id: expenseId,
            group_id: groupId,
            amount: expense.amount,
          },
        });

        // Notification 2: Split amount assigned (if user has a split)
        if (userSplit && userSplit.amount > 0) {
          notifications.push({
            user_id: member.user_id,
            title: 'Amount Assigned to You',
            message: `You owe ₹${Number(userSplit.amount).toFixed(2)} for "${expense.description}"`,
            type: 'expense_split_assigned',
            is_read: false,
            related_id: expenseId,
            metadata: {
              expense_id: expenseId,
              group_id: groupId,
              split_amount: userSplit.amount,
              total_amount: expense.amount,
            },
          });
        }
      }

      // Insert all notifications in batch
      if (notifications.length > 0) {
        const { error: notificationError } = await supabase
          .from('notifications')
          .insert(notifications);

        if (notificationError) {
          console.error('Error creating notifications:', notificationError);
          // Don't throw - notifications are not critical for expense creation
        } else {
          // Send Expo push notifications for each notification
          try {
            const { sendExpoPushNotification, getGroupMemberPushTokens } = await import('./push-notifications.service');

            // Get push tokens for all recipients
            const pushTokens = await getGroupMemberPushTokens(groupId, expense.paid_by);

            if (pushTokens.length > 0) {
              // Send push notifications for expense_added type
              const expenseAddedNotifications = notifications.filter(n => n.type === 'expense_added');
              if (expenseAddedNotifications.length > 0) {
                const firstNotification = expenseAddedNotifications[0];
                // Get unread count for badge
                const { notificationService } = await import('./supabase.service');
                const unreadCount = await notificationService.getUnreadCount();

                await sendExpoPushNotification(
                  pushTokens,
                  firstNotification.title,
                  firstNotification.message,
                  {
                    type: firstNotification.type,
                    expense_id: expenseId,
                    group_id: groupId,
                  },
                  unreadCount
                );
              }

              // Send push notifications for expense_split_assigned type
              const splitNotifications = notifications.filter(n => n.type === 'expense_split_assigned');
              for (const splitNotif of splitNotifications) {
                // Get push token for this specific user
                const { data: userProfile } = await supabase
                  .from('profiles')
                  .select('push_token')
                  .eq('id', splitNotif.user_id)
                  .single();

                if (userProfile?.push_token && userProfile.push_token.startsWith('ExponentPushToken')) {
                  // Get unread count for badge
                  const { notificationService } = await import('./supabase.service');
                  const unreadCount = await notificationService.getUnreadCount();

                  await sendExpoPushNotification(
                    userProfile.push_token,
                    splitNotif.title,
                    splitNotif.message,
                    {
                      type: splitNotif.type,
                      expense_id: expenseId,
                      group_id: groupId,
                      split_amount: splitNotif.metadata?.split_amount,
                    },
                    unreadCount
                  );
                }
              }
            }
          } catch (pushError) {
            console.error('Error sending push notifications:', pushError);
            // Don't throw - push notifications are not critical
          }
        }
      }
    } catch (error) {
      console.error('Error triggering expense notifications:', error);
      // Don't throw - notifications are not critical for expense creation
    }
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
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          console.log('Realtime notification received:', payload);
          callback(payload);
        }
      )
      .subscribe((status) => {
        console.log('Notification subscription status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('Successfully subscribed to notifications for user:', userId);
        } else if (status === 'CHANNEL_ERROR') {
          console.error('Error subscribing to notifications channel');
        }
      });

    return channel;
  },

  unsubscribe: (channel: any) => {
    supabase.removeChannel(channel);
  },
};