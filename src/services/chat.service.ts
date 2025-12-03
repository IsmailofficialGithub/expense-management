// src/services/chat.service.ts
import { supabase } from './supabase';
import {
  Conversation,
  ConversationWithDetails,
  Message,
  MessageWithStatus,
  ConversationParticipant,
  MessageRead,
  TypingIndicator,
  TypingIndicatorWithProfile,
  SendMessageRequest,
  CreateIndividualConversationRequest,
  CreateGroupConversationRequest,
  Profile,
  Group,
} from '../types/database.types';
import { RealtimeChannel } from '@supabase/supabase-js';

// ============================================
// CHAT SERVICE
// ============================================

export const chatService = {
  /**
   * Get all conversations for current user
   */
  async getConversations(): Promise<ConversationWithDetails[]> {
    // Check if offline and load from local storage
    const { isOnline } = await import('../utils/networkAware');
    const { storageService } = await import('./storage.service');
    
    if (!isOnline()) {
      // Load from local storage
      const cachedConversations = await storageService.getConversations() || [];
      return cachedConversations;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // First, get all conversation IDs where user is a participant
    const { data: participantData, error: participantError } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', user.id);

    if (participantError) throw participantError;
    if (!participantData || participantData.length === 0) {
      // Save empty array to cache
      await storageService.setConversations([]);
      return [];
    }

    const conversationIds = participantData.map(p => p.conversation_id);

    // Get all conversations
    const { data: conversations, error } = await supabase
      .from('conversations')
      .select(`
        *,
        group:groups(*),
        last_message_sender:profiles!conversations_last_message_sender_id_fkey(*)
      `)
      .in('id', conversationIds)
      .order('last_message_at', { ascending: false, nullsFirst: false });

    if (error) throw error;

    // Get participants and unread counts for each conversation
    const conversationsWithDetails = await Promise.all(
      (conversations || []).map(async (conv) => {
        // Get participants
        const { data: participants } = await supabase
          .from('conversation_participants')
          .select(`
            *,
            user:profiles(*)
          `)
          .eq('conversation_id', conv.id);

        // Get unread count (messages after last_read_at)
        const participant = participants?.find(p => p.user_id === user.id);
        const unreadCount = participant?.last_read_at
          ? await this.getUnreadCount(conv.id, participant.last_read_at)
          : await this.getMessageCount(conv.id);

        return {
          ...conv,
          participants: participants || [],
          unread_count: unreadCount || 0,
        } as ConversationWithDetails;
      })
    );

    // Save to local storage for offline access
    await storageService.setConversations(conversationsWithDetails);

    return conversationsWithDetails;
  },

  /**
   * Get single conversation with details
   */
  async getConversation(conversationId: string): Promise<ConversationWithDetails | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data: conversation, error } = await supabase
      .from('conversations')
      .select(`
        *,
        group:groups(*),
        last_message_sender:profiles!conversations_last_message_sender_id_fkey(*)
      `)
      .eq('id', conversationId)
      .single();

    if (error) throw error;
    if (!conversation) return null;

    // Get participants
    const { data: participants } = await supabase
      .from('conversation_participants')
      .select(`
        *,
        user:profiles(*)
      `)
      .eq('conversation_id', conversationId);

    // Get unread count
    const participant = participants?.find(p => p.user_id === user.id);
    const unreadCount = participant?.last_read_at
      ? await this.getUnreadCount(conversationId, participant.last_read_at)
      : await this.getMessageCount(conversationId);

    return {
      ...conversation,
      participants: participants || [],
      unread_count: unreadCount || 0,
    } as ConversationWithDetails;
  },

  /**
   * Get or create individual conversation with another user
   */
  async getOrCreateIndividualConversation(
    request: CreateIndividualConversationRequest
  ): Promise<ConversationWithDetails> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Find the other user by email
    const { data: otherUser, error: userError } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', request.other_user_email.toLowerCase())
      .single();

    if (userError || !otherUser) {
      throw new Error('User not found');
    }

    if (otherUser.id === user.id) {
      throw new Error('Cannot create conversation with yourself');
    }

    // Check if conversation already exists
    // Get all conversations where current user is a participant
    const { data: myConversations } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', user.id);

    if (myConversations && myConversations.length > 0) {
      const myConversationIds = myConversations.map(cp => cp.conversation_id);
      
      // Get conversations where other user is also a participant
      const { data: sharedConversations } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', otherUser.id)
        .in('conversation_id', myConversationIds);

      if (sharedConversations && sharedConversations.length > 0) {
        // Check if it's an individual conversation (not a group)
        const { data: existingConv } = await supabase
          .from('conversations')
          .select('id, type')
          .eq('id', sharedConversations[0].conversation_id)
          .eq('type', 'individual')
          .single();

        if (existingConv) {
          // Conversation exists, return it
          const conversation = await this.getConversation(existingConv.id);
          if (conversation) return conversation;
        }
      }
    }

    // Create new conversation
    const { data: newConversation, error: convError } = await supabase
      .from('conversations')
      .insert({
        type: 'individual',
        group_id: null,
        created_by: user.id,
      })
      .select()
      .single();

    if (convError) throw convError;

    // Add both users as participants
    const { error: participantsError } = await supabase
      .from('conversation_participants')
      .insert([
        { conversation_id: newConversation.id, user_id: user.id },
        { conversation_id: newConversation.id, user_id: otherUser.id },
      ]);

    if (participantsError) throw participantsError;

    return this.getConversation(newConversation.id) as Promise<ConversationWithDetails>;
  },

  /**
   * Get or create group conversation
   */
  async getOrCreateGroupConversation(
    request: CreateGroupConversationRequest
  ): Promise<ConversationWithDetails> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Check if conversation already exists for this group
    const { data: existingConversation, error: checkError } = await supabase
      .from('conversations')
      .select('*')
      .eq('group_id', request.group_id)
      .eq('type', 'group')
      .single();

    if (existingConversation && !checkError) {
      return this.getConversation(existingConversation.id) as Promise<ConversationWithDetails>;
    }

    // Verify user is member of group
    const { data: membership } = await supabase
      .from('group_members')
      .select('id')
      .eq('group_id', request.group_id)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      throw new Error('You are not a member of this group');
    }

    // Create new group conversation
    // The trigger will auto-add all group members as participants
    const { data: newConversation, error: convError } = await supabase
      .from('conversations')
      .insert({
        type: 'group',
        group_id: request.group_id,
        created_by: user.id,
      })
      .select()
      .single();

    if (convError) throw convError;

    return this.getConversation(newConversation.id) as Promise<ConversationWithDetails>;
  },

  /**
   * Send a message
   */
  async sendMessage(request: SendMessageRequest): Promise<MessageWithStatus> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Import network-aware utilities
    const { isOnline } = await import('../utils/networkAware');
    const { storageService } = await import('./storage.service');
    const { syncService } = await import('./sync.service');

    // Create message object with sender profile
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
        // Insert message with sender profile in one query (faster - no participant check, RLS handles it)
        const { data: message, error } = await supabase
          .from('messages')
          .insert(messageData)
          .select(`
            *,
            sender:profiles(*)
          `)
          .single();

        if (error) throw error;

        // Save to local storage
        const existingMessages = await storageService.getMessages(request.conversation_id) || [];
        const messageWithStatus: MessageWithStatus = {
          ...message,
          reads: [],
          read_count: 0,
          total_participants: 0,
          status: 'sent',
        };
        await storageService.setMessages([...existingMessages, messageWithStatus], request.conversation_id);

        return messageWithStatus;
      } catch (error: any) {
        // If online call fails, queue for sync
        console.warn('Failed to send message online, queueing for sync:', error);
        await syncService.addToQueue('create', 'message', request);
        
        // Create temporary message for offline display
        const tempMessage: MessageWithStatus = {
          id: `temp-${Date.now()}-${Math.random()}`,
          ...messageData,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          is_edited: false,
          is_deleted: false,
          deleted_at: null,
          sender: { id: user.id, full_name: user.user_metadata?.full_name || 'You' } as any,
          reads: [],
          read_count: 0,
          total_participants: 0,
          status: 'sending',
        };
        
        // Save to local storage
        const existingMessages = await storageService.getMessages(request.conversation_id) || [];
        await storageService.setMessages([...existingMessages, tempMessage], request.conversation_id);
        
        return tempMessage;
      }
    } else {
      // Offline: queue the message
      await syncService.addToQueue('create', 'message', request);
      
      // Create temporary message for offline display
      const tempMessage: MessageWithStatus = {
        id: `temp-${Date.now()}-${Math.random()}`,
        ...messageData,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_edited: false,
        is_deleted: false,
        deleted_at: null,
        sender: { id: user.id, full_name: user.user_metadata?.full_name || 'You' } as any,
        reads: [],
        read_count: 0,
        total_participants: 0,
        status: 'sending',
      };
      
      // Save to local storage
      const existingMessages = await storageService.getMessages(request.conversation_id) || [];
      await storageService.setMessages([...existingMessages, tempMessage], request.conversation_id);
      
      return tempMessage;
    }
  },

  /**
   * Get messages for a conversation with pagination
   */
  async getMessages(
    conversationId: string, 
    limit: number = 20,
    beforeTimestamp?: string
  ): Promise<{ messages: MessageWithStatus[]; hasMore: boolean }> {
    // Check if offline and load from local storage
    const { isOnline } = await import('../utils/networkAware');
    const { storageService } = await import('./storage.service');
    
    if (!isOnline()) {
      // Load from local storage
      const localMessages = await storageService.getMessages(conversationId) || [];
      // Sort by created_at descending (newest first)
      const sorted = localMessages.sort((a: any, b: any) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      // Apply pagination if needed
      const paginated = beforeTimestamp 
        ? sorted.filter((m: any) => new Date(m.created_at).getTime() < new Date(beforeTimestamp).getTime()).slice(0, limit)
        : sorted.slice(0, limit);
      return {
        messages: paginated,
        hasMore: sorted.length > paginated.length,
      };
    }
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Get messages deleted for current user
    const { data: deletedMessages } = await supabase
      .from('message_deletions')
      .select('message_id')
      .eq('user_id', user.id);

    const deletedMessageIds = deletedMessages?.map(d => d.message_id) || [];

    // Build query - get one extra to check if there are more
    let query = supabase
      .from('messages')
      .select('*', { count: 'exact' })
      .eq('conversation_id', conversationId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(limit + 1); // Get one extra to check if there are more

    // If beforeTimestamp is provided, get messages before that timestamp
    if (beforeTimestamp) {
      query = query.lt('created_at', beforeTimestamp);
    }

    const { data: messages, error, count } = await query;

    if (error) throw error;

    // Filter out messages deleted for current user (client-side filter)
    const filteredMessages = messages?.filter(msg => !deletedMessageIds.includes(msg.id)) || [];

    // Check if there are more messages
    const hasMore = filteredMessages.length > limit;
    const messagesToReturn = hasMore ? filteredMessages.slice(0, limit) : filteredMessages;

    // Get messages with status (only for the messages we're returning)
    const messagesWithStatus = await Promise.all(
      messagesToReturn.map(msg => this.getMessageWithStatus(msg.id))
    );

    // Save to local storage for offline access
    const existingMessages = await storageService.getMessages(conversationId) || [];
    const updatedMessages = [...existingMessages];
    messagesWithStatus.forEach((msg) => {
      const index = updatedMessages.findIndex((m: any) => m.id === msg.id);
      if (index >= 0) {
        updatedMessages[index] = msg;
      } else {
        updatedMessages.push(msg);
      }
    });
    await storageService.setMessages(updatedMessages, conversationId);

    return {
      messages: messagesWithStatus.reverse(), // Oldest first
      hasMore,
    };
  },

  /**
   * Get message with status (sent/delivered/seen)
   */
  async getMessageWithStatus(messageId: string): Promise<MessageWithStatus> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Get message with sender
    const { data: message, error } = await supabase
      .from('messages')
      .select(`
        *,
        sender:profiles(*)
      `)
      .eq('id', messageId)
      .single();

    if (error) throw error;

    // Get conversation participants count
    const { count: participantCount } = await supabase
      .from('conversation_participants')
      .select('*', { count: 'exact', head: true })
      .eq('conversation_id', message.conversation_id);

    // Get read receipts (for reference, but not used for status)
    const { data: reads } = await supabase
      .from('message_reads')
      .select('*')
      .eq('message_id', messageId);

    const readCount = reads?.length || 0;
    const totalParticipants = participantCount || 0;

    // Simple status - just sent (single tick)
    let status: 'sent' = 'sent';

    // Get all reads (including sender) for the reads array
    const { data: allReads } = await supabase
      .from('message_reads')
      .select('*')
      .eq('message_id', messageId);

    return {
      ...message,
      reads: reads || [],
      read_count: readCount,
      total_participants: totalParticipants,
      status,
    } as MessageWithStatus;
  },

  /**
   * Mark message as read
   */
  async markAsRead(messageId: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Get message to find conversation
    const { data: message } = await supabase
      .from('messages')
      .select('conversation_id')
      .eq('id', messageId)
      .single();

    if (!message) return;

    // Insert or update read receipt
    const { error } = await supabase
      .from('message_reads')
      .upsert({
        message_id: messageId,
        user_id: user.id,
        read_at: new Date().toISOString(),
      }, {
        onConflict: 'message_id,user_id',
      });

    if (error) throw error;

    // Update participant's last_read_at
    await supabase
      .from('conversation_participants')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', message.conversation_id)
      .eq('user_id', user.id);
  },

  /**
   * Mark all messages in conversation as read
   */
  async markConversationAsRead(conversationId: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Get all unread messages
    const { data: participant } = await supabase
      .from('conversation_participants')
      .select('last_read_at')
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id)
      .single();

    if (!participant) return;

    const { data: unreadMessages } = await supabase
      .from('messages')
      .select('id')
      .eq('conversation_id', conversationId)
      .gt('created_at', participant.last_read_at || '1970-01-01');

    if (!unreadMessages || unreadMessages.length === 0) return;

    // Mark all as read
    const readReceipts = unreadMessages.map(msg => ({
      message_id: msg.id,
      user_id: user.id,
      read_at: new Date().toISOString(),
    }));

    // Insert read receipts (use insert instead of upsert to ensure INSERT events fire)
    // First, delete any existing read receipts for these messages from this user
    const messageIds = unreadMessages.map(m => m.id);
    if (messageIds.length > 0) {
      await supabase
        .from('message_reads')
        .delete()
        .in('message_id', messageIds)
        .eq('user_id', user.id);

      // Then insert new read receipts
      if (readReceipts.length > 0) {
        const { error: insertError } = await supabase
          .from('message_reads')
          .insert(readReceipts);

        if (insertError) throw insertError;
      }
    }

    // Update last_read_at
    await supabase
      .from('conversation_participants')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id);
  },

  /**
   * Set typing indicator
   */
  async setTyping(conversationId: string, isTyping: boolean): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    if (isTyping) {
      // Set typing
      await supabase
        .from('typing_indicators')
        .upsert({
          conversation_id: conversationId,
          user_id: user.id,
          is_typing: true,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'conversation_id,user_id',
        });
    } else {
      // Clear typing
      await supabase
        .from('typing_indicators')
        .update({ is_typing: false })
        .eq('conversation_id', conversationId)
        .eq('user_id', user.id);
    }
  },

  /**
   * Get users currently typing
   */
  async getTypingUsers(conversationId: string): Promise<TypingIndicatorWithProfile[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Get typing indicators (only active ones, within last 3 seconds)
    const threeSecondsAgo = new Date(Date.now() - 3000).toISOString();

    const { data: typingIndicators, error } = await supabase
      .from('typing_indicators')
      .select(`
        *,
        user:profiles(*)
      `)
      .eq('conversation_id', conversationId)
      .eq('is_typing', true)
      .gt('updated_at', threeSecondsAgo);

    if (error) throw error;

    return (typingIndicators || []) as TypingIndicatorWithProfile[];
  },

  /**
   * Subscribe to new messages in a conversation
   */
  subscribeToMessages(
    conversationId: string,
    callback: (message: MessageWithStatus) => void
  ): RealtimeChannel {
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const message = await this.getMessageWithStatus(payload.new.id);
          callback(message);
        }
      )
      .subscribe();

    return channel;
  },

  /**
   * Subscribe to typing indicators
   */
  subscribeToTyping(
    conversationId: string,
    callback: (typingUsers: TypingIndicatorWithProfile[]) => void
  ): RealtimeChannel {
    const channel = supabase
      .channel(`typing:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'typing_indicators',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async () => {
          const typingUsers = await this.getTypingUsers(conversationId);
          callback(typingUsers);
        }
      )
      .subscribe();

    return channel;
  },

  /**
   * Subscribe to read receipts
   */
  subscribeToReadReceipts(
    conversationId: string,
    callback: (messageId: string, readCount: number, totalParticipants: number, senderId: string) => void
  ): RealtimeChannel {
    const channel = supabase
      .channel(`reads:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_reads',
        },
        async (payload) => {
          console.log('Read receipt INSERT event:', payload.new);
          
          // Get message to check if it's in this conversation
          const { data: message, error: messageError } = await supabase
            .from('messages')
            .select('conversation_id, sender_id')
            .eq('id', payload.new.message_id)
            .single();

          if (messageError || !message) {
            console.log('Message not found for read receipt:', messageError);
            return;
          }

          console.log('Message found:', { conversationId: message.conversation_id, senderId: message.sender_id, targetConversationId: conversationId });

          // Check if message is in this conversation
          if (message.conversation_id !== conversationId) {
            console.log('Message not in this conversation, skipping');
            return;
          }

          // Small delay to ensure the read receipt is fully committed to database
          await new Promise(resolve => setTimeout(resolve, 200));

          // Get total participants count
          const { count: participantCount } = await supabase
            .from('conversation_participants')
            .select('*', { count: 'exact', head: true })
            .eq('conversation_id', conversationId);

          // Get read count excluding sender
          const { count: readCount, error: countError } = await supabase
            .from('message_reads')
            .select('*', { count: 'exact', head: true })
            .eq('message_id', payload.new.message_id)
            .neq('user_id', message.sender_id); // Exclude sender

          if (countError) {
            console.error('Error getting read count:', countError);
          }

          console.log('Calling callback with:', { 
            messageId: payload.new.message_id, 
            readCount: readCount || 0, 
            participantCount: participantCount || 0,
            senderId: message.sender_id,
            readerId: payload.new.user_id
          });

          // Always call callback - let the UI component decide if it should process it
          callback(
            payload.new.message_id, 
            readCount || 0, 
            participantCount || 0,
            message.sender_id
          );
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'message_reads',
        },
        async (payload) => {
          // Also handle updates (in case read_at is updated)
          const { data: message } = await supabase
            .from('messages')
            .select('conversation_id, sender_id')
            .eq('id', payload.new.message_id)
            .single();

          if (message?.conversation_id === conversationId) {
            const { count: participantCount } = await supabase
              .from('conversation_participants')
              .select('*', { count: 'exact', head: true })
              .eq('conversation_id', conversationId);

            const { count: readCount } = await supabase
              .from('message_reads')
              .select('*', { count: 'exact', head: true })
              .eq('message_id', payload.new.message_id)
              .neq('user_id', message.sender_id);

            callback(
              payload.new.message_id, 
              readCount || 0, 
              participantCount || 0,
              message.sender_id
            );
          }
        }
      )
      .subscribe();

    return channel;
  },

  /**
   * Unsubscribe from channel
   */
  unsubscribe(channel: RealtimeChannel): void {
    supabase.removeChannel(channel);
  },

  /**
   * Delete message for everyone (only sender can do this)
   */
  async deleteMessageForEveryone(messageId: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Get message to verify sender
    const { data: message, error: msgError } = await supabase
      .from('messages')
      .select('sender_id, is_deleted')
      .eq('id', messageId)
      .single();

    if (msgError) throw msgError;
    if (!message) throw new Error('Message not found');
    if (message.sender_id !== user.id) {
      throw new Error('Only the sender can delete messages for everyone');
    }
    if (message.is_deleted) {
      throw new Error('Message already deleted');
    }

    // Mark message as deleted
    const { error } = await supabase
      .from('messages')
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        text: 'This message was deleted',
      })
      .eq('id', messageId);

    if (error) throw error;
  },

  /**
   * Delete message for me (hide from current user)
   */
  async deleteMessageForMe(messageId: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Check if message exists and user is participant
    const { data: message, error: msgError } = await supabase
      .from('messages')
      .select('conversation_id')
      .eq('id', messageId)
      .single();

    if (msgError) throw msgError;
    if (!message) throw new Error('Message not found');

    // Verify user is participant
    const { data: participant } = await supabase
      .from('conversation_participants')
      .select('id')
      .eq('conversation_id', message.conversation_id)
      .eq('user_id', user.id)
      .single();

    if (!participant) {
      throw new Error('You are not a participant in this conversation');
    }

    // Add deletion record (or update if exists)
    const { error } = await supabase
      .from('message_deletions')
      .upsert({
        message_id: messageId,
        user_id: user.id,
        deleted_at: new Date().toISOString(),
      }, {
        onConflict: 'message_id,user_id',
      });

    if (error) throw error;
  },

  /**
   * Helper: Get unread message count
   */
  async getUnreadCount(conversationId: string, lastReadAt: string): Promise<number> {
    const { count } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('conversation_id', conversationId)
      .eq('is_deleted', false)
      .gt('created_at', lastReadAt);

    return count || 0;
  },

  /**
   * Helper: Get total message count
   */
  async getMessageCount(conversationId: string): Promise<number> {
    const { count } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('conversation_id', conversationId)
      .eq('is_deleted', false);

    return count || 0;
  },
};

