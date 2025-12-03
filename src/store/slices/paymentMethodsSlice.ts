// src/store/slices/paymentMethodsSlice.ts
import { createSlice, createAsyncThunk, PayloadAction, createAction } from '@reduxjs/toolkit';
import { paymentMethodService } from '../../services/supabase.service';
import {
  UserPaymentMethod,
  CreatePaymentMethodRequest,
} from '../../types/database.types';
import { storageService } from '../../services/storage.service';
import { syncService } from '../../services/sync.service';

interface PaymentMethodsState {
  paymentMethods: UserPaymentMethod[];
  defaultMethod: UserPaymentMethod | null;
  loading: boolean;
  error: string | null;
}

const initialState: PaymentMethodsState = {
  paymentMethods: [],
  defaultMethod: null,
  loading: false,
  error: null,
};

// Async thunks
export const fetchPaymentMethods = createAsyncThunk(
  'paymentMethods/fetchPaymentMethods',
  async (userId: string, { getState }) => {
    const state = getState() as any;
    const isOnline = state.ui.isOnline;
    
    if (isOnline) {
      try {
        const methods = await paymentMethodService.getPaymentMethods(userId);
        await storageService.setPaymentMethods(methods);
        return methods;
      } catch (error: any) {
        console.warn('Online fetch payment methods failed, trying offline:', error);
      }
    }
    
    // Offline: load from local storage
    const cachedMethods = await storageService.getPaymentMethods();
    if (cachedMethods) {
      return cachedMethods;
    }
    
    return [];
  }
);

export const fetchDefaultPaymentMethod = createAsyncThunk(
  'paymentMethods/fetchDefaultPaymentMethod',
  async (userId: string) => {
    return await paymentMethodService.getDefaultPaymentMethod(userId);
  }
);

