// src/hooks/useSync.ts
import { useEffect, useState, useCallback } from 'react';
import { syncService, SyncStatus } from '../services/sync.service';
import { useUI } from './useUI';

export const useSync = () => {
  const { isOnline } = useUI();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isSyncing: false,
    pendingCount: 0,
    lastSyncTime: null,
    errors: [],
  });

  // Update sync status
  const updateStatus = useCallback(async () => {
    const status = await syncService.getSyncStatus();
    setSyncStatus(status);
  }, []);

  // Subscribe to sync status changes
  useEffect(() => {
    updateStatus();
    const unsubscribe = syncService.subscribe((status) => {
      setSyncStatus(status);
    });
    return unsubscribe;
  }, [updateStatus]);

  // Sync when online
  const sync = useCallback(async () => {
    if (!isOnline) {
      console.log('Cannot sync: offline');
      return;
    }

    try {
      await syncService.fullSync();
      await updateStatus();
    } catch (error) {
      console.error('Sync error:', error);
      await updateStatus();
    }
  }, [isOnline, updateStatus]);

  // Auto-sync when connection is restored
  useEffect(() => {
    if (isOnline && syncStatus.pendingCount > 0) {
      // Small delay to ensure connection is stable
      const timer = setTimeout(() => {
        sync();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isOnline, syncStatus.pendingCount, sync]);

  return {
    sync,
    syncStatus,
    isSyncing: syncStatus.isSyncing,
    pendingCount: syncStatus.pendingCount,
    hasPendingChanges: syncStatus.pendingCount > 0,
    errors: syncStatus.errors,
  };
};


