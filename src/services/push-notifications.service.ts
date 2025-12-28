// src/services/push-notifications.service.ts
// Service to send Expo push notifications via Expo Push Notification API

interface PushNotificationData {
  to: string | string[];
  sound?: string;
  title: string;
  body: string;
  data?: any;
  badge?: number;
  priority?: 'default' | 'normal' | 'high';
  channelId?: string;
}

/**
 * Send push notification via Expo Push Notification API
 * This works even when the app is closed
 */
export async function sendExpoPushNotification(
  pushToken: string | string[],
  title: string,
  body: string,
  data?: any,
  badge?: number
): Promise<void> {
  try {
    const tokens = Array.isArray(pushToken) ? pushToken : [pushToken];

    // Filter out invalid tokens
    const validTokens = tokens.filter(token => token && token.startsWith('ExponentPushToken'));

    if (validTokens.length === 0) {
      console.warn('No valid push tokens provided');
      return;
    }

    const messages: PushNotificationData[] = validTokens.map(token => ({
      to: token,
      sound: 'default', // Expo push notifications always use 'default' string
      title,
      body,
      data: data || {},
      badge,
      priority: 'high',
      channelId: 'expense_notifications', // Use expense channel for Android
    }));

    // Send to Expo Push Notification API
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error sending push notification:', errorText);
      throw new Error(`Failed to send push notification: ${errorText}`);
    }

    const result = await response.json();
    console.log('Push notification sent:', result);

    // Check for errors in response
    if (result.data) {
      result.data.forEach((item: any, index: number) => {
        if (item.status === 'error') {
          console.error(`Push notification error for token ${index}:`, item.message);
        }
      });
    }
  } catch (error) {
    console.error('Error sending Expo push notification:', error);
    throw error;
  }
}

/**
 * Get push tokens for group members (except the sender)
 */
export async function getGroupMemberPushTokens(
  groupId: string,
  excludeUserId?: string
): Promise<string[]> {
  try {
    const { supabase } = await import('./supabase');

    // Get all group member user IDs
    const { data: members, error: membersError } = await supabase
      .from('group_members')
      .select('user_id')
      .eq('group_id', groupId);

    if (membersError || !members) {
      console.error('Error fetching group members:', membersError);
      return [];
    }

    // Filter out excluded user
    const userIds = members
      .map((m: any) => m.user_id)
      .filter((id: string) => id !== excludeUserId);

    if (userIds.length === 0) {
      return [];
    }

    // Get push tokens for these users
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('push_token')
      .in('id', userIds)
      .not('push_token', 'is', null);

    if (profilesError || !profiles) {
      console.error('Error fetching push tokens:', profilesError);
      return [];
    }

    // Extract valid push tokens
    const tokens = profiles
      .map((p: any) => p.push_token)
      .filter((token: string) =>
        token && token.startsWith('ExponentPushToken')
      );

    return tokens;
  } catch (error) {
    console.error('Error getting group member push tokens:', error);
    return [];
  }
}

/**
 * Get push tokens for conversation participants (except the sender)
 */
export async function getConversationParticipantsTokens(
  conversationId: string,
  excludeUserId?: string
): Promise<string[]> {
  try {
    const { supabase } = await import('./supabase');

    // Get all conversation participant user IDs
    const { data: participants, error: participantsError } = await supabase
      .from('conversation_participants')
      .select('user_id')
      .eq('conversation_id', conversationId);

    if (participantsError || !participants) {
      console.error('Error fetching conversation participants:', participantsError);
      return [];
    }

    // Filter out excluded user
    const userIds = participants
      .map((p: any) => p.user_id)
      .filter((id: string) => id !== excludeUserId);

    if (userIds.length === 0) {
      return [];
    }

    // Get push tokens for these users
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('push_token')
      .in('id', userIds)
      .not('push_token', 'is', null);

    if (profilesError || !profiles) {
      console.error('Error fetching push tokens:', profilesError);
      return [];
    }

    // Extract valid push tokens
    const tokens = profiles
      .map((p: any) => p.push_token)
      .filter((token: string) =>
        token && token.startsWith('ExponentPushToken')
      );

    return tokens;
  } catch (error) {
    console.error('Error getting conversation participant push tokens:', error);
    return [];
  }
}

