// src/services/sync.service.ts
import { storageService, STORAGE_KEYS } from './storage.service';
import { supabase } from './supabase';
import {
  expenseService,
  groupService,
  personalFinanceService,
  hotelService,
  paymentMethodService,
  notificationService,
  categoryService,
  settlementService,
  foodExpenseService,
} from './supabase.service';
import { chatService } from './chat.service';

export type SyncOperationType = 'create' | 'update' | 'delete';
export type SyncEntityType =
  | 'expense'
  | 'group'
  | 'transaction'
  | 'hotel'
  | 'payment_method'
  | 'notification'
  | 'category'
  | 'settlement'
  | 'personal_category'
  | 'message'
  | 'advance_collection'
  | 'bulk_settlement';

export interface SyncOperation {
  id: string;
  type: SyncOperationType;
  entity: SyncEntityType;
  data: any;
  timestamp: number;
  retries: number;
  status: 'pending' | 'syncing' | 'synced' | 'failed';
  error?: string;
}

export interface SyncStatus {
  isSyncing: boolean;
  pendingCount: number;
  lastSyncTime: number | null;
  errors: string[];
}

class SyncService {
  private isSyncing = false;
  private syncListeners: Array<(status: SyncStatus) => void> = [];

  // Get sync queue
  async getSyncQueue(): Promise<SyncOperation[]> {
    const queue = await storageService.storage.get<SyncOperation[]>(STORAGE_KEYS.SYNC_QUEUE);
    return queue || [];
  }

