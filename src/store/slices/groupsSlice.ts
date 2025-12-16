import { createSlice, createAsyncThunk, PayloadAction, createAction } from '@reduxjs/toolkit';
import { groupService } from '../../services/supabase.service';
import { Group, GroupWithMembers, CreateGroupRequest, UserGroupBalance } from '../../types/database.types';
import { storageService } from '../../services/storage.service';
import { syncService } from '../../services/sync.service';

interface GroupsState {
  groups: GroupWithMembers[];
  selectedGroup: GroupWithMembers | null;
  balances: UserGroupBalance[];
  loading: boolean;
  error: string | null;
}

const initialState: GroupsState = {
  groups: [],
  selectedGroup: null,
  balances: [],
  loading: false,
  error: null,
};

export const fetchGroups = createAsyncThunk('groups/fetchGroups', async (_, { rejectWithValue, getState }) => {
  try {
    const state = getState() as any;
    const isOnline = state.ui.isOnline;

    if (isOnline) {
      try {
        const groups = await groupService.getGroups();
        await storageService.setGroups(groups);
        return groups;
      } catch (error: any) {
        console.warn('Online fetch groups failed, trying offline:', error);
      }
    }

    // Offline: load from local storage
    const cachedGroups = await storageService.getGroups();
    if (cachedGroups) {
      return cachedGroups;
    }

    throw new Error('No groups available');
  } catch (error: any) {
    return rejectWithValue(error.message);
  }
});

export const fetchGroup = createAsyncThunk('groups/fetchGroup', async (groupId: string, { rejectWithValue }) => {
  try {
    return await groupService.getGroup(groupId);
  } catch (error: any) {
    return rejectWithValue(error.message);
  }
});

export const createGroup = createAsyncThunk('groups/createGroup', async (request: CreateGroupRequest, { rejectWithValue, getState }) => {
  try {
    const state = getState() as any;
    const isOnline = state.ui.isOnline;

    if (isOnline) {
      try {
        const group = await groupService.createGroup(request);
        const groupWithDetails = await groupService.getGroup(group.id);
        // Save to local storage
        const currentGroups = await storageService.getGroups() || [];
        await storageService.setGroups([groupWithDetails, ...currentGroups]);
        return groupWithDetails;
      } catch (error: any) {
        console.warn('Online create group failed, queueing for sync:', error);
      }
    }

    // Offline or online failed: create temporary group and queue for sync
    const tempGroup: GroupWithMembers = {
      id: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: request.name,
      description: request.description || null,
      created_by: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      creator: {} as any,
      members: [],
    };

    await syncService.addToQueue('create', 'group', request);

    // Save to local storage
    const currentGroups = await storageService.getGroups() || [];
    await storageService.setGroups([tempGroup, ...currentGroups]);

    return tempGroup;
  } catch (error: any) {
    return rejectWithValue(error.message);
  }
});

export const updateGroup = createAsyncThunk('groups/updateGroup', async ({ groupId, updates }: { groupId: string; updates: Partial<Group> }, { rejectWithValue, getState }) => {
  try {
    const state = getState() as any;
    const isOnline = state.ui.isOnline;

    if (isOnline) {
      try {
        await groupService.updateGroup(groupId, updates);
        const updatedGroup = await groupService.getGroup(groupId);
        // Update local storage
        const currentGroups = await storageService.getGroups() || [];
        const updatedGroups = currentGroups.map((g: any) =>
          g.id === groupId ? updatedGroup : g
        );
        await storageService.setGroups(updatedGroups);
        return updatedGroup;
      } catch (error: any) {
        console.warn('Online update group failed, queueing for sync:', error);
      }
    }

    // Offline or online failed: update local storage and queue for sync
    const currentGroups = await storageService.getGroups() || [];
    const groupToUpdate = currentGroups.find((g: any) => g.id === groupId);

    if (groupToUpdate) {
      const updatedGroup = { ...groupToUpdate, ...updates, updated_at: new Date().toISOString() };
      await syncService.addToQueue('update', 'group', { id: groupId, updates });
      const updatedGroups = currentGroups.map((g: any) =>
        g.id === groupId ? updatedGroup : g
      );
      await storageService.setGroups(updatedGroups);
      return updatedGroup;
    }

    throw new Error('Group not found');
  } catch (error: any) {
    return rejectWithValue(error.message);
  }
});

