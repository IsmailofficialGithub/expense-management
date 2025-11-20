// src/store/Provider.tsx
import React, { useEffect } from 'react';
import { Provider } from 'react-redux';
import { store } from './index';
import { initializeAuth, setUser } from './slices/authSlice';
import { supabase } from '../services/supabase';
import { setOnlineStatus } from './slices/uiSlice';
import NetInfo from '@react-native-community/netinfo';

interface ReduxProviderProps {
  children: React.ReactNode;
}

export const ReduxProvider: React.FC<ReduxProviderProps> = ({ children }) => {
  useEffect(() => {
    // Initialize auth state
    store.dispatch(initializeAuth());

    // Listen to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          try {
            const { profileService } = await import('../services/supabase.service');
            const profile = await profileService.getProfile(session.user.id);
            store.dispatch(setUser({ user: session.user, profile }));
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

    // Monitor network status
    const unsubscribeNetwork = NetInfo.addEventListener((state) => {
      store.dispatch(setOnlineStatus(state.isConnected ?? false));
    });

    return () => {
      subscription.unsubscribe();
      unsubscribeNetwork();
    };
  }, []);

  return <Provider store={store}>{children}</Provider>;
};