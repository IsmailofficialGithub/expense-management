import { useAppSelector } from '../store';
import { Profile } from '../types/database.types';

interface UseAuth {
  user: any | null;
  profile: Profile | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null; // Assuming error is a string or null
  initialized: boolean;
  isPasswordReset: boolean;
}

export const useAuth = (): UseAuth => {
  const auth = useAppSelector(state => state.auth);

  return {
    user: auth.user,
    profile: auth.profile,
    isAuthenticated: auth.isAuthenticated,
    loading: auth.loading,
    error: auth.error,
    initialized: auth.initialized,
    isPasswordReset: auth.isPasswordReset,
  };
};
