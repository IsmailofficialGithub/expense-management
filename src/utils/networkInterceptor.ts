// src/utils/networkInterceptor.ts
import { ErrorHandler } from './errorHandler';
import NetInfo from '@react-native-community/netinfo';

let isOnline = true;

// Monitor network status
export const initNetworkMonitoring = (
  onOnline: () => void,
  onOffline: () => void
) => {
  return NetInfo.addEventListener((state) => {
    const wasOnline = isOnline;
    isOnline = state.isConnected ?? false;

    if (!wasOnline && isOnline) {
      onOnline();
    } else if (wasOnline && !isOnline) {
      onOffline();
    }
  });
};

export const isNetworkAvailable = () => isOnline;

// Wrapper for API calls with error handling
export const safeApiCall = async <T>(
  apiCall: () => Promise<T>,
  showToast: (message: string, type: 'error') => void,
  context?: string
): Promise<T | null> => {
  try {
    if (!isOnline) {
      throw new Error('No internet connection');
    }

    return await apiCall();
  } catch (error) {
    ErrorHandler.handleError(error, showToast, context);
    return null;
  }
};