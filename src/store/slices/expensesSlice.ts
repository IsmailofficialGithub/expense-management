import { createSlice, createAsyncThunk, PayloadAction, createAction } from '@reduxjs/toolkit';
import { expenseService, settlementService, categoryService, foodExpenseService } from '../../services/supabase.service';
import { Expense, ExpenseWithDetails, ExpenseCategory, Settlement, CreateExpenseRequest, CreateFoodExpenseRequest, SettleUpRequest, ExpenseFilters } from '../../types/database.types';
import { storageService } from '../../services/storage.service';
import { syncService } from '../../services/sync.service';

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

export const fetchExpenses = createAsyncThunk('expenses/fetchExpenses', async (filters: ExpenseFilters | undefined, { rejectWithValue, getState }) => {
  try {
    const state = getState() as any;
    const isOnline = state.ui.isOnline;
    
    // Try online first
    if (isOnline) {
      try {
        const expenses = await expenseService.getExpenses(filters);
        // Save to local storage
        await storageService.setExpenses(expenses);
        return expenses;
      } catch (error: any) {
        // If online fails, try offline
        console.warn('Online fetch failed, trying offline:', error);
      }
    }
    
    // Offline: load from local storage
    const cachedExpenses = await storageService.getExpenses();
    if (cachedExpenses) {
      // Apply filters if provided
      if (filters) {
        let filtered = cachedExpenses;
        if (filters.group_id) {
          filtered = filtered.filter((e: any) => e.group_id === filters.group_id);
        }
        if (filters.category_id) {
          filtered = filtered.filter((e: any) => e.category_id === filters.category_id);
        }
        if (filters.paid_by) {
          filtered = filtered.filter((e: any) => e.paid_by === filters.paid_by);
        }
        if (filters.date_from) {
          filtered = filtered.filter((e: any) => e.date >= filters.date_from);
        }
        if (filters.date_to) {
          filtered = filtered.filter((e: any) => e.date <= filters.date_to);
        }
        if (filters.search) {
          const searchLower = filters.search.toLowerCase();
          filtered = filtered.filter((e: any) => 
            e.description?.toLowerCase().includes(searchLower)
          );
        }
        return filtered;
      }
      return cachedExpenses;
    }
    
    throw new Error('No expenses available');
  } catch (error: any) {
    return rejectWithValue(error.message);
  }
});

export const fetchExpense = createAsyncThunk('expenses/fetchExpense', async (expenseId: string, { rejectWithValue, getState }) => {
  try {
    const state = getState() as any;
    const isOnline = state.ui.isOnline;
    
    if (isOnline) {
      try {
        const expense = await expenseService.getExpense(expenseId);
        // Update in local storage
        const currentExpenses = await storageService.getExpenses() || [];
        const expenseIndex = currentExpenses.findIndex((e: any) => e.id === expenseId);
        if (expenseIndex !== -1) {
          currentExpenses[expenseIndex] = expense;
        } else {
          currentExpenses.push(expense);
        }
        await storageService.setExpenses(currentExpenses);
        return expense;
      } catch (error: any) {
        console.warn('Online fetch expense failed, trying offline:', error);
      }
    }
    
    // Offline: load from local storage
    const cachedExpenses = await storageService.getExpenses() || [];
    const expense = cachedExpenses.find((e: any) => e.id === expenseId);
    if (expense) {
      return expense;
    }
    
    throw new Error('Expense not found');
  } catch (error: any) {
    return rejectWithValue(error.message);
  }
});

export const createExpense = createAsyncThunk('expenses/createExpense', async (request: CreateExpenseRequest, { rejectWithValue, getState }) => {
  try {
    const state = getState() as any;
    const isOnline = state.ui.isOnline;
    
    if (isOnline) {
      try {
        const expense = await expenseService.createExpense(request);
        const expenseWithDetails = await expenseService.getExpense(expense.id);
        // Save to local storage
        const currentExpenses = await storageService.getExpenses() || [];
        await storageService.setExpenses([expenseWithDetails, ...currentExpenses]);
        return expenseWithDetails;
      } catch (error: any) {
        // If online fails, queue for sync
        console.warn('Online create failed, queueing for sync:', error);
      }
    }
    
    // Offline or online failed: create temporary expense and queue for sync
    const tempExpense: ExpenseWithDetails = {
      id: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...request as any,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      splits: request.splits.map(s => ({
        id: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        expense_id: '',
        user_id: s.user_id,
        amount: s.amount,
        percentage: s.percentage,
        shares: s.shares,
        is_settled: false,
        created_at: new Date().toISOString(),
        user: {} as any,
      })),
      category: {} as any,
      paid_by_user: {} as any,
    };
    
    // Queue for sync
    await syncService.addToQueue('create', 'expense', request);
    
    // Save to local storage
    const currentExpenses = await storageService.getExpenses() || [];
    await storageService.setExpenses([tempExpense, ...currentExpenses]);
    
    return tempExpense;
  } catch (error: any) {
    return rejectWithValue(error.message);
  }
});

