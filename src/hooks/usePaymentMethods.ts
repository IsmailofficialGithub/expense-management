// src/hooks/usePaymentMethods.ts
import { useSelector } from 'react-redux';
import { RootState } from '../store';

export const usePaymentMethods = () => {
  return useSelector((state: RootState) => state.paymentMethods);
};