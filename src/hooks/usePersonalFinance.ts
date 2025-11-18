import { useAppSelector } from '../store';

export const usePersonalFinance = () => {
  const personalFinance = useAppSelector(state => state.personalFinance);
  
  return {
    transactions: personalFinance.transactions,
    categories: personalFinance.categories,
    completeBalance: personalFinance.completeBalance,
    loading: personalFinance.loading,
    error: personalFinance.error,
  };
};