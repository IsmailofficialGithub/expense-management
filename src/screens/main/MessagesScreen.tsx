// src/screens/main/MessagesScreen.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, StyleSheet, RefreshControl, FlatList } from 'react-native';
import {
  Text,
  Card,
  Avatar,
  Searchbar,
  Chip,
  ActivityIndicator,
  FAB,
  Portal,
  Modal,
  TextInput,
  Button,
  HelperText,
} from 'react-native-paper';
import { useTheme } from 'react-native-paper';
import SafeScrollView from '../../components/SafeScrollView';
import { chatService } from '../../services/chat.service';
import { ConversationWithDetails } from '../../types/database.types';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { useUI } from '../../hooks/useUI';
import { ErrorHandler } from '../../utils/errorHandler';
import { format } from 'date-fns';
import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../../services/supabase';
import { notificationsService } from '../../services/notifications.service';
import { AppState } from 'react-native';
import ErrorState from '../../components/ErrorState';

type FilterType = 'all' | 'groups' | 'users';

export default function MessagesScreen({ navigation }: any) {
  const theme = useTheme();
  const { profile } = useAuth();
  const { showToast } = useToast();
  const { isOnline } = useUI();
  
  const [conversations, setConversations] = useState<ConversationWithDetails[]>([]);
  const [filteredConversations, setFilteredConversations] = useState<ConversationWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [newChatModalVisible, setNewChatModalVisible] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [creatingChat, setCreatingChat] = useState(false);
  const [appState, setAppState] = useState(AppState.currentState);
  const [error, setError] = useState<string | null>(null);

  const channelsRef = useRef<RealtimeChannel[]>([]);

  // Listen to app state changes (foreground/background)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      setAppState(nextAppState);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    loadConversations();

    return () => {
      // Cleanup subscriptions
      channelsRef.current.forEach(channel => {
        supabase.removeChannel(channel);
      });
      channelsRef.current = [];
    };
  }, []);

  useEffect(() => {
    // Setup subscriptions when conversations are loaded
    if (conversations.length > 0 && !loading) {
      setupRealtimeSubscriptions();
    }

    return () => {
      // Cleanup when conversations change
      channelsRef.current.forEach(channel => {
        supabase.removeChannel(channel);
      });
      channelsRef.current = [];
    };
  }, [conversations.length, loading, setupRealtimeSubscriptions]);

  useEffect(() => {
    applyFilters();
  }, [conversations, searchQuery, filter]);

  const loadConversations = async () => {
    setError(null);
    let shouldContinueToAPI = true;
    
    try {
      // First, try to load from cache immediately
      const { storageService } = await import('../../services/storage.service');
      const cachedConversations = await storageService.getConversations() || [];
      if (cachedConversations.length > 0) {
        setConversations(cachedConversations);
        setLoading(false);
        
        // Then sync in background if online
        if (!isOnline) {
          shouldContinueToAPI = false; // Offline, use cache only
        }
      }
      
      // Fetch from API if needed
      if (shouldContinueToAPI) {
        const data = await chatService.getConversations();
        setConversations(data);
      }
    } catch (error: any) {
      const errorMessage = ErrorHandler.getUserFriendlyMessage(error);
      setError(errorMessage);
      ErrorHandler.handleError(error, showToast, 'Messages');
    } finally {
      // Always clear loading states
      setLoading(false);
      setRefreshing(false);
    }
  };

  const setupRealtimeSubscriptions = useCallback(() => {
    // Clean up existing subscriptions
    channelsRef.current.forEach(channel => {
      supabase.removeChannel(channel);
    });
    channelsRef.current = [];

    // Subscribe to messages for all conversations
    const conversationIds = conversations.map(c => c.id);
    
    if (conversationIds.length === 0) return;

    // Subscribe to new messages in any of the user's conversations
    const messagesChannel = supabase
      .channel(`messages-updates-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        async (payload) => {
          const newMessage = payload.new as any;
          
          // Only update if this message is for one of our conversations
          if (conversationIds.includes(newMessage.conversation_id)) {
            // Check if current user sent this message
            const isMyMessage = newMessage.sender_id === profile?.id;
            
            // Get sender info
            const { data: sender } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', newMessage.sender_id)
              .single();

            // Find the conversation
            const conversation = conversations.find(c => c.id === newMessage.conversation_id);
            
            // Send notification if message is not from current user
            // (Notifications will always play sound due to handler config)
            if (!isMyMessage) {
              const conversationName = conversation?.type === 'group' && conversation?.group
                ? conversation.group.name
                : sender?.full_name || 'Someone';
              
              try {
                await notificationsService.notifyNewMessage(
                  sender?.full_name || 'Someone',
                  newMessage.text,
                  newMessage.conversation_id,
                  conversation?.type || 'individual',
                  conversation?.type === 'group' ? conversation?.group?.name : undefined
                );
              } catch (error) {
                console.error('Error sending notification:', error);
              }
            }

            // Update the conversation that received the message
            setConversations(prev => {
              const updated = prev.map(conv => {
                if (conv.id === newMessage.conversation_id) {
                  return {
                    ...conv,
                    last_message_at: newMessage.created_at,
                    last_message_text: newMessage.text,
                    last_message_sender_id: newMessage.sender_id,
                    last_message_sender: sender || conv.last_message_sender,
                    updated_at: newMessage.created_at,
                    unread_count: isMyMessage ? (conv.unread_count || 0) : (conv.unread_count || 0) + 1,
                  };
                }
                return conv;
              });

              // Sort by last_message_at (most recent first)
              return updated.sort((a, b) => {
                const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
                const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
                return bTime - aTime;
              });
            });
          }
        }
      )
      .subscribe();

    channelsRef.current.push(messagesChannel);

    // Subscribe to conversation updates (when last_message_at changes)
    const conversationsChannel = supabase
      .channel(`conversations-updates-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversations',
        },
        async (payload) => {
          const updatedConv = payload.new as any;
          
          // Only update if this is one of our conversations
          if (conversationIds.includes(updatedConv.id)) {
            // Reload the specific conversation
            try {
              const updated = await chatService.getConversation(updatedConv.id);
              if (updated) {
                setConversations(prev => {
                  const index = prev.findIndex(c => c.id === updatedConv.id);
                  if (index >= 0) {
                    const newList = [...prev];
                    newList[index] = updated;
                    // Re-sort
                    return newList.sort((a, b) => {
                      const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
                      const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
                      return bTime - aTime;
                    });
                  }
                  return prev;
                });
              }
            } catch (error) {
              // If error, just reload all
              loadConversations();
            }
          }
        }
      )
      .subscribe();

    channelsRef.current.push(conversationsChannel);
  }, [conversations, profile?.id]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadConversations();
  }, []);

  const applyFilters = () => {
    let filtered = [...conversations];

    // Apply type filter
    if (filter === 'groups') {
      filtered = filtered.filter(conv => conv.type === 'group');
    } else if (filter === 'users') {
      filtered = filtered.filter(conv => conv.type === 'individual');
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(conv => {
        if (conv.type === 'group' && conv.group) {
          return conv.group.name.toLowerCase().includes(query);
        } else if (conv.type === 'individual') {
          const otherParticipant = conv.participants.find(p => p.user_id !== profile?.id);
          return otherParticipant?.user?.full_name?.toLowerCase().includes(query) ||
                 otherParticipant?.user?.email?.toLowerCase().includes(query);
        }
        return false;
      });
    }

    setFilteredConversations(filtered);
  };

  const getConversationTitle = (conversation: ConversationWithDetails): string => {
    if (conversation.type === 'group' && conversation.group) {
      return conversation.group.name;
    } else {
      const otherParticipant = conversation.participants.find(p => p.user_id !== profile?.id);
      return otherParticipant?.user?.full_name || otherParticipant?.user?.email || 'Unknown';
    }
  };

  const getConversationAvatar = (conversation: ConversationWithDetails) => {
    if (conversation.type === 'group' && conversation.group) {
      return (
        <Avatar.Text
          size={48}
          label={conversation.group.name.substring(0, 2).toUpperCase()}
          style={styles.avatar}
        />
      );
    } else {
      const otherParticipant = conversation.participants.find(p => p.user_id !== profile?.id);
      const user = otherParticipant?.user;
      if (user?.avatar_url) {
        return <Avatar.Image size={48} source={{ uri: user.avatar_url }} style={styles.avatar} />;
      } else {
        return (
          <Avatar.Text
            size={48}
            label={user?.full_name?.substring(0, 2).toUpperCase() || 'U'}
            style={styles.avatar}
          />
        );
      }
    }
  };

  const getLastMessagePreview = (conversation: ConversationWithDetails): string => {
    if (conversation.last_message_text) {
      return conversation.last_message_text;
    }
    return 'No messages yet';
  };

  const getLastMessageTime = (conversation: ConversationWithDetails): string => {
    if (conversation.last_message_at) {
      const date = new Date(conversation.last_message_at);
      const now = new Date();
      const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
      
      if (diffInHours < 24) {
        return format(date, 'HH:mm');
      } else if (diffInHours < 168) {
        return format(date, 'EEE');
      } else {
        return format(date, 'MMM dd');
      }
    }
    return '';
  };

  const handleConversationPress = (conversation: ConversationWithDetails) => {
    // Navigate to Chat screen in RootStack
    navigation.getParent()?.navigate('Chat', { conversationId: conversation.id });
  };

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleStartNewChat = async () => {
    setEmailError('');
    
    if (!userEmail.trim()) {
      setEmailError('Email is required');
      return;
    }

    if (!validateEmail(userEmail.trim())) {
      setEmailError('Invalid email format');
      return;
    }

    if (userEmail.trim().toLowerCase() === profile?.email?.toLowerCase()) {
      setEmailError('Cannot chat with yourself');
      return;
    }

    setCreatingChat(true);
    try {
      const conversation = await chatService.getOrCreateIndividualConversation({
        other_user_email: userEmail.trim(),
      });
      
      setNewChatModalVisible(false);
      setUserEmail('');
      setEmailError('');
      
      // Reload conversations to show the new one
      await loadConversations();
      
      // Navigate to the chat (use parent navigator to access RootStack)
      navigation.getParent()?.navigate('Chat', { conversationId: conversation.id });
    } catch (error: any) {
      if (error.message === 'User not found') {
        setEmailError('User not found. User must have an account.');
      } else if (error.message === 'Cannot create conversation with yourself') {
        setEmailError('Cannot chat with yourself');
      } else {
        ErrorHandler.handleError(error, showToast, 'Start Chat');
      }
    } finally {
      setCreatingChat(false);
    }
  };

  const renderConversation = ({ item }: { item: ConversationWithDetails }) => {
    const title = getConversationTitle(item);
    const preview = getLastMessagePreview(item);
    const time = getLastMessageTime(item);
    const unreadCount = item.unread_count || 0;

    return (
      <Card
        style={[styles.conversationCard, { backgroundColor: theme.colors.surface }]}
        onPress={() => handleConversationPress(item)}
      >
        <Card.Content style={styles.conversationContent}>
          {getConversationAvatar(item)}
          <View style={styles.conversationInfo}>
            <View style={styles.conversationHeader}>
              <Text
                style={[styles.conversationTitle, { color: theme.colors.onSurface }]}
                numberOfLines={1}
              >
                {title}
              </Text>
              {time ? (
                <Text style={[styles.conversationTime, { color: theme.colors.onSurfaceVariant }]}>
                  {time}
                </Text>
              ) : null}
            </View>
            <View style={styles.conversationFooter}>
              <Text
                style={[styles.conversationPreview, { color: theme.colors.onSurfaceVariant }]}
                numberOfLines={1}
              >
                {preview}
              </Text>
              {unreadCount > 0 && (
                <View style={[styles.unreadBadge, { backgroundColor: theme.colors.primary }]}>
                  <Text style={styles.unreadText}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </Card.Content>
      </Card>
    );
  };

  // Show error state if there's an error and no conversations
  if (error && conversations.length === 0 && !loading) {
    return (
      <View style={[styles.container, styles.centerContent, { backgroundColor: theme.colors.background }]}>
        <ErrorState
          message={error}
          onRetry={() => {
            setError(null);
            setLoading(true);
            loadConversations();
          }}
        />
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Search and Filter */}
      <View style={styles.searchContainer}>
        <Searchbar
          placeholder="Search conversations..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchbar}
        />
        <View style={styles.filterContainer}>
          <Chip
            selected={filter === 'all'}
            onPress={() => setFilter('all')}
            style={styles.filterChip}
            selectedColor={theme.colors.primary}
          >
            All
          </Chip>
          <Chip
            selected={filter === 'groups'}
            onPress={() => setFilter('groups')}
            style={styles.filterChip}
            selectedColor={theme.colors.primary}
          >
            Groups
          </Chip>
          <Chip
            selected={filter === 'users'}
            onPress={() => setFilter('users')}
            style={styles.filterChip}
            selectedColor={theme.colors.primary}
          >
            Users
          </Chip>
        </View>
      </View>

      {/* Conversations List */}
      {filteredConversations.length === 0 ? (
        <View style={[styles.centerContent, styles.emptyContainer]}>
          <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>
            {searchQuery ? 'No conversations found' : 'No conversations yet'}
          </Text>
          <Text style={[styles.emptySubtext, { color: theme.colors.onSurfaceVariant }]}>
            {searchQuery
              ? 'Try adjusting your search'
              : 'Start a conversation from a group or with a user'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredConversations}
          renderItem={renderConversation}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}

      {/* FAB to start new chat */}
      <FAB
        icon="message-plus"
        style={[styles.fab, { backgroundColor: theme.colors.primary }]}
        onPress={() => setNewChatModalVisible(true)}
        label="New Chat"
      />

      {/* New Chat Modal */}
      <Portal>
        <Modal
          visible={newChatModalVisible}
          onDismiss={() => {
            setNewChatModalVisible(false);
            setUserEmail('');
            setEmailError('');
          }}
          contentContainerStyle={[styles.modalContent, { backgroundColor: theme.colors.surface }]}
        >
          <Text style={[styles.modalTitle, { color: theme.colors.onSurface }]}>
            Start New Chat
          </Text>
          <Text style={[styles.modalSubtitle, { color: theme.colors.onSurfaceVariant }]}>
            Enter the email address of the user you want to chat with
          </Text>

          <TextInput
            label="Email Address"
            value={userEmail}
            onChangeText={(text) => {
              setUserEmail(text);
              setEmailError('');
            }}
            mode="outlined"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            error={!!emailError}
            disabled={creatingChat}
            style={styles.modalInput}
            placeholder="user@example.com"
          />
          {emailError ? (
            <HelperText type="error" visible={!!emailError}>
              {emailError}
            </HelperText>
          ) : null}

          <View style={styles.modalActions}>
            <Button
              mode="outlined"
              onPress={() => {
                setNewChatModalVisible(false);
                setUserEmail('');
                setEmailError('');
              }}
              style={styles.modalButton}
              disabled={creatingChat}
            >
              Cancel
            </Button>
            <Button
              mode="contained"
              onPress={handleStartNewChat}
              style={styles.modalButton}
              loading={creatingChat}
              disabled={creatingChat || !userEmail.trim()}
            >
              Start Chat
            </Button>
          </View>
        </Modal>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchContainer: {
    padding: 16,
    paddingBottom: 8,
  },
  searchbar: {
    marginBottom: 12,
  },
  filterContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  filterChip: {
    marginRight: 8,
  },
  listContent: {
    padding: 16,
  },
  conversationCard: {
    marginBottom: 8,
    elevation: 1,
  },
  conversationContent: {
    flexDirection: 'row',
    paddingVertical: 12,
  },
  avatar: {
    marginRight: 12,
  },
  conversationInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  conversationTitle: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  conversationTime: {
    fontSize: 12,
    marginLeft: 8,
  },
  conversationFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  conversationPreview: {
    fontSize: 14,
    flex: 1,
  },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    marginLeft: 8,
  },
  unreadText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  emptyContainer: {
    padding: 32,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
  },
  modalContent: {
    padding: 24,
    margin: 20,
    borderRadius: 8,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    marginBottom: 20,
  },
  modalInput: {
    marginBottom: 8,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 16,
  },
  modalButton: {
    minWidth: 100,
  },
});

