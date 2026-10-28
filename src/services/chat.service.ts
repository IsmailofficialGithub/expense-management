// src/services/chat.service.ts
import { api, qs, requireUser } from './api';
import { subscribe } from './realtime';
import {
  ConversationWithDetails,
  MessageWithStatus,
  TypingIndicatorWithProfile,
  SendMessageRequest,
  CreateIndividualConversationRequest,
  CreateGroupConversationRequest,
} from '../types/database.types';

// Replaces Supabase RealtimeChannel: call it (or chatService.unsubscribe) to stop listening.
export type ChatSubscription = () => void;

// ============================================
// CHAT SERVICE
// ============================================

export const chatService = {
  /**
   * Get all conversations for current user
   */
  async getConversations(): Promise<ConversationWithDetails[]> {
    const { isOnline } = await import('../utils/networkAware');
    const { storageService } = await import('./storage.service');

    if (!isOnline()) {
      const cachedConversations = await storageService.getConversations() || [];
      return cachedConversations as unknown as ConversationWithDetails[];
    }

    const conversations = await api.get<ConversationWithDetails[]>('/conversations');
    await storageService.setConversations(conversations);
    return conversations;
  },

  /**
   * Get single conversation with details
   */
  async getConversation(conversationId: string): Promise<ConversationWithDetails | null> {
    return api.get<ConversationWithDetails | null>(`/conversations/${conversationId}`);
  },

  /**
   * Get or create individual conversation with another user
   */
  async getOrCreateIndividualConversation(
    request: CreateIndividualConversationRequest
  ): Promise<ConversationWithDetails> {
    return api.post<ConversationWithDetails>('/conversations/individual', {
      other_user_email: request.other_user_email,
    });
  },

  /**
   * Get or create group conversation
   */
  async getOrCreateGroupConversation(
    request: CreateGroupConversationRequest
  ): Promise<ConversationWithDetails> {
    return api.post<ConversationWithDetails>('/conversations/group', { group_id: request.group_id });
  },

  /**
   * Send a message (the server sends the push notification)
   */
  async sendMessage(request: SendMessageRequest): Promise<MessageWithStatus> {
    const user = await requireUser();
    const { isOnline } = await import('../utils/networkAware');
    const { storageService } = await import('./storage.service');
    const { syncService } = await import('./sync.service');

    const messageData = {
      conversation_id: request.conversation_id,
      sender_id: user.id,
      text: request.text,
      message_type: request.message_type || 'text',
      media_url: request.media_url || null,
      media_type: request.media_type || null,
      related_expense_id: request.related_expense_id || null,
    };

    if (isOnline()) {
      try {
        const message = await api.post<MessageWithStatus>(`/conversations/${request.conversation_id}/messages`, {
          text: messageData.text,
          message_type: messageData.message_type,
          media_url: messageData.media_url,
          media_type: messageData.media_type,
          related_expense_id: messageData.related_expense_id,
        });
        const existingMessages = await storageService.getMessages(request.conversation_id) || [];
        await storageService.setMessages([...existingMessages, message], request.conversation_id);
        return message;
      } catch (error: any) {
        console.warn('Failed to send message online, queueing for sync:', error);
      }
    }

    // Offline, or the online send failed: queue it and show a temporary message
    await syncService.addToQueue('create', 'message', request);
    const tempMessage = {
      id: `temp-${Date.now()}-${Math.random()}`,
      ...messageData,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_edited: false,
      is_deleted: false,
      deleted_at: null,
      sender: { id: user.id, full_name: 'You' } as any,
      reads: [],
      read_count: 0,
      total_participants: 0,
      status: 'sending',
    } as MessageWithStatus;
    const existingMessages = await storageService.getMessages(request.conversation_id) || [];
    await storageService.setMessages([...existingMessages, tempMessage], request.conversation_id);
    return tempMessage;
  },

  /**
   * Get messages for a conversation with pagination (oldest first)
   */
  async getMessages(
    conversationId: string,
    limit: number = 20,
    beforeTimestamp?: string
  ): Promise<{ messages: MessageWithStatus[]; hasMore: boolean }> {
    const { isOnline } = await import('../utils/networkAware');
    const { storageService } = await import('./storage.service');

    if (!isOnline()) {
      const localMessages = await storageService.getMessages(conversationId) || [];
      const sorted = localMessages.sort((a: any, b: any) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      const paginated = beforeTimestamp
        ? sorted.filter((m: any) => new Date(m.created_at).getTime() < new Date(beforeTimestamp).getTime()).slice(0, limit)
        : sorted.slice(0, limit);
      return {
        messages: paginated as MessageWithStatus[],
        hasMore: sorted.length > paginated.length,
      };
    }

    const result = await api.get<{ messages: MessageWithStatus[]; hasMore: boolean }>(
      `/conversations/${conversationId}/messages${qs({ limit, before: beforeTimestamp })}`
    );

    const updatedMessages = [...(await storageService.getMessages(conversationId) || [])];
    result.messages.forEach((msg) => {
      const index = updatedMessages.findIndex((m: any) => m.id === msg.id);
      if (index >= 0) updatedMessages[index] = msg;
      else updatedMessages.push(msg);
    });
    await storageService.setMessages(updatedMessages, conversationId);

    return result;
  },

  /**
   * Get message with status (sent/delivered/seen)
   */
  async getMessageWithStatus(messageId: string): Promise<MessageWithStatus> {
    return api.get<MessageWithStatus>(`/messages/${messageId}`);
  },

  /**
   * Mark message as read
   */
  async markAsRead(messageId: string): Promise<void> {
    await api.post(`/messages/${messageId}/read`);
  },

  /**
   * Mark all messages in conversation as read
   */
  async markConversationAsRead(conversationId: string): Promise<void> {
    await api.post(`/conversations/${conversationId}/read`);
  },

  /**
   * Set typing indicator
   */
  async setTyping(conversationId: string, isTyping: boolean): Promise<void> {
    await api.put(`/conversations/${conversationId}/typing`, { is_typing: isTyping });
  },

  /**
   * Get users currently typing
   */
  async getTypingUsers(conversationId: string): Promise<TypingIndicatorWithProfile[]> {
    return api.get<TypingIndicatorWithProfile[]>(`/conversations/${conversationId}/typing`);
  },

  /**
   * Subscribe to new messages in a conversation
   */
  subscribeToMessages(
    conversationId: string,
    callback: (message: MessageWithStatus) => void
  ): ChatSubscription {
    return subscribe(`conversation:${conversationId}`, async (event, message) => {
      if (event !== 'message') return;
      try {
        const { storageService } = await import('./storage.service');
        const existingMessages = await storageService.getMessages(conversationId) || [];
        if (!existingMessages.some((m: any) => m.id === message.id)) {
          await storageService.setMessages([...existingMessages, message], conversationId);
        }
      } catch (err) {
        console.error('Error caching incoming message:', err);
      }
      callback(message);
    });
  },

  /**
   * Subscribe to typing indicators
   */
  subscribeToTyping(
    conversationId: string,
    callback: (typingUsers: TypingIndicatorWithProfile[]) => void
  ): ChatSubscription {
    return subscribe(`conversation:${conversationId}`, (event, users) => {
      if (event === 'typing') callback(users);
    });
  },

  /**
   * Subscribe to read receipts
   */
  subscribeToReadReceipts(
    conversationId: string,
    callback: (messageId: string, readCount: number, totalParticipants: number, senderId: string) => void
  ): ChatSubscription {
    return subscribe(`conversation:${conversationId}`, async (event, data) => {
      if (event !== 'read') return;
      for (const id of data.message_ids as string[]) {
        try {
          const msg = await this.getMessageWithStatus(id);
          const readCount = (msg.reads || []).filter((r: any) => r.user_id !== msg.sender_id).length;
          callback(id, readCount, msg.total_participants, msg.sender_id);
        } catch (err) {
          console.error('Error handling read receipt:', err);
        }
      }
    });
  },

  /**
   * Unsubscribe from channel
   */
  unsubscribe(channel: ChatSubscription): void {
    channel();
  },

  /**
   * Delete message for everyone (only sender can do this)
   */
  async deleteMessageForEveryone(messageId: string): Promise<void> {
    await api.del(`/messages/${messageId}`);
  },

  /**
   * Delete message for me (hide from current user)
   */
  async deleteMessageForMe(messageId: string): Promise<void> {
    await api.post(`/messages/${messageId}/hide`);
  },
};
