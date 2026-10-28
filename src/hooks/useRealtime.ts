import { useEffect } from 'react';
import { AppState } from 'react-native';
import { realtimeService } from '../services/supabase.service';
import {
  addExpenseRealtime,
  updateExpenseRealtime,
  deleteExpenseRealtime,
} from '../store/slices/expensesSlice';
import { addNotificationRealtime } from '../store/slices/notificationsSlice';
import { fetchGroups, fetchGroup, fetchGroupBalances, setSelectedGroup } from '../store/slices/groupsSlice';
import { useAppDispatch, useAppSelector } from '../store';
import { notificationsService } from '../services/notifications.service';

export const useRealtimeExpenses = (groupId: string) => {
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!groupId) return;

    const channel = realtimeService.subscribeToExpenses(groupId, (payload) => {
      const { eventType, new: newRecord, old: oldRecord } = payload;
      
      if (eventType === 'INSERT' && newRecord) {
        // Fetch full expense details
        import('../services/supabase.service').then(({ expenseService }) => {
          expenseService.getExpense(newRecord.id).then((expense) => {
            dispatch(addExpenseRealtime(expense));
          });
        });
      } else if (eventType === 'UPDATE' && newRecord) {
        import('../services/supabase.service').then(({ expenseService }) => {
          expenseService.getExpense(newRecord.id).then((expense) => {
            dispatch(updateExpenseRealtime(expense));
          });
        });
      } else if (eventType === 'DELETE' && oldRecord) {
        dispatch(deleteExpenseRealtime(oldRecord.id));
      }
    });

    return () => {
      realtimeService.unsubscribe(channel);
    };
  }, [groupId, dispatch]);
};

// Member added/removed in any of my groups: refresh lists live; drop the group if I was the one removed.
export const useRealtimeMembership = (userId: string) => {
  const dispatch = useAppDispatch();
  const selectedGroupId = useAppSelector((s) => s.groups.selectedGroup?.id);

  useEffect(() => {
    if (!userId) return;
    const channel = realtimeService.subscribeToMembership(userId, ({ group_id, removed_user_id }) => {
      dispatch(fetchGroups());
      if (group_id !== selectedGroupId) return;
      if (removed_user_id === userId) dispatch(setSelectedGroup(null));
      else {
        dispatch(fetchGroup(group_id));
        dispatch(fetchGroupBalances(group_id));
      }
    });
    return () => realtimeService.unsubscribe(channel);
  }, [userId, selectedGroupId, dispatch]);
};

export const useRealtimeNotifications = (userId: string) => {
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!userId) {
      // User not authenticated yet - this is expected during app initialization
      return;
    }

    console.log('Setting up real-time notification subscription for user:', userId);

    const channel = realtimeService.subscribeToNotifications(userId, async (payload) => {
      console.log('Notification payload received:', payload);
      
      // Handle different payload structures
      const newNotification = payload.new || payload.record || payload;
      
      if (newNotification && newNotification.id) {
        console.log('Processing new notification:', newNotification);
        
        // Dispatch to Redux
        dispatch(addNotificationRealtime(newNotification));

        // Cache notification locally
        try {
          const { storageService } = await import('../services/storage.service');
          const cachedNotifications = await storageService.getNotifications() || [];
          // Avoid duplicates
          const exists = cachedNotifications.some((n: any) => n.id === newNotification.id);
          if (!exists) {
            await storageService.setNotifications([newNotification, ...cachedNotifications]);
          }
        } catch (error) {
          console.error('Error caching notification:', error);
        }

        // Update badge count
        try {
          const { notificationService } = await import('../services/supabase.service');
          const unreadCount = await notificationService.getUnreadCount();
          await notificationsService.setBadgeCount(unreadCount);
        } catch (error) {
          console.error('Error updating badge count:', error);
        }

        // Always send local notification (even in foreground) with sound
        // This ensures notifications are always visible and audible
        await notificationsService.sendLocalNotification(
          newNotification.title,
          newNotification.message,
          {
            type: newNotification.type,
            expense_id: newNotification.metadata?.expense_id,
            group_id: newNotification.metadata?.group_id,
          }
        );
      } else {
        console.warn('Invalid notification payload structure:', payload);
      }
    });

    return () => {
      console.log('Cleaning up notification subscription for user:', userId);
      realtimeService.unsubscribe(channel);
    };
  }, [userId, dispatch]);
};