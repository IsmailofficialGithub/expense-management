// src/store/slices/bulkPaymentsSlice.ts
import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { bulkPaymentService } from '../../services/supabase.service';
import { GroupAdvanceCollection, BulkSettlementSummary } from '../../types/database.types';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface BulkPaymentStats {
  activeCount: number;
  totalCount: number;
  completedCount: number;
  pendingCount: number;
  totalAmount: number;
  pendingAmount: number;
  activeAmount: number;
}

interface BulkPaymentsState {
  advanceCollections: GroupAdvanceCollection[];
  bulkSettlementSummary: BulkSettlementSummary | null;
  bulkPaymentStats: BulkPaymentStats | null;
  loading: boolean;
  error: string | null;
}

const initialState: BulkPaymentsState = {
  advanceCollections: [],
  bulkSettlementSummary: null,
  bulkPaymentStats: null,
  loading: false,
  error: null,
};

export const fetchAdvanceCollections = createAsyncThunk(
  'bulkPayments/fetchAdvanceCollections',
  async (
    params: {
      groupId: string;
      page?: number;
      limit?: number;
      status?: 'active' | 'completed' | 'all';
      dateFrom?: string;
      dateTo?: string;
    },
    { rejectWithValue, getState }
  ) => {
    try {
      const state = getState() as any;
      const isOnline = state.ui.isOnline;

      if (isOnline) {
        try {
          const { groupId, ...options } = params;
          const collections = await bulkPaymentService.getAdvanceCollections(groupId, options);
          // Cache collections using AsyncStorage directly
          // Only cache if it's the first page and no filters to keep it simple, or update logic complexly
          // For now, let's only cache if it's default view (no complex filters)
          if (!options.page || options.page === 1) {
            const cacheKey = `advance_collections_${groupId}`;
            await AsyncStorage.setItem(cacheKey, JSON.stringify(collections));
          }
          return collections; // Note: We might need to handle appending vs replacing in reducer depending on page
        } catch (error: any) {
          console.warn('Online fetch failed, trying cache:', error);
        }
      }

      // Offline: load from cache
      // Note: Offline mode might not support filtering/pagination correctly without more logic
      const cacheKey = `advance_collections_${params.groupId}`;
      const cached = await AsyncStorage.getItem(cacheKey);
      return cached ? JSON.parse(cached) : [];
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  }
);

export const createAdvanceCollection = createAsyncThunk(
  'bulkPayments/createAdvanceCollection',
  async (request: {
    group_id: string;
    recipient_id: string;
    total_amount?: number;
    per_member_amount?: number;
    description?: string;
  }, { rejectWithValue, getState }) => {
    try {
      const state = getState() as any;
      const isOnline = state.ui.isOnline;

      if (isOnline) {
        try {
          const collection = await bulkPaymentService.createAdvanceCollection(request);
          return collection;
        } catch (error: any) {
          console.warn('Online create failed:', error);
          throw error;
        }
      }

      throw new Error('Cannot create advance collection while offline');
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  }
);

export const contributeToCollection = createAsyncThunk(
  'bulkPayments/contributeToCollection',
  async (request: { contributionId: string; notes?: string }, { rejectWithValue }) => {
    try {
      const contribution = await bulkPaymentService.contributeToCollection(
        request.contributionId,
        request.notes
      );
      return contribution;
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  }
);

export const fetchBulkSettlementSummary = createAsyncThunk(
  'bulkPayments/fetchBulkSettlementSummary',
  async (request: { groupId: string; recipientId: string }, { rejectWithValue }) => {
    try {
      const summary = await bulkPaymentService.getBulkSettlementSummary(
        request.groupId,
        request.recipientId
      );
      return summary;
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  }
);

export const createBulkSettlement = createAsyncThunk(
  'bulkPayments/createBulkSettlement',
  async (request: {
    group_id: string;
    recipient_id: string;
    notes?: string;
  }, { rejectWithValue }) => {
    try {
      const settlements = await bulkPaymentService.createBulkSettlement(request);
      return settlements;
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  }
);

export const approveContribution = createAsyncThunk(
  'bulkPayments/approveContribution',
  async (contributionId: string, { rejectWithValue }) => {
    try {
      const contribution = await bulkPaymentService.approveContribution(contributionId);
      return contribution;
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  }
);

export const rejectContribution = createAsyncThunk(
  'bulkPayments/rejectContribution',
  async (request: { contributionId: string; reason?: string }, { rejectWithValue }) => {
    try {
      const contribution = await bulkPaymentService.rejectContribution(
        request.contributionId,
        request.reason
      );
      return contribution;
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  }
);

export const fetchBulkPaymentStats = createAsyncThunk(
  'bulkPayments/fetchBulkPaymentStats',
  async (groupId: string, { rejectWithValue }) => {
    try {
      const stats = await bulkPaymentService.getBulkPaymentStats(groupId);
      return stats;
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  }
);

const bulkPaymentsSlice = createSlice({
  name: 'bulkPayments',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    clearBulkSettlementSummary: (state) => {
      state.bulkSettlementSummary = null;
    },
    addAdvanceCollection: (state, action: PayloadAction<GroupAdvanceCollection>) => {
      state.advanceCollections.unshift(action.payload);
    },
    updateAdvanceCollection: (state, action: PayloadAction<GroupAdvanceCollection>) => {
      const index = state.advanceCollections.findIndex(c => c.id === action.payload.id);
      if (index !== -1) {
        state.advanceCollections[index] = action.payload;
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchAdvanceCollections.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchAdvanceCollections.fulfilled, (state, action) => {
        state.loading = false;
        const { page } = action.meta.arg as any;
        if (page && page > 1) {
          // Filter out duplicates just in case
          const newIds = new Set(action.payload.map(c => c.id));
          state.advanceCollections = [
            ...state.advanceCollections.filter((c: GroupAdvanceCollection) => !newIds.has(c.id)),
            ...action.payload
          ];
        } else {
          state.advanceCollections = action.payload;
        }
      })
      .addCase(fetchAdvanceCollections.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(createAdvanceCollection.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createAdvanceCollection.fulfilled, (state, action) => {
        state.loading = false;
        state.advanceCollections.unshift(action.payload);
      })
      .addCase(createAdvanceCollection.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(contributeToCollection.fulfilled, (state, action) => {
        // Update collection in state
        const collectionId = action.payload.collection_id;
        const collection = state.advanceCollections.find(c => c.id === collectionId);
        if (collection && collection.contributions) {
          const contribution = collection.contributions.find(
            c => c.id === action.payload.id
          );
          if (contribution) {
            contribution.status = action.payload.status; // Now 'pending_approval'
            contribution.contributed_at = action.payload.contributed_at;
            contribution.notes = action.payload.notes;
          }
        }
      })
      .addCase(fetchBulkSettlementSummary.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchBulkSettlementSummary.fulfilled, (state, action) => {
        state.loading = false;
        state.bulkSettlementSummary = action.payload;
      })
      .addCase(fetchBulkSettlementSummary.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(createBulkSettlement.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createBulkSettlement.fulfilled, (state) => {
        state.loading = false;
        state.bulkSettlementSummary = null; // Clear summary after settlement
      })
      .addCase(createBulkSettlement.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(approveContribution.fulfilled, (state, action) => {
        // Update contribution in state
        const collectionId = action.payload.collection_id;
        const collection = state.advanceCollections.find(c => c.id === collectionId);
        if (collection && collection.contributions) {
          const contribution = collection.contributions.find(
            c => c.id === action.payload.id
          );
          if (contribution) {
            contribution.status = action.payload.status;
            contribution.approved_by = action.payload.approved_by;
            contribution.approved_at = action.payload.approved_at;
          }
          // Check if collection should be marked as completed
          const allPaid = collection.contributions.every(c => c.status === 'paid');
          if (allPaid) {
            collection.status = 'completed';
            collection.completed_at = new Date().toISOString();
          }
        }
      })
      .addCase(rejectContribution.fulfilled, (state, action) => {
        // Update contribution in state
        const collectionId = action.payload.collection_id;
        const collection = state.advanceCollections.find(c => c.id === collectionId);
        if (collection && collection.contributions) {
          const contribution = collection.contributions.find(
            c => c.id === action.payload.id
          );
          if (contribution) {
            contribution.status = action.payload.status;
            contribution.contributed_at = action.payload.contributed_at;
            contribution.notes = action.payload.notes;
          }
        }
      })
      .addCase(fetchBulkPaymentStats.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchBulkPaymentStats.fulfilled, (state, action) => {
        state.loading = false;
        state.bulkPaymentStats = action.payload;
      })
      .addCase(fetchBulkPaymentStats.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  },
});

export const {
  clearError,
  clearBulkSettlementSummary,
  addAdvanceCollection,
  updateAdvanceCollection,
} = bulkPaymentsSlice.actions;

export default bulkPaymentsSlice.reducer;

