// src/components/NotificationInitializer.tsx
import React, { useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useRealtimeNotifications } from '../hooks/useRealtime';
import { useAppDispatch } from '../store';
import { fetchNotifications } from '../store/slices/notificationsSlice';
import { notificationService } from '../services/supabase.service';

/**
 * Component to initialize notifications and real-time subscriptions
 * Must be rendered inside ReduxProvider
 */
export default function NotificationInitializer() {
  const { isAuthenticated, profile } = useAuth();
  const dispatch = useAppDispatch();

  // Initialize notifications when authenticated
  useEffect(() => {
    if (isAuthenticated && profile?.id) {
      // Load cached notifications
      dispatch(fetchNotifications());
      
      // Update badge count
      notificationService.getUnreadCount().then((count) => {
        import('../services/notifications.service').then(({ notificationsService }) => {
          notificationsService.setBadgeCount(count);
        });
      });

      // Ensure push token is registered
      const setupPushToken = async () => {
        const { notificationsService } = await import('../services/notifications.service');
        try {
          // Try to get existing token
          const existingToken = await notificationsService.getCurrentUserPushToken();
          
          if (!existingToken) {
            // Get and save new token
            const token = await notificationsService.getPushToken();
            if (token) {
              await notificationsService.savePushToken(token);
            }
          } else {
            // Verify token is still valid, refresh if needed
            const newToken = await notificationsService.getPushToken();
            if (newToken && newToken !== existingToken) {
              await notificationsService.savePushToken(newToken);
            }
          }
        } catch (error) {
          console.error('Error setting up push token:', error);
        }
      };

      setupPushToken();
    }
  }, [isAuthenticated, profile?.id, dispatch]);

  // Setup real-time notification subscription
  useRealtimeNotifications(profile?.id || '');

  // Debug: Log subscription status
  useEffect(() => {
    if (isAuthenticated && profile?.id) {
      console.log('NotificationInitializer: User authenticated, setting up subscriptions for:', profile.id);
    } else {
      console.log('NotificationInitializer: User not authenticated or no profile');
    }
  }, [isAuthenticated, profile?.id]);

  return null;
}

