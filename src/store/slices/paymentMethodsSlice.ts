// src/store/slices/paymentMethodsSlice.ts
import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { paymentMethodService } from '../../services/supabase.service';
import {
  UserPaymentMethod,
  CreatePaymentMethodRequest,
} from '../../types/database.types';

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
  async (userId: string) => {
    return await paymentMethodService.getPaymentMethods(userId);
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
  async (request: CreatePaymentMethodRequest) => {
    return await paymentMethodService.createPaymentMethod(request);
  }
);

export const updatePaymentMethod = createAsyncThunk(
  'paymentMethods/updatePaymentMethod',
  async ({ methodId, updates }: { methodId: string; updates: Partial<CreatePaymentMethodRequest> }) => {
    return await paymentMethodService.updatePaymentMethod(methodId, updates);
  }
);

export const setDefaultPaymentMethod = createAsyncThunk(
  'paymentMethods/setDefaultPaymentMethod',
  async (methodId: string) => {
    return await paymentMethodService.setDefaultPaymentMethod(methodId);
  }
);

export const deletePaymentMethod = createAsyncThunk(
  'paymentMethods/deletePaymentMethod',
  async (methodId: string) => {
    await paymentMethodService.deletePaymentMethod(methodId);
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
  },
});

export const { clearError, clearPaymentMethods } = paymentMethodsSlice.actions;
export default paymentMethodsSlice.reducer;