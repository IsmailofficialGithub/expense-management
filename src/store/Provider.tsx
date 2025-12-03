// src/store/Provider.tsx
import React, { useEffect } from 'react';
import { Provider } from 'react-redux';
import { Platform } from 'react-native';
import { store } from './index';
import { initializeAuth, setUser } from './slices/authSlice';
import { supabase } from '../services/supabase';
import { setOnlineStatus } from './slices/uiSlice';
import { storageService } from '../services/storage.service';
import { syncService } from '../services/sync.service';
import { setExpensesFromCache, setCategoriesFromCache, setSettlementsFromCache } from './slices/expensesSlice';
import { setGroupsFromCache } from './slices/groupsSlice';
import { setTransactionsFromCache, setPersonalCategoriesFromCache, setCompleteBalanceFromCache } from './slices/personalFinanceSlice';
import { setHotelsFromCache } from './slices/hotelsSlice';
import { setPaymentMethodsFromCache } from './slices/paymentMethodsSlice';
import { setNotificationsFromCache } from './slices/notificationsSlice';

interface ReduxProviderProps {
  children: React.ReactNode;
}

export const ReduxProvider: React.FC<ReduxProviderProps> = ({ children }) => {
  useEffect(() => {
    // Initialize auth state
    store.dispatch(initializeAuth());

    // Load cached data on startup - load immediately into Redux
    const loadCachedData = async () => {
      try {
        // Load expenses and set directly in Redux (no API call)
        const cachedExpenses = await storageService.getExpenses();
        if (cachedExpenses && cachedExpenses.length > 0) {
          store.dispatch(setExpensesFromCache(cachedExpenses));
        }

        // Load categories
        const cachedCategories = await storageService.getCategories();
        if (cachedCategories && cachedCategories.length > 0) {
          store.dispatch(setCategoriesFromCache(cachedCategories));
        }

        // Load settlements
        const cachedSettlements = await storageService.getSettlements();
        if (cachedSettlements && cachedSettlements.length > 0) {
          store.dispatch(setSettlementsFromCache(cachedSettlements));
        }

        // Load groups
        const cachedGroups = await storageService.getGroups();
        if (cachedGroups && cachedGroups.length > 0) {
          store.dispatch(setGroupsFromCache(cachedGroups));
        }

        // Load personal transactions
        const cachedTransactions = await storageService.getPersonalTransactions();
        if (cachedTransactions && cachedTransactions.length > 0) {
          store.dispatch(setTransactionsFromCache(cachedTransactions));
        }

        // Load personal categories
        const cachedPersonalCategories = await storageService.getPersonalCategories();
        if (cachedPersonalCategories && cachedPersonalCategories.length > 0) {
          store.dispatch(setPersonalCategoriesFromCache(cachedPersonalCategories));
        }

        // Load complete balance
        const cachedCompleteBalance = await storageService.getCompleteBalance();
        if (cachedCompleteBalance) {
          store.dispatch(setCompleteBalanceFromCache(cachedCompleteBalance));
        }

        // Load hotels
        const cachedHotels = await storageService.getHotels();
        if (cachedHotels && cachedHotels.length > 0) {
          store.dispatch(setHotelsFromCache(cachedHotels));
        }

        // Load notifications
        const cachedNotifications = await storageService.getNotifications();
        if (cachedNotifications && cachedNotifications.length > 0) {
          store.dispatch(setNotificationsFromCache(cachedNotifications));
        }

        // After loading cache, sync in background if online (non-blocking)
        const state = store.getState() as any;
        if (state.ui.isOnline) {
          // Trigger background sync (don't block UI)
          setTimeout(async () => {
            try {
              const queue = await syncService.getSyncQueue();
              if (queue.length > 0) {
                await syncService.fullSync();
              } else {
                // Even if no queue, sync from server to get latest data
                await syncService.syncFromServer();
              }
            } catch (error) {
              console.error('Background sync failed:', error);
            }
          }, 1000);
        }
      } catch (error) {
        console.error('Error loading cached data:', error);
      }
    };

    loadCachedData();

    // Listen to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          try {
            const { profileService } = await import('../services/supabase.service');
            const profile = await profileService.getProfile(session.user.id);
            store.dispatch(setUser({ user: session.user, profile }));
            
            // Load user-specific cached data after login
            const cachedPaymentMethods = await storageService.getPaymentMethods();
            if (cachedPaymentMethods && cachedPaymentMethods.length > 0) {
              store.dispatch(setPaymentMethodsFromCache(cachedPaymentMethods));
            }
          } catch (error) {
            // If profile doesn't exist, still allow login with null profile
            console.warn('Profile not found during auth state change:', error);
            store.dispatch(setUser({ user: session.user, profile: null }));
          }
        } else {
          store.dispatch(setUser({ user: null, profile: null }));
        }
      }
    );

    // Monitor network status and trigger sync when online
    let wasOffline = false;
    let unsubscribeNetwork: (() => void) | null = null;

    if (Platform.OS !== 'web') {
      // Use NetInfo for native platforms
      const NetInfo = require('@react-native-community/netinfo').default;
      unsubscribeNetwork = NetInfo.addEventListener(async (state: any) => {
        const isOnline = state.isConnected ?? false;
        store.dispatch(setOnlineStatus(isOnline));

        // Trigger sync when connection is restored
        if (isOnline && wasOffline) {
          // Small delay to ensure connection is stable
          setTimeout(async () => {
            try {
              const queue = await syncService.getSyncQueue();
              if (queue.length > 0) {
                await syncService.fullSync();
              } else {
                // Even if no queue, sync from server to get latest data
                await syncService.syncFromServer();
              }
            } catch (error) {
              console.error('Auto-sync on connection restore failed:', error);
            }
          }, 1500);
        }

        wasOffline = !isOnline;
      });
    } else {
      // Use browser events for web
      const handleOnline = () => {
        store.dispatch(setOnlineStatus(true));
        if (wasOffline) {
          setTimeout(async () => {
            try {
              const queue = await syncService.getSyncQueue();
              if (queue.length > 0) {
                await syncService.fullSync();
              } else {
                await syncService.syncFromServer();
              }
            } catch (error) {
              console.error('Auto-sync on connection restore failed:', error);
            }
          }, 1500);
        }
        wasOffline = false;
      };

      const handleOffline = () => {
        store.dispatch(setOnlineStatus(false));
        wasOffline = true;
      };

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      // Set initial online status
      store.dispatch(setOnlineStatus(navigator.onLine));

      unsubscribeNetwork = () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }

    return () => {
      subscription.unsubscribe();
      if (unsubscribeNetwork) {
        unsubscribeNetwork();
      }
    };
  }, []);

  return <Provider store={store}>{children}</Provider>;
};