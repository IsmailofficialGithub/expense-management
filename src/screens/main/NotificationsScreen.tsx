// src/screens/main/NotificationsScreen.tsx
import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import {
  Text,
  Card,
  IconButton,
  Menu,
  Divider,
  useTheme,
  ActivityIndicator,
} from 'react-native-paper';
import { useAppDispatch, useAppSelector } from '../../store';
import {
  fetchNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} from '../../store/slices/notificationsSlice';
import { useNotifications } from '../../hooks/useNotifications';
import { formatDistanceToNow } from 'date-fns';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/AppNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Notifications'>;

export default function NotificationsScreen({ navigation }: Props) {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const { notifications, unreadCount, loading } = useNotifications();
  const [refreshing, setRefreshing] = useState(false);
  const [menuVisible, setMenuVisible] = useState<string | null>(null);

  useEffect(() => {
    loadNotifications();
  }, []);

  const loadNotifications = async () => {
    try {
      await dispatch(fetchNotifications()).unwrap();
    } catch (error) {
      console.error('Error loading notifications:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadNotifications();
    setRefreshing(false);
  };

  const handleMarkAsRead = async (notificationId: string) => {
    try {
      await dispatch(markAsRead(notificationId)).unwrap();
      setMenuVisible(null);
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await dispatch(markAllAsRead()).unwrap();
      setMenuVisible(null);
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  const handleDelete = async (notificationId: string) => {
    try {
      await dispatch(deleteNotification(notificationId)).unwrap();
      setMenuVisible(null);
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  };

  const handleNotificationPress = (notification: any) => {
    // Mark as read if unread
    if (!notification.is_read) {
      handleMarkAsRead(notification.id);
    }

    // Navigate to expense details if related_id exists
    if (notification.related_id && notification.metadata?.expense_id) {
      navigation.navigate('ExpenseDetails', {
        expenseId: notification.metadata.expense_id || notification.related_id,
      });
    }
  };

  const formatTime = (dateString: string) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true });
    } catch {
      return '';
    }
  };

  const renderNotification = ({ item }: { item: any }) => {
    const isUnread = !item.is_read;

    return (
      <TouchableOpacity
        onPress={() => handleNotificationPress(item)}
        activeOpacity={0.7}
      >
        <Card
          style={[
            styles.notificationCard,
            {
              backgroundColor: theme.colors.surface,
              borderLeftWidth: isUnread ? 4 : 0,
              borderLeftColor: isUnread ? theme.colors.primary : 'transparent',
            },
          ]}
        >
          <Card.Content>
            <View style={styles.notificationHeader}>
              <View style={styles.notificationContent}>
                <Text
                  style={[
                    styles.notificationTitle,
                    {
                      color: theme.colors.onSurface,
                      fontWeight: isUnread ? 'bold' : 'normal',
                    },
                  ]}
                >
                  {item.title}
                </Text>
                <Text
                  style={[
                    styles.notificationMessage,
                    { color: theme.colors.onSurfaceVariant },
                  ]}
                >
                  {item.message}
                </Text>
                <Text
                  style={[
                    styles.notificationTime,
                    { color: theme.colors.onSurfaceVariant },
                  ]}
                >
                  {formatTime(item.created_at)}
                </Text>
              </View>
              <Menu
                visible={menuVisible === item.id}
                onDismiss={() => setMenuVisible(null)}
                anchor={
                  <IconButton
                    icon="dots-vertical"
                    size={20}
                    onPress={() => setMenuVisible(item.id)}
                  />
                }
              >
                {!item.is_read && (
                  <Menu.Item
                    onPress={() => handleMarkAsRead(item.id)}
                    title="Mark as read"
                    leadingIcon="check"
                  />
                )}
                <Menu.Item
                  onPress={() => handleDelete(item.id)}
                  title="Delete"
                  leadingIcon="delete"
                />
              </Menu>
            </View>
          </Card.Content>
        </Card>
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text
        style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}
      >
        No notifications yet
      </Text>
      <Text
        style={[
          styles.emptySubtext,
          { color: theme.colors.onSurfaceVariant },
        ]}
      >
        You'll see notifications here when expenses are added to your groups
      </Text>
    </View>
  );

  const renderHeader = () => (
    <View style={styles.header}>
      <Text
        style={[styles.headerTitle, { color: theme.colors.onSurface }]}
      >
        Notifications
      </Text>
      {unreadCount > 0 && (
        <TouchableOpacity onPress={handleMarkAllAsRead}>
          <Text
            style={[styles.markAllButton, { color: theme.colors.primary }]}
          >
            Mark all as read
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {loading && notifications.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <FlatList
          data={notifications}
          renderItem={renderNotification}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={
            notifications.length === 0 ? styles.emptyList : styles.list
          }
          ListEmptyComponent={renderEmpty}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          style={styles.listContainer}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContainer: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  markAllButton: {
    fontSize: 14,
    fontWeight: '600',
  },
  list: {
    padding: 16,
  },
  emptyList: {
    flex: 1,
  },
  notificationCard: {
    marginBottom: 12,
    elevation: 2,
  },
  notificationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  notificationContent: {
    flex: 1,
    marginRight: 8,
  },
  notificationTitle: {
    fontSize: 16,
    marginBottom: 4,
  },
  notificationMessage: {
    fontSize: 14,
    marginBottom: 4,
    lineHeight: 20,
  },
  notificationTime: {
    fontSize: 12,
    marginTop: 4,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

