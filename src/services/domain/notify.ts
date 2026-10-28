// src/services/domain/notify.ts
import { api, qs } from '../api';
import { subscribe } from '../realtime';
import { Notification } from '../../types/database.types';

// ============================================
// NOTIFICATIONS
// ============================================

export const notificationService = {
  getNotifications: async (limit?: number, offset?: number): Promise<Notification[]> =>
    api.get(`/notifications${qs({ limit, offset })}`),

  getUnreadCount: async (): Promise<number> => (await api.get<{ count: number }>('/notifications/unread-count')).count,

  createNotification: async (notification: {
    user_id: string;
    title: string;
    message: string;
    type: string;
    related_id?: string | null;
    metadata?: any;
  }): Promise<Notification> => api.post('/notifications', notification),

  // Server builds the notifications, emails and pushes; failures never block expense creation.
  triggerExpenseNotifications: async (expenseId: string, groupId: string): Promise<void> => {
    try {
      await api.post(`/notifications/expense/${expenseId}`);
    } catch (error) {
      console.error('Error triggering expense notifications:', error, groupId);
    }
  },

  markAsRead: async (notificationId: string) => {
    await api.patch(`/notifications/${notificationId}/read`);
  },

  markAllAsRead: async () => {
    await api.patch('/notifications/read-all');
  },

  deleteNotification: async (notificationId: string) => {
    await api.del(`/notifications/${notificationId}`);
  },
};

// ============================================
// REALTIME SUBSCRIPTIONS
// ============================================

// Payloads are adapted to the old Supabase postgres_changes shape: { eventType, new, old }.
const toPayload = (d: any) => ({ eventType: d?.type, new: d?.new ?? {}, old: d?.old ?? {} });

export const realtimeService = {
  subscribeToExpenses: (groupId: string, callback: (payload: any) => void) =>
    subscribe(`group:${groupId}`, (event, data) => {
      if (event === 'expense') callback(toPayload(data));
    }),

  subscribeToNotifications: (userId: string, callback: (payload: any) => void) =>
    subscribe(`user:${userId}`, (event, data) => {
      if (event === 'notification' && data?.type === 'INSERT') callback(toPayload(data));
    }),

  unsubscribe: (channel: any) => {
    if (typeof channel === 'function') channel();
  },
};