export const createFoodExpense = createAsyncThunk('expenses/createFoodExpense', async (request: CreateFoodExpenseRequest, { rejectWithValue, getState }) => {
  try {
    const state = getState() as any;
    const isOnline = state.ui.isOnline;
    
    if (isOnline) {
      try {
        const expenseWithDetails = await foodExpenseService.createFoodExpense(request);
        // Save to local storage
        const currentExpenses = await storageService.getExpenses() || [];
        await storageService.setExpenses([expenseWithDetails, ...currentExpenses]);
        return expenseWithDetails;
      } catch (error: any) {
        // If online fails, queue for sync
        console.warn('Online create food expense failed, queueing for sync:', error);
      }
    }
    
    // Offline or online failed: create temporary expense and queue for sync
    const totalAmount = request.food_items.reduce(
      (sum, item) => sum + (item.quantity * item.unit_price),
      0
    );
    
    const tempExpense: ExpenseWithDetails = {
      id: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      group_id: request.group_id,
      category_id: request.category_id,
      description: request.description,
      amount: totalAmount,
      paid_by: request.paid_by,
      date: request.date,
      notes: request.notes || null,
      split_type: request.split_type,
      hotel_id: request.hotel_id,
      payment_method_id: request.payment_method_id || null,
      receipt_url: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      splits: request.splits.map(s => ({
        id: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        expense_id: '',
        user_id: s.user_id,
        amount: s.amount,
        percentage: null,
        shares: null,
        is_settled: false,
        created_at: new Date().toISOString(),
        user: {} as any,
      })),
      food_items: request.food_items.map(item => ({
        id: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        expense_id: '',
        hotel_id: request.hotel_id,
        menu_item_id: item.menu_item_id,
        item_name: item.item_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.quantity * item.unit_price,
        created_at: new Date().toISOString(),
      })),
      category: {} as any,
      paid_by_user: {} as any,
      hotel: {} as any,
    };
    
    // Queue for sync
    await syncService.addToQueue('create', 'expense', request);
    
    // Save to local storage
    const currentExpenses = await storageService.getExpenses() || [];
    await storageService.setExpenses([tempExpense, ...currentExpenses]);
    
    return tempExpense;
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
    { rejectWithValue, getState }
  ) => {
    try {
      const state = getState() as any;
      const isOnline = state.ui.isOnline;
      
      if (isOnline) {
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
          const expenseWithDetails = await expenseService.getExpense(expenseId);
          
          // Update local storage
          const currentExpenses = await storageService.getExpenses() || [];
          const updatedExpenses = currentExpenses.map((e: any) => 
            e.id === expenseId ? expenseWithDetails : e
          );
          await storageService.setExpenses(updatedExpenses);
          
          return expenseWithDetails;
        } catch (error: any) {
          console.warn('Online update expense failed, queueing for sync:', error);
        }
      }
      
      // Offline or online failed: update local storage and queue for sync
      const currentExpenses = await storageService.getExpenses() || [];
      const expenseToUpdate = currentExpenses.find((e: any) => e.id === expenseId);
      
      if (expenseToUpdate) {
        const updatedExpense: ExpenseWithDetails = {
          ...expenseToUpdate,
          ...updates,
          updated_at: new Date().toISOString(),
          splits: splits.map(s => ({
            id: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            expense_id: expenseId,
            user_id: s.user_id,
            amount: s.amount,
            percentage: null,
            shares: null,
            is_settled: false,
            created_at: new Date().toISOString(),
            user: {} as any,
          })),
        };
        
        await syncService.addToQueue('update', 'expense', { 
          id: expenseId, 
          updates: { ...updates, splits } 
        });
        
        const updatedExpenses = currentExpenses.map((e: any) => 
          e.id === expenseId ? updatedExpense : e
        );
        await storageService.setExpenses(updatedExpenses);
        
        return updatedExpense;
      }
      
      throw new Error('Expense not found');
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  }
);




export const deleteExpense = createAsyncThunk('expenses/deleteExpense', async (expenseId: string, { rejectWithValue, getState }) => {
  try {
    const state = getState() as any;
    const isOnline = state.ui.isOnline;
    
    if (isOnline) {
      try {
        await expenseService.deleteExpense(expenseId);
        // Remove from local storage
        const currentExpenses = await storageService.getExpenses() || [];
        await storageService.setExpenses(currentExpenses.filter((e: any) => e.id !== expenseId));
        return expenseId;
      } catch (error: any) {
        // If online fails, queue for sync
        console.warn('Online delete failed, queueing for sync:', error);
      }
    }
    
    // Offline or online failed: remove from local storage and queue for sync
    const currentExpenses = await storageService.getExpenses() || [];
    const expenseToDelete = currentExpenses.find((e: any) => e.id === expenseId);
    
    if (expenseToDelete) {
      await syncService.addToQueue('delete', 'expense', { id: expenseId });
      await storageService.setExpenses(currentExpenses.filter((e: any) => e.id !== expenseId));
    }
    
    return expenseId;
  } catch (error: any) {
    return rejectWithValue(error.message);
  }
});

export const fetchCategories = createAsyncThunk('expenses/fetchCategories', async (_, { rejectWithValue, getState }) => {
  try {
    const state = getState() as any;
    const isOnline = state.ui.isOnline;
    
    if (isOnline) {
      try {
        const categories = await categoryService.getCategories();
        await storageService.setCategories(categories);
        return categories;
      } catch (error: any) {
        console.warn('Online fetch categories failed, trying offline:', error);
      }
    }
    
    // Offline: load from local storage
    const cachedCategories = await storageService.getCategories();
    if (cachedCategories) {
      return cachedCategories;
    }
    
    throw new Error('No categories available');
  } catch (error: any) {
    return rejectWithValue(error.message);
  }
});

export const settleUp = createAsyncThunk('expenses/settleUp', async (request: SettleUpRequest, { rejectWithValue, getState }) => {
  try {
    const state = getState() as any;
    const isOnline = state.ui.isOnline;
    
    if (isOnline) {
      try {
        const settlement = await settlementService.settleUp(request);
        // Update local storage
        const currentSettlements = await storageService.getSettlements() || [];
        await storageService.setSettlements([settlement, ...currentSettlements]);
        return settlement;
      } catch (error: any) {
        console.warn('Online settleUp failed, queueing for sync:', error);
      }
    }
    
    // Offline or online failed: create temporary settlement and queue for sync
    const tempSettlement: Settlement = {
      id: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...request,
      settled_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };
    
    await syncService.addToQueue('create', 'settlement', request);
    
    // Save to local storage
    const currentSettlements = await storageService.getSettlements() || [];
    await storageService.setSettlements([tempSettlement, ...currentSettlements]);
    
    return tempSettlement;
  } catch (error: any) {
    return rejectWithValue(error.message);
  }
});

// Cache setter actions - load data directly from cache without API calls
export const setExpensesFromCache = createAction<ExpenseWithDetails[]>('expenses/setFromCache');
export const setCategoriesFromCache = createAction<ExpenseCategory[]>('expenses/setCategoriesFromCache');
export const setSettlementsFromCache = createAction<Settlement[]>('expenses/setSettlementsFromCache');

export const fetchSettlements = createAsyncThunk('expenses/fetchSettlements', async (groupId: string | undefined, { rejectWithValue, getState }) => {
  try {
    const state = getState() as any;
    const isOnline = state.ui.isOnline;
    
    if (isOnline) {
      try {
        const settlements = await settlementService.getSettlements(groupId);
        await storageService.setSettlements(settlements);
        return settlements;
      } catch (error: any) {
        console.warn('Online fetch settlements failed, trying offline:', error);
      }
    }
    
    // Offline: load from local storage
    const cachedSettlements = await storageService.getSettlements();
    if (cachedSettlements) {
      // Filter by groupId if provided
      if (groupId) {
        return cachedSettlements.filter((s: any) => s.group_id === groupId);
      }
      return cachedSettlements;
    }
    
    return [];
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
    builder.addCase(createFoodExpense.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(createFoodExpense.fulfilled, (state, action) => {
      state.loading = false;
      state.expenses.unshift(action.payload);
    });
    builder.addCase(createFoodExpense.rejected, (state, action) => {
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
    // Cache setter actions
    builder.addCase(setExpensesFromCache, (state, action) => {
      state.expenses = action.payload;
      state.loading = false;
    });
    builder.addCase(setCategoriesFromCache, (state, action) => {
      state.categories = action.payload;
    });
    builder.addCase(setSettlementsFromCache, (state, action) => {
      state.settlements = action.payload;
    });
  },
});

export const { setSelectedExpense, setFilters, clearFilters, clearError, clearExpenses, addExpenseRealtime, updateExpenseRealtime, deleteExpenseRealtime } = expensesSlice.actions;
export default expensesSlice.reducer;