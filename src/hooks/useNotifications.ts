import { useAppSelector } from "../store";

export const useNotifications = () => {
  const notifications = useAppSelector(state => state.notifications);
  
  return {
    notifications: notifications.notifications,
    unreadCount: notifications.unreadCount,
    loading: notifications.loading,
    error: notifications.error,
  };
};