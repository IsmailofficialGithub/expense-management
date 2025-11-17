import { useAppSelector } from "../store";

export const useGroups = () => {
  const groups = useAppSelector(state => state.groups);
  
  return {
    groups: groups.groups,
    selectedGroup: groups.selectedGroup,
    balances: groups.balances,
    loading: groups.loading,
    error: groups.error,
  };
};