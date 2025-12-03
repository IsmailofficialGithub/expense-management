import { createSlice, createAsyncThunk, PayloadAction, createAction } from '@reduxjs/toolkit';
import { notificationService } from '../../services/supabase.service';
import { Notification } from '../../types/database.types';
import { storageService } from '../../services/storage.service';

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

export const fetchNotifications = createAsyncThunk('notifications/fetchNotifications', async (_, { rejectWithValue, getState }) => {
  try {
    const state = getState() as any;
    const isOnline = state.ui.isOnline;
    
    if (isOnline) {
      try {
        const notifications = await notificationService.getNotifications();
        await storageService.setNotifications(notifications);
        return notifications;
      } catch (error: any) {
        console.warn('Online fetch notifications failed, trying offline:', error);
      }
    }
    
    // Offline: load from local storage
    const cachedNotifications = await storageService.getNotifications();
    if (cachedNotifications) {
      return cachedNotifications;
    }
    
    return [];
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

// Cache setter action - load data directly from cache without API calls
export const setNotificationsFromCache = createAction<Notification[]>('notifications/setFromCache');

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
    // Cache setter action
    builder.addCase(setNotificationsFromCache, (state, action) => {
      state.notifications = action.payload;
      state.unreadCount = action.payload.filter(n => !n.is_read).length;
      state.loading = false;
    });
  },
});

export const { clearError, clearNotifications, addNotificationRealtime } = notificationsSlice.actions;
export default notificationsSlice.reducer;