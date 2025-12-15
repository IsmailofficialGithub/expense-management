// src/store/middleware/offlineMiddleware.ts
import { Middleware } from '@reduxjs/toolkit';
import { RootState } from '../rootReducer';
import { storageService } from '../../services/storage.service';
import { syncService, SyncOperationType, SyncEntityType } from '../../services/sync.service';

// Map Redux action types to sync operations
const getSyncEntity = (actionType: string): SyncEntityType | null => {
  if (actionType.includes('expense')) return 'expense';
  if (actionType.includes('group')) return 'group';
  if (actionType.includes('transaction') || actionType.includes('personalFinance')) return 'transaction';
  if (actionType.includes('hotel')) return 'hotel';
  if (actionType.includes('paymentMethod')) return 'payment_method';
  if (actionType.includes('notification')) return 'notification';
  if (actionType.includes('settlement') || actionType.includes('settleUp')) return 'settlement';
  return null;
};

const getSyncType = (actionType: string): SyncOperationType | null => {
  if (actionType.includes('create') || actionType.includes('add')) return 'create';
  if (actionType.includes('update') || actionType.includes('edit')) return 'update';
  if (actionType.includes('delete') || actionType.includes('remove')) return 'delete';
  return null;
};

// Actions that should trigger sync
const SYNC_ACTIONS = [
  'expenses/createExpense',
  'expenses/updateExpense',
  'expenses/deleteExpense',
  'groups/createGroup',
  'groups/updateGroup',
  'groups/deleteGroup',
  'groups/addMember',
  'groups/removeMember',
  'personalFinance/createPersonalTransaction',
  'personalFinance/updatePersonalTransaction',
  'personalFinance/deletePersonalTransaction',
  'expenses/settleUp',
];

// Actions that should save to local storage
const PERSIST_ACTIONS = [
  'expenses/fetchExpenses/fulfilled',
  'expenses/fetchExpense/fulfilled',
  'expenses/createExpense/fulfilled',
  'expenses/updateExpense/fulfilled',
  'expenses/deleteExpense/fulfilled',
  'expenses/fetchCategories/fulfilled',
  'expenses/fetchSettlements/fulfilled',
  'groups/fetchGroups/fulfilled',
  'groups/fetchGroup/fulfilled',
  'groups/createGroup/fulfilled',
  'groups/updateGroup/fulfilled',
  'groups/deleteGroup/fulfilled',
  'personalFinance/fetchPersonalTransactions/fulfilled',
  'personalFinance/createPersonalTransaction/fulfilled',
  'personalFinance/updatePersonalTransaction/fulfilled',
  'personalFinance/deletePersonalTransaction/fulfilled',
  'personalFinance/fetchPersonalCategories/fulfilled',
];

export const offlineMiddleware: Middleware<{}, RootState> = (store) => (next) => (action) => {
  const result = next(action);
  const state = store.getState();
  const isOnline = state.ui.isOnline;
  const actionType = (action as any).type;

  // Handle fulfilled actions - save to local storage
  if (PERSIST_ACTIONS.includes(actionType)) {
    handlePersistAction(action, state);
  }

  // Handle mutations - queue for sync if offline
  if (SYNC_ACTIONS.includes(actionType) && !isOnline) {
    handleOfflineMutation(action);
  }

  return result;
};

async function handlePersistAction(action: any, state: RootState) {
  try {
    const actionType = action.type;

    // Persist expenses
    if (actionType.includes('expenses')) {
      if (actionType.includes('fetchExpenses') || actionType.includes('createExpense')) {
        await storageService.setExpenses(state.expenses.expenses);
      }
      if (actionType.includes('fetchCategories')) {
        await storageService.setCategories(state.expenses.categories);
      }
      if (actionType.includes('fetchSettlements')) {
        await storageService.setSettlements(state.expenses.settlements);
      }
    }

    // Persist groups
    if (actionType.includes('groups')) {
      if (actionType.includes('fetchGroups') || actionType.includes('createGroup')) {
        await storageService.setGroups(state.groups.groups);
      }
    }

    // Persist personal finance
    if (actionType.includes('personalFinance')) {
      if (
        actionType.includes('fetchPersonalTransactions') ||
        actionType.includes('createPersonalTransaction')
      ) {
        await storageService.setPersonalTransactions(state.personalFinance.transactions);
      }
      if (actionType.includes('fetchPersonalCategories')) {
        await storageService.setPersonalCategories(state.personalFinance.categories);
      }
    }
  } catch (error) {
    console.error('Error persisting to local storage:', error);
  }
}

async function handleOfflineMutation(action: any) {
  try {
    const actionType = action.type;
    const entity = getSyncEntity(actionType);
    const syncType = getSyncType(actionType);

    if (!entity || !syncType) {
      return;
    }

    // Extract data from action payload
    let data = action.payload;

    // For update operations, we need both id and updates
    if (syncType === 'update') {
      // Try to extract from different action structures
      if (action.meta?.arg) {
        data = {
          id: action.meta.arg.id || action.meta.arg.expenseId || action.meta.arg.groupId,
          updates: action.meta.arg.updates || action.meta.arg,
        };
      } else {
        data = action.payload;
      }
    }

    // For delete operations, extract the id
    if (syncType === 'delete') {
      data = {
        id: action.payload || action.meta?.arg,
      };
    }

    await syncService.addToQueue(syncType, entity, data);
  } catch (error) {
    console.error('Error queueing offline mutation:', error);
  }
}


