// src/hooks/useNetworkCheck.ts
import { useEffect, useState } from 'react';
import { useUI } from './useUI';
import { useToast } from './useToast';

interface UseNetworkCheckOptions {
  showToast?: boolean;
  onOnline?: () => void;
  onOffline?: () => void;
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
      options.onOnline?.();
    }
  }, [isOnline]);

  return { isOnline, wasOffline };
};