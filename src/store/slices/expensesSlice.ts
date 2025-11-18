import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { expenseService, settlementService, categoryService } from '../../services/supabase.service';
import { Expense, ExpenseWithDetails, ExpenseCategory, Settlement, CreateExpenseRequest, SettleUpRequest, ExpenseFilters } from '../../types/database.types';

interface ExpensesState {
  expenses: ExpenseWithDetails[];
  selectedExpense: ExpenseWithDetails | null;
  categories: ExpenseCategory[];
  settlements: Settlement[];
  filters: ExpenseFilters;
  loading: boolean;
  error: string | null;
}

const initialState: ExpensesState = {
  expenses: [],
  selectedExpense: null,
  categories: [],
  settlements: [],
  filters: {},
  loading: false,
  error: null,
};

export const fetchExpenses = createAsyncThunk('expenses/fetchExpenses', async (filters: ExpenseFilters | undefined, { rejectWithValue }) => {
  try {
    return await expenseService.getExpenses(filters);
  } catch (error: any) {
    return rejectWithValue(error.message);
  }
});

export const fetchExpense = createAsyncThunk('expenses/fetchExpense', async (expenseId: string, { rejectWithValue }) => {
  try {
    return await expenseService.getExpense(expenseId);
  } catch (error: any) {
    return rejectWithValue(error.message);
  }
});

export const createExpense = createAsyncThunk('expenses/createExpense', async (request: CreateExpenseRequest, { rejectWithValue }) => {
  try {
    const expense = await expenseService.createExpense(request);
    return await expenseService.getExpense(expense.id);
  } catch (error: any) {
    return rejectWithValue(error.message);
  }
});

export const updateExpense = createAsyncThunk(
  "expenses/updateExpense",
  async (
    {
      expenseId,
      updates,
      splits,
      receipt,
    }: {
      expenseId: string;
      updates: Partial<Expense>;
      splits: { user_id: string; amount: number }[];
      receipt?: File | null;
    },
    { rejectWithValue }
  ) => {
    try {
      // 1️⃣ If a new receipt file was uploaded
      let receipt_url: string | null | undefined = undefined;

      if (receipt) {
        const fileExt = receipt.name.split(".").pop();
        const filePath = `receipts/${expenseId}.${fileExt}`;

        // Upload to Supabase Storage
        const upload = await expenseService.uploadReceipt(filePath, receipt);

        if (upload.error) throw upload.error;

        // Get public URL
        const publicUrl = expenseService.getReceiptUrl(filePath);
        receipt_url = publicUrl;
      }

      // 2️⃣ Update expense main data (add receipt_url if replaced)
      const updatedExpense = await expenseService.updateExpense(expenseId, {
        ...updates,
        ...(receipt_url ? { receipt_url } : {}),
      });

      // 3️⃣ Update splits (delete old + insert new)
      await expenseService.replaceSplits(expenseId, splits);

      // 4️⃣ Return fresh expense with details
      return await expenseService.getExpense(expenseId);
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  }
);




export const deleteExpense = createAsyncThunk('expenses/deleteExpense', async (expenseId: string, { rejectWithValue }) => {
  try {
    await expenseService.deleteExpense(expenseId);
    return expenseId;
  } catch (error: any) {
    return rejectWithValue(error.message);
  }
});

export const fetchCategories = createAsyncThunk('expenses/fetchCategories', async (_, { rejectWithValue }) => {
  try {
    return await categoryService.getCategories();
  } catch (error: any) {
    return rejectWithValue(error.message);
  }
});

export const settleUp = createAsyncThunk('expenses/settleUp', async (request: SettleUpRequest, { rejectWithValue }) => {
  try {
    return await settlementService.settleUp(request);
  } catch (error: any) {
    return rejectWithValue(error.message);
  }
});

export const fetchSettlements = createAsyncThunk('expenses/fetchSettlements', async (groupId: string | undefined, { rejectWithValue }) => {
  try {
    return await settlementService.getSettlements(groupId);
  } catch (error: any) {
    return rejectWithValue(error.message);
  }
});

const expensesSlice = createSlice({
  name: 'expenses',
  initialState,
  reducers: {
    setSelectedExpense: (state, action: PayloadAction<ExpenseWithDetails | null>) => {
      state.selectedExpense = action.payload;
    },
    setFilters: (state, action: PayloadAction<ExpenseFilters>) => {
      state.filters = action.payload;
    },
    clearFilters: (state) => {
      state.filters = {};
    },
    clearError: (state) => {
      state.error = null;
    },
    clearExpenses: (state) => {
      state.expenses = [];
      state.selectedExpense = null;
      state.settlements = [];
    },
    addExpenseRealtime: (state, action: PayloadAction<ExpenseWithDetails>) => {
      const exists = state.expenses.find(e => e.id === action.payload.id);
      if (!exists) state.expenses.unshift(action.payload);
    },
    updateExpenseRealtime: (state, action: PayloadAction<ExpenseWithDetails>) => {
      const index = state.expenses.findIndex(e => e.id === action.payload.id);
      if (index !== -1) state.expenses[index] = action.payload;
      if (state.selectedExpense?.id === action.payload.id) state.selectedExpense = action.payload;
    },
    deleteExpenseRealtime: (state, action: PayloadAction<string>) => {
      state.expenses = state.expenses.filter(e => e.id !== action.payload);
      if (state.selectedExpense?.id === action.payload) state.selectedExpense = null;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(fetchExpenses.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(fetchExpenses.fulfilled, (state, action) => {
      state.loading = false;
      state.expenses = action.payload;
    });
    builder.addCase(fetchExpenses.rejected, (state, action) => {
      state.loading = false;
      state.error = action.payload as string;
    });
    builder.addCase(fetchExpense.fulfilled, (state, action) => {
      state.selectedExpense = action.payload;
      const index = state.expenses.findIndex(e => e.id === action.payload.id);
      if (index !== -1) state.expenses[index] = action.payload;
    });
    builder.addCase(createExpense.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(createExpense.fulfilled, (state, action) => {
      state.loading = false;
      state.expenses.unshift(action.payload);
    });
    builder.addCase(createExpense.rejected, (state, action) => {
      state.loading = false;
      state.error = action.payload as string;
    });
    builder.addCase(updateExpense.fulfilled, (state, action) => {
      const index = state.expenses.findIndex(e => e.id === action.payload.id);
      if (index !== -1) state.expenses[index] = action.payload;
      if (state.selectedExpense?.id === action.payload.id) state.selectedExpense = action.payload;
    });
    builder.addCase(deleteExpense.fulfilled, (state, action) => {
      state.expenses = state.expenses.filter(e => e.id !== action.payload);
      if (state.selectedExpense?.id === action.payload) state.selectedExpense = null;
    });
    builder.addCase(fetchCategories.fulfilled, (state, action) => {
      state.categories = action.payload;
    });
    builder.addCase(settleUp.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(settleUp.fulfilled, (state, action) => {
      state.loading = false;
      state.settlements.push(action.payload);
    });
    builder.addCase(settleUp.rejected, (state, action) => {
      state.loading = false;
      state.error = action.payload as string;
    });
    builder.addCase(fetchSettlements.fulfilled, (state, action) => {
      state.settlements = action.payload;
    });
  },
});

export const { setSelectedExpense, setFilters, clearFilters, clearError, clearExpenses, addExpenseRealtime, updateExpenseRealtime, deleteExpenseRealtime } = expensesSlice.actions;
export default expensesSlice.reducer;