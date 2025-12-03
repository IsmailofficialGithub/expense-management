// src/utils/networkAware.ts
import { storageService } from '../services/storage.service';
import { syncService } from '../services/sync.service';

// Helper to check if we're online (this will be set by UI slice)
let isOnlineStatus = true;

export const setOnlineStatus = (status: boolean) => {
  isOnlineStatus = status;
};

export const isOnline = () => isOnlineStatus;

// Network-aware wrapper for service functions
export async function networkAwareCall<T>(
  onlineCall: () => Promise<T>,
  offlineCall: () => Promise<T | null>,
  entityType?: string
): Promise<T> {
  if (isOnlineStatus) {
    try {
      const result = await onlineCall();
      return result;
    } catch (error: any) {
      // If online call fails, try offline fallback
      console.warn('Online call failed, trying offline fallback:', error);
      const offlineResult = await offlineCall();
      if (offlineResult !== null) {
        return offlineResult as T;
      }
      throw error;
    }
  } else {
    // Offline: use local storage
    const offlineResult = await offlineCall();
    if (offlineResult === null) {
      throw new Error('No data available offline');
    }
    return offlineResult as T;
  }
}

// Network-aware wrapper for mutations
export async function networkAwareMutation<T>(
  onlineCall: () => Promise<T>,
  offlineData: any,
  entityType: 'expense' | 'group' | 'transaction' | 'hotel' | 'payment_method' | 'settlement',
  mutationType: 'create' | 'update' | 'delete'
): Promise<T> {
  if (isOnlineStatus) {
    try {
      const result = await onlineCall();
      return result;
    } catch (error: any) {
      // If online mutation fails, queue it for later
      console.warn('Online mutation failed, queueing for sync:', error);
      await syncService.addToQueue(mutationType, entityType, offlineData);
      // Return a temporary result (the data that was queued)
      return offlineData as T;
    }
  } else {
    // Offline: queue the mutation
    await syncService.addToQueue(mutationType, entityType, offlineData);
    // Return the data as if it was successful (optimistic update)
    return offlineData as T;
  }
}


