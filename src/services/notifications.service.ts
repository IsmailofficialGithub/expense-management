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
   * Get Expo push token (only for remote push notifications)
   * Note: Local notifications work perfectly without this token
   */
  async getPushToken(): Promise<string | null> {
    try {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
          sound: 'default',
          enableVibrate: true,
          showBadge: true,
        });
      }

      // Get project ID from Constants - must be a valid UUID
      const Constants = require('expo-constants').default;
      const projectId = Constants.expoConfig?.extra?.eas?.projectId || 
                       Constants.expoConfig?.extra?.EXPO_PROJECT_ID;
      
      // Only try to get push token if we have a valid UUID project ID
      // Local notifications work without push token
      if (!projectId || !this.isValidUUID(projectId)) {
        // Silently skip - local notifications will work fine
        return null;
      }
      
      try {
        const { data: token } = await Notifications.getExpoPushTokenAsync({
          projectId: projectId,
        });
        return token;
      } catch (error) {
        // Silently fail - local notifications will still work
        return null;
      }
    } catch (error) {
      // Silently fail - local notifications will still work
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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Store token in user metadata or a separate table
    await supabase
      .from('profiles')
      .update({
        push_token: token,
        push_token_updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);
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
          navigation.navigate('GroupDetails', { groupId: data.groupId });
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
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
        vibrate: [0, 250, 250, 250],
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
        sound: true, // Play sound
        priority: Notifications.AndroidNotificationPriority.HIGH,
        vibrate: Platform.OS === 'android' ? [0, 250, 250, 250] : undefined,
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

