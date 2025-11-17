import { useAppDispatch } from '../store';
import { showToast as showToastAction, hideToast } from '../store/slices/uiSlice';
import { useCallback } from 'react';
import { useUI } from './useUI';

export const useToast = () => {
  const dispatch = useAppDispatch();
  const { toasts } = useUI();

  const showToast = useCallback(
    (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info', duration = 3000) => {
      dispatch(showToastAction({ message, type, duration }));
    },
    [dispatch]
  );

  const hideToastById = useCallback(
    (id: string) => {
      dispatch(hideToast(id));
    },
    [dispatch]
  );

  return {
    toasts,
    showToast,
    hideToast: hideToastById,
  };
};