  // Add operation to sync queue
  async addToQueue(
    type: SyncOperationType,
    entity: SyncEntityType,
    data: any
  ): Promise<void> {
    const queue = await this.getSyncQueue();
    const operation: SyncOperation = {
      id: `${entity}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      entity,
      data,
      timestamp: Date.now(),
      retries: 0,
      status: 'pending',
    };
    queue.push(operation);
    await storageService.storage.set(STORAGE_KEYS.SYNC_QUEUE, queue);
    this.notifyListeners();
  }

  // Remove operation from queue
  async removeFromQueue(operationId: string): Promise<void> {
    const queue = await this.getSyncQueue();
    const filtered = queue.filter(op => op.id !== operationId);
    await storageService.storage.set(STORAGE_KEYS.SYNC_QUEUE, filtered);
    this.notifyListeners();
  }

  // Update operation status
  async updateOperationStatus(
    operationId: string,
    status: SyncOperation['status'],
    error?: string
  ): Promise<void> {
    const queue = await this.getSyncQueue();
    const operation = queue.find(op => op.id === operationId);
    if (operation) {
      operation.status = status;
      operation.error = error;
      if (status === 'syncing') {
        operation.retries += 1;
      }
      await storageService.storage.set(STORAGE_KEYS.SYNC_QUEUE, queue);
      this.notifyListeners();
    }
  }

  // Execute a single sync operation
  private async executeOperation(operation: SyncOperation): Promise<boolean> {
    try {
      await this.updateOperationStatus(operation.id, 'syncing');

      let result: any;
      const { type, entity, data } = operation;

      switch (entity) {
        case 'expense':
          if (type === 'create') {
            // Check if it's a food expense (has food_items property)
            if (data.food_items && Array.isArray(data.food_items)) {
              result = await foodExpenseService.createFoodExpense(data);
            } else {
              result = await expenseService.createExpense(data);
            }
          } else if (type === 'update') {
            result = await expenseService.updateExpense(data.id, data.updates);
          } else if (type === 'delete') {
            await expenseService.deleteExpense(data.id);
          }
          break;

        case 'group':
          if (type === 'create') {
            result = await groupService.createGroup(data);
          } else if (type === 'update') {
            result = await groupService.updateGroup(data.id, data.updates);
          } else if (type === 'delete') {
            await groupService.deleteGroup(data.id);
          }
          break;

        case 'transaction':
          if (type === 'create') {
            result = await personalFinanceService.createTransaction(data);
          } else if (type === 'update') {
            result = await personalFinanceService.updateTransaction(data.id, data.updates);
          } else if (type === 'delete') {
            await personalFinanceService.deleteTransaction(data.id);
          }
          break;

        case 'hotel':
          if (type === 'create') {
            result = await hotelService.createHotel(data);
          } else if (type === 'update') {
            // Hotel update logic if needed
          } else if (type === 'delete') {
            // Hotel delete logic if needed
          }
          break;

        case 'payment_method':
          if (type === 'create') {
            result = await paymentMethodService.createPaymentMethod(data);
          } else if (type === 'update') {
            result = await paymentMethodService.updatePaymentMethod(data.id, data.updates);
          } else if (type === 'delete') {
            await paymentMethodService.deletePaymentMethod(data.id);
          }
          break;

        case 'settlement':
          if (type === 'create') {
            result = await settlementService.settleUp(data);
          }
          break;

        case 'message':
          if (type === 'create') {
            result = await chatService.sendMessage(data);
            // Update local storage: replace temporary message with real one
            if (result && result.id && !result.id.startsWith('temp-')) {
              const { storageService } = await import('./storage.service');
              const existingMessages = await storageService.getMessages(data.conversation_id) || [];
              // Find and replace temporary messages with the same text and sender
              const updatedMessages = existingMessages.map((msg: any) => {
                if (
                  msg.id.startsWith('temp-') &&
                  msg.text === data.text &&
                  msg.sender_id === result.sender_id &&
                  msg.conversation_id === data.conversation_id
                ) {
                  return result;
                }
                return msg;
              });
              await storageService.setMessages(updatedMessages, data.conversation_id);
            }
          }
          break;

        case 'notification':
          if (type === 'update') {
            // Mark notification as read
            await notificationService.markAsRead(data.id);
          } else if (type === 'delete') {
            await notificationService.deleteNotification(data.id);
          }
          break;

        case 'advance_collection':
          if (type === 'create') {
            const { bulkPaymentService } = await import('./supabase.service');
            await bulkPaymentService.createAdvanceCollection(data);
          } else if (type === 'update') {
            const { bulkPaymentService } = await import('./supabase.service');
            await bulkPaymentService.contributeToCollection(data.contributionId, data.notes);
          }
          break;

        case 'bulk_settlement':
          if (type === 'create') {
            const { bulkPaymentService } = await import('./supabase.service');
            await bulkPaymentService.createBulkSettlement(data);
          }
          break;

        default:
          console.warn(`Unknown entity type: ${entity}`);
          return false;
      }

      await this.updateOperationStatus(operation.id, 'synced');
      return true;
    } catch (error: any) {
      const errorMessage = error.message || 'Unknown error';
      await this.updateOperationStatus(operation.id, 'failed', errorMessage);

      // If retries exceeded, mark as permanently failed
      if (operation.retries >= 3) {
        console.error(`Operation ${operation.id} failed after ${operation.retries} retries`);
      }

      return false;
    }
  }

  // Process sync queue
  async processQueue(): Promise<{ success: number; failed: number }> {
    if (this.isSyncing) {
      console.log('Sync already in progress');
      return { success: 0, failed: 0 };
    }

    this.isSyncing = true;
    this.notifyListeners();

    try {
      const queue = await this.getSyncQueue();
      const pendingOps = queue.filter(op => op.status === 'pending' || op.status === 'failed');

      if (pendingOps.length === 0) {
        this.isSyncing = false;
        this.notifyListeners();
        return { success: 0, failed: 0 };
      }

      let successCount = 0;
      let failedCount = 0;

      // Process operations sequentially to avoid conflicts
      for (const operation of pendingOps) {
        // Skip operations that have failed too many times
        if (operation.retries >= 3) {
          failedCount++;
          continue;
        }

        const success = await this.executeOperation(operation);
        if (success) {
          successCount++;
          // Remove successfully synced operations
          await this.removeFromQueue(operation.id);
        } else {
          failedCount++;
        }
      }

      return { success: successCount, failed: failedCount };
    } finally {
      this.isSyncing = false;
      this.notifyListeners();
    }
  }

  // Sync all data from server (pull latest)
  async syncFromServer(): Promise<void> {
    try {
      // Sync expenses
      const expenses = await expenseService.getExpenses();
      if (expenses) {
        await storageService.setExpenses(expenses);
      }

      // Sync groups
      const groups = await groupService.getGroups();
      if (groups) {
        await storageService.setGroups(groups);
      }

      // Sync personal transactions
      const transactions = await personalFinanceService.getTransactions();
      if (transactions) {
        await storageService.setPersonalTransactions(transactions);
      }

      // Sync hotels
      const hotels = await hotelService.getHotels();
      if (hotels) {
        await storageService.setHotels(hotels);
      }

      // Sync payment methods
      const user = await supabase.auth.getUser();
      if (user.data.user) {
        const paymentMethods = await paymentMethodService.getPaymentMethods(user.data.user.id);
        if (paymentMethods) {
          await storageService.setPaymentMethods(paymentMethods);
        }
      }

      // Sync notifications
      const notifications = await notificationService.getNotifications();
      if (notifications) {
        await storageService.setNotifications(notifications);
      }

      // Sync categories
      const categories = await categoryService.getCategories();
      if (categories) {
        await storageService.setCategories(categories);
      }

      // Sync personal categories
      const personalCategories = await personalFinanceService.getCategories();
      if (personalCategories) {
        await storageService.setPersonalCategories(personalCategories);
      }

      // Sync complete balance
      const balance = await personalFinanceService.getCompleteBalance();
      if (balance) {
        await storageService.setCompleteBalance(balance);
      }
    } catch (error) {
      console.error('Error syncing from server:', error);
      throw error;
    }
  }

  // Full sync: pull from server, then push local changes
  async fullSync(): Promise<{ success: number; failed: number }> {
    try {
      // First, pull latest data from server
      await this.syncFromServer();

      // Then, push local changes
      return await this.processQueue();
    } catch (error) {
      console.error('Error during full sync:', error);
      throw error;
    }
  }

  // Get sync status
  async getSyncStatus(): Promise<SyncStatus> {
    const queue = await this.getSyncQueue();
    const pending = queue.filter(op => op.status === 'pending' || op.status === 'failed');
    const errors = queue
      .filter(op => op.status === 'failed' && op.error)
      .map(op => op.error!)
      .slice(0, 5); // Limit to last 5 errors

    return {
      isSyncing: this.isSyncing,
      pendingCount: pending.length,
      lastSyncTime: null, // Could track this separately
      errors,
    };
  }

  // Subscribe to sync status changes
  subscribe(listener: (status: SyncStatus) => void): () => void {
    this.syncListeners.push(listener);
    return () => {
      this.syncListeners = this.syncListeners.filter(l => l !== listener);
    };
  }

  private async notifyListeners() {
    const status = await this.getSyncStatus();
    this.syncListeners.forEach(listener => listener(status));
  }

  // Clear sync queue
  async clearQueue(): Promise<void> {
    await storageService.storage.set(STORAGE_KEYS.SYNC_QUEUE, []);
    this.notifyListeners();
  }
}

export const syncService = new SyncService();


