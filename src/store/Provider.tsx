// src/store/Provider.tsx
import React, { useEffect } from 'react';
import { Provider } from 'react-redux';
import { Platform } from 'react-native';
import { store } from './index';
import { initializeAuth, setUser, setProfileFromCache } from './slices/authSlice';
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
    console.log('🟣 [PROVIDER] Redux Provider mounted, starting initialization...');
    console.log('🟣 [PROVIDER] Timestamp:', new Date().toISOString());
    
    // Initialize auth state
    console.log('🟣 [PROVIDER] Dispatching initializeAuth...');
    store.dispatch(initializeAuth());

    // Load cached data on startup - load immediately into Redux
    const loadCachedData = async () => {
      try {
        console.log('🟣 [PROVIDER] Starting to load cached data...');
        
        // Load expenses and set directly in Redux (no API call)
        const cachedProfile = await storageService.getProfile();
        if (cachedProfile) {
          console.log('✅ [PROVIDER] Loaded cached profile:', cachedProfile.full_name);
          store.dispatch(setProfileFromCache(cachedProfile));
        } else {
          console.log('ℹ️ [PROVIDER] No cached profile found');
        }

        const cachedExpenses = await storageService.getExpenses();
        if (cachedExpenses && cachedExpenses.length > 0) {
          console.log('✅ [PROVIDER] Loaded', cachedExpenses.length, 'cached expenses');
          store.dispatch(setExpensesFromCache(cachedExpenses));
        }

        // Load categories
        const cachedCategories = await storageService.getCategories();
        if (cachedCategories && cachedCategories.length > 0) {
          console.log('✅ [PROVIDER] Loaded', cachedCategories.length, 'cached categories');
          store.dispatch(setCategoriesFromCache(cachedCategories));
        }

        // Load settlements
        const cachedSettlements = await storageService.getSettlements();
        if (cachedSettlements && cachedSettlements.length > 0) {
          console.log('✅ [PROVIDER] Loaded', cachedSettlements.length, 'cached settlements');
          store.dispatch(setSettlementsFromCache(cachedSettlements));
        }

        // Load groups
        const cachedGroups = await storageService.getGroups();
        if (cachedGroups && cachedGroups.length > 0) {
          console.log('✅ [PROVIDER] Loaded', cachedGroups.length, 'cached groups');
          store.dispatch(setGroupsFromCache(cachedGroups));
        }

        // Load personal transactions
        const cachedTransactions = await storageService.getPersonalTransactions();
        if (cachedTransactions && cachedTransactions.length > 0) {
          console.log('✅ [PROVIDER] Loaded', cachedTransactions.length, 'cached personal transactions');
          store.dispatch(setTransactionsFromCache(cachedTransactions));
        }

        // Load personal categories
        const cachedPersonalCategories = await storageService.getPersonalCategories();
        if (cachedPersonalCategories && cachedPersonalCategories.length > 0) {
          console.log('✅ [PROVIDER] Loaded', cachedPersonalCategories.length, 'cached personal categories');
          store.dispatch(setPersonalCategoriesFromCache(cachedPersonalCategories));
        }

        // Load complete balance
        const cachedCompleteBalance = await storageService.getCompleteBalance();
        if (cachedCompleteBalance) {
          console.log('✅ [PROVIDER] Loaded cached complete balance');
          store.dispatch(setCompleteBalanceFromCache(cachedCompleteBalance));
        }

        // Load hotels
        const cachedHotels = await storageService.getHotels();
        if (cachedHotels && cachedHotels.length > 0) {
          console.log('✅ [PROVIDER] Loaded', cachedHotels.length, 'cached hotels');
          store.dispatch(setHotelsFromCache(cachedHotels));
        }

        // Load notifications
        const cachedNotifications = await storageService.getNotifications();
        if (cachedNotifications && cachedNotifications.length > 0) {
          console.log('✅ [PROVIDER] Loaded', cachedNotifications.length, 'cached notifications');
          store.dispatch(setNotificationsFromCache(cachedNotifications));
        }

        console.log('✅ [PROVIDER] Finished loading all cached data');

        // After loading cache, sync in background if online (non-blocking)
        const state = store.getState() as any;
        if (state.ui.isOnline) {
          console.log('🟣 [PROVIDER] Online - scheduling background sync in 1s...');
          // Trigger background sync (don't block UI)
          setTimeout(async () => {
            try {
              console.log('🟣 [PROVIDER] Starting background sync...');
              const queue = await syncService.getSyncQueue();
              if (queue.length > 0) {
                console.log('🟣 [PROVIDER] Sync queue has', queue.length, 'items');
                await syncService.fullSync();
              } else {
                console.log('🟣 [PROVIDER] No sync queue, syncing from server...');
                // Even if no queue, sync from server to get latest data
                await syncService.syncFromServer();
              }
              console.log('✅ [PROVIDER] Background sync completed');
            } catch (error) {
              console.error('❌ [PROVIDER] Background sync failed:', error);
            }
          }, 1000);
        } else {
          console.log('⚠️ [PROVIDER] Offline - skipping background sync');
        }
      } catch (error) {
        console.error('❌ [PROVIDER] Error loading cached data:', error);
      }
    };

    loadCachedData();

    // Listen to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state change:', event, session?.user?.id);
        
        if (session?.user) {
          try {
            const { profileService } = await import('../services/supabase.service');
            
            // Fetch profile with timeout to prevent hanging
            const PROFILE_FETCH_TIMEOUT = 2000; // 2 seconds max
            let profile = null;
            
            try {
              const profilePromise = profileService.getProfile(session.user.id);
              const timeoutPromise = new Promise<null>((resolve) => {
                setTimeout(() => {
                  console.warn('[Provider] Profile fetch timeout in onAuthStateChange');
                  resolve(null);
                }, PROFILE_FETCH_TIMEOUT);
              });
              
              profile = await Promise.race([profilePromise, timeoutPromise]);
            } catch (profileError) {
              console.warn('[Provider] Profile fetch failed:', profileError);
            }
            
            // If profile fetch failed, try cache
            if (!profile) {
              try {
                const cachedProfile = await storageService.getProfile();
                if (cachedProfile && cachedProfile.id === session.user.id) {
                  profile = cachedProfile;
                  console.log('[Provider] Using cached profile');
                }
              } catch (cacheError) {
                console.warn('[Provider] Failed to load cached profile:', cacheError);
              }
            }
            
            // Dispatch user with profile (or null if not available)
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
          // Only clear user if this is a SIGNED_OUT event, not just initialization
          if (event === 'SIGNED_OUT') {
            console.log('User signed out, clearing state');
            store.dispatch(setUser({ user: null, profile: null }));
          }
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