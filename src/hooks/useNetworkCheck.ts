// src/hooks/useNetworkCheck.ts
import { useEffect, useState } from 'react';
import { useUI } from './useUI';
import { useToast } from './useToast';
import { syncService } from '../services/sync.service';

interface UseNetworkCheckOptions {
  showToast?: boolean;
  onOnline?: () => void;
  onOffline?: () => void;
  autoSync?: boolean; // Automatically sync when connection is restored
}

export const useNetworkCheck = (options: UseNetworkCheckOptions = {}) => {
  const { isOnline } = useUI();
  const { showToast } = useToast();
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    if (!isOnline && !wasOffline) {
      // Just went offline
      setWasOffline(true);
      if (options.showToast) {
        showToast('No internet connection', 'error');
      }
      options.onOffline?.();
    } else if (isOnline && wasOffline) {
      // Just came back online
      setWasOffline(false);
      if (options.showToast) {
        showToast('Connection restored', 'success');
      }
      
      // Trigger sync if enabled
      if (options.autoSync !== false) {
        // Small delay to ensure connection is stable
        setTimeout(async () => {
          try {
            const queue = await syncService.getSyncQueue();
            if (queue.length > 0) {
              await syncService.fullSync();
            }
          } catch (error) {
            console.error('Auto-sync failed:', error);
          }
        }, 1000);
      }
      
      options.onOnline?.();
    }
  }, [isOnline, options.autoSync]);

  return { isOnline, wasOffline };
};