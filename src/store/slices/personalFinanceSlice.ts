import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { personalFinanceService } from '../../services/supabase.service';
import {
  PersonalTransaction,
  PersonalCategory,
  CreatePersonalTransactionRequest,
  UserCompleteBalance,
} from '../../types/database.types';

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
  async (_, { rejectWithValue }) => {
    try {
      return await personalFinanceService.getTransactions();
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  }
);

export const createPersonalTransaction = createAsyncThunk(
  'personalFinance/createTransaction',
  async (request: CreatePersonalTransactionRequest, { rejectWithValue }) => {
    try {
      return await personalFinanceService.createTransaction(request);
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  }
);

export const updatePersonalTransaction = createAsyncThunk(
  'personalFinance/updateTransaction',
  async (
    { id, updates }: { id: string; updates: Partial<PersonalTransaction> },
    { rejectWithValue }
  ) => {
    try {
      return await personalFinanceService.updateTransaction(id, updates);
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  }
);

export const deletePersonalTransaction = createAsyncThunk(
  'personalFinance/deleteTransaction',
  async (id: string, { rejectWithValue }) => {
    try {
      await personalFinanceService.deleteTransaction(id);
      return id;
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  }
);

export const fetchPersonalCategories = createAsyncThunk(
  'personalFinance/fetchCategories',
  async (_, { rejectWithValue }) => {
    try {
      return await personalFinanceService.getCategories();
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  }
);

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
  },
});

export const { clearError, clearTransactions } = personalFinanceSlice.actions;
export default personalFinanceSlice.reducer;