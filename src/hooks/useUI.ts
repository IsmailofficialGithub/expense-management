import { useAppSelector } from "../store";

export const useUI = () => {
  const ui = useAppSelector(state => state.ui);
  
  return {
    theme: ui.theme,
    toasts: ui.toasts,
    isOnline: ui.isOnline,
    refreshing: ui.refreshing,
    modalOpen: ui.modalOpen,
  };
};