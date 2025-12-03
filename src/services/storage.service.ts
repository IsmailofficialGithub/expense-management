// src/services/storage.service.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

// Storage keys
const STORAGE_KEYS = {
  EXPENSES: 'expenses',
  EXPENSES_META: 'expenses_meta',
  GROUPS: 'groups',
  GROUPS_META: 'groups_meta',
  PERSONAL_TRANSACTIONS: 'personal_transactions',
  PERSONAL_TRANSACTIONS_META: 'personal_transactions_meta',
  HOTELS: 'hotels',
  HOTELS_META: 'hotels_meta',
  PAYMENT_METHODS: 'payment_methods',
  PAYMENT_METHODS_META: 'payment_methods_meta',
  NOTIFICATIONS: 'notifications',
  NOTIFICATIONS_META: 'notifications_meta',
  CATEGORIES: 'categories',
  CATEGORIES_META: 'categories_meta',
  SETTLEMENTS: 'settlements',
  SETTLEMENTS_META: 'settlements_meta',
  PERSONAL_CATEGORIES: 'personal_categories',
  PERSONAL_CATEGORIES_META: 'personal_categories_meta',
  COMPLETE_BALANCE: 'complete_balance',
  COMPLETE_BALANCE_META: 'complete_balance_meta',
  MESSAGES: 'messages',
  MESSAGES_META: 'messages_meta',
  CONVERSATIONS: 'conversations',
  CONVERSATIONS_META: 'conversations_meta',
  SYNC_QUEUE: 'sync_queue',
} as const;

export interface StorageMetadata {
  lastSync: number;
  version: number;
}

export interface StorageService<T> {
  get(key: string): Promise<T | null>;
  set(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
  getAllKeys(): Promise<string[]>;
}

class LocalStorageService implements StorageService<any> {
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await AsyncStorage.getItem(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error(`Error reading from storage (${key}):`, error);
      return null;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error(`Error writing to storage (${key}):`, error);
      throw error;
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(key);
    } catch (error) {
      console.error(`Error removing from storage (${key}):`, error);
      throw error;
    }
  }

  async clear(): Promise<void> {
    try {
      await AsyncStorage.clear();
    } catch (error) {
      console.error('Error clearing storage:', error);
      throw error;
    }
  }

  async getAllKeys(): Promise<string[]> {
    try {
      return await AsyncStorage.getAllKeys();
    } catch (error) {
      console.error('Error getting all keys:', error);
      return [];
    }
  }
}

const storage = new LocalStorageService();

