// src/services/domain/notify.ts
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
import { authService } from '../supabase.service';


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
    console.log('[Expense Notification] 🚀 triggerExpenseNotifications called', {
      expenseId,
      groupId,
      timestamp: new Date().toISOString(),
    });

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      console.log('[Expense Notification] User authenticated:', user.id);

      // Fetch expense details with splits and paid_by user
      const { data: expense, error: expenseError } = await supabase
        .from('expenses')
        .select(`
          *,
          paid_by_user:profiles!expenses_paid_by_fkey(id, full_name),
          splits:expense_splits(
            user_id, 
            amount,
            user:profiles(email, full_name)
          ),
          group:groups(name)
        `)
        .eq('id', expenseId)
        .single();

      if (expenseError || !expense) {
        console.error('[Expense Notification] ❌ Error fetching expense:', expenseError);
        return;
      }

      console.log('[Expense Notification] Expense fetched:', {
        description: expense.description,
        amount: expense.amount,
        paidBy: expense.paid_by,
      });

      const groupName = (expense.group as any)?.name || 'a group';
      const paidByName = (expense.paid_by_user as any)?.full_name || 'Someone';

      console.log('[Expense Notification] Group info:', {
        groupName,
        paidByName,
      });

      // Fetch all group members
      const { data: groupMembers, error: membersError } = await supabase
        .from('group_members')
        .select('user_id, user:profiles(email, full_name, phone)')
        .eq('group_id', groupId);

      if (membersError || !groupMembers) {
        console.error('[Expense Notification] ❌ Error fetching group members:', membersError);
        return;
      }

      console.log('[Expense Notification] Group members fetched:', {
        count: groupMembers.length,
        members: groupMembers.map(m => ({
          userId: m.user_id,
          email: (m.user as any)?.email,
          phone: (m.user as any)?.phone,
        })),
      });

      const notifications = [];

      // Create notifications for all group members (except the person who paid)
      for (const member of groupMembers) {
        const userId = member.user_id;

        if (userId === expense.paid_by) {
          continue; // Skip the person who paid
        }

        // Find split for this user
        const userSplit = Array.isArray(expense.splits)
          ? (expense.splits as any[]).find((s: any) => s.user_id === userId)
          : null;

        // Notification 1: New expense added to group
        notifications.push({
          user_id: userId,
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
          const splitAmount = Number(userSplit.amount);
          notifications.push({
            user_id: userId,
            title: 'Amount Assigned to You',
            message: `You owe ₹${splitAmount.toFixed(2)} for "${expense.description}"`,
            type: 'expense_split_assigned',
            is_read: false,
            related_id: expenseId,
            metadata: {
              expense_id: expenseId,
              group_id: groupId,
              split_amount: splitAmount,
              total_amount: expense.amount,
            },
          });

          // Send Email to this member
          const memberProfile = member.user as any;
          console.log('[Expense Notification] Processing member:', {
            userId,
            email: memberProfile?.email,
            phone: memberProfile?.phone,
            fullName: memberProfile?.full_name,
            hasSplit: !!userSplit,
            splitAmount: userSplit?.amount,
          });

          if (memberProfile?.email) {
            try {
              const emailHtml = `
                <!DOCTYPE html>
                <html>
                <head>
                  <meta charset="UTF-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                </head>
                <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f9f9f9;">
                  <table role="presentation" style="width: 100%; border-collapse: collapse;">
                    <tr>
                      <td style="padding: 20px 0; text-align: center;">
                        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                          <!-- Header -->
                          <tr>
                            <td style="background: linear-gradient(135deg, #6200EE, #9c27b0); padding: 40px 20px; text-align: center;">
                              <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">Expense Added</h1>
                            </td>
                          </tr>
                          
                          <!-- Content -->
                          <tr>
                            <td style="padding: 40px 30px;">
                              <p style="color: #333333; font-size: 18px; margin: 0 0 24px 0;">Hi ${memberProfile.full_name || 'there'},</p>
                              
                              <p style="color: #555555; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
                                <strong>${paidByName}</strong> added a new expense in <strong>"${groupName}"</strong> and you are included in it.
                              </p>
                              
                              <div style="background-color: #f0f4ff; border-left: 5px solid #6200EE; padding: 25px; margin: 0 0 30px 0; border-radius: 8px;">
                                <table role="presentation" style="width: 100%; border-collapse: collapse;">
                                  <tr>
                                    <td style="padding-bottom: 10px; color: #666666; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Description</td>
                                  </tr>
                                  <tr>
                                    <td style="padding-bottom: 20px; color: #1a1a1a; font-size: 20px; font-weight: 600;">${expense.description}</td>
                                  </tr>
                                  <tr>
                                    <td style="padding-bottom: 10px; color: #666666; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Your Share</td>
                                  </tr>
                                  <tr>
                                    <td style="color: #6200EE; font-size: 32px; font-weight: 700;">₹${splitAmount.toFixed(2)}</td>
                                  </tr>
                                  <tr>
                                    <td style="padding-top: 15px; color: #888888; font-size: 14px;">Total Amount: ₹${Number(expense.amount).toFixed(2)}</td>
                                  </tr>
                                </table>
                              </div>

                              <div style="text-align: center; margin-top: 20px;">
                                <a href="https://flatmates-expense.vercel.app" style="display: inline-block; background-color: #6200EE; color: #ffffff; padding: 16px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(98, 0, 238, 0.25);">View Details in App</a>
                              </div>
                            </td>
                          </tr>
                          
                          <!-- Footer -->
                          <tr>
                            <td style="padding: 30px; text-align: center; background-color: #fcfcfc; border-top: 1px solid #eeeeee;">
                              <p style="color: #999999; font-size: 13px; margin: 0 0 10px 0;">
                                Flatmates Expense Tracker helps you manage group expenses easily.
                              </p>
                              <p style="color: #bbbbbb; font-size: 11px; margin: 0;">
                                This is an automated notification. Please do not reply to this email.
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
                    subject: `Included in expense: ${expense.description} (${groupName})`,
                    html: emailHtml,
                  }),
                }).catch(e => console.log('Email send skipped (mobile-only feature)'));
              }

              // Send WhatsApp message if phone number is available
              console.log('[Expense Notification] Checking WhatsApp send', {
                hasPhone: !!memberProfile?.phone,
                phone: memberProfile?.phone,
              });

              if (memberProfile?.phone) {
                console.log('[Expense Notification] 📱 Attempting to send WhatsApp message');
                try {
                  const fallbackText = `${paidByName} added expense "${expense.description}" in "${groupName}". Your share: ₹${splitAmount.toFixed(2)}. Total: ₹${Number(expense.amount).toFixed(2)}. Open the app to view details.`;
                  
                  console.log('[Expense Notification] Calling sendWhatsAppMessageFromHtml', {
                    phone: memberProfile.phone,
                    htmlLength: emailHtml.length,
                    fallbackText,
                  });

                  const whatsappResult = await sendWhatsAppMessageFromHtml(
                    memberProfile.phone,
                    emailHtml,
                    fallbackText
                  );

                  console.log('[Expense Notification] WhatsApp send result:', whatsappResult);
                } catch (whatsappError: any) {
                  // Log but don't throw - WhatsApp is optional
                  console.error('[Expense Notification] ❌ WhatsApp sending failed:', {
                    error: whatsappError.message,
                    stack: whatsappError.stack,
                    phone: memberProfile.phone,
                  });
                }
              } else {
                console.log('[Expense Notification] ⚠️ WhatsApp skipped: No phone number for user', userId);
              }
            } catch (error) {
              console.error('Error preparing email:', error);
            }
          }
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
                const { notificationService } = await import('../supabase.service');
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
                  const { notificationService } = await import('../supabase.service');
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
