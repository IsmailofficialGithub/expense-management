// src/services/notifications.service.ts
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { chatService } from './chat.service';
import { supabase } from './supabase';

// Configure notification handler - Always show and play sound
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export const notificationsService = {
  /**
   * Request notification permissions
   */
  async requestPermissions(): Promise<boolean> {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.warn('Notification permissions not granted');
      return false;
    }

    // Get push token (optional - only for remote push notifications)
    // Local notifications work without push token
    try {
      const token = await this.getPushToken();
      if (token) {
        await this.savePushToken(token);
      }
    } catch (error) {
      // Ignore push token errors - local notifications will still work
      console.log('Push token not available. Local notifications will still work.');
    }

    return true;
  },

  /**
   * Get Expo push token (for remote push notifications)
   * This token is required for push notifications when app is closed
   */
  async getPushToken(): Promise<string | null> {
    try {
      if (Platform.OS === 'android') {
        // Configure Android notification channel with sound
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Expense Notifications',
          description: 'Notifications for expenses and splits',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
          sound: 'default', // Android channel sound
          enableVibrate: true,
          showBadge: true,
          enableLights: true,
        });

        // Also create a high-priority channel for expense notifications
        await Notifications.setNotificationChannelAsync('expense_notifications', {
          name: 'Expense Alerts',
          description: 'High priority notifications for expense updates',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
          sound: 'default',
          enableVibrate: true,
          showBadge: true,
          enableLights: true,
        });
      }

      // Get project ID from Constants
      const Constants = require('expo-constants').default;
      const projectId = Constants.expoConfig?.extra?.eas?.projectId ||
        Constants.expoConfig?.extra?.EXPO_PROJECT_ID ||
        Constants.expoConfig?.extra?.expo?.projectId;

      if (!projectId) {
        console.warn('Expo project ID not found. Push notifications may not work when app is closed.');
        console.warn('Add projectId to app.config.ts or app.json extra section');
        return null;
      }

      try {
        const { data: token } = await Notifications.getExpoPushTokenAsync({
          projectId: projectId,
        });
        console.log('Expo push token obtained:', token);
        return token;
      } catch (error: any) {
        console.error('Error getting Expo push token:', error.message);
        // Still return null - local notifications will work
        return null;
      }
    } catch (error: any) {
      console.error('Error in getPushToken:', error.message);
      return null;
    }
  },

  /**
   * Check if string is a valid UUID
   */
  isValidUUID(str: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  },

  /**
   * Save push token to user profile
   */
  async savePushToken(token: string): Promise<void> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.warn('Cannot save push token: User not authenticated');
        return;
      }

      // Store token in user profile
      const { error } = await supabase
        .from('profiles')
        .update({
          push_token: token,
          push_token_updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) {
        console.error('Error saving push token:', error);
      } else {
        console.log('Push token saved successfully for user:', user.id);
      }
    } catch (error) {
      console.error('Error in savePushToken:', error);
    }
  },

  /**
   * Get current user's push token
   */
  async getCurrentUserPushToken(): Promise<string | null> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data: profile } = await supabase
        .from('profiles')
        .select('push_token')
        .eq('id', user.id)
        .single();

      return profile?.push_token || null;
    } catch (error) {
      console.error('Error getting current user push token:', error);
      return null;
    }
  },

  /**
   * Setup notification listeners
   */
  setupListeners(navigation: any) {
    // Handle notification received while app is in foreground
    const foregroundSubscription = Notifications.addNotificationReceivedListener(
      (notification) => {
        console.log('Notification received:', notification);
        // Show in-app notification or update UI
      }
    );

    // Handle notification tapped
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data;
        console.log('Notification tapped:', data);

        // Navigate based on notification data
        if (data?.conversationId) {
          navigation.navigate('Chat', { conversationId: data.conversationId });
        } else if (data?.groupId) {
          // Check if it's a collection-related notification
          if (data?.collection_id || data?.type === 'contribution_pending_approval' || data?.type === 'payment_received') {
            navigation.navigate('AdvanceCollection', { groupId: data.groupId });
          } else {
            navigation.navigate('GroupDetails', { groupId: data.groupId });
          }
        } else if (data?.expense_id) {
          navigation.navigate('ExpenseDetails', { expenseId: data.expense_id });
        } else if (data?.type === 'expense_added' || data?.type === 'expense_split_assigned') {
          // Navigate to notifications screen
          navigation.navigate('Main', { screen: 'Notifications' });
        }
      }
    );

    return {
      foregroundSubscription,
      responseSubscription,
    };
  },

  /**
   * Send local notification (for testing or immediate display)
   */
  async sendLocalNotification(title: string, body: string, data?: any): Promise<void> {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
        sound: 'default', // Use 'default' for both platforms - works better
        priority: Notifications.AndroidNotificationPriority.HIGH,
        vibrate: Platform.OS === 'android' ? [0, 250, 250, 250] : undefined,
        // Use expense_notifications channel on Android for better sound
        ...(Platform.OS === 'android' && { channelId: 'expense_notifications' }),
      },
      trigger: null, // Show immediately
    });
  },

  /**
   * Send notification for new message (with sound and vibration)
   */
  async notifyNewMessage(
    senderName: string,
    messageText: string,
    conversationId: string,
    conversationType: 'individual' | 'group',
    conversationName?: string
  ): Promise<void> {
    const title = conversationType === 'group' && conversationName
      ? `${senderName} in ${conversationName}`
      : senderName;

    const body = messageText.length > 100
      ? messageText.substring(0, 100) + '...'
      : messageText;

    // Send notification directly with sound and vibration
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: {
          conversationId,
          type: 'message',
        },
        sound: 'default', // Use 'default' for both platforms
        priority: Notifications.AndroidNotificationPriority.HIGH,
        vibrate: Platform.OS === 'android' ? [0, 250, 250, 250] : undefined,
        ...(Platform.OS === 'android' && { channelId: 'default' }),
      },
      trigger: null, // Show immediately
    });
  },

  /**
   * Cancel all notifications
   */
  async cancelAllNotifications(): Promise<void> {
    await Notifications.cancelAllScheduledNotificationsAsync();
  },

  /**
   * Get notification badge count
   */
  async getBadgeCount(): Promise<number> {
    return await Notifications.getBadgeCountAsync();
  },

  /**
   * Set notification badge count
   */
  async setBadgeCount(count: number): Promise<void> {
    await Notifications.setBadgeCountAsync(count);
  },
};