// Generic data storage functions
export const storageService = {
  // Expenses
  async getExpenses() {
    return storage.get(STORAGE_KEYS.EXPENSES);
  },

  async setExpenses(expenses: any[]) {
    await storage.set(STORAGE_KEYS.EXPENSES, expenses);
    await this.updateExpensesMetadata();
  },

  async getExpensesMetadata(): Promise<StorageMetadata | null> {
    return storage.get<StorageMetadata>(STORAGE_KEYS.EXPENSES_META);
  },

  async updateExpensesMetadata() {
    const meta: StorageMetadata = {
      lastSync: Date.now(),
      version: (await this.getExpensesMetadata())?.version || 0 + 1,
    };
    await storage.set(STORAGE_KEYS.EXPENSES_META, meta);
  },

  // Groups
  async getGroups() {
    return storage.get(STORAGE_KEYS.GROUPS);
  },

  async setGroups(groups: any[]) {
    await storage.set(STORAGE_KEYS.GROUPS, groups);
    await this.updateGroupsMetadata();
  },

  async getGroupsMetadata(): Promise<StorageMetadata | null> {
    return storage.get<StorageMetadata>(STORAGE_KEYS.GROUPS_META);
  },

  async updateGroupsMetadata() {
    const meta: StorageMetadata = {
      lastSync: Date.now(),
      version: ((await this.getGroupsMetadata())?.version || 0) + 1,
    };
    await storage.set(STORAGE_KEYS.GROUPS_META, meta);
  },

  // Personal Transactions
  async getPersonalTransactions() {
    return storage.get(STORAGE_KEYS.PERSONAL_TRANSACTIONS);
  },

  async setPersonalTransactions(transactions: any[]) {
    await storage.set(STORAGE_KEYS.PERSONAL_TRANSACTIONS, transactions);
    await this.updatePersonalTransactionsMetadata();
  },

  async getPersonalTransactionsMetadata(): Promise<StorageMetadata | null> {
    return storage.get<StorageMetadata>(STORAGE_KEYS.PERSONAL_TRANSACTIONS_META);
  },

  async updatePersonalTransactionsMetadata() {
    const meta: StorageMetadata = {
      lastSync: Date.now(),
      version: ((await this.getPersonalTransactionsMetadata())?.version || 0) + 1,
    };
    await storage.set(STORAGE_KEYS.PERSONAL_TRANSACTIONS_META, meta);
  },

  // Hotels
  async getHotels() {
    return storage.get(STORAGE_KEYS.HOTELS);
  },

  async setHotels(hotels: any[]) {
    await storage.set(STORAGE_KEYS.HOTELS, hotels);
    await this.updateHotelsMetadata();
  },

  async getHotelsMetadata(): Promise<StorageMetadata | null> {
    return storage.get<StorageMetadata>(STORAGE_KEYS.HOTELS_META);
  },

  async updateHotelsMetadata() {
    const meta: StorageMetadata = {
      lastSync: Date.now(),
      version: ((await this.getHotelsMetadata())?.version || 0) + 1,
    };
    await storage.set(STORAGE_KEYS.HOTELS_META, meta);
  },

  // Payment Methods
  async getPaymentMethods() {
    return storage.get(STORAGE_KEYS.PAYMENT_METHODS);
  },

  async setPaymentMethods(methods: any[]) {
    await storage.set(STORAGE_KEYS.PAYMENT_METHODS, methods);
    await this.updatePaymentMethodsMetadata();
  },

  async getPaymentMethodsMetadata(): Promise<StorageMetadata | null> {
    return storage.get<StorageMetadata>(STORAGE_KEYS.PAYMENT_METHODS_META);
  },

  async updatePaymentMethodsMetadata() {
    const meta: StorageMetadata = {
      lastSync: Date.now(),
      version: ((await this.getPaymentMethodsMetadata())?.version || 0) + 1,
    };
    await storage.set(STORAGE_KEYS.PAYMENT_METHODS_META, meta);
  },

  // Notifications
  async getNotifications() {
    return storage.get(STORAGE_KEYS.NOTIFICATIONS);
  },

  async setNotifications(notifications: any[]) {
    await storage.set(STORAGE_KEYS.NOTIFICATIONS, notifications);
    await this.updateNotificationsMetadata();
  },

  async getNotificationsMetadata(): Promise<StorageMetadata | null> {
    return storage.get<StorageMetadata>(STORAGE_KEYS.NOTIFICATIONS_META);
  },

  async updateNotificationsMetadata() {
    const meta: StorageMetadata = {
      lastSync: Date.now(),
      version: ((await this.getNotificationsMetadata())?.version || 0) + 1,
    };
    await storage.set(STORAGE_KEYS.NOTIFICATIONS_META, meta);
  },

  // Categories
  async getCategories() {
    return storage.get(STORAGE_KEYS.CATEGORIES);
  },

  async setCategories(categories: any[]) {
    await storage.set(STORAGE_KEYS.CATEGORIES, categories);
    await this.updateCategoriesMetadata();
  },

  async getCategoriesMetadata(): Promise<StorageMetadata | null> {
    return storage.get<StorageMetadata>(STORAGE_KEYS.CATEGORIES_META);
  },

  async updateCategoriesMetadata() {
    const meta: StorageMetadata = {
      lastSync: Date.now(),
      version: ((await this.getCategoriesMetadata())?.version || 0) + 1,
    };
    await storage.set(STORAGE_KEYS.CATEGORIES_META, meta);
  },

  // Settlements
  async getSettlements() {
    return storage.get(STORAGE_KEYS.SETTLEMENTS);
  },

  async setSettlements(settlements: any[]) {
    await storage.set(STORAGE_KEYS.SETTLEMENTS, settlements);
    await this.updateSettlementsMetadata();
  },

  async getSettlementsMetadata(): Promise<StorageMetadata | null> {
    return storage.get<StorageMetadata>(STORAGE_KEYS.SETTLEMENTS_META);
  },

  async updateSettlementsMetadata() {
    const meta: StorageMetadata = {
      lastSync: Date.now(),
      version: ((await this.getSettlementsMetadata())?.version || 0) + 1,
    };
    await storage.set(STORAGE_KEYS.SETTLEMENTS_META, meta);
  },

  // Personal Categories
  async getPersonalCategories() {
    return storage.get(STORAGE_KEYS.PERSONAL_CATEGORIES);
  },

  async setPersonalCategories(categories: any[]) {
    await storage.set(STORAGE_KEYS.PERSONAL_CATEGORIES, categories);
    await this.updatePersonalCategoriesMetadata();
  },

  async getPersonalCategoriesMetadata(): Promise<StorageMetadata | null> {
    return storage.get<StorageMetadata>(STORAGE_KEYS.PERSONAL_CATEGORIES_META);
  },

  async updatePersonalCategoriesMetadata() {
    const meta: StorageMetadata = {
      lastSync: Date.now(),
      version: ((await this.getPersonalCategoriesMetadata())?.version || 0) + 1,
    };
    await storage.set(STORAGE_KEYS.PERSONAL_CATEGORIES_META, meta);
  },

  // Complete Balance
  async getCompleteBalance() {
    return storage.get(STORAGE_KEYS.COMPLETE_BALANCE);
  },

  async setCompleteBalance(balance: any) {
    await storage.set(STORAGE_KEYS.COMPLETE_BALANCE, balance);
    await this.updateCompleteBalanceMetadata();
  },

  async getCompleteBalanceMetadata(): Promise<StorageMetadata | null> {
    return storage.get<StorageMetadata>(STORAGE_KEYS.COMPLETE_BALANCE_META);
  },

  async updateCompleteBalanceMetadata() {
    const meta: StorageMetadata = {
      lastSync: Date.now(),
      version: ((await this.getCompleteBalanceMetadata())?.version || 0) + 1,
    };
    await storage.set(STORAGE_KEYS.COMPLETE_BALANCE_META, meta);
  },

  // Messages
  async getMessages(conversationId?: string) {
    const messages = await storage.get(STORAGE_KEYS.MESSAGES);
    if (!messages) return null;
    if (conversationId) {
      return messages.filter((m: any) => m.conversation_id === conversationId);
    }
    return messages;
  },

  async setMessages(messages: any[], conversationId?: string) {
    if (conversationId) {
      // Update messages for specific conversation
      const allMessages = await this.getMessages() || [];
      const filtered = allMessages.filter((m: any) => m.conversation_id !== conversationId);
      await storage.set(STORAGE_KEYS.MESSAGES, [...filtered, ...messages]);
    } else {
      await storage.set(STORAGE_KEYS.MESSAGES, messages);
    }
    await this.updateMessagesMetadata();
  },

  async getMessagesMetadata(): Promise<StorageMetadata | null> {
    return storage.get<StorageMetadata>(STORAGE_KEYS.MESSAGES_META);
  },

  async updateMessagesMetadata() {
    const meta: StorageMetadata = {
      lastSync: Date.now(),
      version: ((await this.getMessagesMetadata())?.version || 0) + 1,
    };
    await storage.set(STORAGE_KEYS.MESSAGES_META, meta);
  },

  // Conversations
  async getConversations() {
    return storage.get(STORAGE_KEYS.CONVERSATIONS);
  },

  async setConversations(conversations: any[]) {
    await storage.set(STORAGE_KEYS.CONVERSATIONS, conversations);
    await this.updateConversationsMetadata();
  },

  async getConversationsMetadata(): Promise<StorageMetadata | null> {
    return storage.get<StorageMetadata>(STORAGE_KEYS.CONVERSATIONS_META);
  },

  async updateConversationsMetadata() {
    const meta: StorageMetadata = {
      lastSync: Date.now(),
      version: ((await this.getConversationsMetadata())?.version || 0) + 1,
    };
    await storage.set(STORAGE_KEYS.CONVERSATIONS_META, meta);
  },

  // Generic storage access
  storage,
};

export { STORAGE_KEYS };


