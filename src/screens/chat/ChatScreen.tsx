// src/screens/chat/ChatScreen.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  TextInput as RNTextInput,
  Pressable,
  Alert,
  AppState,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Text,
  IconButton,
  Avatar,
  ActivityIndicator,
  Icon,
} from 'react-native-paper';
import { useTheme } from 'react-native-paper';
import { chatService } from '../../services/chat.service';
import { MessageWithStatus, ConversationWithDetails, TypingIndicatorWithProfile } from '../../types/database.types';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { useUI } from '../../hooks/useUI';
import { ErrorHandler } from '../../utils/errorHandler';
import { format } from 'date-fns';
import { RealtimeChannel } from '@supabase/supabase-js';
import ErrorState from '../../components/ErrorState';

interface Props {
  route: {
    params: {
      conversationId: string;
    };
  };
  navigation: any;
}

export default function ChatScreen({ route, navigation }: Props) {
  const theme = useTheme();
  const { profile } = useAuth();
  const { showToast } = useToast();
  const { isOnline } = useUI();
  const { conversationId } = route.params;
  const insets = useSafeAreaInsets();

  const [conversation, setConversation] = useState<ConversationWithDetails | null>(null);
  const [messages, setMessages] = useState<MessageWithStatus[]>([]);
  const [typingUsers, setTypingUsers] = useState<TypingIndicatorWithProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [sending, setSending] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [typingTimeout, setTypingTimeout] = useState<NodeJS.Timeout | null>(null);
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const flatListRef = useRef<FlatList>(null);
  const messageChannelsRef = useRef<RealtimeChannel[]>([]);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    loadConversation();
    loadMessages();
    setupSubscriptions();

    return () => {
      // Cleanup subscriptions
      messageChannelsRef.current.forEach(channel => {
        chatService.unsubscribe(channel);
      });
      // Clear typing indicator
      chatService.setTyping(conversationId, false);
    };
  }, [conversationId]);

  // Refresh message statuses when screen is opened/focused
  useFocusEffect(
    useCallback(() => {
      if (messages.length > 0 && profile && !loading) {
        console.log('Screen focused - refreshing message statuses via API');
        refreshMessageStatuses();
      }
    }, [messages.length, profile?.id, loading])
  );

  useEffect(() => {
    // Mark conversation as read when messages are loaded
    if (messages.length > 0 && profile) {
      chatService.markConversationAsRead(conversationId).then(() => {
        // Wait a bit for read receipts to be created, then refresh
        setTimeout(() => {
          refreshMessageStatuses();
        }, 500);
      }).catch(error => {
        console.error('Error marking conversation as read:', error);
      });
    }
  }, [messages.length, conversationId, profile?.id]);

  const refreshMessageStatuses = async () => {
    if (!profile) return;

    // Refresh status for all messages that belong to current user
    // Filter out temporary messages (they start with "temp-")
    const myMessages = messages.filter(msg =>
      msg.sender_id === profile.id &&
      !msg.id.startsWith('temp-') // Exclude temporary optimistic messages
    );
    if (myMessages.length === 0) return;

    try {
      const updatedMessages = await Promise.all(
        myMessages.map(msg => chatService.getMessageWithStatus(msg.id))
      );

      setMessages(prev => {
        const updated = prev.map(msg => {
          // Skip temporary messages
          if (msg.id.startsWith('temp-')) return msg;

          const updatedMsg = updatedMessages.find(m => m.id === msg.id);
          if (updatedMsg && updatedMsg.status !== msg.status) {
            return updatedMsg;
          }
          return msg;
        });

        return updated;
      });
    } catch (error) {
      console.error('Error refreshing message statuses:', error);
    }
  };

  useEffect(() => {
    // Update header when selection mode changes
    if (conversation) {
      const title = conversation.type === 'group' && conversation.group
        ? conversation.group.name
        : conversation.participants.find(p => p.user_id !== profile?.id)?.user?.full_name || 'Chat';
      navigation.setOptions({
        title: isSelectionMode ? `${selectedMessages.size} selected` : title,
        headerRight: isSelectionMode ? () => (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: -8 }}>
            <IconButton
              icon="delete"
              iconColor={theme.colors.error}
              size={24}
              onPress={handleDeleteSelected}
              style={{ margin: 0 }}
            />
            <IconButton
              icon="close"
              iconColor={theme.colors.onSurface}
              size={24}
              onPress={exitSelectionMode}
              style={{ margin: 0 }}
            />
          </View>
        ) : undefined,
      });
    }
  }, [isSelectionMode, selectedMessages.size, conversation, theme]);

  const loadConversation = async () => {
    try {
      const data = await chatService.getConversation(conversationId);
      setConversation(data);

      // Set header title
      if (data) {
        const title = data.type === 'group' && data.group
          ? data.group.name
          : data.participants.find(p => p.user_id !== profile?.id)?.user?.full_name || 'Chat';
        navigation.setOptions({ title });
      }
    } catch (error) {
      ErrorHandler.handleError(error, showToast, 'Chat');
    }
  };

  const loadMessages = async (beforeTimestamp?: string) => {
    setError(null);
    let shouldContinueToAPI = true;



    // First, try to load from cache immediately (like WhatsApp)
    if (!beforeTimestamp) {
      try {
        const { storageService } = await import('../../services/storage.service');
        const cachedMessages = await storageService.getMessages(conversationId) || [];
        if (cachedMessages.length > 0) {
          console.log('Loaded messages from cache:', cachedMessages.length);
          // Show cached messages immediately
          const sorted = cachedMessages.sort((a: any, b: any) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
          setMessages(sorted); // Newest first (descending)
          setHasMore(true);
          setLoading(false);

          // Then sync in background if online
          if (!isOnline) {
            shouldContinueToAPI = false;
          }
        }
      } catch (error) {
        console.error('Error loading cached messages:', error);
      }
    }

    // Then fetch from API
    try {
      if (shouldContinueToAPI) {
        // chatService.getMessages returns oldest first (Ascending)
        const { messages: newMessages, hasMore: moreAvailable } = await chatService.getMessages(
          conversationId,
          20,
          beforeTimestamp
        );

        if (beforeTimestamp) {
          // Loading more (older messages are fetched with 'beforeTimestamp')
          // newMessages are [older...oldest] (Ascending)? No, chatService returns [oldest...older] usually or [older...oldest]?
          // chatService.getMessages lines 486: returns messagesWithStatus.reverse().
          // messagesWithStatus comes from query 'order created_at desc'.
          // So database query returns [newest...oldest].
          // chatService reverses it -> [oldest...newest].
          // So newMessages is Ascending.

          // For inverted list, we want [newest, older, oldest].
          // When loading more, we append to the end.
          // Appended chunk should be [older, oldest].
          // So we need to reverse newMessages to get Descending order.

          setMessages(prev => [...prev, ...[...newMessages].reverse()]);
          setHasMore(moreAvailable);
        } else {
          // Initial load
          setMessages([...newMessages].reverse());
          setHasMore(moreAvailable);
          setLoading(false);
        }
      }
    } catch (error: any) {
      const errorMessage = ErrorHandler.getUserFriendlyMessage(error);
      setError(errorMessage);
      ErrorHandler.handleError(error, showToast, 'Chat');
      if (!beforeTimestamp) {
        setLoading(false);
      }
    } finally {
      setLoadingMore(false);
      loadingMoreRef.current = false;
      if (!beforeTimestamp && loading) {
        setLoading(false);
      }
    }
  };

  const loadMoreMessages = () => {
    if (loadingMoreRef.current || loadingMore || !hasMore || messages.length === 0) return;

    loadingMoreRef.current = true;
    setLoadingMore(true);
    // Get the oldest message timestamp (last item in inverted list)
    const oldestMessage = messages[messages.length - 1];
    if (oldestMessage) {
      loadMessages(oldestMessage.created_at);
    }
  };

  const setupSubscriptions = () => {
    // Subscribe to new messages
    const messageChannel = chatService.subscribeToMessages(conversationId, (newMessage) => {
      setMessages(prev => {
        // Remove any temporary message with same text (optimistic message replacement)
        const filtered = prev.filter(m =>
          !(m.id.startsWith('temp-') && m.text === newMessage.text && m.sender_id === newMessage.sender_id)
        );

        // Check if message already exists
        if (filtered.find(m => m.id === newMessage.id)) {
          return filtered;
        }

        // Prepend new message (newest messages are at the start in inverted list)
        return [newMessage, ...filtered];
      });

      // Mark as read if conversation is visible
      chatService.markAsRead(newMessage.id);
    });
    messageChannelsRef.current.push(messageChannel);

    // Subscribe to typing indicators
    const typingChannel = chatService.subscribeToTyping(conversationId, (users) => {
      setTypingUsers(users.filter(u => u.user_id !== profile?.id));
    });
    messageChannelsRef.current.push(typingChannel);

    // Read receipt subscription removed - only showing single tick (sent) status
  };

  const handleSend = async () => {
    const text = messageText.trim();
    if (!text) return;

    // Clear input immediately to allow next message
    setMessageText('');

    // Clear typing indicator immediately
    chatService.setTyping(conversationId, false);
    if (typingTimeout) {
      clearTimeout(typingTimeout);
      setTypingTimeout(null);
    }

    const tempMessageId = `temp-${Date.now()}-${Math.random()}`;

    // Optimistically add message to list with loading state
    if (!profile) return;

    const optimisticMessage: MessageWithStatus = {
      id: tempMessageId,
      conversation_id: conversationId,
      sender_id: profile.id,
      text: text,
      message_type: 'text',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_edited: false,
      is_deleted: false,
      deleted_at: null,
      related_expense_id: null,
      media_url: null,
      media_type: null,
      sender: profile, // Use full profile object
      reads: [],
      status: 'sending', // Custom status for optimistic message
      read_count: 0,
      total_participants: conversation?.participants.length || 1,
    };

    setMessages(prev => [optimisticMessage, ...prev]);

    // Scroll to bottom to ensure new message is seen
    setTimeout(() => {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    }, 100);

    console.log('Sending message:', text);
    try {
      const sentMessage = await chatService.sendMessage({
        conversation_id: conversationId,
        text,
      });
      console.log('Message sent successfully:', sentMessage.id);

      // Remove temporary message and add the real one (or keep temp if offline)
      setMessages(prev => {
        const filtered = prev.filter(msg => msg.id !== tempMessageId);
        // Check if message already exists (from subscription)
        if (filtered.find(m => m.id === sentMessage.id)) {
          return filtered;
        }
        return [sentMessage, ...filtered];
      });

      // Show appropriate toast based on online status
      if (isOnline && !sentMessage.id.startsWith('temp-')) {
        // Message was sent successfully online
      } else if (!isOnline || sentMessage.id.startsWith('temp-')) {
        // Message was queued for offline sync
        showToast('Message saved offline. Will send when connection is restored.', 'info');
      }
    } catch (error) {
      console.error('Error sending message:', error);
      // Remove optimistic message on error (only if it's a real error, not offline)
      setMessages(prev => prev.filter(msg => msg.id !== tempMessageId));
      ErrorHandler.handleError(error, showToast, 'Send Message');
    }
  };

  const handleTyping = (text: string) => {
    setMessageText(text);

    // Set typing indicator
    if (text.trim()) {
      chatService.setTyping(conversationId, true);

      // Clear existing timeout
      if (typingTimeout) {
        clearTimeout(typingTimeout);
      }

      // Clear typing after 3 seconds of no typing
      const timeout = setTimeout(() => {
        chatService.setTyping(conversationId, false);
      }, 3000);
      setTypingTimeout(timeout);
    } else {
      // Clear typing if message is empty
      chatService.setTyping(conversationId, false);
      if (typingTimeout) {
        clearTimeout(typingTimeout);
        setTypingTimeout(null);
      }
    }
  };

  const toggleMessageSelection = (messageId: string) => {
    setSelectedMessages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
      } else {
        newSet.add(messageId);
      }
      if (newSet.size === 0) {
        setIsSelectionMode(false);
      }
      return newSet;
    });
  };

  const handleMessageLongPress = (message: MessageWithStatus) => {
    if (!isSelectionMode) {
      setIsSelectionMode(true);
      setSelectedMessages(new Set([message.id]));
    } else {
      toggleMessageSelection(message.id);
    }
  };

  const handleMessagePress = (message: MessageWithStatus) => {
    if (isSelectionMode) {
      toggleMessageSelection(message.id);
    }
  };

  const exitSelectionMode = () => {
    setIsSelectionMode(false);
    setSelectedMessages(new Set());
  };

  const handleDeleteSelected = () => {
    const selectedArray = Array.from(selectedMessages);
    const selectedMessagesData = messages.filter(msg => selectedArray.includes(msg.id));
    const myMessages = selectedMessagesData.filter(msg => msg.sender_id === profile?.id);
    const otherMessages = selectedMessagesData.filter(msg => msg.sender_id !== profile?.id);

    const options: any[] = [];

    if (myMessages.length > 0) {
      options.push({
        text: `Delete ${myMessages.length} for Everyone`,
        style: 'destructive' as const,
        onPress: async () => {
          try {
            await Promise.all(myMessages.map(msg => chatService.deleteMessageForEveryone(msg.id)));
            setMessages(prev => prev.filter(msg => !selectedArray.includes(msg.id)));
            showToast(`${myMessages.length} message(s) deleted for everyone`, 'success');
            exitSelectionMode();
          } catch (error) {
            ErrorHandler.handleError(error, showToast, 'Delete Messages');
          }
        },
      });
    }

    if (selectedMessagesData.length > 0) {
      options.push({
        text: `Delete ${selectedMessagesData.length} for Me`,
        style: 'destructive' as const,
        onPress: async () => {
          try {
            await Promise.all(selectedMessagesData.map(msg => chatService.deleteMessageForMe(msg.id)));
            setMessages(prev => prev.filter(msg => !selectedArray.includes(msg.id)));
            showToast(`${selectedMessagesData.length} message(s) deleted`, 'success');
            exitSelectionMode();
          } catch (error) {
            ErrorHandler.handleError(error, showToast, 'Delete Messages');
          }
        },
      });
    }

    options.push({ text: 'Cancel', style: 'cancel' as const });

    Alert.alert('Delete Messages', `Delete ${selectedMessagesData.length} selected message(s)?`, options, { cancelable: true });
  };

  const showDeleteMenu = (message: MessageWithStatus) => {
    const isMyMessage = message.sender_id === profile?.id;
    const options: any[] = [];

    if (isMyMessage) {
      options.push({
        text: 'Delete for Everyone',
        style: 'destructive' as const,
        onPress: async () => {
          Alert.alert(
            'Delete for Everyone',
            'Are you sure you want to delete this message for everyone?',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                  try {
                    await chatService.deleteMessageForEveryone(message.id);
                    setMessages(prev => prev.filter(msg => msg.id !== message.id));
                    showToast('Message deleted', 'success');
                  } catch (error) {
                    ErrorHandler.handleError(error, showToast, 'Delete Message');
                  }
                },
              },
            ]
          );
        },
      });
    }

    options.push({
      text: 'Delete for Me',
      style: 'destructive' as const,
      onPress: async () => {
        try {
          await chatService.deleteMessageForMe(message.id);
          setMessages(prev => prev.filter(msg => msg.id !== message.id));
          showToast('Message deleted', 'success');
        } catch (error) {
          ErrorHandler.handleError(error, showToast, 'Delete Message');
        }
      },
    });

    options.push({ text: 'Cancel', style: 'cancel' as const });

    Alert.alert('Message Options', '', options, { cancelable: true });
  };

  const renderMessage = ({ item }: { item: MessageWithStatus }) => {
    const isMyMessage = item.sender_id === profile?.id;
    const sender = item.sender;
    const showAvatar = !isMyMessage;
    const isSelected = selectedMessages.has(item.id);

    return (
      <Pressable
        onPress={() => handleMessagePress(item)}
        onLongPress={() => handleMessageLongPress(item)}
        style={[
          isSelected && { backgroundColor: theme.colors.primaryContainer, opacity: 0.7 }
        ]}
      >
        <View
          style={[
            styles.messageContainer,
            isMyMessage ? styles.myMessageContainer : styles.otherMessageContainer,
          ]}
        >
          {isSelectionMode && (
            <IconButton
              icon={isSelected ? 'check-circle' : 'circle-outline'}
              iconColor={isSelected ? theme.colors.primary : theme.colors.onSurfaceVariant}
              size={24}
              onPress={() => toggleMessageSelection(item.id)}
              style={{ marginRight: 8 }}
            />
          )}
          {showAvatar && !isSelectionMode && (
            <Avatar.Text
              size={32}
              label={sender?.full_name?.substring(0, 2).toUpperCase() || 'U'}
              style={styles.messageAvatar}
            />
          )}
          <View
            style={[
              styles.messageBubble,
              isMyMessage
                ? { backgroundColor: theme.colors.primary }
                : { backgroundColor: theme.colors.surfaceVariant },
            ]}
          >
            {!isMyMessage && (
              <Text style={[styles.senderName, { color: theme.colors.primary }]}>
                {sender?.full_name || 'Unknown'}
              </Text>
            )}
            <Text
              style={[
                styles.messageText,
                isMyMessage ? { color: '#fff' } : { color: theme.colors.onSurface },
              ]}
            >
              {item.is_deleted ? 'This message was deleted' : item.text}
            </Text>
            <View style={styles.messageFooter}>
              <Text
                style={[
                  styles.messageTime,
                  isMyMessage ? { color: 'rgba(255,255,255,0.7)' } : { color: theme.colors.onSurfaceVariant },
                ]}
              >
                {format(new Date(item.created_at), 'hh:mm a')}
              </Text>
              {isMyMessage && (
                <View style={styles.messageStatusContainer}>
                  {item.status === 'sending' ? (
                    <ActivityIndicator size={12} color="rgba(255,255,255,0.7)" />
                  ) : (
                    <Icon source="check" size={14} color="rgba(255,255,255,0.7)" />
                  )}
                </View>
              )}
            </View>
          </View>
        </View>
      </Pressable>
    );
  };

  const renderTypingIndicator = () => {
    if (typingUsers.length === 0) return null;

    const names = typingUsers.map(u => u.user?.full_name || 'Someone').join(', ');
    return (
      <View style={styles.typingContainer}>
        <Text style={[styles.typingText, { color: theme.colors.onSurfaceVariant }]}>
          {names} {typingUsers.length === 1 ? 'is' : 'are'} typing...
        </Text>
      </View>
    );
  };

  // Show error state if there's an error and no messages
  if (error && messages.length === 0 && !loading) {
    return (
      <View style={[styles.container, styles.centerContent, { backgroundColor: theme.colors.background }]}>
        <ErrorState
          message={error}
          onRetry={() => {
            setError(null);
            setLoading(true);
            loadMessages();
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
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        enabled={Platform.OS === 'ios'}
      >
        <View style={{ flex: 1 }}>
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(item, index) => {
              if (item.id.startsWith('temp-')) {
                return `temp-${index}-${item.created_at}`;
              }
              return item.id;
            }}
            style={{ flex: 1 }}
            contentContainerStyle={[styles.messagesList, messages.length === 0 && { flex: 1, justifyContent: 'center' }]}
            inverted
            ListEmptyComponent={
              <View style={[styles.centerContent, { transform: [{ scaleY: -1 }] }]}>
                <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 16 }}>No messages yet</Text>
              </View>
            }
            onEndReached={() => {
              if (hasMore && !loadingMore && !loadingMoreRef.current) {
                loadMoreMessages();
              }
            }}
            onEndReachedThreshold={0.3}
            onScroll={(event) => {
              const offsetY = event.nativeEvent.contentOffset.y;
              setShowScrollToBottom(offsetY > 300);
            }}
            ListFooterComponent={
              loadingMore ? (
                <View style={styles.loadMoreContainer}>
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                </View>
              ) : null
            }
            ListHeaderComponent={renderTypingIndicator}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
          />
          {showScrollToBottom && (
            <IconButton
              icon="chevron-down"
              mode="contained"
              containerColor={theme.colors.secondaryContainer}
              iconColor={theme.colors.onSecondaryContainer}
              size={24}
              onPress={() => {
                flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
              }}
              style={styles.scrollToBottomFab}
            />
          )}
        </View>

        {/* Input Area */}
        <View style={[styles.inputContainer, {
          backgroundColor: theme.colors.surface,
          paddingBottom: Math.max(insets.bottom, 8),
        }]}>
          <View style={[styles.inputWrapper, { backgroundColor: theme.colors.surfaceVariant }]}>
            <RNTextInput
              style={[styles.textInput, { color: theme.colors.onSurface }]}
              placeholder="Type a message..."
              placeholderTextColor={theme.colors.onSurfaceVariant}
              value={messageText}
              onChangeText={handleTyping}
              multiline
              maxLength={1000}

            />
            <IconButton
              icon="send"
              size={24}
              iconColor={theme.colors.primary}
              onPress={handleSend}
              disabled={!messageText.trim()}
              style={styles.sendButton}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  messagesList: {
    padding: 16,
    paddingBottom: 8,
  },
  loadMoreContainer: {
    padding: 16,
    alignItems: 'center',
  },
  messageContainer: {
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'flex-end',
  },
  myMessageContainer: {
    justifyContent: 'flex-end',
  },
  otherMessageContainer: {
    justifyContent: 'flex-start',
  },
  messageAvatar: {
    marginRight: 8,
    marginBottom: 4,
  },
  messageBubble: {
    maxWidth: '75%',
    padding: 12,
    borderRadius: 16,
  },
  senderName: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    justifyContent: 'flex-end',
  },
  messageTime: {
    fontSize: 11,
    marginRight: 4,
  },
  messageStatusContainer: {
    marginLeft: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  typingContainer: {
    padding: 8,
    paddingLeft: 16,
  },
  typingText: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  inputContainer: {
    padding: 8,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: 24,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    maxHeight: 100,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sendButton: {
    margin: 0,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollToBottomFab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    borderRadius: 24,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
});