export const createPaymentMethod = createAsyncThunk(
  'paymentMethods/createPaymentMethod',
  async (request: CreatePaymentMethodRequest, { getState }) => {
    const state = getState() as any;
    const isOnline = state.ui.isOnline;
    
    if (isOnline) {
      try {
        const method = await paymentMethodService.createPaymentMethod(request);
        const currentMethods = await storageService.getPaymentMethods() || [];
        await storageService.setPaymentMethods([method, ...currentMethods]);
        return method;
      } catch (error: any) {
        console.warn('Online create payment method failed, queueing for sync:', error);
      }
    }
    
    // Offline or online failed: create temporary method and queue for sync
    const tempMethod: UserPaymentMethod = {
      id: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      user_id: '',
      ...request,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    
    await syncService.addToQueue('create', 'payment_method', request);
    const currentMethods = await storageService.getPaymentMethods() || [];
    await storageService.setPaymentMethods([tempMethod, ...currentMethods]);
    
    return tempMethod;
  }
);

export const updatePaymentMethod = createAsyncThunk(
  'paymentMethods/updatePaymentMethod',
  async ({ methodId, updates }: { methodId: string; updates: Partial<CreatePaymentMethodRequest> }, { getState }) => {
    const state = getState() as any;
    const isOnline = state.ui.isOnline;
    
    if (isOnline) {
      try {
        const method = await paymentMethodService.updatePaymentMethod(methodId, updates);
        const currentMethods = await storageService.getPaymentMethods() || [];
        const updatedMethods = currentMethods.map((m: any) => 
          m.id === methodId ? method : m
        );
        await storageService.setPaymentMethods(updatedMethods);
        return method;
      } catch (error: any) {
        console.warn('Online update payment method failed, queueing for sync:', error);
      }
    }
    
    // Offline or online failed: update local storage and queue for sync
    const currentMethods = await storageService.getPaymentMethods() || [];
    const methodToUpdate = currentMethods.find((m: any) => m.id === methodId);
    
    if (methodToUpdate) {
      const updatedMethod = { ...methodToUpdate, ...updates, updated_at: new Date().toISOString() };
      await syncService.addToQueue('update', 'payment_method', { id: methodId, updates });
      const updatedMethods = currentMethods.map((m: any) => 
        m.id === methodId ? updatedMethod : m
      );
      await storageService.setPaymentMethods(updatedMethods);
      return updatedMethod;
    }
    
    throw new Error('Payment method not found');
  }
);

export const setDefaultPaymentMethod = createAsyncThunk(
  'paymentMethods/setDefaultPaymentMethod',
  async (methodId: string) => {
    return await paymentMethodService.setDefaultPaymentMethod(methodId);
  }
);

// Cache setter action - load data directly from cache without API calls
export const setPaymentMethodsFromCache = createAction<UserPaymentMethod[]>('paymentMethods/setFromCache');

export const deletePaymentMethod = createAsyncThunk(
  'paymentMethods/deletePaymentMethod',
  async (methodId: string, { getState }) => {
    const state = getState() as any;
    const isOnline = state.ui.isOnline;
    
    if (isOnline) {
      try {
        await paymentMethodService.deletePaymentMethod(methodId);
        const currentMethods = await storageService.getPaymentMethods() || [];
        await storageService.setPaymentMethods(currentMethods.filter((m: any) => m.id !== methodId));
        return methodId;
      } catch (error: any) {
        console.warn('Online delete payment method failed, queueing for sync:', error);
      }
    }
    
    // Offline or online failed: remove from local storage and queue for sync
    const currentMethods = await storageService.getPaymentMethods() || [];
    await syncService.addToQueue('delete', 'payment_method', { id: methodId });
    await storageService.setPaymentMethods(currentMethods.filter((m: any) => m.id !== methodId));
    
    return methodId;
  }
);

const paymentMethodsSlice = createSlice({
  name: 'paymentMethods',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    clearPaymentMethods: (state) => {
      state.paymentMethods = [];
      state.defaultMethod = null;
    },
  },
  extraReducers: (builder) => {
    // Fetch payment methods
    builder.addCase(fetchPaymentMethods.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(fetchPaymentMethods.fulfilled, (state, action) => {
      state.loading = false;
      state.paymentMethods = action.payload;
      
      // Set default method
      const defaultMethod = action.payload.find(m => m.is_default);
      if (defaultMethod) {
        state.defaultMethod = defaultMethod;
      }
    });
    builder.addCase(fetchPaymentMethods.rejected, (state, action) => {
      state.loading = false;
      state.error = action.error.message || 'Failed to fetch payment methods';
    });

    // Fetch default payment method
    builder.addCase(fetchDefaultPaymentMethod.fulfilled, (state, action) => {
      state.defaultMethod = action.payload;
    });

    // Create payment method
    builder.addCase(createPaymentMethod.fulfilled, (state, action) => {
      state.paymentMethods.unshift(action.payload);
      
      // If this is marked as default, update defaultMethod
      if (action.payload.is_default) {
        state.defaultMethod = action.payload;
        
        // Unset other defaults
        state.paymentMethods.forEach(method => {
          if (method.id !== action.payload.id && method.is_default) {
            method.is_default = false;
          }
        });
      }
    });

    // Update payment method
    builder.addCase(updatePaymentMethod.fulfilled, (state, action) => {
      const index = state.paymentMethods.findIndex(m => m.id === action.payload.id);
      if (index !== -1) {
        state.paymentMethods[index] = action.payload;
      }

      // Update default if changed
      if (action.payload.is_default) {
        state.defaultMethod = action.payload;
      }
    });

    // Set default payment method
    builder.addCase(setDefaultPaymentMethod.fulfilled, (state, action) => {
      // Update the method
      const index = state.paymentMethods.findIndex(m => m.id === action.payload.id);
      if (index !== -1) {
        state.paymentMethods[index] = action.payload;
      }

      // Unset other defaults
      state.paymentMethods.forEach(method => {
        if (method.id !== action.payload.id) {
          method.is_default = false;
        }
      });

      state.defaultMethod = action.payload;
    });

    // Delete payment method
    builder.addCase(deletePaymentMethod.fulfilled, (state, action) => {
      state.paymentMethods = state.paymentMethods.filter(m => m.id !== action.payload);
      
      // Clear default if deleted
      if (state.defaultMethod?.id === action.payload) {
        state.defaultMethod = null;
      }
    });
    // Cache setter action
    builder.addCase(setPaymentMethodsFromCache, (state, action) => {
      state.paymentMethods = action.payload;
      state.loading = false;
      
      // Set default method
      const defaultMethod = action.payload.find(m => m.is_default);
      if (defaultMethod) {
        state.defaultMethod = defaultMethod;
      }
    });
  },
});

export const { clearError, clearPaymentMethods } = paymentMethodsSlice.actions;
export default paymentMethodsSlice.reducer;