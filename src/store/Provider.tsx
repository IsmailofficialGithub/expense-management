import React, { useEffect } from 'react';
import { Provider } from 'react-redux';
import { store } from './index';
import { initializeAuth, setUser } from './slices/authSlice';
import { supabase } from '../services/supabase';

interface ReduxProviderProps {
  children: React.ReactNode;
}

export const ReduxProvider: React.FC<ReduxProviderProps> = ({ children }) => {
  useEffect(() => {
    store.dispatch(initializeAuth());

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          const { profileService } = await import('../services/supabase.service');
          const profile = await profileService.getProfile(session.user.id);
          store.dispatch(setUser({ user: session.user, profile }));
        } else {
          store.dispatch(setUser({ user: null, profile: null }));
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return <Provider store={store}>{children}</Provider>;
};