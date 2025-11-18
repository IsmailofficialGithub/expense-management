// src/hooks/useHotels.ts
import { useSelector } from 'react-redux';
import { RootState } from '../store';

export const useHotels = () => {
  return useSelector((state: RootState) => state.hotels);
};