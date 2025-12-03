import { createSlice, createAsyncThunk, PayloadAction, createAction } from '@reduxjs/toolkit';
import { personalFinanceService } from '../../services/supabase.service';
import {
  PersonalTransaction,
  PersonalCategory,
  CreatePersonalTransactionRequest,
  UserCompleteBalance,
} from '../../types/database.types';
import { storageService } from '../../services/storage.service';
import { syncService } from '../../services/sync.service';

interface PersonalFinanceState {
  transactions: PersonalTransaction[];
  categories: PersonalCategory[];
  completeBalance: UserCompleteBalance | null;
  loading: boolean;
  error: string | null;
}

const initialState: PersonalFinanceState = {
  transactions: [],
  categories: [],
  completeBalance: null,
  loading: false,
  error: null,
};

// Async Thunks
export const fetchPersonalTransactions = createAsyncThunk(
  'personalFinance/fetchTransactions',
  async (_, { rejectWithValue, getState }) => {
    try {
      const state = getState() as any;
      const isOnline = state.ui.isOnline;
      
      if (isOnline) {
        try {
          const transactions = await personalFinanceService.getTransactions();
          await storageService.setPersonalTransactions(transactions);
          return transactions;
        } catch (error: any) {
          console.warn('Online fetch transactions failed, trying offline:', error);
        }
      }
      
      // Offline: load from local storage
      const cachedTransactions = await storageService.getPersonalTransactions();
      if (cachedTransactions) {
        return cachedTransactions;
      }
      
      throw new Error('No transactions available');
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  }
);

export const createPersonalTransaction = createAsyncThunk(
  'personalFinance/createTransaction',
  async (request: CreatePersonalTransactionRequest, { rejectWithValue, getState }) => {
    try {
      const state = getState() as any;
      const isOnline = state.ui.isOnline;
      
      if (isOnline) {
        try {
          const transaction = await personalFinanceService.createTransaction(request);
          // Save to local storage
          const currentTransactions = await storageService.getPersonalTransactions() || [];
          await storageService.setPersonalTransactions([transaction, ...currentTransactions]);
          return transaction;
        } catch (error: any) {
          console.warn('Online create transaction failed, queueing for sync:', error);
        }
      }
      
      // Offline or online failed: create temporary transaction and queue for sync
      const tempTransaction: PersonalTransaction = {
        id: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        user_id: '',
        ...request,
        date: request.date || new Date().toISOString().split('T')[0],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      
      await syncService.addToQueue('create', 'transaction', request);
      
      // Save to local storage
      const currentTransactions = await storageService.getPersonalTransactions() || [];
      await storageService.setPersonalTransactions([tempTransaction, ...currentTransactions]);
      
      return tempTransaction;
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  }
);

export const updatePersonalTransaction = createAsyncThunk(
  'personalFinance/updateTransaction',
  async (
    { id, updates }: { id: string; updates: Partial<PersonalTransaction> },
    { rejectWithValue, getState }
  ) => {
    try {
      const state = getState() as any;
      const isOnline = state.ui.isOnline;
      
      if (isOnline) {
        try {
          const transaction = await personalFinanceService.updateTransaction(id, updates);
          // Update local storage
          const currentTransactions = await storageService.getPersonalTransactions() || [];
          const updatedTransactions = currentTransactions.map((t: any) => 
            t.id === id ? transaction : t
          );
          await storageService.setPersonalTransactions(updatedTransactions);
          return transaction;
        } catch (error: any) {
          console.warn('Online update transaction failed, queueing for sync:', error);
        }
      }
      
      // Offline or online failed: update local storage and queue for sync
      const currentTransactions = await storageService.getPersonalTransactions() || [];
      const transactionToUpdate = currentTransactions.find((t: any) => t.id === id);
      
      if (transactionToUpdate) {
        const updatedTransaction = { ...transactionToUpdate, ...updates, updated_at: new Date().toISOString() };
        await syncService.addToQueue('update', 'transaction', { id, updates });
        const updatedTransactions = currentTransactions.map((t: any) => 
          t.id === id ? updatedTransaction : t
        );
        await storageService.setPersonalTransactions(updatedTransactions);
        return updatedTransaction;
      }
      
      throw new Error('Transaction not found');
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  }
);

export const deletePersonalTransaction = createAsyncThunk(
  'personalFinance/deleteTransaction',
  async (id: string, { rejectWithValue, getState }) => {
    try {
      const state = getState() as any;
      const isOnline = state.ui.isOnline;
      
      if (isOnline) {
        try {
          await personalFinanceService.deleteTransaction(id);
          // Remove from local storage
          const currentTransactions = await storageService.getPersonalTransactions() || [];
          await storageService.setPersonalTransactions(currentTransactions.filter((t: any) => t.id !== id));
          return id;
        } catch (error: any) {
          console.warn('Online delete transaction failed, queueing for sync:', error);
        }
      }
      
      // Offline or online failed: remove from local storage and queue for sync
      const currentTransactions = await storageService.getPersonalTransactions() || [];
      await syncService.addToQueue('delete', 'transaction', { id });
      await storageService.setPersonalTransactions(currentTransactions.filter((t: any) => t.id !== id));
      
      return id;
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  }
);

export const fetchPersonalCategories = createAsyncThunk(
  'personalFinance/fetchCategories',
  async (_, { rejectWithValue, getState }) => {
    try {
      const state = getState() as any;
      const isOnline = state.ui.isOnline;
      
      if (isOnline) {
        try {
          const categories = await personalFinanceService.getCategories();
          await storageService.setPersonalCategories(categories);
          return categories;
        } catch (error: any) {
          console.warn('Online fetch categories failed, trying offline:', error);
        }
      }
      
      // Offline: load from local storage
      const cachedCategories = await storageService.getPersonalCategories();
      if (cachedCategories) {
        return cachedCategories;
      }
      
      return [];
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  }
);

// Cache setter actions - load data directly from cache without API calls
export const setTransactionsFromCache = createAction<PersonalTransaction[]>('personalFinance/setTransactionsFromCache');
export const setPersonalCategoriesFromCache = createAction<PersonalCategory[]>('personalFinance/setCategoriesFromCache');
export const setCompleteBalanceFromCache = createAction<UserCompleteBalance>('personalFinance/setCompleteBalanceFromCache');

export const fetchCompleteBalance = createAsyncThunk(
  'personalFinance/fetchCompleteBalance',
  async (_, { rejectWithValue }) => {
    try {
      return await personalFinanceService.getCompleteBalance();
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  }
);

const personalFinanceSlice = createSlice({
  name: 'personalFinance',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    clearTransactions: (state) => {
      state.transactions = [];
      state.completeBalance = null;
    },
  },
  extraReducers: (builder) => {
    // Fetch Transactions
    builder.addCase(fetchPersonalTransactions.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(fetchPersonalTransactions.fulfilled, (state, action) => {
      state.loading = false;
      state.transactions = action.payload;
    });
    builder.addCase(fetchPersonalTransactions.rejected, (state, action) => {
      state.loading = false;
      state.error = action.payload as string;
    });

    // Create Transaction
    builder.addCase(createPersonalTransaction.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(createPersonalTransaction.fulfilled, (state, action) => {
      state.loading = false;
      state.transactions.unshift(action.payload);
    });
    builder.addCase(createPersonalTransaction.rejected, (state, action) => {
      state.loading = false;
      state.error = action.payload as string;
    });

    // Update Transaction
    builder.addCase(updatePersonalTransaction.fulfilled, (state, action) => {
      const index = state.transactions.findIndex(t => t.id === action.payload.id);
      if (index !== -1) {
        state.transactions[index] = action.payload;
      }
    });

    // Delete Transaction
    builder.addCase(deletePersonalTransaction.fulfilled, (state, action) => {
      state.transactions = state.transactions.filter(t => t.id !== action.payload);
    });

    // Fetch Categories
    builder.addCase(fetchPersonalCategories.fulfilled, (state, action) => {
      state.categories = action.payload;
    });

    // Fetch Complete Balance
    builder.addCase(fetchCompleteBalance.fulfilled, (state, action) => {
      state.completeBalance = action.payload;
    });
    // Cache setter actions
    builder.addCase(setTransactionsFromCache, (state, action) => {
      state.transactions = action.payload;
      state.loading = false;
    });
    builder.addCase(setPersonalCategoriesFromCache, (state, action) => {
      state.categories = action.payload;
    });
    builder.addCase(setCompleteBalanceFromCache, (state, action) => {
      state.completeBalance = action.payload;
    });
  },
});

export const { clearError, clearTransactions } = personalFinanceSlice.actions;
export default personalFinanceSlice.reducer;