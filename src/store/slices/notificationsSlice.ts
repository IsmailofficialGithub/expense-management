import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { notificationService } from '../../services/supabase.service';
import { Notification } from '../../types/database.types';

interface NotificationsState {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
}

const initialState: NotificationsState = {
  notifications: [],
  unreadCount: 0,
  loading: false,
  error: null,
};

export const fetchNotifications = createAsyncThunk('notifications/fetchNotifications', async (_, { rejectWithValue }) => {
  try {
    return await notificationService.getNotifications();
  } catch (error: any) {
    return rejectWithValue(error.message);
  }
});

export const markAsRead = createAsyncThunk('notifications/markAsRead', async (notificationId: string, { rejectWithValue }) => {
  try {
    await notificationService.markAsRead(notificationId);
    return notificationId;
  } catch (error: any) {
    return rejectWithValue(error.message);
  }
});

export const markAllAsRead = createAsyncThunk('notifications/markAllAsRead', async (_, { rejectWithValue }) => {
  try {
    await notificationService.markAllAsRead();
  } catch (error: any) {
    return rejectWithValue(error.message);
  }
});

export const deleteNotification = createAsyncThunk('notifications/deleteNotification', async (notificationId: string, { rejectWithValue }) => {
  try {
    await notificationService.deleteNotification(notificationId);
    return notificationId;
  } catch (error: any) {
    return rejectWithValue(error.message);
  }
});

const notificationsSlice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    clearNotifications: (state) => {
      state.notifications = [];
      state.unreadCount = 0;
    },
    addNotificationRealtime: (state, action: PayloadAction<Notification>) => {
      state.notifications.unshift(action.payload);
      if (!action.payload.is_read) state.unreadCount += 1;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(fetchNotifications.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(fetchNotifications.fulfilled, (state, action) => {
      state.loading = false;
      state.notifications = action.payload;
      state.unreadCount = action.payload.filter(n => !n.is_read).length;
    });
    builder.addCase(fetchNotifications.rejected, (state, action) => {
      state.loading = false;
      state.error = action.payload as string;
    });
    builder.addCase(markAsRead.fulfilled, (state, action) => {
      const notification = state.notifications.find(n => n.id === action.payload);
      if (notification && !notification.is_read) {
        notification.is_read = true;
        state.unreadCount = Math.max(0, state.unreadCount - 1);
      }
    });
    builder.addCase(markAllAsRead.fulfilled, (state) => {
      state.notifications.forEach(n => { n.is_read = true; });
      state.unreadCount = 0;
    });
    builder.addCase(deleteNotification.fulfilled, (state, action) => {
      const notification = state.notifications.find(n => n.id === action.payload);
      if (notification && !notification.is_read) {
        state.unreadCount = Math.max(0, state.unreadCount - 1);
      }
      state.notifications = state.notifications.filter(n => n.id !== action.payload);
    });
  },
});

export const { clearError, clearNotifications, addNotificationRealtime } = notificationsSlice.actions;
export default notificationsSlice.reducer;