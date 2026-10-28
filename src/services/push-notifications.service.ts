// src/services/push-notifications.service.ts
// Other users' push tokens never reach the client: the "token" helpers return a target marker
// ('group:<id>' / 'conversation:<id>') and the server pushes to the other members/participants.
import { api } from './api';

export async function sendExpoPushNotification(
  pushToken: string | string[],
  title: string,
  body: string,
  data?: any,
  badge?: number
): Promise<void> {
  const targets = (Array.isArray(pushToken) ? pushToken : [pushToken]).filter((t) => /^(group|conversation):/.test(t ?? ''));
  if (!targets.length) {
    console.warn('No valid push targets provided');
    return;
  }
  for (const t of targets) {
    const [kind, id] = t.split(':');
    await api.post(`/push/${kind}/${id}`, { title, body, data: data || {}, badge });
  }
}

// excludeUserId is ignored: the server always excludes the caller.
export async function getGroupMemberPushTokens(groupId: string, _excludeUserId?: string): Promise<string[]> {
  return [`group:${groupId}`];
}

export async function getConversationParticipantsTokens(conversationId: string, _excludeUserId?: string): Promise<string[]> {
  return [`conversation:${conversationId}`];
}
