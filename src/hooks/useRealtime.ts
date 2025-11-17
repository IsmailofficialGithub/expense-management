import { useEffect } from 'react';
import { realtimeService } from '../services/supabase.service';
import {
  addExpenseRealtime,
  updateExpenseRealtime,
  deleteExpenseRealtime,
} from '../store/slices/expensesSlice';
import { addNotificationRealtime } from '../store/slices/notificationsSlice';
import { useAppDispatch } from '../store';

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

export const useRealtimeNotifications = (userId: string) => {
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!userId) return;

    const channel = realtimeService.subscribeToNotifications(userId, (payload) => {
      const { new: newNotification } = payload;
      if (newNotification) {
        dispatch(addNotificationRealtime(newNotification));
      }
    });

    return () => {
      realtimeService.unsubscribe(channel);
    };
  }, [userId, dispatch]);
};