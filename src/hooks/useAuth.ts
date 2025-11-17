import { useAppSelector } from '../store';

export const useAuth = () => {
  const auth = useAppSelector(state => state.auth);
  
  return {
    user: auth.user,
    profile: auth.profile,
    isAuthenticated: auth.isAuthenticated,
    loading: auth.loading,
    error: auth.error,
    initialized: auth.initialized,
  };
};
