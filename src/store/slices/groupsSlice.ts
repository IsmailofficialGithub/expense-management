import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { groupService } from '../../services/supabase.service';
import { Group, GroupWithMembers, CreateGroupRequest, UserGroupBalance } from '../../types/database.types';

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

export const fetchGroups = createAsyncThunk('groups/fetchGroups', async (_, { rejectWithValue }) => {
  try {
    return await groupService.getGroups();
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

export const createGroup = createAsyncThunk('groups/createGroup', async (request: CreateGroupRequest, { rejectWithValue }) => {
  try {
    const group = await groupService.createGroup(request);
    return await groupService.getGroup(group.id);
  } catch (error: any) {
    return rejectWithValue(error.message);
  }
});

export const updateGroup = createAsyncThunk('groups/updateGroup', async ({ groupId, updates }: { groupId: string; updates: Partial<Group> }, { rejectWithValue }) => {
  try {
    await groupService.updateGroup(groupId, updates);
    return await groupService.getGroup(groupId);
  } catch (error: any) {
    return rejectWithValue(error.message);
  }
});

export const deleteGroup = createAsyncThunk('groups/deleteGroup', async (groupId: string, { rejectWithValue }) => {
  try {
    await groupService.deleteGroup(groupId);
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
  },
});

export const { setSelectedGroup, clearError, clearGroups } = groupsSlice.actions;
export default groupsSlice.reducer;