import { useAppSelector } from "../store";

export const useExpenses = () => {
  const expenses = useAppSelector(state => state.expenses);
  
  return {
    expenses: expenses.expenses,
    selectedExpense: expenses.selectedExpense,
    categories: expenses.categories,
    settlements: expenses.settlements,
    filters: expenses.filters,
    loading: expenses.loading,
    error: expenses.error,
  };
};