export const deleteGroup = createAsyncThunk('groups/deleteGroup', async (groupId: string, { rejectWithValue, getState }) => {
  try {
    const state = getState() as any;
    const isOnline = state.ui.isOnline;

    if (isOnline) {
      try {
        await groupService.deleteGroup(groupId);
        // Remove from local storage
        const currentGroups = await storageService.getGroups() || [];
        await storageService.setGroups(currentGroups.filter((g: any) => g.id !== groupId));
        return groupId;
      } catch (error: any) {
        console.warn('Online delete group failed, queueing for sync:', error);
      }
    }

    // Offline or online failed: remove from local storage and queue for sync
    const currentGroups = await storageService.getGroups() || [];
    await syncService.addToQueue('delete', 'group', { id: groupId });
    await storageService.setGroups(currentGroups.filter((g: any) => g.id !== groupId));

    return groupId;
  } catch (error: any) {
    return rejectWithValue(error.message);
  }
});

export const addGroupMember = createAsyncThunk('groups/addMember', async ({ groupId, userId, role }: { groupId: string; userId: string; role?: 'admin' | 'member' }, { rejectWithValue }) => {
  try {
    await groupService.addMember(groupId, userId, role);
    return await groupService.getGroup(groupId);
  } catch (error: any) {
    return rejectWithValue(error.message);
  }
});

export const removeGroupMember = createAsyncThunk('groups/removeMember', async ({ groupId, userId }: { groupId: string; userId: string }, { rejectWithValue }) => {
  try {
    await groupService.removeMember(groupId, userId);
    return await groupService.getGroup(groupId);
  } catch (error: any) {
    return rejectWithValue(error.message);
  }
});

// Cache setter action - load data directly from cache without API calls
export const setGroupsFromCache = createAction<GroupWithMembers[]>('groups/setFromCache');

export const fetchGroupBalances = createAsyncThunk('groups/fetchBalances', async (groupId: string, { rejectWithValue }) => {
  try {
    return await groupService.getGroupBalances(groupId);
  } catch (error: any) {
    return rejectWithValue(error.message);
  }
});

const groupsSlice = createSlice({
  name: 'groups',
  initialState,
  reducers: {
    setSelectedGroup: (state, action: PayloadAction<GroupWithMembers | null>) => {
      state.selectedGroup = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    },
    clearGroups: (state) => {
      state.groups = [];
      state.selectedGroup = null;
      state.balances = [];
    },
  },
  extraReducers: (builder) => {
    builder.addCase(fetchGroups.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(fetchGroups.fulfilled, (state, action) => {
      state.loading = false;
      state.groups = action.payload;
    });
    builder.addCase(fetchGroups.rejected, (state, action) => {
      state.loading = false;
      state.error = action.payload as string;
    });
    builder.addCase(fetchGroup.fulfilled, (state, action) => {
      state.selectedGroup = action.payload;
      const index = state.groups.findIndex(g => g.id === action.payload.id);
      if (index !== -1) state.groups[index] = action.payload;
    });
    builder.addCase(createGroup.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(createGroup.fulfilled, (state, action) => {
      state.loading = false;
      state.groups.push(action.payload);
    });
    builder.addCase(createGroup.rejected, (state, action) => {
      state.loading = false;
      state.error = action.payload as string;
    });
    builder.addCase(updateGroup.fulfilled, (state, action) => {
      const index = state.groups.findIndex(g => g.id === action.payload.id);
      if (index !== -1) state.groups[index] = action.payload;
      if (state.selectedGroup?.id === action.payload.id) state.selectedGroup = action.payload;
    });
    builder.addCase(deleteGroup.fulfilled, (state, action) => {
      state.groups = state.groups.filter(g => g.id !== action.payload);
      if (state.selectedGroup?.id === action.payload) state.selectedGroup = null;
    });
    builder.addCase(addGroupMember.fulfilled, (state, action) => {
      const index = state.groups.findIndex(g => g.id === action.payload.id);
      if (index !== -1) state.groups[index] = action.payload;
      if (state.selectedGroup?.id === action.payload.id) state.selectedGroup = action.payload;
    });
    builder.addCase(removeGroupMember.fulfilled, (state, action) => {
      const index = state.groups.findIndex(g => g.id === action.payload.id);
      if (index !== -1) state.groups[index] = action.payload;
      if (state.selectedGroup?.id === action.payload.id) state.selectedGroup = action.payload;
    });
    builder.addCase(fetchGroupBalances.fulfilled, (state, action) => {
      state.balances = action.payload;
    });
    // Cache setter action
    builder.addCase(setGroupsFromCache, (state, action) => {
      state.groups = action.payload;
      state.loading = false;
    });
  },
});

export const { setSelectedGroup, clearError, clearGroups } = groupsSlice.actions;
export default groupsSlice.reducer;